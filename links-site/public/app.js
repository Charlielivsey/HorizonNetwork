'use strict';
// HN Group Sites: search (press / to jump to it, Enter opens the first match, Esc clears), section filters, pinned sites
// (kept in this browser only) and each site's live status from /api/status, refreshed every minute.
(() => {
  const $ = (id) => document.getElementById(id);
  const search = $('search'), cards = [...document.querySelectorAll('.directory .group:not(.pinned) .site-card')];
  const tabs = [...document.querySelectorAll('[data-filter]')], sections = [...document.querySelectorAll('[data-group-section]')];
  let filter = 'all';

  // ---------- Search and filters ----------
  const words = (q) => q.toLowerCase().split(/\s+/).filter(Boolean);
  function apply() {
    const q = words(search.value);
    let shown = 0;
    for (const c of cards) {
      const ok = (filter === 'all' || c.dataset.group === filter) && q.every((w) => c.dataset.search.includes(w));
      c.hidden = !ok; if (ok) shown++;
    }
    for (const s of sections) {
      const visible = s.querySelectorAll('.site-card:not([hidden])').length;
      s.hidden = !visible;
      const n = s.querySelector('[data-count-for]'); if (n) n.textContent = visible;
    }
    $('pinned').hidden = !!(q.length || filter !== 'all') || !$('pinned-grid').children.length;
    $('count').textContent = q.length || filter !== 'all' ? shown + (shown === 1 ? ' site' : ' sites') : '';
    $('empty').hidden = shown !== 0;
  }
  tabs.forEach((t) => t.addEventListener('click', () => { filter = t.dataset.filter; tabs.forEach((x) => x.setAttribute('aria-pressed', String(x === t))); apply(); }));
  search.addEventListener('input', apply);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { search.value = ''; apply(); }
    if (e.key === 'Enter') { const first = cards.find((c) => !c.hidden); if (first) location.href = first.querySelector('.card-link').href; }
  });
  document.addEventListener('keydown', (e) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); search.focus(); search.select(); }
  });
  $('reset').addEventListener('click', () => { search.value = ''; tabs[0].click(); search.focus(); });

  // ---------- Pins (this browser only) ----------
  const KEY = 'hn-sites-pins';
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };
  const save = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private window: pins last until the page closes */ } };
  let pins = load();
  function drawPins() {
    const grid = $('pinned-grid');
    grid.replaceChildren(...pins.map((id) => cards.find((c) => c.dataset.id === id)).filter(Boolean).map((c) => { const copy = c.cloneNode(true); copy.hidden = false; copy.classList.add('pinned-copy'); return copy; }));
    for (const c of document.querySelectorAll('.site-card')) {
      const on = pins.includes(c.dataset.id), b = c.querySelector('.pin');
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', (on ? 'Unpin ' : 'Pin ') + c.querySelector('.card-link').textContent);
      b.title = on ? 'Unpin' : 'Pin to the top';
    }
    paintStatus(); apply();
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.pin'); if (!b) return;
    const id = b.closest('.site-card').dataset.id;
    pins = pins.includes(id) ? pins.filter((x) => x !== id) : pins.concat(id);
    save(pins); drawPins();
  });

  // ---------- Live status ----------
  const LABEL = { operational: 'Working normally', degraded: 'Running slowly', outage: 'Having problems', maintenance: 'Under maintenance', unknown: 'Status unknown' };
  let hosts = {};
  function paintStatus() {
    for (const c of document.querySelectorAll('.site-card')) {
      const st = hosts[c.dataset.host] || '';
      c.dataset.status = st;
      c.querySelector('.status-text').textContent = st ? ' (' + (LABEL[st] || st) + ')' : '';
      c.querySelector('.dot').title = st ? LABEL[st] || st : '';
    }
    const values = Object.values(hosts), bad = values.filter((v) => v === 'outage' || v === 'degraded').length, upkeep = values.filter((v) => v === 'maintenance').length;
    const pill = $('status-pill');
    pill.dataset.status = !values.length ? '' : bad ? 'outage' : upkeep ? 'maintenance' : 'operational';
    $('status-pill-text').textContent = !values.length ? 'Service status' : bad ? bad + (bad === 1 ? ' site having problems' : ' sites having problems') : upkeep ? upkeep + ' under maintenance' : 'All sites working';
  }
  async function refresh() {
    try { const r = await fetch('/api/status', { cache: 'no-store' }); if (r.ok) { hosts = (await r.json()).hosts || {}; paintStatus(); } } catch { /* keep the last answer */ }
  }

  drawPins(); refresh(); setInterval(() => { if (!document.hidden) refresh(); }, 60000);
})();
