const { test } = require('node:test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const http = require('node:http'), { spawn } = require('node:child_process');
test('staff portal sign-in preserves the status return route without changing ordinary login', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-portal-sso-smoke-'));
  const reserve = http.createServer();
  await new Promise(r => reserve.listen(0, '127.0.0.1', r));
  const port = reserve.address().port;
  await new Promise(r => reserve.close(r));
  const child = spawn(process.execPath, ['staff-portal/server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port), DATA_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
  const base = `http://127.0.0.1:${port}`;
  try {
    let started = false;
    for (let n = 0; n < 100; n++) { try { if ((await fetch(base + '/healthz')).ok) { started = true; break; } } catch {} await new Promise(r => setTimeout(r, 50)); }
    assert.ok(started, output);
    const state = 'b'.repeat(64), next = '/status-admin/authorize?state=' + state;
    const authorize = await fetch(base + next, { redirect: 'manual' });
    assert.equal(authorize.headers.get('location'), '/login?next=' + encodeURIComponent(next));
    assert.equal((await fetch(base + authorize.headers.get('location'))).status, 200);
    const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin@hngroup.org.uk', password: 'admin' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().find(c => c.startsWith('hn_staff_session=')).split(';')[0];
    const denied = await fetch(base + next, { headers: { Cookie: cookie }, redirect: 'manual' });
    assert.equal(denied.headers.get('location'), 'https://status.hngroup.org.uk/auth/callback?error=access_denied&state=' + state);
    const switchLogin = await fetch(base + '/login?next=' + encodeURIComponent(next), { headers: { Cookie: cookie }, redirect: 'manual' });
    assert.equal(switchLogin.headers.get('location'), '/login?next=' + encodeURIComponent(next));
    const standardLogin = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin@hngroup.org.uk', password: 'admin' }) });
    const standardCookie = standardLogin.headers.getSetCookie().find(c => c.startsWith('hn_staff_session=')).split(';')[0];
    const invalidReturn = await fetch(base + '/login?next=' + encodeURIComponent('https://example.com'), { headers: { Cookie: standardCookie }, redirect: 'manual' });
    assert.equal(invalidReturn.headers.get('location'), '/login');
    const script = await (await fetch(base + '/assets/login.js')).text();
    assert.ok(script.includes('window.location.href = nextPage'));
    console.log('Actual staff portal: startup, normal login, SSO redirect, built-in admin denial, preserved return path and rejected external redirect all passed.');
  } finally { if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise(r => child.once('exit', r)); } fs.rmSync(dir, { recursive: true, force: true }); }
});
