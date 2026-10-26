'use strict';
// HN Group Docs in the browser: shared documents, your private storage (documents and uploaded files), someone
// else's storage when the staff portal lets you in (view only), the templates for each company, starting a new
// document, and the page editor, which saves by itself as you type. Everything shown is
// built as elements (never from text the server didn't clean); document bodies are cleaned again on the server.
(() => {
  const $ = (id) => document.getElementById(id);
  const S = { me: null, companies: [], templates: [], counts: {}, filter: { company: '', template: '', q: '' }, scope: 'shared', person: null, doc: null, back: '/' };
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
  const DIALOGS = ['new-dialog', 'settings-dialog', 'ask'];
  function showLayer(which) { lastFocus = document.activeElement; layer.hidden = false; for (const id of DIALOGS) $(id).hidden = id !== which; }
  function hideLayer() { layer.hidden = true; for (const id of DIALOGS) $(id).hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
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
  layer.addEventListener('mousedown', (e) => { if (e.target === layer) { if (closeAsk) closeAsk(null); else if (!$('settings-dialog').hidden) hideLayer(); else closeNew(); } });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (closeAsk) closeAsk(null); else if (!$('settings-dialog').hidden) hideLayer(); else if (!$('new-dialog').hidden) closeNew(); else if (S.selecting) endSelect(); else closeMenu(); }
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
    const p = location.pathname, m = /^\/doc\/([0-9a-f-]{36})$/.exec(p), other = /^\/storage\/([A-Za-z0-9_-]{1,64})$/.exec(p);
    for (const v of ['view-library', 'view-templates', 'view-people', 'view-editor']) $(v).hidden = true;
    for (const a of document.querySelectorAll('.tabs a')) a.removeAttribute('aria-current');
    if (m) return openDoc(m[1]);
    S.doc = null; document.title = 'HN Group Docs';
    const params = new URLSearchParams(location.search);
    S.filter.company = S.companies.some((c) => c.id === params.get('company')) ? params.get('company') : '';
    if (p === '/templates') { tab('templates'); return showTemplates(); }
    if (p === '/people') { tab('people'); return showPeople(); }
    S.scope = other && other[1] !== S.me.id ? 'person' : p.startsWith('/storage') ? 'mine' : 'shared';
    S.person = S.scope === 'person' ? other[1] : null;
    S.back = location.pathname + location.search;
    if (S.scope !== 'person') tab(S.scope);
    showLibrary();
    if (p === '/new') openNew({ company: params.get('company'), template: params.get('template') });
  }
  const tab = (name) => { const a = document.querySelector('[data-tab=' + name + ']'); if (a) a.setAttribute('aria-current', 'page'); };

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
    $('search').value = S.filter.q;
    const files = $('type-filter').querySelector('option[value=files]');
    files.hidden = S.scope === 'shared';
    if (S.scope === 'shared' && S.filter.template === 'files') S.filter.template = '';
    $('type-filter').value = S.filter.template;
    $('upload-button').hidden = S.scope !== 'mine';
    await loadDocuments();
  }
  const size = (n) => n < 1024 ? n + ' bytes' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const kindOf = (f) => /pdf/.test(f.mime) ? 'PDF' : /^image\//.test(f.mime) ? 'Picture' : /word/.test(f.mime) ? 'Word' : /sheet|excel|csv/.test(f.mime) ? 'Spreadsheet' : /presentation|powerpoint/.test(f.mime) ? 'Slides' : 'Text';
  function fileRow(f, own) {
    const open = el('a', { class: 'file-name', href: '/api/files/' + f.id, target: '_blank', rel: 'noopener' }, el('span', { class: 'file-icon', 'aria-hidden': 'true', text: ((f.name.match(/\.([a-z0-9]{1,4})$/i) || [])[1] || 'file').toUpperCase() }), el('span', { text: f.name }));
    const c = f.company ? company(f.company) : null;
    return el('div', { class: 'file-row', role: 'listitem' }, open,
      el('span', { class: 'file-meta', text: kindOf(f) + ' · ' + size(f.size) + (c ? ' · ' + c.name : '') + ' · ' + ago(f.updatedAt) }),
      el('span', { class: 'file-actions' },
        el('a', { class: 'btn small ghost', href: '/api/files/' + f.id + '?download=1', text: 'Download' }),
        own ? el('button', { type: 'button', class: 'btn small ghost', text: 'Rename', onclick: () => renameFile(f) }) : null,
        own ? el('button', { type: 'button', class: 'btn small ghost danger-text', text: 'Delete', onclick: () => deleteFile(f) }) : null));
  }
  async function loadDocuments() {
    const seq = ++listSeq, f = S.filter;
    let r;
    try {
      if (S.scope === 'person') r = await api('GET', '/api/storage/' + encodeURIComponent(S.person));
      else r = await api('GET', '/api/documents?' + new URLSearchParams({ scope: S.scope, ...(f.company && { company: f.company }), ...(f.template && { template: f.template }), ...(f.q && { q: f.q }) }));
    } catch (e) {
      if (seq !== listSeq) return;
      $('library-title').textContent = 'Storage not available'; $('library-count').textContent = '';
      $('doc-list').replaceChildren(); $('files').hidden = true; $('library-companies').replaceChildren();
      $('storage-note').textContent = e.message; $('storage-note').hidden = false; $('doc-empty').hidden = true; return;
    }
    if (seq !== listSeq) return;
    let docs = r.documents, files = r.files || [];
    if (S.scope === 'person') {
      // Someone else's storage: filter here (the server sends all of it, view only).
      const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean);
      const hit = (t) => terms.every((x) => t.toLowerCase().includes(x));
      docs = docs.filter((d) => (!f.company || d.company === f.company) && (!f.template || d.template === f.template) && hit(d.title));
      files = files.filter((x) => (!f.company || x.company === f.company) && (!f.template || f.template === 'files') && hit(x.name));
      S.counts = {}; for (const x of [...r.documents, ...r.files]) if (x.company) S.counts[x.company] = (S.counts[x.company] || 0) + 1;
      if (f.template === 'files') docs = [];
    } else S.counts = r.counts;
    const title = S.scope === 'shared' ? 'Shared documents' : S.scope === 'mine' ? 'My storage' : r.person.name + '’s storage';
    $('library-title').textContent = title; document.title = title + ' · HN Group Docs';
    $('library-eyebrow').textContent = S.scope === 'person' ? 'HN Group · View only' : S.scope === 'mine' ? 'HN Group · Private to you' : 'HN Group · Staff only';
    const note = S.scope === 'mine' ? 'Only you can see what’s here. Documents you share with staff move to Shared.'
      : S.scope === 'person' ? 'You can open and download what’s here but not change it. ' + (r.access === 'grant' && r.until ? 'Your access ends on ' + new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(r.until)) + '. ' : '') + 'Opening it is recorded.' : '';
    $('storage-note').textContent = note; $('storage-note').hidden = !note;
    otherStorage();
    chips($('library-companies'), f.company, true, (id) => { setCompanyParam(id); loadDocuments(); });
    const filtered = f.company || f.template || f.q;
    const n = docs.length + files.length;
    $('library-count').textContent = (n === 1 ? '1 item' : n + ' items') + (filtered ? ' match' : '');
    $('doc-list').replaceChildren(...docs.map((d, i) => {
      const c = company(d.company), t = template(d.template);
      const card = el('a', { class: 'doc-card', href: '/doc/' + d.id, 'data-link': true },
        paper(c, t, d.title),
        el('div', { class: 'card-body' }, el('h3', { text: d.title }),
          el('div', { class: 'card-meta' }, el('span', { class: 'tag ' + d.status, text: d.status === 'final' ? 'Final' : 'Draft' }), d.confidential ? el('span', { class: 'tag confidential', text: 'Confidential' }) : null, d.protected ? el('span', { class: 'tag protected', text: 'Protected' }) : null, el('span', { text: t.name + ' · ' + c.name })),
          el('div', { class: 'card-meta' }, el('span', { text: 'Edited ' + ago(d.updatedAt) + ' by ' + d.updatedBy }))));
      card.style.animationDelay = Math.min(i, 12) * 25 + 'ms';
      selectable(card, 'documents', d.id, d.canDelete, d.protected ? 'Protected from deletion' : 'Only the author can delete it');
      return card;
    }));
    $('files').hidden = !files.length;
    $('file-list').replaceChildren(...files.map((x) => { const row = fileRow(x, S.scope === 'mine'); selectable(row, 'files', x.id, x.canManage, 'Only the owner can delete it'); return row; }));
    S.visible = { documents: docs.filter((d) => d.canDelete).map((d) => d.id), files: files.filter((x) => x.canManage).map((x) => x.id) };
    drawBulk();
    $('doc-empty').hidden = n > 0;
    $('doc-empty').querySelector('h2').textContent = S.scope === 'mine' ? 'Your storage is empty' : S.scope === 'person' ? 'Nothing in this storage' : 'No shared documents yet';
    $('doc-empty').querySelector('[data-new]').hidden = S.scope === 'person';
    $('doc-empty-text').textContent = filtered ? 'Nothing matches these filters.' : S.scope === 'mine' ? 'Start a document from a template, or upload files. Only you can see them.' : S.scope === 'person' ? 'There are no private documents or files here.' : 'Start one from a template and choose Shared with staff.';
  }
  // Storage you've been given access to in the staff portal.
  function otherStorage() {
    const grants = (S.me.storageGrants || []).filter((g) => g.personId !== S.me.id);
    const box = $('other-storage');
    box.hidden = S.scope !== 'mine' || (!grants.length && !S.me.storageAccess);
    box.replaceChildren(el('strong', { text: 'Other people’s storage' }),
      ...grants.map((g) => el('a', { class: 'chip', href: '/storage/' + encodeURIComponent(g.personId), 'data-link': true }, el('span', { text: g.name || 'Staff member' }), el('span', { class: 'n', text: 'until ' + new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(g.until)) }))),
      S.me.storageAccess ? el('span', { class: 'muted small', text: 'You can open anyone’s storage.' }) : null,
      S.me.storageAccess ? el('a', { class: 'btn small', href: '/people', 'data-link': true, text: 'Staff storage' }) : null);
  }
  // ---------- Selecting several items to delete at once ----------
  S.selected = { documents: new Set(), files: new Set() };
  function selectable(node, kind, id, allowed, why) {
    if (!S.selecting) return;
    node.classList.add('selecting');
    const box = el('input', { type: 'checkbox', class: 'select-box', 'aria-label': allowed ? 'Select' : why, title: allowed ? '' : why, disabled: !allowed });
    box.checked = S.selected[kind].has(id);
    node.classList.toggle('picked', box.checked);
    box.addEventListener('click', (e) => e.stopPropagation());
    box.addEventListener('change', () => { if (box.checked) S.selected[kind].add(id); else S.selected[kind].delete(id); node.classList.toggle('picked', box.checked); drawBulk(); });
    node.addEventListener('click', (e) => { if (!S.selecting || e.target.closest('.file-actions')) return; e.preventDefault(); e.stopImmediatePropagation(); if (allowed) { box.checked = !box.checked; box.dispatchEvent(new Event('change')); } }, true);
    node.prepend(box);
  }
  function drawBulk() {
    const n = S.selected.documents.size + S.selected.files.size;
    $('bulk-bar').hidden = !S.selecting;
    $('select-button').hidden = S.scope === 'person' || S.selecting;
    $('bulk-count').textContent = n ? n + ' selected' : 'Choose what to delete';
    $('bulk-delete').disabled = !n;
    $('bulk-delete').textContent = n ? 'Delete ' + n : 'Delete selected';
  }
  function endSelect() { S.selecting = false; S.selected.documents.clear(); S.selected.files.clear(); loadDocuments(); }
  $('select-button').addEventListener('click', () => { S.selecting = true; loadDocuments(); });
  $('bulk-cancel').addEventListener('click', endSelect);
  $('bulk-all').addEventListener('click', () => { for (const id of S.visible.documents) S.selected.documents.add(id); for (const id of S.visible.files) S.selected.files.add(id); loadDocuments(); });
  $('bulk-delete').addEventListener('click', async () => {
    const n = S.selected.documents.size + S.selected.files.size;
    if (!n || !(await ask({ title: 'Delete ' + n + (n === 1 ? ' item' : ' items') + '?', text: 'They’ll be removed for everyone. This can’t be undone.', ok: 'Delete ' + n, danger: true }))) return;
    try {
      const r = await api('POST', '/api/delete-many', { documents: [...S.selected.documents], files: [...S.selected.files] });
      const done = r.deleted.documents + r.deleted.files;
      toast(done + (done === 1 ? ' item' : ' items') + ' deleted' + (r.skipped.length ? '. ' + r.skipped.length + ' left alone (protected or not yours).' : '.'), !!r.skipped.length);
    } catch (e) { toast(e.message, true); }
    endSelect();
  });

  async function renameFile(f) {
    const name = await ask({ title: 'Rename file', ok: 'Rename', input: { label: 'Name', value: f.name } });
    if (!name) return;
    try { await api('PUT', '/api/files/' + f.id, { name }); loadDocuments(); } catch (e) { toast(e.message, true); }
  }
  async function deleteFile(f) {
    if (!(await ask({ title: 'Delete “' + f.name + '”?', text: 'It will be removed from your storage. This can’t be undone.', ok: 'Delete file', danger: true }))) return;
    try { await api('DELETE', '/api/files/' + f.id); toast('File deleted.'); loadDocuments(); } catch (e) { toast(e.message, true); }
  }
  async function upload(list) {
    if (S.scope !== 'mine') return;
    let done = 0;
    for (const file of list) {
      toast('Uploading ' + file.name + '…');
      try {
        const r = await fetch('/api/files', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name), 'X-Company': S.filter.company || '' }, body: file });
        const v = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(v.error || 'That file couldn’t be uploaded.');
        done++;
      } catch (e) { toast(file.name + ': ' + e.message, true); await new Promise((res) => setTimeout(res, 1600)); }
    }
    if (done) toast(done === 1 ? 'File added to your storage.' : done + ' files added to your storage.');
    loadDocuments();
  }
  $('upload-button').addEventListener('click', () => $('upload-input').click());
  $('upload-input').addEventListener('change', () => { const files = [...$('upload-input').files]; $('upload-input').value = ''; upload(files); });
  let dragDepth = 0;
  const dragging = (e) => S.scope === 'mine' && !$('view-library').hidden && e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  document.addEventListener('dragenter', (e) => { if (!dragging(e)) return; e.preventDefault(); dragDepth++; $('drop').hidden = false; });
  document.addEventListener('dragover', (e) => { if (dragging(e)) e.preventDefault(); });
  document.addEventListener('dragleave', (e) => { if (!dragging(e)) return; if (--dragDepth <= 0) { dragDepth = 0; $('drop').hidden = true; } });
  document.addEventListener('drop', (e) => { if (!dragging(e)) return; e.preventDefault(); dragDepth = 0; $('drop').hidden = true; upload([...e.dataTransfer.files]); });
  $('search').addEventListener('input', () => { clearTimeout(listTimer); listTimer = setTimeout(() => { S.filter.q = $('search').value.trim(); loadDocuments(); }, 220); });
  $('type-filter').addEventListener('change', () => { S.filter.template = $('type-filter').value; loadDocuments(); });

  // ---------- Staff storage ----------
  let people = null;
  async function showPeople() {
    $('view-people').hidden = false; document.title = 'Staff storage · HN Group Docs';
    try { people = await api('GET', '/api/people'); } catch (e) { $('people-note').textContent = e.message; $('people-list').replaceChildren(); return; }
    $('people-note').textContent = people.all ? 'Open anyone’s private storage to read and download what’s there. You can’t change or delete anything, and every visit is recorded.' : 'Storage you’ve been given access to in the staff portal, until the date shown. Every visit is recorded.';
    drawPeople();
  }
  function drawPeople() {
    if (!people) return;
    const q = $('people-search').value.trim().toLowerCase();
    const list = people.people.filter((p) => !q || [p.name, p.jobTitle, p.company].join(' ').toLowerCase().includes(q));
    $('people-list').replaceChildren(...list.map((p) => el('a', { class: 'file-row person-row', role: 'listitem', href: '/storage/' + encodeURIComponent(p.id), 'data-link': true },
      el('span', { class: 'file-name' }, el('span', { class: 'file-icon', 'aria-hidden': 'true', text: initials(p.name) }), el('span', { text: p.name })),
      el('span', { class: 'file-meta', text: p.until ? 'Until ' + new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(p.until)) : [p.jobTitle, p.company].filter(Boolean).join(' · ') }),
      el('span', { class: 'file-actions' }, el('span', { class: 'btn small', text: 'Open storage' })))));
    $('people-empty').hidden = list.length > 0;
    $('people-empty-text').textContent = q ? 'Nobody matches that search.' : 'Nobody has given you access to anyone’s storage.';
  }
  $('people-search').addEventListener('input', drawPeople);

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
    const groups = [...new Set(S.templates.map((t) => t.group))];
    $('new-templates').replaceChildren(...groups.flatMap((g) => [el('p', { class: 'pick-group', text: g }),
      ...S.templates.filter((t) => t.group === g).map((t) => el('label', { class: 'option' }, el('input', { type: 'radio', name: 'template', value: t.id, checked: t.id === tSel }),
        el('strong', { text: t.name }), el('small', { text: t.blurb })))]));
    $('new-confidential').checked = !!template(tSel).confidential;
    $('new-name').value = ''; $('new-sharing').value = S.scope === 'shared' && location.pathname === '/' ? 'staff' : 'private'; $('new-error').hidden = true; $('new-create').disabled = false;
    showLayer('new-dialog');
    $('new-dialog').querySelector('input[name=company]:checked').focus();
  }
  // Choosing a template sets its usual marking (termination and resignation letters start private & confidential).
  $('new-templates').addEventListener('change', (e) => { if (e.target.name === 'template') $('new-confidential').checked = !!template(e.target.value).confidential; });
  function closeNew() { if ($('new-dialog').hidden) return; hideLayer(); if (location.pathname === '/new') history.replaceState({}, '', '/'); }
  $('new-button').addEventListener('click', () => openNew({ company: S.filter.company }));
  document.addEventListener('click', (e) => { if (e.target.closest('[data-new]')) openNew({ company: S.filter.company }); });
  $('new-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData($('new-form'));
    $('new-create').disabled = true;
    try {
      const r = await api('POST', '/api/documents', { company: f.get('company'), template: f.get('template'), title: $('new-name').value, sharing: $('new-sharing').value, confidential: $('new-confidential').checked });
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
    document.title = S.doc.title + ' · HN Group Docs';
    // Back to where it was opened from (or where it lives).
    const from = S.back && S.back !== location.pathname ? S.back : S.doc.mine && S.doc.sharing === 'private' ? '/storage' : !S.doc.mine && S.doc.sharing === 'private' ? '/storage/' + S.doc.ownerId : '/';
    $('doc-back').setAttribute('href', from);
    $('doc-back').textContent = '← ' + (from.startsWith('/storage/') ? 'Their storage' : from.startsWith('/storage') ? 'My storage' : from.startsWith('/templates') ? 'Templates' : 'Shared');
    drawSheet(true);
    sheet.hidden = false; state(S.doc.readOnly ? '' : 'Saved');
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
    $('sheet-label').textContent = t.label;
    const legal = c.note && c.note.includes(c.legal) ? c.note : c.legal + (c.note ? ' · ' + c.note : '');
    $('sheet-foot').replaceChildren(el('span', { text: legal }));
    // Printed pages carry the company footer and page numbers in the page margin (Chrome, Edge and HN Browser).
    const q = (v) => '"' + String(v).replace(/[\\"]/g, '\\$&').replace(/[\n\r]/g, ' ') + '"';
    try {
      printSheet.replaceSync('@page { ' + (S.doc.confidential ? '@top-center { content: "PRIVATE & CONFIDENTIAL"; font: 800 7.5pt "Plus Jakarta Sans", sans-serif; letter-spacing: .14em; color: #B4234F; vertical-align: bottom; padding-bottom: 3mm } ' : '') + '@bottom-left { content: ' + q(legal) + '; font: 7.5pt "Plus Jakarta Sans", sans-serif; color: #6E6F7E; vertical-align: top; padding-top: 4mm } ' +
        '@bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7.5pt "Plus Jakarta Sans", sans-serif; color: #6E6F7E; vertical-align: top; padding-top: 4mm } }');
      if (!document.adoptedStyleSheets.includes(printSheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, printSheet];
    } catch {}
    $('doc-company').value = c.id;
  }
  function drawSheet(content) {
    const d = S.doc, t = template(d.template);
    drawBranding();
    sheet.classList.toggle('subject', t.title === 'subject');
    if (content) {
      const letter = t.layout === 'letter';
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
    drawHistory();
    drawControls();
  }
  // Policies: the version history, recorded by the server each time a changed policy is marked final.
  function drawHistory() {
    const d = S.doc, t = template(d.template), list = d.history || [];
    $('history').hidden = !t.versions;
    if (!t.versions) return;
    $('history-hint').textContent = list.length ? '' : 'Mark this policy as final to record version ' + ((d.fields && d.fields.version) || '1.0') + '. After that, each time it’s changed and marked final again, the version number goes up and the changes are listed here.';
    $('history-hint').hidden = !!list.length;
    $('history-rows').replaceChildren(...list.slice().reverse().map((h) => el('tr', {}, el('td', { text: h.version }), el('td', { text: h.date }), el('td', { text: h.by }),
      el('td', {}, el('ul', {}, ...h.changes.map((c) => el('li', { text: c })))))));
  }
  function drawControls() {
    const d = S.doc, final = d.status === 'final', locked = final || d.readOnly;
    sheet.classList.toggle('final', locked);
    for (const n of sheet.querySelectorAll('[contenteditable]')) n.setAttribute('contenteditable', locked ? 'false' : 'true');
    $('toolbar').classList.toggle('off', locked);
    $('toolbar').hidden = !!d.readOnly;
    $('final-note').hidden = !final || d.readOnly;
    $('readonly-note').hidden = !d.readOnly;
    $('readonly-note').textContent = d.readOnly ? 'This document is in ' + d.owner + '’s private storage. You can read and print it, but not change it. Opening it is recorded.' : '';
    for (const id of ['doc-status', 'doc-company', 'doc-sharing', 'doc-more']) ($(id).closest('label') || $(id)).hidden = !!d.readOnly;
    $('doc-status').textContent = final ? 'Back to draft' : 'Mark as final';
    $('doc-sharing').value = d.sharing;
    $('doc-sharing').querySelector('option[value=private]').disabled = !d.mine;
    $('doc-sharing').disabled = !(d.mine || S.me.admin);
    $('doc-sharing').title = d.mine || S.me.admin ? '' : 'Only the author can move this document.';
    $('doc-delete').hidden = !d.canManage || d.protected;
    $('confidential-mark').hidden = !d.confidential;
    $('confidential-pill').hidden = !d.confidential;
    $('protected-pill').hidden = !d.protected;
    $('doc-settings').hidden = !!d.readOnly;
    drawBranding();
  }
  // Document settings: Private & confidential, and protection from deletion (permanent, author only).
  function openSettings() {
    const d = S.doc;
    $('set-confidential').checked = !!d.confidential;
    $('set-protected').checked = !!d.protected;
    $('set-protected').disabled = !!d.protected || !d.canManage;
    $('set-protected-text').textContent = d.protected ? 'This document is protected: it can never be deleted.' : d.canManage ? 'Nobody, including you, will ever be able to delete this document. This can’t be undone.' : 'Only the author can protect this document from deletion.';
    $('settings-error').hidden = true;
    showLayer('settings-dialog'); $('set-confidential').focus();
  }
  $('settings-cancel').addEventListener('click', () => hideLayer());
  $('settings-save').addEventListener('click', async () => {
    const d = S.doc, confidential = $('set-confidential').checked, protect = $('set-protected').checked && !d.protected;
    hideLayer();
    if (protect && !(await ask({ title: 'Protect “' + d.title + '” from deletion?', text: 'Nobody will ever be able to delete it, including you. This can’t be undone.', ok: 'Protect it' }))) return;
    if (confidential !== !!d.confidential) patch.confidential = confidential;
    if (protect) patch.protected = true;
    if (!Object.keys(patch).length) return;
    await saveNow();
    drawControls();
    toast(protect ? 'Protected: this document can never be deleted.' : confidential ? 'Marked private & confidential.' : 'No longer marked private & confidential.');
  });
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
      if (S.doc && S.doc.id === doc.id) {
        const versionsBefore = (S.doc.history || []).length;
        Object.assign(S.doc, { version: r.document.version, status: r.document.status, sharing: r.document.sharing, company: r.document.company, title: r.document.title, updatedAt: r.document.updatedAt, history: r.document.history, canManage: r.document.canManage, confidential: r.document.confidential, protected: r.document.protected });
        document.title = S.doc.title + ' · HN Group Docs';
        // A policy marked final may have a new version number and history entry.
        if ((r.document.history || []).length !== versionsBefore) {
          const v = sheet.querySelector('.field[data-key=version]');
          if (v) v.textContent = r.document.fields.version;
          S.doc.fields = r.document.fields; drawHistory(); markEmpty();
          toast('Version ' + r.document.fields.version + ' recorded.');
        }
      }
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
  $('doc-sharing').addEventListener('change', () => { patch.sharing = $('doc-sharing').value; S.doc.sharing = patch.sharing; saveNow().then(() => toast(S.doc.sharing === 'private' ? 'Moved to your private storage. Only you can see it now.' : 'Shared with staff. Everyone can see and edit it now.')); });
  $('doc-status').addEventListener('click', () => { S.doc.status = S.doc.status === 'final' ? 'draft' : 'final'; patch.status = S.doc.status; drawControls(); saveNow(); });
  // Download PDF: the server makes the PDF (no print dialog, so the browser adds nothing to it).
  $('doc-pdf').addEventListener('click', async (e) => {
    e.preventDefault();
    await saveNow();
    const a = el('a', { href: '/api/documents/' + S.doc.id + '/pdf', download: '' });
    document.body.append(a); a.click(); a.remove();
    toast('Downloading “' + S.doc.title + '.pdf”…');
  });
  // The "…" menu.
  $('doc-settings').addEventListener('click', () => { closeMenu(); openSettings(); });
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
    if (me.user.picture) {
      $('who-photo').addEventListener('load', () => { $('who-photo').hidden = false; $('who-avatar').hidden = true; }, { once: true });
      $('who-photo').src = '/api/avatar';
    }
    $('people-tab').hidden = !(me.user.storageAccess || (me.user.storageGrants || []).length);
    $('type-filter').append(...S.templates.map((t) => el('option', { value: t.id, text: t.name })), el('option', { value: 'files', text: 'Files' }));
    $('doc-company').replaceChildren(...S.companies.map((c) => el('option', { value: c.id, text: c.name })));
    $('loading').hidden = true;
    route();
  })();
})();
