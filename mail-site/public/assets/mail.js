'use strict';
// HN Mail in the browser (Midnight Lavender layout, the user's request, 6 November 2026). Everything comes from HN
// Mail's own /api, which talks to Gmail on the server; email bodies are shown in sandboxed frames served by
// /api/messages/<id>/body and never added to this page.
(() => {
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); } for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); return el; };
  const svg = (d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); for (const p of d.split('|')) { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', p); s.append(path); } return s; };
  const I = { inbox: 'M4 13h4l2 3h4l2-3h4|M4 13l2-8h12l2 8v6H4z', star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z', important: 'M4 6h12l4 6-4 6H4l4-6z', sent: 'M4 12 20 4l-6 16-3-7z|M11 13l9-9',
    draft: 'M6 3h9l4 4v14H6z|M14 3v5h5|M9 13h6|M9 17h4', archive: 'M4 7h16v3H4z|M6 10v9h12v-9|M10 14h4', all: 'M4 6h16|M4 12h16|M4 18h16', spam: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z|M12 8v5|M12 16h.01', trash: 'M5 7h14|M10 7V5h4v2|M7 7l1 12h8l1-12',
    read: 'M4 9l8 5 8-5|M4 9v10h16V9l-8-5z', unread: 'M4 6h16v12H4z|M4 6l8 7 8-7', back: 'm15 6-6 6 6 6', reply: 'M10 8 5 12l5 4|M5 12h9a5 5 0 0 1 5 5v1', replyAll: 'M9 8 4 12l5 4|M13 8l-4 4 4 4|M9 12h6a5 5 0 0 1 5 5v1',
    forward: 'M14 8l5 4-5 4|M19 12h-9a5 5 0 0 0-5 5v1', clip: 'm20 11-8 8a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7', label: 'M3 12V4h8l10 10-8 8z|M7.5 7.5h.01', restore: 'M4 12a8 8 0 1 0 2.3-5.6|M4 4v5h5',
    more: 'M12 6h.01|M12 12h.01|M12 18h.01', edit: 'M4 20h4L19 9l-4-4L4 16v4z|M14 6l4 4', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|m20 20-3.5-3.5', x: 'm6 6 12 12|M18 6 6 18', eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z|M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    up: 'm6 15 6-6 6 6', down: 'm6 9 6 6 6-6', moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z|M12 2v2|M12 20v2|M4.9 4.9l1.4 1.4|M17.7 17.7l1.4 1.4|M2 12h2|M20 12h2|M4.9 19.1l1.4-1.4|M17.7 6.3l1.4-1.4',
    auto: 'M3 5h18v12H3z|M8 21h8|M12 17v4', gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M4 21a8 8 0 0 1 16 0', out: 'M15 4h4v16h-4|M10 17l5-5-5-5|M15 12H3' };
  const FOLDERS = [['INBOX', 'Inbox', 'inbox'], ['STARRED', 'Starred', 'star'], ['IMPORTANT', 'Important', 'important'], ['SENT', 'Sent', 'sent'], ['DRAFT', 'Drafts', 'draft'], ['ARCHIVE', 'Archive', 'archive'], ['ALL', 'All mail', 'all'], ['SPAM', 'Junk', 'spam'], ['TRASH', 'Bin', 'trash']];
  const PALETTE = ['#c3a2ff', '#7fd1d8', '#f2a0f0', '#ff8fb1', '#8fd6a5', '#e8e98a', '#9fb3ff', '#ffb38a'];
  const app = $('#app');

  // Preferences kept in this browser (none of them are secret).
  const store = { get(k, d) { try { const v = localStorage.getItem('hnmail.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('hnmail.' + k, JSON.stringify(v)); } catch {} } };
  const prefs = { theme: store.get('theme', 'dark'), images: store.get('images', false), signature: store.get('signature', true), compact: store.get('compact', false), collapsed: store.get('collapsed', false), folds: store.get('folds', {}) };

  let session = null, labels = [], view = { label: 'INBOX', q: '', thread: null }, pages = [null], pageIndex = 0, list = [], selected = new Set(), current = null, contacts = new Set();

  // ---------- Helpers ----------
  function toast(text, { error = false, action, onAction, ms = 4500 } = {}) {
    const t = $('#toast'); $('#toast-text').textContent = text; t.classList.toggle('error', error);
    const b = $('#toast-action'); b.hidden = !action; b.textContent = action || ''; b.onclick = () => { t.hidden = true; if (onAction) onAction(); };
    t.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, ms);
  }
  async function api(method, path, body) {
    let r;
    try { r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); }
    catch { throw new Error('HN Mail couldn’t be reached. Check your connection and try again.'); }
    const value = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = '/auth/login?next=/'; throw Object.assign(new Error('Please sign in again.'), { handled: true }); }
    if (value.code === 'connect') { showConnect(value.error); throw Object.assign(new Error(value.error), { handled: true }); }
    if (value.code === 'no-google') { location.reload(); throw Object.assign(new Error(value.error), { handled: true }); }
    if (!r.ok) throw new Error(value.error || 'Something went wrong. Please try again.');
    return value;
  }
  const report = (e) => { if (e && !e.handled) toast(e.message, { error: true }); };
  const nameOf = (from) => { const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(from || ''); return m ? (m[1].trim() || m[2]) : String(from || '').trim(); };
  const emailOf = (from) => { const m = /<([^>]+)>/.exec(from || ''); return (m ? m[1] : String(from || '')).trim().toLowerCase(); };
  const splitAddresses = (s) => String(s || '').split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.trim()).filter(Boolean);
  const initials = (name) => (String(name).replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || '?').toUpperCase();
  const colour = (s) => { let n = 0; for (const c of String(s)) n = (n * 31 + c.codePointAt(0)) >>> 0; return PALETTE[n % PALETTE.length]; };
  const mine = (from) => !!(session && session.gmail.sender && emailOf(from) === session.gmail.sender.email);
  function avatar(from, cls = 'avatar') {
    if (mine(from)) return h('img', { class: cls, src: '/api/avatar', alt: '' });
    const el = h('span', { class: cls, 'aria-hidden': 'true', text: initials(nameOf(from) || emailOf(from)) }); el.style.color = colour(emailOf(from)); return el;
  }
  function when(ms, long = false) {
    const d = new Date(ms), now = new Date();
    if (long) return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric', hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const days = (now - d) / 86400000;
    if (days < 6 && days > 0) return d.toLocaleDateString('en-GB', { weekday: 'short' });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const size = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function confirmBox(title, text, ok = 'OK') { const d = $('#confirm'); $('#confirm-title').textContent = title; $('#confirm-text').textContent = text; $('#confirm-ok').textContent = ok; d.returnValue = ''; d.showModal(); return new Promise((res) => d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true })); }
  function promptBox(title, label, { value = '', ok = 'Save', extra } = {}) {
    const d = $('#prompt'); $('#prompt-title').textContent = title; $('#prompt-label').textContent = label; $('#prompt-input').value = value; $('#prompt-ok').textContent = ok;
    $('#prompt-extra-row').hidden = !extra; if (extra) { $('#prompt-extra-label').textContent = extra.label; $('#prompt-extra').value = extra.value || ''; }
    d.returnValue = ''; d.showModal(); setTimeout(() => $('#prompt-input').select(), 30);
    return new Promise((res) => d.addEventListener('close', () => res(d.returnValue === 'ok' ? { value: $('#prompt-input').value.trim(), extra: $('#prompt-extra').value.trim() } : null), { once: true }));
  }
  // Only plain formatting from HTML we didn't write (Gmail signatures, saved drafts, pasted text) goes into the editor.
  const KEEP = new Set(['P', 'BR', 'DIV', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'A', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'PRE', 'CODE', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'IMG', 'FONT', 'SMALL', 'SUB', 'SUP']);
  function sanitize(html) {
    const doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
    (function walk(node) {
      for (const el of [...node.children]) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'META', 'LINK', 'SVG', 'MATH', 'TEMPLATE', 'TITLE', 'HEAD'].includes(el.tagName)) { el.remove(); continue; }
        walk(el);
        if (!KEEP.has(el.tagName)) { el.replaceWith(...el.childNodes); continue; }
        for (const a of [...el.attributes]) {
          const n = a.name.toLowerCase(), v = a.value.trim();
          if (n === 'src' && el.tagName === 'IMG' && /^https:\/\//i.test(v)) {
            el.setAttribute('data-hn-src', v);
            // HN Group's email logos show from HN Mail's see-through copies, so there's no white box around them.
            const logo = /^https:\/\/staff\.hngroup\.org\.uk\/assets\/brand\/png\/([a-z-]+-email-logo)\.png$/.exec(v);
            el.setAttribute('src', logo ? '/assets/brand/png/' + logo[1] + '-clear.png' : '/api/img?u=' + encodeURIComponent(v));
            if (logo) el.dataset.hnLogo = '1';
            continue;
          }
          if (n === 'style') { if (/url\s*\(|expression|behavior|javascript:|position\s*:\s*(fixed|absolute|sticky)/i.test(v)) el.removeAttribute(a.name); continue; }
          const ok = (n === 'href' && el.tagName === 'A' && /^(https?:|mailto:|tel:)/i.test(v)) || (n === 'src' && el.tagName === 'IMG' && /^data:image\/(png|jpe?g|gif|webp);/i.test(v)) || (n === 'data-hn-src' && /^https:\/\//i.test(v)) || (n === 'data-hn-logo' && v === '1')
            || ['alt', 'title', 'colspan', 'rowspan', 'width', 'height', 'align', 'valign', 'bgcolor', 'cellpadding', 'cellspacing', 'border', 'role'].includes(n);
          if (!ok) el.removeAttribute(a.name);
        }
        if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      }
    })(doc.body);
    return doc.body.innerHTML;
  }
  function learnContacts(...values) {
    let added = false;
    for (const v of values) for (const a of splitAddresses(v)) { const e = emailOf(a); if (e.includes('@') && !contacts.has(a) && contacts.size < 500) { contacts.add(a); added = true; } }
    if (added) $('#contacts').replaceChildren(...[...contacts].map((c) => h('option', { value: c })));
  }

  // ---------- Clock (UK time) ----------
  function tick() {
    const now = new Date(), t = now.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour12: false });
    const zone = (new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'short' }).formatToParts(now).find((p) => p.type === 'timeZoneName') || {}).value || '';
    $('#clock').replaceChildren(t, h('small', { text: zone }));
  }
  tick(); setInterval(tick, 1000);

  // ---------- Themes: Midnight Lavender, Light Lavender, or the computer's choice ----------
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  const currentTheme = () => (prefs.theme === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : prefs.theme === 'light' ? 'light' : 'dark');
  function applyTheme(redraw = true) {
    const t = currentTheme();
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = t === 'light' ? '#f3eefa' : '#120f1e';
    for (const seg of $$('.seg[data-theme-seg]')) for (const b of $$('button', seg)) b.setAttribute('aria-pressed', String(b.dataset.value === prefs.theme));
    // Open emails are drawn for the theme, so they're reloaded in the new one.
    if (redraw) for (const f of $$('.msg-frame')) f.src = f.src.replace(/theme=(dark|light)/, 'theme=' + t);
  }
  function setTheme(value) { prefs.theme = value; store.set('theme', value); applyTheme(); }
  darkQuery.addEventListener('change', () => { if (prefs.theme === 'auto') applyTheme(); });
  function themeSeg() {
    return h('div', { class: 'seg', 'data-theme-seg': '', role: 'group', 'aria-label': 'Theme' }, ...[['dark', 'Midnight', 'moon'], ['light', 'Light', 'sun'], ['auto', 'Computer', 'auto']].map(([value, name, icon]) =>
      h('button', { type: 'button', 'data-value': value, 'aria-pressed': String(prefs.theme === value), onclick: () => setTheme(value) }, svg(I[icon]), name)));
  }
  applyTheme(false);

  // ---------- Routing (#INBOX, #INBOX/<thread>, #search/<words>) ----------
  function parseHash() {
    const raw = decodeURIComponent(location.hash.slice(1));
    if (raw.startsWith('search/')) { const rest = raw.slice(7), i = rest.lastIndexOf('/t:'); return { label: 'ALL', q: i >= 0 ? rest.slice(0, i) : rest, thread: i >= 0 ? rest.slice(i + 3) : null }; }
    const [label, thread] = raw.split('/');
    return { label: label || 'INBOX', q: '', thread: thread || null };
  }
  const hashFor = (v) => '#' + (v.q ? 'search/' + encodeURIComponent(v.q) + (v.thread ? '/t:' + v.thread : '') : encodeURIComponent(v.label) + (v.thread ? '/' + v.thread : ''));
  function go(v) { const target = hashFor({ ...view, ...v }); if (location.hash !== target) location.hash = target; else route(); }
  async function route() {
    const next = parseHash(), listChanged = next.label !== view.label || next.q !== view.q || !list.length;
    view = next;
    $('#search-input').value = view.q; $('#search-clear').hidden = !view.q;
    app.classList.toggle('reading', !!view.thread);
    closeSide();
    drawFolders();
    if (listChanged) { pages = [null]; pageIndex = 0; selected.clear(); await loadList(); } else markActive();
    if (view.thread) openThread(view.thread); else { current = null; emptyReader(); }
  }

  // ---------- Folders, labels, saved searches ----------
  function folderLink(href, name, icon, { count, dot, current: on, remove, i } = {}) {
    const a = h('a', { class: 'folder', href, 'aria-current': on ? 'page' : null, title: name },
      dot !== undefined ? (() => { const s = h('span', { class: 'dot' }); if (dot) s.style.background = dot; return s; })() : svg(I[icon]),
      h('span', { class: 'name', text: name }), count ? h('span', { class: 'count', text: count > 999 ? '999+' : count }) : null);
    if (i !== undefined) a.style.setProperty('--i', i);
    if (remove) a.append(h('button', { class: 'icon-btn small remove', type: 'button', title: 'Remove', 'aria-label': 'Remove ' + name, onclick: (e) => { e.preventDefault(); e.stopPropagation(); remove(); } }, svg(I.x)));
    return a;
  }
  let foldersShown = false;
  function drawFolders() {
    const byId = Object.fromEntries(labels.map((l) => [l.id, l]));
    if (!foldersShown) { foldersShown = true; $('#side').classList.add('intro'); setTimeout(() => $('#side').classList.remove('intro'), 900); }
    $('#folders').replaceChildren(...FOLDERS.map(([id, name, icon], i) => folderLink('#' + id, name, icon, { i, current: !view.q && view.label === id,
      count: id === 'INBOX' || id === 'SPAM' ? (byId[id] || {}).unread : id === 'DRAFT' ? (byId[id] || {}).drafts : 0 })));
    const saved = savedSearches();
    $('#saved').replaceChildren(...(saved.length ? saved.map((s, i) => folderLink('#search/' + encodeURIComponent(s.q), s.name, 'search', { current: view.q === s.q, remove: () => { const all = savedSearches(); all.splice(i, 1); store.set(savedKey(), all); drawFolders(); } })) : [h('p', { class: 'empty', text: 'None yet' })]));
    for (const [k, el] of [['saved', '#saved']]) { const open = prefs.folds[k] !== false; $(el).hidden = !open; $('[data-fold="' + k + '"]').setAttribute('aria-expanded', String(open)); }
    const inbox = byId.INBOX;
    document.title = (inbox && inbox.unread ? '(' + inbox.unread + ') ' : '') + 'HN Mail · HN Group';
  }
  const savedKey = () => 'saved.' + ((session && session.gmail.email) || 'me');
  const savedSearches = () => { const v = store.get(savedKey(), []); return Array.isArray(v) ? v.filter((x) => x && x.q && x.name) : []; };
  async function loadLabels() { try { labels = (await api('GET', '/api/labels')).labels; drawFolders(); } catch (e) { report(e); } }
  const titleFor = () => (view.q ? 'Search results' : (FOLDERS.find((f) => f[0] === view.label) || [])[1] || 'Mail');

  // ---------- Conversation list ----------
  async function loadList(quiet = false) {
    const ul = $('#threads');
    $('#list-title').textContent = titleFor();
    if (!quiet) { ul.replaceChildren(...Array.from({ length: 7 }, () => h('li', { class: 'skeleton', 'aria-hidden': 'true' }))); $('#list-count').textContent = ''; }
    const q = new URLSearchParams();
    if (view.q) q.set('q', view.q); else q.set('label', view.label);
    if (pages[pageIndex]) q.set('page', pages[pageIndex]);
    const asked = hashFor({ ...view, thread: null }) + '|' + pageIndex;
    try {
      const r = await api('GET', '/api/threads?' + q);
      if (asked !== hashFor({ ...view, thread: null }) + '|' + pageIndex) return; // the person moved on meanwhile
      list = r.threads; pages[pageIndex + 1] = r.next;
      for (const t of list) learnContacts(t.fromAddress, t.to);
      $('#prev-page').disabled = pageIndex === 0; $('#next-page').disabled = !r.next;
      const first = pageIndex * 25 + 1, last = pageIndex * 25 + list.length;
      $('#list-count').textContent = !list.length ? '' : pageIndex === 0 && !r.next ? list.length + (list.length === 1 ? ' conversation' : ' conversations') : first + '–' + last + (r.next ? ' of ' + (r.estimate > last ? 'about ' + r.estimate.toLocaleString('en-GB') : 'many') : '');
      drawList(!quiet);
    } catch (e) { if (!quiet) ul.replaceChildren(h('li', { class: 'list-note' }, h('b', { text: 'Couldn’t load your mail.' }), e.handled ? '' : e.message)); report(e); }
    app.setAttribute('aria-busy', 'false');
  }
  function drawList(animate = false) {
    const ul = $('#threads');
    for (const id of [...selected]) if (!list.some((t) => t.id === id)) selected.delete(id);
    ul.classList.toggle('compact', prefs.compact);
    if (!list.length) {
      const empty = view.q ? ['No messages match your search.', 'Try different words, or search for from:name or has:attachment.'] : view.label === 'INBOX' ? ['You’re all caught up.', 'Nothing in your inbox.'] : ['Nothing here.', ''];
      ul.replaceChildren(h('li', { class: 'list-note' }, h('b', { text: empty[0] }), empty[1])); updateBulk(); return;
    }
    ul.replaceChildren(...list.map((t, i) => { const li = row(t); if (animate && i < 18) { li.classList.add('enter'); li.style.setProperty('--i', i); } return li; }));
    updateBulk(); markActive();
  }
  function row(t) {
    const li = h('li', { class: 'thread' + (t.unread ? ' unread' : '') + (selected.has(t.id) ? ' selected' : ''), 'data-id': t.id, tabindex: '0', 'aria-label': (t.unread ? 'Unread. ' : '') + (t.from.join(', ') || '') + '. ' + t.subject + '. ' + when(t.date) });
    const box = h('input', { type: 'checkbox', 'aria-label': 'Select this conversation', checked: selected.has(t.id) ? true : null });
    box.addEventListener('click', (e) => e.stopPropagation());
    box.addEventListener('change', () => { if (box.checked) selected.add(t.id); else selected.delete(t.id); li.classList.toggle('selected', box.checked); updateBulk(); });
    const people = view.label === 'SENT' || view.label === 'DRAFT' ? 'To: ' + (splitAddresses(t.to).map(nameOf).join(', ') || '(no recipients)') : t.from.join(', ') || '(unknown sender)';
    li.append(h('div', { class: 'pic' }, avatar(view.label === 'SENT' ? t.to : t.fromAddress), h('label', { class: 'check', onclick: (e) => e.stopPropagation() }, box, h('span'))),
      h('div', { class: 'lines' }, h('div', { class: 'who' }, t.draft ? h('span', { class: 'draft', text: 'Draft' }) : null, people, t.count > 1 ? h('span', { class: 'n', text: t.count }) : null),
        h('div', { class: 'subj', text: t.subject }), h('div', { class: 'snip', text: t.snippet })),
      h('div', { class: 'meta' }, t.attachments ? svg(I.clip) : null, t.starred ? h('span', { class: 'star-on', title: 'Starred' }, svg(I.star)) : null, h('time', { datetime: new Date(t.date).toISOString(), title: when(t.date, true), text: when(t.date) })),
      h('div', { class: 'row-actions' }, ...rowActions(t)));
    li.addEventListener('click', () => openRow(t));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === li) openRow(t); if (e.key === 'x' && e.target === li) { box.checked = !box.checked; box.dispatchEvent(new Event('change')); } });
    return li;
  }
  // A conversation that is only a draft opens straight in the composer, like Gmail.
  async function openRow(t) {
    if (t.draft && t.count === 1) { try { const full = await api('GET', '/api/threads/' + t.id); const d = full.messages.find((m) => m.draft); if (d) return openDraft(d.id); } catch (e) { return report(e); } }
    go({ thread: t.id });
  }
  function tool(icon, label, fn, extra = {}) { return h('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onclick: (e) => { e.stopPropagation(); fn(e); }, ...extra }, svg(I[icon])); }
  function rowActions(t) {
    const out = [tool('star', t.starred ? 'Unstar' : 'Star', () => setStar(t.id, !t.starred), { class: 'icon-btn star-btn', 'aria-pressed': String(!!t.starred) })];
    if (t.labels.includes('TRASH')) out.push(tool('restore', 'Move to inbox', () => act([t.id], 'untrash')));
    else { if (t.labels.includes('INBOX')) out.push(tool('archive', 'Archive', () => act([t.id], 'archive'))); out.push(tool('trash', 'Delete', () => act([t.id], 'trash'))); }
    out.push(t.unread ? tool('read', 'Mark as read', () => act([t.id], 'read')) : tool('unread', 'Mark as unread', () => act([t.id], 'unread')));
    return out;
  }
  function markActive() { for (const li of $$('.thread')) li.classList.toggle('active', li.dataset.id === view.thread); }
  function updateBulk() {
    const all = $('#select-all'), n = selected.size;
    all.checked = !!list.length && n === list.length; all.indeterminate = n > 0 && n < list.length;
    $('#threads').classList.toggle('selecting', n > 0);
    $('#list-count').hidden = n > 0;
    const bulk = $('#bulk'); bulk.hidden = !n;
    if (!n) return;
    const picked = list.filter((t) => selected.has(t.id)), ids = [...selected];
    const inTrash = view.label === 'TRASH', inSpam = view.label === 'SPAM';
    bulk.replaceChildren(
      inTrash || inSpam ? tool('inbox', 'Move to inbox', () => act(ids, inTrash ? 'untrash' : 'notspam')) : tool('archive', 'Archive', () => act(ids, 'archive')),
      !inTrash ? tool('trash', 'Delete', () => act(ids, 'trash')) : null,
      !inSpam && !inTrash ? tool('spam', 'Report spam', () => act(ids, 'spam')) : null,
      picked.some((t) => t.unread) ? tool('read', 'Mark as read', () => act(ids, 'read')) : tool('unread', 'Mark as unread', () => act(ids, 'unread')),
      h('span', { class: 'list-count', text: n + ' selected' }));
  }
  async function setStar(id, on) {
    const t = list.find((x) => x.id === id); if (t) { t.starred = on; drawList(); }
    try { await api('POST', '/api/threads/' + id + '/modify', on ? { add: ['STARRED'] } : { remove: ['STARRED'] }); if (current && current.id === id) openThread(id, true); if (view.label === 'STARRED') loadList(true); }
    catch (e) { if (t) { t.starred = !on; drawList(); } report(e); }
  }
  // Archive, delete, restore, read/unread, spam, for one or several conversations, with Undo where it can be undone.
  const CHANGE = { archive: { remove: ['INBOX'] }, inbox: { add: ['INBOX'] }, read: { remove: ['UNREAD'] }, unread: { add: ['UNREAD'] }, spam: { add: ['SPAM'], remove: ['INBOX'] }, notspam: { add: ['INBOX'], remove: ['SPAM'] } };
  async function act(ids, what, { undo = true } = {}) {
    if (!ids.length) return;
    const leaves = { archive: view.label === 'INBOX', trash: true, untrash: view.label === 'TRASH', spam: true, notspam: view.label === 'SPAM', inbox: view.label === 'ARCHIVE' }[what] || false;
    const before = list.map((t) => ({ ...t }));
    if (leaves) {
      for (const li of $$('.thread')) if (ids.includes(li.dataset.id)) li.classList.add('leaving');
      await new Promise((r) => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240));
      list = list.filter((t) => !ids.includes(t.id)); for (const id of ids) selected.delete(id);
    }
    else for (const t of list) if (ids.includes(t.id)) { if (what === 'read') t.unread = false; if (what === 'unread') t.unread = true; if (what === 'archive') t.labels = t.labels.filter((l) => l !== 'INBOX'); if (what === 'inbox') t.labels = [...t.labels, 'INBOX']; }
    drawList();
    if (ids.includes(view.thread) && (leaves || what === 'unread')) go({ thread: null });
    try {
      await Promise.all(ids.map((id) => CHANGE[what] ? api('POST', '/api/threads/' + id + '/modify', CHANGE[what]) : api('POST', '/api/threads/' + id + '/' + what)));
      const n = ids.length > 1 ? ids.length + ' conversations' : 'Conversation';
      const said = { archive: n + ' archived.', trash: n + ' moved to the Bin.', untrash: n + ' moved to the inbox.', spam: n + ' moved to Junk.', notspam: n + ' moved to the inbox.', inbox: n + ' moved to the inbox.', read: 'Marked as read.', unread: 'Marked as unread.' }[what];
      const reverse = { archive: 'inbox', inbox: 'archive', trash: 'untrash', untrash: 'trash', spam: 'notspam', notspam: 'spam', read: 'unread', unread: 'read' }[what];
      toast(said, undo && reverse ? { action: 'Undo', onAction: () => act(ids, reverse, { undo: false }).then(() => loadList(true)) } : {});
      loadLabels();
      if (current && ids.includes(current.id) && view.thread === current.id) openThread(current.id, true);
    } catch (e) { list = before; drawList(); report(e); }
  }

  // ---------- Reading ----------
  function emptyReader() {
    $('#reader').replaceChildren(h('div', { class: 'reader-empty' }, h('span', { class: 'mark' }, svg(I.unread)), h('p', { text: 'Pick a message to read it.' }), h('small', {}, 'Or press ', h('kbd', { text: 'c' }), ' to write one.')));
    markActive();
  }
  async function openThread(id, quiet = false) {
    const reader = $('#reader');
    if (!quiet) reader.replaceChildren(h('div', { class: 'reader-empty' }, h('p', { text: 'Opening…' })));
    markActive();
    let t;
    try { t = await api('GET', '/api/threads/' + id); }
    catch (e) { if (view.thread === id) reader.replaceChildren(h('div', { class: 'reader-empty' }, h('p', { text: 'This conversation couldn’t be opened.' }), h('small', { text: e.handled ? '' : e.message }))); report(e); return; }
    if (view.thread !== id) return;
    current = t;
    for (const m of t.messages) learnContacts(m.from, m.to, m.cc);
    const summary = list.find((x) => x.id === id);
    if (t.labels.includes('UNREAD')) { api('POST', '/api/threads/' + id + '/modify', { remove: ['UNREAD'] }).then(loadLabels).catch(() => {}); if (summary) { summary.unread = false; drawList(); } }
    const subject = (t.messages[0] && t.messages[0].subject) || '(no subject)';
    const inTrash = t.labels.includes('TRASH'), inSpam = t.labels.includes('SPAM'), inInbox = t.labels.includes('INBOX'), starred = t.labels.includes('STARRED');
    const idx = list.findIndex((x) => x.id === id);
    const bar = h('div', { class: 'reader-bar' },
      tool('back', 'Back to the list (u)', () => go({ thread: null }), { class: 'icon-btn back' }),
      inTrash ? tool('restore', 'Move to inbox', () => act([id], 'untrash')) : inSpam ? tool('inbox', 'Not junk', () => act([id], 'notspam')) : inInbox ? tool('archive', 'Archive (e)', () => act([id], 'archive')) : tool('inbox', 'Move to inbox', () => act([id], 'inbox')),
      !inSpam && !inTrash ? tool('spam', 'Report spam', () => act([id], 'spam')) : null,
      !inTrash ? tool('trash', 'Delete (#)', () => act([id], 'trash')) : null,
      tool('unread', 'Mark as unread', () => act([id], 'unread')),
      h('span', { class: 'sep' }),
      tool('star', starred ? 'Unstar (s)' : 'Star (s)', () => setStar(id, !starred), { class: 'icon-btn star-btn', 'aria-pressed': String(starred) }),
      h('span', { class: 'spacer' }),
      tool('up', 'Newer conversation (k)', () => list[idx - 1] && go({ thread: list[idx - 1].id }), { disabled: idx <= 0 ? true : null }),
      tool('down', 'Older conversation (j)', () => list[idx + 1] && go({ thread: list[idx + 1].id }), { disabled: idx < 0 || idx >= list.length - 1 ? true : null }));
    const chips = [];
    if (inInbox) chips.unshift(h('span', { class: 'chip sys', text: 'Inbox' }));
    if (inSpam) chips.unshift(h('span', { class: 'chip sys', text: 'Junk' }));
    if (inTrash) chips.unshift(h('span', { class: 'chip sys', text: 'Bin' }));
    const openIds = new Set(t.messages.filter((m, i) => i === t.messages.length - 1 || m.unread || t.messages.length <= 2).map((m) => m.id));
    const msgs = t.messages.map((m, i) => { const el = message(m, openIds.has(m.id)); el.style.setProperty('--i', Math.min(i, 8)); return el; });
    reader.classList.toggle('still', quiet);
    const replyable = [...t.messages].reverse().find((m) => !m.draft);
    reader.replaceChildren(bar, h('div', { class: 'reader-inner' }, h('h1', { text: subject }), chips.length ? h('div', { class: 'chips' }, ...chips) : null, ...msgs,
      replyable ? h('div', { class: 'reply-row' }, h('button', { class: 'pill', type: 'button', onclick: () => reply(replyable, 'reply') }, svg(I.reply), 'Reply'),
        h('button', { class: 'pill', type: 'button', onclick: () => reply(replyable, 'all') }, svg(I.replyAll), 'Reply all'),
        h('button', { class: 'pill', type: 'button', onclick: () => reply(replyable, 'forward') }, svg(I.forward), 'Forward')) : null));
    if (!quiet) { reader.scrollTop = 0; const last = $$('.msg.open', reader).pop(); if (last && t.messages.length > 2) setTimeout(() => last.scrollIntoView({ block: 'start' }), 80); }
  }
  function message(m, open) {
    const el = h('article', { class: 'msg' + (open ? ' open' : ''), 'data-id': m.id });
    const to = [m.to && 'to ' + splitAddresses(m.to).map(nameOf).join(', '), m.cc && 'cc ' + splitAddresses(m.cc).map(nameOf).join(', ')].filter(Boolean).join(' · ');
    const head = h('div', { class: 'msg-head' }, avatar(m.from), h('div', { class: 'msg-from' }, h('b', { text: nameOf(m.from) || '(unknown)' }), h('span', { class: 'msg-addr', text: emailOf(m.from) && emailOf(m.from) !== nameOf(m.from).toLowerCase() ? '<' + emailOf(m.from) + '>' : '' }),
      h('span', { class: open ? 'to' : 'msg-snippet', text: open ? to : m.snippet })),
      h('div', { class: 'msg-when' }, h('time', { datetime: new Date(m.date).toISOString(), text: when(m.date, open) }), open && !m.draft ? tool('reply', 'Reply', () => reply(m, 'reply')) : null, open && !m.draft ? tool('more', 'More', (e) => messageMenu(e.currentTarget, m)) : null));
    el.append(head);
    if (open) el.append(...body(m));
    else head.addEventListener('click', () => el.replaceWith(message(m, true)));
    return el;
  }
  function body(m) {
    if (m.draft) return [h('div', { class: 'draft-note' }, 'Draft', h('button', { class: 'pill', type: 'button', onclick: () => openDraft(m.id) }, svg(I.edit), 'Edit draft'))];
    const wrap = h('div', { class: 'msg-body' }), show = prefs.images || shownImages.has(m.id);
    const frame = h('iframe', { class: 'msg-frame', title: 'Message from ' + nameOf(m.from), sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox', referrerpolicy: 'no-referrer', src: bodyUrl(m.id, show) });
    if (m.remoteImages && !show) {
      const note = h('p', { class: 'images-note' }, svg(I.eye), 'Pictures from the web are hidden to protect your privacy.', h('button', { class: 'link-btn', type: 'button', onclick: () => { shownImages.add(m.id); frame.src = bodyUrl(m.id, true); note.remove(); } }, 'Show images'));
      wrap.append(note);
    }
    wrap.append(frame);
    if (m.attachments.length) wrap.append(h('ul', { class: 'files' }, ...m.attachments.map((a) => h('li', {}, h('a', { class: 'file', href: '/api/messages/' + m.id + '/parts/' + a.partId, download: a.name, title: 'Download ' + a.name }, svg(I.clip), h('span', { text: a.name }), h('small', { text: size(a.size) }))))));
    return [wrap];
  }
  const shownImages = new Set();
  const bodyUrl = (id, images) => '/api/messages/' + id + '/body?theme=' + currentTheme() + (images ? '&images=1' : '');
  // Email frames report their height (they can't touch this page).
  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data.hnMailHeight !== 'number') return;
    for (const f of $$('.msg-frame')) if (f.contentWindow === e.source) f.style.height = Math.min(Math.max(e.data.hnMailHeight + 4, 40), 60000) + 'px';
  });
  function popMenu(anchor, items) {
    closePop();
    const pop = h('div', { class: 'pop', role: 'menu' }, ...items);
    document.body.append(pop);
    const r = anchor.getBoundingClientRect(), w = Math.max(pop.offsetWidth, 230);
    pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
    pop.style.top = (innerHeight - r.bottom > pop.offsetHeight + 12 ? r.bottom + 6 : Math.max(8, r.top - pop.offsetHeight - 6)) + 'px';
    setTimeout(() => document.addEventListener('click', closePop, { once: true }), 0);
    pop.addEventListener('click', (e) => e.stopPropagation());
    pop.addEventListener('keydown', (e) => {
      const items2 = $$('button, input', pop), at = items2.indexOf(document.activeElement);
      if (e.key === 'Escape') { closePop(); anchor.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items2[(at + (e.key === 'ArrowDown' ? 1 : items2.length - 1)) % items2.length].focus(); }
    });
    const first = pop.querySelector('button, input'); if (first) first.focus();
  }
  function closePop() { for (const p of $$('.pop')) p.remove(); }
  function messageMenu(anchor, m) {
    const item = (label, fn) => h('button', { type: 'button', role: 'menuitem', onclick: () => { closePop(); fn(); } }, label);
    popMenu(anchor, [item('Reply all', () => reply(m, 'all')), item('Forward', () => reply(m, 'forward')),
      item('Mark unread from here', () => api('POST', '/api/messages/' + m.id + '/modify', { add: ['UNREAD'] }).then(() => { toast('Marked as unread.'); go({ thread: null }); loadList(true); loadLabels(); }).catch(report))]);
  }
  // ---------- Writing ----------
  const C = { open: false, draftId: null, threadId: null, inReplyTo: '', references: '', files: [], include: [], dirty: false, saving: null, timer: null };
  const editor = $('#c-editor');
  // "Use my Gmail signature" on: the signature set in Gmail (or the HN one if Gmail has none); off: the HN Group signature
  // made for whoever is signed in (the user's request, 6 November 2026).
  function signature() {
    if (!session) return '';
    const gmail = session.gmail.sender && session.gmail.sender.signature;
    const s = prefs.signature && gmail ? gmail : session.hnSignature;
    return s ? '<br><br><div class="hn-sig">' + sanitize(s) + '</div>' : '';
  }
  async function openComposer(fill = {}) {
    if (C.open && C.dirty) { await saveDraft(); if (C.saving) await C.saving.catch(() => {}); }
    Object.assign(C, { open: true, draftId: fill.draftId || null, threadId: fill.threadId || null, inReplyTo: fill.inReplyTo || '', references: fill.references || '', files: [], include: fill.include || [], dirty: false, saving: null });
    $('#c-to').value = fill.to || ''; $('#c-cc').value = fill.cc || ''; $('#c-bcc').value = fill.bcc || ''; $('#c-subject').value = fill.subject || '';
    $('#c-cc-row').hidden = !fill.cc && !fill.bcc; $('#c-bcc-row').hidden = !fill.cc && !fill.bcc; $('#c-show-cc').hidden = !!(fill.cc || fill.bcc);
    editor.innerHTML = fill.html != null ? fill.html : signature();
    $('#composer-title').textContent = fill.title || 'New message';
    $('#composer-state').textContent = fill.draftId ? 'Draft' : ''; $('#c-error').hidden = true;
    const box = $('#composer'); box.hidden = false; box.classList.remove('min'); $('#composer-backdrop').hidden = false;
    drawFiles();
    setTimeout(() => (fill.focus === 'editor' ? caretStart(editor) : !$('#c-to').value ? $('#c-to').focus() : !$('#c-subject').value ? $('#c-subject').focus() : caretStart(editor)), 30);
  }
  function caretStart(el) { el.focus(); const r = document.createRange(); r.setStart(el, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); el.scrollTop = 0; }
  function quoteBlock(m) { return '<br><br><div>On ' + esc(when(m.date, true)) + ', ' + esc(m.from) + ' wrote:</div><blockquote>' + esc(m.text || m.snippet || '').replace(/\n/g, '<br>') + '</blockquote>'; }
  function reply(m, how) {
    const self = (session.gmail.sender && session.gmail.sender.email) || '', subject = m.subject || '';
    if (how === 'forward') {
      const head = '<br><br><div>---------- Forwarded message ----------<br>From: ' + esc(m.from) + '<br>Date: ' + esc(when(m.date, true)) + '<br>Subject: ' + esc(subject) + '<br>To: ' + esc(m.to) + (m.cc ? '<br>Cc: ' + esc(m.cc) : '') + '</div><br>' + esc(m.text || m.snippet || '').replace(/\n/g, '<br>');
      return openComposer({ title: 'Forward', subject: /^fwd?:/i.test(subject) ? subject : 'Fwd: ' + subject, html: signature() + head, include: m.attachments.map((a) => ({ messageId: m.id, partId: a.partId, name: a.name, size: a.size })) });
    }
    let to = mine(m.from) ? m.to : (m.replyTo || m.from), cc = '';
    if (how === 'all') {
      const seen = new Set([self, ...splitAddresses(to).map(emailOf)]);
      cc = [...(mine(m.from) ? [] : splitAddresses(m.to)), ...splitAddresses(m.cc)].filter((x) => { const e = emailOf(x); if (!e || seen.has(e)) return false; seen.add(e); return true; }).join(', ');
    }
    openComposer({ title: how === 'all' ? 'Reply all' : 'Reply', to, cc, subject: /^re:/i.test(subject) ? subject : 'Re: ' + subject, html: signature() + quoteBlock(m), threadId: m.threadId, inReplyTo: m.messageId, references: [m.references, m.messageId].filter(Boolean).join(' '), focus: 'editor' });
  }
  async function openDraft(messageId) {
    try {
      const d = await api('GET', '/api/drafts/for/' + messageId);
      openComposer({ title: 'Draft', draftId: d.draftId, threadId: d.threadId, to: d.to, cc: d.cc, bcc: d.bcc, subject: d.subject, inReplyTo: d.inReplyTo, references: d.references, html: sanitize(d.html), include: d.attachments.map((a) => ({ messageId: d.messageId, partId: a.partId, name: a.name, size: a.size })) });
    } catch (e) { report(e); }
  }
  function drawFiles() {
    const items = [...C.include.map((f, i) => ({ f, remove: () => C.include.splice(i, 1) })), ...C.files.map((f, i) => ({ f, remove: () => C.files.splice(i, 1) }))];
    $('#c-files').replaceChildren(...items.map(({ f, remove }) => h('li', {}, svg(I.clip), h('span', { text: f.name }), h('small', { text: size(f.size || 0) }), h('button', { type: 'button', 'aria-label': 'Remove ' + f.name, title: 'Remove', onclick: () => { remove(); changed(); drawFiles(); } }, '×'))));
  }
  const readFile = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('“' + file.name + '” couldn’t be read.')); r.readAsDataURL(file); });
  function addFiles(files) {
    const total = () => [...C.files, ...C.include].reduce((n, f) => n + (f.size || 0), 0);
    for (const f of files) {
      if (total() + f.size > 25 * 1024 * 1024) { toast('Attachments can be 25 MB at most in all, so “' + f.name + '” wasn’t added.', { error: true }); continue; }
      C.files.push(f);
    }
    changed(); drawFiles();
  }
  async function payload() {
    const copy = editor.cloneNode(true);
    for (const img of copy.querySelectorAll('img[data-hn-src]')) { img.setAttribute('src', img.getAttribute('data-hn-src')); img.removeAttribute('data-hn-src'); img.removeAttribute('data-hn-logo'); }
    return { to: $('#c-to').value, cc: $('#c-cc').value, bcc: $('#c-bcc').value, subject: $('#c-subject').value, html: copy.innerHTML, threadId: C.threadId, inReplyTo: C.inReplyTo, references: C.references,
      draftId: C.draftId, include: C.include.map(({ messageId, partId }) => ({ messageId, partId })), attachments: await Promise.all(C.files.map(async (f) => ({ name: f.name, type: f.type, data: await readFile(f) }))) };
  }
  function changed() { if (!C.open) return; C.dirty = true; $('#composer-state').textContent = ''; clearTimeout(C.timer); C.timer = setTimeout(saveDraft, 3000); }
  // Saves the draft in Gmail. Files added here are uploaded once: after saving they're used from the saved draft.
  function saveDraft() {
    clearTimeout(C.timer);
    if (!C.open || !C.dirty) return C.saving;
    const empty = !$('#c-to').value.trim() && !$('#c-cc').value.trim() && !$('#c-subject').value.trim() && !editor.textContent.trim() && !C.files.length && !C.include.length;
    if (empty && !C.draftId) return null;
    C.dirty = false; $('#composer-state').textContent = 'Saving…';
    const uploading = C.files.slice();
    C.saving = (async () => {
      try {
        const r = await api('POST', '/api/drafts', await payload());
        C.draftId = r.draftId;
        if (uploading.length && r.messageId) {
          const d = await api('GET', '/api/drafts/for/' + r.messageId);
          C.include = d.attachments.map((a) => ({ messageId: d.messageId, partId: a.partId, name: a.name, size: a.size }));
          C.files = C.files.filter((f) => !uploading.includes(f));
          drawFiles();
        }
        if ($('#composer-state').textContent === 'Saving…') $('#composer-state').textContent = 'Draft saved';
        return r;
      } catch (e) { C.dirty = true; $('#composer-state').textContent = 'Not saved'; report(e); return null; }
      finally { C.saving = null; }
    })();
    return C.saving;
  }
  function closeComposer() { C.open = false; clearTimeout(C.timer); $('#composer').hidden = true; $('#composer-backdrop').hidden = true; $('#composer').classList.remove('max', 'min'); }
  $('#composer-form').addEventListener('input', changed);
  $('#c-attach').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
  editor.addEventListener('paste', (e) => { const html = e.clipboardData.getData('text/html'); if (html) { e.preventDefault(); document.execCommand('insertHTML', false, sanitize(html)); } });
  $('#composer').addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  $('#composer').addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });
  $('#c-show-cc').addEventListener('click', () => { $('#c-cc-row').hidden = false; $('#c-bcc-row').hidden = false; $('#c-show-cc').hidden = true; $('#c-cc').focus(); });
  for (const b of $$('.format-bar button')) {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => { if (b.dataset.cmd === 'createLink') return insertLink(); editor.focus(); document.execCommand(b.dataset.cmd, false, b.dataset.value || null); changed(); });
  }
  async function insertLink() {
    const sel = getSelection(), range = sel.rangeCount && editor.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    const r = await promptBox('Insert a link', 'Web address', { ok: 'Insert', extra: { label: 'Text to show', value: range ? range.toString() : '' } });
    if (!r || !r.value) return;
    let url = r.value; if (!/^(https?:|mailto:)/i.test(url)) url = (url.includes('@') && !url.includes('/') ? 'mailto:' : 'https://') + url;
    editor.focus(); if (range) { sel.removeAllRanges(); sel.addRange(range); } else caretStart(editor);
    document.execCommand('insertHTML', false, '<a href="' + esc(url) + '">' + esc(r.extra || r.value) + '</a>'); changed();
  }
  $('#composer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#c-error'); err.hidden = true;
    if (!$('#c-to').value.trim() && !$('#c-cc').value.trim() && !$('#c-bcc').value.trim()) { err.textContent = 'Add at least one recipient.'; err.hidden = false; $('#c-to').focus(); return; }
    if (!$('#c-subject').value.trim() && !(await confirmBox('Send without a subject?', 'This message has no subject.', 'Send anyway'))) return;
    const send = $('#c-send'); send.disabled = true; send.textContent = 'Sending…';
    clearTimeout(C.timer); if (C.saving) await C.saving.catch(() => {});
    try {
      await api('POST', '/api/send', await payload());
      learnContacts($('#c-to').value, $('#c-cc').value, $('#c-bcc').value);
      closeComposer(); toast('Message sent.');
      if (current) openThread(current.id, true);
      loadList(true); loadLabels();
    } catch (e2) { if (!e2.handled) { err.textContent = e2.message; err.hidden = false; } }
    finally { send.disabled = false; send.textContent = 'Send'; }
  });
  async function closeAndSave() { const pending = saveDraft(); closeComposer(); const r = await pending; if (r) { toast('Draft saved.'); if (view.label === 'DRAFT') loadList(true); loadLabels(); } }
  $('#composer-close').addEventListener('click', closeAndSave);
  function toggleMin() { const min = $('#composer').classList.toggle('min'); $('#composer').classList.remove('max'); $('#composer-backdrop').hidden = min; }
  $('#composer-min').addEventListener('click', (e) => { e.stopPropagation(); toggleMin(); });
  $('.composer-head').addEventListener('click', (e) => { if ($('#composer').classList.contains('min') && !e.target.closest('button')) toggleMin(); });
  $('#composer-max').addEventListener('click', () => $('#composer').classList.toggle('max'));
  $('#c-discard').addEventListener('click', async () => {
    clearTimeout(C.timer); C.dirty = false;
    if (C.saving) await C.saving.catch(() => {});
    const id = C.draftId; closeComposer();
    if (id) { try { await api('DELETE', '/api/drafts/' + id); } catch (e) { report(e); } }
    toast('Draft discarded.'); if (view.label === 'DRAFT') loadList(true); loadLabels();
  });
  window.addEventListener('beforeunload', (e) => { if (C.open && C.dirty) { saveDraft(); e.preventDefault(); e.returnValue = ''; } });

  // ---------- Connect Gmail ----------
  function showConnect(reason) {
    app.classList.add('connecting'); app.setAttribute('aria-busy', 'false');
    const g = (session && session.gmail) || {}, linked = g.linkedEmail || '';
    const stripe = [['#E97DE8', 28], ['#5514B4', 28], ['#E3E65B', 12], ['#3E9BA3', 40], ['#7A1F6C', 20], ['#C2306B', 20], ['#5FAE7B', 26], ['#3A4166', 26]].map(([c, w]) => { const s = h('span'); s.style.background = c; s.style.width = w + 'px'; return s; });
    $('#connect').replaceChildren(h('div', { class: 'connect-card' }, h('div', { class: 'steps-mini', 'aria-hidden': 'true' }, ...stripe),
      h('p', { class: 'eyebrow', text: 'HN MAIL' }), h('h1', { text: 'Connect your Gmail' }), reason ? h('p', { class: 'form-error', text: reason }) : null,
      h('p', { class: 'lead', text: 'HN Mail shows your Gmail the HN Group way. Google will ask you once to allow it.' }),
      h('ul', {}, h('li', { text: 'Only the Google account linked to your HN Group Auth account can be used' + (linked ? ': ' + linked + '.' : '.') }), h('li', { text: 'Your mail stays in Gmail. HN Mail doesn’t keep copies of it.' }), h('li', { text: 'You can disconnect at any time in Settings, or in your Google account.' })),
      g.configured === false ? h('p', { class: 'form-error', text: 'Google isn’t set up on this server yet, so Gmail can’t be connected. Ask the system owner.' }) : h('a', { class: 'send-btn', href: '/google/connect', style: 'display:inline-flex;align-items:center;text-decoration:none' }, 'Continue with Google')));
    $('#connect').hidden = false;
  }

  // ---------- Wiring ----------
  function closeSide() { app.classList.remove('side-open'); }
  const narrow = () => matchMedia('(max-width: 1000px)').matches;
  $('#menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (narrow()) { app.classList.toggle('side-open'); return; }
    prefs.collapsed = !prefs.collapsed; store.set('collapsed', prefs.collapsed); app.classList.toggle('collapsed', prefs.collapsed); $('#menu-btn').setAttribute('aria-expanded', String(!prefs.collapsed));
  });
  document.addEventListener('click', (e) => { if (app.classList.contains('side-open') && !e.target.closest('#side')) closeSide(); });
  $('#search').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#search-input').value.trim(); $('#search-input').blur(); go(q ? { q, label: 'ALL', thread: null } : { q: '', label: 'INBOX', thread: null }); });
  $('#search-input').addEventListener('input', () => { $('#search-clear').hidden = !$('#search-input').value; });
  $('#search-clear').addEventListener('click', () => { $('#search-input').value = ''; $('#search-clear').hidden = true; if (view.q) go({ q: '', label: 'INBOX', thread: null }); else $('#search-input').focus(); });
  $('#search-focus').addEventListener('click', () => $('#search-input').focus());
  $('#compose-btn').addEventListener('click', () => { closeSide(); openComposer(); });
  $('#compose-fab').addEventListener('click', () => openComposer());
  $('#refresh').addEventListener('click', () => { loadList(); loadLabels(); });
  $('#prev-page').addEventListener('click', () => { if (pageIndex > 0) { pageIndex--; selected.clear(); loadList(); } });
  $('#next-page').addEventListener('click', () => { if (pages[pageIndex + 1]) { pageIndex++; selected.clear(); loadList(); } });
  $('#select-all').addEventListener('change', (e) => { selected = new Set(e.target.checked ? list.map((t) => t.id) : []); drawList(); });
  $('#new-search').addEventListener('click', async () => {
    const r = await promptBox('Save a search', 'Name', { value: view.q || '', ok: 'Save', extra: { label: 'Search words (Gmail search, e.g. from:jack has:attachment)', value: view.q || '' } });
    if (!r || !r.value || !r.extra) return;
    const all = savedSearches().filter((s) => s.q !== r.extra); all.push({ name: r.value.slice(0, 60), q: r.extra.slice(0, 500) }); store.set(savedKey(), all.slice(-30)); drawFolders(); toast('Search saved.');
  });
  for (const b of $$('[data-fold]')) b.addEventListener('click', () => { const k = b.dataset.fold; prefs.folds[k] = prefs.folds[k] === false; store.set('folds', prefs.folds); drawFolders(); });
  // Account menu under the profile picture, with settings (the user's request).
  function closeAccount() { const p = $('.account-pop'); if (p) p.remove(); $('#account-button').setAttribute('aria-expanded', 'false'); }
  function openSettings() { closeAccount(); $('#set-images').checked = prefs.images; $('#set-signature').checked = prefs.signature; $('#set-compact').checked = prefs.compact; $('#set-theme').replaceChildren(themeSeg()); $('#settings').showModal(); }
  $('#account-button').addEventListener('click', (e) => {
    e.stopPropagation();
    if ($('.account-pop')) return closeAccount();
    closePop();
    const u = (session && session.user) || {}, g = (session && session.gmail) || {};
    const pop = h('div', { class: 'account-pop', role: 'dialog', 'aria-label': 'Your account' },
      h('div', { class: 'who-card' }, h('img', { src: '/api/avatar', alt: '' }), h('b', { text: u.displayName || 'Your account' }), h('span', { text: u.username || u.email || '' }), h('small', { text: g.connected ? 'Gmail: ' + g.email : 'Gmail isn’t connected' })),
      h('h3', { text: 'Theme' }), themeSeg(),
      h('div', { class: 'menu-list' },
        h('button', { type: 'button', onclick: openSettings }, svg(I.gear), 'Settings'),
        h('a', { href: 'https://accounts.hngroup.org.uk/', target: '_blank', rel: 'noopener' }, svg(I.user), 'HN Account'),
        h('form', { action: '/auth/logout', method: 'post' }, h('button', { type: 'submit' }, svg(I.out), 'Sign out'))));
    pop.addEventListener('click', (ev) => ev.stopPropagation());
    document.body.append(pop);
    $('#account-button').setAttribute('aria-expanded', 'true');
    const first = pop.querySelector('.seg button[aria-pressed="true"]') || pop.querySelector('button'); if (first) first.focus();
  });
  document.addEventListener('click', closeAccount);
  $('#settings-btn').addEventListener('click', (e) => { e.stopPropagation(); openSettings(); });
  function setImages(on) { prefs.images = on; store.set('images', on); const b = $('#images-toggle'); b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Pictures from the web: always shown' : 'Pictures from the web: hidden until you ask'; if (current && view.thread) openThread(current.id, true); }
  $('#images-toggle').addEventListener('click', () => { setImages(!prefs.images); toast(prefs.images ? 'Pictures from the web will always be shown.' : 'Pictures from the web are hidden until you choose Show images.'); });
  $('#set-images').addEventListener('change', (e) => setImages(e.target.checked));
  $('#set-signature').addEventListener('change', (e) => { prefs.signature = e.target.checked; store.set('signature', prefs.signature); });
  $('#set-compact').addEventListener('change', (e) => { prefs.compact = e.target.checked; store.set('compact', prefs.compact); drawList(); });
  for (const b of $$('[data-close]')) b.addEventListener('click', () => $('#' + b.dataset.close).close());
  for (const d of $$('dialog')) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  $('#disconnect').addEventListener('click', async () => {
    if (!(await confirmBox('Disconnect Gmail?', 'HN Mail will stop showing your mail until you connect it again. Nothing is deleted from Gmail.', 'Disconnect'))) return;
    try { await api('POST', '/api/google/disconnect'); $('#settings').close(); session.gmail.connected = false; showConnect(); } catch (e) { report(e); }
  });
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && C.open && $('#composer').contains(document.activeElement)) { e.preventDefault(); $('#composer-form').requestSubmit(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { if ($('.account-pop')) { closeAccount(); $('#account-button').focus(); return; } if ($('.pop')) return closePop(); if (C.open && $('#composer').contains(document.activeElement)) { e.preventDefault(); closeAndSave(); } return; }
    if (e.target.closest('input, textarea, [contenteditable], select') || document.querySelector('dialog[open]') || app.classList.contains('connecting')) return;
    const idx = list.findIndex((t) => t.id === view.thread), last = current && [...current.messages].reverse().find((m) => !m.draft);
    const keys = { c: () => openComposer(), '/': () => $('#search-input').focus(), j: () => { const t = list[idx + 1]; if (t) go({ thread: t.id }); }, k: () => { const t = list[idx - 1]; if (t) go({ thread: t.id }); }, u: () => go({ thread: null }),
      e: () => view.thread && act([view.thread], current && current.labels.includes('INBOX') ? 'archive' : 'inbox'), '#': () => view.thread && act([view.thread], 'trash'), r: () => last && reply(last, 'reply'), a: () => last && reply(last, 'all'), f: () => last && reply(last, 'forward'),
      s: () => view.thread && setStar(view.thread, !(current && current.labels.includes('STARRED'))) };
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
  });
  // New mail appears without a reload: the list and counts refresh every minute while the page is in view.
  setInterval(() => { if (document.visibilityState === 'visible' && session && session.gmail.connected && !app.classList.contains('connecting') && pageIndex === 0 && !selected.size) { loadList(true); loadLabels(); } }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && session && session.gmail.connected && !app.classList.contains('connecting')) loadLabels(); });

  (async function start() {
    app.classList.toggle('collapsed', prefs.collapsed); $('#menu-btn').setAttribute('aria-expanded', String(!prefs.collapsed));
    setImages(prefs.images);
    try { session = await api('GET', '/api/session'); } catch (e) { report(e); return; }
    $('#settings-gmail').textContent = session.gmail.connected ? 'Connected as ' + session.gmail.email + '. Disconnecting stops HN Mail showing your mail; nothing is deleted from Gmail.' : 'Gmail isn’t connected.';
    $('#disconnect').hidden = !session.gmail.connected;
    $('#mailbox').replaceChildren(h('img', { src: '/api/avatar', alt: '' }), h('span', { text: session.gmail.email || session.gmail.linkedEmail || '' }));
    if (!session.gmail.connected) return showConnect();
    await Promise.all([loadLabels(), route()]);
  })();
})();
