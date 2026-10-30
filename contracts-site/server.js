'use strict';
// HN Group Contracts — contract.hngroup.org.uk (the user's requests, 29 October 2026: "a contracts site where contracts
// will be sent to be signed, where the person uploading the contract will have to invite them via their Auth account and
// have to sign the document", rebuilt the same day in the HN Group website theme). People with the staff portal's "Send
// contracts for signing" permission upload a PDF or send a document from HN Group Docs, choose who signs it, and send
// it; everyone signs in with their own HN Group Auth account to read and sign. Everything except the sign-in page's
// assets needs a sign-in. GET /healthz says whether the site has everything it needs.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const store = require('./lib/store');
const { createAuth } = require('./lib/auth');
const { certificate } = require('./lib/certificate');
const { signedCopy } = require('./lib/stamp');

const VERSION = '2.0.0';
const PUBLIC = process.env.CONTRACTS_PUBLIC_DIR || path.join(__dirname, 'public');
const DATA_DIR = process.env.CONTRACTS_DATA_DIR || '/var/lib/hn-contracts';
const HOST = process.env.HOST || '127.0.0.1', PORT = Number(process.env.PORT || 5560);
const STAFF_BACKEND = process.env.STAFF_BACKEND || 'http://127.0.0.1:3250';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const AUTH_ORIGIN = process.env.AUTH_ORIGIN || 'https://auth.hngroup.org.uk';
const fail = (status, message) => Object.assign(new Error(message), { status });
store.init(DATA_DIR);
const auth = createAuth(store);

const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self' " + AUTH_ORIGIN;
const HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': CSP };
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function send(res, status, value) { res.writeHead(status, { ...HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
function body(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > max) { reject(fail(413, 'That’s too large (25 MB at most).')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
  });
}
async function json(req, max = 256 * 1024) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw fail(415, 'Send JSON.');
  try { const v = JSON.parse((await body(req, max)).toString('utf8') || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { throw e.status ? e : fail(400, 'That request isn’t valid.'); }
}

// A page in the HN Group website theme for sign-in problems, errors and "not found".
function page(res, status, title, text, cookies, action) {
  const [label, href] = action || ['Back to HN Group Contracts', '/'];
  res.writeHead(status, { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': cookies || [] });
  res.end('<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#5514B4">' +
    '<title>' + esc(title) + ' · HN Group Contracts</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/contracts.css?v=5"><link rel="stylesheet" href="/assets/hn-motion.css?v=1"><script src="/assets/hn-motion.js?v=1" defer></script></head><body>' +
    '<header class="site-header"><div class="wrap header-inner"><a class="brand" href="/"><img class="on-light" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group" width="120" height="42"><img class="on-dark" src="/assets/brand/hn-group-wordmark-white.svg" alt="" width="120" height="42"><span class="brand-label">Contracts</span></a></div></header>' +
    '<main id="main" class="section"><div class="wrap narrow"><div class="card message-card"><p class="eyebrow">HN Group Contracts</p><h1 class="page-title">' + esc(title) + '</h1><p class="lead">' + esc(text) + '</p><p><a class="btn btn-primary" href="' + esc(href) + '">' + esc(label) + '</a></p></div></div></main>' +
    '<footer class="site-footer"><div class="stripe" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><div class="wrap footer-inner"><div class="footer-brand"><img src="/assets/brand/hn-group-wordmark-white.svg" alt="" height="38" loading="lazy"></div></div><div class="wrap footer-legal small">© HN Group Limited</div></footer></body></html>');
}

const secret = () => { try { const v = fs.readFileSync(SECRET_FILE, 'utf8').trim(); return /^[a-f0-9]{64}$/.test(v) ? v : ''; } catch { return ''; } };
// The staff list: one entry per profile, with the sign-in accounts that use it. Cached for a minute.
let directory = { at: 0, people: [] };
async function staffDirectory() {
  if (Date.now() - directory.at < 60000) return directory.people;
  const key = secret();
  if (!key) throw fail(503, 'The staff list isn’t available on this server (HN Group Auth isn’t set up).');
  let response;
  try { response = await fetch(STAFF_BACKEND + '/api/auth/staff-directory', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000), redirect: 'error' }); }
  catch { throw fail(503, 'The staff list is unavailable. Please try again shortly.'); }
  const value = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(value.people)) throw fail(503, 'The staff list is unavailable. Please try again shortly.');
  directory = { at: Date.now(), people: value.people.slice(0, 5000).map((p) => ({ id: String(p.id), accountIds: (Array.isArray(p.accountIds) ? p.accountIds : []).map(String).slice(0, 20),
    name: String(p.displayName || ''), jobTitle: String(p.jobTitle || ''), company: String(p.company || '') })) };
  return directory.people;
}

// HN Group Docs sends documents here over loopback with the shared service secret (never through nginx), naming the
// signed-in member of staff and the permissions HN Group Auth gave them.
function fromDocs(req) {
  const key = secret(), given = String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (!key || req.headers['x-real-ip'] || given.length !== key.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key));
}
async function service(req, res, route) {
  if (route !== '/api/service/import' || req.method !== 'POST' || !fromDocs(req)) throw fail(404, 'Not found.');
  const v = await json(req, 36 * 1024 * 1024), by = v.by || {};
  const user = { id: String(by.id || '').slice(0, 64), accountId: String(by.accountId || '').slice(0, 64), displayName: String(by.displayName || 'Staff member').slice(0, 120), email: String(by.email || '').slice(0, 200),
    owner: by.owner === true, impersonated: by.impersonated === true, permissions: (Array.isArray(by.permissions) ? by.permissions : []).map(String).slice(0, 100) };
  if (!user.id) throw fail(400, 'Say who is sending it.');
  const c = store.create(user, { title: v.title, pdf: Buffer.from(String(v.pdf || ''), 'base64'), fileName: v.fileName, source: { kind: 'docs', docId: v.docId } });
  return send(res, 201, { id: c.id, url: auth.ORIGIN + '/contract/' + c.id });
}

// Profile pictures (the user's request, 29 October 2026: "always pull profile pictures everywhere they should be"):
// your own from HN Group Auth, anyone else's from the staff list, kept for ten minutes. Only images are passed on.
const pictures = new Map();
const IMAGE = /^image\/(png|jpeg|webp|gif)$/;
async function staffPicture(id) {
  const key = secret(); if (!key) return null;
  try {
    const r = await fetch(STAFF_BACKEND + '/api/auth/directory-avatar', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ id }), signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!r.ok) return null;
    return { type: r.headers.get('content-type') || '', bytes: Buffer.from(await r.arrayBuffer()) };
  } catch { return null; }
}
async function picture(res, id, who) {
  const mine = id === who.user.id, cacheKey = (mine ? 'me:' + who.user.accountId + ':' : '') + id;
  let p = pictures.get(cacheKey);
  if (!p || p.at < Date.now() - 600000) {
    const got = mine ? await auth.ownPicture(who.authSession) : await staffPicture(id);
    p = { at: Date.now(), value: got && IMAGE.test(got.type.split(';')[0]) && got.bytes.length && got.bytes.length < 3 * 1024 * 1024 ? got : null };
    pictures.set(cacheKey, p);
    if (pictures.size > 2000) pictures.delete(pictures.keys().next().value);
  }
  if (!p.value) { res.writeHead(404, { ...HEADERS, 'Cache-Control': 'private, max-age=300' }); return res.end(); }
  res.writeHead(200, { 'Content-Type': p.value.type, 'Content-Length': p.value.bytes.length, 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' });
  res.end(p.value.bytes);
}

function pdf(res, bytes, name, download) {
  const encoded = encodeURIComponent(name);
  res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': bytes.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'self'",
    'Content-Disposition': (download ? 'attachment' : 'inline') + '; filename="' + name.replace(/[^\x20-\x7e]|"/g, '_') + "\"; filename*=UTF-8''" + encoded });
  res.end(bytes);
}

async function api(req, res, url) {
  const route = url.pathname, method = req.method;
  const who = await auth.current(req);
  if (!who) throw fail(401, 'Sign in to continue.');
  const user = who.user;
  const pic = /^\/api\/picture\/([A-Za-z0-9_-]{1,64})$/.exec(route);
  if (pic && method === 'GET') return picture(res, pic[1], who);
  if (route === '/api/me' && method === 'GET') return send(res, 200, { user: { id: user.id, displayName: user.displayName, fullName: user.fullName, jobTitle: user.jobTitle, impersonated: user.impersonated }, canSend: store.canSend(user), canManage: store.canManage(user), roles: store.ROLES });
  if (route === '/api/contracts' && method === 'GET') return send(res, 200, store.lists(user));
  if (route === '/api/contracts' && method === 'POST') {
    if (!store.canSend(user)) throw fail(403, 'You need the “Send contracts for signing” permission to upload contracts.');
    const bytes = await body(req, store.MAX_PDF + 1);
    const name = decodeURIComponent(String(req.headers['x-file-name'] || 'Contract.pdf')).slice(0, 200), title = decodeURIComponent(String(req.headers['x-title'] || '')).slice(0, 200);
    return send(res, 201, { contract: store.view(store.create(user, { title, pdf: bytes, fileName: name, source: { kind: 'upload' } }), user) });
  }
  if (route === '/api/people' && method === 'GET') {
    if (!store.canSend(user)) throw fail(403, 'Only people who send contracts can see the staff list here.');
    return send(res, 200, { people: (await staffDirectory()).map(({ id, name, jobTitle, company }) => ({ id, name, jobTitle, company })) });
  }
  const m = /^\/api\/contracts\/([0-9a-f-]{36})(?:\/(send|sign|decline|cancel|remind|file|certificate))?$/.exec(route);
  if (!m) throw fail(404, 'Not found.');
  const [, id, action] = m;
  if (!action && method === 'GET') return send(res, 200, { contract: store.view(store.get(id, user), user) });
  if (!action && method === 'PUT') { const input = await json(req); return send(res, 200, { contract: store.view(store.update(id, user, input, Array.isArray(input.signers) ? await staffDirectory() : []), user) }); }
  // The PDF with everyone's signature so far written on it (?original for the file exactly as it was uploaded).
  if (action === 'file' && method === 'GET') {
    const c = store.get(id, user); store.opened(c, user);
    const original = store.fileOf(c);
    let copy = null;
    if (!url.searchParams.has('original')) copy = await signedCopy(original, c).catch((e) => { console.error('Couldn’t write the signatures onto contract ' + c.id + ':', e.message); return null; });
    return pdf(res, copy || original, copy ? c.file.name.replace(/(\.pdf)?$/i, ' (signed).pdf') : c.file.name, url.searchParams.has('download'));
  }
  if (action === 'certificate' && method === 'GET') {
    const c = store.get(id, user), bytes = store.certificateOf(c);
    if (!bytes) throw fail(404, 'There’s no signing certificate until everyone has signed.');
    return pdf(res, bytes, c.title.replace(/[\\/:*?"<>|]/g, '-') + ' - signing certificate.pdf', url.searchParams.has('download'));
  }
  if (method !== 'POST') throw fail(405, 'Method not allowed.');
  if (action === 'send') return send(res, 200, { contract: store.view(store.send(id, user), user) });
  if (action === 'sign') {
    const c = store.sign(id, user, await json(req), { ip: String(req.headers['x-real-ip'] || req.socket.remoteAddress || ''), agent: req.headers['user-agent'] });
    if (c.status === 'completed') store.setCertificate(c, certificate(c));
    return send(res, 200, { contract: store.view(c, user) });
  }
  if (action === 'decline') return send(res, 200, { contract: store.view(store.decline(id, user, await json(req)), user) });
  if (action === 'remind') return send(res, 200, { contract: store.view(store.remind(id, user), user) });
  if (action === 'cancel') { const c = store.cancel(id, user); return send(res, 200, c ? { contract: store.view(c, user) } : { deleted: true }); }
  throw fail(404, 'Not found.');
}

const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
function staticFile(res, rel) {
  const full = path.join(PUBLIC, rel);
  if (!full.startsWith(PUBLIC + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) return false;
  res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': rel.startsWith('assets/') ? 'public, max-age=300' : 'no-store' });
  res.end(fs.readFileSync(full)); return true;
}
const PAGES = /^\/(|sign|waiting|completed|drafts|all|new|contract\/[0-9a-f-]{36})$/;

// What the site needs to work, for the installer and anyone checking: the data folder, HN Group Auth's shared secret
// and the pages. It never shows people or contracts.
function health() {
  const checks = { data: store.writable(), auth: !!secret(), pages: fs.existsSync(path.join(PUBLIC, 'index.html')) };
  return { ok: Object.values(checks).every(Boolean), service: 'hn-contracts', version: VERSION, checks };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost'), route = url.pathname;
  try {
    if (route === '/healthz') return send(res, 200, health());
    if (route.startsWith('/auth/') && await auth.handle(req, res, url, page)) return;
    if (route.startsWith('/api/service/')) return await service(req, res, route);
    if (route.startsWith('/api/')) return await api(req, res, url);
    if (route === '/robots.txt') return staticFile(res, 'robots.txt');
    if (route === '/signed-out') return page(res, 200, 'Signed out', 'You’ve signed out of HN Group Contracts.', null, ['Sign in again', '/auth/login']);
    if (route.startsWith('/assets/') && req.method === 'GET' && staticFile(res, route.slice(1))) return;
    if (req.method === 'GET' && PAGES.test(route)) {
      if (!secret()) return page(res, 503, 'Sign-in isn’t set up yet', 'HN Group Auth isn’t connected to this server yet, so nobody can sign in. Run the server update (auth-site/install.sh).');
      const who = await auth.current(req);
      if (!who) { res.writeHead(302, { Location: '/auth/login?next=' + encodeURIComponent(route), 'Cache-Control': 'no-store' }); return res.end(); }
      return staticFile(res, 'index.html');
    }
    page(res, 404, 'Page not found', 'There’s nothing at that address on HN Group Contracts.');
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (route.startsWith('/api/')) send(res, status, { error: status === 500 ? 'Something went wrong. Please try again.' : e.message });
    else page(res, status, status === 500 ? 'Something went wrong' : 'Not available', status === 500 ? 'Please try again.' : e.message);
  }
}).listen(PORT, HOST, () => console.log('HN Group Contracts ' + VERSION + ' on ' + HOST + ':' + PORT));
