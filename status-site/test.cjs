'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
test('protected management, real checks, incidents and persistent history', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-status-test-'));
  process.env.DATA_DIR = dir;
  const secretFile = path.join(dir, 'sso-secret');
  fs.writeFileSync(secretFile, 'a'.repeat(64));
  process.env.STATUS_SSO_SECRET_FILE = secretFile;
  const portal = await require('./test-portal.cjs').fixture();
  process.env.STAFF_PORTAL_BACKEND = portal.base;
  const { server, checkAll } = require('./server');
  let healthy = true;
  const target = http.createServer((req, res) => { res.writeHead(healthy ? 200 : 503); res.end(); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  await new Promise(r => target.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let statusCookie = '';
  async function signIn(user) {
    const start = await fetch(base + '/auth/login', { redirect: 'manual' });
    assert.equal(start.status, 302);
    const stateCookie = start.headers.getSetCookie()[0].split(';')[0];
    assert.match(stateCookie, /^__Host-hn_status_state=/);
    const authorize = new URL(start.headers.get('location'));
    assert.equal(authorize.origin, 'https://staff.hngroup.org.uk');
    const grant = await fetch(portal.base + authorize.pathname + authorize.search, { headers: { Cookie: 'hn_staff_session=' + user.raw }, redirect: 'manual' });
    const callback = new URL(grant.headers.get('location'));
    assert.equal(callback.origin, 'https://status.hngroup.org.uk');
    const result = await fetch(base + callback.pathname + callback.search, { headers: { Cookie: stateCookie }, redirect: 'manual' });
    return { result, callback, stateCookie };
  }
  const request = async (route, data, auth = true) => {
    const r = await fetch(base + route, { headers: { ...(auth ? { Cookie: statusCookie } : {}), Origin: 'https://status.hngroup.org.uk', 'Content-Type': 'application/json' }, ...(data ? { method: 'POST', body: JSON.stringify(data) } : {}) });
    return { code: r.status, data: await r.json() };
  };
  try {
    assert.equal((await request('/api/admin', null, false)).code, 401);
    const direct = await fetch(base + '/admin', { redirect: 'manual' });
    assert.equal(direct.headers.get('location'), '/auth/login');
    const legacy = await fetch(base + '/api/admin', { headers: { Authorization: 'Bearer legacy-admin-key' } });
    assert.equal(legacy.status, 401);
    for (const user of [portal.users.staff, portal.users.leadership, portal.users.builtin]) {
      const denied = await signIn(user);
      assert.equal(denied.result.headers.get('location'), '/admin/denied');
      assert.equal(denied.result.headers.getSetCookie().some(c => c.startsWith('__Host-hn_status_session=')), false);
    }
    const owner = await signIn(portal.users.owner);
    assert.equal(owner.result.headers.get('location'), '/admin');
    const sessionCookie = owner.result.headers.getSetCookie().find(c => c.startsWith('__Host-hn_status_session='));
    assert.match(sessionCookie, /HttpOnly; Secure; SameSite=Lax/);
    statusCookie = sessionCookie.split(';')[0];
    const replay = await fetch(base + owner.callback.pathname + owner.callback.search, { headers: { Cookie: owner.stateCookie }, redirect: 'manual' });
    assert.equal(replay.headers.get('location'), '/admin/denied?reason=expired');
    const forged = await fetch(base + owner.callback.pathname + owner.callback.search, { redirect: 'manual' });
    assert.equal(forged.status, 400);
    const csrf = await fetch(base + '/api/admin/delete-service', { method: 'POST', headers: { Cookie: statusCookie, Origin: 'https://staff.hngroup.org.uk', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(csrf.status, 403);
    let admin = (await request('/api/admin')).data;
    for (const s of admin.services) await request('/api/admin/delete-service', { id: s.id });
    assert.equal((await request('/api/admin/service', { name: 'Bad protocol', url: 'file:///etc/passwd', override: 'auto' })).code, 400);
    assert.equal((await request('/api/admin/service', { name: 'No URL', url: '', override: 'auto' })).code, 400);
    assert.equal((await request('/api/admin/service', { name: 'Test service', url: `http://127.0.0.1:${target.address().port}`, override: 'auto' })).code, 200);
    // A prior service edit may still be finishing its check batch.
    await new Promise(r => setTimeout(r, 30));
    await checkAll();
    // Wait for the first observation before asserting the public state.
    for (let n = 0; n < 100; n++) { if ((await request('/api/status', null, false)).data.services[0].lastChecked) break; await new Promise(r => setTimeout(r, 10)); }
    let status = (await request('/api/status', null, false)).data;
    assert.equal(status.services[0].status, 'operational');
    assert.equal(status.services[0].uptime, 100);
    assert.equal('url' in status.services[0], false);
    const id = status.services[0].id;
    healthy = false;
    await checkAll();
    status = (await request('/api/status', null, false)).data;
    assert.equal(status.services[0].status, 'outage');
    assert.ok(status.services[0].uptime < 100);
    const incident = { title: 'Connection issue', message: 'Investigating connections.', status: 'investigating', serviceIds: [id] };
    assert.equal((await request('/api/admin/incident', incident, false)).code, 401);
    assert.equal((await request('/api/admin/incident', incident)).code, 200);
    let incidentData = (await request('/api/status', null, false)).data.incidents[0];
    await request('/api/admin/incident', { ...incident, id: incidentData.id, status: 'resolved', message: 'Recovered.' });
    incidentData = (await request('/api/status', null, false)).data.incidents[0];
    assert.equal(incidentData.updates.length, 2);
    assert.equal(incidentData.status, 'resolved');
    admin = (await request('/api/admin')).data;
    await request('/api/admin/service', { ...admin.services[0], override: 'maintenance' });
    assert.equal((await request('/api/status', null, false)).data.services[0].status, 'maintenance');
    const stored = JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf8'));
    assert.equal(stored.services[0].override, 'maintenance');
    assert.equal(stored.incidents[0].updates.length, 2);
    assert.equal(fs.existsSync(path.join(dir, 'admin-token')), false);
    for (const route of ['/', '/admin', '/app.js', '/style.css']) {
      const r = await fetch(base + route, { headers: { Cookie: statusCookie } }); assert.equal(r.status, 200); assert.ok(r.headers.get('content-security-policy'));
    }
    for (const [route, type] of [
      ['/assets/favicon.svg', 'image/svg+xml'],
      ['/assets/brand/hn-group-wordmark.svg', 'image/svg+xml'],
      ['/assets/brand/hn-group-wordmark-white.svg', 'image/svg+xml'],
      ['/assets/fonts/plus-jakarta-sans.woff2', 'font/woff2']
    ]) {
      const r = await fetch(base + route);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('content-type'), type);
      const expected = fs.readFileSync(path.join(__dirname, 'public', route));
      assert.deepEqual(Buffer.from(await r.arrayBuffer()), expected);
    }
    for (const route of ['/', '/admin']) {
      const html = await (await fetch(base + route, { headers: { Cookie: statusCookie } })).text();
      assert.match(html, /rel="icon" href="\/assets\/favicon\.svg"/);
      assert.match(html, /hn-group-wordmark-white\.svg/);
    }
    assert.equal((await request('/assets/unlisted.svg', null, false)).code, 404);
    assert.equal((await request('/missing', null, false)).code, 404);
    const superLogin = await signIn(portal.users.super);
    statusCookie = superLogin.result.headers.getSetCookie().find(c => c.startsWith('__Host-hn_status_session=')).split(';')[0];
    assert.equal((await request('/api/admin')).code, 200);
    portal.users.super.person.roleIds = [];
    assert.equal((await request('/api/admin')).code, 403);
    assert.equal((await request('/api/admin')).code, 401);
    portal.users.super.person.roleIds = ['super'];
    const disabled = await signIn(portal.users.super);
    statusCookie = disabled.result.headers.getSetCookie().find(c => c.startsWith('__Host-hn_status_session=')).split(';')[0];
    portal.users.super.person.account.enabled = false;
    assert.equal((await request('/api/admin')).code, 403);
    portal.users.owner.data.impersonatorId = 'other';
    assert.equal((await signIn(portal.users.owner)).result.headers.get('location'), '/admin/denied');
    delete portal.users.owner.data.impersonatorId;
    const logoutLogin = await signIn(portal.users.owner);
    statusCookie = logoutLogin.result.headers.getSetCookie().find(c => c.startsWith('__Host-hn_status_session=')).split(';')[0];
    assert.equal((await request('/auth/logout', {})).code, 200);
    assert.equal((await request('/api/admin')).code, 401);
    const expiryLogin = await signIn(portal.users.owner);
    statusCookie = expiryLogin.result.headers.getSetCookie().find(c => c.startsWith('__Host-hn_status_session=')).split(';')[0];
    portal.users.owner.data.expires = Date.now() - 1;
    assert.equal((await request('/api/admin')).code, 401);
    const badExchange = await fetch(portal.base + '/api/status-sso/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: portal.users.owner.token }) });
    assert.equal(badExchange.status, 401);
    // Portal availability must fail closed for admin while public status stays available.
    portal.users.owner.data.expires = Date.now() + 3600000;
    const unavailableLogin = await signIn(portal.users.owner);
    statusCookie = unavailableLogin.result.headers.getSetCookie().find(c => c.startsWith('__Host-hn_status_session=')).split(';')[0];
    await new Promise(r => portal.server.close(r));
    assert.equal((await request('/api/admin')).code, 503);
    assert.equal((await request('/api/status', null, false)).code, 200);
    const { loginNext } = require('../staff-portal/lib/status-sso');
    assert.equal(loginNext('https://example.com/'), null);
    assert.equal(loginNext('//example.com/'), null);
    assert.equal(loginNext('/status-admin/authorize?state=' + 'a'.repeat(64)), '/status-admin/authorize?state=' + 'a'.repeat(64));
  } finally {
    await new Promise(r => setTimeout(r, 30));
    await new Promise(r => server.close(r));
    await new Promise(r => target.close(r));
    if (portal.server.listening) await new Promise(r => portal.server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
