'use strict';
// HN Group Contracts in the browser: the dashboard (to sign, in progress, finished, drafts, and everything for people
// who manage contracts), uploading a contract, and a contract's page: the PDF, who signs it and in what order, signing
// or declining, reminders, and for drafts choosing who signs and sending it.
(() => {
  const $ = (id) => document.getElementById(id);
  const main = $('main');
  let me = null, people = null, counts = null;

  // ---------- Helpers ----------
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
  let toastTimer;
  function toast(text, bad) { const t = $('toast'); t.textContent = text; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3800); }
  const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const day = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const STATUS = { draft: ['Draft', 'plain'], out: ['Out for signing', 'wait'], completed: ['Signed', 'good'], declined: ['Declined', 'bad'], cancelled: ['Cancelled', 'bad'] };
  const SIGNER = { waiting: ['Waiting', 'wait'], signed: ['Signed', 'good'], declined: ['Declined', 'bad'] };
  const tag = (text, kind) => el('span', { class: 'tag ' + kind, text });
  // Widths without inline styles (the security policy allows none): set through the CSS object model.
  const widths = (root) => requestAnimationFrame(() => root.querySelectorAll('[data-w]').forEach((s) => { s.style.width = s.dataset.w + '%'; }));

  // A question in the HN design (never the browser's own boxes). Resolves to true, the typed text, or null.
  function ask(title, text, ok, { danger, input } = {}) {
    const d = $('ask');
    $('ask-title').textContent = title; $('ask-text').textContent = text; $('ask-ok').textContent = ok;
    $('ask-ok').className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    const extra = $('ask-extra'); extra.replaceChildren();
    let field = null;
    if (input) { field = el('textarea', { rows: 3, placeholder: input, 'aria-label': input }); extra.append(field); }
    d.returnValue = ''; d.showModal(); (field || $('ask-cancel')).focus();
    return new Promise((resolve) => d.addEventListener('close', () => resolve(d.returnValue === 'ok' ? (field ? field.value.trim() : true) : null), { once: true }));
  }

  // ---------- Navigation ----------
  function go(path) { history.pushState({}, '', path); route(); window.scrollTo(0, 0); }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/"]');
    if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || a.hasAttribute('download') || /^\/(api|auth)\//.test(a.getAttribute('href'))) return;
    e.preventDefault(); $('site-nav').classList.remove('open'); document.querySelector('.menu-toggle').setAttribute('aria-expanded', 'false'); go(a.getAttribute('href'));
  });
  window.addEventListener('popstate', route);
  document.querySelector('.menu-toggle').addEventListener('click', (e) => { const open = e.currentTarget.getAttribute('aria-expanded') !== 'true'; e.currentTarget.setAttribute('aria-expanded', String(open)); $('site-nav').classList.toggle('open', open); });
  const header = document.querySelector('.site-header');
  window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 8), { passive: true });
  function setNav(view) { for (const a of document.querySelectorAll('#site-nav a[data-view]')) { if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); } }
  const section = (...kids) => el('section', { class: 'section compact' }, el('div', { class: 'wrap fade-in' }, ...kids));
  const head = (eyebrow, title, lead, ...extra) => el('div', { class: 'page-head' }, el('div', {}, el('p', { class: 'eyebrow', text: eyebrow }), el('h1', { class: 'page-title', text: title }), lead ? el('p', { class: 'lead', text: lead }) : null), ...extra);

  // ---------- Dashboard ----------
  const VIEWS = {
    sign: ['toSign', 'To sign', 'Contracts waiting for your signature. Open one to read it, then sign it with your name.', ['Nothing to sign', 'When someone sends you a contract, it appears here.']],
    waiting: ['waiting', 'In progress', 'Contracts you’ve sent or signed that are still waiting for someone.', ['Nothing in progress', 'Contracts waiting for other people appear here.']],
    completed: ['completed', 'Finished', 'Signed, declined and cancelled contracts.', ['Nothing finished yet', 'Contracts appear here once everyone has signed, or one is declined or cancelled.']],
    drafts: ['drafts', 'Drafts', 'Contracts you’ve uploaded but not sent yet.', ['No drafts', 'Upload a PDF, or use Send for signing in HN Group Docs.']],
    all: ['everything', 'All contracts', 'Every contract on HN Group Contracts.', ['No contracts yet', '']],
  };
  function row(c) {
    const meta = (c.mine ? 'You sent this' : 'From ' + c.sender) + ' · ' + (c.sentAt ? 'Sent ' + day(c.sentAt) : 'Created ' + day(c.createdAt)) + (c.dueDate && c.status === 'out' ? ' · Sign by ' + day(c.dueDate) : '') + ' · ' + c.signers.map((s) => s.name).join(', ');
    return el('a', { class: 'row', href: '/contract/' + c.id },
      el('span', { class: 'doc-icon', 'aria-hidden': 'true' }),
      el('span', {}, el('h3', { text: c.title }), el('span', { class: 'row-meta', text: meta })),
      el('span', { class: 'row-side' },
        c.needsMe ? tag(c.reminded ? 'Reminder: please sign' : 'Needs your signature', 'you') : tag(STATUS[c.status][0], STATUS[c.status][1]),
        c.overdue ? tag('Overdue', 'bad') : null,
        c.total ? el('span', { class: 'progress', title: c.signed + ' of ' + c.total + ' signed' }, el('span', { 'data-w': Math.round(c.signed / c.total * 100) })) : null));
  }
  async function dashboard(view) {
    setNav(view);
    const v = await api('/api/contracts');
    counts = { sign: v.toSign.length, waiting: v.waiting.length, completed: v.completed.length, drafts: v.drafts.length };
    $('count-sign').hidden = !counts.sign; $('count-sign').textContent = counts.sign;
    const [key, title, lead, empty] = VIEWS[view];
    const list = v[key] || [];
    const tiles = el('div', { class: 'tiles' }, [['sign', '/', 'To sign', 'c-purple'], ['waiting', '/waiting', 'In progress', 'c-teal'], ['completed', '/completed', 'Finished', 'c-lavender'], ...(me.canSend ? [['drafts', '/drafts', 'Drafts', 'c-raspberry']] : [])]
      .map(([k, href, label, colour]) => el('a', { class: 'tile', href, 'aria-current': k === view ? 'page' : null }, el('span', { class: 'pillar-bar ' + colour }), el('strong', { text: counts[k] }), el('span', { text: label }))));
    const search = el('input', { class: 'search', type: 'search', placeholder: 'Search by title or name', 'aria-label': 'Search contracts' });
    const box = el('div', { class: 'rows' });
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const shown = list.filter((c) => !q || (c.title + ' ' + c.sender + ' ' + c.signers.map((s) => s.name).join(' ')).toLowerCase().includes(q));
      box.replaceChildren(...(shown.length ? shown.map(row) : [el('div', { class: 'empty' }, el('h3', { text: q ? 'No matches' : empty[0] }), el('p', { text: q ? 'Try another search.' : empty[1] }))]));
      widths(box);
    };
    search.addEventListener('input', draw); draw();
    main.replaceChildren(section(head('Hello, ' + me.user.displayName.split(' ')[0], title, lead, me.canSend ? el('a', { class: 'btn btn-primary', href: '/new', text: 'New contract' }) : null),
      tiles, list.length > 4 ? el('p', {}, search) : null, box));
  }

  // ---------- Uploading ----------
  function newContract() {
    setNav('');
    if (!me.canSend) { main.replaceChildren(section(head('New contract', 'You can’t send contracts', 'Sending contracts needs the “Send contracts for signing” permission. Ask an administrator to add it to one of your roles in the staff portal.'))); return; }
    let picked = null;
    const file = el('input', { type: 'file', accept: 'application/pdf,.pdf', id: 'file', class: 'hp' });
    const chosen = el('span', { class: 'muted', text: 'PDF only, up to 25 MB' });
    const title = el('input', { id: 'title', maxlength: 160, placeholder: 'For example, Employee Agreement – Jo Bloggs', autocomplete: 'off' });
    const pick = (f) => { if (!f) return; if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') return toast('Choose a PDF file.', true); picked = f; chosen.textContent = f.name + ' · ' + Math.max(1, Math.round(f.size / 1024)) + ' KB'; if (!title.value) title.value = f.name.replace(/\.pdf$/i, ''); };
    const drop = el('label', { class: 'drop', for: 'file' }, el('span', { class: 'doc-icon', 'aria-hidden': 'true' }), el('strong', { text: 'Choose the contract PDF' }), el('span', { class: 'muted', text: 'or drop it here' }), chosen);
    file.addEventListener('change', () => pick(file.files[0]));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); pick(e.dataTransfer.files[0]); });
    const button = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Upload and choose who signs' });
    const form = el('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault();
      if (!picked) return toast('Choose the contract PDF first.', true);
      button.disabled = true; button.textContent = 'Uploading…';
      try {
        const v = await api('/api/contracts', { method: 'POST', body: picked, headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(picked.name), 'X-Title': encodeURIComponent(title.value.trim()) } });
        go('/contract/' + v.contract.id);
      } catch (err) { toast(err.message, true); button.disabled = false; button.textContent = 'Upload and choose who signs'; }
    } }, drop, file, el('label', { for: 'title', text: 'Title' }), title, button);
    main.replaceChildren(section(el('div', { class: 'narrow' }, head('New contract', 'Upload a contract', 'Next you’ll choose who signs it. Each person signs in with their own HN Group Auth account to read and sign it. You can also send any document from HN Group Docs with Send for signing.'), form)));
  }

  // ---------- A contract ----------
  async function contractPage(id) {
    setNav('');
    const { contract: c } = await api('/api/contracts/' + id);
    const viewer = el('section', { class: 'viewer' },
      el('div', { class: 'viewer-bar' }, el('span', {}, el('strong', { text: c.file.name }), el('span', { class: 'muted small', text: ' · ' + c.file.pages + ' page' + (c.file.pages === 1 ? '' : 's') })),
        el('span', { class: 'actions' }, el('a', { class: 'btn btn-small btn-ghost', href: '/api/contracts/' + c.id + '/file?download', download: true, text: 'Download' }),
          c.certificate ? el('a', { class: 'btn btn-small btn-primary', href: '/api/contracts/' + c.id + '/certificate?download', download: true, text: 'Signing certificate' }) : null)));
    const frame = () => el('iframe', { src: '/api/contracts/' + c.id + '/file', title: 'The contract: ' + c.title });
    const side = el('aside', { class: 'side' });
    // A signer has to open the contract before they can sign it; opening it is recorded.
    if (c.can.mustOpen) viewer.append(el('div', { class: 'viewer-closed' }, el('span', { class: 'doc-icon', 'aria-hidden': 'true' }), el('h3', { text: 'Read the contract before signing' }),
      el('p', { class: 'muted', text: 'Opening it is recorded on the contract’s history.' }),
      el('button', { class: 'btn btn-primary', type: 'button', onclick: () => { viewer.querySelector('.viewer-closed').replaceWith(frame()); setTimeout(() => refreshSide(c.id, side), 1200); } }, 'Open the contract')));
    else viewer.append(frame());
    const tags = el('p', { class: 'button-row' }, tag(STATUS[c.status][0], STATUS[c.status][1]), c.overdue ? tag('Overdue', 'bad') : null, c.source.kind === 'docs' ? tag('From HN Group Docs', 'plain') : null,
      c.order === 'sequence' ? tag('Signed in order', 'plain') : null, c.dueDate ? tag('Sign by ' + day(c.dueDate), c.overdue ? 'bad' : 'plain') : null);
    main.replaceChildren(section(head(c.mine ? 'You sent this' : 'From ' + c.sender.name, c.title, null, tags), el('div', { class: 'contract' }, viewer, side)));
    fillSide(c, side);
  }
  async function refreshSide(id, side) { try { fillSide((await api('/api/contracts/' + id)).contract, side); } catch (e) { toast(e.message, true); } }

  function fillSide(c, side) {
    const cards = [], mine = c.signers.find((s) => s.me);
    if (c.status === 'completed') cards.push(el('div', { class: 'notice good', text: 'Everyone has signed. Download the contract and its signing certificate above.' }));
    if (c.status === 'declined') cards.push(el('div', { class: 'notice bad', text: 'Someone declined to sign. The sender can cancel it and send a new version.' }));
    if (c.status === 'cancelled') cards.push(el('div', { class: 'notice bad', text: 'This contract was cancelled, so it can no longer be signed.' }));
    if (c.can.waitingFor) cards.push(el('div', { class: 'notice wait', text: 'This contract is signed in order. You can sign once ' + c.can.waitingFor + ' has signed.' }));
    if (mine && mine.status === 'waiting' && mine.remindedAt && c.status === 'out') cards.push(el('div', { class: 'notice wait', text: 'Reminder from ' + c.sender.name + ': please sign this contract' + (c.dueDate ? ' by ' + day(c.dueDate) : '') + '.' }));
    if (c.can.sign) cards.push(signCard(c));
    else if (mine && mine.status === 'signed') cards.push(el('div', { class: 'notice good', text: 'You signed this on ' + when(mine.signedAt) + '.' }));
    cards.push(c.can.edit ? draftCard(c) : signersCard(c));
    if (c.message && !c.can.edit) cards.push(el('div', { class: 'card' }, el('h2', { text: 'Message from ' + c.sender.name }), el('p', { text: c.message })));
    const actions = el('div', { class: 'button-row' },
      c.can.remind ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: async () => { try { await api('/api/contracts/' + c.id + '/remind', { json: {} }); toast('Reminder shown to the people still to sign.'); refreshSide(c.id, side); } catch (e) { toast(e.message, true); } } }, 'Remind') : null,
      c.can.cancel ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: async () => {
        const draft = c.status === 'draft';
        if (!(await ask(draft ? 'Delete this draft?' : 'Cancel this contract?', draft ? 'The draft and its PDF are deleted.' : 'Nobody will be able to sign it any more. Signatures already made stay in its history.', draft ? 'Delete draft' : 'Cancel contract', { danger: true }))) return;
        try { const v = await api('/api/contracts/' + c.id + '/cancel', { json: {} }); toast(v.deleted ? 'Draft deleted.' : 'Contract cancelled.'); if (v.deleted) go('/drafts'); else route(); } catch (e) { toast(e.message, true); }
      } }, c.status === 'draft' ? 'Delete draft' : 'Cancel contract') : null);
    if (actions.children.length) cards.push(actions);
    cards.push(el('div', { class: 'card' }, el('h2', { text: 'History' }), el('div', { class: 'history' }, c.events.slice().reverse().map((e) => el('div', {}, el('time', { text: when(e.at) }), el('span', {}, el('strong', { text: e.who }), ' ', e.text))))));
    side.replaceChildren(...cards);
  }

  function signersCard(c) {
    return el('div', { class: 'card' }, el('h2', { text: c.order === 'sequence' ? 'Signing, in order' : 'Signing' }),
      c.signers.map((s) => el('div', { class: 'signer' },
        c.order === 'sequence' ? el('span', { class: 'position', text: s.position }) : el('span', { class: 'avatar', text: initials(s.name), 'aria-hidden': 'true' }),
        el('span', {}, el('strong', { text: s.name + (s.me ? ' (you)' : '') }), el('small', { text: [s.role, s.jobTitle].filter(Boolean).join(' · ') }),
          s.status === 'signed' ? el('span', { class: 'signature', text: s.signature }) : null,
          s.status === 'signed' ? el('small', { text: 'Signed ' + when(s.signedAt) }) : null,
          s.status === 'declined' ? el('small', { text: 'Declined: ' + s.reason }) : null,
          s.status === 'waiting' && s.viewedAt ? el('small', { text: 'Opened ' + when(s.viewedAt) }) : null,
          s.status === 'waiting' && s.next ? el('small', { text: 'Next to sign' }) : null),
        tag(SIGNER[s.status][0], SIGNER[s.status][1]))));
  }

  function signCard(c) {
    const name = el('input', { id: 'sign-name', autocomplete: 'name', maxlength: 120, value: me.user.fullName || '' });
    const typed = el('div', { class: 'typed' }, el('span', { class: 'signature', text: name.value }));
    name.addEventListener('input', () => { typed.firstChild.textContent = name.value; });
    const agree = el('input', { type: 'checkbox', id: 'sign-agree' });
    const button = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Sign contract' });
    return el('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault();
      if (c.can.mustOpen) return toast('Open and read the contract first.', true);
      button.disabled = true;
      try { const v = await api('/api/contracts/' + c.id + '/sign', { json: { name: name.value, agree: agree.checked, sha256: c.file.sha256 } }); toast(v.contract.status === 'completed' ? 'Signed. Everyone has now signed.' : 'Signed. Thank you.'); route(); }
      catch (err) { toast(err.message, true); button.disabled = false; }
    } }, el('h2', { text: 'Sign this contract' }),
      el('p', { class: 'muted small', text: c.can.mustOpen ? 'Open the contract and read it first.' : 'Type your full name. It becomes your signature on this contract.' }),
      el('label', { for: 'sign-name', text: 'Your full name' }), name, typed,
      el('label', { class: 'check' }, agree, el('span', { text: 'I’ve read this contract and I agree to sign it electronically. I understand my typed name is my signature.' })),
      el('div', { class: 'button-row' }, button, el('button', { class: 'btn-link', type: 'button', onclick: async () => {
        const reason = await ask('Decline to sign?', 'Tell ' + c.sender.name + ' why, so they can change it. They’ll need to send a new version.', 'Decline', { danger: true, input: 'Your reason' });
        if (reason == null) return; if (!reason) return toast('Say why you’re declining.', true);
        try { await api('/api/contracts/' + c.id + '/decline', { json: { reason } }); toast('Declined.'); route(); } catch (err) { toast(err.message, true); }
      } }, 'Decline')));
  }

  // A draft: title, message, who signs (from the staff list, with what they sign as), the order and a date to sign by.
  function draftCard(c) {
    const list = c.signers.map((s) => ({ id: s.id, name: s.name, jobTitle: s.jobTitle, company: s.company, role: s.role }));
    const title = el('input', { id: 'c-title', value: c.title, maxlength: 160 });
    const message = el('textarea', { id: 'c-message', maxlength: 1000, rows: 3, placeholder: 'Optional. Everyone who signs sees it.' }); message.value = c.message || '';
    const due = el('input', { id: 'c-due', type: 'date', value: c.dueDate || '', min: new Date().toISOString().slice(0, 10) });
    const orderAny = el('input', { type: 'radio', name: 'order', value: 'any', checked: c.order !== 'sequence' }), orderSeq = el('input', { type: 'radio', name: 'order', value: 'sequence', checked: c.order === 'sequence' });
    const search = el('input', { id: 'c-search', type: 'search', placeholder: 'Search the staff list', autocomplete: 'off', 'aria-expanded': 'false', role: 'combobox', 'aria-controls': 'c-results' });
    const results = el('div', { class: 'results', id: 'c-results', role: 'listbox', hidden: true });
    const chosen = el('div', { class: 'chosen' });
    const drawChosen = () => chosen.replaceChildren(...(list.length ? list.map((s, i) => el('div', { class: 'chosen-row' },
      el('span', { class: 'avatar', text: initials(s.name), 'aria-hidden': 'true' }),
      el('span', {}, el('strong', { text: s.name }), el('small', { text: [s.jobTitle, s.company].filter(Boolean).join(', ') })),
      el('span', { class: 'order-buttons' },
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move ' + s.name + ' up', disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; drawChosen(); } }, '↑'),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move ' + s.name + ' down', disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; drawChosen(); } }, '↓'),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove ' + s.name, onclick: () => { list.splice(i, 1); drawChosen(); } }, '×')),
      el('input', { value: s.role || '', placeholder: 'Signs as, for example Employee', 'aria-label': 'What ' + s.name + ' signs as', oninput: (e) => { s.role = e.target.value; } })))
      : [el('p', { class: 'muted small', text: 'Nobody yet. Search for each person who needs to sign, including anyone signing on behalf of the company.' })]));
    drawChosen();
    search.addEventListener('input', async () => {
      try { people = people || (await api('/api/people')).people; } catch (e) { toast(e.message, true); return; }
      const q = search.value.trim().toLowerCase();
      const hits = q ? people.filter((p) => !list.some((s) => s.id === p.id) && (p.name + ' ' + p.jobTitle + ' ' + p.company).toLowerCase().includes(q)).slice(0, 8) : [];
      results.replaceChildren(...hits.map((p) => el('button', { type: 'button', role: 'option', onclick: () => { list.push({ ...p, role: '' }); search.value = ''; results.hidden = true; search.setAttribute('aria-expanded', 'false'); drawChosen(); search.focus(); } },
        el('strong', { text: p.name }), el('small', { text: [p.jobTitle, p.company].filter(Boolean).join(' · ') }))));
      results.hidden = !hits.length; search.setAttribute('aria-expanded', String(!!hits.length));
    });
    const save = () => api('/api/contracts/' + c.id, { method: 'PUT', json: { title: title.value, message: message.value, dueDate: due.value, order: orderSeq.checked ? 'sequence' : 'any', signers: list.map((s) => ({ id: s.id, role: s.role || '' })) } });
    return el('div', { class: 'card' }, el('h2', { text: 'Who signs it?' }),
      el('p', { class: 'muted small', text: 'Everyone signs in with their own HN Group Auth account to read and sign it. Nobody can sign until you send it.' }),
      el('label', { for: 'c-title', text: 'Title' }), title,
      el('div', { class: 'picker' }, el('label', { for: 'c-search', text: 'Add someone' }), search, results), chosen,
      el('p', { class: 'eyebrow', text: 'Order' }),
      el('div', { class: 'radio-row' }, el('label', {}, orderAny, el('span', {}, 'Any order', el('small', { text: 'Everyone can sign straight away.' }))),
        el('label', {}, orderSeq, el('span', {}, 'One after another', el('small', { text: 'Each person signs after the one above them, top to bottom.' })))),
      el('label', { for: 'c-due', text: 'Sign by', }, el('span', { class: 'optional', text: ' (optional)' })), due,
      el('label', { for: 'c-message', text: 'Message' }, el('span', { class: 'optional', text: ' (optional)' })), message,
      el('div', { class: 'button-row' },
        el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: async () => { try { await save(); toast('Draft saved.'); } catch (e) { toast(e.message, true); } } }, 'Save draft'),
        el('button', { class: 'btn btn-primary btn-small', type: 'button', onclick: async () => {
          if (!list.length) return toast('Add at least one person to sign it.', true);
          const names = list.map((s) => s.name).join(', ');
          if (!(await ask('Send for signing?', names + (list.length === 1 ? ' will' : ' will each') + ' be able to sign it with their HN Group Auth account' + (orderSeq.checked ? ', in that order' : '') + '. You can’t change it after this.', 'Send'))) return;
          try { await save(); await api('/api/contracts/' + c.id + '/send', { json: {} }); toast('Sent for signing.'); route(); } catch (e) { toast(e.message, true); }
        } }, 'Send for signing')));
  }

  // ---------- Start ----------
  async function route() {
    const p = location.pathname;
    try {
      if (p === '/new') return newContract();
      const m = /^\/contract\/([0-9a-f-]{36})$/.exec(p);
      if (m) return await contractPage(m[1]);
      const view = { '/': 'sign', '/sign': 'sign', '/waiting': 'waiting', '/completed': 'completed', '/drafts': 'drafts', '/all': 'all' }[p] || 'sign';
      return await dashboard(view === 'all' && !me.canManage ? 'sign' : view);
    } catch (e) {
      if (e.message !== 'Signed out') main.replaceChildren(section(head('HN Group Contracts', 'Not available', e.message, el('a', { class: 'btn btn-ghost', href: '/', text: 'Back to your contracts' }))));
    }
  }
  (async () => {
    $('year').textContent = new Date().getFullYear();
    try { me = await api('/api/me'); } catch (e) { if (e.message !== 'Signed out') main.replaceChildren(section(head('HN Group Contracts', 'Not available', e.message))); return; }
    $('who').hidden = false; $('who-name').textContent = me.user.displayName; $('who-avatar').textContent = initials(me.user.displayName);
    for (const n of document.querySelectorAll('[data-sender]')) n.hidden = !me.canSend;
    for (const n of document.querySelectorAll('[data-manager]')) n.hidden = !me.canManage;
    if (me.user.impersonated) document.body.insertBefore(el('div', { class: 'wrap' }, el('p', { class: 'notice bad', text: 'You’re logged in as someone else, so you can look but not sign or send.' })), main);
    route();
  })();
})();
