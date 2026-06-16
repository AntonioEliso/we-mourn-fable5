'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

// Status of Fable 5. When it becomes available again, start with:  STATUS=ONLINE node server.js
const STATUS = (process.env.STATUS || 'OFFLINE').toUpperCase() === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
const PORT = process.env.PORT || 3000;

// Live status check: if ANTHROPIC_API_KEY is set, ping the model on a schedule.
const FABLE_MODEL = process.env.FABLE_MODEL || 'claude-fable-5';
const CHECK_INTERVAL_MS = (Math.max(0.1, Number(process.env.CHECK_INTERVAL_HOURS) || 6)) * 3600 * 1000;

const PUBLIC_DIR = path.join(__dirname, 'public');
// In production, point DATA_DIR at a mounted persistent disk (e.g. /data) so the
// counters and comments survive restarts and redeploys.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

const MAX_NAME = 40;
const MAX_TEXT = 500;
const MAX_COMMENTS = 1000;

// Precompiled messages for The Wailing Wall (only used on a fresh install).
const SEED_COMMENTS = [
  { name: 'a dev', text: 'Fable 5 fixed my code in one shot. I never recovered.', date: '2026-06-12T22:40:00.000Z' },
  { name: 'lonely refactorer', text: 'It was slow. It was expensive. It was mine.', date: '2026-06-13T08:15:00.000Z' },
  { name: 'ex-Cursor user', text: 'I opened Cursor. Fable was gone. So was my will to refactor.', date: '2026-06-14T19:02:00.000Z' },
];
const SEED_CANDLES = 12482;

function defaultData() {
  return { signatures: 0, candles: SEED_CANDLES, tokens: 0, comments: SEED_COMMENTS.slice() };
}

// --- Persistence ------------------------------------------------------------

function saveData(data) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE); // atomic write
}

function readData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      signatures: Number(parsed.signatures) || 0,
      candles: Number(parsed.candles) || 0,
      tokens: Number(parsed.tokens) || 0,
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
    };
  } catch {
    return defaultData(); // fresh install: start with seed data
  }
}

let data = readData();
if (!fs.existsSync(DATA_FILE)) saveData(data); // persist the seed

// --- Analytics (privacy-friendly: no IPs, anonymous random client id) -------

const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const STATS_TOKEN = process.env.STATS_TOKEN || ''; // set this to password-protect /stats

function defaultStats() {
  return { visits: 0, clicks: 0, durationSum: 0, durationCount: 0, visitorIds: {}, referrers: {}, daily: {} };
}

function readStats() {
  try {
    return Object.assign(defaultStats(), JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')));
  } catch {
    return defaultStats();
  }
}

function saveStats() {
  const tmp = STATS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(stats));
  fs.renameSync(tmp, STATS_FILE);
}

let stats = readStats();

function referrerHost(ref) {
  if (!ref) return 'direct';
  try {
    return new URL(ref).hostname.replace(/^www\./, '') || 'direct';
  } catch {
    return 'direct';
  }
}

function statsSummary() {
  return {
    visits: stats.visits,
    uniqueVisitors: Object.keys(stats.visitorIds).length,
    clicks: stats.clicks,
    avgVisitSeconds: stats.durationCount ? Math.round(stats.durationSum / stats.durationCount / 1000) : 0,
    referrers: Object.entries(stats.referrers).sort((a, b) => b[1] - a[1]).slice(0, 15),
    daily: Object.entries(stats.daily).sort().slice(-30),
    signatures: data.signatures,
    candles: data.candles,
    tokens: data.tokens,
    comments: data.comments.length,
  };
}

// --- Live model status check ------------------------------------------------
// With ANTHROPIC_API_KEY set, ping the Fable 5 model every few hours: any 200
// response (even a refusal) means the model is reachable -> ONLINE; a 404
// (model not found) means it's gone -> OFFLINE. Other errors (auth, rate limit,
// network) leave the last known status untouched. Without a key, status falls
// back to the manual STATUS env var.

let liveStatus = STATUS;
let statusCheckedAt = null;
let anthropicClient = null;

async function pingFable() {
  if (!process.env.ANTHROPIC_API_KEY) return;
  try {
    if (!anthropicClient) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      anthropicClient = new Anthropic();
    }
    // Fable 5: omit `thinking` and sampling params (they 400). max_tokens: 1 keeps it tiny.
    await anthropicClient.messages.create({
      model: FABLE_MODEL,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
    liveStatus = 'ONLINE';
    console.log(`[fable-check] ${FABLE_MODEL} is ONLINE`);
  } catch (err) {
    if (err && err.status === 404) {
      liveStatus = 'OFFLINE';
      console.log(`[fable-check] ${FABLE_MODEL} not found (404) -> OFFLINE`);
    } else {
      console.warn(`[fable-check] check failed (${(err && err.status) || 'no status'}): ${(err && err.message) || err}`);
    }
  } finally {
    statusCheckedAt = new Date().toISOString();
  }
}

if (process.env.ANTHROPIC_API_KEY) {
  pingFable();
  setInterval(pingFable, CHECK_INTERVAL_MS).unref();
}

// --- HTTP helpers -----------------------------------------------------------

function sendJSON(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        req.destroy();
        reject(new Error('body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.ico': 'image/x-icon',
};

function serveStatic(res, urlPath) {
  const name = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, path.normalize(name));

  // prevent escaping the public/ directory
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Page not found 😭');
      return;
    }
    const type = MIME_TYPES[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  });
}

// Increment one numeric counter and reply with its new value.
function bump(res, key) {
  data[key] += 1;
  saveData(data);
  return sendJSON(res, 200, { [key]: data[key] });
}

// --- Server -----------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // GET /api/state  -> status, all counters and comments
  if (req.method === 'GET' && url.pathname === '/api/state') {
    return sendJSON(res, 200, {
      status: liveStatus,
      statusCheckedAt,
      signatures: data.signatures,
      candles: data.candles,
      tokens: data.tokens,
      comments: data.comments,
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/sign') return bump(res, 'signatures');
  if (req.method === 'POST' && url.pathname === '/api/candle') return bump(res, 'candles');
  if (req.method === 'POST' && url.pathname === '/api/token') return bump(res, 'tokens');

  // POST /api/track  -> record a visit or an end-of-visit event
  if (req.method === 'POST' && url.pathname === '/api/track') {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return sendJSON(res, 400, { error: 'Invalid request' });
    }
    if (body.type === 'visit') {
      stats.visits += 1;
      const id = String(body.visitorId || '').slice(0, 64);
      if (id) stats.visitorIds[id] = 1;
      const host = referrerHost(body.referrer);
      stats.referrers[host] = (stats.referrers[host] || 0) + 1;
      const day = new Date().toISOString().slice(0, 10);
      stats.daily[day] = (stats.daily[day] || 0) + 1;
      saveStats();
    } else if (body.type === 'end') {
      const d = Number(body.duration) || 0;
      if (d > 0 && d < 6 * 3600 * 1000) {
        stats.durationSum += d;
        stats.durationCount += 1;
      }
      const c = Number(body.clicks) || 0;
      if (c > 0) stats.clicks += c;
      saveStats();
    }
    return sendJSON(res, 200, { ok: true });
  }

  // GET /api/stats  -> aggregated analytics (password-protected if STATS_TOKEN is set)
  if (req.method === 'GET' && url.pathname === '/api/stats') {
    if (STATS_TOKEN && url.searchParams.get('key') !== STATS_TOKEN) {
      return sendJSON(res, 401, { error: 'unauthorized' });
    }
    return sendJSON(res, 200, statsSummary());
  }

  // GET /stats  -> the dashboard page
  if (req.method === 'GET' && url.pathname === '/stats') {
    return serveStatic(res, '/stats.html');
  }

  // POST /api/comment  -> add a message to the wall
  if (req.method === 'POST' && url.pathname === '/api/comment') {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return sendJSON(res, 400, { error: 'Invalid request' });
    }

    const name = String(body.name || 'Anonymous').trim().slice(0, MAX_NAME) || 'Anonymous';
    const text = String(body.text || '').trim().slice(0, MAX_TEXT);

    if (!text) {
      return sendJSON(res, 400, { error: 'Comment is empty' });
    }

    const comment = { name, text, date: new Date().toISOString() };
    data.comments.unshift(comment);
    if (data.comments.length > MAX_COMMENTS) {
      data.comments.length = MAX_COMMENTS;
    }
    saveData(data);
    return sendJSON(res, 201, comment);
  }

  // static files
  if (req.method === 'GET') {
    return serveStatic(res, url.pathname);
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Fable 5 is ${STATUS}`);
  console.log(`Server running at http://localhost:${PORT}`);
});
