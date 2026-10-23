'use strict';
// HN Group VPN — vpn.hngroup.org.uk. Staff sign in through HN Group Auth to register devices on the
// group's WireGuard VPN. The website uses a browser-session cookie tied to the Auth sign-in; the Mac
// app signs in through Auth in the browser and then uses its own bearer token (see lib/auth.js).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const store = require('./lib/store');
const staff = require('./lib/staff');
const wg = require('./lib/wg');
const { createAuth } = require('./lib/auth');
const macApp = require('./lib/macapp');

const PUBLIC = process.env.VPN_PUBLIC_DIR || path.join(__dirname, 'public');
const DATA_DIR = process.env.VPN_DATA_DIR || '/var/lib/hn-vpn';
const ENDPOINT = process.env.VPN_ENDPOINT || 'vpn.hngroup.org.uk:51820';
const DNS = process.env.VPN_DNS || '1.1.1.1, 1.0.0.1';
const APP_FILE = path.join(DATA_DIR, 'HN-Group-VPN-macOS.zip');
const MAX_APP = 80 * 1024 * 1024;
const fail = staff.fail;

store.init(DATA_DIR);
const auth = createAuth(store);

function send(res, status, value, headers) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(headers || {}) });
  res.end(JSON.stringify(value));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(fail(413, 'That is too large.')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function json(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw fail(415, 'Send JSON.');
  try { return JSON.parse((await readBody(req, 32 * 1024)).toString('utf8') || '{}'); } catch (e) { if (e.status) throw e; throw fail(400, 'That request isn’t valid.'); }
}
// The addresses traffic leaves this server from (IPv4 and, when the VPN passes it on, IPv6).
function serverAddresses() {
  const all = new Set([process.env.VPN_PUBLIC_IP || '217.154.34.205']);
  for (const list of Object.values(require('node:os').networkInterfaces())) for (const a of list || []) if (!a.internal) all.add(a.address);
  return all;
}
const clientIp = (req) => String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
async function who(req) {
  const current = await auth.current(req);
  if (!current) throw fail(401, 'Sign in again to manage your VPN devices.');
  return current;
}

// A small page in the site's design, for sign-in results.
const escHtml = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function showPage(res, status, title, text, cookies, appUrl) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': cookies || [] });
  res.end('<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">' +
    (appUrl ? '<meta http-equiv="refresh" content="0;url=' + escHtml(appUrl) + '">' : '') + '<title>' + escHtml(title) + ' · HN Group VPN</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/vpn.css?v=6"></head><body>' +
    '<header class="top"><div class="wrap top-inner"><a class="brand" href="/"><img class="on-light" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group" width="118" height="41"><img class="on-dark" src="/assets/brand/hn-group-wordmark-white.svg" alt="" width="118" height="41"><span class="brand-name">VPN</span></a></div><div class="stripe" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></header>' +
    '<main class="wrap"><section class="card narrow"><h1>' + escHtml(title) + '</h1><p class="muted">' + escHtml(text) + '</p><p>' + (appUrl ? '<a class="btn btn-primary" href="' + escHtml(appUrl) + '">Open HN Group VPN</a>' : '<a class="btn btn-primary" href="/">Back to the VPN</a>') + '</p></section></main></body></html>');
}

// What a device needs to connect. The private key is only included when the server made it.
// Full tunnel (the user's request, 19 October 2026): all of a device's traffic goes through the VPN.
// configVersion 3 tells apps set up for the split tunnel (2) to fetch and install this configuration.
async function connection(d, privateKey) {
  const serverKey = await wg.serverPublicKey();
  const config = '[Interface]\n' +
    '# HN Group VPN · ' + d.name.replace(/[\r\n]/g, ' ') + ' · all traffic goes through the VPN\n' +
    'PrivateKey = ' + (privateKey || '<this device’s private key>') + '\n' +
    'Address = ' + d.ipv4 + '/32, ' + d.ipv6 + '/128\n' +
    'DNS = ' + DNS + '\n\n' +
    '[Peer]\n' +
    'PublicKey = ' + serverKey + '\n' +
    'PresharedKey = ' + d.presharedKey + '\n' +
    'Endpoint = ' + ENDPOINT + '\n' +
    'AllowedIPs = 0.0.0.0/0, ::/0\n' +
    'PersistentKeepalive = 25\n';
  return { address: [d.ipv4 + '/32', d.ipv6 + '/128'], dns: DNS.split(',').map((x) => x.trim()), serverAddress: '10.88.0.1', serverPublicKey: serverKey, presharedKey: d.presharedKey, endpoint: ENDPOINT, allowedIPs: ['0.0.0.0/0', '::/0'], configVersion: 3, config };
}

async function deviceView(list) {
  let live = {};
  try { live = await wg.peers(); } catch { live = {}; }
  return list.map((d) => {
    const p = live[d.publicKey] || {};
    return { id: d.id, name: d.name, address: d.ipv4, createdAt: d.createdAt, lastHandshake: p.handshake ? new Date(p.handshake).toISOString() : null,
      connected: !!(p.handshake && Date.now() - p.handshake < 3 * 60000), received: p.rx || 0, sent: p.tx || 0, owner: { email: d.email, displayName: d.displayName } };
  });
}

const userView = (user) => ({ displayName: user.displayName, email: user.email, admin: user.admin, avatar: store.avatarTag(user.id) });
// The published Mac app's version, for the website and for the app's update check.
function appView() {
  const a = macApp.info(APP_FILE);
  return a && { version: a.version, build: a.build, size: a.size, sha256: a.sha256, publishedAt: a.publishedAt };
}

async function api(req, res, route) {
  const method = req.method;
  if (route === '/api/ip' && method === 'GET') return send(res, 200, { ip: clientIp(req), viaVpn: serverAddresses().has(clientIp(req).replace(/^::ffff:/, '')) });

  // The Mac app's sign-in finishes here (see lib/auth.js).
  if (route === '/api/app/exchange' && method === 'POST') {
    const body = await json(req);
    const r = auth.exchangeAppCode(body.code, body.verifier);
    return send(res, 200, { token: r.token, user: userView(r.user) });
  }
  if (route === '/api/sign-out' && method === 'POST') {
    const current = await auth.current(req).catch(() => null);
    if (current) store.endSession(current.token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': auth.SESSION_COOKIE + '=; Path=/; HttpOnly;' + (auth.VPN_ORIGIN.startsWith('https://') ? ' Secure;' : '') + ' SameSite=Lax; Max-Age=0' });
  }

  const current = await who(req), { user } = current;
  let m;
  // The Mac app says which version it is, so the profile can show it.
  const appVersion = String(req.headers['x-hn-vpn-app'] || '');
  // HN Browser and Secure Network both use app sign-ins; X-HN-VPN-Client says which one this is.
  const appClient = { 'hn-browser': 'HN Browser', 'secure-terminal': 'HN Secure Network', 'secure-network': 'HN Secure Network' }[String(req.headers['x-hn-vpn-client'] || '')];
  if (!current.cookie && (appClient || /^[0-9][0-9A-Za-z.\- ()]{0,30}$/.test(appVersion))) { const s = store.session(current.token); if (s) { if (/^[0-9][0-9A-Za-z.\- ()]{0,30}$/.test(appVersion)) s.appVersion = appVersion; if (appClient) s.client = appClient; } }
  // HN Secure Network (Mac and Windows) asks for the six-digit PIN before every VPN connection.
  if (route === '/api/app/verify-pin' && method === 'POST') {
    const body = await json(req);
    if (!/^\d{6}$/.test(String(body.pin || ''))) throw fail(400, 'Enter your six-digit PIN.');
    await staff.verifyPin(user.id, body.pin, { ip: clientIp(req), agent: appClient || 'HN Group VPN' });
    store.audit(user.email, 'vpn.pin-confirmed', appClient || 'App'); store.save();
    return send(res, 200, { ok: true });
  }
  if (route === '/api/me' && method === 'GET') {
    return send(res, 200, { user: userView(user), devices: await deviceView(store.devicesFor(user.id)), limit: store.MAX_DEVICES, macApp: appView() });
  }
  if (route === '/api/profile' && method === 'GET') {
    const devices = await deviceView(store.devicesFor(user.id));
    return send(res, 200, { user: userView(user), devices, limit: store.MAX_DEVICES, sessions: store.sessionsFor(user.id, current.token), activity: store.activityFor(user.email, 15).map((a) => ({ at: a.at, action: a.action, detail: a.detail })) });
  }
  m = /^\/api\/sessions\/([a-f0-9]{16})$/.exec(route);
  if (m && method === 'DELETE') {
    if (!store.endSessionById(user.id, m[1])) throw fail(404, 'That sign-in has already ended.');
    return send(res, 200, { ok: true });
  }
  if (route === '/api/avatar' && method === 'GET') {
    const a = store.avatar(user.id);
    if (!a) throw fail(404, 'No profile picture.');
    res.writeHead(200, { 'Content-Type': a.mime, 'Content-Length': a.image.length, 'Cache-Control': 'private, no-cache', ETag: '"' + a.tag + '"' });
    res.end(a.image);
    return;
  }
  // The Mac app checks here for a newer build, then downloads /api/mac-app and checks its SHA-256.
  if (route === '/api/mac-app/latest' && method === 'GET') {
    const a = appView();
    if (!a) throw fail(404, 'The Mac app hasn’t been published yet.');
    return send(res, 200, a);
  }
  if (route === '/api/devices' && method === 'POST') {
    const body = await json(req);
    let publicKey = String(body.publicKey || '').trim(), privateKey = '';
    if (publicKey) { if (!wg.KEY.test(publicKey)) throw fail(400, 'That device key isn’t valid.'); }
    else ({ privateKey, publicKey } = await wg.keyPair());
    const d = store.addDevice(user, body.name, publicKey, await wg.presharedKey());
    try { await wg.addPeer(d); } catch (e) { store.removeDevice(d.id, 'system'); throw e; }
    return send(res, 201, { device: (await deviceView([d]))[0], connection: await connection(d, privateKey) });
  }
  m = /^\/api\/devices\/([a-f0-9]{24})$/.exec(route);
  if (m && method === 'DELETE') {
    const d = store.device(m[1]);
    if (!d || (d.personId !== user.id && !user.admin)) throw fail(404, 'That device isn’t registered to you.');
    await wg.removePeer(d.publicKey).catch(() => {});
    store.removeDevice(d.id, user.email);
    return send(res, 200, { ok: true });
  }
  m = /^\/api\/devices\/([a-f0-9]{24})\/connection$/.exec(route);
  if (m && method === 'GET') {
    const d = store.device(m[1]);
    if (!d || d.personId !== user.id) throw fail(404, 'That device isn’t registered to you.');
    return send(res, 200, { connection: await connection(d, '') });
  }

  // Administrators (the system owner, owner-level accounts and Super Admin members).
  if (route === '/api/admin/devices' && method === 'GET') {
    if (!user.admin) throw fail(403, 'Only administrators can see every device.');
    return send(res, 200, { devices: await deviceView(store.devices()) });
  }
  if (route === '/api/admin/mac-app' && method === 'POST') {
    if (!user.admin) throw fail(403, 'Only administrators can publish the Mac app.');
    const body = await readBody(req, MAX_APP);
    if (body.slice(0, 4).toString('binary') !== 'PK\x03\x04') throw fail(400, 'Upload the app as a .zip file.');
    let plist = null; try { plist = macApp.infoPlist(body); } catch { plist = null; }
    if (!plist || !/CFBundleShortVersionString/.test(plist) || !/<key>CFBundleIdentifier<\/key>\s*<string>uk\.org\.hngroup\.vpn<\/string>/.test(plist)) throw fail(400, 'That zip doesn’t contain the HN Secure Network app.');
    const tmp = APP_FILE + '.tmp';
    fs.writeFileSync(tmp, body, { mode: 0o600 }); fs.renameSync(tmp, APP_FILE);
    const a = appView();
    store.audit(user.email, 'mac-app.publish', 'version ' + a.version + ' (build ' + a.build + '), ' + body.length + ' bytes'); store.save();
    return send(res, 200, { ok: true, macApp: a });
  }
  if (route === '/api/mac-app' && method === 'GET') {
    let stat; try { stat = fs.statSync(APP_FILE); } catch { throw fail(404, 'The Mac app hasn’t been published yet.'); }
    const a = appView();
    const name = 'HN-Secure-Network-macOS' + (a && a.version ? '-' + a.version : '') + '.zip';
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': stat.size, 'Content-Disposition': 'attachment; filename="' + name + '"', 'Cache-Control': 'no-store', ...(a ? { 'X-Content-SHA256': a.sha256 } : {}) });
    fs.createReadStream(APP_FILE).pipe(res);
    return;
  }
  throw fail(404, 'Not found.');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
function serveStatic(res, route) {
  const rel = route === '/' ? '/index.html' : route;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep) || !TYPES[path.extname(file)]) return false;
  let stat; try { stat = fs.statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)], 'Content-Length': stat.size, 'Cache-Control': rel === '/index.html' ? 'no-cache' : 'public, max-age=3600' });
  fs.createReadStream(file).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self' " + auth.AUTH_ORIGIN + "; frame-ancestors 'none'; base-uri 'none'; object-src 'none'");
  let route;
  try { route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return send(res, 400, { error: 'Invalid address.' }); }
  try {
    if (route === '/healthz') return send(res, 200, { ok: true });
    if (route.startsWith('/api/')) return await api(req, res, route);
    if (route.startsWith('/auth/') && await auth.handle(req, res, new URL(req.url, 'http://localhost'), showPage)) return;
    if (req.method === 'GET' && serveStatic(res, route)) return;
    if (req.method === 'GET' && serveStatic(res, '/')) return;
    send(res, 404, { error: 'Not found.' });
  } catch (err) {
    if (!err.status) console.error(err);
    if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'Something went wrong. Please try again.', ...(err.restart ? { restart: true } : {}) });
    else res.destroy();
  }
});

// Keep the interface's peers matching the registered devices, and drop devices of staff accounts
// that are no longer enabled.
async function maintain() {
  try {
    const ids = [...new Set(store.devices().map((d) => d.personId).concat(Object.values(store.db.sessions).map((s) => s.user.id)))];
    const accounts = await staff.accountStatus(ids);
    if (accounts) { const gone = ids.filter((x) => accounts[x] === false); if (gone.length) store.removePeople(gone, 'system'); }
    await wg.reconcile(store.devices());
  } catch (e) { console.error('VPN upkeep:', e.message); }
}

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 5000;
  server.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log('HN Group VPN on ' + PORT));
  maintain();
  setInterval(maintain, Number(process.env.VPN_UPKEEP_MS) || 5 * 60000).unref();
}
module.exports = { server, maintain };
