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

test('merged Auth account centre preserves sign-in, account options and permissions', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-accounts-site-'));
  const store = require('../staff-portal/lib/store'); store.init(dir);
  const make = (first, last, local, password, pin) => { const p = store.saveEmployee({ firstName: first, lastName: last, jobTitle: 'Analyst', company: 'HN Group', emails: [{ local, domain: 'hngroup.org.uk', primary: true }] }); store.issueTemporaryPassword(p); store.setPassword(p, password); store.setCode(p, pin); return p; };
  const admin = make('Ada', 'Admin', 'ada.admin', 'Ada-password-582!', '582947');
  const sam = make('Sam', 'Staff', 'sam.staff', 'Sam-password-582!', '493817');
  store.setRoleMembers(store.listRoles().find((r) => r.name === 'Super Admin'), [admin.id]);
  const secret = path.join(dir, 'secret'); fs.writeFileSync(secret, 'd'.repeat(64));

  const [authPort, staffPort, accPort] = [await freePort(), await freePort(), await freePort()];
  const authBase = 'http://127.0.0.1:' + authPort, staffBase = 'http://127.0.0.1:' + staffPort, ACC = authBase+'/account';
  const staff = spawn(process.execPath, ['staff-portal/server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(staffPort), DATA_DIR: dir, AUTH_BACKEND: authBase, STATUS_SSO_SECRET_FILE: secret }, stdio: ['ignore', 'ignore', 'inherit'] });
  process.env.STAFF_PORTAL_BACKEND = staffBase; process.env.STATUS_SSO_SECRET_FILE = secret;
  process.env.AUTH_ACCOUNT_CENTRE='1';process.env.ACCOUNT_WEB_BACKEND='http://127.0.0.1:'+accPort;
  process.env.DATA_DIR=path.join(dir,'auth'); fs.mkdirSync(process.env.DATA_DIR,{recursive:true});
  process.env.HN_DISCORD_PRESENCE='0';
  const { server: auth } = require('../auth-site/server'); await new Promise((r) => auth.listen(authPort, '127.0.0.1', r));
  const acc = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(accPort), ACCOUNTS_ORIGIN: authBase, ACCOUNTS_BASE_PATH:'/account', AUTH_ORIGIN: authBase, AUTH_BACKEND: authBase, STAFF_BACKEND: staffBase, STATUS_SSO_SECRET_FILE: secret }, stdio: ['ignore', 'ignore', 'inherit'] });
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
      assert.equal(back.origin + back.pathname, 'https://auth.hngroup.org.uk/account/auth/callback');
      const done = await fetch(authBase + back.pathname + back.search, { headers: { Cookie: stateCookie }, redirect: 'manual' });
      assert.equal(done.status, 302, 'signed in'); assert.equal(done.headers.get('location'), '/account/');
      return cookieOf(done, 'hn_account');
    }
    const client = (cookie) => {
      let csrf = '';
      const get = (p) => fetch(ACC + p, { headers: { Cookie: cookie } });
      const post = async (p, body, extra) => { if (!csrf) csrf = (await (await get('/api/session')).json()).csrf; return fetch(ACC + p, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: authBase, 'X-CSRF-Token': csrf, ...(extra || {}) }, body: JSON.stringify(body) }); };
      return { get, post };
    };

    const root=await fetch(authBase+'/',{redirect:'manual'});assert.equal(root.headers.get('location'),'/account/');const entry=await fetch(authBase+'/account/',{redirect:'manual'});assert.equal(entry.status,302);assert.equal(entry.headers.get('location'),'/account/auth/login');const loginEntry=await fetch(authBase+entry.headers.get('location'),{redirect:'manual'});assert.equal(loginEntry.status,302);assert.equal(new URL(loginEntry.headers.get('location')).pathname,'/authorize');
    // Signed out: go directly to Auth; the API still needs a sign-in.
    assert.match(await (await fetch(ACC + '/')).text(), /<title>Sign in · HN Group Auth<\/title>/);
    assert.equal((await fetch(ACC + '/api/me')).status, 401);

    // Sam signs in and manages their own account.
    const samCookie = await signIn('sam.staff@hngroup.org.uk', 'Sam-password-582!', '493817');
    const s = client(samCookie);
    assert.match(await (await s.get('/')).text(), /\/account\/assets\/accounts\.js/, 'mounted account assets');
    const session = await (await s.get('/api/session')).json();
    assert.equal(session.user.displayName, 'Sam Staff'); assert.equal(session.admin, false);
    assert.deepEqual(session.user.companies, ['HN Group'], 'Auth profiles list every company with a role');
    assert.equal((await (await s.get('/api/me')).json()).user.username, 'sam.staff@hngroup.org.uk');
    const{chromium}=require('../browser-app/node_modules/playwright');const browser=await chromium.launch({headless:true});try{const context=await browser.newContext();await context.addCookies([{name:'hn_account',value:samCookie.split('=')[1],url:authBase},{name:'hn_profile_arrival',value:'1',url:authBase}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(authBase+'/');await page.locator('#nav a[href="#profile"]').click();await page.locator('input[name=displayName]').waitFor();assert.equal(new URL(page.url()).pathname,'/account/');assert.deepEqual(errors,[]);assert.ok(await page.locator('img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)));}finally{await browser.close();}
    let r = await s.post('/api/me/profile', { displayName: 'Sammy', phone: '01234 567890', location: 'Leeds', timezone: 'Europe/London', skills: ['Excel'], languages: ['English'], bio: 'Hello' });
    assert.equal(r.status, 200); assert.equal((await r.json()).user.displayName, 'Sammy');
    const devices = (await (await s.get('/api/me/sessions')).json()).sessions;
    assert.ok(devices.some((d) => d.current), 'the HN Account session is listed as this session');
    // Protections: other websites, missing CSRF, requests outside the allowed list, staff admin.
    assert.equal((await s.post('/api/me/profile', { displayName: 'x' }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await fetch(ACC + '/api/me/profile', { method: 'POST', headers: { Cookie: samCookie, Origin: authBase, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await s.get('/api/payslips')).status, 404, 'only account requests are passed on');
    assert.equal((await s.get('/api/employees')).status, 410, 'administration remains in Staff Portal');
    // Changing the password keeps this session and checks the current one.
    assert.equal((await s.post('/api/me/password', { currentPassword: 'wrong', newPassword: 'Another-password-77!' })).status, 400);
    assert.equal((await s.post('/api/me/password', { currentPassword: 'Sam-password-582!', newPassword: 'Another-password-77!' })).status, 200);
    assert.equal((await s.get('/api/me')).status, 200);

    // Ada (Super Admin) manages staff accounts.
    const adaCookie = await signIn('ada.admin@hngroup.org.uk', 'Ada-password-582!', '582947'), a = client(adaCookie);
    assert.equal((await (await a.get('/api/session')).json()).admin, true);
    assert.equal((await a.get('/api/employees')).status,410,'Admin tools remain consolidated in Staff Portal');
    // Signing out ends HN Account's sign-in and its staff session.
    const csrf = (await (await a.get('/api/session')).json()).csrf;
    const before = (await (await a.get('/api/me/sessions')).json()).sessions.find(s=>s.current).id;
    const out = await fetch(ACC + '/auth/logout', { method: 'POST', headers: { Cookie: adaCookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'csrf=' + csrf, redirect: 'manual' });
    assert.equal(out.status, 302); assert.equal(out.headers.get('location'), '/account/?signed-out=1');
    assert.equal((await a.get('/api/me')).status, 401);
    await new Promise((r) => setTimeout(r, 200));
    const ada2 = client(await signIn('ada.admin@hngroup.org.uk', 'Ada-password-582!', '582947'));
    assert.ok(!(await (await ada2.get('/api/me/sessions')).json()).sessions.some(s=>s.id===before),'The signed-out account session is ended');
  } finally {
    const exited = (c) => (c.exitCode !== null ? Promise.resolve() : new Promise((r) => c.once('exit', r)));
    acc.kill(); staff.kill(); await Promise.all([exited(acc), exited(staff)]);
    auth.closeAllConnections(); await new Promise((r) => auth.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
