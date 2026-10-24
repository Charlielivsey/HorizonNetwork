'use strict';
// HN Group Devices tests: the apps' device check (registration, secrets, copied identities, limits), staff
// sign-in through a stand-in HN Group Auth, adding a computer with its code, approval by an administrator,
// revoking, renaming and removing, and who may do what.
//   node --test devices-site/test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const freePort = () => new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const hex = () => crypto.randomBytes(32).toString('hex');

test('HN Group Devices: device checks, adding, approving and managing computers', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-devices-'));
  const secret = hex(); fs.writeFileSync(path.join(dir, 'secret'), secret);
  const people = {
    sam: { id: 'p-sam', email: 'sam@hngroup.org.uk', displayName: 'Sam Taylor', statusAdminAllowed: false, ownerAccess: false },
    alex: { id: 'p-alex', email: 'alex@hngroup.org.uk', displayName: 'Alex', statusAdminAllowed: false, ownerAccess: false },
    owner: { id: 'p-owner', email: 'charlie@hngroup.org.uk', displayName: 'Charlie', ownerAccess: true },
  };
  // Stand-in for HN Group Auth: an approved sign-in becomes a code for the "devices" application.
  const codes = new Map(), sessions = new Map();
  const authServer = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      const data = JSON.parse(body || '{}'), send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
      if (req.headers.authorization !== 'Bearer ' + secret || data.client_id !== 'devices') return send(401, { error: 'No.' });
      if (req.url === '/api/sso/exchange') { const g = codes.get(data.code); codes.delete(data.code); if (!g || g.state !== data.state) return send(401, { error: 'Expired.' }); const s = hex(); sessions.set(s, g.who); return send(200, { session: s, expires: Date.now() + 3600000, user: people[g.who] }); }
      if (req.url === '/api/sso/session') { const who = sessions.get(data.session); return who ? send(200, { session: data.session, user: people[who] }) : send(401, { error: 'Expired.' }); }
      send(404, { error: 'Not found' });
    });
  });
  await new Promise((r) => authServer.listen(0, '127.0.0.1', r));
  const port = await freePort(), SITE = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DEVICES_DATA_DIR: path.join(dir, 'data'), DEVICES_ORIGIN: SITE, AUTH_ORIGIN: 'https://auth.example', AUTH_BACKEND: 'http://127.0.0.1:' + authServer.address().port, STATUS_SSO_SECRET_FILE: path.join(dir, 'secret') }, stdio: ['ignore', 'ignore', 'inherit'] });
  const call = async (p, o = {}) => {
    const headers = { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.origin === false ? {} : o.method && o.method !== 'GET' || o.json ? { origin: SITE } : {}), ...(o.headers || {}) };
    const r = await fetch(SITE + p, { method: o.method || (o.json ? 'POST' : 'GET'), headers, body: o.json ? JSON.stringify(o.json) : undefined, redirect: 'manual' });
    const type = r.headers.get('content-type') || '';
    return { status: r.status, body: type.startsWith('application/json') ? await r.json() : await r.text(), headers: r.headers };
  };
  const cookieOf = (r, name) => (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map((c) => c.split(';')[0]).find((c) => c.startsWith(name + '='));
  const signIn = async (who, next) => {
    const start = await call('/auth/login' + (next ? '?next=' + encodeURIComponent(next) : ''));
    const location = new URL(start.headers.get('location')); assert.equal(location.searchParams.get('client_id'), 'devices');
    const state = location.searchParams.get('state'), code = hex(); codes.set(code, { state, who });
    const back = await call('/auth/callback?code=' + code + '&state=' + state, { cookie: cookieOf(start, 'hn_devices_state') });
    assert.equal(back.status, 302); return { cookie: cookieOf(back, 'hn_devices_session'), location: back.headers.get('location') };
  };
  const computer = (extra = {}) => ({ id: crypto.randomUUID(), secret: hex(), machine: hex(), name: 'Sam’s MacBook Pro', platform: 'darwin', os: 'macOS 15.1', app: 'app-manager', version: '2.1.0', ...extra });
  const check = (c, extra = {}) => call('/api/device/check', { json: { ...c, ...extra }, origin: false });
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(SITE + '/healthz')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
    // The page offers HN Group Auth sign-in only.
    const home = await call('/'); assert.match(home.body, /Sign in with HN Group Auth/); assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal((await call('/api/me')).status, 401);

    // A new computer registers itself and gets a code; checks are rejected without a valid identity.
    const mac = computer();
    let r = await check(mac);
    assert.equal(r.status, 200); assert.equal(r.body.status, 'unlinked'); assert.match(r.body.code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    assert.equal(r.body.linkUrl, SITE + '/link?code=' + r.body.code); assert.ok(r.body.trustFor > 0);
    const code = r.body.code;
    assert.equal((await check(mac, { secret: hex() })).status, 403, 'a wrong secret is refused');
    assert.equal((await check(mac, { id: 'nope' })).status, 400);
    assert.equal((await check(mac, { app: 'evil' })).status, 400);
    assert.equal((await check(mac, { platform: 'amiga' })).status, 400);

    // Sam adds it with the code (signing in first through the link), and it waits for approval.
    const sam = await signIn('sam', '/link?code=' + code);
    assert.equal(sam.location, '/link?code=' + code, 'signing in returns to the link page');
    assert.equal((await call('/api/link', { cookie: sam.cookie, json: { code: 'ZZZZ-ZZZZ' } })).status, 404);
    assert.equal((await call('/api/link', { cookie: sam.cookie, json: { code }, origin: false, headers: { origin: 'https://evil.example' } })).status, 403, 'changes must come from the site');
    r = await call('/api/link', { cookie: sam.cookie, json: { code: code.toLowerCase().replace('-', '') } });
    assert.equal(r.status, 200); assert.equal(r.body.device.status, 'pending'); assert.equal(r.body.device.owner.displayName, 'Sam Taylor');
    assert.equal((await call('/api/link', { cookie: sam.cookie, json: { code } })).status, 404, 'a code works once');
    r = await check(mac); assert.equal(r.body.status, 'pending'); assert.equal(r.body.code, null); assert.equal(r.body.owner.displayName, 'Sam Taylor'); assert.equal(r.body.owner.email, undefined, 'apps don’t get email addresses');
    const mine = (await call('/api/me', { cookie: sam.cookie })).body;
    assert.equal(mine.devices.length, 1); assert.equal(mine.devices[0].apps[0].name, 'HN Group App Manager'); assert.equal(mine.counts, null);
    const id = mine.devices[0].id;

    // Only administrators approve; staff can't see everyone or approve their own.
    assert.equal((await call('/api/devices', { cookie: sam.cookie })).status, 403);
    assert.equal((await call('/api/devices/' + id + '/approve', { cookie: sam.cookie, json: {} })).status, 403);
    const owner = await signIn('owner');
    r = await call('/api/devices', { cookie: owner.cookie }); assert.equal(r.status, 200); assert.equal(r.body.devices.length, 1); assert.ok(r.body.audit.some((a) => a.action === 'device.linked'));
    assert.equal((await call('/api/devices/' + id + '/approve', { cookie: owner.cookie, json: {} })).body.device.status, 'authorised');
    r = await check(mac, { app: 'browser', version: '1.1.5' }); assert.equal(r.body.status, 'authorised');

    // A copied identity on other hardware is held back until an administrator approves that hardware.
    r = await check(mac, { machine: hex() }); assert.equal(r.body.status, 'mismatch');
    assert.equal((await check(mac)).body.status, 'authorised', 'the original computer still works');
    const copied = { ...mac, machine: hex() };
    assert.equal((await check(copied)).body.status, 'mismatch');
    assert.equal((await call('/api/devices/' + id + '/approve', { cookie: owner.cookie, json: {} })).status, 200);
    assert.equal((await check(copied)).body.status, 'authorised', 'approving trusts the new hardware');
    assert.equal((await check(mac)).body.status, 'mismatch', 'and no longer the old one');

    // Revoking stops it; renaming and removing are for the owner or administrators only.
    assert.equal((await call('/api/devices/' + id + '/revoke', { cookie: owner.cookie, json: {} })).body.device.status, 'revoked');
    assert.equal((await check(copied)).body.status, 'revoked');
    const alex = await signIn('alex');
    assert.equal((await call('/api/devices/' + id + '/rename', { cookie: alex.cookie, json: { name: 'Mine now' } })).status, 403);
    assert.equal((await call('/api/devices/' + id, { cookie: alex.cookie, method: 'DELETE' })).status, 403);
    assert.equal((await call('/api/devices/' + id + '/rename', { cookie: sam.cookie, json: { name: '  Sam’s work laptop \n' } })).body.device.name, 'Sam’s work laptop');
    assert.equal((await check(copied)).body.name, 'Sam’s work laptop', 'a chosen name isn’t replaced by the computer’s own');

    // An administrator adding their own computer approves it at once.
    const pc = computer({ name: 'CHARLIE-PC', platform: 'win32', app: 'secure-network' });
    const pcCode = (await check(pc)).body.code;
    assert.equal((await call('/api/link', { cookie: owner.cookie, json: { code: pcCode } })).body.device.status, 'authorised');
    assert.equal((await check(pc)).body.status, 'authorised');

    // Removing forgets the computer: used again, it starts over with a new code.
    assert.equal((await call('/api/devices/' + id, { cookie: sam.cookie, method: 'DELETE' })).status, 200);
    r = await check(copied); assert.equal(r.body.status, 'unlinked'); assert.notEqual(r.body.code, code);

    // Data is kept only as hashes, and survives a restart.
    const saved = fs.readFileSync(path.join(dir, 'data', 'devices.json'), 'utf8');
    assert.ok(!saved.includes(mac.secret) && !saved.includes(mac.machine), 'secrets and fingerprints are only stored as hashes');
    assert.equal((await call('/auth/logout', { cookie: sam.cookie, method: 'POST' })).status, 302);
    assert.equal((await call('/api/me', { cookie: sam.cookie })).status, 401);

    // Too many checks from one address are slowed down.
    let limited = false; for (let i = 0; i < 70 && !limited; i++) limited = (await check(pc)).status === 429;
    assert.ok(limited);
  } finally { child.kill(); authServer.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
