// AI assistant: explains error codes, answers from the FAQ table, otherwise signals "no answer"
// so the caller creates a support ticket. Uses Claude when ANTHROPIC_API_KEY is set, with a
// time limit; falls back to a local keyword matcher.
const STOP = new Set('a an the i my me to do does is are can how what when where which of for in on at it and or you your we with be will if there any'.split(' '));
const words = s => String(s).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
const stem = w => w.replace(/(ing|es|s|ed)$/, '');

function findErrorCode(msg, codes) {
  const m = String(msg).toUpperCase();
  return codes.find(c => new RegExp(`(^|[^0-9A-Z-])${c.code.replace('-', '-?')}([^0-9]|$)`).test(m)) ||
    (/(SLOT ALREADY BOOKED|ALREADY TAKEN)/.test(m) ? codes.find(c => c.code === 'PK-409') : null);
}

function matchFaq(msg, faqs) {
  const q = words(msg).map(stem);
  if (!q.length) return null;
  let best = null, bestScore = 0;
  for (const f of faqs) {
    const qw = new Set(words(f.question).map(stem)), aw = new Set(words(f.answer).map(stem));
    let score = 0;
    for (const w of q) score += qw.has(w) ? 2 : aw.has(w) ? 0.5 : 0;
    score /= Math.sqrt(q.length);
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return bestScore >= 1.4 ? best : null;
}

const explain = c => `Error ${c.code} – ${c.title}: ${c.meaning} What to do: ${c.fix}`;

function localAnswer(msg, faqs, codes) {
  const code = findErrorCode(msg, codes);
  if (code) return { answer: explain(code), source: 'error-code', matched: code.code };
  if (/^(hi|hello|hey|hiya)\b/i.test(msg.trim())) return { answer: 'Hi! I can answer questions about booking parking slots, prices and facilities, or explain an error code like 404 or PK-409.', source: 'greeting' };
  const f = matchFaq(msg, faqs);
  if (f) return { answer: f.answer, source: 'faq', matched: f.question };
  return null;
}

async function claudeAnswer(msg, faqs, codes) {
  const ctx = 'FAQS:\n' + faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n') +
    '\n\nERROR CODES:\n' + codes.map(explain).join('\n');
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 300,
        system: 'You are the ParkEasy car park support assistant. Answer ONLY using the FAQ and error code data below, in 1-3 friendly sentences. A greeting may be answered briefly. If the data does not contain the answer, reply with exactly NO_ANSWER and nothing else.\n\n' + ctx,
        messages: [{ role: 'user', content: String(msg).slice(0, 1000) }]
      })
    });
    if (!r.ok) throw new Error('Claude API ' + r.status);
    const text = (await r.json()).content.map(b => b.text || '').join('').trim();
    return text === 'NO_ANSWER' || text.includes('NO_ANSWER') ? { answer: null, source: 'ai' } : { answer: text, source: 'ai' };
  } finally { clearTimeout(t); }
}

exports.answer = async (msg, faqs, codes) => {
  const code = findErrorCode(msg, codes);
  if (code) return { answer: explain(code), source: 'error-code', matched: code.code };
  if (process.env.ANTHROPIC_API_KEY) {
    try { const r = await claudeAnswer(msg, faqs, codes); if (r.answer) return r; return localAnswer(msg, faqs, codes); }
    catch (e) { console.warn('AI fallback:', e.message); }
  }
  return localAnswer(msg, faqs, codes);
};
