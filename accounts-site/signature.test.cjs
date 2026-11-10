'use strict';
// Signature migration: real Auth/account/backend with temporary data and desktop/mobile Chromium.
//   node --test accounts-site/signature.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { spawn } = require('node:child_process');

const freePort = async () => { const s = http.createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise((r) => s.close(r)); return p; };
const cookieOf = (res, name) => (res.headers.getSetCookie().find((c) => c.startsWith(name + '=')) || '').split(';')[0];
const waitFor = async (url) => { for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 50)); } throw new Error('did not start: ' + url); };

test('Email signatures: real account permissions, old redirect, branded assets, desktop/mobile export and refresh', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-accounts-site-'));
  process.env.DATA_DIR = dir;
  const store = require('../staff-portal/lib/store'); store.init(dir);
  const make = (first, last, local, password, pin) => { const p = store.saveEmployee({ firstName: first, lastName: last, jobTitle: 'Analyst', company: 'HN Group', emails: [{ local, domain: 'hngroup.org.uk', primary: true }] }); store.issueTemporaryPassword(p); store.setPassword(p, password); store.setCode(p, pin); return p; };
  const admin = make('Ada', 'Admin', 'ada.admin', 'Ada-password-582!', '582947');
  const sam = make('Sam', 'Staff', 'sam.staff', 'Sam-password-582!', '493817');
  store.setRoleMembers(store.listRoles().find((r) => r.name === 'Super Admin'), [admin.id]);
  const nia = store.saveEmployee({ firstName: 'Nia', lastName: 'Legal', displayName: 'Nia Display', jobTitle: 'Designer', company: 'HN Group', emails: [{ local: 'nia', domain: 'hngroup.org.uk', primary: true }, { local: 'nia', domain: 'horizonadvertising.co.uk' }], otherRoles: [{ company: 'Horizon Advertising', jobTitle: 'Creative director' }] });
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

    assert.equal((await fetch(ACC + '/api/signature-people')).status, 401);
    const old = await fetch(staffBase + '/signature?source=bookmark', { redirect: 'manual' });
    assert.equal(old.status, 302);
    assert.equal(old.headers.get('location'), 'https://accounts.hngroup.org.uk/?source=bookmark#signature');
    const samCookie = await signIn('sam.staff@hngroup.org.uk', 'Sam-password-582!', '493817');
    const s = client(samCookie);
    assert.equal((await s.get('/api/signature-people')).status, 403);
    const adaCookie = await signIn('ada.admin@hngroup.org.uk', 'Ada-password-582!', '582947');
    const a = client(adaCookie);
    const people = await (await a.get('/api/signature-people')).json();
    assert.ok(people.people.some(p => p.firstName === 'Sam' && p.emails[0].address === 'sam.staff@hngroup.org.uk'));
    const app = await (await s.get('/')).text();
    assert.match(app, /signature.js\?v=/);
    for (const company of ['hn-group', 'horizon-network', 'horizon-advertising', 'horizon-development', 'horizon-media-group']) {
      const image = await fetch(ACC + '/assets/brand/png/' + company + '-email-logo.png');
      assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png');
    }
    const { chromium } = require('../browser-app/node_modules/playwright');
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ['--no-sandbox'] });
    try {
      const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
      await context.addCookies([{ name: 'hn_account', value: samCookie.split('=')[1], url: ACC }]);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(ACC + '/#signature');
      await page.waitForSelector('#sig-name');
      assert.equal(await page.inputValue('#sig-name'), 'Sam Staff');
      assert.equal(await page.inputValue('#sig-title'), 'Analyst');
      assert.equal(await page.locator('#sig-person').count(), 0);
      assert.equal(await page.locator('#sig-preview img').evaluate(img => img.complete && img.naturalWidth > 0), true);
      await page.fill('#sig-name', 'Sam <Test> & Team');
      await page.click('#sig-copy-code');
      const html = await page.evaluate(() => navigator.clipboard.readText());
      assert.match(html, /Sam &lt;Test&gt; &amp; Team/);
      assert.match(html, /assets\/brand\/png\/hn-group-email-logo.png/);
      await page.click('#sig-copy');
      await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Signature copied'));
      const types = await page.evaluate(async () => (await navigator.clipboard.read())[0].types);
      assert.ok(types.includes('text/html'));
      const download = page.waitForEvent('download'); await page.click('#sig-download');
      assert.match((await download).suggestedFilename(), /signature.png$/);
      await page.click('[data-help="outlook"]');
      assert.equal(await page.locator('[data-steps="gmail"]').isVisible(), false);
      assert.equal(await page.locator('[data-steps="outlook"]').isVisible(), true);
      await page.reload(); await page.waitForSelector('#sig-name');
      assert.equal(await page.inputValue('#sig-name'), 'Sam Staff', 'refresh keeps valid sign-in and live profile defaults');
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no mobile page overflow');
      await page.waitForTimeout(500);
      fs.mkdirSync(path.join(__dirname, '.test-results'), { recursive: true });
      await page.screenshot({ path: path.join(__dirname, '.test-results/signature-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: path.join(__dirname, '.test-results/signature-desktop.png'), fullPage: true });
      await context.addCookies([{ name: 'hn_account', value: adaCookie.split('=')[1], url: ACC }]);
      await page.reload(); await page.waitForSelector('#sig-person');
      await page.selectOption('#sig-person', { label: 'Sam Staff' });
      assert.equal(await page.inputValue('#sig-name'), 'Sam Staff');
      assert.equal(await page.inputValue('#sig-email'), 'sam.staff@hngroup.org.uk');
      await page.selectOption('#sig-person', nia.id);
      assert.equal(await page.inputValue('#sig-name'), 'Nia Legal', 'legal name instead of display name');
      await page.selectOption('#sig-role', '1');
      assert.equal(await page.inputValue('#sig-title'), 'Creative director');
      assert.equal(await page.inputValue('#sig-email'), 'nia@horizonadvertising.co.uk');
      assert.match(await page.locator('#sig-preview').innerText(), /Horizon Media Group/);
      assert.match(await page.locator('#sig-preview img').getAttribute('src'), /horizon-advertising-email-logo/);
      assert.deepEqual(errors, []);
      await context.close();
    } finally { await browser.close(); }
    await a.post('/api/employees/' + sam.id + '/account/disable', {});
    assert.equal((await s.get('/api/signature-people')).status, 401, 'disabled accounts cannot use the new API');
  } finally {
    const exited = (c) => (c.exitCode !== null ? Promise.resolve() : new Promise((r) => c.once('exit', r)));
    acc.kill(); staff.kill(); await Promise.all([exited(acc), exited(staff)]);
    auth.closeAllConnections(); await new Promise((r) => auth.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
