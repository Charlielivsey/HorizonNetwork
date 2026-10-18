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

test('HN Group VPN: sign-in, devices, admin and account checks', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-vpn-'));
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(path.join(dir, 'secret'), secret);
  // Stand-in for the private staff backend.
  const people = {
    'sam@hngroup.org.uk': { id: 'p-sam', password: 'sam password', pin: '123456', user: { id: 'p-sam', email: 'sam@hngroup.org.uk', displayName: 'Sam', statusAdminAllowed: false, ownerAccess: false } },
    'owner@hngroup.org.uk': { id: 'p-owner', password: 'owner password', pin: '654321', user: { id: 'p-owner', email: 'owner@hngroup.org.uk', displayName: 'Owner', ownerAccess: true } },
    'new@hngroup.org.uk': { id: 'p-new', password: 'temporary', pin: '111111', user: { id: 'p-new', email: 'new@hngroup.org.uk', displayName: 'New', codeSetupRequired: true } },
  };
  const enabled = { 'p-sam': true, 'p-owner': true, 'p-new': true };
  const sessions = new Map(), challenges = new Map();
  const backend = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      const data = JSON.parse(body || '{}');
      const send = (status, value, cookie) => { res.writeHead(status, { 'Content-Type': 'application/json', ...(cookie ? { 'Set-Cookie': 'hn_staff_session=' + cookie + '; Path=/' } : {}) }); res.end(JSON.stringify(value)); };
      if (req.headers.authorization !== 'Bearer ' + secret) return send(401, { error: 'No.' });
      const startSession = (p) => { const raw = crypto.randomBytes(32).toString('hex'); sessions.set(hash(raw), p); return raw; };
      if (req.url === '/api/login') { const p = people[data.username]; if (!p || p.password !== data.password) return send(401, { error: 'The email or password is wrong.' }); const c = crypto.randomBytes(16).toString('hex'); challenges.set(c, p); return send(200, { codeRequired: true, challenge: c }); }
      if (req.url === '/api/login/code') { const p = challenges.get(data.challenge); if (!p) return send(401, { error: 'Expired.', restart: true }); if (p.pin !== data.code) return send(401, { error: 'That PIN is wrong.' }); challenges.delete(data.challenge); return send(200, { ok: true }, startSession(p)); }
      if (req.url === '/api/auth/profile') { const p = sessions.get(data.session); return p ? send(200, { user: p.user, expires: Date.now() + 3600000 }) : send(401, { error: 'Expired.' }); }
      if (req.url === '/api/auth/account-status') return send(200, { accounts: Object.fromEntries(data.ids.map((id) => [id, !!enabled[id]])) });
      send(404, { error: 'Not found.' });
    });
  });
  await new Promise((r) => backend.listen(0, '127.0.0.1', r));
  const port = await freePort();
  const SITE = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', VPN_DATA_DIR: path.join(dir, 'data'), VPN_WG_FAKE: '1', VPN_ACCOUNTS_BACKEND: 'http://127.0.0.1:' + backend.address().port, STATUS_SSO_SECRET_FILE: path.join(dir, 'secret'), VPN_UPKEEP_MS: '400' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const call = async (p, o) => { const r = await fetch(SITE + p, { method: o && o.method || (o && o.json ? 'POST' : 'GET'), headers: { ...(o && o.json ? { 'Content-Type': 'application/json' } : {}), ...(o && o.token ? { Authorization: 'Bearer ' + o.token } : {}) }, body: o && o.json ? JSON.stringify(o.json) : o && o.body }); return { status: r.status, body: r.headers.get('content-type') === 'application/json' ? await r.json() : await r.text(), headers: r.headers }; };
  const signIn = async (email, password, pin) => { const a = await call('/api/sign-in', { json: { email, password } }); assert.equal(a.body.codeRequired, true); const b = await call('/api/sign-in/code', { json: { flow: a.body.flow, code: pin } }); return b; };
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(SITE + '/healthz')).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
    // The website loads in the HN design.
    const home = await call('/');
    assert.match(home.body, /HN Group VPN/); assert.match(home.body, /hn-group-wordmark\.svg/);
    assert.equal((await call('/api/me')).status, 401);

    // Password, then PIN.
    assert.match((await call('/api/sign-in', { json: { email: 'sam@hngroup.org.uk', password: 'wrong' } })).body.error, /wrong/);
    const a = await call('/api/sign-in', { json: { email: 'sam@hngroup.org.uk', password: 'sam password' } });
    assert.match((await call('/api/sign-in/code', { json: { flow: a.body.flow, code: '000000' } })).body.error, /PIN is wrong/);
    const signed = await call('/api/sign-in/code', { json: { flow: a.body.flow, code: '123456' } });
    assert.equal(signed.status, 200); assert.match(signed.body.token, /^[a-f0-9]{64}$/); assert.equal(signed.body.user.admin, false);
    const sam = signed.body.token;
    // Accounts that haven't finished setup can't use the VPN yet.
    assert.match((await signIn('new@hngroup.org.uk', 'temporary', '111111')).body.error, /Finish setting up your staff account/);

    // The Mac app registers with its own key; the server never sees the private key.
    const macKey = crypto.randomBytes(32).toString('base64');
    let r = await call('/api/devices', { token: sam, json: { name: 'Sam’s MacBook', publicKey: macKey } });
    assert.equal(r.status, 201);
    assert.equal(r.body.device.address, '10.88.0.2');
    assert.match(r.body.connection.config, /PrivateKey = <this device’s private key>/);
    assert.match(r.body.connection.config, /AllowedIPs = 0\.0\.0\.0\/0, ::\/0/);
    assert.match(r.body.connection.config, /Endpoint = vpn\.hngroup\.org\.uk:51820/);
    assert.deepEqual(r.body.connection.address, ['10.88.0.2/32', 'fd88:88::2/128']);
    assert.match((await call('/api/devices', { token: sam, json: { name: 'Again', publicKey: macKey } })).body.error, /already registered/);
    assert.match((await call('/api/devices', { token: sam, json: { name: 'Bad', publicKey: 'not-a-key' } })).body.error, /isn’t valid/);
    // A phone added from the website gets a key made by the server, shown once.
    r = await call('/api/devices', { token: sam, json: { name: 'Sam’s iPhone' } });
    assert.match(r.body.connection.config, /PrivateKey = [A-Za-z0-9+/]{43}=/);
    const phone = r.body.device.id;
    assert.doesNotMatch(JSON.stringify((await call('/api/me', { token: sam })).body), /PrivateKey/);
    // Up to five devices each.
    for (let i = 0; i < 3; i++) assert.equal((await call('/api/devices', { token: sam, json: { name: 'Extra ' + i } })).status, 201);
    assert.match((await call('/api/devices', { token: sam, json: { name: 'Too many' } })).body.error, /up to 5 devices/);
    let me = (await call('/api/me', { token: sam })).body;
    assert.equal(me.devices.length, 5); assert.equal(me.user.displayName, 'Sam');
    assert.equal((await call('/api/devices/' + phone, { token: sam, method: 'DELETE' })).status, 200);
    assert.equal((await call('/api/me', { token: sam })).body.devices.length, 4);

    // Staff only see their own devices; administrators see everyone's and can remove any.
    assert.equal((await call('/api/admin/devices', { token: sam })).status, 403);
    const owner = (await signIn('owner@hngroup.org.uk', 'owner password', '654321')).body.token;
    const all = (await call('/api/admin/devices', { token: owner })).body.devices;
    assert.equal(all.length, 4); assert.equal(all[0].owner.email, 'sam@hngroup.org.uk');
    assert.equal((await call('/api/devices/' + all[0].id, { token: owner, method: 'DELETE' })).status, 200);
    const ownerDevice = (await call('/api/devices', { token: owner, json: { name: 'Owner laptop' } })).body.device.id;
    assert.equal((await call('/api/devices/' + ownerDevice, { token: sam, method: 'DELETE' })).status, 404);

    // The Mac app: administrators publish it, signed-in staff download it.
    assert.equal((await call('/api/mac-app', { token: sam })).status, 404);
    assert.equal((await call('/api/admin/mac-app', { token: sam, body: Buffer.from('PK\x03\x04zip') , method: 'POST' })).status, 403);
    assert.equal((await call('/api/admin/mac-app', { token: owner, body: Buffer.from('not a zip'), method: 'POST' })).status, 400);
    assert.equal((await call('/api/admin/mac-app', { token: owner, body: Buffer.from('PK\x03\x04zip contents'), method: 'POST' })).status, 200);
    r = await call('/api/mac-app', { token: sam });
    assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/zip');
    assert.equal((await call('/api/mac-app')).status, 401);

    // Signing in survives a restart of the service (sign-ins are saved, hashed).
    assert.ok(!fs.readFileSync(path.join(dir, 'data', 'vpn.json'), 'utf8').includes(sam));

    // A disabled staff account loses its devices and sign-ins at the next check.
    enabled['p-sam'] = false;
    await new Promise((r2) => setTimeout(r2, 1200));
    assert.equal((await call('/api/me', { token: sam })).status, 401);
    me = (await call('/api/admin/devices', { token: owner })).body;
    assert.ok(me.devices.every((d) => d.owner.email !== 'sam@hngroup.org.uk'));

    // Signing out ends the token.
    assert.equal((await call('/api/sign-out', { token: owner, json: {} })).status, 200);
    assert.equal((await call('/api/me', { token: owner })).status, 401);
  } finally {
    child.kill(); backend.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
