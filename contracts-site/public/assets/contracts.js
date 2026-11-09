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
  // Someone's profile picture (yours from HN Group Auth, anyone else's from the staff list), with their initials
  // underneath until it loads and if they haven't got one.
  function face(id, name, size) {
    const box = el('span', { class: 'avatar' + (size ? ' ' + size : ''), 'aria-hidden': 'true' }, el('span', { class: 'initials', text: initials(name) }));
    if (id) { const img = new Image(); img.alt = ''; img.decoding = 'async'; img.onload = () => { box.classList.add('has-photo'); box.append(img); }; img.src = '/api/picture/' + encodeURIComponent(id); }
    return box;
  }
  const faces = (people) => el('span', { class: 'faces' }, people.slice(0, 4).map((p) => face(p.id, p.name, 'small')), people.length > 4 ? el('span', { class: 'avatar small more', text: '+' + (people.length - 4) }) : null);
  const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const day = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const STATUS = { draft: ['Draft', 'plain'], out: ['Out for signing', 'wait'], completed: ['Signed', 'good'], declined: ['Declined', 'bad'], cancelled: ['Cancelled', 'bad'] };
  const SIGNER = { waiting: ['Waiting', 'wait'], signed: ['Signed', 'good'], declined: ['Declined', 'bad'] };
  const tag = (text, kind) => el('span', { class: 'tag ' + kind, text });
  // Widths without inline styles (the security policy allows none): set through the CSS object model.
  const widths = (root) => requestAnimationFrame(() => root.querySelectorAll('[data-w]').forEach((s) => { s.style.width = s.dataset.w + '%'; }));

  // A question in the HN design (never the browser's own boxes). Resolves to true, the typed text, or null.
  function ask(title, text, ok, { danger, input, content, info } = {}) {
    const d = $('ask');
    $('ask-title').textContent = title; $('ask-text').textContent = text; $('ask-ok').textContent = ok;
    $('ask-ok').className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    $('ask-cancel').hidden = !!info;
    const extra = $('ask-extra'); extra.replaceChildren();
    let field = null;
    if (input) { field = el('textarea', { rows: 3, placeholder: input, 'aria-label': input }); extra.append(field); }
    if (content) extra.append(content);
    d.returnValue = ''; d.showModal(); (field || (info ? $('ask-ok') : $('ask-cancel'))).focus();
    return new Promise((resolve) => d.addEventListener('close', () => resolve(d.returnValue === 'ok' ? (field ? field.value.trim() : true) : null), { once: true }));
  }

  // Each signer's own link and PIN (made when a contract is sent, or remade later), shown to the sender to pass on. They
  // can open, download and sign that one contract with them, without signing in, even if they aren't staff.
  async function copy(text, what) { try { await navigator.clipboard.writeText(text); toast(what + ' copied.'); } catch { toast('Couldn’t copy. Select it and copy it yourself.', true); } }
  function showAccess(access, contractTitle) {
    const list = el('div', { class: 'share-list' }, access.map((a) => {
      const note = 'Hi ' + a.name.split(' ')[0] + ', please read and sign “' + contractTitle + '” here: ' + a.url + '\nYour PIN is ' + a.pin + '.';
      return el('div', { class: 'share' },
        el('strong', { text: a.name }), el('small', { text: [a.roles.filter(Boolean).join(', '), a.email].filter(Boolean).join(' · ') }),
        el('div', { class: 'share-line' }, el('code', { text: a.url }), el('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => copy(a.url, 'Link') }, 'Copy link')),
        el('div', { class: 'share-line' }, el('code', { class: 'pin', text: a.pin }), el('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => copy(a.pin, 'PIN') }, 'Copy PIN'),
          el('button', { class: 'btn btn-small btn-primary', type: 'button', onclick: () => copy(note, 'Message with the link and PIN') }, 'Copy message')));
    }));
    return ask(access.length === 1 ? 'Signing link and PIN' : 'Signing links and PINs', 'Send each person their own link and PIN, ideally separately. They can open, download and sign this contract with them without signing in. You won’t see the PINs again, but you can make a new link and PIN from the contract at any time.', 'Done', { content: list, info: true });
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
  const section = (...kids) => el('section', { class: 'section compact' }, el('div', { class: 'wrap' }, ...kids));
  // Page heads are the main website's hero in small: its glow and the stepped stripe drawing in (hn-motion.js).
  const head = (eyebrow, title, lead, ...extra) => el('div', { class: 'page-head hn-glow' }, el('div', { class: 'head-steps', 'data-hn-steps': 'alive' }), el('div', {}, el('p', { class: 'eyebrow', text: eyebrow }), el('h1', { class: 'page-title', text: title }), lead ? el('p', { class: 'lead', text: lead }) : null), ...extra);

  // ---------- Dashboard ----------
  const VIEWS = {
    sign: ['toSign', 'To sign', 'Contracts waiting for your signature. Open one to read it, then sign it with your name.', ['Nothing to sign', 'When someone sends you a contract, it appears here.']],
    waiting: ['waiting', 'In progress', 'Contracts you’ve sent or signed that are still waiting for someone.', ['Nothing in progress', 'Contracts waiting for other people appear here.']],
    completed: ['completed', 'Finished', 'Signed and declined contracts.', ['Nothing finished yet', 'Contracts appear here once everyone has signed, or one is declined.']],
    cancelled: ['cancelled', 'Cancelled', 'Contracts that were cancelled before everyone signed. They can’t be signed any more.', ['Nothing cancelled', 'Cancelled contracts are kept here, out of the way of the others.']],
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
        faces(c.signers),
        c.total ? el('span', { class: 'progress', title: c.signed + ' of ' + c.total + ' signed' }, el('span', { 'data-w': Math.round(c.signed / c.total * 100) })) : null));
  }
  async function dashboard(view) {
    setNav(view);
    const v = await api('/api/contracts');
    counts = { sign: v.toSign.length, waiting: v.waiting.length, completed: v.completed.length, cancelled: (v.cancelled || []).length, drafts: v.drafts.length };
    $('count-sign').hidden = !counts.sign; $('count-sign').textContent = counts.sign; $('nav-cancelled').hidden = !counts.cancelled && view !== 'cancelled';
    const [key, title, lead, empty] = VIEWS[view];
    const list = v[key] || [];
    const tiles = el('div', { class: 'tiles' }, [['sign', '/', 'To sign', 'c-purple'], ['waiting', '/waiting', 'In progress', 'c-teal'], ['completed', '/completed', 'Finished', 'c-lavender'], ...(me.canSend ? [['drafts', '/drafts', 'Drafts', 'c-raspberry']] : []), ...(counts.cancelled || view === 'cancelled' ? [['cancelled', '/cancelled', 'Cancelled', 'c-plum']] : [])]
      .map(([k, href, label, colour]) => el('a', { class: 'tile', href, 'aria-current': k === view ? 'page' : null }, el('span', { class: 'pillar-bar ' + colour }), el('strong', { 'data-hn-count': counts[k], text: '0' }), el('span', { text: label }))));
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
  // The PDF is drawn on the page by PDF.js (kept in /assets/pdfjs), so it looks the same in every browser, in light and
  // dark, without the browser's own PDF toolbar. If PDF.js can't open it, the browser's viewer is used instead.
  let pdfjs = null;
  async function loadPdfjs() {
    if (!pdfjs) { pdfjs = await import('/assets/pdfjs/pdf.min.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = '/assets/pdfjs/pdf.worker.min.mjs'; }
    return pdfjs;
  }
  // ---------- Signature boxes ----------
  // The sender places each person's boxes on the contract (the user's request, 3 November 2026: "choose the boxes for the
  // signature name and date etc. and put them where I want"): pick a person and a box, click where it goes, then drag it
  // or its corner. Positions are kept as fractions of the page, so they don't depend on the zoom. Signers see where
  // their boxes are; once they sign, their signature, name, date and job title are written into them on the PDF.
  const BOX_TYPES = [['signature', 'Signature'], ['name', 'Full name'], ['date', 'Date signed'], ['jobTitle', 'Job title']];
  const BOX_LABEL = Object.fromEntries(BOX_TYPES);
  const BOX_SIZE = { signature: [190, 40], name: [170, 22], date: [120, 22], jobTitle: [170, 22] }; // PDF points
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function makePlacement(c) {
    const editable = c.can.edit;
    const list = c.signers.map((s) => ({ key: s.key, id: s.id, name: s.name, jobTitle: s.jobTitle, company: s.company, role: s.role, status: s.status, me: s.me, external: !!s.external, email: s.email || '' }));
    let fields = c.fields.map((f) => ({ ...f, signer: list[f.signer] })).filter((f) => f.signer);
    const automatic = (c.source && c.source.signatureLayout) || [], applied = new Map();
    list.forEach((s) => { if (fields.some((f) => f.signer === s)) applied.set(s, s.role); });
    const sheets = [], P = { list, editable, tool: null, onChange: () => {}, onTool: () => {} };
    const colour = (entry) => 'fc' + (list.indexOf(entry) % 6);
    const first = (n) => String(n || '').split(/\s+/)[0];
    function position(node, f) { node.style.left = f.x * 100 + '%'; node.style.top = f.y * 100 + '%'; node.style.width = f.w * 100 + '%'; node.style.height = f.h * 100 + '%'; }
    function changed() { P.onChange(); }
    function boxNode(f, sheet) {
      const who = f.signer, shared = list.filter((x) => x.id === who.id).length > 1;
      const label = BOX_LABEL[f.type] + ' · ' + (who.me && !editable ? 'you' : first(who.name)) + (shared ? ' (' + who.role.replace(/^On behalf of /, 'for ') + ')' : '');
      const node = el('div', { class: 'field-box ' + colour(who) + (who.me && !editable ? ' mine' : ''), title: label + ' – ' + who.name, ...(editable ? { tabindex: '0', role: 'button', 'aria-label': label + '. Drag to move, arrow keys to nudge, Delete to remove.' } : {}) },
        el('span', { class: 'field-label', text: label }));
      position(node, f);
      if (!editable) return node;
      const remove = () => { fields = fields.filter((x) => x !== f); drawSheet(sheet); changed(); };
      node.append(el('button', { class: 'field-x', type: 'button', 'aria-label': 'Remove this box', onclick: (e) => { e.stopPropagation(); remove(); } }, '×'), el('span', { class: 'field-grip', 'aria-hidden': 'true' }));
      node.addEventListener('pointerdown', (e) => {
        if (e.button > 0 || e.target.closest('.field-x')) return;
        e.preventDefault(); e.stopPropagation(); node.focus({ preventScroll: true });
        const rect = sheet.layer.getBoundingClientRect(), resize = !!e.target.closest('.field-grip'), start = { px: e.clientX, py: e.clientY, x: f.x, y: f.y, w: f.w, h: f.h };
        node.setPointerCapture(e.pointerId); node.classList.add('dragging');
        const move = (ev) => {
          const dx = (ev.clientX - start.px) / rect.width, dy = (ev.clientY - start.py) / rect.height;
          if (resize) { f.w = clamp(start.w + dx, 0.03, 1 - f.x); f.h = clamp(start.h + dy, 0.012, 1 - f.y); }
          else { f.x = clamp(start.x + dx, 0, 1 - f.w); f.y = clamp(start.y + dy, 0, 1 - f.h); }
          position(node, f);
        };
        const up = () => { node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up); node.classList.remove('dragging'); changed(); };
        node.addEventListener('pointermove', move); node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up);
      });
      node.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 0.02 : 0.004, moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return; }
        if (!moves[e.key]) return;
        e.preventDefault(); f.x = clamp(f.x + moves[e.key][0], 0, 1 - f.w); f.y = clamp(f.y + moves[e.key][1], 0, 1 - f.h); position(node, f); changed();
      });
      return node;
    }
    function drawSheet(sheet) {
      // Signers only see boxes still waiting for a signature; signed ones are written on the PDF itself.
      const shown = fields.filter((f) => f.page === sheet.index && (editable || f.signer.status === 'waiting'));
      sheet.layer.replaceChildren(...shown.map((f) => boxNode(f, sheet)));
    }
    P.attach = (index, size) => {
      const layer = el('div', { class: 'field-layer' + (editable ? ' editable' : '') + (P.tool ? ' placing' : '') });
      const sheet = { index, size, layer };
      sheets[index] = sheet;
      if (editable) layer.addEventListener('click', (e) => {
        if (!P.tool || e.target !== layer) return;
        const r = layer.getBoundingClientRect(), [pw, ph] = BOX_SIZE[P.tool.type];
        const w = clamp(pw / size.width, 0.03, 1), h = clamp(ph / size.height, 0.012, 1);
        fields.push({ signer: P.tool.signer, type: P.tool.type, page: index, x: clamp((e.clientX - r.left) / r.width - w / 2, 0, 1 - w), y: clamp((e.clientY - r.top) / r.height - h / 2, 0, 1 - h), w, h });
        P.setTool(null); drawSheet(sheet); changed();
        const placed = layer.lastElementChild; if (placed) placed.focus({ preventScroll: true });
      });
      drawSheet(sheet);
      return layer;
    };
    P.setTool = (tool) => { P.tool = tool; for (const sh of sheets) if (sh) sh.layer.classList.toggle('placing', !!tool); P.onTool(tool); };
    // After people are added, removed or reordered: drop boxes for anyone no longer signing and redraw.
    P.refresh = () => {
      fields = fields.filter((f) => list.includes(f.signer));
      if (editable) for (const s of list) {
        if (applied.get(s) === s.role) continue;
        fields = fields.filter((f) => !(f.signer === s && f.automatic));
        const layout = automatic.find((a) => a.role.toLowerCase() === String(s.role || '').toLowerCase());
        if (layout && !fields.some((f) => f.signer === s)) {
          fields.push(...layout.fields.map((f) => ({ ...f, signer: s, automatic: true })));
          applied.set(s, s.role);
        }
      }
      if (P.tool && !list.includes(P.tool.signer)) P.setTool(null);
      for (const sh of sheets) if (sh) drawSheet(sh);
    };
    P.count = (entry) => fields.filter((f) => f.signer === entry).length;
    P.clear = () => { fields = []; list.forEach((s) => applied.set(s, s.role)); for (const sh of sheets) if (sh) drawSheet(sh); changed(); };
    P.total = () => fields.length;
    P.payload = () => fields.filter((f) => list.includes(f.signer)).map((f) => ({ signer: list.indexOf(f.signer), type: f.type, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h }));
    P.colour = colour;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && P.tool) P.setTool(null); });
    return P;
  }

  function pdfViewer(c, bar, placement) {
    const url = '/api/contracts/' + c.id + '/file';
    const pages = el('div', { class: 'pages', tabindex: '0', role: 'region', 'aria-label': 'The contract: ' + c.title }, el('div', { class: 'pages-loading' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Opening the contract…'));
    const pageNo = el('span', { class: 'page-no', 'aria-live': 'polite' });
    const zoomText = el('span', { class: 'zoom-text', text: 'Fit' });
    let doc = null, sizes = [], slots = [], zoom = 1, observer = null;
    const zoomBy = (f) => { zoom = Math.min(3, Math.max(0.5, Math.round(zoom * f * 100) / 100)); layout(); };
    bar.querySelector('.zoom').append(
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Zoom out', onclick: () => zoomBy(1 / 1.2) }, '−'), zoomText,
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Zoom in', onclick: () => zoomBy(1.2) }, '+'),
      el('button', { class: 'btn-text', type: 'button', onclick: () => { zoom = 1; layout(); } }, 'Fit width'), pageNo);
    async function draw(slot) {
      if (slot.drawn === slot.width || !doc) return;
      const width = slot.drawn = slot.width, page = await doc.getPage(slot.n);
      const ratio = Math.min(window.devicePixelRatio || 1, 2), view = page.getViewport({ scale: width / sizes[slot.n - 1].width * ratio });
      const canvas = el('canvas', { width: Math.floor(view.width), height: Math.floor(view.height), 'aria-hidden': 'true' });
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: view }).promise;
      if (slot.drawn === width) slot.node.replaceChildren(canvas, ...(slot.layer ? [slot.layer] : []));
    }
    function layout() {
      if (!doc) return;
      const fit = Math.max(260, pages.clientWidth - 48);
      zoomText.textContent = zoom === 1 ? 'Fit' : Math.round(zoom * 100) + '%';
      for (const slot of slots) {
        slot.width = Math.round(Math.min(fit * zoom, 2400));
        slot.node.style.width = slot.width + 'px';
        slot.node.style.height = Math.round(slot.width * sizes[slot.n - 1].height / sizes[slot.n - 1].width) + 'px';
        if (slot.visible) draw(slot);
      }
    }
    function track() {
      const top = pages.getBoundingClientRect().top + pages.clientHeight / 3;
      let n = 1; for (const slot of slots) if (slot.node.getBoundingClientRect().top <= top) n = slot.n;
      pageNo.textContent = 'Page ' + n + ' of ' + slots.length;
    }
    (async () => {
      try {
        const lib = await loadPdfjs();
        doc = await lib.getDocument({ url, isEvalSupported: false, withCredentials: true }).promise;
        for (let i = 1; i <= doc.numPages; i++) { const v = (await doc.getPage(i)).getViewport({ scale: 1 }); sizes.push({ width: v.width, height: v.height }); }
        observer = new IntersectionObserver((entries) => { for (const e of entries) { const slot = slots.find((x) => x.node === e.target); slot.visible = e.isIntersecting; if (e.isIntersecting) draw(slot); } }, { root: pages, rootMargin: '400px 0px' });
        slots = sizes.map((size, i) => {
          const slot = { n: i + 1, node: el('div', { class: 'sheet', 'aria-label': 'Page ' + (i + 1) }), drawn: 0, width: 0, visible: false };
          if (placement) { slot.layer = placement.attach(i, size); slot.node.append(slot.layer); }
          return slot;
        });
        pages.replaceChildren(...slots.map((x) => x.node));
        slots.forEach((x) => observer.observe(x.node));
        layout(); track();
        pages.addEventListener('scroll', track, { passive: true });
        new ResizeObserver(() => layout()).observe(pages);
      } catch (e) {
        bar.querySelector('.zoom').replaceChildren();
        pages.replaceWith(el('iframe', { src: url + '#toolbar=0&navpanes=0&view=FitH', title: 'The contract: ' + c.title }));
      }
    })();
    return pages;
  }

  async function contractPage(id) {
    setNav('');
    const { contract: c } = await api('/api/contracts/' + id);
    // Signatures are written onto the PDF as each person signs; the original stays as it was uploaded.
    const signedSoFar = c.signers.some((s) => s.status === 'signed');
    const bar = el('div', { class: 'viewer-bar' },
      el('span', { class: 'file' }, el('span', { class: 'doc-icon small', 'aria-hidden': 'true' }), el('span', {}, el('strong', { text: c.file.name }), el('small', { text: c.file.pages + ' page' + (c.file.pages === 1 ? '' : 's') + (signedSoFar ? ' · with signatures' : '') }))),
      el('span', { class: 'zoom' }),
      el('span', { class: 'actions' }, signedSoFar ? el('a', { class: 'btn-text', href: '/api/contracts/' + c.id + '/file?original&download', download: true, title: 'The PDF exactly as it was uploaded, without signatures', text: 'Original' }) : null,
        el('a', { class: 'btn btn-small btn-ghost', href: '/api/contracts/' + c.id + '/file?download', download: true, text: 'Download' }),
        c.certificate ? el('a', { class: 'btn btn-small btn-primary', href: '/api/contracts/' + c.id + '/certificate?download', download: true, text: 'Signing certificate' }) : null));
    const viewer = el('section', { class: 'viewer' }, bar);
    // Placed boxes: editable on a draft, and shown to signers while the contract is out for signing.
    const placement = c.can.edit || (c.status === 'out' && c.fields.length) ? makePlacement(c) : null;
    const side = el('aside', { class: 'side' });
    // A signer has to open the contract before they can sign it; opening it is recorded.
    if (c.can.mustOpen) viewer.append(el('div', { class: 'viewer-closed' }, el('span', { class: 'doc-icon', 'aria-hidden': 'true' }), el('h3', { text: 'Read the contract before you sign' }),
      el('p', { class: 'muted', text: 'Opening it is recorded on the contract’s history.' }),
      el('button', { class: 'btn btn-primary', type: 'button', onclick: () => { viewer.querySelector('.viewer-closed').replaceWith(pdfViewer(c, bar, placement)); setTimeout(() => refreshSide(c.id, side), 1500); } }, 'Open the contract')));
    else viewer.append(pdfViewer(c, bar, placement));
    const tags = el('div', { class: 'tags' }, tag(STATUS[c.status][0], STATUS[c.status][1]), c.overdue ? tag('Overdue', 'bad') : null, c.source.kind === 'docs' ? tag('From HN Group Docs', 'plain') : null,
      c.order === 'sequence' ? tag('Signed in order', 'plain') : null, c.dueDate ? tag('Sign by ' + day(c.dueDate), c.overdue ? 'bad' : 'plain') : null);
    const back = c.status === 'draft' ? ['/drafts', 'Drafts'] : c.can.sign ? ['/', 'To sign'] : c.status === 'cancelled' ? ['/cancelled', 'Cancelled'] : ['completed', 'declined'].includes(c.status) ? ['/completed', 'Finished'] : ['/waiting', 'In progress'];
    const pageHead = el('div', { class: 'contract-head hn-glow' },
      el('a', { class: 'back', href: back[0], text: '← ' + back[1] }),
      el('h1', { text: c.title }),
      el('div', { class: 'byline' }, face(c.sender.id, c.sender.name, 'tiny'), el('span', { text: (c.mine ? 'You' : c.sender.name) + (c.sentAt ? ' sent this on ' + day(c.sentAt) : ' uploaded this on ' + day(c.createdAt)) }), tags));
    main.replaceChildren(section(pageHead, el('div', { class: 'contract' }, viewer, side)));
    fillSide(c, side, placement);
  }
  async function refreshSide(id, side) { try { fillSide((await api('/api/contracts/' + id)).contract, side); } catch (e) { toast(e.message, true); } }

  function fillSide(c, side, placement) {
    const cards = [], mineAll = c.signers.filter((s) => s.me), mine = mineAll.find((s) => s.status === 'waiting') || mineAll[0];
    if (c.status === 'completed') cards.push(el('div', { class: 'notice good', text: 'Everyone has signed. Download the contract and its signing certificate above.' }));
    if (c.status === 'declined') cards.push(el('div', { class: 'notice bad', text: 'Someone declined to sign. The sender can cancel it and send a new version.' }));
    if (c.status === 'cancelled') cards.push(el('div', { class: 'notice bad', text: 'This contract was cancelled, so it can no longer be signed.' }));
    if (c.can.waitingFor) cards.push(el('div', { class: 'notice wait', text: 'This contract is signed in order. You can sign once ' + c.can.waitingFor + ' has signed.' }));
    if (mine && mine.status === 'waiting' && mine.remindedAt && c.status === 'out') cards.push(el('div', { class: 'notice wait', text: 'Reminder from ' + c.sender.name + ': please sign this contract' + (c.dueDate ? ' by ' + day(c.dueDate) : '') + '.' }));
    if (c.can.sign) cards.push(signCard(c));
    else if (mineAll.length && mineAll.every((s) => s.status === 'signed')) cards.push(el('div', { class: 'notice good', text: 'You signed this on ' + when(mineAll.map((s) => s.signedAt).sort().pop()) + '.' }));
    cards.push(c.can.edit ? draftCard(c, placement) : signersCard(c));
    if (c.message && !c.can.edit) cards.push(el('div', { class: 'card' }, el('h2', { text: 'Message from ' + c.sender.name }), el('p', { text: c.message })));
    const actions = el('div', { class: 'button-row' },
      c.can.remind ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: async () => { try { await api('/api/contracts/' + c.id + '/remind', { json: {} }); toast('Reminder shown to the people still to sign.'); refreshSide(c.id, side); } catch (e) { toast(e.message, true); } } }, 'Remind') : null,
      c.can.cancel ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: async () => {
        const draft = c.status === 'draft';
        if (!(await ask(draft ? 'Delete this draft?' : 'Cancel this contract?', draft ? 'The draft and its PDF are deleted.' : 'Nobody will be able to sign it any more. Signatures already made stay in its history.', draft ? 'Delete draft' : 'Cancel contract', { danger: true }))) return;
        try { const v = await api('/api/contracts/' + c.id + '/cancel', { json: {} }); toast(v.deleted ? 'Draft deleted.' : 'Contract cancelled. It’s now under Cancelled.'); go(v.deleted ? '/drafts' : '/cancelled'); } catch (e) { toast(e.message, true); }
      } }, c.status === 'draft' ? 'Delete draft' : 'Cancel contract') : null);
    if (actions.children.length) cards.push(actions);
    cards.push(el('div', { class: 'card' }, el('h2', { text: 'History' }), el('div', { class: 'history' }, c.events.slice().reverse().map((e) => el('div', {}, el('time', { text: when(e.at) }), el('span', {}, el('strong', { text: e.who }), ' ', e.text))))));
    side.replaceChildren(...cards);
  }

  function signersCard(c) {
    const firstOf = (s) => c.signers.find((x) => x.id === s.id) === s;
    const newLink = async (s) => {
      if (!(await ask('Make a new link and PIN for ' + s.name + '?', 'Their current link and PIN stop working straight away.', 'Make new link'))) return;
      try { const v = await api('/api/contracts/' + c.id + '/link', { json: { person: s.id } }); showAccess(v.access, c.title); } catch (e) { toast(e.message, true); }
    };
    return el('div', { class: 'card' }, el('h2', { text: c.order === 'sequence' ? 'Signing, in order' : 'Signing' }),
      c.signers.map((s) => el('div', { class: 'signer' },
        el('span', { class: 'face-wrap' }, face(s.id, s.name), c.order === 'sequence' ? el('span', { class: 'position', text: s.position }) : null),
        el('span', {}, el('strong', { text: s.name + (s.me ? ' (you)' : '') }, s.external ? el('span', { class: 'ext-chip', text: 'Outside HN Group' }) : null), s.role ? el('span', { class: 'role-chip', text: s.role }) : null, el('small', { text: [s.jobTitle, s.company, s.email].filter(Boolean).join(' · ') }),
          s.status === 'signed' ? el('span', { class: 'signature', text: s.signature }) : null,
          s.status === 'signed' ? el('small', { text: 'Signed ' + when(s.signedAt) }) : null,
          s.status === 'declined' ? el('small', { text: 'Declined: ' + s.reason }) : null,
          s.status === 'waiting' && s.viewedAt ? el('small', { text: 'Opened ' + when(s.viewedAt) }) : null,
          s.status === 'waiting' && s.next ? el('small', { text: 'Next to sign' }) : null,
          s.linkUsedAt && firstOf(s) ? el('small', { text: 'Used their signing link ' + when(s.linkUsedAt) }) : null,
          c.can.links && firstOf(s) && c.signers.some((x) => x.id === s.id && x.status === 'waiting') ? el('button', { class: 'btn-text small', type: 'button', onclick: () => newLink(s) }, 'New link & PIN') : null),
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
      c.can.signAs.length > 1 ? el('p', { class: 'notice wait small', text: 'You sign this as ' + c.can.signAs.slice(0, -1).join(', ') + ' and ' + c.can.signAs[c.can.signAs.length - 1] + '. One signature covers them all.' }) : null,
      el('label', { for: 'sign-name', text: 'Your full name' }), name, typed,
      el('label', { class: 'check' }, agree, el('span', { text: 'I’ve read this contract and I agree to sign it electronically. I understand my typed name is my signature.' })),
      el('div', { class: 'button-row' }, button, el('button', { class: 'btn-link', type: 'button', onclick: async () => {
        const reason = await ask('Decline to sign?', 'Tell ' + c.sender.name + ' why, so they can change it. They’ll need to send a new version.', 'Decline', { danger: true, input: 'Your reason' });
        if (reason == null) return; if (!reason) return toast('Say why you’re declining.', true);
        try { await api('/api/contracts/' + c.id + '/decline', { json: { reason } }); toast('Declined.'); route(); } catch (err) { toast(err.message, true); }
      } }, 'Decline')));
  }

  // A draft: who signs (from the staff list, each with what they sign as, chosen from a list), the order, the title, a
  // date to sign by and a message.
  function roleSelect(s, changed) {
    const roles = me.roles.includes(s.role) || !s.role ? me.roles : [s.role, ...me.roles];
    const pick = el('select', { 'aria-label': 'What ' + s.name + ' signs as', onchange: (e) => { s.role = e.target.value; if (changed) changed(); } },
      el('option', { value: '', text: 'Choose what they sign as', disabled: true, selected: !s.role }),
      el('optgroup', { label: 'Signs as' }, roles.filter((r) => !r.startsWith('On behalf of ')).map((r) => el('option', { value: r, text: r, selected: r === s.role }))),
      el('optgroup', { label: 'Signs for the employer' }, roles.filter((r) => r.startsWith('On behalf of ')).map((r) => el('option', { value: r, text: r, selected: r === s.role }))));
    return el('label', { class: 'role' }, el('span', { text: 'Signs as' }), pick);
  }
  // Step 2 of a draft: whose box, what it's for, then click on the contract.
  function boxesPart(P) {
    const who = el('select', { 'aria-label': 'Whose box' });
    const hint = el('p', { class: 'muted small', 'aria-live': 'polite' });
    const counts = el('div', { class: 'box-counts' });
    const typeButtons = BOX_TYPES.map(([type, label]) => el('button', { class: 'box-type', type: 'button', 'aria-pressed': 'false', 'data-type': type, onclick: () => {
      const entry = P.list[Number(who.value)];
      if (!entry) return toast('Add who signs first.', true);
      P.setTool(P.tool && P.tool.type === type && P.tool.signer === entry ? null : { signer: entry, type });
    } }, el('span', { class: 'box-swatch', 'aria-hidden': 'true' }), label));
    const clearAll = el('button', { class: 'btn-link', type: 'button', onclick: async () => { if (P.total() && await ask('Remove every box?', 'Everyone will sign in the contract’s own signing blocks, or on a signatures page at the end.', 'Remove boxes', { danger: true })) P.clear(); } }, 'Remove all boxes');
    const node = el('div', { class: 'boxes' },
      el('p', { class: 'muted small', text: 'Staff contracts sent from Docs place the name, signature, job title and date boxes automatically when you choose who signs and their role. You can still drag or resize them, remove them, or choose a box below and click on the page to place it manually.' }),
      el('label', { class: 'role' }, el('span', { text: 'For' }), who), el('div', { class: 'box-types' }, typeButtons), hint, counts, clearAll);
    function update() {
      const keep = who.value;
      who.replaceChildren(...P.list.map((s, i) => el('option', { value: String(i), text: s.name + (s.role ? ' – ' + s.role : '') })));
      if (keep && Number(keep) < P.list.length) who.value = keep;
      who.className = P.list.length ? P.colour(P.list[Number(who.value) || 0]) : '';
      for (const b of typeButtons) b.disabled = !P.list.length;
      counts.replaceChildren(...P.list.filter((s) => P.count(s)).map((s) => el('span', { class: 'box-count ' + P.colour(s) }, el('span', { class: 'box-swatch', 'aria-hidden': 'true' }), s.name.split(' ')[0] + ' ' + P.count(s))));
      clearAll.hidden = !P.total();
      tool(P.tool);
    }
    function tool(t) {
      for (const b of typeButtons) b.setAttribute('aria-pressed', String(!!t && t.type === b.dataset.type));
      hint.textContent = t ? 'Now click on the contract where ' + t.signer.name.split(' ')[0] + '’s ' + BOX_LABEL[t.type].toLowerCase() + ' goes. Esc cancels.' : P.list.length ? '' : 'Add who signs first.';
      document.querySelector('.pages') && document.querySelector('.pages').classList.toggle('placing', !!t);
    }
    who.addEventListener('change', () => { who.className = P.colour(P.list[Number(who.value)]); if (P.tool) P.setTool(null); });
    P.onTool = tool; P.onChange = update;
    update();
    return { node, update };
  }

  function draftCard(c, placement) {
    const list = placement.list;
    const title = el('input', { id: 'c-title', value: c.title, maxlength: 160 });
    const message = el('textarea', { id: 'c-message', maxlength: 1000, rows: 3, placeholder: 'Optional. Everyone who signs sees it.' }); message.value = c.message || '';
    const due = el('input', { id: 'c-due', type: 'date', value: c.dueDate || '', min: new Date().toISOString().slice(0, 10) });
    const orderAny = el('input', { type: 'radio', name: 'order', value: 'any', checked: c.order !== 'sequence' }), orderSeq = el('input', { type: 'radio', name: 'order', value: 'sequence', checked: c.order === 'sequence' });
    const search = el('input', { id: 'c-search', type: 'search', placeholder: 'Search the staff list by name, legal name or job', autocomplete: 'off', 'aria-expanded': 'false', role: 'combobox', 'aria-controls': 'c-results' });
    const results = el('div', { class: 'results', id: 'c-results', role: 'listbox', hidden: true });
    const chosen = el('div', { class: 'chosen' });
    const boxes = boxesPart(placement);
    const drawChosen = () => { placement.refresh(); boxes.update(); chosen.replaceChildren(...(list.length ? list.map((s, i) => el('div', { class: 'chosen-row' },
      el('span', { class: 'face-wrap' }, face(s.id, s.name, 'small'), el('span', { class: 'position', text: i + 1 })),
      el('span', { class: 'who-text' }, el('strong', { text: s.name }, s.external ? el('span', { class: 'ext-chip', text: 'Outside HN Group' }) : null), el('small', { text: [s.jobTitle, s.company, s.email].filter(Boolean).join(' · ') })),
      el('span', { class: 'order-buttons' },
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move ' + s.name + ' up', disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; drawChosen(); } }, '↑'),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Move ' + s.name + ' down', disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; drawChosen(); } }, '↓'),
        el('button', { class: 'icon-btn remove', type: 'button', 'aria-label': 'Remove ' + s.name, onclick: () => { list.splice(i, 1); drawChosen(); } }, '×')),
      roleSelect(s, () => { placement.refresh(); boxes.update(); })))
      : [el('div', { class: 'chosen-empty' }, el('strong', { text: 'Nobody yet' }), el('span', { text: 'Add the employee and the person signing on behalf of HN Group.' }))])); };
    drawChosen();
    search.addEventListener('input', async () => {
      try { people = people || (await api('/api/people')).people; } catch (e) { toast(e.message, true); return; }
      const q = search.value.trim().toLowerCase();
      // Someone already on the list can be added again to sign as something else (as the employee and for the employer).
      // Their display name, legal name (first and last name), job or company; words in any order.
      const words = q.split(/\s+/).filter(Boolean);
      const hits = q ? people.filter((p) => { const hay = (p.name + ' ' + (p.legalName || '') + ' ' + p.jobTitle + ' ' + p.company).toLowerCase(); return words.every((w) => hay.includes(w)); }).slice(0, 8) : [];
      // The first person added is usually the employee, and anyone after them signs for the employer.
      results.replaceChildren(...hits.map((p) => el('button', { type: 'button', role: 'option', onclick: () => { list.push({ ...p, role: list.some((s) => s.role === 'Employee') ? 'On behalf of HN Group Limited' : 'Employee' }); search.value = ''; results.hidden = true; search.setAttribute('aria-expanded', 'false'); drawChosen(); search.focus(); } },
        face(p.id, p.name, 'small'), el('span', {}, el('strong', { text: p.name }, p.legalName && p.legalName.toLowerCase() !== p.name.toLowerCase() ? el('span', { class: 'legal-name', text: ' (' + p.legalName + ')' }) : null), el('small', { text: list.some((s) => s.id === p.id) ? 'Already signing as ' + list.filter((s) => s.id === p.id).map((s) => s.role).join(', ') + '. Add again to sign as something else.' : [p.jobTitle, p.company].filter(Boolean).join(' · ') })))));
      results.hidden = !hits.length; search.setAttribute('aria-expanded', String(!!hits.length));
    });
    const save = () => api('/api/contracts/' + c.id, { method: 'PUT', json: { title: title.value, message: message.value, dueDate: due.value, order: orderSeq.checked ? 'sequence' : 'any', signers: list.map((s) => (s.external ? { id: s.id || '', external: true, name: s.name, email: s.email || '', company: s.company || '', role: s.role || '' } : { id: s.id, role: s.role || '' })), fields: placement.payload() } });
    // Someone outside HN Group signs with their own link and PIN (they have no HN Group Auth account).
    const extName = el('input', { placeholder: 'Their full name', maxlength: 120, 'aria-label': 'Name of the person outside HN Group' });
    const extEmail = el('input', { type: 'email', placeholder: 'Email (optional)', maxlength: 200, 'aria-label': 'Their email address' });
    const extCompany = el('input', { placeholder: 'Organisation (optional)', maxlength: 120, 'aria-label': 'Their organisation' });
    const extBox = el('div', { class: 'external-add', hidden: true }, el('div', { class: 'row' }, extName, extEmail), extCompany,
      el('div', { class: 'button-row' }, el('button', { class: 'btn btn-small btn-primary', type: 'button', onclick: () => {
        const name = extName.value.trim();
        if (name.length < 2) return toast('Type their full name.', true);
        list.push({ id: '', external: true, name, email: extEmail.value.trim(), company: extCompany.value.trim(), jobTitle: '', role: list.some((s) => s.role === 'Employee') ? 'Witness' : 'Employee' });
        extName.value = extEmail.value = extCompany.value = ''; extBox.hidden = true; drawChosen();
      } }, 'Add'), el('button', { class: 'btn-text small', type: 'button', onclick: () => { extBox.hidden = true; } }, 'Cancel')),
      el('p', { class: 'muted small', text: 'They’ll sign with their own link and PIN, which you’ll get when you send it.' }));
    const outside = el('div', {}, el('button', { class: 'btn-text small', type: 'button', onclick: () => { extBox.hidden = false; extName.focus(); } }, '+ Someone outside HN Group'), extBox);
    const part = (n, heading, ...kids) => el('div', { class: 'part' }, el('h3', {}, el('span', { class: 'step', text: n }), heading), ...kids);
    return el('div', { class: 'card draft' },
      el('div', { class: 'draft-head' }, el('h2', { text: 'Get it signed' }), el('p', { text: 'Each person reads and signs it with their HN Group Auth account, or with their own signing link and PIN (you get these when you send it). Nobody can see it until you send it.' })),
      part(1, 'Who signs', el('div', { class: 'picker' }, search, results), outside, chosen),
      part(2, 'Signature boxes', boxes.node),
      part(3, 'Order',
        el('div', { class: 'segmented' }, el('label', {}, orderAny, el('span', {}, el('strong', { text: 'Any order' }), el('small', { text: 'Everyone can sign at once' }))),
          el('label', {}, orderSeq, el('span', {}, el('strong', { text: 'In order' }), el('small', { text: 'Top to bottom, one at a time' }))))),
      part(4, 'Details',
        el('label', { for: 'c-title', text: 'Title' }), title,
        el('label', { for: 'c-due', text: 'Sign by' }, el('span', { class: 'optional', text: ' (optional)' })), due,
        el('label', { for: 'c-message', text: 'Message' }, el('span', { class: 'optional', text: ' (optional)' })), message),
      el('div', { class: 'draft-foot' },
        el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: async () => { try { await save(); toast('Draft saved.'); } catch (e) { toast(e.message, true); } } }, 'Save draft'),
        el('button', { class: 'btn btn-primary btn-small', type: 'button', onclick: async () => {
          if (!list.length) return toast('Add at least one person to sign it.', true);
          const missing = list.find((s) => !s.role); if (missing) return toast('Choose what ' + missing.name + ' signs as.', true);
          const names = list.map((s) => s.name + ' (' + s.role.replace(/^On behalf of /, 'for ') + ')').join(', ');
          if (!(await ask('Send for signing?', names + (list.length === 1 ? ' will' : ' will each') + ' be able to sign it with their HN Group Auth account, or with their own signing link and PIN, which you’ll see next' + (orderSeq.checked ? ', in that order' : '') + '. You can’t change it after this.', 'Send'))) return;
          try { await save(); const v = await api('/api/contracts/' + c.id + '/send', { json: {} }); toast('Sent for signing.'); await route(); if (v.access && v.access.length) showAccess(v.access, v.contract.title); } catch (e) { toast(e.message, true); }
        } }, 'Send for signing')));
  }

  // ---------- Start ----------
  async function route() {
    const p = location.pathname;
    try {
      if (p === '/new') return newContract();
      const m = /^\/contract\/([0-9a-f-]{36})$/.exec(p);
      if (m) return await contractPage(m[1]);
      const view = { '/': 'sign', '/sign': 'sign', '/waiting': 'waiting', '/completed': 'completed', '/cancelled': 'cancelled', '/drafts': 'drafts', '/all': 'all' }[p] || 'sign';
      return await dashboard(view === 'all' && !me.canManage ? 'sign' : view);
    } catch (e) {
      if (e.message !== 'Signed out') main.replaceChildren(section(head('HN Group Contracts', 'Not available', e.message, el('a', { class: 'btn btn-ghost', href: '/', text: 'Back to your contracts' }))));
    }
  }
  (async () => {
    $('year').textContent = new Date().getFullYear();
    try { me = await api('/api/me'); } catch (e) { if (e.message !== 'Signed out') main.replaceChildren(section(head('HN Group Contracts', 'Not available', e.message))); return; }
    $('who').hidden = false; $('who-name').textContent = me.user.displayName; $('who-avatar').replaceWith(face(me.user.id, me.user.displayName));
    for (const n of document.querySelectorAll('[data-sender]')) n.hidden = !me.canSend;
    for (const n of document.querySelectorAll('[data-manager]')) n.hidden = !me.canManage;
    if (me.user.impersonated) document.body.insertBefore(el('div', { class: 'wrap' }, el('p', { class: 'notice bad', text: 'You’re logged in as someone else, so you can look but not sign or send.' })), main);
    route();
  })();
})();
