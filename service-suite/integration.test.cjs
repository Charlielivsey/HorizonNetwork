'use strict';
// End-to-end: real staff portal (private backend) + real HN Group Auth + service websites.
// Proves records are shared (single source of truth) and the bridge allowlist holds.
//   node --test service-suite/integration.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
async function freePort() { const s = http.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }
async function waitFor(url) { for (let n = 0; n < 200; n++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise(r => setTimeout(r, 50)); } throw new Error('Not ready: ' + url); }

test('service websites read and write the same records as the staff portal', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-service-integration-'));
  const store = require('../staff-portal/lib/store');
  store.init(dir);
  const owner = store.saveEmployee({ firstName: 'Charlie', lastName: 'Fixture', company: store.COMPANIES[0], jobTitle: 'System owner', emails: [{ local: 'charlie.livsey', domain: 'hngroup.org.uk', primary: true }] });
  store.issueTemporaryPassword(owner); store.setPassword(owner, 'Fixture-password-584!'); store.setCode(owner, '582947');
  const staff = store.saveEmployee({ firstName: 'Sam', lastName: 'Staff', company: store.COMPANIES[0], jobTitle: 'Engineer', supervisorId: owner.id, emails: [{ local: 'sam.staff', domain: 'hngroup.org.uk', primary: true }] });
  store.issueTemporaryPassword(staff); store.setPassword(staff, 'Fixture-password-937!'); store.setCode(staff, '482957');
  const settingsPath = path.join(dir, 'settings.json'), settings = JSON.parse(fs.readFileSync(settingsPath));
  settings.ownerEmail = 'charlie.livsey@hngroup.org.uk'; fs.writeFileSync(settingsPath, JSON.stringify(settings));
  const secret = path.join(dir, 'secret'); fs.writeFileSync(secret, 'c'.repeat(64));
  const options = path.join(dir, 'accounts.json'); fs.writeFileSync(options, JSON.stringify({ DATA_DIR: dir }));
  const privatePort = await freePort(), authPort = await freePort();
  let errors = '';
  const supervisor = spawn(process.execPath, [path.join(ROOT, 'auth-site/supervisor.js')], { env: { ...process.env, AUTH_ACCOUNTS_CONFIG: options, AUTH_STAFF_SERVER: path.join(ROOT, 'staff-portal/server.js'), AUTH_BROKER_SERVER: path.join(ROOT, 'auth-site/server.js'), AUTH_PRIVATE_PORT: String(privatePort), AUTH_PUBLIC_PORT: String(authPort), STATUS_SSO_SECRET_FILE: secret }, stdio: ['ignore', 'ignore', 'pipe'] });
  supervisor.stderr.on('data', c => { errors += c; });
  const children = [];
  try {
    await waitFor(`http://127.0.0.1:${privatePort}/healthz`); await waitFor(`http://127.0.0.1:${authPort}/healthz`);
    const authBase = 'http://127.0.0.1:' + authPort;
    const authPost = (route, data, cookie = '', headers = {}) => fetch(authBase + route, { method: 'POST', headers: { Origin: 'https://auth.hngroup.org.uk', 'Content-Type': 'application/json', Cookie: cookie, ...headers }, body: JSON.stringify(data) });
    async function authSignIn(username, password, code) {
      const login = await authPost('/api/login', { username, password });
      const flow = login.headers.getSetCookie()[0].split(';')[0];
      const verified = await authPost('/api/login/code', { code }, flow);
      assert.equal(verified.status, 200);
      return verified.headers.getSetCookie().find(c => c.startsWith('__Host-hn_auth_session=')).split(';')[0];
    }
    async function startSite(id) {
      const install = path.join(dir, 'opt-' + id);
      fs.mkdirSync(path.join(install, 'lib'), { recursive: true });
      fs.copyFileSync(path.join(__dirname, 'server.js'), path.join(install, 'server.js'));
      for (const f of fs.readdirSync(path.join(__dirname, 'lib'))) fs.copyFileSync(path.join(__dirname, 'lib', f), path.join(install, 'lib', f));
      fs.cpSync(path.join(__dirname, 'public'), path.join(install, 'public'), { recursive: true });
      fs.copyFileSync(path.join(ROOT, id + '-site/config.json'), path.join(install, 'config.json'));
      const port = await freePort();
      const child = spawn(process.execPath, [path.join(install, 'server.js')], { env: { ...process.env, PORT: String(port), DATA_DIR: path.join(dir, 'data-' + id), AUTH_BACKEND: authBase, STATUS_SSO_SECRET_FILE: secret }, stdio: ['ignore', 'ignore', 'pipe'] });
      child.stderr.on('data', c => { errors += c; });
      children.push(child);
      await waitFor(`http://127.0.0.1:${port}/healthz`);
      const origin = 'https://' + JSON.parse(fs.readFileSync(path.join(install, 'config.json'))).domain;
      return {
        // Signs a staff member into this website through real Auth (fixed registered callback).
        async as(authCookie) {
          const jar = {};
          const call = async (route, body) => { const res = await fetch(`http://127.0.0.1:${port}${route}`, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual', headers: { Cookie: Object.entries(jar).map(([k, v]) => k + '=' + v).join('; '), ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: origin }) }, body: body === undefined ? undefined : JSON.stringify(body) }); for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const i = pair.indexOf('='); jar[pair.slice(0, i)] = pair.slice(i + 1); } return res; };
          const start = await call('/auth/login');
          const state = new URL(start.headers.get('location')).searchParams.get('state');
          const grant = await authPost('/api/continue', { client_id: id, state }, authCookie);
          assert.equal(grant.status, 200, 'Auth grants ' + id);
          const callback = new URL((await grant.json()).redirect);
          assert.equal(callback.origin, origin, 'registered callback');
          const back = await call(callback.pathname + callback.search);
          assert.equal(back.headers.get('location'), '/admin');
          return async (route, body) => { const res = await call(route, body); return { status: res.status, value: await res.json().catch(() => ({})) }; };
        }
      };
    }
    const ownerAuth = await authSignIn('charlie.livsey@hngroup.org.uk', 'Fixture-password-584!', '582947');
    const staffAuth = await authSignIn('sam.staff@hngroup.org.uk', 'Fixture-password-937!', '482957');

    // Expenses: submit on the website, see it in the staff portal's own data, approve it as the supervisor.
    const expenses = await startSite('expenses');
    const sam = await expenses.as(staffAuth);
    assert.equal((await sam('/api/bridge/claims')).value.mine.length, 0);
    const submitted = await sam('/api/bridge/claims/form/claim', { values: { date: '2026-10-01', amount: '12.50', category: 'Travel', description: 'Train to client' } });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.value));
    const portalClaims = JSON.parse(fs.readFileSync(path.join(dir, 'expenses.json'))).claims;
    assert.equal(portalClaims.length, 1);
    assert.equal(portalClaims[0].description, 'Train to client');
    assert.equal(portalClaims[0].personId, staff.id, 'recorded as the signed-in person');
    const charlie = await expenses.as(ownerAuth);
    const pending = (await charlie('/api/bridge/claims')).value.toApprove;
    assert.equal(pending.length, 1);
    assert.equal((await charlie('/api/bridge/claims/action/approve/approve', { id: pending[0].id, values: { note: 'OK' } })).status, 200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'expenses.json'))).claims[0].status, 'approved');
    assert.equal((await sam('/api/bridge/claims')).value.mine[0].status, 'approved', 'the change is visible everywhere at once');
    // The portal's own permissions still apply: Sam cannot approve.
    assert.equal((await sam('/api/bridge/claims/action/approve/approve', { id: pending[0].id })).status, 400);

    // Learning: completing a course creates a staff-portal training record.
    const learn = await startSite('learn');
    const owner2 = await learn.as(ownerAuth);
    const course = (await owner2('/api/m/courses', { fields: { title: 'Fixture induction' }, published: true, visibility: 'staff' })).value.item;
    const sam2 = await learn.as(staffAuth);
    assert.equal((await sam2(`/api/m/courses/${course.id}/complete`, {})).value.portal, 'recorded');
    const records = JSON.parse(fs.readFileSync(path.join(dir, 'training.json'))).records;
    assert.ok(records.some(r => r.course === 'Fixture induction' && r.personId === staff.id));
    assert.ok((await sam2('/api/bridge/training')).value.mine.some(r => r.course === 'Fixture induction'));

    // Allowlists: a website without the bridge, or a route outside its list, is refused.
    const brand = await startSite('brand');
    const ownerBrand = await brand.as(ownerAuth);
    assert.equal((await ownerBrand('/api/site')).value.staff.admin, true);
    const exchange = async client => {
      const state = 'e'.repeat(64);
      const grant = await authPost('/api/continue', { client_id: client, state }, ownerAuth);
      const code = new URL((await grant.json()).redirect).searchParams.get('code');
      return (await (await authPost('/api/sso/exchange', { client_id: client, state, code }, '', { Authorization: 'Bearer ' + 'c'.repeat(64) })).json()).session;
    };
    const brandSession = await exchange('brand');
    assert.equal((await authPost('/api/sso/staff', { client_id: 'brand', session: brandSession, method: 'GET', path: '/api/expenses' }, '', { Authorization: 'Bearer ' + 'c'.repeat(64) })).status, 403);
    const expensesSession = await exchange('expenses');
    for (const p of ['/api/people', '/api/payroll', '/api/expenses/../people', '/api/invoices', 'http://evil.example/api/expenses']) {
      assert.equal((await authPost('/api/sso/staff', { client_id: 'expenses', session: expensesSession, method: 'GET', path: p }, '', { Authorization: 'Bearer ' + 'c'.repeat(64) })).status, 403, p);
    }
    assert.equal((await authPost('/api/sso/staff', { client_id: 'expenses', session: expensesSession, method: 'GET', path: '/api/expenses' })).status, 401, 'secret required');
    assert.equal((await authPost('/api/sso/staff', { client_id: 'learn', session: expensesSession, method: 'GET', path: '/api/training' }, '', { Authorization: 'Bearer ' + 'c'.repeat(64) })).status, 401, 'sessions are bound to their website');
    assert.ok(!/Error|TypeError/.test(errors), errors);
  } finally {
    for (const c of children) { c.kill(); await new Promise(r => c.once('exit', r)); }
    supervisor.kill(); await new Promise(r => supervisor.once('exit', r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
