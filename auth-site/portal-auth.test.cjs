'use strict';
// Staff portal sign-in through HN Group Auth, with "Resume session" still on the portal.
// Uses temporary staff data only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { spawn } = require('node:child_process');

const freePort = async () => {
  const s = http.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r));
  const port = s.address().port; await new Promise(r => s.close(r)); return port;
};
const cookieOf = (res, name) => (res.headers.getSetCookie().find(c => c.startsWith(name + '=')) || '').split(';')[0];

test('portal sign-in goes through Auth and returns to the portal; resume session still works', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-portal-auth-test-'));
  const store = require('../staff-portal/lib/store'); store.init(dir);
  const person = store.saveEmployee({ firstName: 'Test', lastName: 'Staff', jobTitle: 'Analyst', company: store.COMPANIES[0], emails: [{ local: 'test.staff', domain: 'hngroup.org.uk', primary: true }] });
  store.issueTemporaryPassword(person); store.setPassword(person, 'Test-password-582!'); store.setCode(person, '582947');
  const secret = path.join(dir, 'secret'); fs.writeFileSync(secret, 'c'.repeat(64));
  process.env.STATUS_SSO_SECRET_FILE = secret;

  const authPort = await freePort(), portalPort = await freePort();
  const portalBase = `http://127.0.0.1:${portalPort}`, authBase = `http://127.0.0.1:${authPort}`;
  const child = spawn(process.execPath, ['staff-portal/server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(portalPort), DATA_DIR: dir, AUTH_BACKEND: authBase }, stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = ''; child.stderr.on('data', c => errors += c);
  process.env.STAFF_PORTAL_BACKEND = portalBase;
  const { server } = require('./server'); await new Promise(r => server.listen(authPort, '127.0.0.1', r));
  const authPost = (route, data, cookie = '') => fetch(authBase + route, { method: 'POST', headers: { Origin: 'https://auth.hngroup.org.uk', 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(data) });
  const portalGet = (route, cookie = '') => fetch(portalBase + route, { headers: { Cookie: cookie }, redirect: 'manual' });

  async function signInAtAuth(state) {
    assert.equal((await fetch(authBase + '/authorize?client_id=portal&state=' + state)).status, 200);
    const login = await authPost('/api/login', { username: 'test.staff@hngroup.org.uk', password: 'Test-password-582!' });
    assert.deepEqual(await login.json(), { codeRequired: true });
    const verified = await authPost('/api/login/code', { code: '582947' }, cookieOf(login, '__Host-hn_auth_flow'));
    assert.equal(verified.status, 200);
    const grant = await authPost('/api/continue', { client_id: 'portal', state }, cookieOf(verified, '__Host-hn_auth_session'));
    return new URL((await grant.json()).redirect);
  }

  try {
    let started = false;
    for (let n = 0; n < 100; n++) { try { if ((await fetch(portalBase + '/healthz')).ok) { started = true; break; } } catch {} await new Promise(r => setTimeout(r, 50)); }
    assert.ok(started, errors);

    // First visit on this browser: straight to Auth.
    assert.equal((await portalGet('/login')).headers.get('location'), '/auth/start');
    const start = await portalGet('/auth/start');
    const authorize = new URL(start.headers.get('location'));
    assert.equal(authorize.origin + authorize.pathname, 'https://auth.hngroup.org.uk/authorize');
    assert.equal(authorize.searchParams.get('client_id'), 'portal');
    const state = authorize.searchParams.get('state'), stateCookie = cookieOf(start, 'hn_staff_auth_state');
    assert.equal(stateCookie, 'hn_staff_auth_state=' + state);

    const callback = await signInAtAuth(state);
    assert.equal(callback.origin + callback.pathname, 'https://staff.hngroup.org.uk/auth/callback');
    const back = callback.pathname + callback.search;

    // A callback without this browser's state cookie is refused (and uses up the state).
    const forged = await portalGet(back);
    assert.equal(forged.headers.get('location'), '/login?auth_error=expired');

    // Start again and complete properly.
    const start2 = await portalGet('/auth/start');
    const state2 = new URL(start2.headers.get('location')).searchParams.get('state');
    const cb2 = await signInAtAuth(state2);
    const done = await portalGet(cb2.pathname + cb2.search, cookieOf(start2, 'hn_staff_auth_state'));
    assert.equal(done.status, 302);
    assert.equal(done.headers.get('location'), '/home');
    const session = cookieOf(done, 'hn_staff_session'), remembered = cookieOf(done, 'hn_staff_resume');
    assert.ok(session.length > 30 && remembered.length > 30);
    assert.equal((await portalGet('/home', session)).status, 200);

    // The code can't be used twice.
    const replay = await portalGet(cb2.pathname + cb2.search, cookieOf(start2, 'hn_staff_auth_state'));
    assert.equal(replay.headers.get('location'), '/login?auth_error=expired');

    // Auth's own server-side sign-in didn't leave a remembered browser behind: only the real one.
    const resumeTokens = Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'resume.json'))).tokens);
    assert.equal(resumeTokens.length, 1);

    // Resume session: the sign-in page is shown (not sent to Auth) and the code alone signs in.
    assert.equal((await portalGet('/login', remembered)).status, 200);
    const resumed = await fetch(portalBase + '/api/resume', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: remembered }, body: JSON.stringify({ code: '582947' }) });
    assert.equal(resumed.status, 200);
    assert.ok(cookieOf(resumed, 'hn_staff_session').length > 30);

    // An error page from Auth is shown rather than looping back to Auth.
    assert.equal((await portalGet('/login?auth_error=denied')).status, 200);
    assert.deepEqual(await (await fetch(portalBase + '/api/login/options')).json(), { auth: true });
  } finally {
    await new Promise(r => server.close(r));
    if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise(r => child.once('exit', r)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
