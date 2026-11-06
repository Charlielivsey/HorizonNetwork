'use strict';
// HN Mail (mail.hngroup.org.uk). First built on Gmail (6 November 2026); now the front end for HN Group's own mail
// server (the user's request, 6 November 2026: "Replace its Gmail-dependent backend with the new mail system while
// preserving its existing functionality"). People sign in through HN Group Auth's "mail" client; the mail directory on
// admin.mail.hngroup.org.uk says which mailboxes their account may open (their staff records' mailboxes and the shared
// mailboxes those are members of), and HN Mail opens them on the mail server over IMAP (lib/mailstore.js) and sends
// through it (lib/smtp.js). The mail server enforces the same rights and send-as permissions again. Nothing but
// sign-ins is stored here.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createAuth, NO_GOOGLE } = require('./lib/auth'), { sessions } = require('./lib/sessions'), { createMailstore } = require('./lib/mailstore');
const mime = require('./lib/mime');
const MAIL_ADMIN = process.env.MAIL_ADMIN_BACKEND || 'http://127.0.0.1:5670';
const MASTER_FILE = process.env.HN_MAIL_MASTER_SECRET_FILE || '/etc/hn-mail/hnmail-master.secret';
const SSO_SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const readSecret = (file) => { try { const v = fs.readFileSync(file, 'utf8').trim(); return /^[a-f0-9]{64}$/.test(v) ? v : ''; } catch { return ''; } };
const MB = /^[a-f0-9]{16}$/;
const MID = '([a-f0-9]{24})';
const { hnSignature, allowedImage } = require('./lib/signature');
const { createPeople } = require('./lib/people');

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const MAX_ATTACH = 25 * 1024 * 1024;
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
// Emails in Lavender Dusk (the user's requests, 6 November 2026: no white box around emails, and "the coloured bars should
// sta the same colour"): public/assets/dusk.js, inlined into the email's page, turns only the colourless parts dark
// (white/grey backgrounds dark, black/grey text and borders light); colours of the email's own, such as a signature's
// stripe and divider, stay exactly as they are, and HN Group logos are shown from their Lavender Dusk copies.
const DUSK_JS = fs.readFileSync(path.join(PUBLIC, 'assets', 'dusk.js'), 'utf8');

async function readJson(req, limit) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw fail(413, 'That’s too big to send (25 MB of attachments at most).'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw fail(400, 'That request couldn’t be read.'); }
}

function createServer({ dir = process.env.MAIL_DATA_DIR || '/var/lib/hn-mail', fetcher = fetch, imapPort, smtpPort } = {}) {
  const store = sessions(dir);
  const auth = createAuth(store);
  const pictures = new Map(); // signature pictures shown inside HN Mail, kept an hour
  const people = createPeople({ fetcher });
  const secure = auth.ORIGIN.startsWith('https://');
  const avatars = new Map(), accessCache = new Map();
  // The mail directory: which mailboxes this account may open (cached 20 seconds, so permission changes apply fast).
  async function adminCall(route, body) {
    let r;
    try { r = await fetcher(MAIL_ADMIN + route, { method: 'POST', headers: { Authorization: 'Bearer ' + readSecret(SSO_SECRET_FILE), 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000), redirect: 'error' }); }
    catch { throw fail(503, 'HN Group mail administration can’t be reached right now. Please try again shortly.'); }
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw fail(r.status === 404 ? 404 : r.status === 400 ? 400 : 503, v.error || 'The mail directory couldn’t be read.');
    return v;
  }
  async function access(user) {
    const held = accessCache.get(user.accountId);
    if (held && held.at > Date.now() - 20000) return held.list;
    const v = await adminCall('/api/service/access', { recordIds: user.recordIds || [] });
    accessCache.set(user.accountId, { at: Date.now(), list: v.mailboxes || [], blocked: v.blocked || [] });
    return v.mailboxes || [];
  }
  const ms = createMailstore({ secret: () => { const s = readSecret(MASTER_FILE); if (!s) throw fail(503, 'HN Group’s mail server isn’t set up on this server yet.'); return s; }, access, ...(imapPort ? { imapPort } : {}), ...(smtpPort ? { smtpPort } : {}) });

  // One email's body as its own locked-down page, shown in a sandboxed frame: no scripts of its own (only a tiny
  // script with this response's nonce that tells HN Mail how tall it is), an opaque origin with no access to HN Mail
  // or its cookies, links open in a new tab, and outside images only when asked for ("Show images").
  async function bodyPage(user, mb, id, images, theme) {
    const m = await ms.message(user, mb, id), parsed = m.parsed;
    let html = parsed.html;
    if (!html) html = '<div class="plain">' + escape(parsed.text || '').replace(/(https?:\/\/[^\s<>"']+)/g, '<a href="$1">$1</a>') + '</div>';
    html = html.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/<meta[^>]+http-equiv[^>]*>/gi, '').replace(/<base\b[^>]*>/gi, '');
    // HN Group's email logos (in signatures) are shown from HN Mail's see-through copies: always visible, and no white
    // box around them in Midnight Lavender.
    html = html.replace(/<img\b[^>]*>/gi, (tag) => {
      const m = /\ssrc\s*=\s*["']?https:\/\/staff\.hngroup\.org\.uk\/assets\/brand\/png\/([a-z-]+-email-logo)\.png["']?/i.exec(tag);
      const file = m && path.join(PUBLIC, 'assets', 'brand', 'png', m[1].toLowerCase() + (theme === 'dark' ? '-dusk.png' : '-clear.png'));
      if (!file || !fs.existsSync(file)) return tag;
      return tag.replace(m[0], ' data-hn-logo="1" src="data:image/png;base64,' + fs.readFileSync(file).toString('base64') + '"');
    });
    // Inline (cid:) images become data: addresses, up to 10 MB in all.
    let budget = 10 * 1024 * 1024;
    for (const [cid, info] of Object.entries(parsed.inline)) {
      if (!html.includes('cid:' + cid) || info.size > budget) continue;
      try { const p = parsed.part(info.partId); budget -= p.bytes.length; if (/^image\/(png|jpe?g|gif|webp)$/.test(p.type)) html = html.split('cid:' + cid).join('data:' + p.type + ';base64,' + p.bytes.toString('base64')); } catch {}
    }
    const nonce = crypto.randomBytes(16).toString('base64');
    const doc = '<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;background:transparent!important;color:#1d1d1f}body{padding:2px 2px 8px;font:15px/1.55 "Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}.plain{white-space:pre-wrap}a{color:#5514b4}blockquote{margin:0 0 0 .6em;padding-left:.8em;border-left:3px solid #d8d2e6;color:#4d4766}</style></head><body>' + html +
      (theme === 'dark' ? '<script nonce="' + nonce + '">' + DUSK_JS + ';hnDusk.apply(document.documentElement);</script>' : '') +
      '<script nonce="' + nonce + '">(function(){var last=0;function post(){var h=Math.ceil(document.documentElement.scrollHeight);if(h!==last){last=h;parent.postMessage({hnMailHeight:h},"*");}}if(window.ResizeObserver)new ResizeObserver(post).observe(document.documentElement);addEventListener("load",post);setTimeout(post,50);post();})();</script></body></html>';
    const csp = "default-src 'none'; style-src 'unsafe-inline'; img-src data:" + (images ? ' https: http:' : '') + '; font-src data:' + (images ? ' https:' : '') + "; script-src 'nonce-" + nonce + "'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox";
    return { doc, csp };
  }

  // Attachments from messages already in the mailbox (forwarding, or a draft's existing files): [{messageId, partId}].
  async function included(user, mb, list) {
    const out = [];
    for (const x of (Array.isArray(list) ? list : []).slice(0, 30)) if (x && /^[a-f0-9]{24}$/.test(String(x.messageId)) && /^[0-9.]{1,40}$/.test(String(x.partId))) {
      const p = await ms.part(user, mb, x.messageId, x.partId); out.push({ name: p.name, type: p.type, data: p.bytes });
    }
    return out;
  }
  // The sender: one of the addresses this mailbox may send as (checked again by the mail server).
  async function senderFor(user, mb, wanted) {
    const box = await ms.mailboxOf(user, mb);
    const email = String(wanted || box.sendAs[0] || '').toLowerCase();
    if (!box.sendAs.includes(email)) throw fail(403, box.sendAs.length ? 'You can’t send from ' + email + '.' : 'You can read ' + box.address + ' but not send as it.');
    return { box, from: { name: box.kind === 'shared' ? box.name : user.displayName, email } };
  }
  async function compose(user, mb, v, { allowEmpty }) {
    const files = [];
    for (const a of (Array.isArray(v.attachments) ? v.attachments : []).slice(0, 30)) {
      if (!a || typeof a.data !== 'string') continue;
      files.push({ name: String(a.name || 'attachment').slice(0, 180), type: String(a.type || ''), data: Buffer.from(a.data, 'base64') });
    }
    files.push(...await included(user, mb, v.include));
    if (files.reduce((n, f) => n + f.data.length, 0) > MAX_ATTACH) throw fail(413, 'Attachments can be 25 MB at most in all.');
    const { from } = await senderFor(user, mb, v.from);
    const raw = mime.build({ from, to: v.to, cc: v.cc, bcc: v.bcc, subject: String(v.subject || '').slice(0, 900), html: String(v.html || '').slice(0, 2000000),
      inReplyTo: v.inReplyTo, references: v.references, attachments: files, allowEmpty, messageId: true });
    const recipients = [...new Set([...mime.addresses(v.to), ...mime.addresses(v.cc), ...mime.addresses(v.bcc)].map((a) => a.email.toLowerCase()))];
    return { raw, from, recipients };
  }

  const server = http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries({ 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' })) res.setHeader(k, v);
    // Inline styles are allowed so signatures and saved drafts keep their layout in the composer (scripts still aren't).
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    const page = (response, status, title, message, cookies = [], linkGoogle = false) => {
      response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': cookies });
      const action = linkGoogle ? '<a class="btn btn-primary" href="https://auth.hngroup.org.uk/">Open HN Group Auth</a> <a class="btn btn-ghost" href="/auth/login">I’ve linked it, try again</a>'
        : status === 403 ? '' : '<a class="btn btn-primary" href="/auth/login">Sign in with HN Group Auth</a>';
      response.end('<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>HN Mail · HN Group</title><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/mail.css?v=9"><script src="/assets/hn-theme.js"></script><body class="plain-page"><main class="wrap problem"><img class="on-light logo" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group" width="140"><img class="on-dark logo" src="/assets/brand/hn-group-wordmark-white.svg" alt="" width="140"><p class="eyebrow">HN MAIL</p><h1>' + escape(title) + '</h1><p class="lead">' + escape(message) + '</p><p class="actions">' + action + '</p></main></body></html>');
    };
    let route = '';
    try {
      const url = new URL(req.url, auth.ORIGIN);
      route = url.pathname;
      if (route === '/healthz') return json(200, { ok: true, service: 'hn-mail', mailServer: !!readSecret(MASTER_FILE) });
      if (route === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('User-agent: *\nDisallow: /\n'); }
      if (await auth.handle(req, res, url, page)) return;
      if (route.startsWith('/assets/') && ['GET', 'HEAD'].includes(req.method)) {
        const target = path.resolve(PUBLIC, '.' + decodeURIComponent(route)), type = TYPES[path.extname(target)];
        if (!target.startsWith(PUBLIC + path.sep) || !type || !fs.existsSync(target) || !fs.statSync(target).isFile()) return json(404, { error: 'Not found.' });
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': /\.(js|css)$/.test(target) ? 'no-cache' : 'public, max-age=3600' });
        if (req.method === 'HEAD') return res.end(); return fs.createReadStream(target).pipe(res);
      }
      if (route === '/signed-out') return page(res, 200, 'You’ve signed out of HN Mail.', 'Sign in again whenever you need it.');
      const active = await auth.current(req);
      if (!active) {
        if (route.startsWith('/api/')) return json(401, { error: 'Please sign in again.', code: 'signin' });
        res.writeHead(302, { Location: '/auth/login?next=' + encodeURIComponent(route === '/' ? '/' : '/') }); return res.end();
      }
      const user = active.user;

      // HN Mail asks you to sign in every time you open or reload it (the user's request, 6 November 2026: "its not
      // making me sign in again via auth on reload"): the page straight after signing in opens; loading it again ends
      // that sign-in and goes back through HN Group Auth.
      if (route === '/' && req.method === 'GET') {
        const held = store.session(active.token);
        if (!held || !held.fresh) {
          store.endSession(active.token);
          res.writeHead(302, { Location: '/auth/login?next=/', 'Set-Cookie': (secure ? '__Host-' : '') + 'hn_mail_session=; Path=/; HttpOnly;' + (secure ? ' Secure;' : '') + ' SameSite=Lax; Max-Age=0' }); return res.end();
        }
        store.updateSession(active.token, { fresh: false });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8'));
      }
      if (!route.startsWith('/api/')) return page(res, 404, 'Nothing here.', 'That page isn’t part of HN Mail.');

      // ---- API ----
      let m;
      const mb = MB.test(url.searchParams.get('mb') || '') ? url.searchParams.get('mb') : null;
      if (route === '/api/session' && req.method === 'GET') {
        let list = [], problem = null;
        try { list = await access(user); } catch (e) { problem = e.message; }
        const own = list.find((x) => x.kind === 'person') || null, held = accessCache.get(user.accountId) || {};
        const blocked = (held.blocked || [])[0];
        return json(200, { user: { displayName: user.displayName, username: user.username, email: user.email, jobTitle: user.jobTitle, company: user.company },
          mailboxes: list.map((x) => ({ id: x.id, kind: x.kind, name: x.name, email: x.address, access: x.access, sendAs: x.sendAs, quotaMB: x.quotaMB, usedKB: x.usedKB ?? null })),
          // Kept in the shape the front end already uses.
          gmail: { connected: !!list.length, email: own ? own.address : (list[0] ? list[0].address : ''), linkedEmail: '', sender: own ? { email: own.address, name: user.displayName, signature: '' } : null,
            problem: problem || (blocked ? (blocked.reason === 'disabled' ? 'Your mailbox ' + blocked.address + ' is disabled. Ask an HN Group mail administrator.' : 'Your mailbox ' + blocked.address + ' is suspended because your sign-in accounts are disabled.') : (!list.length ? 'You don’t have a mailbox on HN Group mail yet. Your staff record needs an HN Group email address; ask a mail administrator.' : null)) },
          hnSignature: hnSignature({ ...user, email: own ? own.address : user.email }),
          settings: { imap: { host: 'mx.hngroup.org.uk', port: 993, security: 'SSL/TLS' }, smtp: { host: 'mx.hngroup.org.uk', port: 465, security: 'SSL/TLS', alt: 587 } } });
      }
      if (route === '/api/avatar' && req.method === 'GET') {
        const held = avatars.get(user.accountId);
        let picture = held && held.at > Date.now() - 600000 ? held.picture : null;
        if (!picture) { picture = await auth.ownPicture(active.authSession); avatars.set(user.accountId, { at: Date.now(), picture }); }
        if (!picture) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); return fs.createReadStream(path.join(PUBLIC, 'assets', 'avatar.svg')).pipe(res); }
        res.writeHead(200, { 'Content-Type': picture.type, 'Cache-Control': 'private, max-age=600' }); return res.end(picture.bytes);
      }
      // Pictures in signatures and drafts, shown inside HN Mail (its own pages only show its own images): only HN Group's
      // sites and Google's image hosts, https, no redirects, real images under 2 MB, always as a download-safe image.
      if (route === '/api/img' && req.method === 'GET') {
        const u = url.searchParams.get('u') || '';
        if (!allowedImage(u)) return json(404, { error: 'Not found.' });
        // HN Group's signature logos are kept in HN Mail itself, so they always show (no fetch from the staff portal).
        const own = /^https:\/\/staff\.hngroup\.org\.uk\/assets\/brand\/png\/([a-z-]+-email-logo)\.png$/.exec(u);
        if (own && fs.existsSync(path.join(PUBLIC, 'assets', 'brand', 'png', own[1] + '.png'))) {
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400', 'Content-Security-Policy': "default-src 'none'; sandbox" });
          return fs.createReadStream(path.join(PUBLIC, 'assets', 'brand', 'png', own[1] + '.png')).pipe(res);
        }
        let pic = pictures.get(u);
        if (!pic || pic.at < Date.now() - 3600000) {
          let r;
          try { r = await fetcher(u, { redirect: 'error', signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'HN-Mail' } }); } catch { return json(404, { error: 'Not found.' }); }
          const type = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), bytes = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
          if (!bytes || !/^image\/(png|jpeg|gif|webp)$/.test(type) || bytes.length > 2 * 1024 * 1024) return json(404, { error: 'Not found.' });
          pic = { at: Date.now(), type, bytes }; pictures.set(u, pic);
          if (pictures.size > 200) pictures.delete(pictures.keys().next().value);
        }
        res.writeHead(200, { 'Content-Type': pic.type, 'Cache-Control': 'private, max-age=3600', 'Content-Security-Policy': "default-src 'none'; sandbox" }); return res.end(pic.bytes);
      }
      // People HN Mail knows (staff with HN Group accounts) and their pictures.
      if (route === '/api/people' && req.method === 'GET') return json(200, { people: await people.list(), directory: await people.directory() });
      if ((m = /^\/api\/people\/([A-Za-z0-9_-]{1,64})\/photo$/.exec(route)) && req.method === 'GET') {
        const pic = await people.picture(m[1]);
        if (!pic) return json(404, { error: 'No picture.' });
        res.writeHead(200, { 'Content-Type': pic.type, 'Cache-Control': 'private, max-age=600', 'Content-Security-Policy': "default-src 'none'; sandbox" }); return res.end(pic.bytes);
      }
      // The mailboxes you can open (yours and shared ones), with unread counts and storage.
      if (route === '/api/mailboxes' && req.method === 'GET') return json(200, { mailboxes: await ms.mailboxes(user) });
      // A cheap check for new mail across your mailboxes.
      if (route === '/api/pulse' && req.method === 'GET') return json(200, await ms.pulse(user));
      if (route === '/api/labels' && req.method === 'GET') return json(200, { labels: await ms.labels(user, mb) });
      if (route === '/api/threads' && req.method === 'GET') return json(200, await ms.threads(user, mb, { label: url.searchParams.get('label') || '', q: String(url.searchParams.get('q') || '').slice(0, 500), pageToken: url.searchParams.get('page') || '' }));
      if ((m = new RegExp('^/api/threads/' + MID + '$').exec(route)) && req.method === 'GET') return json(200, await ms.thread(user, mb, m[1]));
      if ((m = new RegExp('^/api/threads/' + MID + '/(modify|trash|untrash)$').exec(route)) && req.method === 'POST') {
        if (m[2] === 'modify') { const v = await readJson(req, 8192); await ms.modify(user, mb, m[1], v.add, v.remove); }
        else await ms[m[2]](user, mb, m[1]);
        return json(200, { ok: true });
      }
      if ((m = new RegExp('^/api/messages/' + MID + '/modify$').exec(route)) && req.method === 'POST') { const v = await readJson(req, 8192); await ms.modifyMessage(user, mb, m[1], v.add, v.remove); return json(200, { ok: true }); }
      if ((m = new RegExp('^/api/messages/' + MID + '/body$').exec(route)) && req.method === 'GET') {
        const { doc, csp } = await bodyPage(user, mb, m[1], url.searchParams.get('images') === '1', url.searchParams.get('theme') === 'dark' ? 'dark' : 'light');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp, 'X-Frame-Options': 'SAMEORIGIN', 'Cache-Control': 'private, no-store' });
        return res.end(doc);
      }
      if ((m = new RegExp('^/api/messages/' + MID + '/parts/([0-9.]{1,40})$').exec(route)) && req.method === 'GET') {
        const p = await ms.part(user, mb, m[1], m[2]);
        const name = p.name.replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'attachment';
        // Always a download, never shown on this site's own address (an attached web page can't run here).
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="' + name.replace(/[^\x20-\x7e]/g, '_') + '"; filename*=UTF-8\'\'' + encodeURIComponent(name), 'Content-Length': p.bytes.length, 'Cache-Control': 'private, no-store' });
        return res.end(p.bytes);
      }
      if (route === '/api/send' && req.method === 'POST') {
        const v = await readJson(req, 40 * 1024 * 1024), box = MB.test(String(v.mb || '')) ? v.mb : mb;
        const { raw, from, recipients } = await compose(user, box, v, { allowEmpty: false });
        const sent = await ms.send(user, box, { raw, from: from.email, recipients, inReplyTo: v.inReplyTo });
        if (v.draftId) await ms.deleteDraft(user, box, String(v.draftId)).catch(() => {});
        return json(200, { ok: true, id: sent.id });
      }
      if (route === '/api/drafts' && req.method === 'POST') {
        const v = await readJson(req, 40 * 1024 * 1024), box = MB.test(String(v.mb || '')) ? v.mb : mb;
        const { raw } = await compose(user, box, v, { allowEmpty: true });
        const saved = await ms.saveDraft(user, box, v.draftId ? String(v.draftId) : '', raw);
        return json(200, { draftId: saved.id, messageId: saved.id });
      }
      if ((m = new RegExp('^/api/drafts/for/' + MID + '$').exec(route)) && req.method === 'GET') {
        const msg = await ms.message(user, mb, m[1]), p = msg.parsed, h = (n) => p.header(n);
        return json(200, { draftId: m[1], messageId: m[1], threadId: m[1], from: (/<([^>]+)>/.exec(h('From')) || [, h('From')])[1], to: h('To'), cc: h('Cc'), bcc: h('Bcc'), subject: h('Subject'), inReplyTo: h('In-Reply-To'), references: h('References'),
          html: p.html || escape(p.text || '').replace(/\n/g, '<br>'), attachments: p.attachments.map((a) => ({ partId: a.partId, filename: a.name, name: a.name, mimeType: a.type, size: a.size })) });
      }
      if ((m = new RegExp('^/api/drafts/' + MID + '$').exec(route)) && req.method === 'DELETE') { await ms.deleteDraft(user, mb, m[1]); return json(200, { ok: true }); }
      // Mail app passwords (Outlook, Apple Mail, phones): for your own mailbox only, kept as hashes on the mail server.
      if (route === '/api/app-passwords' && ['GET', 'POST', 'DELETE'].includes(req.method)) {
        const own = (await access(user)).find((x) => x.kind === 'person');
        if (!own) throw fail(404, 'You don’t have a mailbox of your own.');
        const v = req.method === 'GET' ? {} : await readJson(req, 4096);
        const actor = { accountId: user.accountId, displayName: user.displayName, username: user.username };
        const action = req.method === 'GET' ? 'list' : req.method === 'POST' ? 'create' : 'revoke';
        return json(200, await adminCall('/api/service/app-passwords', { recordIds: user.recordIds || [], mailbox: own.id, action, label: String(v.label || '').slice(0, 60), id: String(v.id || ''), actor }));
      }
      return json(404, { error: 'Not found.' });
    } catch (e) {
      if (res.headersSent) return res.destroy();
      const status = e.status || 503;
      if (status >= 500 && !e.status) console.error(e);
      if (route.startsWith('/api/')) return json(status, { error: e.status ? e.message : 'Something went wrong. Please try again.', code: e.code || undefined });
      if (e.code === 'no-google') return page(res, 403, 'HN Mail isn’t available', NO_GOOGLE, []);
      page(res, status, status === 403 ? 'Not available' : 'Unavailable', e.status ? e.message : 'Please try again shortly.');
    }
  });
  return server;
}
if (require.main === module) createServer().listen(Number(process.env.PORT || 5660), '127.0.0.1');
module.exports = { createServer };
