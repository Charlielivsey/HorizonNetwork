'use strict';
// HN Group Contracts — contracts.hngroup.org.uk (the user's request, 29 October 2026: "a contracts site where contracts
// will be sent to be signed, where the person uploading the contract will have to invite them via their Auth account and
// have to sign the document"). People with the staff portal's "Send contracts for signing" permission upload a PDF (or
// send a document straight from HN Group Docs), choose who signs it from the staff list, and send it. Each person signs
// in with their own HN Group Auth account, opens the contract and signs it with their typed name; when everyone has, a
// signing certificate is made. Everything except the sign-in page's assets needs an HN Group Auth sign-in.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const store = require('./lib/store');
const { createAuth } = require('./lib/auth');
const { certificate } = require('./lib/certificate');

const PUBLIC = process.env.CONTRACTS_PUBLIC_DIR || path.join(__dirname, 'public');
const DATA_DIR = process.env.CONTRACTS_DATA_DIR || '/var/lib/hn-contracts';
const HOST = process.env.HOST || '127.0.0.1', PORT = Number(process.env.PORT || 5560);
const STAFF_BACKEND = process.env.STAFF_BACKEND || 'http://127.0.0.1:3250';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const fail = (status, message) => Object.assign(new Error(message), { status });
store.init(DATA_DIR);
const auth = createAuth(store);

const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self' " + (process.env.AUTH_ORIGIN || 'https://auth.hngroup.org.uk');
const HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': CSP };
function send(res, status, value) { res.writeHead(status, { ...HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
function body(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > max) { reject(fail(413, 'That file is too large (25 MB at most).')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
  });
}
async function json(req, max = 256 * 1024) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw fail(415, 'Send JSON.');
  try { const v = JSON.parse((await body(req, max)).toString('utf8') || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { throw e.status ? e : fail(400, 'That request isn’t valid.'); }
}
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function showPage(res, status, title, text, cookies, action) {
  res.writeHead(status, { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': cookies || [] });
  const [label, href] = action || ['Back to HN Group Contracts', '/'];
  res.end('<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>' + esc(title) + ' · HN Group Contracts</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/contracts.css?v=1"></head><body>' +
    '<div class="stripe" aria-hidden="true"></div><header class="top"><div class="top-inner"><a class="brand" href="/"><img class="on-light" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group" width="92" height="32"><img class="on-dark" src="/assets/brand/hn-group-wordmark-white.svg" alt="" width="92" height="32"><span class="brand-name">Contracts</span></a></div></header>' +
    '<main class="message"><section class="card"><p class="eyebrow">HN Group Contracts</p><h1>' + esc(title) + '</h1><p class="muted">' + esc(text) + '</p><p><a class="btn primary" href="' + esc(href) + '">' + esc(label) + '</a></p></section></main></body></html>');
}

const secret = () => { try { const v = fs.readFileSync(SECRET_FILE, 'utf8').trim(); return /^[a-f0-9]{64}$/.test(v) ? v : ''; } catch { return ''; } };
// The staff list (one entry per profile, with the sign-in accounts that use it), for choosing who signs. Cached a minute.
let directory = { at: 0, people: [] };
async function staffDirectory() {
  if (Date.now() - directory.at < 60000) return directory.people;
  const key = secret();
  if (!key) throw fail(503, 'The staff list isn’t available on this server.');
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
function serviceAllowed(req) {
  const key = secret(), given = String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (!key || req.headers['x-real-ip'] || given.length !== key.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key));
}
async function service(req, res, route) {
  if (route !== '/api/service/import' || req.method !== 'POST' || !serviceAllowed(req)) throw fail(404, 'Not found.');
  const v = await json(req, 36 * 1024 * 1024), by = v.by || {};
  const user = { id: String(by.id || '').slice(0, 64), accountId: String(by.accountId || '').slice(0, 64), displayName: String(by.displayName || 'Staff member').slice(0, 120), email: String(by.email || '').slice(0, 200),
    owner: by.owner === true, impersonated: by.impersonated === true, permissions: (Array.isArray(by.permissions) ? by.permissions : []).map(String).slice(0, 100) };
  if (!user.id) throw fail(400, 'Say who is sending it.');
  const c = store.create(user, { title: v.title, message: '', pdf: Buffer.from(String(v.pdf || ''), 'base64'), name: v.fileName, source: { kind: 'docs', docId: v.docId, title: v.title } });
  return send(res, 201, { id: c.id, url: auth.ORIGIN + '/contract/' + c.id });
}

const ip = (req) => String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
function pdf(res, bytes, name, download) {
  const encoded = encodeURIComponent(name);
  res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': bytes.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'self'", 'Content-Disposition': (download ? 'attachment' : 'inline') + "; filename=\"" + name.replace(/[^\x20-\x7e]|"/g, '_') + "\"; filename*=UTF-8''" + encoded });
  res.end(bytes);
}

async function api(req, res, url) {
  const route = url.pathname, method = req.method;
  const who = await auth.current(req);
  if (!who) throw fail(401, 'Sign in to continue.');
  const user = who.user;
  if (route === '/api/me' && method === 'GET') return send(res, 200, { user: { displayName: user.displayName, fullName: user.fullName, jobTitle: user.jobTitle, impersonated: user.impersonated }, canSend: store.canSend(user), canManage: store.canManage(user) });
  if (route === '/api/contracts' && method === 'GET') return send(res, 200, store.list(user));
  if (route === '/api/contracts' && method === 'POST') {
    if (!store.canSend(user)) throw fail(403, 'You need the “Send contracts for signing” permission to upload contracts.');
    const bytes = await body(req, store.MAX_PDF + 1);
    const name = decodeURIComponent(String(req.headers['x-file-name'] || 'Contract.pdf')).slice(0, 200), title = decodeURIComponent(String(req.headers['x-title'] || '')).slice(0, 200);
    return send(res, 201, { contract: store.view(store.create(user, { title, pdf: bytes, name }), user) });
  }
  if (route === '/api/people' && method === 'GET') {
    if (!store.canSend(user)) throw fail(403, 'Only people who send contracts can see the staff list here.');
    return send(res, 200, { people: (await staffDirectory()).map(({ id, name, jobTitle, company }) => ({ id, name, jobTitle, company })) });
  }
  const m = /^\/api\/contracts\/([0-9a-f-]{36})(?:\/(send|sign|decline|cancel|file|certificate))?$/.exec(route);
  if (!m) throw fail(404, 'Not found.');
  const [, id, action] = m;
  if (!action && method === 'GET') return send(res, 200, { contract: store.view(store.get(id, user), user) });
  if (!action && method === 'PUT') { const input = await json(req); return send(res, 200, { contract: store.view(store.update(id, user, input, Array.isArray(input.signers) ? await staffDirectory() : []), user) }); }
  if (action === 'file' && method === 'GET') { const c = store.get(id, user); store.viewed(c, user); return pdf(res, store.readBlob(c.file.blob), c.file.name, url.searchParams.has('download')); }
  if (action === 'certificate' && method === 'GET') { const c = store.get(id, user); if (!c.certificate) throw fail(404, 'There’s no signing certificate until everyone has signed.'); return pdf(res, store.readBlob(c.certificate), c.title.replace(/[\\/:*?"<>|]/g, '-') + ' - signing certificate.pdf', url.searchParams.has('download')); }
  if (method !== 'POST') throw fail(405, 'Method not allowed.');
  if (action === 'send') return send(res, 200, { contract: store.view(store.send(id, user), user) });
  if (action === 'sign') {
    const c = store.sign(id, user, await json(req), { ip: ip(req), agent: req.headers['user-agent'] });
    if (c.status === 'completed') store.setCertificate(c, certificate(c));
    return send(res, 200, { contract: store.view(c, user) });
  }
  if (action === 'decline') return send(res, 200, { contract: store.view(store.decline(id, user, await json(req)), user) });
  if (action === 'cancel') { const c = store.cancel(id, user); return send(res, 200, c ? { contract: store.view(c, user) } : { deleted: true }); }
  throw fail(404, 'Not found.');
}

const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
function staticFile(res, rel) {
  const full = path.join(PUBLIC, rel);
  if (!full.startsWith(PUBLIC + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) return false;
  res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': rel.startsWith('assets/') ? 'public, max-age=3600' : 'no-store' });
  res.end(fs.readFileSync(full)); return true;
}
const PAGES = /^\/(|new|sent|all|signed|contract\/[0-9a-f-]{36})$/;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost'), route = url.pathname;
  try {
    if (route === '/healthz') return send(res, 200, { ok: true });
    if (await auth.handle(req, res, url, showPage)) return;
    if (route.startsWith('/api/service/')) return await service(req, res, route);
    if (route.startsWith('/api/')) return await api(req, res, url);
    if (route === '/robots.txt') return staticFile(res, 'robots.txt');
    if (route === '/signed-out') return showPage(res, 200, 'Signed out', 'You’ve signed out of HN Group Contracts.', null, ['Sign in again', '/auth/login']);
    if (route.startsWith('/assets/') && req.method === 'GET' && staticFile(res, route.slice(1))) return;
    if (req.method === 'GET' && PAGES.test(route)) {
      const who = await auth.current(req);
      if (!who) { res.writeHead(302, { Location: '/auth/login?next=' + encodeURIComponent(route), 'Cache-Control': 'no-store' }); return res.end(); }
      return staticFile(res, 'index.html');
    }
    showPage(res, 404, 'Not found', 'There’s nothing at that address.');
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (route.startsWith('/api/')) send(res, status, { error: status === 500 ? 'Something went wrong. Please try again.' : e.message });
    else showPage(res, status, status === 500 ? 'Something went wrong' : 'Not available', status === 500 ? 'Please try again.' : e.message);
  }
}).listen(PORT, HOST, () => console.log('HN Group Contracts on ' + HOST + ':' + PORT));
