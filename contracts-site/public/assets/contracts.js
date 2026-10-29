'use strict';
// HN Group Contracts in the browser: the contracts waiting for you, the ones you've signed or sent, a contract's page
// (the PDF, who signs it, signing or declining, and for drafts choosing who signs), and uploading a new contract.
(() => {
  const $ = (id) => document.getElementById(id);
  const main = $('main');
  let me = null;

  // ---------- Small helpers ----------
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  }
  async function api(path, opts = {}) {
    const r = await fetch(path, { method: opts.method || (opts.json ? 'POST' : 'GET'), headers: { ...(opts.json ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) }, body: opts.json ? JSON.stringify(opts.json) : opts.body, credentials: 'same-origin' });
    if (r.status === 401) { location.href = '/auth/login?next=' + encodeURIComponent(location.pathname); throw new Error('Signed out'); }
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(v.error || 'Something went wrong. Please try again.');
    return v;
  }
  function toast(text, bad) { const t = el('div', { class: 'toast' + (bad ? ' bad' : ''), role: 'status', text }); document.body.append(t); setTimeout(() => t.remove(), 3800); }
  const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const when = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const day = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const STATUS = { draft: ['Draft', ''], out: ['Waiting for signatures', 'pending'], completed: ['Signed', 'good'], declined: ['Declined', 'bad'], cancelled: ['Cancelled', 'bad'] };
  const pill = (status) => el('span', { class: 'pill ' + STATUS[status][1], text: STATUS[status][0] });
  const SIGNER = { waiting: ['Waiting', 'pending'], signed: ['Signed', 'good'], declined: ['Declined', 'bad'] };

  // A question in the HN design (never the browser's own boxes).
  function ask(title, text, okLabel, opts = {}) {
    const layer = $('layer');
    $('sheet-title').textContent = title; $('sheet-text').textContent = text; $('sheet-ok').textContent = okLabel;
    $('sheet-ok').className = 'btn ' + (opts.danger ? 'danger' : 'primary');
    const extra = $('sheet-extra'); extra.replaceChildren();
    let input = null;
    if (opts.input) { input = el('textarea', { rows: 3, placeholder: opts.input, 'aria-label': opts.input }); extra.append(input); }
    layer.hidden = false; requestAnimationFrame(() => layer.classList.add('open'));
    (input || $('sheet-cancel')).focus();
    return new Promise((resolve) => {
      const done = (value) => { layer.classList.remove('open'); setTimeout(() => { layer.hidden = true; }, 200); layer.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); resolve(value); };
      const onClick = (e) => { if (e.target.closest('[data-close]')) done(null); else if (e.target.id === 'sheet-ok') done(input ? input.value.trim() : true); };
      const onKey = (e) => { if (e.key === 'Escape') done(null); };
      layer.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
    });
  }

  // ---------- Pages ----------
  function go(path, replace) { history[replace ? 'replaceState' : 'pushState']({}, '', path); route(); }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/"]');
    if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || a.hasAttribute('download') || a.href.includes('/api/') || a.href.includes('/auth/')) return;
    e.preventDefault(); go(a.getAttribute('href'));
  });
  window.addEventListener('popstate', route);

  function head(eyebrow, title, text, ...extra) { return el('section', { class: 'page-head' }, el('p', { class: 'eyebrow', text: eyebrow }), el('h1', { text: title }), text ? el('p', { class: 'muted', text }) : null, ...extra); }
  function row(c) {
    return el('a', { class: 'row', href: '/contract/' + c.id },
      el('span', { class: 'doc-icon', 'aria-hidden': 'true' }),
      el('span', { class: 'row-main' }, el('h3', { text: c.title }), el('span', { class: 'muted small', text: (c.mine ? 'You sent this' : 'From ' + c.createdBy.name) + (c.sentAt ? ' · ' + day(c.sentAt) : ' · Created ' + day(c.createdAt)) + ' · ' + c.signers.map((s) => s.name).join(', ') })),
      c.total ? el('span', { class: 'progress', title: c.signed + ' of ' + c.total + ' signed' }, el('span', { style: null, 'data-w': Math.round(c.signed / c.total * 100) })) : null,
      c.waitingForMe ? el('span', { class: 'pill pending', text: 'Needs your signature' }) : pill(c.status));
  }
  function rows(list, empty) {
    const box = list.length ? el('div', { class: 'rows' }, list.map(row)) : el('div', { class: 'empty' }, el('strong', { text: empty[0] }), el('span', { class: 'muted', text: empty[1] }));
    // Widths without inline styles (the page's security policy allows none): set through CSSOM.
    requestAnimationFrame(() => box.querySelectorAll('[data-w]').forEach((s) => { s.style.width = s.dataset.w + '%'; }));
    return box;
  }
  function setNav(view) { for (const a of document.querySelectorAll('#nav a')) a.toggleAttribute('aria-current', a.dataset.view === view); if (view) for (const a of document.querySelectorAll('#nav a')) if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); }

  async function lists(view) {
    setNav(view);
    const v = await api('/api/contracts');
    const n = v.toSign.length; $('count-to-sign').hidden = !n; $('count-to-sign').textContent = n;
    if (view === 'home') main.replaceChildren(head('Your contracts', 'To sign', n ? 'These are waiting for your signature. Open one to read it, then sign it with your name.' : 'Nothing is waiting for your signature.'),
      rows(v.toSign, ['You’re all caught up', 'When someone sends you a contract, it appears here.']),
      me.canSend ? el('p', { class: 'foot muted small' }, 'Sending a contract? ', el('a', { href: '/new', text: 'Upload a PDF' }), ', or use Send for signing in HN Group Docs.') : null);
    if (view === 'signed') main.replaceChildren(head('Your contracts', 'Signed and finished', 'Contracts you’ve signed or declined.'), rows(v.signed, ['Nothing yet', 'Contracts you sign appear here.']));
    if (view === 'sent') main.replaceChildren(head('Sending', 'Sent by you', 'Drafts, contracts waiting for signatures and finished ones.', el('p', {}, el('a', { class: 'btn primary', href: '/new', text: 'New contract' }))), rows(v.sent, ['You haven’t sent any contracts', 'Upload a PDF, or send a document from HN Group Docs.']));
    if (view === 'all') main.replaceChildren(head('Manage contracts', 'All contracts', 'Every contract on HN Group Contracts.'), rows(v.everyone || [], ['No contracts yet', '']));
  }

  function newContract() {
    setNav('');
    if (!me.canSend) { main.replaceChildren(head('New contract', 'You can’t send contracts', 'Sending contracts needs the “Send contracts for signing” permission. Ask an administrator to add it to one of your roles in the staff portal.')); return; }
    const file = el('input', { type: 'file', accept: 'application/pdf,.pdf', class: 'sr', id: 'file' });
    const title = el('input', { id: 'title', maxlength: 160, placeholder: 'For example, Employee Agreement – Jo Bloggs' });
    const chosen = el('p', { class: 'muted', text: 'No file chosen' });
    const drop = el('label', { class: 'drop', for: 'file' }, el('span', { class: 'doc-icon', 'aria-hidden': 'true' }), el('strong', { text: 'Choose the contract PDF' }), el('span', { class: 'muted small', text: 'Or drop it here. PDF only, up to 25 MB.' }), chosen);
    let picked = null;
    const pick = (f) => { if (!f) return; picked = f; chosen.textContent = f.name + ' (' + Math.round(f.size / 1024) + ' KB)'; if (!title.value) title.value = f.name.replace(/\.pdf$/i, ''); };
    file.addEventListener('change', () => pick(file.files[0]));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); pick(e.dataTransfer.files[0]); });
    const button = el('button', { class: 'btn primary large', type: 'submit', text: 'Upload and choose who signs' });
    const form = el('form', { class: 'card narrow', onsubmit: async (e) => {
      e.preventDefault();
      if (!picked) return toast('Choose the contract PDF first.', true);
      button.disabled = true; button.textContent = 'Uploading…';
      try {
        const v = await api('/api/contracts', { method: 'POST', body: picked, headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(picked.name), 'X-Title': encodeURIComponent(title.value.trim()) } });
        go('/contract/' + v.contract.id);
      } catch (err) { toast(err.message, true); button.disabled = false; button.textContent = 'Upload and choose who signs'; }
    } }, el('p', { class: 'eyebrow', text: 'New contract' }), el('h1', { text: 'Upload a contract' }),
      el('p', { class: 'muted', text: 'Next you’ll choose who signs it. Each person signs in with their own HN Group Auth account to read and sign it.' }),
      drop, file, el('div', { class: 'field' }, el('label', { for: 'title', text: 'Title' }), title), button);
    main.replaceChildren(form);
  }

  // ---------- A contract ----------
  let people = null;
  async function contractPage(id) {
    setNav('');
    const { contract: c } = await api('/api/contracts/' + id);
    const draft = c.status === 'draft' && c.can.edit;
    const viewer = el('section', { class: 'viewer' },
      el('div', { class: 'viewer-bar' }, el('span', {}, el('strong', { text: c.file.name }), el('span', { class: 'muted small', text: ' · ' + c.file.pages + ' page' + (c.file.pages === 1 ? '' : 's') })),
        el('span', { class: 'actions' }, el('a', { class: 'btn small', href: '/api/contracts/' + c.id + '/file?download', download: true, text: 'Download' }),
          c.certificate ? el('a', { class: 'btn small primary', href: '/api/contracts/' + c.id + '/certificate?download', download: true, text: 'Signing certificate' }) : null)));
    // A signer has to open the contract before they can sign; opening it is recorded.
    const frame = () => el('iframe', { src: '/api/contracts/' + c.id + '/file', title: 'The contract: ' + c.title });
    if (c.can.mustView) viewer.append(el('div', { class: 'viewer-closed' }, el('span', { class: 'doc-icon', 'aria-hidden': 'true' }), el('strong', { text: 'Read the contract before signing' }),
      el('button', { class: 'btn primary', type: 'button', onclick: async () => { viewer.querySelector('.viewer-closed').replaceWith(frame()); setTimeout(() => contractSide(c.id, side), 1200); } }, 'Open the contract')));
    else viewer.append(frame());
    const side = el('aside', { class: 'side' });
    main.replaceChildren(head(c.createdBy.name ? 'From ' + c.createdBy.name : 'Contract', c.title, null, el('p', { class: 'actions', style: null }, pill(c.status), c.source.kind === 'docs' ? el('span', { class: 'pill', text: 'From HN Group Docs' }) : null)),
      el('div', { class: 'contract' }, viewer, side));
    fillSide(c, side, draft);
  }
  async function contractSide(id, side) { const { contract: c } = await api('/api/contracts/' + id); fillSide(c, side, c.status === 'draft' && c.can.edit); }

  function fillSide(c, side, draft) {
    const cards = [];
    const mine = c.signers.find((s) => s.me);
    if (c.status === 'completed') cards.push(el('div', { class: 'notice good', text: 'Everyone has signed. Download the contract and its signing certificate above.' }));
    if (c.status === 'declined') cards.push(el('div', { class: 'notice bad', text: 'Someone declined to sign. The sender can cancel it and send a new version.' }));
    if (c.status === 'cancelled') cards.push(el('div', { class: 'notice bad', text: 'This contract was cancelled, so it can no longer be signed.' }));
    if (c.can.sign) cards.push(signCard(c));
    else if (mine && mine.status === 'signed') cards.push(el('div', { class: 'notice good', text: 'You signed this on ' + when(mine.signedAt) + '.' }));
    cards.push(draft ? signersEditor(c) : signersCard(c));
    if (c.message && !draft) cards.push(el('section', { class: 'card' }, el('h2', { text: 'Message' }), el('p', { text: c.message })));
    if (c.can.cancel) cards.push(el('button', { class: 'btn danger', type: 'button', onclick: async () => {
      const draftOnly = c.status === 'draft';
      if (!(await ask(draftOnly ? 'Delete this draft?' : 'Cancel this contract?', draftOnly ? 'The draft and its PDF are deleted.' : 'Nobody will be able to sign it any more. Signatures already made stay in its history.', draftOnly ? 'Delete draft' : 'Cancel contract', { danger: true }))) return;
      try { const v = await api('/api/contracts/' + c.id + '/cancel', { json: {} }); if (v.deleted) { toast('Draft deleted.'); go('/sent'); } else { toast('Contract cancelled.'); route(); } } catch (e) { toast(e.message, true); }
    } }, c.status === 'draft' ? 'Delete draft' : 'Cancel contract'));
    cards.push(el('section', { class: 'card' }, el('h2', { text: 'History' }), el('div', { class: 'history' }, c.events.slice().reverse().map((e) => el('div', {}, el('time', { text: when(e.at) }), el('span', {}, el('strong', { text: e.who }), ' ', e.text))))));
    side.replaceChildren(...cards);
  }

  function signersCard(c) {
    return el('section', { class: 'card' }, el('h2', { text: 'Signing' }), c.signers.map((s) => el('div', { class: 'signer' },
      el('span', { class: 'avatar', text: initials(s.name), 'aria-hidden': 'true' }),
      el('span', { class: 'signer-main' }, el('strong', { text: s.name + (s.me ? ' (you)' : '') }), el('small', { text: [s.role, s.jobTitle].filter(Boolean).join(' · ') }),
        s.status === 'signed' ? el('span', { class: 'signature', text: s.signature }) : null, s.status === 'signed' ? el('small', { text: 'Signed ' + when(s.signedAt) }) : null,
        s.status === 'declined' ? el('small', { text: 'Declined: ' + s.reason }) : null, s.status === 'waiting' && s.viewedAt ? el('small', { text: 'Opened ' + when(s.viewedAt) }) : null),
      el('span', { class: 'pill ' + SIGNER[s.status][1], text: SIGNER[s.status][0] }))));
  }

  function signCard(c) {
    const name = el('input', { id: 'sign-name', autocomplete: 'name', maxlength: 120, value: me.user.fullName || '' });
    const preview = el('div', { class: 'typed-preview' }, el('span', { class: 'signature', text: name.value }));
    name.addEventListener('input', () => { preview.firstChild.textContent = name.value; });
    const agree = el('input', { type: 'checkbox', id: 'sign-agree' });
    const button = el('button', { class: 'btn primary large', type: 'submit', text: 'Sign contract' });
    const card = el('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault();
      if (c.can.mustView) return toast('Open and read the contract first.', true);
      button.disabled = true;
      try { await api('/api/contracts/' + c.id + '/sign', { json: { name: name.value, agree: agree.checked, sha256: c.file.sha256 } }); toast('Signed. Thank you.'); route(); }
      catch (err) { toast(err.message, true); button.disabled = false; }
    } }, el('h2', { text: 'Sign this contract' }),
      el('p', { class: 'muted small', text: c.can.mustView ? 'Open the contract on the left and read it first.' : 'Type your full name. It becomes your signature on this contract.' }),
      el('div', { class: 'field' }, el('label', { for: 'sign-name', text: 'Your full name' }), name), preview,
      el('label', { class: 'check' }, agree, el('span', { text: 'I’ve read this contract and I agree to sign it electronically. I understand my typed name is my signature.' })),
      el('div', { class: 'actions' }, button, el('button', { class: 'btn ghost danger-text', type: 'button', onclick: async () => {
        const reason = await ask('Decline to sign?', 'Tell the sender why, so they can change it. They’ll need to send a new version.', 'Decline', { danger: true, input: 'Your reason' });
        if (reason == null) return; if (!reason) return toast('Say why you’re declining.', true);
        try { await api('/api/contracts/' + c.id + '/decline', { json: { reason } }); toast('Declined.'); route(); } catch (err) { toast(err.message, true); }
      } }, 'Decline')));
    return card;
  }

  function signersEditor(c) {
    let list = c.signers.map((s) => ({ id: s.id, name: s.name, jobTitle: s.jobTitle, company: s.company, role: s.role }));
    const title = el('input', { id: 'c-title', value: c.title, maxlength: 160 }), message = el('textarea', { id: 'c-message', maxlength: 1000, placeholder: 'Optional. Shown to everyone who signs.' });
    message.value = c.message || '';
    const search = el('input', { id: 'c-search', placeholder: 'Search the staff list', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false' });
    const results = el('div', { class: 'picker-results', hidden: true });
    const chosen = el('div', { class: 'chosen' });
    const drawChosen = () => chosen.replaceChildren(...(list.length ? list.map((s, i) => el('div', { class: 'chosen-row' },
      el('span', {}, el('strong', { text: s.name }), el('small', { class: 'muted', text: ' ' + [s.jobTitle, s.company].filter(Boolean).join(', ') })),
      el('input', { value: s.role || '', placeholder: 'Signs as (optional)', 'aria-label': 'What ' + s.name + ' signs as', oninput: (e) => { s.role = e.target.value; } }),
      el('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Remove ' + s.name, onclick: () => { list.splice(i, 1); drawChosen(); } }, 'Remove'))) : [el('p', { class: 'muted small', text: 'Nobody yet. Search for each person who needs to sign, including anyone signing on behalf of the company.' })]));
    drawChosen();
    search.addEventListener('input', async () => {
      try { people = people || (await api('/api/people')).people; } catch (e) { toast(e.message, true); return; }
      const q = search.value.trim().toLowerCase();
      const hits = q ? people.filter((p) => !list.some((s) => s.id === p.id) && (p.name + ' ' + p.jobTitle + ' ' + p.company).toLowerCase().includes(q)).slice(0, 8) : [];
      results.replaceChildren(...hits.map((p) => el('button', { type: 'button', onclick: () => { list.push({ ...p, role: '' }); search.value = ''; results.hidden = true; search.setAttribute('aria-expanded', 'false'); drawChosen(); search.focus(); } },
        el('strong', { text: p.name }), el('small', { text: [p.jobTitle, p.company].filter(Boolean).join(' · ') }))));
      results.hidden = !hits.length; search.setAttribute('aria-expanded', String(!!hits.length));
    });
    const save = async () => api('/api/contracts/' + c.id, { method: 'PUT', json: { title: title.value, message: message.value, signers: list.map((s) => ({ id: s.id, role: s.role || '' })) } });
    return el('section', { class: 'card' }, el('h2', { text: 'Who signs it?' }),
      el('p', { class: 'muted small', text: 'Everyone signs in with their own HN Group Auth account to read and sign it. Nobody can sign until you send it.' }),
      el('div', { class: 'field' }, el('label', { for: 'c-title', text: 'Title' }), title),
      el('div', { class: 'field picker' }, el('label', { for: 'c-search', text: 'Add someone' }), search, results), chosen,
      el('div', { class: 'field' }, el('label', { for: 'c-message', text: 'Message' }), message),
      el('div', { class: 'actions' },
        el('button', { class: 'btn', type: 'button', onclick: async () => { try { await save(); toast('Draft saved.'); } catch (e) { toast(e.message, true); } } }, 'Save draft'),
        el('button', { class: 'btn primary', type: 'button', onclick: async () => {
          if (!list.length) return toast('Add at least one person to sign it.', true);
          if (!(await ask('Send for signing?', list.map((s) => s.name).join(', ') + (list.length === 1 ? ' will' : ' will each') + ' be able to sign it with their HN Group Auth account. You can’t change it after this.', 'Send'))) return;
          try { await save(); await api('/api/contracts/' + c.id + '/send', { json: {} }); toast('Sent for signing.'); route(); } catch (e) { toast(e.message, true); }
        } }, 'Send for signing')));
  }

  async function route() {
    const p = location.pathname;
    try {
      if (p === '/new') return newContract();
      const m = /^\/contract\/([0-9a-f-]{36})$/.exec(p);
      if (m) return await contractPage(m[1]);
      return await lists({ '/': 'home', '/signed': 'signed', '/sent': 'sent', '/all': 'all' }[p] || 'home');
    } catch (e) { if (e.message !== 'Signed out') main.replaceChildren(head('HN Group Contracts', 'Not available', e.message, el('p', {}, el('a', { class: 'btn', href: '/', text: 'Back to your contracts' })))); }
  }

  (async () => {
    try { me = await api('/api/me'); } catch { return; }
    $('who').hidden = false; $('who-name').textContent = me.user.displayName; $('who-role').textContent = me.user.jobTitle; $('who-avatar').textContent = initials(me.user.displayName);
    for (const n of document.querySelectorAll('[data-sender]')) n.hidden = !me.canSend;
    for (const n of document.querySelectorAll('[data-manager]')) n.hidden = !me.canManage;
    if (me.user.impersonated) document.body.prepend(el('div', { class: 'notice bad', text: 'You’re logged in as someone else, so you can look but not sign or send.' }));
    route();
  })();
})();
