'use strict';
// HN Group VPN tests: staff sign-in (password then PIN, via a stand-in staff backend), device
// registration and limits, configs, admin access, disabled staff losing access, and the Mac app
// download. WireGuard runs in memory (VPN_WG_FAKE=1).
//   node --test vpn-site/test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const freePort = () => new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const zlib = require('node:zlib');
// A minimal zip (as ditto makes) holding one deflated file.
function zipOf(name, text) {
  const data = Buffer.from(text), packed = zlib.deflateRawSync(data), n = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(0, 42);
  const start = 30 + n.length + packed.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + n.length, 12); end.writeUInt32LE(start, 16);
  return Buffer.concat([local, n, packed, central, n, end]);
}
const plist = (id, version, build) => '<plist><dict><key>CFBundleIdentifier</key><string>' + id + '</string><key>CFBundleShortVersionString</key><string>' + version + '</string><key>CFBundleVersion</key><string>' + build + '</string></dict></plist>';
const PICTURE = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

test('HN Group VPN: Auth sign-in (website and Mac app), devices, admin and account checks', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-vpn-'));
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(path.join(dir, 'secret'), secret);
  const people = {
    sam: { id: 'p-sam', email: 'sam@hngroup.org.uk', displayName: 'Sam', statusAdminAllowed: false, ownerAccess: false, avatarUrl: '/api/avatar' },
    owner: { id: 'p-owner', email: 'owner@hngroup.org.uk', displayName: 'Owner', ownerAccess: true },
  };
  const enabled = { 'p-sam': true, 'p-owner': true };
  // Stand-in for HN Group Auth: an approved sign-in becomes a code for the "vpn" application.
  const codes = new Map(), appSessions = new Map();
  const authServer = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      const data = JSON.parse(body || '{}');
      const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
      if (req.headers.authorization !== 'Bearer ' + secret || data.client_id !== 'vpn') return send(401, { error: 'No.' });
      if (req.url === '/api/sso/exchange') {
        const g = codes.get(data.code); codes.delete(data.code);
        if (!g || g.state !== data.state) return send(401, { error: 'Sign-in link expired or already used.' });
        const session = crypto.randomBytes(32).toString('hex'); appSessions.set(session, g.who);
        return send(200, { session, expires: Date.now() + 3600000, user: people[g.who] });
      }
      if (req.url === '/api/sso/avatar') {
        const who = appSessions.get(data.session);
        if (!who || !people[who].avatarUrl) return send(404, { error: 'No profile picture.' });
        res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(PICTURE);
      }
      if (req.url === '/api/sso/session') { const who = appSessions.get(data.session); return who && enabled[people[who].id] ? send(200, { session: data.session, user: people[who] }) : send(401, { error: 'Expired.' }); }
      send(404, { error: 'Not found.' });
    });
  });
  // Stand-in for the private staff backend (account checks).
  const backend = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      const data = JSON.parse(body || '{}');
      res.writeHead(req.headers.authorization === 'Bearer ' + secret && req.url === '/api/auth/account-status' ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accounts: Object.fromEntries((data.ids || []).map((id) => [id, !!enabled[id]])) }));
    });
  });
  await new Promise((r) => authServer.listen(0, '127.0.0.1', r));
  await new Promise((r) => backend.listen(0, '127.0.0.1', r));
  const port = await freePort();
  const SITE = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', VPN_DATA_DIR: path.join(dir, 'data'), VPN_WG_FAKE: '1', VPN_ORIGIN: SITE, AUTH_ORIGIN: 'https://auth.example', AUTH_BACKEND: 'http://127.0.0.1:' + authServer.address().port,
      VPN_ACCOUNTS_BACKEND: 'http://127.0.0.1:' + backend.address().port, STATUS_SSO_SECRET_FILE: path.join(dir, 'secret'), VPN_UPKEEP_MS: '400' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const call = async (p, o) => {
    o = o || {};
    const headers = { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}), ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.origin ? { origin: o.origin } : {}), ...(o.headers || {}) };
    const r = await fetch(SITE + p, { method: o.method || (o.json ? 'POST' : 'GET'), headers, body: o.json ? JSON.stringify(o.json) : o.body, redirect: 'manual' });
    const type = r.headers.get('content-type') || '';
    return { status: r.status, body: type.startsWith('application/json') ? await r.json() : await r.text(), headers: r.headers };
  };
  const cookieOf = (r, name) => (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map((c) => c.split(';')[0]).find((c) => c.startsWith(name + '='));
  // Signs in through the stand-in Auth; for the Mac app, `app` is its challenge.
  const authSignIn = async (who, app) => {
    const start = await call('/auth/login' + (app ? '?app=' + app : ''));
    assert.equal(start.status, 302);
    const location = new URL(start.headers.get('location'));
    assert.equal(location.origin, 'https://auth.example'); assert.equal(location.searchParams.get('client_id'), 'vpn');
    const state = location.searchParams.get('state');
    const code = crypto.randomBytes(32).toString('hex'); codes.set(code, { state, who });
    return call('/auth/callback?code=' + code + '&state=' + state, { cookie: cookieOf(start, 'hn_vpn_state') });
  };
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(SITE + '/healthz')).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
    // The website offers HN Group Auth sign-in only, in the HN design.
    const home = await call('/');
    assert.match(home.body, /Sign in with HN Group Auth/); assert.match(home.body, /hn-group-wordmark\.svg/); assert.doesNotMatch(home.body, /type="password"/);
    assert.equal((await call('/api/me')).status, 401);
    assert.equal((await call('/api/sign-in', { json: { email: 'x', password: 'y' } })).status, 401);

    // Website sign-in: Auth, then a browser-session cookie.
    let r = await authSignIn('sam');
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/');
    const samCookie = cookieOf(r, 'hn_vpn_session');
    assert.ok(samCookie); assert.doesNotMatch(r.headers.getSetCookie().join(';'), /hn_vpn_session=[a-f0-9]+;[^,]*Max-Age/);
    let me = await call('/api/me', { cookie: samCookie });
    assert.equal(me.status, 200); assert.equal(me.body.user.displayName, 'Sam'); assert.equal(me.body.user.admin, false);
    // Changes need the website's own origin.
    assert.equal((await call('/api/devices', { cookie: samCookie, json: { name: 'Phone' } })).status, 403);
    r = await call('/api/devices', { cookie: samCookie, origin: SITE, json: { name: 'Sam’s iPhone' } });
    assert.equal(r.status, 201);
    assert.match(r.body.connection.config, /PrivateKey = [A-Za-z0-9+/]{43}=/);
    // Full tunnel: all traffic (IPv4 and IPv6) and DNS go through the VPN; config version 3.
    assert.match(r.body.connection.config, /AllowedIPs = 0\.0\.0\.0\/0, ::\/0/);
    assert.match(r.body.connection.config, /^DNS = 1\.1\.1\.1, 1\.0\.0\.1$/m);
    assert.equal(r.body.connection.configVersion, 3);
    assert.match(r.body.connection.config, /Endpoint = vpn\.hngroup\.org\.uk:51820/);
    const phone = r.body.device.id;
    // A stale or forged callback is refused.
    assert.equal((await call('/auth/callback?code=' + 'a'.repeat(64) + '&state=' + 'b'.repeat(64))).status, 400);

    // Mac app sign-in: Auth in the browser, a one-time code for the app, swapped with its secret.
    const verifier = crypto.randomBytes(32).toString('hex'), challenge = hash(verifier);
    assert.equal((await call('/auth/login?app=nothex')).status, 400);
    r = await authSignIn('sam', challenge);
    assert.equal(r.status, 200);
    const appCode = r.body.match(/hngroupvpn:\/\/signed-in\?code=([a-f0-9]{64})/)[1];
    assert.match(r.body, /http-equiv="refresh"/);
    assert.equal(cookieOf(r, 'hn_vpn_session'), undefined);
    assert.equal((await call('/api/app/exchange', { json: { code: appCode, verifier: 'f'.repeat(64) } })).status, 401);
    r = await authSignIn('sam', challenge);
    const appCode2 = r.body.match(/code=([a-f0-9]{64})/)[1];
    r = await call('/api/app/exchange', { json: { code: appCode2, verifier } });
    assert.equal(r.status, 200); assert.equal(r.body.user.displayName, 'Sam');
    const sam = r.body.token;
    assert.equal((await call('/api/app/exchange', { json: { code: appCode2, verifier } })).status, 401);
    // HN Browser: the code goes to its loopback address instead of an hngroupvpn:// link.
    assert.equal((await call('/auth/login?loopback=50123')).status, 400);
    assert.equal((await call('/auth/login?app=' + challenge + '&loopback=99999')).status, 400);
    {
      const start = await call('/auth/login?app=' + challenge + '&loopback=50123');
      const st = new URL(start.headers.get('location')).searchParams.get('state');
      const c = crypto.randomBytes(32).toString('hex'); codes.set(c, { state: st, who: 'sam' });
      const back = await call('/auth/callback?code=' + c + '&state=' + st, { cookie: cookieOf(start, 'hn_vpn_state') });
      assert.equal(back.status, 302);
      const loop = new URL(back.headers.get('location'));
      assert.equal(loop.origin, 'http://127.0.0.1:50123'); assert.equal(loop.pathname, '/vpn-callback');
      const browserToken = (await call('/api/app/exchange', { json: { code: loop.searchParams.get('code'), verifier } })).body.token;
      assert.match(browserToken, /^[a-f0-9]{64}$/);
      await call('/api/me', { token: browserToken, headers: { 'X-HN-VPN-Client': 'hn-browser', 'X-HN-VPN-App': '0.6.0' } });
      const mine = (await call('/api/profile', { token: browserToken })).body.sessions.find((x) => x.current);
      assert.equal(mine.client, 'HN Browser'); assert.equal(mine.appVersion, '0.6.0');
      assert.equal((await call('/api/sign-out', { token: browserToken, json: {} })).status, 200);
    }
    // The staff profile picture comes from Auth, for the website and the app.
    assert.ok(r.body.user.avatar);
    r = await call('/api/avatar', { token: sam });
    assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/png');
    assert.equal((await call('/api/avatar', { cookie: samCookie })).status, 200);
    assert.equal((await call('/api/avatar')).status, 401);
    // The profile lists the person's sign-ins (with the app's version) and can end another one.
    await call('/api/me', { token: sam, headers: { 'X-HN-VPN-App': '1.2.0 (7)' } });
    let profile = (await call('/api/profile', { cookie: samCookie })).body;
    assert.equal(profile.user.email, 'sam@hngroup.org.uk');
    const appSignIn = profile.sessions.find((x) => x.kind === 'app' && x.appVersion === '1.2.0 (7)');
    assert.ok(appSignIn); assert.ok(profile.sessions.find((x) => x.current && x.kind === 'web'));
    assert.ok(profile.activity.some((a) => a.action === 'sign-in.app'));
    const spare = (await call('/api/app/exchange', { json: { code: (await authSignIn('sam', challenge)).body.match(/code=([a-f0-9]{64})/)[1], verifier } })).body.token;
    const spareId = (await call('/api/profile', { token: spare })).body.sessions.find((x) => x.current).id;
    assert.equal((await call('/api/sessions/' + spareId, { cookie: samCookie, origin: SITE, method: 'DELETE' })).status, 200);
    assert.equal((await call('/api/me', { token: spare })).status, 401);
    assert.equal((await call('/api/sessions/' + spareId, { cookie: samCookie, origin: SITE, method: 'DELETE' })).status, 404);

    // The Mac app registers with its own key; the server never sees the private key.
    const macKey = crypto.randomBytes(32).toString('base64');
    r = await call('/api/devices', { token: sam, json: { name: 'Sam’s MacBook', publicKey: macKey } });
    assert.equal(r.status, 201);
    assert.match(r.body.connection.config, /PrivateKey = <this device’s private key>/);
    assert.deepEqual(r.body.connection.address, [r.body.device.address + '/32', 'fd88:88::' + Number(r.body.device.address.split('.')[3]).toString(16) + '/128']);
    assert.match((await call('/api/devices', { token: sam, json: { name: 'Again', publicKey: macKey } })).body.error, /already registered/);
    assert.match((await call('/api/devices', { token: sam, json: { name: 'Bad', publicKey: 'not-a-key' } })).body.error, /isn’t valid/);
    for (let i = 0; i < 3; i++) assert.equal((await call('/api/devices', { token: sam, json: { name: 'Extra ' + i } })).status, 201);
    assert.match((await call('/api/devices', { token: sam, json: { name: 'Too many' } })).body.error, /up to 5 devices/);
    assert.doesNotMatch(JSON.stringify((await call('/api/me', { token: sam })).body), /PrivateKey/);
    assert.equal((await call('/api/devices/' + phone, { token: sam, method: 'DELETE' })).status, 200);
    assert.equal((await call('/api/me', { token: sam })).body.devices.length, 4);

    // Administrators see everyone's devices and can remove any; staff only their own.
    assert.equal((await call('/api/admin/devices', { token: sam })).status, 403);
    const ownerCookie = cookieOf(await authSignIn('owner'), 'hn_vpn_session');
    const all = (await call('/api/admin/devices', { cookie: ownerCookie })).body.devices;
    assert.equal(all.length, 4); assert.equal(all[0].owner.email, 'sam@hngroup.org.uk');
    assert.equal((await call('/api/devices/' + all[0].id, { cookie: ownerCookie, origin: SITE, method: 'DELETE' })).status, 200);
    const ownerDevice = (await call('/api/devices', { cookie: ownerCookie, origin: SITE, json: { name: 'Owner laptop' } })).body.device.id;
    assert.equal((await call('/api/devices/' + ownerDevice, { token: sam, method: 'DELETE' })).status, 404);

    // The Mac app: administrators publish it, signed-in staff download it.
    assert.equal((await call('/api/mac-app', { token: sam })).status, 404);
    assert.equal((await call('/api/admin/mac-app', { token: sam, body: Buffer.from('PK\x03\x04zip'), method: 'POST' })).status, 403);
    assert.equal((await call('/api/admin/mac-app', { cookie: ownerCookie, origin: SITE, body: Buffer.from('not a zip'), method: 'POST' })).status, 400);
    assert.equal((await call('/api/admin/mac-app', { cookie: ownerCookie, origin: SITE, body: Buffer.from('PK\x03\x04zip contents'), method: 'POST' })).status, 400);
    assert.equal((await call('/api/admin/mac-app', { cookie: ownerCookie, origin: SITE, body: zipOf('Other.app/Contents/Info.plist', plist('com.example.other', '1.0', '1')), method: 'POST' })).status, 400);
    const appZip = zipOf('HN Group VPN.app/Contents/Info.plist', plist('uk.org.hngroup.vpn', '1.2.0', '7'));
    assert.equal((await call('/api/admin/mac-app', { cookie: ownerCookie, origin: SITE, body: appZip, method: 'POST' })).status, 200);
    r = await call('/api/mac-app/latest', { token: sam });
    assert.equal(r.body.version, '1.2.0'); assert.equal(r.body.build, 7); assert.equal(r.body.sha256, hash(appZip));
    assert.equal((await call('/api/me', { cookie: samCookie })).body.macApp.version, '1.2.0');
    r = await call('/api/mac-app', { cookie: samCookie });
    assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/zip');
    assert.match(r.headers.get('content-disposition'), /HN-Secure-Network-macOS-1\.2\.0\.zip/);
    assert.equal((await call('/api/mac-app')).status, 401);
    assert.ok(!fs.readFileSync(path.join(dir, 'data', 'vpn.json'), 'utf8').includes(sam));

    // A disabled staff account loses its devices, its app sign-in and its website sign-in.
    enabled['p-sam'] = false;
    await new Promise((r2) => setTimeout(r2, 1200));
    assert.equal((await call('/api/me', { token: sam })).status, 401);
    assert.equal((await call('/api/me', { cookie: samCookie })).status, 401);
    assert.ok((await call('/api/admin/devices', { cookie: ownerCookie })).body.devices.every((d) => d.owner.email !== 'sam@hngroup.org.uk'));

    // Signing out ends the website sign-in.
    assert.equal((await call('/api/sign-out', { cookie: ownerCookie, origin: SITE, json: {} })).status, 200);
    assert.equal((await call('/api/me', { cookie: ownerCookie })).status, 401);
  } finally {
    child.kill(); backend.close(); authServer.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
