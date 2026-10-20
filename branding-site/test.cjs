'use strict';
// HN Group brand centre tests: staff-only access through a stand-in for HN Group Auth.
//   node --test branding-site/test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const freePort = () => new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

test('brand centre: staff only, sign-in, downloads and sign-out', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-branding-test-'));
  const secret = 'b'.repeat(64);
  fs.writeFileSync(path.join(dir, 'secret'), secret);
  const [sitePort, authPort] = [await freePort(), await freePort()];
  const SITE = 'http://127.0.0.1:' + sitePort, AUTH = 'http://127.0.0.1:' + authPort;

  // Stand-in for HN Group Auth.
  const codes = new Map(), sessions = new Map();
  const auth = http.createServer(async (req, res) => {
    const url = new URL(req.url, AUTH);
    if (url.pathname === '/authorize') {
      assert.equal(url.searchParams.get('client_id'), 'branding');
      const code = crypto.randomBytes(32).toString('hex');
      codes.set(code, { id: 'p1', displayName: 'Ella Brooks' });
      res.writeHead(302, { Location: SITE + '/auth/callback?code=' + code + '&state=' + url.searchParams.get('state') }); return res.end();
    }
    let body = ''; for await (const c of req) body += c;
    const data = JSON.parse(body || '{}');
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'Bearer ' + secret || data.client_id !== 'branding') { res.writeHead(401); return res.end('{"error":"no"}'); }
    if (url.pathname === '/api/sso/exchange') {
      const user = codes.get(data.code); codes.delete(data.code);
      if (!user) { res.writeHead(401); return res.end('{"error":"expired"}'); }
      const session = crypto.randomBytes(32).toString('hex'); sessions.set(session, user);
      return res.end(JSON.stringify({ session, user, expires: Date.now() + 3600000 }));
    }
    if (url.pathname === '/api/sso/session') {
      const user = sessions.get(data.session);
      if (!user) { res.writeHead(401); return res.end('{"error":"expired"}'); }
      return res.end(JSON.stringify({ session: data.session, user, expires: Date.now() + 3600000 }));
    }
    res.writeHead(404); res.end('{}');
  });
  await new Promise((r) => auth.listen(authPort, '127.0.0.1', r));
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(sitePort), HOST: '127.0.0.1', AUTH_ORIGIN: AUTH, AUTH_BACKEND: AUTH, BRANDING_ORIGIN: SITE, STATUS_SSO_SECRET_FILE: path.join(dir, 'secret') },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(SITE + '/healthz')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
    const get = (p, cookie) => fetch(SITE + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });

    // Nothing but the stylesheet, script, font, tab icon and header wordmark is public.
    let r = await get('/');
    assert.equal(r.status, 302);
    assert.match(r.headers.get('location'), /^\/auth\/login\?return=%2F$/);
    assert.equal((await get('/assets/brand/svg/horizon-network-wordmark.svg')).status, 401);
    assert.equal((await get('/assets/brand/png/hn-group-email-logo.png')).status, 401);
    assert.equal((await get('/assets/branding.css')).status, 200);
    assert.equal((await get('/assets/favicon.svg')).status, 200);
    assert.equal((await get('/assets/brand/svg/hn-group-wordmark.svg')).status, 200);
    assert.equal((await get('/assets/../server.js')).status, 302);

    // Sign in through Auth, keeping a deep link; an off-site return address is ignored.
    r = await get('/auth/login?return=' + encodeURIComponent('//evil.example/x'));
    let stateCookie = r.headers.get('set-cookie').split(';')[0];
    let authRedirect = await fetch(r.headers.get('location'), { redirect: 'manual' });
    r = await get(new URL(authRedirect.headers.get('location')).pathname + new URL(authRedirect.headers.get('location')).search, stateCookie);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/');

    r = await get('/auth/login?return=' + encodeURIComponent('/#colours'));
    stateCookie = r.headers.get('set-cookie').split(';')[0];
    authRedirect = await fetch(r.headers.get('location'), { redirect: 'manual' });
    const callback = new URL(authRedirect.headers.get('location'));
    // A callback without the matching state cookie is refused.
    assert.equal((await get(callback.pathname + callback.search)).status, 400);
    authRedirect = await fetch((await get('/auth/login')).headers.get('location'), { redirect: 'manual' });
    r = await get('/auth/login');
    stateCookie = r.headers.get('set-cookie').split(';')[0];
    authRedirect = await fetch(r.headers.get('location'), { redirect: 'manual' });
    const cb = new URL(authRedirect.headers.get('location'));
    r = await get(cb.pathname + cb.search, stateCookie);
    assert.equal(r.status, 302);
    const session = r.headers.get('set-cookie').split(', ').find((c) => c.startsWith('hn_branding_session=')).split(';')[0];

    r = await get('/', session);
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /Brand centre/);
    assert.match(html, /Ella Brooks/);
    for (const company of ['HN Group', 'Horizon Network', 'Horizon Media Group', 'Horizon Advertising', 'Horizon Development', 'HN Group Management']) assert.ok(html.includes('>' + company + '<'), company);
    assert.match(html, /#5514B4/);
    assert.doesNotMatch(html, /style="/, 'no inline styles (CSP)');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    // Every linked brand file exists.
    for (const href of new Set([...html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)].map((m) => m[1].split('?')[0]))) {
      const f = await get(href, session);
      assert.equal(f.status, 200, href);
      await f.arrayBuffer();
    }
    const logo = await get('/assets/brand/png/horizon-advertising-logo.png', session);
    assert.equal(logo.headers.get('content-type'), 'image/png');
    assert.equal(logo.headers.get('cache-control'), 'private, no-store');

    // Sign-out needs this site's token; afterwards the cookie no longer works.
    const csrf = html.match(/name="csrf" value="([a-f0-9]+)"/)[1];
    r = await fetch(SITE + '/auth/logout', { method: 'POST', redirect: 'manual', headers: { cookie: session, 'content-type': 'application/x-www-form-urlencoded' }, body: 'csrf=' + csrf });
    assert.equal(r.headers.get('location'), '/signed-out');
    assert.equal((await get('/', session)).status, 302);

    // Signing in again works after signing out.
    r = await get('/auth/login');
    stateCookie = r.headers.get('set-cookie').split(';')[0];
    authRedirect = await fetch(r.headers.get('location'), { redirect: 'manual' });
    const cb2 = new URL(authRedirect.headers.get('location'));
    r = await get(cb2.pathname + cb2.search, stateCookie);
    const session2 = r.headers.get('set-cookie').split(', ').find((c) => c.startsWith('hn_branding_session=')).split(';')[0];
    assert.equal((await get('/', session2)).status, 200);
  } finally {
    child.kill();
    auth.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
