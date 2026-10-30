'use strict';
// Sign in with Google: turning it on (only for a Google account with your own email), signing in with it (no password
// or PIN, and the browser remembers the account for next time), no PIN offered while it's on, refusals, and turning it off. The real staff account
// service and Auth run here; only Google's token endpoint is a stand-in.
//   node --test auth-site/google.test.cjs
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto'), { spawn } = require('node:child_process');

test('Sign in with Google: optional, signs straight in, remembered', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-auth-google-'));
  const store = require('../staff-portal/lib/store'); store.init(dir);
  const person = store.saveEmployee({ firstName: 'Gee', lastName: 'User', company: store.COMPANIES[0], jobTitle: 'Team member', emails: [{ local: 'google.user', domain: 'hngroup.org.uk', primary: true }] });
  store.issueTemporaryPassword(person); store.setPassword(person, 'Cedar-river-9842!'); store.setCode(person, '582947');
  const secret = path.join(dir, 'secret'); fs.writeFileSync(secret, 'f'.repeat(64)); process.env.STATUS_SSO_SECRET_FILE = secret;
  const googleFile = path.join(dir, 'google-oauth.json'); process.env.GOOGLE_OAUTH_FILE = googleFile;
  const reserve = http.createServer(); await new Promise((r) => reserve.listen(0, '127.0.0.1', r)); const port = reserve.address().port; await new Promise((r) => reserve.close(r));
  const child = spawn(process.execPath, [path.resolve(__dirname, '../staff-portal/server.js')], { env: { ...process.env, PORT: String(port), DATA_DIR: dir }, stdio: 'ignore' });
  process.env.STAFF_PORTAL_BACKEND = 'http://127.0.0.1:' + port;
  // Google's token endpoint: answers for the next sign-in with whoever `google.next` says, checking PKCE.
  const realFetch = global.fetch, google = { next: null, challenges: new Map() };
  global.fetch = async (url, options = {}) => {
    if (String(url) !== 'https://oauth2.googleapis.com/token') return realFetch(url, options);
    const form = new URLSearchParams(options.body), sent = google.challenges.get(form.get('code'));
    assert.equal(form.get('client_id'), 'test-client.apps.googleusercontent.com'); assert.equal(form.get('client_secret'), 'test-secret-123');
    assert.equal(form.get('redirect_uri'), 'https://auth.hngroup.org.uk/google/callback');
    assert.equal(crypto.createHash('sha256').update(form.get('code_verifier')).digest('base64url'), sent.challenge, 'PKCE verifier matches');
    const now = Math.floor(Date.now() / 1000), claims = { iss: 'https://accounts.google.com', aud: 'test-client.apps.googleusercontent.com', iat: now, exp: now + 3600, nonce: sent.nonce, email_verified: true, ...google.next };
    const part = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
    return Response.json({ id_token: part({ alg: 'RS256' }) + '.' + part(claims) + '.sig', access_token: 'x' });
  };
  const { server } = require('./server'); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port, origin = 'https://auth.hngroup.org.uk';
  const cookie = (res, name) => res.headers.getSetCookie().find((c) => c.startsWith(name + '='))?.split(';')[0];
  const post = (route, data, jar = '') => fetch(base + route, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: jar }, body: JSON.stringify(data) });
  // A trip to "Google" and back: returns where Auth sends the browser and the result the page then collects.
  async function viaGoogle(start, jar, who) {
    assert.equal(start.status, 200); const { url } = await start.json(), u = new URL(url), binding = cookie(start, '__Host-hn_auth_google');
    assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth'); assert.equal(u.searchParams.get('code_challenge_method'), 'S256'); assert.equal(u.searchParams.get('scope'), 'openid email');
    const code = crypto.randomBytes(8).toString('hex'); google.challenges.set(code, { challenge: u.searchParams.get('code_challenge'), nonce: u.searchParams.get('nonce') }); google.next = who;
    const back = await fetch(base + '/google/callback?state=' + u.searchParams.get('state') + '&code=' + code, { headers: { Cookie: [jar, binding].filter(Boolean).join('; ') }, redirect: 'manual' });
    assert.equal(back.status, 302);
    const result = await post('/api/google/result', {}, cookie(back, '__Host-hn_auth_google_result'));
    return { location: back.headers.get('location'), result, value: await result.clone().json() };
  }
  const me = { sub: '108765432109876543210', email: 'google.user@hngroup.org.uk' };
  try {
    let ready = false; for (let i = 0; i < 100; i++) { try { if ((await realFetch(process.env.STAFF_PORTAL_BACKEND + '/healthz')).ok) { ready = true; break; } } catch {} await new Promise((r) => setTimeout(r, 50)); } assert.ok(ready);
    // Not set up: hidden.
    assert.deepEqual(await (await fetch(base + '/api/google')).json(), { enabled: false });
    assert.equal((await post('/api/google/start', { mode: 'login' })).status, 404);
    // The file Google Cloud Console downloads works as it is.
    fs.writeFileSync(googleFile, JSON.stringify({ web: { client_id: 'test-client.apps.googleusercontent.com', project_id: 'hn-group-auth', client_secret: 'test-secret-123', redirect_uris: ['https://auth.hngroup.org.uk/google/callback'] } }));
    assert.deepEqual(await (await fetch(base + '/api/google')).json(), { enabled: true });
    // Not turned on yet: Google sign-in is refused.
    let g = await viaGoogle(await post('/api/google/start', { mode: 'login', next: '/' }), '', me);
    assert.equal(g.location, '/?google=1'); assert.match(g.value.error, /isn’t connected to an HN Group staff account/);
    // Turning it on needs a signed-in person; only a Google account with their own email.
    assert.equal((await post('/api/google/start', { mode: 'link' })).status, 401);
    const login = await post('/api/login', { username: 'google.user@hngroup.org.uk', password: 'Cedar-river-9842!' });
    const signed = await post('/api/login/code', { code: '582947' }, cookie(login, '__Host-hn_auth_flow'));
    assert.ok(cookie(signed, '__Host-hn_auth_resume').length > '__Host-hn_auth_resume='.length, 'a password sign-in remembers the browser');
    const session = cookie(signed, '__Host-hn_auth_session');
    g = await viaGoogle(await post('/api/google/start', { mode: 'link', next: '/' }, session), session, { sub: '999', email: 'someone.else@gmail.com' });
    assert.match(g.value.error, /one of your own HN Group email addresses/);
    g = await viaGoogle(await post('/api/google/start', { mode: 'link', next: '/' }, session), session, me);
    assert.deepEqual(g.value, { linked: 'google.user@hngroup.org.uk' });
    assert.equal((await (await fetch(base + '/api/me', { headers: { Cookie: session } })).json()).user.google.email, 'google.user@hngroup.org.uk');
    // Once it's on, the PIN is never offered: the password step and the remembered "Welcome back" go to Continue with Google.
    const remember = cookie(signed, '__Host-hn_auth_resume');
    const pw = await post('/api/login', { username: 'google.user@hngroup.org.uk', password: 'Cedar-river-9842!' });
    assert.deepEqual(await pw.json(), { googleRequired: true, discord: false }); assert.equal(cookie(pw, '__Host-hn_auth_session'), undefined);
    assert.equal((await (await fetch(base + '/api/resume', { headers: { Cookie: remember } })).json()).google, true);
    const byPin = await post('/api/resume', { code: '582947' }, remember);
    assert.equal(byPin.status, 403); assert.match((await byPin.json()).error, /Continue with Google/);
    // Except when signing in to an app on the computer (HN Browser, App Manager), which is unlocked with the PIN later.
    const appLogin = await post('/api/login', { username: 'google.user@hngroup.org.uk', password: 'Cedar-river-9842!', pin: true });
    assert.deepEqual(await appLogin.json(), { codeRequired: true });
    assert.equal((await post('/api/login/code', { code: '582947', pin: true }, cookie(appLogin, '__Host-hn_auth_flow'))).status, 200);
    // Signing in with Google, back to the application it started from: straight in (no password, no PIN), and this browser
    // remembers the account, whose Welcome back offers Continue with Google (the user's request, 30 October 2026).
    const next = '/authorize?client_id=portal&state=' + 'a'.repeat(64);
    g = await viaGoogle(await post('/api/google/start', { mode: 'login', next }), '', me);
    assert.equal(g.location, next + '&google=1'); assert.equal(g.result.status, 200); assert.equal(g.value.user.email, 'google.user@hngroup.org.uk');
    const googleSession = cookie(g.result, '__Host-hn_auth_session'); assert.ok(googleSession, 'signed in');
    const googleRemembered = cookie(g.result, '__Host-hn_auth_resume');
    assert.ok(googleRemembered && googleRemembered.length > '__Host-hn_auth_resume='.length, 'a Google sign-in remembers the account');
    const welcome = await (await fetch(base + '/api/resume', { headers: { Cookie: googleRemembered } })).json();
    assert.deepEqual([welcome.available, welcome.google, welcome.username], [true, true, 'google.user@hngroup.org.uk']);
    assert.equal((await post('/api/resume', { code: '582947' }, googleRemembered)).status, 403, 'remembering never skips Google: no PIN resume');
    assert.equal((await post('/api/continue', { client_id: 'portal', state: 'a'.repeat(64) }, googleSession)).status, 200, 'and can continue to the application');
    // Whoever signs in last is the one remembered on this browser.
    const kept = await viaGoogle(await post('/api/google/start', { mode: 'login', next: '/' }), cookie(signed, '__Host-hn_auth_resume'), me);
    assert.equal(kept.result.status, 200); assert.ok(cookie(kept.result, '__Host-hn_auth_resume').length > '__Host-hn_auth_resume='.length, 'the Google account is now remembered');
    // Answers that don't check out are refused: an unverified email, someone else's id, a forged state.
    g = await viaGoogle(await post('/api/google/start', { mode: 'login', next: '/' }), '', { ...me, email_verified: false });
    assert.match(g.value.error, /isn’t verified/);
    g = await viaGoogle(await post('/api/google/start', { mode: 'login', next: 'https://evil.example/' }), '', { sub: '42', email: me.email });
    assert.equal(g.location, '/?google=1', 'only Auth’s own pages'); assert.match(g.value.error, /isn’t connected/);
    const forged = await fetch(base + '/google/callback?state=' + 'b'.repeat(64) + '&code=x', { redirect: 'manual' });
    assert.match((await (await post('/api/google/result', {}, cookie(forged, '__Host-hn_auth_google_result'))).json()).error, /expired/);
    // Turning it off: Google sign-in stops working.
    const off = await post('/api/google/unlink', {}, session); assert.equal(off.status, 200); assert.equal((await off.json()).user.google, null);
    g = await viaGoogle(await post('/api/google/start', { mode: 'login', next: '/' }), '', me);
    assert.match(g.value.error, /isn’t connected/);
    // And the PIN is back.
    assert.deepEqual(await (await post('/api/login', { username: 'google.user@hngroup.org.uk', password: 'Cedar-river-9842!' })).json(), { codeRequired: true });
    assert.equal((await (await fetch(base + '/api/resume', { headers: { Cookie: remember } })).json()).google, false);
  } finally {
    global.fetch = realFetch;
    await new Promise((r) => server.close(r)); if (child.exitCode === null) { child.kill(); await new Promise((r) => child.once('exit', r)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
