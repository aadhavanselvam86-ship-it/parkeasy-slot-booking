const express = require('express');
const path = require('path');
const sql = require('../lib/sql');
const mongo = require('../lib/mongo');
const assistant = require('../lib/assistant');

const app = express();
const PUB = path.join(__dirname, '..', 'public');
const started = Date.now();
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));

// ---- Request logging (console -> Vercel logs, plus a small in-memory ring buffer for the Health page)
const recent = [];
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    const entry = { time: new Date().toISOString(), method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - t0 };
    console.log(JSON.stringify(entry));
    recent.unshift(entry); recent.length = Math.min(recent.length, 25);
  });
  next();
});

// ---- Simple rate limiter for the API (429)
const hits = new Map();
app.use('/api', (req, res, next) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now(), win = 60_000, max = 60;
  const h = (hits.get(ip) || []).filter(t => now - t < win); h.push(now); hits.set(ip, h);
  if (h.length > max) return res.status(429).json({ error: 'Too many requests. Please wait a minute.', code: '429' });
  next();
});

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, msg) => res.status(400).json({ error: msg, code: '400' });
const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(Date.parse(d));

// ---- FAQ / error codes
app.get('/api/faqs', wrap(async (req, res) => res.json(await sql.getFaqs())));
app.get('/api/error-codes', wrap(async (req, res) => res.json(await sql.getErrorCodes())));

// ---- Slots & bookings
function parseWindow(src) {
  const date = src.date, start = parseInt(src.start, 10), hours = parseInt(src.hours, 10);
  if (!isDate(date)) return 'Please choose a valid date.';
  if (!(start >= 6 && start <= 22)) return 'Start time must be between 06:00 and 22:00.';
  if (!(hours >= 1 && hours <= 12) || start + hours > 23) return 'Duration must be 1-12 hours and end by 23:00.';
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const diff = (Date.parse(date) - today) / 864e5;
  if (diff < 0 || diff > 30) return 'Date must be today or within the next 30 days.';
  return { date, start, hours };
}
app.get('/api/slots', wrap(async (req, res) => {
  const w = parseWindow(req.query); if (typeof w === 'string') return bad(res, w);
  res.json(await sql.getSlots(w.date, w.start, w.hours));
}));
app.post('/api/bookings', wrap(async (req, res) => {
  const w = parseWindow(req.body || {}); if (typeof w === 'string') return bad(res, w);
  const name = String(req.body.name || '').trim().slice(0, 80);
  const plate = String(req.body.plate || '').trim().toUpperCase().slice(0, 12);
  const slot = String(req.body.slot || '').trim().toUpperCase();
  if (!name || !/^[A-Z0-9 ]{2,12}$/.test(plate) || !slot) return bad(res, 'Name, a valid number plate and a slot are required.');
  try { res.status(201).json(await sql.createBooking({ ...w, slot, name, plate })); }
  catch (e) { if (e.status) return res.status(e.status).json({ error: e.message, code: e.code || String(e.status) }); throw e; }
}));
app.post('/api/bookings/lookup', wrap(async (req, res) => {
  const { ref, plate } = req.body || {}; if (!ref || !plate) return bad(res, 'Booking reference and plate are required.');
  const b = await sql.findBooking(String(ref).trim().toUpperCase(), plate);
  if (!b) return res.status(404).json({ error: 'Booking not found.', code: '404' });
  if (b === 'mismatch') return res.status(401).json({ error: 'Reference and number plate do not match.', code: '401' });
  res.json(b);
}));
app.post('/api/bookings/cancel', wrap(async (req, res) => {
  const { ref, plate } = req.body || {}; if (!ref || !plate) return bad(res, 'Booking reference and plate are required.');
  const b = await sql.findBooking(String(ref).trim().toUpperCase(), plate);
  if (!b) return res.status(404).json({ error: 'Booking not found.', code: '404' });
  if (b === 'mismatch') return res.status(401).json({ error: 'Reference and number plate do not match.', code: '401' });
  await sql.cancelBooking(b.ref); res.json({ ok: true, ref: b.ref, status: 'cancelled' });
}));

// ---- Assistant
app.post('/api/chat', wrap(async (req, res) => {
  const message = String((req.body || {}).message || '').trim().slice(0, 1000);
  const sessionId = String((req.body || {}).sessionId || '').slice(0, 64);
  if (!message) return bad(res, 'Message is empty.');
  const [faqs, codes] = await Promise.all([sql.getFaqs(), sql.getErrorCodes()]);
  let r = await assistant.answer(message, faqs, codes), ticketId = null;
  if (!r || !r.answer) {
    ticketId = await sql.createTicket({ question: message, email: (req.body || {}).email, sessionId });
    r = { answer: `I couldn't find an answer to that, so I've created support ticket #${ticketId}. Our team will get back to you within one working day.`, source: 'ticket' };
  }
  const logId = await mongo.logChat({ sessionId, page: (req.body || {}).page, message, answer: r.answer, source: r.source, ticketId })
    .catch(e => { console.error('chat log failed', e.message); return null; });
  res.json({ ...r, ticketId, logId });
}));
app.post('/api/feedback', wrap(async (req, res) => {
  const { logId, helpful, comment, sessionId } = req.body || {};
  if (typeof helpful !== 'boolean') return bad(res, '"helpful" must be true or false.');
  const id = await mongo.saveFeedback({ logId: logId || null, helpful, comment: String(comment || '').slice(0, 500), sessionId });
  res.status(201).json({ ok: true, id });
}));
app.get('/api/tickets', wrap(async (req, res) => {
  if (!process.env.ADMIN_TOKEN || req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN)
    return res.status(403).json({ error: 'Admin token required.', code: '403' });
  res.json(await sql.getTickets());
}));

// ---- Third-party API (Open-Meteo weather) with a time limit and fallback
let lastWeather = null;
app.get('/api/weather', wrap(async (req, res) => {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=51.5072&longitude=-0.1276&current=temperature_2m,precipitation,wind_speed_10m', { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const c = (await r.json()).current;
    lastWeather = { temperature: c.temperature_2m, precipitation: c.precipitation, wind: c.wind_speed_10m, time: c.time };
    res.json({ ...lastWeather, source: 'open-meteo', fallback: false });
  } catch (e) {
    res.json({ ...(lastWeather || { temperature: null, precipitation: null, wind: null }), source: lastWeather ? 'cache' : 'none',
      fallback: true, message: 'Live weather unavailable right now (' + (e.name === 'AbortError' ? 'timed out after 3s' : e.message) + ').' });
  } finally { clearTimeout(t); }
}));

// ---- Health check
app.get('/api/health', wrap(async (req, res) => {
  const check = async (fn, mode) => { const t = Date.now();
    try { await fn(); return { status: 'ok', mode, ms: Date.now() - t }; }
    catch (e) { return { status: 'down', mode, error: e.message }; } };
  const [sqlS, mongoS] = await Promise.all([check(sql.ping, sql.mode()), check(mongo.ping, mongo.mode())]);
  const ok = sqlS.status === 'ok' && mongoS.status === 'ok';
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', uptimeSeconds: Math.round((Date.now() - started) / 1000),
    time: new Date().toISOString(), checks: { sql: sqlS, mongodb: mongoS, ai: process.env.ANTHROPIC_API_KEY ? 'claude' : 'local-matcher' },
    recentRequests: recent.slice(0, 15) });
}));

// Demo route to show the custom 500 page
app.get('/test-500', () => { throw new Error('Intentional test error'); });

// ---- Static pages (clean URLs: /book -> book.html)
app.use(express.static(PUB, { extensions: ['html'] }));

// ---- 404 + 500
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint not found.', code: '404' });
  res.status(404).sendFile(path.join(PUB, '404.html'));
});
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  const dbDown = /ECONN|timeout|getaddrinfo|Server selection/i.test(err.message || '');
  if (req.path.startsWith('/api/')) return res.status(dbDown ? 503 : 500)
    .json({ error: dbDown ? 'A service is temporarily unavailable.' : 'Internal server error.', code: dbDown ? '503' : '500' });
  res.status(500).sendFile(path.join(PUB, '500.html'));
});

module.exports = app;
