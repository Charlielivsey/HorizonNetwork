'use strict';
// The private Company Register (lib/private.js): HN Group Auth sign-in for every page, Auth accounts as customers,
// owner-level and Super Admin accounts as administrators, nothing from the main register, and a loopback-only feed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const hex = () => crypto.randomBytes(32).toString('hex');

test('private register: Auth only, staff area for owner/Super Admin, separate data', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-private-register-'));
  const secret = hex(); fs.writeFileSync(path.join(dir, 'secret'), secret);
  const users = {
    staff: { id: 'p-sam', accountId: 'a-sam', email: 'sam@hngroup.org.uk', displayName: 'Sam', statusAdminAllowed: false },
    owner: { id: 'p-charlie', accountId: 'a-charlie', email: 'charlie@hngroup.org.uk', displayName: 'Charlie', statusAdminAllowed: true, ownerAccess: true },
    acting: { id: 'p-charlie', accountId: 'a-charlie', email: 'charlie@hngroup.org.uk', displayName: 'Charlie', statusAdminAllowed: true, ownerAccess: true, impersonated: true },
  };
  const codes = new Map(), sessions = new Map(); let calls = [];
  const auth = http.createServer((req, res) => { let b = ''; req.on('data', (c) => b += c); req.on('end', () => {
    const d = JSON.parse(b || '{}'), send = (s, v) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v)); };
    calls.push([req.url, d.client_id]);
    if (req.headers.authorization !== 'Bearer ' + secret) return send(401, {});
    if (req.url === '/api/sso/exchange') { const who = codes.get(d.code); if (!who) return send(401, { error: 'expired' }); const s = hex(); sessions.set(s, who); return send(200, { session: s, expires: Date.now() + 3600e3, user: users[who] }); }
    if (req.url === '/api/sso/session') { const who = sessions.get(d.session); return who ? send(200, { session: d.session, user: users[who] }) : send(401, {}); }
    send(404, {});
  }); });
  await new Promise((r) => auth.listen(0, '127.0.0.1', r));
  const port = await new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const SITE = 'http://127.0.0.1:' + port, AUTH = 'http://127.0.0.1:' + auth.address().port;
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(port), COMPANIES_DATA_DIR: dir + '/data', COMPANIES_ORIGIN: SITE,
    COMPANIES_PRIVATE: '1', COMPANIES_SEED: 'off', COMPANIES_GROUP_UPDATES: 'off', AUTH_ORIGIN: 'https://auth.example', AUTH_BACKEND: AUTH, STATUS_SSO_SECRET_FILE: path.join(dir, 'secret') }, stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(SITE + '/healthz')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
    const get = (p, cookie, extra) => fetch(SITE + p, { headers: { ...(cookie ? { cookie } : {}), ...(extra || {}) }, redirect: 'manual' });
    // Nothing without signing in.
    let r = await get('/');
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/auth/login?next=%2F');
    assert.equal((await get('/search?q=hn')).status, 302);
    assert.equal((await get('/assets/companies.css')).status, 200, 'the stylesheet is public');
    r = await get('/auth/login?next=/search');
    assert.match(r.headers.get('location'), /^https:\/\/auth\.example\/authorize\?client_id=private-companies&state=[a-f0-9]{64}$/);
    // The feed is for the private wiki over loopback only, never through nginx.
    r = await get('/api/public/companies'); assert.equal(r.status, 200); assert.deepEqual((await r.json()).companies, [], 'nothing from the main register');
    assert.equal((await get('/api/public/companies', '', { 'X-Real-IP': '203.0.113.9' })).status, 404);
    const signIn = async (who) => {
      const start = await get('/auth/login?next=/');
      const state = new URL(start.headers.get('location')).searchParams.get('state');
      const stateCookie = start.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
      const code = hex(); codes.set(code, who);
      const back = await get('/auth/callback?code=' + code + '&state=' + state, stateCookie);
      assert.equal(back.status, 302, 'signed in as ' + who);
      return back.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('hn_private_register='));
    };
    // Any HN Group account reads the register and has a customer account; the staff area is refused.
    const sam = await signIn('staff');
    r = await get('/', sam); assert.equal(r.status, 200); const home = await r.text();
    assert.match(home, /Private Company Register/); assert.doesNotMatch(home, /Staff sign in|Create an account/);
    assert.equal((await get('/account', sam)).status, 200);
    assert.equal((await get('/admin', sam)).status, 403);
    assert.equal((await get('/account/login', sam)).headers.get('location'), '/account');
    // Owner-level and Super Admin accounts are administrators, with no register password.
    const charlie = await signIn('owner');
    r = await get('/admin', charlie); assert.equal(r.status, 200); assert.match(await r.text(), /Administration|Companies/);
    assert.equal((await get('/admin/staff', charlie)).status, 200);
    // Not while logged in as someone else.
    const acting = await signIn('acting');
    assert.equal((await get('/admin', acting)).status, 403);
    // Sign-ins survive a restart; nobody else's data was copied in.
    const db = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'register.json'), 'utf8'));
    assert.deepEqual(db.companies, []); assert.equal(db.staff.length, 1, 'no default admin@hngroup.org.uk / admin account');
    assert.deepEqual(db.customers.map((c) => c.authAccount).sort(), ['a-charlie', 'a-sam']);
    assert.ok(calls.every(([, client]) => client === 'private-companies'));
    // Signing out.
    r = await fetch(SITE + '/auth/logout', { method: 'POST', headers: { cookie: sam, Origin: SITE }, redirect: 'manual' });
    assert.equal(r.headers.get('location'), '/signed-out');
    assert.equal((await get('/', sam)).status, 302);
  } finally { child.kill(); auth.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
