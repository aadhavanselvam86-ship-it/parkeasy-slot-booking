// SQL layer (PostgreSQL via DATABASE_URL). Falls back to an in-memory store
// so the site still runs locally without a database.
const seed = require('./seed');
let pool = null, ready = null;
const mem = { faqs: [], errors: [], slots: [], bookings: [], tickets: [] };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS faqs (id SERIAL PRIMARY KEY, question TEXT NOT NULL, answer TEXT NOT NULL, category TEXT);
CREATE TABLE IF NOT EXISTS error_codes (code TEXT PRIMARY KEY, title TEXT NOT NULL, meaning TEXT NOT NULL, fix TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS slots (code TEXT PRIMARY KEY, type TEXT NOT NULL, price_per_hour NUMERIC(5,2) NOT NULL);
CREATE TABLE IF NOT EXISTS bookings (id SERIAL PRIMARY KEY, ref TEXT UNIQUE NOT NULL, slot_code TEXT REFERENCES slots(code),
  booking_date DATE NOT NULL, start_hour INT NOT NULL, hours INT NOT NULL, name TEXT NOT NULL, plate TEXT NOT NULL,
  total NUMERIC(7,2) NOT NULL, status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS support_tickets (id SERIAL PRIMARY KEY, question TEXT NOT NULL, email TEXT,
  session_id TEXT, status TEXT DEFAULT 'open', created_at TIMESTAMPTZ DEFAULT now());`;

async function init() {
  if (!process.env.DATABASE_URL) {
    mem.faqs = seed.faqs.map((f, i) => ({ id: i + 1, question: f[0], answer: f[1], category: f[2] }));
    mem.errors = seed.errorCodes.map(e => ({ code: e[0], title: e[1], meaning: e[2], fix: e[3] }));
    mem.slots = seed.slots.map(s => ({ code: s[0], type: s[1], price_per_hour: s[2] }));
    return;
  }
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3,
    connectionTimeoutMillis: 5000 });
  await pool.query(SCHEMA);
  if ((await pool.query('SELECT COUNT(*)::int n FROM faqs')).rows[0].n === 0)
    for (const f of seed.faqs) await pool.query('INSERT INTO faqs(question,answer,category) VALUES($1,$2,$3)', f);
  for (const e of seed.errorCodes)
    await pool.query('INSERT INTO error_codes VALUES($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING', e);
  for (const s of seed.slots)
    await pool.query('INSERT INTO slots VALUES($1,$2,$3) ON CONFLICT (code) DO NOTHING', s);
}
const ensure = () => (ready = ready || init().catch(e => { ready = null; throw e; }));

exports.mode = () => (process.env.DATABASE_URL ? 'postgres' : 'memory');
exports.ping = async () => { await ensure(); if (pool) await pool.query('SELECT 1'); return true; };

exports.getFaqs = async () => { await ensure();
  return pool ? (await pool.query('SELECT * FROM faqs ORDER BY id')).rows : mem.faqs; };
exports.getErrorCodes = async () => { await ensure();
  return pool ? (await pool.query('SELECT * FROM error_codes ORDER BY code')).rows : mem.errors; };

const overlaps = (b, date, start, hours) => b.status === 'active' && b.booking_date === date &&
  start < b.start_hour + b.hours && b.start_hour < start + hours;

exports.getSlots = async (date, start, hours) => { await ensure();
  let slots, taken;
  if (pool) {
    slots = (await pool.query('SELECT code,type,price_per_hour::float AS price_per_hour FROM slots ORDER BY code')).rows;
    taken = (await pool.query(`SELECT slot_code FROM bookings WHERE status='active' AND booking_date=$1
      AND $2 < start_hour + hours AND start_hour < $2 + $3`, [date, start, hours])).rows.map(r => r.slot_code);
  } else {
    slots = mem.slots;
    taken = mem.bookings.filter(b => overlaps(b, date, start, hours)).map(b => b.slot_code);
  }
  return slots.map(s => ({ ...s, available: !taken.includes(s.code) }));
};

exports.createBooking = async ({ slot, date, start, hours, name, plate }) => { await ensure();
  const all = await exports.getSlots(date, start, hours);
  const s = all.find(x => x.code === slot);
  if (!s) { const e = new Error('Unknown slot'); e.status = 404; throw e; }
  if (!s.available) { const e = new Error('Slot already booked for that time'); e.status = 409; e.code = 'PK-409'; throw e; }
  const ref = 'PK-' + Math.floor(1000 + Math.random() * 9000) + Date.now().toString(36).slice(-2).toUpperCase();
  const total = +(s.price_per_hour * hours).toFixed(2);
  const row = { ref, slot_code: slot, booking_date: date, start_hour: start, hours, name, plate, total, status: 'active' };
  if (pool) await pool.query(`INSERT INTO bookings(ref,slot_code,booking_date,start_hour,hours,name,plate,total)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [ref, slot, date, start, hours, name, plate, total]);
  else mem.bookings.push(row);
  return row;
};

exports.findBooking = async (ref, plate) => { await ensure();
  const b = pool ? (await pool.query(`SELECT ref,slot_code,to_char(booking_date,'YYYY-MM-DD') booking_date,start_hour,hours,
      name,plate,total::float total,status FROM bookings WHERE ref=$1`, [ref])).rows[0]
    : mem.bookings.find(x => x.ref === ref);
  if (!b) return null;
  if (b.plate.replace(/\s/g, '').toUpperCase() !== String(plate).replace(/\s/g, '').toUpperCase()) return 'mismatch';
  return b;
};

exports.cancelBooking = async ref => { await ensure();
  if (pool) await pool.query(`UPDATE bookings SET status='cancelled' WHERE ref=$1`, [ref]);
  else { const b = mem.bookings.find(x => x.ref === ref); if (b) b.status = 'cancelled'; }
};

exports.createTicket = async ({ question, email, sessionId }) => { await ensure();
  if (pool) return (await pool.query(`INSERT INTO support_tickets(question,email,session_id) VALUES($1,$2,$3)
    RETURNING id`, [question, email || null, sessionId || null])).rows[0].id;
  const id = mem.tickets.length + 1;
  mem.tickets.push({ id, question, email, session_id: sessionId, status: 'open', created_at: new Date().toISOString() });
  return id;
};
exports.getTickets = async () => { await ensure();
  return pool ? (await pool.query('SELECT * FROM support_tickets ORDER BY id DESC LIMIT 100')).rows : mem.tickets; };
