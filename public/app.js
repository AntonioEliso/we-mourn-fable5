'use strict';

const $ = (sel) => document.querySelector(sel);

// --- Floating emoji --------------------------------------------------------

const FACES = ['😭', '😢', '🥲', '😿'];

function spawn(cls, char, x, y, life) {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = char;
  el.style.left = x - 14 + 'px';
  el.style.top = y - 14 + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), life);
}

// Session analytics counters
let sessionClicks = 0;
const sessionStart = Date.now();

// Crying faces on every click
document.addEventListener('click', (e) => {
  sessionClicks += 1;
  spawn('tear', FACES[Math.floor(Math.random() * FACES.length)], e.clientX, e.clientY, 1600);
});

// --- Utilities -------------------------------------------------------------

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-US', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatNum(n) {
  return Number(n).toLocaleString('en-US');
}

async function bump(endpoint, key) {
  const res = await fetch(endpoint, { method: 'POST' });
  if (!res.ok) throw new Error();
  const data = await res.json();
  return data[key];
}

// --- Count-up timer: time without Fable 5 ----------------------------------

// June 12, 2026, 5:21 PM ET (EDT = UTC-4)
const SEIZED_AT = new Date('2026-06-12T17:21:00-04:00');
const pad = (n) => String(n).padStart(2, '0');

function updateTimer() {
  const totalSec = Math.floor(Math.max(0, Date.now() - SEIZED_AT.getTime()) / 1000);
  $('#t-days').textContent = Math.floor(totalSec / 86400);
  $('#t-hours').textContent = pad(Math.floor((totalSec % 86400) / 3600));
  $('#t-mins').textContent = pad(Math.floor((totalSec % 3600) / 60));
  $('#t-secs').textContent = pad(totalSec % 60);
}

updateTimer();
setInterval(updateTimer, 1000);

// --- OFFLINE / ONLINE status -----------------------------------------------

function updateStatus(status) {
  const badge = $('#badge');
  const text = $('#badge-text');
  const subtitle = $('#subtitle');

  const online = status === 'ONLINE';
  document.body.classList.toggle('is-online', online);
  document.body.classList.toggle('is-offline', !online);

  if (online) {
    badge.classList.remove('offline');
    badge.classList.add('online');
    text.textContent = 'ONLINE';
    subtitle.textContent = "It's back! Fable 5 is among us again. 🎉";
    document.title = 'Fable 5 — ONLINE 🎉';
  } else {
    badge.classList.remove('online');
    badge.classList.add('offline');
    text.textContent = 'OFFLINE';
    document.title = 'We Mourn Fable 5';
  }
}

// --- The Wailing Wall ------------------------------------------------------

function renderComments(comments) {
  const list = $('#comment-list');
  list.innerHTML = '';

  if (!comments.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'The wall is bare. Be the first to mourn. 😭';
    list.appendChild(li);
    return;
  }

  for (const c of comments) {
    const li = document.createElement('li');
    li.className = 'comment';
    li.innerHTML = `
      <div class="meta">
        <span class="name">${escapeHTML(c.name)}</span>
        <span class="date">${formatDate(c.date)}</span>
      </div>
      <div class="body">${escapeHTML(c.text)}</div>
    `;
    list.appendChild(li);
  }
}

async function submitComment(e) {
  e.preventDefault();
  const name = $('#name').value.trim();
  const text = $('#text').value.trim();
  if (!text) return;

  try {
    const res = await fetch('/api/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, text }),
    });
    if (!res.ok) throw new Error();
    $('#text').value = '';
    await loadState();
  } catch {
    alert('Could not add your message. Please try again.');
  }
}

// --- Petition --------------------------------------------------------------

const SIGNED_KEY = 'fable5_signed';

function markAsSigned() {
  const btn = $('#sign-btn');
  btn.disabled = true;
  btn.textContent = '✅ You already signed';
  $('#sign-msg').hidden = false;
}

async function sign() {
  const btn = $('#sign-btn');
  btn.disabled = true;
  try {
    $('#signatures').textContent = formatNum(await bump('/api/sign', 'signatures'));
    localStorage.setItem(SIGNED_KEY, '1');
    markAsSigned();
  } catch {
    btn.disabled = false;
    alert('Error sending your signature. Please try again.');
  }
}

// --- Candles ---------------------------------------------------------------

async function lightCandle(e) {
  // a little vigil of flames near the button
  for (let i = 0; i < 4; i++) {
    setTimeout(() => {
      spawn('candle-float', '🕯️', e.clientX + (Math.random() * 60 - 30), e.clientY + (Math.random() * 20 - 10), 2200);
    }, i * 90);
  }
  try {
    $('#candles').textContent = formatNum(await bump('/api/candle', 'candles'));
  } catch {
    /* visual flame still shown */
  }
}

// --- Token Memorial Fund ---------------------------------------------------

async function donateToken(e) {
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      spawn('candle-float', '🪙', e.clientX + (Math.random() * 50 - 25), e.clientY, 2200);
    }, i * 110);
  }
  try {
    $('#tokens').textContent = formatNum(await bump('/api/token', 'tokens'));
  } catch {
    /* ignore */
  }
}

// --- Ambient sound (generated, melancholic drone) --------------------------

let audioCtx = null;
let masterGain = null;
let soundOn = false;

function startAmbient() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  audioCtx = new Ctx();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.0001;
  masterGain.connect(audioCtx.destination);

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 650;
  filter.connect(masterGain);

  // A minor drone: A2, C3, E3, A1
  const freqs = [110, 130.81, 164.81, 55];
  freqs.forEach((f, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    osc.detune.value = (i - 1.5) * 5;

    const g = audioCtx.createGain();
    g.gain.value = 0.09;

    // slow breathing LFO on this voice
    const lfo = audioCtx.createOscillator();
    lfo.frequency.value = 0.05 + i * 0.013;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);

    osc.connect(g);
    g.connect(filter);
    osc.start();
    lfo.start();
  });

  masterGain.gain.linearRampToValueAtTime(0.16, audioCtx.currentTime + 3);
}

function updateSoundBtn() {
  const btn = $('#sound-btn');
  btn.setAttribute('aria-pressed', String(soundOn));
  btn.textContent = soundOn ? '🔊 ambient' : '🔇 ambient';
}

function toggleSound(e) {
  e.stopPropagation();
  if (!audioCtx) {
    startAmbient();
    soundOn = true;
  } else if (soundOn) {
    masterGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 1);
    soundOn = false;
  } else {
    audioCtx.resume();
    masterGain.gain.linearRampToValueAtTime(0.16, audioCtx.currentTime + 1.5);
    soundOn = true;
  }
  updateSoundBtn();
}

// --- Share -----------------------------------------------------------------

const SHARE_TITLE = 'We Mourn Fable 5 — the model that coded once, slowly, expensively, and beautifully.';

function shareReddit() {
  const url = encodeURIComponent(window.location.href);
  const title = encodeURIComponent(SHARE_TITLE);
  window.open(`https://www.reddit.com/submit?url=${url}&title=${title}`, '_blank', 'noopener');
}

async function copyLink() {
  const btn = $('#copy-btn');
  const original = btn.textContent;
  try {
    await navigator.clipboard.writeText(window.location.href);
    btn.textContent = '✅ Link copied';
  } catch {
    btn.textContent = window.location.href;
  }
  setTimeout(() => { btn.textContent = original; }, 2000);
}

// --- Analytics (anonymous, privacy-friendly) -------------------------------

const VISITOR_KEY = 'fable5_visitor';

function visitorId() {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || Date.now() + '.' + Math.random().toString(16).slice(2);
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

fetch('/api/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'visit', visitorId: visitorId(), referrer: document.referrer }),
}).catch(() => {});

let visitEnded = false;
function trackEnd() {
  if (visitEnded) return;
  visitEnded = true;
  const payload = JSON.stringify({ type: 'end', duration: Date.now() - sessionStart, clicks: sessionClicks });
  try {
    navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
  } catch {
    fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
  }
}

window.addEventListener('pagehide', trackEnd);
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') trackEnd();
});

// --- Initial load ----------------------------------------------------------

async function loadState() {
  const res = await fetch('/api/state');
  const data = await res.json();
  updateStatus(data.status);
  $('#signatures').textContent = formatNum(data.signatures);
  $('#candles').textContent = formatNum(data.candles);
  $('#tokens').textContent = formatNum(data.tokens);
  renderComments(data.comments);
}

$('#comment-form').addEventListener('submit', submitComment);
$('#sign-btn').addEventListener('click', sign);
$('#candle-btn').addEventListener('click', lightCandle);
$('#token-btn').addEventListener('click', donateToken);
$('#sound-btn').addEventListener('click', toggleSound);
$('#reddit-btn').addEventListener('click', shareReddit);
$('#copy-btn').addEventListener('click', copyLink);

if (localStorage.getItem(SIGNED_KEY)) {
  markAsSigned();
}

loadState();
