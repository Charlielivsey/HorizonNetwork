'use strict';
// HN Group Documents in the browser: the documents library (filtered by company, type and author), the templates for
// each company, starting a new document, and the page editor, which saves by itself as you type. Everything shown is
// built as elements (never from text the server didn't clean); document bodies are cleaned again on the server.
(() => {
  const $ = (id) => document.getElementById(id);
  const S = { me: null, companies: [], templates: [], counts: {}, filter: { company: '', template: '', q: '', mine: false }, doc: null };
  const company = (id) => S.companies.find((c) => c.id === id) || S.companies[0];
  const template = (id) => S.templates.find((t) => t.id === id) || S.templates[S.templates.length - 1];
  const logo = (c, white) => '/assets/brand/' + c.logo + (white ? '-white' : '') + '.svg';

  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  }
  async function api(method, path, body) {
    const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    if (r.status === 401) { location.href = '/auth/login?next=' + encodeURIComponent(location.pathname + location.search); throw new Error('Signed out'); }
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(v.error || 'Something went wrong. Please try again.'), { status: r.status });
    return v;
  }
  let toastTimer;
  function toast(text, bad) { const t = $('toast'); t.textContent = text; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200); }
  function ago(ms) {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).format(ms);
  }
  const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  // ---------- Dialogs (in the HN design; the safe choice has focus, Escape cancels) ----------
  const layer = $('layer');
  let closeAsk = null, lastFocus = null;
  function showLayer(which) { lastFocus = document.activeElement; layer.hidden = false; for (const id of ['new-dialog', 'ask']) $(id).hidden = id !== which; }
  function hideLayer() { layer.hidden = true; $('new-dialog').hidden = true; $('ask').hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function ask({ title, text, ok, danger, input }) {
    return new Promise((resolve) => {
      $('ask-title').textContent = title; $('ask-text').textContent = text || ''; $('ask-text').hidden = !text;
      $('ask-ok').textContent = ok; $('ask-ok').className = 'btn ' + (danger ? 'danger' : 'primary');
      $('ask-field').hidden = !input;
      if (input) { $('ask-field-label').textContent = input.label; $('ask-input').value = input.value || ''; $('ask-input').placeholder = input.placeholder || ''; }
      showLayer('ask');
      (input ? $('ask-input') : danger ? $('ask-cancel') : $('ask-ok')).focus();
      closeAsk = (v) => { closeAsk = null; hideLayer(); resolve(v); };
    });
  }
  $('ask-ok').addEventListener('click', () => closeAsk && closeAsk($('ask-field').hidden ? true : $('ask-input').value));
  $('ask-cancel').addEventListener('click', () => closeAsk && closeAsk(null));
  $('ask-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('ask-ok').click(); } });
  layer.addEventListener('mousedown', (e) => { if (e.target === layer) { if (closeAsk) closeAsk(null); else closeNew(); } });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (closeAsk) closeAsk(null); else if (!$('new-dialog').hidden) closeNew(); else closeMenu(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && S.doc) { e.preventDefault(); saveNow(); }
  });
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => closeNew());

  // ---------- Routing ----------
  function go(path, replace) { history[replace ? 'replaceState' : 'pushState']({}, '', path); route(); }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-link]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault(); go(a.getAttribute('href'));
  });
  window.addEventListener('popstate', () => route());
  async function route() {
    if (S.doc && (dirty || saving)) await saveNow();
    const p = location.pathname, m = /^\/doc\/([0-9a-f-]{36})$/.exec(p);
    for (const v of ['view-library', 'view-templates', 'view-editor']) $(v).hidden = true;
    for (const a of document.querySelectorAll('.tabs a')) a.removeAttribute('aria-current');
    if (m) return openDoc(m[1]);
    S.doc = null;
    const params = new URLSearchParams(location.search);
    S.filter.company = S.companies.some((c) => c.id === params.get('company')) ? params.get('company') : '';
    if (p === '/templates') { document.querySelector('[data-tab=templates]').setAttribute('aria-current', 'page'); return showTemplates(); }
    document.querySelector('[data-tab=library]').setAttribute('aria-current', 'page');
    showLibrary();
    if (p === '/new') openNew({ company: params.get('company'), template: params.get('template') });
  }

  // ---------- Company filter ----------
  function chips(container, selected, withAll, onPick) {
    const total = Object.values(S.counts).reduce((a, b) => a + b, 0);
    const chip = (id, label, mark, n) => el('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(selected === id), onclick: () => onPick(id) }, mark, el('span', { text: label }), n != null ? el('span', { class: 'n', text: String(n) }) : null);
    container.replaceChildren(
      ...(withAll ? [chip('', 'All companies', el('span', { class: 'all', 'aria-hidden': 'true' }), total)] : []),
      ...S.companies.map((c) => chip(c.id, c.name, el('img', { class: 'mark', src: logo(c), alt: '' }), withAll ? S.counts[c.id] || 0 : null)));
  }
  function setCompanyParam(id) {
    const params = new URLSearchParams(location.search);
    if (id) params.set('company', id); else params.delete('company');
    history.replaceState({}, '', location.pathname + (params.toString() ? '?' + params : ''));
    S.filter.company = id;
  }

  // ---------- Documents ----------
  function paper(c, t, title) {
    return el('div', { class: 'paper', 'aria-hidden': 'true' }, el('img', { src: logo(c), alt: '' }), t.label ? el('span', { class: 'p-label', text: t.label }) : null,
      el('p', { class: 'p-title', text: title }), el('div', { class: 'p-lines' }, el('i'), el('i'), el('i')));
  }
  let listTimer, listSeq = 0;
  async function showLibrary() {
    $('view-library').hidden = false;
    $('search').value = S.filter.q; $('type-filter').value = S.filter.template; $('mine-filter').checked = S.filter.mine;
    await loadDocuments();
  }
  async function loadDocuments() {
    const seq = ++listSeq, f = S.filter;
    const params = new URLSearchParams({ ...(f.company && { company: f.company }), ...(f.template && { template: f.template }), ...(f.q && { q: f.q }), ...(f.mine && { mine: '1' }) });
    let r;
    try { r = await api('GET', '/api/documents?' + params); } catch (e) { toast(e.message, true); return; }
    if (seq !== listSeq) return;
    S.counts = r.counts;
    chips($('library-companies'), f.company, true, (id) => { setCompanyParam(id); loadDocuments(); });
    const filtered = f.company || f.template || f.q || f.mine;
    $('library-count').textContent = r.documents.length === 1 ? '1 document' : r.documents.length + ' documents' + (filtered ? ' match' : '');
    $('doc-list').replaceChildren(...r.documents.map((d, i) => {
      const c = company(d.company), t = template(d.template);
      const card = el('a', { class: 'doc-card', href: '/doc/' + d.id, 'data-link': true, style: null },
        paper(c, t, d.title),
        el('div', { class: 'card-body' }, el('h3', { text: d.title }),
          el('div', { class: 'card-meta' }, el('span', { class: 'tag ' + d.status, text: d.status === 'final' ? 'Final' : 'Draft' }), d.sharing === 'private' ? el('span', { class: 'tag private', text: 'Only me' }) : null, el('span', { text: t.name + ' · ' + c.name })),
          el('div', { class: 'card-meta' }, el('span', { text: 'Edited ' + ago(d.updatedAt) + ' by ' + d.updatedBy }))));
      card.style.animationDelay = Math.min(i, 12) * 25 + 'ms';
      return card;
    }));
    $('doc-empty').hidden = r.documents.length > 0;
    $('doc-empty-text').textContent = filtered ? 'Nothing matches these filters. Try another company or search, or start a new document.' : 'Start one from a template: choose New document.';
  }
  $('search').addEventListener('input', () => { clearTimeout(listTimer); listTimer = setTimeout(() => { S.filter.q = $('search').value.trim(); loadDocuments(); }, 220); });
  $('type-filter').addEventListener('change', () => { S.filter.template = $('type-filter').value; loadDocuments(); });
  $('mine-filter').addEventListener('change', () => { S.filter.mine = $('mine-filter').checked; loadDocuments(); });

  // ---------- Templates ----------
  function showTemplates() {
    $('view-templates').hidden = false;
    chips($('template-companies'), S.filter.company, true, (id) => { setCompanyParam(id); showTemplates(); });
    const groups = S.filter.company ? [company(S.filter.company)] : S.companies;
    $('template-list').replaceChildren(...groups.map((c) => el('section', { class: 'template-group' },
      el('h2', {}, el('img', { src: logo(c), alt: '' }), c.name),
      el('div', { class: 'grid' }, ...S.templates.map((t) => el('button', { type: 'button', class: 'doc-card template-card', onclick: () => openNew({ company: c.id, template: t.id }) },
        paper(c, t, t.id === 'blank' ? '' : t.titleHint),
        el('div', { class: 'card-body' }, el('h3', { text: t.name }), el('p', { text: t.blurb }), el('span', { class: 'use', text: 'Use this template →' }))))))));
  }

  // ---------- New document ----------
  function openNew({ company: cid, template: tid } = {}) {
    const cSel = S.companies.some((c) => c.id === cid) ? cid : S.filter.company || S.companies[0].id;
    const tSel = S.templates.some((t) => t.id === tid) ? tid : 'letter';
    $('new-companies').replaceChildren(...S.companies.map((c) => el('label', { class: 'option' }, el('input', { type: 'radio', name: 'company', value: c.id, checked: c.id === cSel }),
      el('span', { class: 'logo' }, el('img', { src: logo(c), alt: '' })), el('strong', { text: c.name }))));
    $('new-templates').replaceChildren(...S.templates.map((t) => el('label', { class: 'option' }, el('input', { type: 'radio', name: 'template', value: t.id, checked: t.id === tSel }),
      el('strong', { text: t.name }), el('small', { text: t.blurb }))));
    $('new-name').value = ''; $('new-sharing').value = 'staff'; $('new-error').hidden = true; $('new-create').disabled = false;
    showLayer('new-dialog');
    $('new-dialog').querySelector('input[name=company]:checked').focus();
  }
  function closeNew() { if ($('new-dialog').hidden) return; hideLayer(); if (location.pathname === '/new') history.replaceState({}, '', '/'); }
  $('new-button').addEventListener('click', () => openNew({ company: S.filter.company }));
  document.addEventListener('click', (e) => { if (e.target.closest('[data-new]')) openNew({ company: S.filter.company }); });
  $('new-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData($('new-form'));
    $('new-create').disabled = true;
    try {
      const r = await api('POST', '/api/documents', { company: f.get('company'), template: f.get('template'), title: $('new-name').value, sharing: $('new-sharing').value });
      hideLayer(); go('/doc/' + r.document.id);
    } catch (err) { $('new-error').textContent = err.message; $('new-error').hidden = false; $('new-create').disabled = false; }
  });

  // ---------- Editor ----------
  let dirty = false, saving = false, again = false, saveTimer = null, retryTimer = null, patch = {};
  const sheet = $('sheet'), body = $('doc-body'), titleEl = $('doc-title');
  const printSheet = typeof CSSStyleSheet === 'function' && 'replaceSync' in CSSStyleSheet.prototype ? new CSSStyleSheet() : null;
  function state(text, bad) { $('save-state').textContent = text; $('save-state').className = 'save-state' + (bad ? ' bad' : ''); }
  async function openDoc(id) {
    $('view-editor').hidden = false;
    sheet.hidden = true; state('Opening…');
    let r;
    try { r = await api('GET', '/api/documents/' + id); } catch (e) { $('view-editor').hidden = true; toast(e.message, true); go('/', true); return; }
    S.doc = r.document; dirty = false; patch = {};
    document.title = S.doc.title + ' · HN Group Documents';
    drawSheet(true);
    sheet.hidden = false; state('Saved');
  }
  // Single-line fields don't take new lines; every field takes pasted text as plain text.
  function plainField(node, multiline) {
    node.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; e.preventDefault(); if (multiline) document.execCommand('insertLineBreak'); else if (node === titleEl) body.focus(); });
    node.addEventListener('paste', (e) => { e.preventDefault(); let t = e.clipboardData.getData('text/plain'); if (!multiline) t = t.replace(/\s*\n\s*/g, ' '); document.execCommand('insertText', false, t); });
    node.addEventListener('input', () => { if (!node.textContent.trim()) node.textContent = ''; markEmpty(); changed(); });
  }
  function field(f, value) {
    const node = el('div', { class: 'field', contenteditable: 'true', 'data-key': f.key, 'data-placeholder': f.label, 'aria-label': f.label, spellcheck: 'true' });
    node.textContent = value || '';
    plainField(node, !!f.multiline);
    return node;
  }
  function markEmpty() {
    for (const r of sheet.querySelectorAll('[data-row]')) r.classList.toggle('is-empty', !r.querySelector('.field').textContent.trim());
    for (const w of sheet.querySelectorAll('.field-wrap')) w.classList.toggle('is-empty', !w.querySelector('.field').textContent.trim());
  }
  function drawBranding() {
    const c = company(S.doc.company), t = template(S.doc.template);
    $('sheet-logo').src = logo(c); $('sheet-logo').alt = c.name;
    $('sheet-label').textContent = t.label; $('sheet-site').textContent = c.website;
    const legal = c.note && c.note.includes(c.legal) ? c.note : c.legal + (c.note ? ' · ' + c.note : '');
    $('sheet-foot').replaceChildren(el('span', { text: legal }), el('span', { text: c.website }));
    // Printed pages carry the company footer and page numbers in the page margin (Chrome, Edge and HN Browser).
    const q = (v) => '"' + String(v).replace(/[\\"]/g, '\\$&').replace(/[\n\r]/g, ' ') + '"';
    try {
      printSheet.replaceSync('@page { @bottom-left { content: ' + q(legal) + '; font: 7.5pt "Plus Jakarta Sans", sans-serif; color: #6E6F7E; vertical-align: top; padding-top: 4mm } ' +
        '@bottom-right { content: ' + q(c.website + ' · Page ') + ' counter(page) " of " counter(pages); font: 7.5pt "Plus Jakarta Sans", sans-serif; color: #6E6F7E; vertical-align: top; padding-top: 4mm } }');
      if (!document.adoptedStyleSheets.includes(printSheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, printSheet];
    } catch {}
    $('doc-company').value = c.id;
  }
  function drawSheet(content) {
    const d = S.doc, t = template(d.template);
    drawBranding();
    sheet.classList.toggle('subject', t.title === 'subject');
    if (content) {
      const letter = t.id === 'letter';
      $('letter-block').hidden = !letter;
      $('details').hidden = letter || !t.head.length;
      $('head-left').replaceChildren(); $('head-right').replaceChildren(); $('head-rows').replaceChildren();
      for (const f of t.head) {
        const node = field(f, d.fields[f.key]);
        if (letter && f.area === 'left') $('head-left').append(node);
        else if (letter) $('head-right').append(el('div', { class: 'field-wrap' }, el('span', { class: 'label', text: f.label }), node));
        else $('head-rows').append(el('tr', { 'data-row': true }, el('th', { scope: 'row', text: f.label }), el('td', {}, node)));
      }
      $('sign-off').hidden = !t.foot.length;
      $('sign-off').replaceChildren(...t.foot.map((f) => { const n = field(f, d.fields[f.key]); if (f.gap) n.classList.add('gap'); return n; }));
      titleEl.textContent = d.title; titleEl.setAttribute('data-placeholder', t.titleHint);
      body.innerHTML = d.body; // cleaned by the server
      markEmpty();
    }
    drawControls();
  }
  function drawControls() {
    const d = S.doc, final = d.status === 'final';
    sheet.classList.toggle('final', final);
    for (const n of sheet.querySelectorAll('[contenteditable]')) n.setAttribute('contenteditable', final ? 'false' : 'true');
    $('toolbar').classList.toggle('off', final);
    $('final-note').hidden = !final;
    $('doc-status').textContent = final ? 'Back to draft' : 'Mark as final';
    $('doc-sharing').value = d.sharing; $('doc-sharing').disabled = !d.canManage;
    $('doc-sharing').title = d.canManage ? '' : 'Only the author can change who sees this document.';
    $('doc-delete').hidden = !d.canManage;
  }
  plainField(titleEl, false);
  body.addEventListener('input', () => changed());

  function collect() {
    const fields = {};
    for (const n of sheet.querySelectorAll('.field[data-key]')) fields[n.dataset.key] = n.innerText.replace(/\n$/, '');
    return { title: titleEl.innerText.trim(), fields, body: body.innerHTML };
  }
  function changed() { dirty = true; state('Unsaved changes'); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 900); }
  async function saveNow() {
    clearTimeout(saveTimer); clearTimeout(retryTimer);
    if (!S.doc) return;
    if (saving) { again = true; return waitForSave(); }
    if (!dirty && !Object.keys(patch).length) return;
    saving = true; state('Saving…');
    const doc = S.doc, sent = { ...collect(), ...patch, version: doc.version };
    patch = {}; dirty = false;
    try {
      const r = await api('PUT', '/api/documents/' + doc.id, sent);
      if (S.doc && S.doc.id === doc.id) { Object.assign(S.doc, { version: r.document.version, status: r.document.status, sharing: r.document.sharing, company: r.document.company, title: r.document.title, updatedAt: r.document.updatedAt }); document.title = S.doc.title + ' · HN Group Documents'; }
      state(dirty ? 'Unsaved changes' : 'Saved');
    } catch (e) {
      dirty = true;
      if (e.status === 409) {
        state('Not saved', true);
        saving = false;
        if (await ask({ title: 'Someone else changed this document', text: e.message, ok: 'Reload the document' })) { dirty = false; return openDoc(doc.id); }
        return;
      }
      state('Not saved. Trying again…', true);
      retryTimer = setTimeout(saveNow, 5000);
      if (e.status && e.status < 500) toast(e.message, true);
    } finally { saving = false; }
    if (again) { again = false; return saveNow(); }
  }
  function waitForSave() { return new Promise((resolve) => { const t = setInterval(() => { if (!saving) { clearInterval(t); resolve(); } }, 50); }); }
  window.addEventListener('beforeunload', (e) => { if (S.doc && (dirty || saving)) { e.preventDefault(); e.returnValue = ''; saveNow(); } });

  $('doc-company').addEventListener('change', () => { S.doc.company = $('doc-company').value; patch.company = S.doc.company; drawBranding(); saveNow(); });
  $('doc-sharing').addEventListener('change', () => { patch.sharing = $('doc-sharing').value; S.doc.sharing = patch.sharing; saveNow().then(() => toast(S.doc.sharing === 'private' ? 'Only you can see this document now.' : 'All staff can see this document now.')); });
  $('doc-status').addEventListener('click', () => { S.doc.status = S.doc.status === 'final' ? 'draft' : 'final'; patch.status = S.doc.status; drawControls(); saveNow(); });
  $('doc-print').addEventListener('click', async () => { await saveNow(); window.print(); });
  // The "…" menu.
  function closeMenu() { $('doc-menu').hidden = true; $('doc-more').setAttribute('aria-expanded', 'false'); }
  $('doc-more').addEventListener('click', (e) => { e.stopPropagation(); const open = $('doc-menu').hidden; $('doc-menu').hidden = !open; $('doc-more').setAttribute('aria-expanded', String(open)); if (open) $('doc-menu').querySelector('button:not([hidden])').focus(); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#doc-menu')) closeMenu(); });
  $('doc-duplicate').addEventListener('click', async () => {
    closeMenu(); await saveNow();
    try { const r = await api('POST', '/api/documents/' + S.doc.id + '/duplicate'); toast('Copy made. You’re now editing the copy.'); go('/doc/' + r.document.id); } catch (e) { toast(e.message, true); }
  });
  $('doc-delete').addEventListener('click', async () => {
    closeMenu();
    const d = S.doc;
    if (!(await ask({ title: 'Delete “' + d.title + '”?', text: 'It will be removed for everyone. This can’t be undone.', ok: 'Delete document', danger: true }))) return;
    try { clearTimeout(saveTimer); dirty = false; patch = {}; await api('DELETE', '/api/documents/' + d.id); S.doc = null; toast('Document deleted.'); go('/'); } catch (e) { toast(e.message, true); }
  });

  // Formatting. The buttons keep the selection in the page while they're pressed.
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch {}
  let savedRange = null;
  const inBody = (node) => node && (node === body || body.contains(node));
  function keepSelection() { const s = getSelection(); if (s.rangeCount && inBody(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); }
  function restoreSelection() {
    body.focus();
    const s = getSelection();
    if (savedRange && inBody(savedRange.startContainer)) { s.removeAllRanges(); s.addRange(savedRange); }
    else if (!inBody(s.anchorNode)) { const r = document.createRange(); r.selectNodeContents(body); r.collapse(false); s.removeAllRanges(); s.addRange(r); }
  }
  document.addEventListener('selectionchange', () => {
    keepSelection();
    if (!S.doc || !inBody(getSelection().anchorNode)) return;
    for (const b of $('toolbar').querySelectorAll('[data-cmd]')) { let on = false; try { on = document.queryCommandState(b.dataset.cmd); } catch {} if (['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].includes(b.dataset.cmd)) b.setAttribute('aria-pressed', String(on)); }
    let block = ''; try { block = String(document.queryCommandValue('formatBlock')).toLowerCase(); } catch {}
    $('block-style').value = ['h1', 'h2', 'h3', 'blockquote'].includes(block) ? block : 'p';
  });
  $('toolbar').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  $('toolbar').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b || S.doc?.status === 'final') return;
    if (b.dataset.cmd) { restoreSelection(); document.execCommand(b.dataset.cmd, false, null); changed(); return; }
    if (b.dataset.action === 'link') {
      const keep = savedRange;
      const url = await ask({ title: 'Add a link', ok: 'Add link', input: { label: 'Web address or email', placeholder: 'https://… or name@example.com' } });
      savedRange = keep;
      if (!url) return;
      let href = url.trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href)) href = 'mailto:' + href;
      else if (!/^(https?:|mailto:)/i.test(href)) href = 'https://' + href;
      if (!/^(https?:\/\/[^\s]+|mailto:[^\s]+)$/i.test(href)) { toast('That isn’t a web address or email address.', true); return; }
      restoreSelection();
      if (getSelection().isCollapsed) document.execCommand('insertHTML', false, '<a href="' + href.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) + '">' + url.trim().replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) + '</a>');
      else document.execCommand('createLink', false, href);
      changed(); return;
    }
    if (b.dataset.action === 'table') { restoreSelection(); document.execCommand('insertHTML', false, '<table><thead><tr><th>Heading</th><th>Heading</th><th>Heading</th></tr></thead><tbody><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>'); changed(); return; }
    if (b.dataset.action === 'rule') { restoreSelection(); document.execCommand('insertHorizontalRule'); changed(); }
  });
  $('block-style').addEventListener('change', () => { restoreSelection(); document.execCommand('formatBlock', false, '<' + $('block-style').value + '>'); changed(); });

  // Pasted text keeps headings, lists, tables, bold/italic/underline and links, and nothing else.
  const KEEP = { P: 'p', DIV: 'p', H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h3', STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', U: 'u', S: 's', UL: 'ul', OL: 'ol', LI: 'li', BLOCKQUOTE: 'blockquote', A: 'a', BR: 'br', TABLE: 'table', THEAD: 'thead', TBODY: 'tbody', TR: 'tr', TH: 'th', TD: 'td' };
  function cleanNode(node, out) {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { out.append(n.textContent); continue; }
      if (n.nodeType !== 1 || ['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'SVG', 'IMG', 'IFRAME', 'OBJECT'].includes(n.tagName)) continue;
      const tag = KEEP[n.tagName];
      if (!tag) { cleanNode(n, out); continue; }
      const e = document.createElement(tag);
      if (tag === 'a') { const href = n.getAttribute('href') || ''; if (/^(https?:|mailto:)/i.test(href)) e.setAttribute('href', href); }
      cleanNode(n, e); out.append(e);
    }
    return out;
  }
  body.addEventListener('paste', (e) => {
    const html = e.clipboardData.getData('text/html');
    e.preventDefault();
    if (!html) { document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); return; }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const holder = cleanNode(doc.body, document.createElement('div'));
    document.execCommand('insertHTML', false, holder.innerHTML);
  });
  body.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) e.preventDefault(); });

  // ---------- Start ----------
  (async () => {
    let me;
    try { me = await api('GET', '/api/me'); } catch (e) { $('loading').textContent = e.message; return; }
    Object.assign(S, { me: me.user, companies: me.companies, templates: me.templates, counts: me.counts });
    $('who').hidden = false; $('who-name').textContent = me.user.name; $('who-avatar').textContent = initials(me.user.name);
    $('type-filter').append(...S.templates.map((t) => el('option', { value: t.id, text: t.name })));
    $('doc-company').replaceChildren(...S.companies.map((c) => el('option', { value: c.id, text: c.name })));
    $('loading').hidden = true;
    route();
  })();
})();
