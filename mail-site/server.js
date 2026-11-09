'use strict';
// HN Mail (mail.hngroup.org.uk, the user's request, 6 November 2026: "my own front end for Gmail … use HN Auth
// accounts. And should only work if you have a google account linked already to the Auth account"). People sign in
// through HN Group Auth's "mail" client (only accounts with a linked Google account), allow HN Mail into their Gmail
// once (Google's consent screen, only for that same Google account), and then read, search, write and organise their
// mail here. Gmail stays the mailbox: nothing is copied or stored here except sign-ins and each person's encrypted
// Gmail grant.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createAuth, NO_GOOGLE } = require('./lib/auth'), { sessions } = require('./lib/sessions'), { createGoogle } = require('./lib/google'), { createGmail } = require('./lib/gmail');
const mime = require('./lib/mime');
const { hnSignature, allowedImage } = require('./lib/signature');
const { createPeople } = require('./lib/people');
const MAILBOXES = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'mailboxes.json'), 'utf8')).mailboxes.filter((m) => Array.isArray(m) && /^[^\s@]+@[^\s@]+$/.test(m[1])).map(([name, email]) => ({ name: String(name), email: String(email).toLowerCase() })); } catch { return []; } })();
// The Gmail search for mail that reached you through a group inbox.
const mailboxQuery = (email) => '(list:' + email + ' OR to:' + email + ' OR cc:' + email + ')';

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const MAX_ATTACH = 25 * 1024 * 1024;
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const GOOGLE_COOKIE = 'hn_mail_google';
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

function createServer({ dir = process.env.MAIL_DATA_DIR || '/var/lib/hn-mail', fetcher = fetch, googleFile } = {}) {
  const store = sessions(dir);
  const auth = createAuth(store);
  const pictures = new Map(); // signature pictures shown inside HN Mail, kept an hour
  const google = createGoogle({ dir, origin: auth.ORIGIN, fetcher, ...(googleFile ? { file: googleFile } : {}) });
  const gmail = createGmail({ token: google.accessToken, fetcher });
  const people = createPeople({ fetcher });
  const counts = new Map(); // unread counts per group inbox, per person, for a minute
  const secure = auth.ORIGIN.startsWith('https://');
  const googleCookie = (secure ? '__Host-' : '') + GOOGLE_COOKIE;
  const senders = new Map(), avatars = new Map();
  const senderOf = async (user) => { const c = senders.get(user.accountId); if (c && c.at > Date.now() - 600000) return c.value; const value = await gmail.sender(user); senders.set(user.accountId, { at: Date.now(), value }); return value; };

  // One email's body as its own locked-down page, shown in a sandboxed frame: no scripts of its own (only a tiny
  // script with this response's nonce that tells HN Mail how tall it is), an opaque origin with no access to HN Mail
  // or its cookies, links open in a new tab, and outside images only when asked for ("Show images").
  async function bodyPage(user, id, images, theme) {
    const m = await gmail.message(user, id), parsed = mime.parse(m.payload);
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
      try { const p = await gmail.part(user, id, info.partId, m); budget -= p.bytes.length; if (/^image\/(png|jpe?g|gif|webp)$/.test(p.type)) html = html.split('cid:' + cid).join('data:' + p.type + ';base64,' + p.bytes.toString('base64')); } catch {}
    }
    const nonce = crypto.randomBytes(16).toString('base64');
    const doc = '<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;background:transparent!important;color:#1d1d1f}body{padding:2px 2px 8px;font:15px/1.55 "Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}.plain{white-space:pre-wrap}a{color:#5514b4}blockquote{margin:0 0 0 .6em;padding-left:.8em;border-left:3px solid #d8d2e6;color:#4d4766}</style></head><body>' + html +
      (theme === 'dark' ? '<script nonce="' + nonce + '">' + DUSK_JS + ';hnDusk.apply(document.documentElement);</script>' : '') +
      '<script nonce="' + nonce + '">(function(){var last=0;function post(){var h=Math.ceil(document.documentElement.scrollHeight);if(h!==last){last=h;parent.postMessage({hnMailHeight:h},"*");}}if(window.ResizeObserver)new ResizeObserver(post).observe(document.documentElement);addEventListener("load",post);setTimeout(post,50);post();})();</script></body></html>';
    const csp = "default-src 'none'; style-src 'unsafe-inline'; img-src data:" + (images ? ' https: http:' : '') + '; font-src data:' + (images ? ' https:' : '') + "; script-src 'nonce-" + nonce + "'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox";
    return { doc, csp };
  }

  // Attachments from messages already in Gmail (forwarding, or a draft's existing files): [{messageId, partId}].
  async function included(user, list) {
    const out = [], byMessage = new Map();
    for (const x of (Array.isArray(list) ? list : []).slice(0, 30)) if (x && typeof x.messageId === 'string' && typeof x.partId === 'string') { if (!byMessage.has(x.messageId)) byMessage.set(x.messageId, []); byMessage.get(x.messageId).push(x.partId); }
    for (const [messageId, parts] of byMessage) {
      const m = await gmail.message(user, messageId);
      for (const partId of parts) { const p = await gmail.part(user, messageId, partId, m); out.push({ name: p.name, type: p.type, data: p.bytes }); }
    }
    return out;
  }
  async function compose(user, v, { allowEmpty }) {
    const files = [];
    for (const a of (Array.isArray(v.attachments) ? v.attachments : []).slice(0, 30)) {
      if (!a || typeof a.data !== 'string') continue;
      files.push({ name: String(a.name || 'attachment').slice(0, 180), type: String(a.type || ''), data: Buffer.from(a.data, 'base64') });
    }
    files.push(...await included(user, v.include));
    if (files.reduce((n, f) => n + f.data.length, 0) > MAX_ATTACH) throw fail(413, 'Attachments can be 25 MB at most in all.');
    const from = await senderOf(user);
    return mime.build({ from: { name: from.name, email: from.email }, to: v.to, cc: v.cc, bcc: v.bcc, subject: String(v.subject || '').slice(0, 900), html: String(v.html || '').slice(0, 2000000),
      inReplyTo: v.inReplyTo, references: v.references, attachments: files, allowEmpty });
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
      response.end('<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>HN Mail · HN Group</title><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/mail.css?v=9"><script src="/assets/hn-theme.js?v=20261109-midnight"></script><body class="plain-page"><main class="wrap problem"><img class="on-light logo" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group" width="140"><img class="on-dark logo" src="/assets/brand/hn-group-wordmark-white.svg" alt="" width="140"><p class="eyebrow">HN MAIL</p><h1>' + escape(title) + '</h1><p class="lead">' + escape(message) + '</p><p class="actions">' + action + '</p></main></body></html>');
    };
    let route = '';
    try {
      const url = new URL(req.url, auth.ORIGIN);
      route = url.pathname;
      if (route === '/healthz') return json(200, { ok: true, service: 'hn-mail', google: !!google.config() });
      if (route === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('User-agent: *\nDisallow: /\n'); }
      if (await auth.handle(req, res, url, page)) return;
      if (route.startsWith('/assets/') && ['GET', 'HEAD'].includes(req.method)) {
        const target = path.resolve(PUBLIC, '.' + decodeURIComponent(route)), type = TYPES[path.extname(target)];
        if (!target.startsWith(PUBLIC + path.sep) || !type || !fs.existsSync(target) || !fs.statSync(target).isFile()) return json(404, { error: 'Not found.' });
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': /\.(js|css)$/.test(target) ? 'no-cache' : 'public, max-age=3600' });
        if (req.method === 'HEAD') return res.end(); return fs.createReadStream(target).pipe(res);
      }
      if (route === '/signed-out') return page(res, 200, 'You’ve signed out of HN Mail.', 'Your Gmail is still connected for next time. Sign in again whenever you need it.');
      const active = await auth.current(req);
      if (!active) {
        if (route.startsWith('/api/')) return json(401, { error: 'Please sign in again.', code: 'signin' });
        res.writeHead(302, { Location: '/auth/login?next=' + encodeURIComponent(route === '/' ? '/' : '/') }); return res.end();
      }
      const user = active.user;

      // ---- Connecting Gmail ----
      if (route === '/google/connect' && req.method === 'GET') {
        const { state, url: to } = google.start(user);
        res.writeHead(302, { Location: to, 'Set-Cookie': googleCookie + '=' + state + '; Path=/; HttpOnly;' + (secure ? ' Secure;' : '') + ' SameSite=Lax; Max-Age=600' }); return res.end();
      }
      if (route === '/google/callback' && req.method === 'GET') {
        const bound = (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(googleCookie + '='))?.slice(googleCookie.length + 1) || '';
        const clear = googleCookie + '=; Path=/; HttpOnly;' + (secure ? ' Secure;' : '') + ' SameSite=Lax; Max-Age=0';
        if (url.searchParams.get('error')) return page(res, 403, 'Gmail wasn’t connected', 'Google’s screen was closed or access wasn’t allowed, so HN Mail can’t open your mail yet.', [clear]);
        try { await google.finish(user, url.searchParams.get('state') || '', url.searchParams.get('code') || '', bound); }
        catch (e) { return page(res, e.status || 503, 'Gmail wasn’t connected', e.message, [clear]); }
        senders.delete(user.accountId);
        store.updateSession(active.token, { fresh: true });
        res.writeHead(302, { Location: '/', 'Set-Cookie': clear }); return res.end();
      }

      // A reload keeps the current session; Auth validation and expiry still apply.
      if (route === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8'));
      }
      if (!route.startsWith('/api/')) return page(res, 404, 'Nothing here.', 'That page isn’t part of HN Mail.');

      // ---- API ----
      let m;
      if (route === '/api/session' && req.method === 'GET') {
        const status = google.status(user);
        let sender = null;
        if (status.connected) { try { sender = await senderOf(user); } catch (e) { if (e.code === 'connect') status.connected = false; } }
        const status2 = google.status(user);
        return json(200, { user: { displayName: user.displayName, username: user.username, email: user.email, jobTitle: user.jobTitle, company: user.company }, gmail: { ...status2, sender },
          hnSignature: hnSignature({ ...user, email: (sender && sender.email) || status2.email || status2.linkedEmail || user.email }) });
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
      // Group inboxes with your unread count in each (the user's request, 6 November 2026).
      if (route === '/api/mailboxes' && req.method === 'GET') {
        const key = user.accountId, held = counts.get(key);
        if (held && held.at > Date.now() - 60000 && url.searchParams.get('fresh') !== '1') return json(200, { mailboxes: held.list });
        const list = await gmail.unreadCounts(user, MAILBOXES.map((x) => ({ ...x, q: mailboxQuery(x.email) })));
        counts.set(key, { at: Date.now(), list });
        return json(200, { mailboxes: list });
      }
      // A cheap check for new mail: Gmail's history id changes whenever the mailbox does.
      if (route === '/api/pulse' && req.method === 'GET') return json(200, await gmail.pulse(user));
      if (route === '/api/google/disconnect' && req.method === 'POST') { await google.disconnect(user); senders.delete(user.accountId); return json(200, { ok: true }); }
      if (route === '/api/labels' && req.method === 'GET') return json(200, { labels: await gmail.labels(user) });
      if (route === '/api/threads' && req.method === 'GET') return json(200, await gmail.threads(user, { label: url.searchParams.get('label') || '', q: url.searchParams.get('q') || '', pageToken: url.searchParams.get('page') || '' }));
      if ((m = /^\/api\/threads\/([a-f0-9]{8,32})$/i.exec(route)) && req.method === 'GET') return json(200, await gmail.thread(user, m[1]));
      if ((m = /^\/api\/threads\/([a-f0-9]{8,32})\/(modify|trash|untrash)$/i.exec(route)) && req.method === 'POST') {
        if (m[2] === 'modify') { const v = await readJson(req, 8192); await gmail.modify(user, m[1], v.add, v.remove); }
        else await gmail[m[2]](user, m[1]);
        return json(200, { ok: true });
      }
      if ((m = /^\/api\/messages\/([a-f0-9]{8,32})\/modify$/i.exec(route)) && req.method === 'POST') { const v = await readJson(req, 8192); await gmail.modifyMessage(user, m[1], v.add, v.remove); return json(200, { ok: true }); }
      if ((m = /^\/api\/messages\/([a-f0-9]{8,32})\/body$/i.exec(route)) && req.method === 'GET') {
        const { doc, csp } = await bodyPage(user, m[1], url.searchParams.get('images') === '1', url.searchParams.get('theme') === 'dark' ? 'dark' : 'light');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp, 'X-Frame-Options': 'SAMEORIGIN', 'Cache-Control': 'private, no-store' });
        return res.end(doc);
      }
      if ((m = /^\/api\/messages\/([a-f0-9]{8,32})\/parts\/([0-9.]{1,40})$/i.exec(route)) && req.method === 'GET') {
        const p = await gmail.part(user, m[1], m[2]);
        const name = p.name.replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'attachment';
        // Always a download, never shown on this site's own address (an attached web page can't run here).
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="' + name.replace(/[^\x20-\x7e]/g, '_') + '"; filename*=UTF-8\'\'' + encodeURIComponent(name), 'Content-Length': p.bytes.length, 'Cache-Control': 'private, no-store' });
        return res.end(p.bytes);
      }
      if (route === '/api/send' && req.method === 'POST') {
        const v = await readJson(req, 40 * 1024 * 1024);
        const raw = await compose(user, v, { allowEmpty: false });
        const sent = await gmail.send(user, raw, v.threadId);
        if (v.draftId) await gmail.deleteDraft(user, String(v.draftId)).catch(() => {});
        return json(200, { ok: true, id: sent.id, threadId: sent.threadId });
      }
      if (route === '/api/drafts' && req.method === 'POST') {
        const v = await readJson(req, 40 * 1024 * 1024);
        const raw = await compose(user, v, { allowEmpty: true });
        const saved = await gmail.saveDraft(user, v.draftId ? String(v.draftId) : '', raw, v.threadId);
        return json(200, { draftId: saved.id, messageId: saved.message && saved.message.id });
      }
      if ((m = /^\/api\/drafts\/for\/([a-f0-9]{8,32})$/i.exec(route)) && req.method === 'GET') {
        const draftId = await gmail.draftFor(user, m[1]), msg = await gmail.message(user, m[1], true), parsed = mime.parse(msg.payload), h = (n) => mime.header(msg.payload, n);
        return json(200, { draftId, messageId: msg.id, threadId: msg.threadId, to: h('To'), cc: h('Cc'), bcc: h('Bcc'), subject: h('Subject'), inReplyTo: h('In-Reply-To'), references: h('References'),
          html: parsed.html || escape(parsed.text || '').replace(/\n/g, '<br>'), attachments: parsed.attachments });
      }
      if ((m = /^\/api\/drafts\/([\w-]{1,64})$/.exec(route)) && req.method === 'DELETE') { await gmail.deleteDraft(user, m[1]); return json(200, { ok: true }); }
      return json(404, { error: 'Not found.' });
    } catch (e) {
      if (res.headersSent) return res.destroy();
      const status = e.status || 503;
      if (status >= 500 && !e.status) console.error(e);
      if (route.startsWith('/api/')) return json(status, { error: e.status ? e.message : 'Something went wrong. Please try again.', code: e.code || undefined });
      if (e.code === 'no-google') return page(res, 403, 'Link a Google account first', NO_GOOGLE, [], true);
      page(res, status, status === 403 ? 'Not available' : 'Unavailable', e.status ? e.message : 'Please try again shortly.');
    }
  });
  return server;
}
if (require.main === module) createServer().listen(Number(process.env.PORT || 5660), '127.0.0.1');
module.exports = { createServer };
