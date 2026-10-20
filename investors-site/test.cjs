'use strict';
// HN Group Investors tests, with stand-ins for HN Group Auth and the Company Register's feed.
//   node --test investors-site/test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const freePort = () => new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

test('HN Group Investors: staff access, investors, holdings, values and news', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-investors-test-'));
  const secret = 'b'.repeat(64);
  fs.writeFileSync(path.join(dir, 'secret'), secret);
  const [sitePort, authPort, regPort] = [await freePort(), await freePort(), await freePort()];
  const SITE = 'http://127.0.0.1:' + sitePort, AUTH = 'http://127.0.0.1:' + authPort;

  let nextUser = null;
  const codes = new Map(), sessions = new Map();
  const auth = http.createServer(async (req, res) => {
    const url = new URL(req.url, AUTH);
    if (url.pathname === '/authorize') {
      assert.equal(url.searchParams.get('client_id'), 'investors');
      const code = crypto.randomBytes(32).toString('hex'); codes.set(code, { ...nextUser });
      res.writeHead(302, { Location: SITE + '/auth/callback?code=' + code + '&state=' + url.searchParams.get('state') }); return res.end();
    }
    let body = ''; for await (const c of req) body += c;
    const data = JSON.parse(body || '{}');
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'Bearer ' + secret || data.client_id !== 'investors') { res.writeHead(401); return res.end('{"error":"no"}'); }
    const user = url.pathname === '/api/sso/exchange' ? codes.get(data.code) : sessions.get(data.session);
    if (!user) { res.writeHead(401); return res.end('{"error":"expired"}'); }
    const session = data.session || crypto.randomBytes(32).toString('hex'); sessions.set(session, user);
    res.end(JSON.stringify({ session, expires: Date.now() + 3600000, user }));
  });
  const co = (slug, legalName, name, owners, extra) => ({ slug, legalName, name, number: '', status: 'Active', description: '', website: '', owners, ...extra });
  const parent = (name) => [{ name, kind: 'Parent company', share: '100', control: ['Ownership of shares – 75% or more'] }];
  const feed = { version: 'v1', companies: [
    co('hn-group', 'HN Group Limited', 'HN Group', [{ name: 'Charlie Livsey', kind: 'Individual', share: '100', classes: { A: '90', B: '', C: '10' }, classCIssuedBy: 'Charlie Livsey', votes: 100, votingControl: true, control: [] }], { number: '12345678', website: 'hngroup.org.uk', shareClasses: { classA: 90, classB: 0, classC: 10 } }),
    co('hn-group-investments', 'HN Group Investments Limited', 'HN Group Investments', parent('HN Group Limited')),
    co('horizon-network', 'Horizon Network Limited', 'Horizon Network', [{ name: 'HN Group Investments Limited', kind: 'Parent company', share: '75', control: [] }, { name: 'Jack Example', kind: 'Individual', share: '25', control: [] }]),
    co('horizon-media-group', 'Horizon Media Group Limited', 'Horizon Media Group', [{ name: 'HN Group Investments Limited', kind: 'Parent company', share: '', control: ['Ownership of shares – 75% or more'] }]),
  ] };
  const reg = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(feed)); });
  await Promise.all([new Promise((r) => auth.listen(authPort, '127.0.0.1', r)), new Promise((r) => reg.listen(regPort, '127.0.0.1', r))]);

  const env = { ...process.env, PORT: String(sitePort), INVESTORS_DATA_DIR: path.join(dir, 'data'), INVESTORS_ORIGIN: SITE, AUTH_ORIGIN: AUTH, AUTH_BACKEND: AUTH, STATUS_SSO_SECRET_FILE: path.join(dir, 'secret'), COMPANIES_FEED_URL: 'http://127.0.0.1:' + regPort + '/feed', COMPANIES_FEED_INTERVAL: '100' };
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(SITE + '/healthz')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
    function browser() {
      const jar = {};
      const go = async (url, opts) => {
        url = new URL(url, SITE).href;
        for (let hops = 0; hops < 8; hops++) {
          const headers = { ...(opts && opts.headers) }, mine = new URL(url).origin === SITE;
          if (mine && Object.keys(jar).length) headers.Cookie = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
          const r = await fetch(url, { ...opts, headers, redirect: 'manual' });
          for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, ...v] = kv.split('='); if (mine) { if (/Max-Age=0/.test(c)) delete jar[k]; else jar[k] = v.join('='); } }
          if (r.status >= 300 && r.status < 400) { url = new URL(r.headers.get('location'), url).href; opts = undefined; continue; }
          return { status: r.status, url, text: await r.text() };
        }
        throw new Error('too many redirects');
      };
      const form = (url, fields, extra) => { const body = new URLSearchParams(); for (const [k, v] of Object.entries(fields)) for (const x of [].concat(v)) body.append(k, x); return go(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: SITE, ...(extra || {}) }, body: body.toString() }); };
      return { go, form, jar };
    }
    const csrf = (html) => /name="csrf" value="([a-f0-9]+)"/.exec(html)[1];
    // The register arrives shortly after starting.
    for (let i = 0; i < 100 && !(await fetch(SITE + '/healthz')).ok; i++);
    await new Promise((r) => setTimeout(r, 400));

    // Public landing page with both ways in; private pages need a sign-in.
    const anon = browser();
    const home = await anon.go('/');
    assert.equal(home.status, 200); assert.ok(home.text.includes('Investor sign in') && home.text.includes('Staff sign in'));
    assert.ok((await anon.go('/holdings')).url.endsWith('/login'));

    // Only staff with a role at HN Group get in.
    nextUser = { id: 's1', displayName: 'Nina Network', email: 'nina@horizon-network.co.uk', company: 'Horizon Network', companies: ['Horizon Network'] };
    const outsider = browser();
    const denied = await outsider.go('/staff');
    assert.equal(denied.status, 403); assert.ok(denied.text.includes('HN Group'));
    nextUser = { id: 's2', displayName: 'Harry Group', email: 'harry@hngroup.org.uk', company: 'Horizon Network', companies: ['Horizon Network', 'HN Group'] };
    const staff = browser();
    let page = await staff.go('/staff');
    assert.equal(page.status, 200); assert.ok(page.text.includes('Investor relations') && page.text.includes('Harry Group'));
    nextUser = { id: 's3', displayName: 'Owner', email: 'admin@hngroup.org.uk', company: '', companies: [], ownerAccess: true };
    assert.equal((await browser().go('/staff')).status, 200, 'owner-level accounts');
    let token = csrf(page.text);

    // Valuations: HN Group £1,000,000 then £1,200,000; bad input refused.
    assert.equal((await staff.form('/staff/companies/hn-group/valuation', { csrf: token, amount: 'lots', asOf: '2026-01-01' })).status, 400);
    assert.equal((await staff.form('/staff/companies/hn-group/valuation', { csrf: token, amount: '100', asOf: '2999-01-01' })).status, 400);
    await staff.form('/staff/companies/hn-group/valuation', { csrf: token, amount: '1,000,000', asOf: '2026-01-31', note: 'Opening valuation' });
    page = await staff.form('/staff/companies/hn-group/valuation', { csrf: token, amount: '£1200000', asOf: '2026-09-30' });
    assert.ok(page.text.includes('Valuation recorded') && page.text.includes('£1,200,000'));
    assert.equal((await staff.form('/staff/companies/hn-group/valuation', { csrf: 'nope', amount: '5', asOf: '2026-01-01' })).status, 403, 'CSRF');
    assert.equal((await staff.form('/staff/companies/hn-group/valuation', { csrf: token, amount: '5', asOf: '2026-01-01' }, { Origin: 'https://evil.example' })).status, 403, 'other websites');

    // Adding an investor linked to their name on the register gives a one-time invitation link.
    page = await staff.go('/staff/investors/new');
    assert.ok(page.text.includes('value="Charlie Livsey"') && page.text.includes('value="HN Group Limited"'), 'register names to choose from');
    page = await staff.form('/staff/investors/new', { csrf: token, name: 'Charlie Livsey', email: 'Charlie@Example.com', holders: ['Charlie Livsey', ''] });
    const link = /value="(http[^"]+\/invite\/[a-f0-9]{64})"/.exec(page.text)[1];
    assert.equal((await staff.form('/staff/investors/new', { csrf: token, name: 'Again', email: 'charlie@example.com' })).status, 400, 'duplicate email');
    const investorId = /\/staff\/investors\/([a-f0-9]{24})\/preview/.exec(page.text)[1];

    // News: drafts stay with staff; published news reaches investors.
    await staff.form('/staff/news/new', { csrf: token, title: 'Draft only', body: 'Not yet.', status: 'draft' });
    await staff.form('/staff/news/new', { csrf: token, title: 'Half-year update', body: 'First paragraph.\n\nSecond <b>paragraph</b>.', company: 'hn-group', status: 'published' });

    // The investor accepts the invitation and sees their holdings and what they're worth.
    const inv = browser();
    const invite = await inv.go(link.replace(/^https?:\/\/[^/]+/, ''));
    assert.ok(invite.text.includes('Welcome, Charlie'));
    assert.equal((await inv.form(new URL(link).pathname, { password: 'short', confirm: 'short' })).status, 400);
    page = await inv.form(new URL(link).pathname, { password: 'a-long-password', confirm: 'a-long-password' });
    assert.ok(page.url.endsWith('/'), 'signed in after setting a password');
    assert.ok(page.text.includes('£1,200,000'), 'total value');
    assert.ok(page.text.includes('£200,000') && page.text.includes('+20.0%'), 'change since the previous valuation');
    assert.ok(page.text.includes('<h3>HN Group</h3>') && page.text.includes('100%'));
    assert.ok(page.text.includes('HN Group Investments') && page.text.includes('HN Group → HN Group Investments'), 'held through the companies');
    assert.ok(page.text.includes('75%'), 'effective interest in Horizon Network');
    assert.ok(page.text.includes('Not recorded'), 'a range on the register has no exact effective share');
    assert.ok(page.text.includes('Half-year update') && !page.text.includes('Draft only'));
    assert.ok(page.text.includes('<polyline'), 'value chart');
    // Share classes and voting power from the register.
    assert.ok(page.text.includes('Your voting power') && page.text.includes('<b>100%</b> of votes') && page.text.includes('Voting control'));
    assert.ok(page.text.includes('Class A 90%, Class C 10%') && page.text.includes('How share classes and voting power work'));
    assert.ok(page.text.includes('<td>Not split (counted as Class A)</td>') === false);
    assert.equal((await inv.go(link.replace(/^https?:\/\/[^/]+/, ''))).status, 410, 'invitations work once');
    const article = await inv.go(/href="(\/news\/[a-f0-9]{24})"/.exec(page.text)[1]);
    assert.ok(article.text.includes('Second &lt;b&gt;paragraph&lt;/b&gt;.'), 'news text is escaped');
    const holdingsPage = await inv.go('/holdings');
    assert.ok(holdingsPage.text.includes('Valuation history') && holdingsPage.text.includes('Opening valuation'));
    assert.ok(holdingsPage.text.includes('Class C issued by Charlie Livsey') && holdingsPage.text.includes('<th class="num">Votes</th>'));
    // Investors can't reach staff pages.
    const staffOnly = await fetch(SITE + '/staff', { redirect: 'manual', headers: { Cookie: Object.entries(inv.jar).map(([k, v]) => k + '=' + v).join('; ') } });
    assert.equal(staffOnly.status, 303); assert.ok(staffOnly.headers.get('location').startsWith('/auth/login'));

    // Signing in: wrong passwords, lockout and sign-out.
    const other = browser();
    assert.equal((await other.form('/login', { email: 'charlie@example.com', password: 'wrong-password' })).status, 400);
    for (let i = 0; i < 5; i++) await other.form('/login', { email: 'nobody@example.com', password: 'x' });
    assert.ok((await other.form('/login', { email: 'nobody@example.com', password: 'x' })).text.includes('Too many attempts'));
    assert.ok((await other.form('/login', { email: 'CHARLIE@example.com', password: 'a-long-password' })).text.includes('Hello, Charlie'));

    // Staff preview and disabling an account signs the investor out.
    assert.ok((await staff.go('/staff/investors/' + investorId + '/preview')).text.includes('previewing what Charlie Livsey sees'));
    await staff.form('/staff/investors/' + investorId + '/disable', { csrf: token });
    assert.ok((await inv.go('/holdings')).url.endsWith('/login'), 'disabled account is signed out');
    assert.ok((await other.form('/login', { email: 'charlie@example.com', password: 'a-long-password' })).text.includes('disabled'));
    await staff.form('/staff/investors/' + investorId + '/enable', { csrf: token });
    assert.ok((await staff.go('/staff/activity')).text.includes('investor.create'));
  } finally {
    child.kill();
    await new Promise((r) => child.once('exit', r));
    auth.close(); reg.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
