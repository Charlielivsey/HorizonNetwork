'use strict';
// HN Group Docs — docs.hngroup.org.uk. Staff write letters, HR letters, memos, reports, policies, minutes and press
// releases on the letterhead of HN Group or one of its companies, starting from a template, and print them or save
// them as PDF, and everyone has their own private storage for documents and files. Staff only: everything but the sign-in page's stylesheet, font, tab icon and HN Group wordmark needs
// an HN Group Auth sign-in (the registered "docs" application; any enabled staff account).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const store = require('./lib/store');
const catalog = require('./lib/catalog');
const { createAuth } = require('./lib/auth');
const { renderDocument } = require('./lib/pdf');
const crypto = require('node:crypto');

const PUBLIC = process.env.DOCS_PUBLIC_DIR || path.join(__dirname, 'public');
const DATA_DIR = process.env.DOCS_DATA_DIR || '/var/lib/hn-docs';
const HOST = process.env.HOST || '127.0.0.1', PORT = Number(process.env.PORT || 4500);
const fail = (status, message) => Object.assign(new Error(message), { status });
store.init(DATA_DIR, process.env.DOCS_SEED_DIR || path.join(__dirname, 'seed'));
const auth = createAuth(store);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self' " + (process.env.AUTH_ORIGIN || 'https://auth.hngroup.org.uk');
const HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': CSP };
function send(res, status, value) { res.writeHead(status, { ...HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
function json(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return Promise.reject(fail(415, 'Send JSON.'));
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 1024 * 1024) { reject(fail(413, 'That document is too large.')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => { try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); resolve(v && typeof v === 'object' ? v : {}); } catch { reject(fail(400, 'That request isn’t valid.')); } });
    req.on('error', reject);
  });
}

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function showPage(res, status, title, text, cookies, action) {
  res.writeHead(status, { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': cookies || [] });
  const [label, href] = action || ['Back to HN Group Docs', '/'];
  res.end('<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>' + esc(title) + ' · HN Group Docs</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/documents.css?v=1"></head><body class="plain">' +
    '<div class="stripe" aria-hidden="true"></div><header class="top"><div class="top-inner"><a class="brand" href="/"><img class="on-light" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group" width="92" height="32"><img class="on-dark" src="/assets/brand/hn-group-wordmark-white.svg" alt="" width="92" height="32"><span class="brand-name">Docs</span></a></div></header>' +
    '<main class="message"><section class="card"><p class="eyebrow">HN Group Docs</p><h1>' + esc(title) + '</h1><p class="muted">' + esc(text) + '</p><p><a class="btn primary" href="' + esc(href) + '">' + esc(label) + '</a></p></section></main></body></html>');
}

const STAFF_BACKEND = process.env.STAFF_BACKEND || 'http://127.0.0.1:3250';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const secret = () => { try { const v = fs.readFileSync(SECRET_FILE, 'utf8').trim(); return /^[a-f0-9]{64}$/.test(v) ? v : ''; } catch { return ''; } };
// Everyone on the staff list (names and job titles), for people allowed to open anyone's storage. Cached a minute.
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
  directory = { at: Date.now(), people: value.people.slice(0, 5000).map((p) => ({ id: String(p.id), name: String(p.displayName || ''), jobTitle: String(p.jobTitle || ''), company: String(p.company || '') })) };
  return directory.people;
}

// The staff portal shows people's storage on its Document storage page. It asks over loopback with the shared service
// secret (never through nginx), naming the member of staff looking, who the portal has already checked.
function serviceAllowed(req) {
  const key = secret(), given = String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (!key || req.headers['x-real-ip'] || given.length !== key.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key));
}
async function service(req, res, url) {
  if (req.method !== 'GET' || !serviceAllowed(req)) throw fail(404, 'Not found.');
  const viewer = { id: 'portal:' + String(url.searchParams.get('byId') || '').slice(0, 64), displayName: String(url.searchParams.get('by') || 'Staff portal').slice(0, 120) + ' (staff portal)', email: '', storageAccess: true, storageGrants: [] };
  let m = /^\/api\/service\/storage\/([A-Za-z0-9_-]{1,64})$/.exec(url.pathname);
  if (m) return send(res, 200, store.storage(m[1], viewer));
  m = /^\/api\/service\/documents\/([0-9a-f-]{36})(\/pdf)?$/.exec(url.pathname);
  if (m && UUID.test(m[1])) {
    const d = store.get(m[1], viewer);
    if (d.sharing !== 'private') throw fail(404, 'Not found.');
    return m[2] ? sendPdf(res, store.view(d, viewer, true)) : send(res, 200, { document: store.view(d, viewer, true) });
  }
  m = /^\/api\/service\/files\/([0-9a-f-]{36})$/.exec(url.pathname);
  if (m && UUID.test(m[1])) { const { file, bytes } = store.readFile(m[1], viewer); return sendFile(res, file, bytes, url.searchParams.get('download') === '1'); }
  throw fail(404, 'Not found.');
}

// HN Group Contracts on this server: "Send for signing" hands it a PDF of the document over loopback with the shared
// service secret, as the signed-in member of staff (it checks their "Send contracts for signing" permission itself).
const CONTRACTS_BACKEND = process.env.CONTRACTS_BACKEND || 'http://127.0.0.1:5560';
const canSendContracts = (u) => !u.impersonated && (u.owner || u.permissions.includes('contracts.send') || u.permissions.includes('contracts.manage'));
async function sendForSigning(d, user) {
  if (!canSendContracts(user)) throw fail(403, 'You need the “Send contracts for signing” permission. Ask an administrator to add it to one of your roles in the staff portal.');
  const key = secret();
  if (!key) throw fail(503, 'HN Group Contracts isn’t set up on this server.');
  const pdf = renderDocument(d, catalog.company(d.company), catalog.template(d.template)), title = String(d.title || 'Document').trim() || 'Document';
  let response;
  try {
    response = await fetch(CONTRACTS_BACKEND + '/api/service/import', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000), redirect: 'error',
      body: JSON.stringify({ by: { id: user.id, accountId: user.accountId, displayName: user.displayName, email: user.email, owner: user.owner, impersonated: user.impersonated, permissions: user.permissions },
        title, fileName: title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-') + '.pdf', docId: d.id, pdf: pdf.toString('base64') }) });
  } catch { throw fail(503, 'HN Group Contracts is unavailable. Please try again shortly.'); }
  const value = await response.json().catch(() => ({}));
  // Only HN Group Contracts' own answers are passed on (a different program on the port would say something unrelated).
  if (!response.ok && [400, 403, 413].includes(response.status) && typeof value.error === 'string') throw fail(response.status, value.error);
  if (!response.ok || typeof value.url !== 'string' || !/^https?:\/\/[^/]+\/contract\/[0-9a-f-]{36}$/.test(value.url)) throw fail(503, 'HN Group Contracts isn’t running on this server yet. Run the server update, then try again.');
  store.audit(user, 'document.send-for-signing', d, { contract: String(value.id || '') });
  return { url: value.url };
}

// A document as a PDF download (made here, so no print dialog is involved).
function sendPdf(res, d) {
  const bytes = renderDocument(d, catalog.company(d.company), catalog.template(d.template));
  const name = (String(d.title || 'Document').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim() || 'Document') + '.pdf', encoded = encodeURIComponent(name);
  res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': bytes.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'attachment; filename="' + encoded + '"; filename*=UTF-8\'\'' + encoded });
  res.end(bytes);
}

// The raw bytes of an upload (up to 25 MB).
function raw(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 25 * 1024 * 1024) { reject(fail(413, 'Files can be up to 25 MB.')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function sendFile(res, f, bytes, download) {
  const encoded = encodeURIComponent(f.name), inline = !download && /^(application\/pdf|image\/)/.test(f.mime);
  res.writeHead(200, { 'Content-Type': f.mime, 'Content-Length': bytes.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
    'Content-Disposition': (inline ? 'inline' : 'attachment') + '; filename="' + encoded + '"; filename*=UTF-8\'\'' + encoded,
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" });
  res.end(bytes);
}

async function api(req, res, url) {
  const route = url.pathname, method = req.method;
  const current = await auth.current(req);
  if (!current) throw fail(401, 'Sign in to use HN Group Docs.');
  const { user } = current;
  const q = url.searchParams;
  if (route === '/api/me' && method === 'GET') {
    return send(res, 200, { user: { id: user.id, name: user.displayName, fullName: user.fullName, jobTitle: user.jobTitle, email: user.email, admin: user.admin, picture: !!store.avatar(user.id),
      storageAccess: user.storageAccess, storageGrants: user.storageGrants, canSendContracts: canSendContracts(user) }, ...catalog.publicCatalog(), counts: { shared: store.counts(user, 'shared'), mine: store.counts(user, 'mine') } });
  }
  if (route === '/api/avatar' && method === 'GET') {
    const a = store.avatar(user.id);
    if (!a) throw fail(404, 'No profile picture.');
    res.writeHead(200, { 'Content-Type': a.mime, 'Content-Length': a.image.length, 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff', ETag: '"' + a.tag + '"' });
    return res.end(a.image);
  }
  if (route === '/api/documents' && method === 'GET') {
    const scope = q.get('scope') === 'mine' ? 'mine' : 'shared';
    return send(res, 200, { ...store.list(user, { scope, company: q.get('company') || '', template: q.get('template') || '', q: q.get('q') || '' }), counts: store.counts(user, scope) });
  }
  if (route === '/api/documents' && method === 'POST') return send(res, 201, { document: store.create(user, await json(req)) });
  let m = /^\/api\/documents\/([0-9a-f-]{36})\/send-for-signing$/.exec(route);
  if (m && UUID.test(m[1]) && method === 'POST') return send(res, 200, await sendForSigning(store.view(store.get(m[1], user), user, true), user));
  m = /^\/api\/documents\/([0-9a-f-]{36})\/pdf$/.exec(route);
  if (m && UUID.test(m[1]) && method === 'GET') return sendPdf(res, store.view(store.get(m[1], user), user, true));
  m = /^\/api\/documents\/([0-9a-f-]{36})(\/duplicate)?$/.exec(route);
  if (m && UUID.test(m[1])) {
    if (m[2] && method === 'POST') return send(res, 201, { document: store.duplicate(m[1], user) });
    if (m[2]) throw fail(405, 'Not allowed.');
    if (method === 'GET') return send(res, 200, { document: store.view(store.get(m[1], user), user, true) });
    if (method === 'PUT') return send(res, 200, { document: store.update(m[1], user, await json(req)) });
    if (method === 'DELETE') { store.remove(m[1], user); return send(res, 200, { ok: true }); }
  }
  // Everyone's storage, for people allowed to open it (the permission, Super Admin or the owner); people with an
  // individual grant see just the storage they've been given.
  if (route === '/api/people' && method === 'GET') {
    const grants = (user.storageGrants || []).map((g) => ({ id: g.personId, name: g.name, until: g.until }));
    if (!user.storageAccess) return send(res, 200, { all: false, people: grants });
    return send(res, 200, { all: true, people: (await staffDirectory()).filter((p) => p.id !== user.id) });
  }
  if (route === '/api/delete-many' && method === 'POST') return send(res, 200, store.removeMany(user, await json(req)));
  // Someone's private storage (your own, or someone else's when the staff portal allows it).
  m = /^\/api\/storage\/([A-Za-z0-9_-]{1,64})$/.exec(route);
  if (m && method === 'GET') {
    const r = store.storage(m[1], user);
    // Someone who hasn't signed in to Docs yet: their name comes from the staff list.
    if (!r.person.signedIn && user.storageAccess) { try { const p = (await staffDirectory()).find((x) => x.id === m[1]); if (p) Object.assign(r.person, { name: p.name, jobTitle: p.jobTitle }); } catch {} }
    return send(res, 200, r);
  }
  if (route === '/api/files' && method === 'POST') {
    let name = '';
    try { name = decodeURIComponent(String(req.headers['x-file-name'] || '')); } catch { throw fail(400, 'The file name isn’t valid.'); }
    return send(res, 201, { file: store.addFile(user, name, await raw(req), String(req.headers['x-company'] || '')) });
  }
  m = /^\/api\/files\/([0-9a-f-]{36})$/.exec(route);
  if (m && UUID.test(m[1])) {
    if (method === 'GET') { const { file, bytes } = store.readFile(m[1], user); return sendFile(res, file, bytes, q.get('download') === '1'); }
    if (method === 'PUT') return send(res, 200, { file: store.updateFile(m[1], user, await json(req)) });
    if (method === 'DELETE') { store.removeFile(m[1], user); return send(res, 200, { ok: true }); }
  }
  throw fail(404, 'Not found.');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
// Public without a sign-in: what the sign-in page needs. Company logos and the app itself need a sign-in.
const PUBLIC_FILES = new Set(['/assets/documents.css', '/assets/favicon.svg', '/assets/fonts/plus-jakarta-sans.woff2', '/assets/brand/hn-group-wordmark.svg', '/assets/brand/hn-group-wordmark-white.svg', '/robots.txt']);
function serveFile(res, rel, cache) {
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(PUBLIC + path.sep)) return false;
  let stat; try { stat = fs.statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': cache });
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  return true;
}
// The pages of the app (one page drawn by documents.js): shared documents, your storage, someone else's storage
// (when allowed), templates and the editor.
const APP_ROUTES = /^\/(?:|new|templates|people|storage|storage\/[A-Za-z0-9_-]{1,64}|doc\/[0-9a-f-]{36})$/;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname;
  try {
    if (route === '/healthz') return send(res, 200, { ok: true });
    if (route.startsWith('/auth/') && await auth.handle(req, res, url, showPage)) return;
    if (route.startsWith('/api/service/')) return await service(req, res, url);
    if (route.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Not allowed.' });
    if (PUBLIC_FILES.has(route) && serveFile(res, route, 'public, max-age=300')) return;
    if (route === '/signed-out') return showPage(res, 200, 'Signed out', 'You’ve signed out of HN Group Docs.', null, ['Sign in again', '/auth/login']);
    const current = await auth.current(req);
    if (!current) {
      if (route.startsWith('/assets/')) { res.writeHead(401, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end('Sign in to HN Group Docs.'); }
      res.writeHead(302, { Location: '/auth/login?next=' + encodeURIComponent(route + url.search), 'Cache-Control': 'no-store' }); return res.end();
    }
    if (APP_ROUTES.test(route) && serveFile(res, '/index.html', 'no-store')) return;
    if (route.startsWith('/assets/') && serveFile(res, route, 'private, max-age=300')) return;
    showPage(res, 404, 'Page not found', 'That page isn’t part of HN Group Docs.');
  } catch (e) {
    const status = e.status || 500; if (status === 500) console.error(e);
    if (route.startsWith('/api/')) send(res, status, { error: status === 500 ? 'Something went wrong. Please try again.' : e.message });
    else showPage(res, status, 'Something went wrong', status === 500 ? 'Please try again.' : e.message);
  }
});
if (require.main === module) server.listen(PORT, HOST, () => console.log('HN Group Docs on ' + HOST + ':' + PORT));
module.exports = { server };
