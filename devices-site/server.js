'use strict';
// HN Group Devices — devices.hngroup.org.uk. The list of computers allowed to use HN Group's desktop apps.
// The apps ask POST /api/device/check (no sign-in: the computer proves itself with its own id, secret and
// hardware fingerprint). Staff sign in through HN Group Auth to add their computers with the code the app
// shows; owner-level and Super Admin accounts approve, revoke, rename and remove computers.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const store = require('./lib/store');
const { createAuth } = require('./lib/auth');

const PUBLIC = process.env.DEVICES_PUBLIC_DIR || path.join(__dirname, 'public');
const DATA_DIR = process.env.DEVICES_DATA_DIR || '/var/lib/hn-devices';
const HOST = process.env.HOST || '127.0.0.1', PORT = Number(process.env.PORT || 5400);
const fail = (status, message) => Object.assign(new Error(message), { status });
store.init(DATA_DIR);
const auth = createAuth(store);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, HEX = /^[a-f0-9]{64}$/;
const clientIp = (req) => String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
function send(res, status, value, headers) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(headers || {}) }); res.end(JSON.stringify(value)); }
function json(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return Promise.reject(fail(415, 'Send JSON.'));
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 16384) { reject(fail(413, 'That is too large.')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(fail(400, 'That request isn’t valid.')); } });
    req.on('error', reject);
  });
}
// A simple limit per address for the apps' check (they ask at start-up and every few hours).
const hits = new Map();
function limited(ip, max = 60, windowMs = 60000) {
  const t = Date.now(), h = hits.get(ip) || { n: 0, start: t };
  if (t - h.start > windowMs) { h.n = 0; h.start = t; }
  h.n++; hits.set(ip, h);
  if (hits.size > 20000) for (const [k, v] of hits) if (t - v.start > windowMs) hits.delete(k);
  return h.n > max;
}

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function showPage(res, status, title, text, cookies) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': cookies || [], 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'" });
  res.end('<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(title) + ' · HN Group Devices</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/devices.css?v=1"></head><body>' +
    '<header class="top"><div class="wrap top-inner"><a class="brand" href="/"><img class="on-light" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group" width="118" height="41"><img class="on-dark" src="/assets/brand/hn-group-wordmark-white.svg" alt="" width="118" height="41"><span class="brand-name">Devices</span></a></div><div class="stripe" aria-hidden="true"></div></header>' +
    '<main class="wrap"><section class="card narrow"><h1>' + esc(title) + '</h1><p class="muted">' + esc(text) + '</p><p><a class="btn primary" href="/">Back to HN Group Devices</a></p></section></main></body></html>');
}

// ---------- The apps ----------
async function deviceCheck(req, res) {
  if (limited('check:' + clientIp(req))) throw fail(429, 'Too many checks from this network. Try again in a minute.');
  const b = await json(req);
  if (!UUID.test(b.id || '') || !HEX.test(b.secret || '') || !HEX.test(b.machine || '')) throw fail(400, 'This computer’s identity isn’t valid.');
  if (!['darwin', 'win32', 'linux'].includes(b.platform)) throw fail(400, 'This kind of computer isn’t supported.');
  if (!store.APPS[b.app]) throw fail(400, 'Unknown app.');
  const device = store.check({ id: b.id, secret: b.secret, machine: b.machine, name: b.name, platform: b.platform, os: b.os, app: b.app, version: b.version, ip: clientIp(req) });
  send(res, 200, { ...device, checkedAt: Date.now(), linkUrl: auth.ORIGIN + '/link' + (device.code ? '?code=' + device.code : ''),
    // How long an app may keep trusting "authorised" while it can't reach this site.
    trustFor: 7 * 86400000 });
}

// ---------- Profile pictures ----------
const STAFF_BACKEND = process.env.STAFF_BACKEND || 'http://127.0.0.1:3250';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const pictures = new Map(), IMAGE = /^image\/(png|jpeg|webp|gif)$/;
async function staffPicture(id) {
  let key; try { key = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch { return null; }
  try {
    const r = await fetch(STAFF_BACKEND + '/api/auth/directory-avatar', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ id }), signal: AbortSignal.timeout(5000), redirect: 'error' });
    return r.ok ? { type: r.headers.get('content-type') || '', bytes: Buffer.from(await r.arrayBuffer()) } : null;
  } catch { return null; }
}
async function picture(res, id, who) {
  const mine = id === who.user.id;
  if (!mine && !who.user.admin) { res.writeHead(404); return res.end(); }
  const cacheKey = (mine ? 'me:' : '') + id;
  let p = pictures.get(cacheKey);
  if (!p || p.at < Date.now() - 600000) {
    const got = mine ? await auth.ownPicture(who.authSession) : await staffPicture(id);
    p = { at: Date.now(), value: got && IMAGE.test(got.type.split(';')[0]) && got.bytes.length && got.bytes.length < 3 * 1024 * 1024 ? got : null };
    pictures.set(cacheKey, p); if (pictures.size > 2000) pictures.delete(pictures.keys().next().value);
  }
  if (!p.value) { res.writeHead(404, { 'Cache-Control': 'private, max-age=300' }); return res.end(); }
  res.writeHead(200, { 'Content-Type': p.value.type, 'Content-Length': p.value.bytes.length, 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' });
  res.end(p.value.bytes);
}

// ---------- The website ----------
async function api(req, res, url) {
  const route = url.pathname, method = req.method;
  if (route === '/api/device/check' && method === 'POST') return deviceCheck(req, res);
  const current = await auth.current(req);
  if (!current) throw fail(401, 'Sign in to manage your computers.');
  const { user } = current;
  // Profile pictures (the user's request, 29 October 2026: "always pull profile pictures everywhere"): your own from
  // HN Group Auth, a computer owner's from the staff list (for people who approve computers). Kept ten minutes.
  const pic = /^\/api\/picture\/([A-Za-z0-9_-]{1,64})$/.exec(route);
  if (pic && method === 'GET') return picture(res, pic[1], current);
  if (route === '/api/me' && method === 'GET') return send(res, 200, { user, devices: store.forOwner(user.id), counts: user.admin ? store.counts() : null });
  if (route === '/api/link' && method === 'POST') {
    if (limited('link:' + user.id, 20, 600000)) throw fail(429, 'Too many tries. Wait a few minutes and try again.');
    const b = await json(req); return send(res, 200, { device: store.link(b.code, user) });
  }
  if (route === '/api/devices' && method === 'GET') { if (!user.admin) throw fail(403, 'Only owner-level and Super Admin accounts can see every computer.'); return send(res, 200, { devices: store.all(), audit: store.recentAudit(60) }); }
  const m = route.match(/^\/api\/devices\/([0-9a-f-]{36})(\/(approve|revoke|rename))?$/);
  if (m && UUID.test(m[1])) {
    const d = store.get(m[1]);
    if (!d) throw fail(404, 'That computer can’t be found.');
    const own = d.owner?.id === user.id;
    if (m[3] === 'approve' && method === 'POST') { if (!user.admin) throw fail(403, 'Only owner-level and Super Admin accounts can approve computers.'); return send(res, 200, { device: store.setStatus(d.id, 'authorised', user) }); }
    if (m[3] === 'revoke' && method === 'POST') { if (!user.admin) throw fail(403, 'Only owner-level and Super Admin accounts can revoke computers.'); return send(res, 200, { device: store.setStatus(d.id, 'revoked', user) }); }
    if (m[3] === 'rename' && method === 'POST') { if (!own && !user.admin) throw fail(403, 'You can only rename your own computers.'); const b = await json(req); return send(res, 200, { device: store.rename(d.id, b.name, user) }); }
    if (!m[2] && method === 'DELETE') { if (!own && !user.admin) throw fail(403, 'You can only remove your own computers.'); store.remove(d.id, user); return send(res, 200, { ok: true }); }
  }
  throw fail(404, 'Not found.');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
function serveStatic(req, res, url) {
  let rel = url.pathname === '/' || url.pathname === '/link' ? '/index.html' : url.pathname;
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { showPage(res, 404, 'Page not found', 'That page doesn’t exist.'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': rel === '/index.html' ? 'no-store' : 'public, max-age=300',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/healthz') return send(res, 200, { ok: true });
    if (url.pathname.startsWith('/auth/') && await auth.handle(req, res, url, showPage)) return;
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Not allowed.' });
    serveStatic(req, res, url);
  } catch (e) {
    const status = e.status || 500; if (status === 500) console.error(e);
    if (url.pathname.startsWith('/api/')) send(res, status, { error: status === 500 ? 'Something went wrong. Please try again.' : e.message });
    else showPage(res, status, 'Something went wrong', status === 500 ? 'Please try again.' : e.message);
  }
});
server.listen(PORT, HOST, () => console.log('HN Group Devices on ' + HOST + ':' + PORT));
