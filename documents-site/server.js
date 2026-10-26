'use strict';
// HN Group Documents — documents.hngroup.org.uk. Staff write letters, memos, reports, policies, minutes and press
// releases on the letterhead of HN Group or one of its companies, starting from a template, and print them or save
// them as PDF. Staff only: everything but the sign-in page's stylesheet, font, tab icon and HN Group wordmark needs
// an HN Group Auth sign-in (the registered "documents" application; any enabled staff account).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const store = require('./lib/store');
const catalog = require('./lib/catalog');
const { createAuth } = require('./lib/auth');

const PUBLIC = process.env.DOCUMENTS_PUBLIC_DIR || path.join(__dirname, 'public');
const DATA_DIR = process.env.DOCUMENTS_DATA_DIR || '/var/lib/hn-documents';
const HOST = process.env.HOST || '127.0.0.1', PORT = Number(process.env.PORT || 5500);
const fail = (status, message) => Object.assign(new Error(message), { status });
store.init(DATA_DIR);
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
  const [label, href] = action || ['Back to HN Group Documents', '/'];
  res.end('<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>' + esc(title) + ' · HN Group Documents</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/documents.css?v=1"></head><body class="plain">' +
    '<div class="stripe" aria-hidden="true"></div><header class="top"><div class="top-inner"><a class="brand" href="/"><img class="on-light" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group" width="92" height="32"><img class="on-dark" src="/assets/brand/hn-group-wordmark-white.svg" alt="" width="92" height="32"><span class="brand-name">Documents</span></a></div></header>' +
    '<main class="message"><section class="card"><p class="eyebrow">HN Group Documents</p><h1>' + esc(title) + '</h1><p class="muted">' + esc(text) + '</p><p><a class="btn primary" href="' + esc(href) + '">' + esc(label) + '</a></p></section></main></body></html>');
}

async function api(req, res, url) {
  const route = url.pathname, method = req.method;
  const current = await auth.current(req);
  if (!current) throw fail(401, 'Sign in to use HN Group Documents.');
  const { user } = current;
  const q = url.searchParams;
  if (route === '/api/me' && method === 'GET') return send(res, 200, { user: { name: user.displayName, email: user.email, admin: user.admin }, ...catalog.publicCatalog(), counts: store.counts(user) });
  if (route === '/api/documents' && method === 'GET') return send(res, 200, { documents: store.list(user, { company: q.get('company') || '', template: q.get('template') || '', q: q.get('q') || '', mine: q.get('mine') === '1' }), counts: store.counts(user) });
  if (route === '/api/documents' && method === 'POST') return send(res, 201, { document: store.create(user, await json(req)) });
  const m = /^\/api\/documents\/([0-9a-f-]{36})(\/duplicate)?$/.exec(route);
  if (m && UUID.test(m[1])) {
    if (m[2] && method === 'POST') return send(res, 201, { document: store.duplicate(m[1], user) });
    if (m[2]) throw fail(405, 'Not allowed.');
    if (method === 'GET') return send(res, 200, { document: store.view(store.get(m[1], user), user, true) });
    if (method === 'PUT') return send(res, 200, { document: store.update(m[1], user, await json(req)) });
    if (method === 'DELETE') { store.remove(m[1], user); return send(res, 200, { ok: true }); }
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
// The pages of the app (one page drawn by documents.js).
const APP_ROUTES = /^\/(?:|new|templates|doc\/[0-9a-f-]{36})$/;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname;
  try {
    if (route === '/healthz') return send(res, 200, { ok: true });
    if (route.startsWith('/auth/') && await auth.handle(req, res, url, showPage)) return;
    if (route.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Not allowed.' });
    if (PUBLIC_FILES.has(route) && serveFile(res, route, 'public, max-age=300')) return;
    if (route === '/signed-out') return showPage(res, 200, 'Signed out', 'You’ve signed out of HN Group Documents.', null, ['Sign in again', '/auth/login']);
    const current = await auth.current(req);
    if (!current) {
      if (route.startsWith('/assets/')) { res.writeHead(401, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end('Sign in to HN Group Documents.'); }
      res.writeHead(302, { Location: '/auth/login?next=' + encodeURIComponent(route + url.search), 'Cache-Control': 'no-store' }); return res.end();
    }
    if (APP_ROUTES.test(route) && serveFile(res, '/index.html', 'no-store')) return;
    if (route.startsWith('/assets/') && serveFile(res, route, 'private, max-age=300')) return;
    showPage(res, 404, 'Page not found', 'That page isn’t part of HN Group Documents.');
  } catch (e) {
    const status = e.status || 500; if (status === 500) console.error(e);
    if (route.startsWith('/api/')) send(res, status, { error: status === 500 ? 'Something went wrong. Please try again.' : e.message });
    else showPage(res, status, 'Something went wrong', status === 500 ? 'Please try again.' : e.message);
  }
});
if (require.main === module) server.listen(PORT, HOST, () => console.log('HN Group Documents on ' + HOST + ':' + PORT));
module.exports = { server };
