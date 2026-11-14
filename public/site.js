// Shared header, footer and chat widget for every page.
(function () {
  const links = [['/', 'Home'], ['/book', 'Book a Slot'], ['/faq', 'FAQ'], ['/errors', 'Error Codes'], ['/health', 'Health']];
  const here = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  const header = document.createElement('header');
  header.innerHTML = '<nav class="nav"><a class="logo" href="/">🅿️ ParkEasy</a>' +
    links.map(([h, t]) => `<a href="${h}" class="${h === here ? 'active' : ''}">${t}</a>`).join('') + '</nav>';
  document.body.prepend(header);
  const footer = document.createElement('footer');
  footer.textContent = '© ' + new Date().getFullYear() + ' ParkEasy – Software Development final assessment project';
  document.body.append(footer);

  // ---- Chat widget
  let sid = null; try { sid = sessionStorage.getItem('pe-sid'); } catch (_) {}
  if (!sid) { sid = Math.random().toString(36).slice(2); try { sessionStorage.setItem('pe-sid', sid); } catch (_) {} }
  const btn = document.createElement('button'); btn.id = 'chat-btn'; btn.className = 'btn'; btn.textContent = '💬 Ask the assistant';
  const box = document.createElement('div'); box.id = 'chat-box'; box.hidden = true;
  box.innerHTML = '<div class="head"><strong>ParkEasy Assistant</strong><button aria-label="Close">×</button></div>' +
    '<div id="chat-log" aria-live="polite"></div><form id="chat-form"><input id="chat-in" placeholder="Ask about bookings or an error code…" autocomplete="off" maxlength="1000"><button class="btn">Send</button></form>';
  document.body.append(btn, box);
  const log = box.querySelector('#chat-log'), input = box.querySelector('#chat-in');
  const add = (text, who) => { const d = document.createElement('div'); d.className = 'bub ' + who; d.textContent = text; log.append(d); log.scrollTop = log.scrollHeight; return d; };
  let greeted = false;
  window.openAssistant = (prefill) => {
    box.hidden = false;
    if (!greeted) { add('Hi! I can help with booking parking slots, prices and facilities, or explain error codes (e.g. 404, PK-409).', 'bot'); greeted = true; }
    if (prefill) input.value = prefill;
    input.focus();
  };
  btn.onclick = () => (box.hidden ? openAssistant() : (box.hidden = true));
  box.querySelector('.head button').onclick = () => (box.hidden = true);
  box.querySelector('#chat-form').onsubmit = async (e) => {
    e.preventDefault();
    const message = input.value.trim(); if (!message) return;
    input.value = ''; add(message, 'me'); const wait = add('…', 'bot');
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, sessionId: sid, page: location.pathname }) });
      const d = await r.json();
      wait.textContent = d.answer || d.error || 'Sorry, something went wrong.';
      if (d.logId) {
        const fb = document.createElement('div'); fb.className = 'fb';
        fb.innerHTML = 'Helpful? <button>👍</button><button>👎</button>';
        fb.querySelectorAll('button').forEach((b, i) => b.onclick = async () => {
          fb.textContent = 'Thanks for your feedback!';
          fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ logId: d.logId, helpful: i === 0, sessionId: sid }) });
        });
        log.append(fb); log.scrollTop = log.scrollHeight;
      }
    } catch (_) { wait.textContent = 'Could not reach the assistant. Please try again.'; }
  };
  const q = new URLSearchParams(location.search).get('ask'); if (q) openAssistant(q);
})();
