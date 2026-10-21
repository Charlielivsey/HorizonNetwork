'use strict';
// HN Account tests: the real staff account service and the real HN Group Auth, with temporary data.
//   node --test accounts-site/test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { spawn } = require('node:child_process');

const freePort = async () => { const s = http.createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise((r) => s.close(r)); return p; };
const cookieOf = (res, name) => (res.headers.getSetCookie().find((c) => c.startsWith(name + '=')) || '').split(';')[0];
const waitFor = async (url) => { for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 50)); } throw new Error('did not start: ' + url); };

test('HN Account: Auth sign-in, own account, devices, staff admin and protections', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-accounts-site-'));
  const store = require('../staff-portal/lib/store'); store.init(dir);
  const make = (first, last, local, password, pin) => { const p = store.saveEmployee({ firstName: first, lastName: last, jobTitle: 'Analyst', company: 'HN Group', emails: [{ local, domain: 'hngroup.org.uk', primary: true }] }); store.issueTemporaryPassword(p); store.setPassword(p, password); store.setCode(p, pin); return p; };
  const admin = make('Ada', 'Admin', 'ada.admin', 'Ada-password-582!', '582947');
  const sam = make('Sam', 'Staff', 'sam.staff', 'Sam-password-582!', '493817');
  store.setRoleMembers(store.listRoles().find((r) => r.name === 'Super Admin'), [admin.id]);
  const secret = path.join(dir, 'secret'); fs.writeFileSync(secret, 'd'.repeat(64));

  const [authPort, staffPort, accPort] = [await freePort(), await freePort(), await freePort()];
  const authBase = 'http://127.0.0.1:' + authPort, staffBase = 'http://127.0.0.1:' + staffPort, ACC = 'http://127.0.0.1:' + accPort;
  const staff = spawn(process.execPath, ['staff-portal/server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(staffPort), DATA_DIR: dir, AUTH_BACKEND: authBase, STATUS_SSO_SECRET_FILE: secret }, stdio: ['ignore', 'ignore', 'inherit'] });
  process.env.STAFF_PORTAL_BACKEND = staffBase; process.env.STATUS_SSO_SECRET_FILE = secret;
  const { server: auth } = require('../auth-site/server'); await new Promise((r) => auth.listen(authPort, '127.0.0.1', r));
  const acc = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(accPort), ACCOUNTS_ORIGIN: ACC, AUTH_ORIGIN: authBase, AUTH_BACKEND: authBase, STAFF_BACKEND: staffBase, STATUS_SSO_SECRET_FILE: secret }, stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    await waitFor(staffBase + '/healthz'); await waitFor(ACC + '/healthz');
    const authPost = (route, data, cookie = '') => fetch(authBase + route, { method: 'POST', headers: { Origin: 'https://auth.hngroup.org.uk', 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(data) });
    // Signs in through HN Group Auth as the "accounts" application and returns HN Account's cookie.
    async function signIn(username, password, pin) {
      const start = await fetch(ACC + '/auth/login', { redirect: 'manual' });
      const to = new URL(start.headers.get('location')), state = to.searchParams.get('state'), stateCookie = start.headers.getSetCookie()[0].split(';')[0];
      assert.equal(to.origin + to.pathname, authBase + '/authorize'); assert.equal(to.searchParams.get('client_id'), 'accounts');
      const login = await authPost('/api/login', { username, password });
      const verified = await authPost('/api/login/code', { code: pin }, cookieOf(login, '__Host-hn_auth_flow'));
      const grant = await (await authPost('/api/continue', { client_id: 'accounts', state }, cookieOf(verified, '__Host-hn_auth_session'))).json();
      const back = new URL(grant.redirect);
      assert.equal(back.origin + back.pathname, 'https://accounts.hngroup.org.uk/auth/callback');
      const done = await fetch(ACC + back.pathname + back.search, { headers: { Cookie: stateCookie }, redirect: 'manual' });
      assert.equal(done.status, 302, 'signed in'); assert.equal(done.headers.get('location'), '/');
      return cookieOf(done, 'hn_account');
    }
    const client = (cookie) => {
      let csrf = '';
      const get = (p) => fetch(ACC + p, { headers: { Cookie: cookie } });
      const post = async (p, body, extra) => { if (!csrf) csrf = (await (await get('/api/session')).json()).csrf; return fetch(ACC + p, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: ACC, 'X-CSRF-Token': csrf, ...(extra || {}) }, body: JSON.stringify(body) }); };
      return { get, post };
    };

    // Signed out: the landing page; the API needs a sign-in.
    assert.match(await (await fetch(ACC + '/')).text(), /Sign in with HN Group Auth/);
    assert.equal((await fetch(ACC + '/api/me')).status, 401);

    // Sam signs in and manages their own account.
    const samCookie = await signIn('sam.staff@hngroup.org.uk', 'Sam-password-582!', '493817');
    const s = client(samCookie);
    assert.match(await (await s.get('/')).text(), /accounts\.js/, 'the account app');
    const session = await (await s.get('/api/session')).json();
    assert.equal(session.user.displayName, 'Sam Staff'); assert.equal(session.admin, false);
    assert.deepEqual(session.user.companies, ['HN Group'], 'Auth profiles list every company with a role');
    assert.equal((await (await s.get('/api/me')).json()).user.username, 'sam.staff@hngroup.org.uk');
    let r = await s.post('/api/me/profile', { displayName: 'Sammy', phone: '01234 567890', location: 'Leeds', timezone: 'Europe/London', skills: ['Excel'], languages: ['English'], bio: 'Hello' });
    assert.equal(r.status, 200); assert.equal((await r.json()).user.displayName, 'Sammy');
    const devices = (await (await s.get('/api/me/sessions')).json()).sessions;
    assert.ok(devices.some((d) => d.current), 'the HN Account session is listed as this session');
    // Protections: other websites, missing CSRF, requests outside the allowed list, staff admin.
    assert.equal((await s.post('/api/me/profile', { displayName: 'x' }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await fetch(ACC + '/api/me/profile', { method: 'POST', headers: { Cookie: samCookie, Origin: ACC, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await s.get('/api/payslips')).status, 404, 'only account requests are passed on');
    assert.equal((await s.get('/api/employees')).status, 403, 'staff admin is for owner and Super Admin members');
    // Changing the password keeps this session and checks the current one.
    assert.equal((await s.post('/api/me/password', { currentPassword: 'wrong', newPassword: 'Another-password-77!' })).status, 400);
    assert.equal((await s.post('/api/me/password', { currentPassword: 'Sam-password-582!', newPassword: 'Another-password-77!' })).status, 200);
    assert.equal((await s.get('/api/me')).status, 200);

    // Ada (Super Admin) manages staff accounts.
    const adaCookie = await signIn('ada.admin@hngroup.org.uk', 'Ada-password-582!', '582947'), a = client(adaCookie);
    assert.equal((await (await a.get('/api/session')).json()).admin, true);
    const list = (await (await a.get('/api/employees')).json()).employees;
    assert.ok(list.some((e) => e.id === sam.id && e.account.enabled));
    r = await a.post('/api/employees/' + sam.id + '/account/disable', {});
    assert.equal(r.status, 200); assert.equal((await r.json()).employee.account.enabled, false);
    // Sam is signed out of HN Account straight away.
    assert.equal((await s.get('/api/me')).status, 401);
    await a.post('/api/employees/' + sam.id + '/account/enable', {});
    r = await a.post('/api/employees/' + sam.id + '/account', {});
    const creds = await r.json();
    assert.ok(creds.temporaryPassword && creds.username === 'sam.staff@hngroup.org.uk', 'password reset shows temporary credentials');

    // Signing out ends HN Account's sign-in and its staff session.
    const csrf = (await (await a.get('/api/session')).json()).csrf;
    const before = (await (await a.get('/api/me/sessions')).json()).sessions.length;
    const out = await fetch(ACC + '/auth/logout', { method: 'POST', headers: { Cookie: adaCookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'csrf=' + csrf, redirect: 'manual' });
    assert.equal(out.status, 302); assert.equal(out.headers.get('location'), '/?signed-out=1');
    assert.equal((await a.get('/api/me')).status, 401);
    await new Promise((r) => setTimeout(r, 200));
    const ada2 = client(await signIn('ada.admin@hngroup.org.uk', 'Ada-password-582!', '582947'));
    assert.equal((await (await ada2.get('/api/me/sessions')).json()).sessions.length, before, 'the old staff session ended (only the new one replaces it)');
  } finally {
    const exited = (c) => (c.exitCode !== null ? Promise.resolve() : new Promise((r) => c.once('exit', r)));
    acc.kill(); staff.kill(); await Promise.all([exited(acc), exited(staff)]);
    auth.closeAllConnections(); await new Promise((r) => auth.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
