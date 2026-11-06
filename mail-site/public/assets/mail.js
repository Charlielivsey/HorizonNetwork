'use strict';
// HN Mail in the browser. Everything comes from HN Mail's own /api (which talks to Gmail on the server); email bodies
// are shown in sandboxed frames served by /api/messages/<id>/body, never added to this page.
(() => {
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); } for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); return el; };
  const svg = (d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); for (const p of d.split('|')) { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', p); s.append(path); } return s; };
  const ICON = { star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z', archive: 'M4 7h16v3H4z|M6 10v9h12v-9|M10 14h4', trash: 'M5 7h14|M10 7V5h4v2|M7 7l1 12h8l1-12', read: 'M4 9l8 5 8-5|M4 9v10h16V9l-8-5z', unread: 'M4 6h16v12H4z|M4 6l8 7 8-7',
    back: 'm15 6-6 6 6 6', reply: 'M10 8 5 12l5 4|M5 12h9a5 5 0 0 1 5 5v1', replyAll: 'M9 8 4 12l5 4|M13 8l-4 4 4 4|M9 12h6a5 5 0 0 1 5 5v1', forward: 'M14 8l5 4-5 4|M19 12h-9a5 5 0 0 0-5 5v1', clip: 'm20 11-8 8a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7',
    spam: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z|M12 8v5|M12 16h.01', label: 'M3 12V4h8l10 10-8 8z|M7.5 7.5h.01', restore: 'M4 12a8 8 0 1 0 2.3-5.6|M4 4v5h5', more: 'M12 6h.01|M12 12h.01|M12 18h.01', edit: 'M4 20h4L19 9l-4-4L4 16v4z', inbox: 'M4 13h4l2 3h4l2-3h4|M4 13l2-8h12l2 8v6H4z',
    sent: 'M4 12 20 4l-6 16-3-7z', draft: 'M6 3h9l4 4v14H6z|M14 3v5h5', all: 'M4 6h16|M4 12h16|M4 18h16', important: 'M4 6h12l4 6-4 6H4l4-6z', down: 'm6 9 6 6 6-6' };
  const PALETTE = ['#5514B4', '#3E9BA3', '#7A1F6C', '#C2306B', '#5FAE7B', '#7B52C4', '#1C2135', '#E97DE8'];
  const FOLDERS = [['INBOX', 'Inbox', 'inbox'], ['STARRED', 'Starred', 'star'], ['IMPORTANT', 'Important', 'important'], ['SENT', 'Sent', 'sent'], ['DRAFT', 'Drafts', 'draft'], ['ALL', 'All mail', 'all'], ['SPAM', 'Spam', 'spam'], ['TRASH', 'Bin', 'trash']];
  const app = $('#app');
  let session = null, labels = [], view = { label: 'INBOX', q: '', thread: null }, pages = [null], pageIndex = 0, list = [], selected = new Set(), current = null, refreshing = false;

  // ---------- Helpers ----------
  function toast(text, { error = false, action, onAction, ms = 4200 } = {}) {
    const t = $('#toast'); $('#toast-text').textContent = text; t.classList.toggle('error', error);
    const b = $('#toast-action'); b.hidden = !action; b.textContent = action || ''; b.onclick = () => { t.hidden = true; onAction && onAction(); };
    t.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, ms);
  }
  async function api(method, path, body) {
    let r;
    try { r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); }
    catch { throw new Error('HN Mail couldn’t be reached. Check your connection.'); }
    const value = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = '/auth/login?next=/'; throw new Error('Please sign in again.'); }
    if (value.code === 'connect') { showConnect(value.error); throw Object.assign(new Error(value.error), { handled: true }); }
    if (value.code === 'no-google') { location.reload(); throw new Error(value.error); }
    if (!r.ok) throw new Error(value.error || 'Something went wrong. Please try again.');
    return value;
  }
  const report = (e) => { if (!e.handled) toast(e.message, { error: true }); };
  const nameOf = (from) => { const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(from || ''); return m ? (m[1].trim() || m[2]) : String(from || '').trim(); };
  const emailOf = (from) => { const m = /<([^>]+)>/.exec(from || ''); return (m ? m[1] : String(from || '')).trim().toLowerCase(); };
  const initials = (name) => (String(name).replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || '?').toUpperCase();
  const colour = (s) => { let n = 0; for (const c of String(s)) n = (n * 31 + c.codePointAt(0)) >>> 0; return PALETTE[n % PALETTE.length]; };
  const mine = (from) => session && session.gmail.sender && emailOf(from) === session.gmail.sender.email;
  function avatar(from) {
    if (mine(from)) return h('img', { class: 'avatar', src: '/api/avatar', alt: '' });
    const el = h('span', { class: 'avatar', 'aria-hidden': 'true', text: initials(nameOf(from)) }); el.style.background = colour(emailOf(from)); return el;
  }
  function when(ms, long = false) {
    const d = new Date(ms), now = new Date();
    if (long) return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric', hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: '2-digit' });
  }
  const size = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function confirmBox(title, text, ok = 'OK') { const d = $('#confirm'); $('#confirm-title').textContent = title; $('#confirm-text').textContent = text; $('#confirm-ok').textContent = ok; d.showModal(); return new Promise((res) => d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true })); }
  // Only plain formatting from HTML we didn't write (Gmail signatures, saved drafts) goes into the editor.
  const KEEP = new Set(['P', 'BR', 'DIV', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'A', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'PRE', 'CODE', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'IMG', 'FONT', 'SMALL', 'SUB', 'SUP']);
  function sanitize(html) {
    const doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
    (function walk(node) {
      for (const el of [...node.children]) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'META', 'LINK', 'SVG', 'MATH', 'TEMPLATE'].includes(el.tagName)) { el.remove(); continue; }
        walk(el);
        if (!KEEP.has(el.tagName)) { el.replaceWith(...el.childNodes); continue; }
        for (const a of [...el.attributes]) {
          const n = a.name.toLowerCase(), v = a.value.trim();
          const ok = (n === 'href' && el.tagName === 'A' && /^(https?:|mailto:)/i.test(v)) || (n === 'src' && el.tagName === 'IMG' && /^(https:|data:image\/(png|jpe?g|gif|webp);)/i.test(v)) || ['alt', 'title', 'colspan', 'rowspan'].includes(n);
          if (!ok) el.removeAttribute(a.name);
        }
        if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      }
    })(doc.body);
    return doc.body.innerHTML;
  }

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
    $('#search-input').value = view.q;
    app.classList.toggle('reading', !!view.thread);
    app.classList.remove('side-open'); $('#menu-btn').setAttribute('aria-expanded', 'false');
    drawFolders();
    if (listChanged) { pages = [null]; pageIndex = 0; selected.clear(); await loadList(); } else markActive();
    if (view.thread) openThread(view.thread); else { current = null; emptyReader(); }
  }

  // ---------- Folders and labels ----------
  function drawFolders() {
    const byId = Object.fromEntries(labels.map((l) => [l.id, l]));
    const link = (id, name, icon, count, dot) => h('a', { class: 'folder', href: '#' + encodeURIComponent(id), 'aria-current': !view.q && view.label === id ? 'page' : null },
      dot ? (() => { const s = h('span', { class: 'dot' }); if (dot.background) s.style.background = dot.background; return s; })() : svg(ICON[icon]), h('span', { text: name }), count ? h('span', { class: 'count', text: count > 999 ? '999+' : count }) : null);
    $('#folders').replaceChildren(...FOLDERS.map(([id, name, icon]) => link(id, name, icon, id === 'INBOX' || id === 'SPAM' ? (byId[id] || {}).unread : id === 'DRAFT' ? (byId[id] || {}).drafts : 0)));
    const user = labels.filter((l) => !l.system && !/^CATEGORY_/.test(l.id)).sort((a, b) => a.name.localeCompare(b.name));
    $('#labels-heading').hidden = !user.length;
    $('#labels').replaceChildren(...user.map((l) => link(l.id, l.name, null, l.unread, l.color || { background: null })));
    const inbox = byId.INBOX;
    document.title = (inbox && inbox.unread ? '(' + inbox.unread + ') ' : '') + 'HN Mail · HN Group';
  }
  async function loadLabels() { try { labels = (await api('GET', '/api/labels')).labels; drawFolders(); } catch (e) { report(e); } }
  const titleFor = () => (view.q ? 'Results for “' + view.q + '”' : (FOLDERS.find((f) => f[0] === view.label) || [])[1] || (labels.find((l) => l.id === view.label) || {}).name || 'Mail');

  // ---------- Conversation list ----------
  async function loadList(quiet = false) {
    const ul = $('#threads');
    $('#list-title').textContent = titleFor();
    if (!quiet) { ul.replaceChildren(...Array.from({ length: 8 }, () => h('li', { class: 'skeleton', 'aria-hidden': 'true' }))); $('#list-count').textContent = ''; }
    const q = new URLSearchParams();
    if (view.q) q.set('q', view.q); else if (view.label !== 'ALL') q.set('label', view.label);
    if (pages[pageIndex]) q.set('page', pages[pageIndex]);
    try {
      const r = await api('GET', '/api/threads?' + q);
      list = r.threads; pages[pageIndex + 1] = r.next;
      $('#prev-page').disabled = pageIndex === 0; $('#next-page').disabled = !r.next;
      $('#list-count').textContent = list.length ? (pageIndex * 25 + 1) + '–' + (pageIndex * 25 + list.length) + (r.next ? ' of ' + (r.estimate > pageIndex * 25 + list.length ? 'about ' + r.estimate : 'many') : '') : '';
      drawList();
    } catch (e) { if (!quiet) ul.replaceChildren(h('li', { class: 'list-empty', text: e.handled ? '' : e.message })); report(e); }
    app.setAttribute('aria-busy', 'false');
  }
  function drawList() {
    const ul = $('#threads');
    for (const id of [...selected]) if (!list.some((t) => t.id === id)) selected.delete(id);
    if (!list.length) { ul.replaceChildren(h('li', { class: 'list-empty', text: view.q ? 'No messages match your search.' : view.label === 'INBOX' ? 'Your inbox is empty. Nice.' : 'Nothing here.' })); updateBulk(); return; }
    ul.replaceChildren(...list.map(row));
    updateBulk(); markActive();
  }
  function row(t) {
    const li = h('li', { class: 'thread' + (t.unread ? ' unread' : '') + (selected.has(t.id) ? ' selected' : ''), 'data-id': t.id, tabindex: '0', role: 'link', 'aria-label': (t.unread ? 'Unread. ' : '') + (t.from.join(', ') || '') + '. ' + t.subject });
    const box = h('input', { type: 'checkbox', 'aria-label': 'Select', checked: selected.has(t.id) ? true : null });
    box.addEventListener('click', (e) => { e.stopPropagation(); if (box.checked) selected.add(t.id); else selected.delete(t.id); li.classList.toggle('selected', box.checked); updateBulk(); });
    const star = h('button', { class: 'icon-btn star', type: 'button', 'aria-pressed': t.starred ? 'true' : 'false', 'aria-label': t.starred ? 'Starred' : 'Not starred', title: t.starred ? 'Starred' : 'Not starred' }, svg(ICON.star));
    star.addEventListener('click', (e) => { e.stopPropagation(); setStar(t, !t.starred); });
    const sender = view.label === 'SENT' ? 'To: ' + nameOf(t.to) : t.from.join(', ') || '(unknown)';
    li.append(h('label', { class: 'row-check', onclick: (e) => e.stopPropagation() }, box, h('span')), star,
      h('div', { class: 'lines' }, h('div', { class: 'who' }, t.draft ? h('span', { class: 'tag-draft', text: 'Draft' }) : null, h('b', { text: sender }), t.count > 1 ? h('span', { class: 'n', text: t.count }) : null),
        h('div', { class: 'subj' }, h('span', { text: t.subject }), h('span', { class: 'snip', text: t.snippet ? ' — ' + t.snippet : '' }))),
      h('div', { class: 'meta' }, h('time', { datetime: new Date(t.date).toISOString(), text: when(t.date) }), t.attachments ? svg(ICON.clip) : null),
      h('div', { class: 'row-actions' }, ...rowActions(t)));
    li.addEventListener('click', () => go({ thread: t.id }));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go({ thread: t.id }); });
    return li;
  }
  function rowActions(t) {
    const b = (icon, label, fn) => h('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onclick: (e) => { e.stopPropagation(); fn(); } }, svg(ICON[icon]));
    const out = [];
    if (view.label === 'TRASH') out.push(b('restore', 'Move to inbox', () => act([t.id], 'untrash')));
    else { if (t.labels.includes('INBOX')) out.push(b('archive', 'Archive', () => act([t.id], 'archive'))); out.push(b('trash', 'Delete', () => act([t.id], 'trash'))); }
    out.push(t.unread ? b('read', 'Mark as read', () => act([t.id], 'read')) : b('unread', 'Mark as unread', () => act([t.id], 'unread')));
    return out;
  }
  function markActive() { for (const li of $$('.thread')) li.classList.toggle('active', li.dataset.id === view.thread); }
  function updateBulk() { $('#bulk').hidden = !selected.size; $('#list-title').hidden = !!selected.size; const all = $('#select-all'); all.checked = !!list.length && selected.size === list.length; all.indeterminate = selected.size > 0 && selected.size < list.length; }
  async function setStar(t, on) {
    t.starred = on; drawList();
    try { await api('POST', '/api/threads/' + t.id + '/modify', on ? { add: ['STARRED'] } : { remove: ['STARRED'] }); if (current && current.id === t.id) openThread(t.id, true); }
    catch (e) { t.starred = !on; drawList(); report(e); }
  }
  // Archive, delete, restore, read/unread, spam, for one or several conversations. Leaving the folder takes them off
  // the list straight away, with Undo where Gmail allows it.
  async function act(ids, what, { undo = true } = {}) {
    const body = { archive: { remove: ['INBOX'] }, read: { remove: ['UNREAD'] }, unread: { add: ['UNREAD'] }, spam: { add: ['SPAM'], remove: ['INBOX'] }, notspam: { add: ['INBOX'], remove: ['SPAM'] }, inbox: { add: ['INBOX'] } }[what];
    const leaves = ['archive', 'trash', 'untrash', 'spam', 'notspam'].includes(what) && !(what === 'archive' && view.label !== 'INBOX');
    const before = list.slice();
    if (leaves) { list = list.filter((t) => !ids.includes(t.id)); for (const id of ids) selected.delete(id); }
    else for (const t of list) if (ids.includes(t.id)) { if (what === 'read') t.unread = false; if (what === 'unread') t.unread = true; }
    drawList();
    if (leaves && ids.includes(view.thread)) go({ thread: null });
    try {
      await Promise.all(ids.map((id) => body ? api('POST', '/api/threads/' + id + '/modify', body) : api('POST', '/api/threads/' + id + '/' + what)));
      const n = ids.length > 1 ? ids.length + ' conversations' : 'Conversation';
      const said = { archive: n + ' archived.', trash: n + ' moved to the bin.', untrash: n + ' moved to the inbox.', spam: n + ' reported as spam.', notspam: n + ' moved to the inbox.', read: 'Marked as read.', unread: 'Marked as unread.' }[what];
      const reverse = { archive: 'inbox', trash: 'untrash', untrash: 'trash', spam: 'notspam', read: 'unread', unread: 'read' }[what];
      if (said) toast(said, undo && reverse ? { action: 'Undo', onAction: () => act(ids, reverse, { undo: false }).then(() => loadList(true)) } : {});
      loadLabels();
    } catch (e) { list = before; drawList(); report(e); }
  }

  // ---------- Reading a conversation ----------
  function emptyReader() { $('#reader').replaceChildren(h('div', { class: 'reader-empty' }, svg(ICON.unread), h('p', { text: list.length ? 'Choose a conversation to read it.' : 'Nothing selected.' }))); markActive(); }
  async function openThread(id, quiet = false) {
    const reader = $('#reader');
    if (!quiet) reader.replaceChildren(h('div', { class: 'reader-empty' }, h('p', { text: 'Opening…' })));
    markActive();
    let t;
    try { t = await api('GET', '/api/threads/' + id); } catch (e) { if (view.thread === id) reader.replaceChildren(h('div', { class: 'reader-empty' }, h('p', { text: e.handled ? '' : e.message }))); report(e); return; }
    if (view.thread !== id) return;
    current = t;
    const summary = list.find((x) => x.id === id);
    if (t.labels.includes('UNREAD')) { api('POST', '/api/threads/' + id + '/modify', { remove: ['UNREAD'] }).then(loadLabels).catch(() => {}); if (summary) { summary.unread = false; drawList(); } }
    const last = t.messages[t.messages.length - 1], subject = t.messages[0].subject || '(no subject)';
    const inTrash = t.labels.includes('TRASH'), inSpam = t.labels.includes('SPAM'), starred = t.labels.includes('STARRED');
    const tool = (icon, label, fn, extra = {}) => h('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onclick: fn, ...extra }, svg(ICON[icon]));
    const bar = h('div', { class: 'reader-bar' },
      tool('back', 'Back to the list', () => go({ thread: null }), { class: 'icon-btn back' }),
      inTrash ? tool('restore', 'Move to inbox', () => act([id], 'untrash')) : null,
      !inTrash && t.labels.includes('INBOX') ? tool('archive', 'Archive (e)', () => act([id], 'archive')) : null,
      !inTrash && !t.labels.includes('INBOX') && !inSpam ? tool('inbox', 'Move to inbox', () => act([id], 'inbox')) : null,
      inSpam ? tool('inbox', 'Not spam', () => act([id], 'notspam')) : tool('spam', 'Report spam', () => act([id], 'spam')),
      !inTrash ? tool('trash', 'Delete (#)', () => act([id], 'trash')) : null,
      tool('unread', 'Mark as unread', () => { act([id], 'unread'); go({ thread: null }); }),
      tool('label', 'Labels', (e) => labelMenu(e.currentTarget, t)),
      h('span', { class: 'spacer' }),
      h('button', { class: 'icon-btn star', type: 'button', 'aria-pressed': starred ? 'true' : 'false', title: starred ? 'Starred' : 'Star', 'aria-label': starred ? 'Starred' : 'Star', onclick: () => setStar(summary || { id, starred }, !starred) }, svg(ICON.star)));
    const chips = t.labels.map((lid) => labels.find((l) => l.id === lid)).filter((l) => l && !l.system && !/^CATEGORY_/.test(l.id)).map((l) => h('span', { class: 'chip' }, l.name, h('button', { type: 'button', 'aria-label': 'Remove label ' + l.name, title: 'Remove label', onclick: () => relabel(t, l.id, false) }, '×')));
    const msgs = h('div', { class: 'messages' }, ...t.messages.map((m, i) => message(m, i === t.messages.length - 1 || m.unread || (t.messages.length <= 3))));
    const replyable = [...t.messages].reverse().find((m) => !m.draft) || last;
    reader.replaceChildren(bar, h('div', { class: 'reader-head' }, h('h1', { text: subject }), chips.length ? h('div', { class: 'chips' }, ...chips) : null), msgs,
      h('div', { class: 'reply-row' }, h('button', { class: 'btn btn-outline', type: 'button', onclick: () => reply(replyable, 'reply') }, svg(ICON.reply), 'Reply'),
        h('button', { class: 'btn btn-outline', type: 'button', onclick: () => reply(replyable, 'all') }, svg(ICON.replyAll), 'Reply all'),
        h('button', { class: 'btn btn-outline', type: 'button', onclick: () => reply(replyable, 'forward') }, svg(ICON.forward), 'Forward')));
    if (!quiet) reader.scrollTop = 0;
    const lastOpen = $$('.msg.open', msgs).pop(); if (lastOpen && t.messages.length > 1 && !quiet) setTimeout(() => lastOpen.scrollIntoView({ block: 'nearest' }), 60);
  }
  function message(m, open) {
    const el = h('article', { class: 'msg' + (open ? ' open' : ''), 'data-id': m.id });
    const to = [m.to && 'to ' + m.to.split(',').map(nameOf).join(', '), m.cc && 'cc ' + m.cc.split(',').map(nameOf).join(', ')].filter(Boolean).join(' · ');
    const head = h('div', { class: 'msg-head' }, avatar(m.from), h('div', { class: 'msg-from' }, h('b', { text: nameOf(m.from) || '(unknown)' }), ' ', h('span', { class: 'msg-addr', text: '<' + emailOf(m.from) + '>' }),
      h('span', { class: open ? 'to' : 'msg-snippet', text: open ? to : m.snippet })),
      h('div', { class: 'msg-when' }, h('time', { datetime: new Date(m.date).toISOString(), text: when(m.date, open) }), open && !m.draft ? h('button', { class: 'icon-btn', type: 'button', title: 'Reply', 'aria-label': 'Reply', onclick: (e) => { e.stopPropagation(); reply(m, 'reply'); } }, svg(ICON.reply)) : null,
        open && !m.draft ? h('button', { class: 'icon-btn', type: 'button', title: 'More', 'aria-label': 'More actions for this message', onclick: (e) => { e.stopPropagation(); messageMenu(e.currentTarget, m); } }, svg(ICON.more)) : null));
    el.append(head);
    if (open) el.append(...body(m));
    head.addEventListener('click', () => { if (el.classList.contains('open')) return; el.classList.add('open'); el.replaceWith(message(m, true)); });
    return el;
  }
  function body(m) {
    if (m.draft) return [h('div', { class: 'draft-note' }, 'Draft', h('button', { class: 'btn btn-small btn-primary', type: 'button', onclick: () => openDraft(m.id) }, svg(ICON.edit), 'Edit draft'))];
    const wrap = h('div', { class: 'msg-body' });
    const frame = h('iframe', { class: 'msg-frame', title: 'Message from ' + nameOf(m.from), sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox', referrerpolicy: 'no-referrer', loading: 'lazy', src: '/api/messages/' + m.id + '/body' });
    if (m.remoteImages) {
      const note = h('p', { class: 'images-note' }, 'Pictures from the web are hidden to protect your privacy.', h('button', { class: 'link-btn', type: 'button', onclick: () => { frame.src = '/api/messages/' + m.id + '/body?images=1'; note.remove(); } }, 'Show images'));
      wrap.append(note);
    }
    wrap.append(frame);
    if (m.attachments.length) wrap.append(h('ul', { class: 'files' }, ...m.attachments.map((a) => h('li', {}, h('a', { class: 'file', href: '/api/messages/' + m.id + '/parts/' + a.partId, download: a.name, title: 'Download ' + a.name }, svg(ICON.clip), h('span', { text: a.name }), h('small', { text: size(a.size) }))))));
    return [wrap];
  }
  // Email frames tell us their height (they can't touch this page).
  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data.hnMailHeight !== 'number') return;
    for (const f of $$('.msg-frame')) if (f.contentWindow === e.source) f.style.height = Math.min(Math.max(e.data.hnMailHeight + 6, 60), 40000) + 'px';
  });
  function popMenu(anchor, items) {
    closePop();
    const pop = h('div', { class: 'pop', role: 'menu' }, ...items);
    document.body.append(pop);
    const r = anchor.getBoundingClientRect(), w = Math.max(pop.offsetWidth, 220);
    pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
    pop.style.top = (innerHeight - r.bottom > pop.offsetHeight + 12 ? r.bottom + 6 : Math.max(8, r.top - pop.offsetHeight - 6)) + 'px';
    setTimeout(() => document.addEventListener('click', closePop, { once: true }), 0);
    pop.addEventListener('click', (e) => e.stopPropagation());
    const first = pop.querySelector('button, input'); if (first) first.focus();
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePop(); anchor.focus(); } });
  }
  function closePop() { for (const p of $$('.pop')) p.remove(); }
  function messageMenu(anchor, m) {
    const item = (label, fn) => h('button', { type: 'button', role: 'menuitem', onclick: () => { closePop(); fn(); } }, label);
    popMenu(anchor, [item('Reply all', () => reply(m, 'all')), item('Forward', () => reply(m, 'forward')), item(m.unread ? 'Mark as read' : 'Mark as unread from here', () => api('POST', '/api/messages/' + m.id + '/modify', { add: ['UNREAD'] }).then(() => { toast('Marked as unread.'); go({ thread: null }); loadList(true); loadLabels(); }).catch(report))]);
  }
  function labelMenu(anchor, t) {
    const user = labels.filter((l) => !l.system && !/^CATEGORY_/.test(l.id)).sort((a, b) => a.name.localeCompare(b.name));
    if (!user.length) return popMenu(anchor, [h('p', { class: 'muted', text: 'You have no labels yet. Make them in Gmail and they’ll appear here.' })]);
    popMenu(anchor, user.map((l) => { const box = h('input', { type: 'checkbox', checked: t.labels.includes(l.id) ? true : null }); box.addEventListener('change', () => relabel(t, l.id, box.checked)); return h('label', {}, box, l.name); }));
  }
  async function relabel(t, id, on) {
    try { await api('POST', '/api/threads/' + t.id + '/modify', on ? { add: [id] } : { remove: [id] }); toast(on ? 'Label added.' : 'Label removed.'); openThread(t.id, true); loadList(true); loadLabels(); } catch (e) { report(e); }
  }

  // ---------- Writing ----------
  const C = { open: false, draftId: null, threadId: null, inReplyTo: '', references: '', files: [], include: [], dirty: false, saving: null, timer: null };
  const editor = $('#c-editor');
  function signature() { const s = session && session.gmail.sender && session.gmail.sender.signature; return s ? '<br><br><div class="signature">-- <br>' + sanitize(s) + '</div>' : ''; }
  function openComposer(fill = {}) {
    if (C.open && C.dirty) saveDraft(); // what was being written is kept as a draft first
    Object.assign(C, { open: true, draftId: fill.draftId || null, threadId: fill.threadId || null, inReplyTo: fill.inReplyTo || '', references: fill.references || '', files: [], include: fill.include || [], dirty: false });
    $('#c-to').value = fill.to || ''; $('#c-cc').value = fill.cc || ''; $('#c-bcc').value = fill.bcc || ''; $('#c-subject').value = fill.subject || '';
    $('#c-cc-row').hidden = !fill.cc; $('#c-bcc-row').hidden = !fill.bcc; $('#c-show-cc').hidden = !!(fill.cc && fill.bcc);
    editor.innerHTML = fill.html != null ? fill.html : signature();
    $('#composer-title').textContent = fill.title || 'New message';
    $('#composer-state').textContent = ''; $('#c-error').hidden = true;
    const box = $('#composer'); box.hidden = false; box.classList.remove('min');
    drawFiles();
    setTimeout(() => (fill.focus === 'editor' ? placeCaretStart(editor) : $('#c-to').value ? $('#c-subject').value ? placeCaretStart(editor) : $('#c-subject').focus() : $('#c-to').focus()), 30);
  }
  function placeCaretStart(el) { el.focus(); const r = document.createRange(); r.setStart(el, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  function quoteBlock(m) {
    const text = esc(m.text || m.snippet || '').replace(/\n/g, '<br>');
    return '<br><br><div>On ' + esc(when(m.date, true)) + ', ' + esc(m.from) + ' wrote:</div><blockquote>' + text + '</blockquote>';
  }
  function reply(m, how) {
    const self = session.gmail.sender.email, subject = m.subject || '';
    if (how === 'forward') {
      const header = '<br><br><div>---------- Forwarded message ----------<br>From: ' + esc(m.from) + '<br>Date: ' + esc(when(m.date, true)) + '<br>Subject: ' + esc(subject) + '<br>To: ' + esc(m.to) + (m.cc ? '<br>Cc: ' + esc(m.cc) : '') + '</div><br>' + esc(m.text || m.snippet || '').replace(/\n/g, '<br>');
      return openComposer({ title: 'Forward', subject: /^fwd?:/i.test(subject) ? subject : 'Fwd: ' + subject, html: signature() + header, include: m.attachments.map((a) => ({ messageId: m.id, partId: a.partId, name: a.name, size: a.size })) });
    }
    const replyTo = m.replyTo || m.from;
    let to = mine(m.from) ? m.to : replyTo, cc = '';
    if (how === 'all') {
      const seen = new Set([self, ...to.split(',').map(emailOf)]);
      const others = [...(mine(m.from) ? [] : m.to.split(',')), ...m.cc.split(',')].map((x) => x.trim()).filter((x) => x && !seen.has(emailOf(x)) && (seen.add(emailOf(x)), true));
      cc = others.join(', ');
    }
    openComposer({ title: how === 'all' ? 'Reply all' : 'Reply', to, cc, subject: /^re:/i.test(subject) ? subject : 'Re: ' + subject, html: signature() + quoteBlock(m), threadId: m.threadId, inReplyTo: m.messageId, references: [m.references, m.messageId].filter(Boolean).join(' '), focus: 'editor' });
  }
  async function openDraft(messageId) {
    try {
      const d = await api('GET', '/api/drafts/for/' + messageId);
      openComposer({ title: 'Draft', draftId: d.draftId, threadId: d.threadId, to: d.to, cc: d.cc, bcc: d.bcc, subject: d.subject, inReplyTo: d.inReplyTo, references: d.references, html: sanitize(d.html), include: d.attachments.map((a) => ({ messageId: d.messageId, partId: a.partId, name: a.name, size: a.size })), force: true });
    } catch (e) { report(e); }
  }
  function drawFiles() {
    const items = [...C.include.map((f, i) => ({ name: f.name, size: f.size, remove: () => { C.include.splice(i, 1); changed(); drawFiles(); } })), ...C.files.map((f, i) => ({ name: f.name, size: f.size, remove: () => { C.files.splice(i, 1); changed(); drawFiles(); } }))];
    $('#c-files').replaceChildren(...items.map((f) => h('li', {}, svg(ICON.clip), h('span', { text: f.name }), h('small', { class: 'muted', text: size(f.size) }), h('button', { type: 'button', 'aria-label': 'Remove ' + f.name, title: 'Remove', onclick: f.remove }, '×'))));
  }
  const readFile = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('That file couldn’t be read.')); r.readAsDataURL(file); });
  function addFiles(files) {
    const total = () => [...C.files, ...C.include].reduce((n, f) => n + (f.size || 0), 0);
    for (const f of files) {
      if (total() + f.size > 25 * 1024 * 1024) { toast('Attachments can be 25 MB at most in all. “' + f.name + '” wasn’t added.', { error: true }); continue; }
      C.files.push(f);
    }
    changed(); drawFiles();
  }
  async function payload() {
    return { to: $('#c-to').value, cc: $('#c-cc').value, bcc: $('#c-bcc').value, subject: $('#c-subject').value, html: editor.innerHTML, threadId: C.threadId, inReplyTo: C.inReplyTo, references: C.references,
      draftId: C.draftId, include: C.include.map(({ messageId, partId }) => ({ messageId, partId })), attachments: await Promise.all(C.files.map(async (f) => ({ name: f.name, type: f.type, data: await readFile(f) }))) };
  }
  function changed() { if (!C.open) return; C.dirty = true; $('#composer-state').textContent = ''; clearTimeout(C.timer); C.timer = setTimeout(saveDraft, 4000); }
  async function saveDraft() {
    clearTimeout(C.timer);
    if (!C.open || !C.dirty) return C.saving;
    const empty = !$('#c-to').value.trim() && !$('#c-subject').value.trim() && !editor.textContent.trim() && !C.files.length;
    if (empty && !C.draftId) return null;
    C.dirty = false; $('#composer-state').textContent = 'Saving…';
    C.saving = (async () => {
      try { const r = await api('POST', '/api/drafts', await payload()); C.draftId = r.draftId; $('#composer-state').textContent = 'Draft saved'; return r; }
      catch (e) { C.dirty = true; $('#composer-state').textContent = 'Not saved'; report(e); return null; }
    })();
    return C.saving;
  }
  function closeComposer() { C.open = false; clearTimeout(C.timer); $('#composer').hidden = true; $('#composer').classList.remove('max'); }
  $('#composer-form').addEventListener('input', changed);
  $('#c-attach').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
  editor.addEventListener('paste', (e) => {
    // Pasted text keeps simple formatting only.
    const html = e.clipboardData.getData('text/html');
    if (html) { e.preventDefault(); document.execCommand('insertHTML', false, sanitize(html)); }
  });
  for (const zone of [$('#composer')]) {
    zone.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    zone.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });
  }
  $('#c-show-cc').addEventListener('click', () => { $('#c-cc-row').hidden = false; $('#c-bcc-row').hidden = false; $('#c-show-cc').hidden = true; $('#c-cc').focus(); });
  for (const b of $$('.format-bar button')) b.addEventListener('mousedown', (e) => e.preventDefault());
  for (const b of $$('.format-bar button')) b.addEventListener('click', () => {
    const cmd = b.dataset.cmd;
    if (cmd === 'createLink') return insertLink();
    editor.focus(); document.execCommand(cmd, false, b.dataset.value || null); changed();
  });
  function insertLink() {
    const sel = getSelection(), range = sel.rangeCount && editor.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    const d = $('#link-dialog'); $('#link-text').value = range ? range.toString() : ''; $('#link-url').value = ''; d.showModal();
    d.addEventListener('close', () => {
      if (d.returnValue !== 'ok') return;
      let url = $('#link-url').value.trim(); if (!/^(https?:|mailto:)/i.test(url)) url = 'https://' + url;
      editor.focus(); if (range) { sel.removeAllRanges(); sel.addRange(range); }
      document.execCommand('insertHTML', false, '<a href="' + esc(url) + '">' + esc($('#link-text').value.trim() || url) + '</a>'); changed();
    }, { once: true });
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
      closeComposer(); toast('Message sent.');
      if (current) openThread(current.id, true);
      loadList(true); loadLabels();
    } catch (e2) { if (!e2.handled) { err.textContent = e2.message; err.hidden = false; } }
    finally { send.disabled = false; send.textContent = 'Send'; }
  });
  $('#composer-close').addEventListener('click', async () => { const p = saveDraft(); closeComposer(); const r = await p; if (r) { toast('Draft saved.'); loadList(true); loadLabels(); } });
  $('#composer-min').addEventListener('click', () => $('#composer').classList.toggle('min'));
  $('#composer-max').addEventListener('click', () => $('#composer').classList.toggle('max'));
  $('.composer-head').addEventListener('dblclick', () => $('#composer').classList.toggle('min'));
  $('#c-discard').addEventListener('click', async () => {
    const id = C.draftId; clearTimeout(C.timer); C.dirty = false; closeComposer();
    if (C.saving) await C.saving.catch(() => {});
    if (id || C.draftId) { try { await api('DELETE', '/api/drafts/' + (C.draftId || id)); } catch (e) { report(e); } }
    toast('Draft discarded.'); loadList(true); loadLabels();
  });
  window.addEventListener('beforeunload', (e) => { if (C.open && C.dirty) { saveDraft(); e.preventDefault(); e.returnValue = ''; } });

  // ---------- Connect Gmail ----------
  function showConnect(reason) {
    app.classList.add('connecting'); app.setAttribute('aria-busy', 'false');
    const g = (session && session.gmail) || {}, linked = g.linkedEmail || '';
    const card = h('div', { class: 'connect-card' },
      h('div', { class: 'steps-mini', 'aria-hidden': 'true' }, ...[['#E97DE8', 28], ['#5514B4', 28], ['#E3E65B', 12], ['#3E9BA3', 40], ['#7A1F6C', 20], ['#C2306B', 20], ['#5FAE7B', 26], ['#3A4166', 26]].map(([c, w]) => { const s = h('span'); s.style.background = c; s.style.width = w + 'px'; return s; })),
      h('p', { class: 'eyebrow', text: 'HN MAIL' }), h('h1', { text: 'Connect your Gmail' }),
      reason ? h('p', { class: 'form-error', text: reason }) : null,
      h('p', { class: 'lead', text: 'HN Mail shows your Gmail with HN Group’s look. Google will ask you once to allow it.' }),
      h('ul', {}, h('li', { text: 'Only the Google account linked to your HN Group Auth account can be used' + (linked ? ': ' + linked + '.' : '.') }), h('li', { text: 'Your mail stays in Gmail. HN Mail doesn’t keep copies of it.' }), h('li', { text: 'You can disconnect at any time here, or in your Google account.' })),
      g.configured === false ? h('p', { class: 'form-error', text: 'Google isn’t set up on this server yet, so Gmail can’t be connected. Ask the system owner.' })
        : h('a', { class: 'btn btn-primary', href: '/google/connect' }, 'Continue with Google'));
    $('#connect').replaceChildren(card); $('#connect').hidden = false;
  }

  // ---------- Wiring ----------
  $('#search').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#search-input').value.trim(); go(q ? { q, label: 'ALL', thread: null } : { q: '', label: 'INBOX', thread: null }); });
  $('#home-link').addEventListener('click', (e) => { e.preventDefault(); go({ q: '', label: 'INBOX', thread: null }); });
  $('#compose-btn').addEventListener('click', () => { app.classList.remove('side-open'); openComposer(); });
  $('#compose-fab').addEventListener('click', () => openComposer());
  $('#refresh').addEventListener('click', () => { loadList(); loadLabels(); });
  $('#prev-page').addEventListener('click', () => { if (pageIndex > 0) { pageIndex--; loadList(); } });
  $('#next-page').addEventListener('click', () => { if (pages[pageIndex + 1]) { pageIndex++; loadList(); } });
  $('#select-all').addEventListener('change', (e) => { selected = new Set(e.target.checked ? list.map((t) => t.id) : []); drawList(); });
  for (const b of $$('[data-bulk]')) b.addEventListener('click', () => act([...selected], b.dataset.bulk));
  $('#menu-btn').addEventListener('click', () => { const open = !app.classList.contains('side-open'); app.classList.toggle('side-open', open); $('#menu-btn').setAttribute('aria-expanded', String(open)); });
  document.addEventListener('click', (e) => { if (app.classList.contains('side-open') && !e.target.closest('#side, #menu-btn')) { app.classList.remove('side-open'); $('#menu-btn').setAttribute('aria-expanded', 'false'); } });
  $('#account-button').addEventListener('click', () => $('#account').showModal());
  for (const b of $$('[data-close]')) b.addEventListener('click', () => $('#' + b.dataset.close).close());
  $('#disconnect').addEventListener('click', async () => {
    if (!(await confirmBox('Disconnect Gmail?', 'HN Mail will stop showing your mail until you connect it again. Nothing is deleted from Gmail.', 'Disconnect'))) return;
    try { await api('POST', '/api/google/disconnect'); $('#account').close(); session.gmail.connected = false; showConnect(); } catch (e) { report(e); }
  });
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && C.open && $('#composer').contains(document.activeElement)) $('#composer-form').requestSubmit(); return; }
    const typing = e.target.closest('input, textarea, [contenteditable], select, dialog');
    if (e.key === 'Escape') { closePop(); if (C.open && $('#composer').contains(document.activeElement)) $('#composer-close').click(); return; }
    if (typing || app.classList.contains('connecting')) return;
    const idx = list.findIndex((t) => t.id === view.thread);
    const keys = { c: () => openComposer(), '/': () => $('#search-input').focus(), j: () => list[idx + 1] && go({ thread: list[idx + 1].id }), k: () => idx > 0 && go({ thread: list[idx - 1].id }), u: () => go({ thread: null }),
      e: () => view.thread && act([view.thread], 'archive'), '#': () => view.thread && act([view.thread], 'trash'), r: () => current && reply(current.messages[current.messages.length - 1], 'reply'), a: () => current && reply(current.messages[current.messages.length - 1], 'all'), f: () => current && reply(current.messages[current.messages.length - 1], 'forward'),
      s: () => { const t = list.find((x) => x.id === view.thread); if (t) setStar(t, !t.starred); } };
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
  });
  // New mail appears without a reload: the list and counts refresh every minute while the page is in view.
  setInterval(() => { if (document.visibilityState === 'visible' && session && session.gmail.connected && !app.classList.contains('connecting') && pageIndex === 0) { loadList(true); loadLabels(); } }, 60000);

  (async function start() {
    try { session = await api('GET', '/api/session'); } catch (e) { report(e); return; }
    $('#account-name').textContent = session.user.displayName || 'Your account';
    $('#account-title').textContent = session.user.displayName || '';
    $('#account-email').textContent = session.user.username || session.user.email || '';
    $('#account-gmail').textContent = session.gmail.connected ? 'Gmail: ' + session.gmail.email : 'Gmail isn’t connected yet.';
    $('#disconnect').hidden = !session.gmail.connected;
    if (!session.gmail.connected) return showConnect();
    await Promise.all([loadLabels(), route()]);
  })();
})();
