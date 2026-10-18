'use strict';
// HN Group VPN — vpn.hngroup.org.uk. Staff sign in with their HN Group staff account (password and
// six-digit PIN) to register devices on the group's WireGuard VPN. The Mac app and the website use
// the same JSON API with a bearer token; the website keeps its token only for the browser tab.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const store = require('./lib/store');
const staff = require('./lib/staff');
const wg = require('./lib/wg');

const PUBLIC = process.env.VPN_PUBLIC_DIR || path.join(__dirname, 'public');
const DATA_DIR = process.env.VPN_DATA_DIR || '/var/lib/hn-vpn';
const ENDPOINT = process.env.VPN_ENDPOINT || 'vpn.hngroup.org.uk:51820';
const DNS = process.env.VPN_DNS || '1.1.1.1, 1.0.0.1';
const APP_FILE = path.join(DATA_DIR, 'HN-Group-VPN-macOS.zip');
const MAX_APP = 80 * 1024 * 1024;
const fail = staff.fail;
const flows = new Map(); // PIN step: hash(flow token) -> { challenge, expires }
const failures = new Map(); // sign-in attempts per IP

store.init(DATA_DIR);

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
const clientIp = (req) => String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
const client = (req) => ({ ip: clientIp(req), agent: req.headers['user-agent'] });
const tokenOf = (req) => (String(req.headers.authorization || '').match(/^Bearer ([a-f0-9]{64})$/) || [])[1] || '';
function who(req) {
  const s = store.session(tokenOf(req));
  if (!s) throw fail(401, 'Sign in again to manage your VPN devices.');
  return s.user;
}
function limited(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.first > 15 * 60000) { failures.delete(ip); return false; }
  return f.count >= 20;
}
function noteFailure(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.first > 15 * 60000) failures.set(ip, { count: 1, first: Date.now() }); else f.count++;
  if (failures.size > 50000) failures.clear();
}

// What a device needs to connect. The private key is only included when the server made it.
async function connection(d, privateKey) {
  const serverKey = await wg.serverPublicKey();
  const config = '[Interface]\n' +
    '# HN Group VPN · ' + d.name.replace(/[\r\n]/g, ' ') + '\n' +
    'PrivateKey = ' + (privateKey || '<this device’s private key>') + '\n' +
    'Address = ' + d.ipv4 + '/32, ' + d.ipv6 + '/128\n' +
    'DNS = ' + DNS + '\n\n' +
    '[Peer]\n' +
    'PublicKey = ' + serverKey + '\n' +
    'PresharedKey = ' + d.presharedKey + '\n' +
    'Endpoint = ' + ENDPOINT + '\n' +
    'AllowedIPs = 0.0.0.0/0, ::/0\n' +
    'PersistentKeepalive = 25\n';
  return { address: [d.ipv4 + '/32', d.ipv6 + '/128'], dns: DNS.split(',').map((x) => x.trim()), serverPublicKey: serverKey, presharedKey: d.presharedKey, endpoint: ENDPOINT, allowedIPs: ['0.0.0.0/0', '::/0'], config };
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

async function finishSignIn(res, user) {
  const token = store.createSession(user);
  send(res, 200, { token, user: { displayName: user.displayName, email: user.email, admin: user.admin } });
}

async function api(req, res, route) {
  const method = req.method;
  if (route === '/api/ip' && method === 'GET') return send(res, 200, { ip: clientIp(req), viaVpn: clientIp(req) === (process.env.VPN_PUBLIC_IP || '217.154.34.205') });

  // Sign in: password, then PIN.
  if (route === '/api/sign-in' && method === 'POST') {
    const ip = clientIp(req);
    if (limited(ip)) throw fail(429, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
    const body = await json(req);
    let result;
    try { result = await staff.signIn(body.email, body.password, client(req)); } catch (e) { if (e.status === 400 || e.status === 401) noteFailure(ip); throw e; }
    if (result.challenge) {
      for (const [k, v] of flows) if (v.expires <= Date.now()) flows.delete(k);
      if (flows.size > 10000) throw fail(503, 'Please try again shortly.');
      const flow = crypto.randomBytes(32).toString('hex');
      flows.set(staff.hash(flow), { challenge: result.challenge, expires: Date.now() + 5 * 60000 });
      return send(res, 200, { codeRequired: true, flow });
    }
    return finishSignIn(res, result.user);
  }
  if (route === '/api/sign-in/code' && method === 'POST') {
    const ip = clientIp(req);
    if (limited(ip)) throw fail(429, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
    const body = await json(req);
    const key = staff.hash(String(body.flow || '')), flow = flows.get(key);
    if (!flow || flow.expires <= Date.now()) { flows.delete(key); throw fail(401, 'Sign-in expired. Start again.', { restart: true }); }
    try { const { user } = await staff.signInCode(flow.challenge, body.code, client(req)); flows.delete(key); return finishSignIn(res, user); }
    catch (e) { if (e.restart) flows.delete(key); if (e.status === 400 || e.status === 401) noteFailure(ip); throw e; }
  }
  if (route === '/api/sign-out' && method === 'POST') { store.endSession(tokenOf(req)); return send(res, 200, { ok: true }); }

  const user = who(req);
  if (route === '/api/me' && method === 'GET') {
    return send(res, 200, { user: { displayName: user.displayName, email: user.email, admin: user.admin }, devices: await deviceView(store.devicesFor(user.id)), limit: store.MAX_DEVICES, macApp: fs.existsSync(APP_FILE) });
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
  let m = /^\/api\/devices\/([a-f0-9]{24})$/.exec(route);
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
    const tmp = APP_FILE + '.tmp';
    fs.writeFileSync(tmp, body, { mode: 0o600 }); fs.renameSync(tmp, APP_FILE);
    store.audit(user.email, 'mac-app.publish', body.length + ' bytes'); store.save();
    return send(res, 200, { ok: true });
  }
  if (route === '/api/mac-app' && method === 'GET') {
    let stat; try { stat = fs.statSync(APP_FILE); } catch { throw fail(404, 'The Mac app hasn’t been published yet.'); }
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': stat.size, 'Content-Disposition': 'attachment; filename="HN-Group-VPN-macOS.zip"', 'Cache-Control': 'no-store' });
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
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'");
  let route;
  try { route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return send(res, 400, { error: 'Invalid address.' }); }
  try {
    if (route === '/healthz') return send(res, 200, { ok: true });
    if (route.startsWith('/api/')) return await api(req, res, route);
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
