'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

// Status of Fable 5. When it becomes available again, start with:  STATUS=ONLINE node server.js
const STATUS = (process.env.STATUS || 'OFFLINE').toUpperCase() === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
const PORT = process.env.PORT || 3000;

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
      status: STATUS,
      signatures: data.signatures,
      candles: data.candles,
      tokens: data.tokens,
      comments: data.comments,
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/sign') return bump(res, 'signatures');
  if (req.method === 'POST' && url.pathname === '/api/candle') return bump(res, 'candles');
  if (req.method === 'POST' && url.pathname === '/api/token') return bump(res, 'tokens');

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
