'use strict';
// evan.hngroup.org.uk: only the two allowed HN Group Auth sign-in accounts see the page; everyone else, impersonation
// and revoked sign-ins don't. Run: node --test evan-site/test.cjs
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');

test('private page: exact sign-in accounts only, no impersonation, rechecked every visit', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-evan-test-')), secret = path.join(dir, 'secret');
  fs.writeFileSync(secret, 'a'.repeat(64)); process.env.STATUS_SSO_SECRET_FILE = secret;
  const state = { user: { id: 'p1', accountId: 'a1', username: 'catnap@hngroup.org.uk', displayName: 'Catnap' }, enabled: true };
  const backend = http.createServer(async (req, res) => {
    let text = ''; for await (const c of req) text += c;
    const data = JSON.parse(text || '{}');
    assert.equal(data.client_id, 'evan');
    if (!state.enabled) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Disabled.' })); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ session: 'b'.repeat(64), expires: Date.now() + 86400000, user: state.user }));
  });
  await new Promise((r) => backend.listen(0, '127.0.0.1', r)); process.env.AUTH_BACKEND = 'http://127.0.0.1:' + backend.address().port;
  const reserve = http.createServer(); await new Promise((r) => reserve.listen(0, '127.0.0.1', r)); const port = reserve.address().port; await new Promise((r) => reserve.close(r));
  const base = 'http://127.0.0.1:' + port; process.env.EVAN_ORIGIN = base;
  const server = require('./server').createServer({ dir: path.join(dir, 'data') });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const login = async () => {
    const r = await fetch(base + '/auth/login', { redirect: 'manual' }), url = new URL(r.headers.get('location'));
    assert.equal(url.searchParams.get('client_id'), 'evan');
    const back = await fetch(base + '/auth/callback?code=' + 'c'.repeat(64) + '&state=' + url.searchParams.get('state'), { headers: { Cookie: r.headers.getSetCookie()[0].split(';')[0] }, redirect: 'manual' });
    return { status: back.status, cookie: (back.headers.getSetCookie().find((c) => c.startsWith('hn_evan_session=')) || '').split(';')[0] };
  };
  try {
    let r = await fetch(base + '/', { redirect: 'manual' }); assert.equal(r.status, 302, 'signed out goes to sign-in');
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
    assert.match(await (await fetch(base + '/robots.txt')).text(), /Disallow: \//);
    let { status, cookie } = await login(); assert.equal(status, 302);
    r = await fetch(base + '/', { headers: { Cookie: cookie } }); assert.equal(r.status, 200);
    let html = await r.text(); assert.match(html, /Fuck you,<br><span>Evan\.<\/span>/); assert.match(html, /Hi, Catnap/);
    state.user = { ...state.user, username: 'Charlie.Livsey@HNGroup.org.uk', displayName: 'Charlie' };
    assert.equal((await fetch(base + '/', { headers: { Cookie: cookie } })).status, 200, 'the second account');
    // Anyone else (the same person under another account included) is refused, even with a cookie from before.
    state.user = { ...state.user, username: 'evan@hngroup.org.uk', displayName: 'Evan' };
    r = await fetch(base + '/', { headers: { Cookie: cookie } }); assert.equal(r.status, 403); html = await r.text();
    assert.doesNotMatch(html, /Fuck/); assert.match(html, /This page is private/);
    assert.equal((await login()).status, 403);
    state.user = { ...state.user, username: 'catnap@hngroup.org.uk', impersonated: true };
    assert.equal((await fetch(base + '/', { headers: { Cookie: cookie } })).status, 403, 'not while impersonating');
    state.user.impersonated = false; state.enabled = false;
    assert.equal((await fetch(base + '/', { headers: { Cookie: cookie }, redirect: 'manual' })).status, 302, 'a revoked sign-in is signed out');
  } finally { server.closeAllConnections(); backend.closeAllConnections(); await new Promise((r) => server.close(r)); await new Promise((r) => backend.close(r)); fs.rmSync(dir, { recursive: true, force: true }); }
});
