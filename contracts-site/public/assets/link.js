'use strict';
// A contract opened with its signing link (contract.hngroup.org.uk/s/<link>): no HN Group Auth sign-in. The person
// enters the six-digit PIN that came with the link, then reads, downloads and signs (or declines) that one contract.
(() => {
  const token = location.pathname.split('/')[2] || '', base = '/api/link/' + token;
  const root = document.getElementById('link-root');
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  }
  let toastTimer;
  function toast(text, bad) { const t = document.getElementById('toast'); t.textContent = text; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4200); }
  async function api(path, json) {
    const r = await fetch(base + path, { method: json ? 'POST' : 'GET', headers: json ? { 'Content-Type': 'application/json' } : {}, body: json ? JSON.stringify(json) : undefined, credentials: 'same-origin' });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(v.error || 'Something went wrong. Please try again.'), { status: r.status });
    return v;
  }
  const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const day = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const STATUS = { out: ['Waiting for signatures', 'wait'], completed: ['Signed by everyone', 'good'], declined: ['Declined', 'bad'], cancelled: ['Cancelled', 'bad'] };
  const SIGNER = { waiting: ['Waiting', 'wait'], signed: ['Signed', 'good'], declined: ['Declined', 'bad'] };

  // ---------- The PIN ----------
  function pinScreen(message) {
    const boxes = Array.from({ length: 6 }, (_, i) => el('input', { class: 'pin-box', inputmode: 'numeric', autocomplete: i ? 'off' : 'one-time-code', 'aria-label': 'PIN digit ' + (i + 1) }));
    const error = el('p', { class: 'notice bad', hidden: !message, text: message || '' });
    const button = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Open the contract' });
    const value = () => boxes.map((b) => b.value).join('');
    async function submit(e) {
      if (e) e.preventDefault();
      if (!/^\d{6}$/.test(value())) { error.textContent = 'Enter all six digits of your PIN.'; error.hidden = false; return; }
      button.disabled = true;
      try { await api('/unlock', { pin: value() }); load(); }
      catch (err) { error.textContent = err.message; error.hidden = false; boxes.forEach((b) => { b.value = ''; }); boxes[0].focus(); button.disabled = false; }
    }
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        const digits = b.value.replace(/\D/g, '');
        if (digits.length > 1) { digits.slice(0, 6 - i).split('').forEach((d, j) => { boxes[i + j].value = d; }); } else b.value = digits;
        const next = boxes.find((x) => !x.value); if (next) next.focus(); else if (/^\d{6}$/.test(value())) submit();
      });
      // Pasting the whole PIN into any box fills them all.
      b.addEventListener('paste', (e) => {
        const digits = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
        if (!digits) return; e.preventDefault();
        digits.split('').forEach((d, j) => { if (boxes[j]) boxes[j].value = d; });
        const next = boxes.find((x) => !x.value); if (next) next.focus(); else submit();
      });
      b.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !b.value && i) { boxes[i - 1].value = ''; boxes[i - 1].focus(); } });
    });
    root.replaceChildren(el('div', { class: 'link-pin card' },
      el('span', { class: 'doc-icon', 'aria-hidden': 'true' }),
      el('p', { class: 'eyebrow', text: 'HN Group Contracts' }),
      el('h1', { class: 'page-title', text: 'Enter your PIN' }),
      el('p', { class: 'lead', text: 'This is your own link to a contract sent to you for signing. Enter the six-digit PIN that came with it.' }),
      el('form', { onsubmit: submit }, el('div', { class: 'pin-row' }, boxes), error, button),
      el('p', { class: 'muted small', text: 'Don’t have the PIN, or it isn’t working? Ask the person who sent you the contract for a new link and PIN.' })));
    boxes[0].focus();
  }

  // ---------- The contract ----------
  async function load() {
    let v;
    try { v = await api(''); }
    catch (e) { if (e.status === 401) return pinScreen(); return problem(e.message); }
    show(v.contract, v.me);
  }
  function problem(text) {
    root.replaceChildren(el('div', { class: 'link-pin card' }, el('p', { class: 'eyebrow', text: 'HN Group Contracts' }), el('h1', { class: 'page-title', text: 'This link isn’t available' }), el('p', { class: 'lead', text })));
  }
  function show(c, me) {
    document.title = c.title + ' · HN Group Contracts';
    const mine = c.signers.filter((s) => s.me), cancelled = c.status === 'cancelled';
    const signedSoFar = c.signers.some((s) => s.status === 'signed');
    const head = el('div', { class: 'contract-head hn-glow' },
      el('p', { class: 'eyebrow', text: 'Sent to ' + me.name }),
      el('h1', { text: c.title }),
      el('div', { class: 'byline' }, el('span', { text: 'From ' + c.sender.name + (c.sentAt ? ' · sent ' + day(c.sentAt) : '') }),
        el('div', { class: 'tags' }, el('span', { class: 'tag ' + (STATUS[c.status] || ['', 'plain'])[1], text: (STATUS[c.status] || [c.status])[0] }), c.dueDate ? el('span', { class: 'tag ' + (c.overdue ? 'bad' : 'plain'), text: 'Sign by ' + day(c.dueDate) }) : null)));
    const viewer = el('section', { class: 'viewer link-viewer' });
    const actions = cancelled ? null : el('div', { class: 'viewer-bar' },
      el('span', { class: 'file' }, el('span', { class: 'doc-icon small', 'aria-hidden': 'true' }), el('span', {}, el('strong', { text: c.file.name }), el('small', { text: c.file.pages + ' page' + (c.file.pages === 1 ? '' : 's') + (signedSoFar ? ' · with signatures' : '') }))),
      el('span', { class: 'actions' },
        el('a', { class: 'btn btn-small btn-ghost', href: base + '/file?download', download: true, text: 'Download' }),
        c.certificate ? el('a', { class: 'btn btn-small btn-primary', href: base + '/certificate?download', download: true, text: 'Signing certificate' }) : null));
    // The pages are drawn with PDF.js (the same copy the rest of the site uses), so they show in every browser and on
    // phones; if that can't load, the browser's own PDF viewer shows it instead.
    const frame = () => {
      const pages = el('div', { class: 'pages', tabindex: '0', 'aria-label': 'The contract' }, el('p', { class: 'muted', text: 'Loading the contract…' }));
      (async () => {
        try {
          const lib = await import('/assets/pdfjs/pdf.min.mjs');
          lib.GlobalWorkerOptions.workerSrc = '/assets/pdfjs/pdf.worker.min.mjs';
          const doc = await lib.getDocument({ url: base + '/file', isEvalSupported: false, withCredentials: true }).promise;
          pages.replaceChildren();
          const width = Math.min(860, pages.clientWidth - 48 || 760), ratio = window.devicePixelRatio || 1;
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i), vp = page.getViewport({ scale: 1 }), scale = width / vp.width, view = page.getViewport({ scale: scale * ratio });
            const canvas = el('canvas', { width: Math.floor(view.width), height: Math.floor(view.height), 'aria-label': 'Page ' + i });
            const sheet = el('div', { class: 'sheet' }, canvas); sheet.style.width = Math.floor(vp.width * scale) + 'px'; sheet.style.height = Math.floor(vp.height * scale) + 'px';
            pages.append(sheet);
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: view }).promise;
          }
        } catch { pages.replaceWith(el('iframe', { class: 'link-frame', src: base + '/file', title: c.title })); }
      })();
      return pages;
    };
    if (cancelled) viewer.append(el('div', { class: 'viewer-closed' }, el('h3', { text: 'This contract was cancelled' }), el('p', { class: 'muted', text: 'It can no longer be opened or signed.' })));
    else {
      viewer.append(actions);
      if (c.can.mustOpen) viewer.append(el('div', { class: 'viewer-closed' }, el('span', { class: 'doc-icon', 'aria-hidden': 'true' }), el('h3', { text: 'Read the contract before you sign' }),
        el('p', { class: 'muted', text: 'Opening it is recorded on the contract’s history.' }),
        el('button', { class: 'btn btn-primary', type: 'button', onclick: (e) => { e.target.closest('.viewer-closed').replaceWith(frame()); c.can.mustOpen = false; setTimeout(load, 1500); } }, 'Open the contract')));
      else viewer.append(frame());
    }
    const side = el('aside', { class: 'side' });
    if (c.status === 'completed') side.append(el('div', { class: 'notice good', text: 'Everyone has signed. Download the contract and its signing certificate.' }));
    if (c.status === 'declined') side.append(el('div', { class: 'notice bad', text: 'Someone declined to sign, so this contract won’t go ahead as it is.' }));
    if (c.can.waitingFor) side.append(el('div', { class: 'notice wait', text: 'This contract is signed in order. You can sign once ' + c.can.waitingFor + ' has signed. Come back to this link then.' }));
    if (c.can.sign) side.append(signCard(c, me));
    else if (mine.length && mine.every((s) => s.status === 'signed')) side.append(el('div', { class: 'notice good', text: 'You signed this on ' + when(mine.map((s) => s.signedAt).sort().pop()) + '. You can come back to this link to download it.' }));
    if (c.message) side.append(el('div', { class: 'card' }, el('h2', { text: 'Message from ' + c.sender.name }), el('p', { text: c.message })));
    side.append(el('div', { class: 'card' }, el('h2', { text: c.order === 'sequence' ? 'Signing, in order' : 'Signing' }),
      c.signers.map((s) => el('div', { class: 'signer' }, el('span', {}, el('strong', { text: s.name + (s.me ? ' (you)' : '') }), s.role ? el('span', { class: 'role-chip', text: s.role }) : null,
        s.status === 'signed' ? el('small', { text: 'Signed ' + when(s.signedAt) }) : null), el('span', { class: 'tag ' + SIGNER[s.status][1], text: SIGNER[s.status][0] })))));
    root.replaceChildren(head, el('div', { class: 'contract' }, viewer, side));
  }
  function signCard(c, me) {
    const name = el('input', { id: 'sign-name', autocomplete: 'name', maxlength: 120, value: me.name || '' });
    const typed = el('div', { class: 'typed' }, el('span', { class: 'signature', text: name.value }));
    name.addEventListener('input', () => { typed.firstChild.textContent = name.value; });
    const agree = el('input', { type: 'checkbox', id: 'sign-agree' });
    const button = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Sign contract' });
    const reason = el('textarea', { rows: 3, placeholder: 'Why you’re not signing it', 'aria-label': 'Why you’re not signing it', hidden: true });
    return el('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault();
      if (c.can.mustOpen) return toast('Open and read the contract first.', true);
      button.disabled = true;
      try { const v = await api('/sign', { name: name.value, agree: agree.checked, sha256: c.file.sha256 }); toast(v.contract.status === 'completed' ? 'Signed. Everyone has now signed.' : 'Signed. Thank you.'); load(); }
      catch (err) { toast(err.message, true); button.disabled = false; }
    } }, el('h2', { text: 'Sign this contract' }),
      el('p', { class: 'muted small', text: c.can.mustOpen ? 'Open the contract and read it first.' : 'Type your full name. It becomes your signature on this contract.' }),
      c.can.signAs.length > 1 ? el('p', { class: 'notice wait small', text: 'You sign this as ' + c.can.signAs.slice(0, -1).join(', ') + ' and ' + c.can.signAs[c.can.signAs.length - 1] + '. One signature covers them all.' }) : null,
      el('label', { for: 'sign-name', text: 'Your full name' }), name, typed,
      el('label', { class: 'check' }, agree, el('span', { text: 'I’ve read this contract and I agree to sign it electronically. I understand my typed name is my signature.' })),
      el('div', { class: 'button-row' }, button, el('button', { class: 'btn-link', type: 'button', onclick: async () => {
        if (reason.hidden) { reason.hidden = false; reason.focus(); return toast('Say why you’re declining, then press Decline again.'); }
        if (!reason.value.trim()) return toast('Say why you’re declining.', true);
        try { await api('/decline', { reason: reason.value.trim() }); toast('Declined.'); load(); } catch (err) { toast(err.message, true); }
      } }, 'Decline')), reason);
  }

  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) problem('This address isn’t a signing link.'); else load();
})();
