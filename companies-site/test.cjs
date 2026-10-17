'use strict';
// HN Group company register tests: public records, customer accounts, requests, filing
// submissions and staff review, using temporary data and a stand-in for HN Group Auth.
//   node --test companies-site/test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const freePort = () => new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page >> endobj\ntrailer << >>\n%%EOF\n');

test('company register: public records, customers, requests, submissions and staff review', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-companies-test-'));
  const secret = 'c'.repeat(64);
  fs.writeFileSync(path.join(dir, 'secret'), secret);
  const [sitePort, authPort] = [await freePort(), await freePort()];
  const SITE = 'http://127.0.0.1:' + sitePort, AUTH = 'http://127.0.0.1:' + authPort;

  // Stand-in for HN Group Auth: the next sign-in is for `nextUser`.
  let nextUser = { id: 's1', displayName: 'Owner Person', email: 'owner@hngroup.org.uk', statusAdminAllowed: true, ownerAccess: true };
  const codes = new Map(), sessions = new Map();
  const auth = http.createServer(async (req, res) => {
    const url = new URL(req.url, AUTH);
    if (url.pathname === '/authorize') {
      assert.equal(url.searchParams.get('client_id'), 'companies');
      const code = crypto.randomBytes(32).toString('hex'); codes.set(code, { ...nextUser });
      res.writeHead(302, { Location: SITE + '/auth/callback?code=' + code + '&state=' + url.searchParams.get('state') }); return res.end();
    }
    let body = ''; for await (const c of req) body += c;
    const data = JSON.parse(body || '{}');
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'Bearer ' + secret || data.client_id !== 'companies') { res.writeHead(401); return res.end('{"error":"no"}'); }
    if (url.pathname === '/api/sso/exchange') {
      const user = codes.get(data.code); codes.delete(data.code);
      if (!user) { res.writeHead(401); return res.end('{}'); }
      const session = crypto.randomBytes(32).toString('hex'); sessions.set(session, user);
      return res.end(JSON.stringify({ session, user, expires: Date.now() + 3600000 }));
    }
    const user = sessions.get(data.session);
    if (!user) { res.writeHead(401); return res.end('{}'); }
    return res.end(JSON.stringify({ session: data.session, user, expires: Date.now() + 3600000 }));
  });
  await new Promise((r) => auth.listen(authPort, '127.0.0.1', r));
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(sitePort), HOST: '127.0.0.1', AUTH_ORIGIN: AUTH, AUTH_BACKEND: AUTH, COMPANIES_ORIGIN: SITE, COMPANIES_DATA_DIR: path.join(dir, 'data'), STATUS_SSO_SECRET_FILE: path.join(dir, 'secret') },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const get = (p, cookie) => fetch(SITE + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
  const post = (p, fields, cookie, extra) => fetch(SITE + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}), ...(extra || {}) }, body: new URLSearchParams(fields).toString() });
  const upload = (p, fields, file, cookie) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); if (file) fd.append('document', new Blob([file], { type: 'application/pdf' }), 'doc.pdf'); return fetch(SITE + p, { method: 'POST', redirect: 'manual', headers: { cookie }, body: fd }); };
  const cookieOf = (r, name) => (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).map((c) => c.split(';')[0]).find((c) => c.startsWith(name + '='));
  const csrfIn = (html) => html.match(/name="csrf" value="([a-f0-9]+)"/)[1];
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(SITE + '/healthz')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }

    // Only HN Group and Horizon Network are on the register, with unknown details left blank.
    let html = await (await get('/')).text();
    assert.match(html, /HN Group Limited/); assert.match(html, /Horizon Network Limited/);
    assert.doesNotMatch(html, /Horizon Advertising Limited|Horizon Media Group Limited|Horizon Holding Co Limited/);
    html = await (await get('/company/horizon-network')).text();
    assert.match(html, /Company number not recorded/);
    assert.match(html, /href="\/company\/hn-group">HN Group Limited</);
    assert.match(html, /Horizon Development/);
    assert.match(await (await get('/company/horizon-network/persons-with-significant-control')).text(), /HN Group Limited[\s\S]*Ownership of shares – 75% or more/);
    assert.match(await (await get('/search?q=network')).text(), /1 result/);
    assert.equal((await get('/company/nope')).status, 404);
    assert.doesNotMatch(html, /style="/);

    // Customer actions need an account; anyone can create one.
    assert.equal((await get('/company/hn-group/request')).headers.get('location'), '/account/login?return=%2Fcompany%2Fhn-group%2Frequest');
    let r = await post('/account/register', { name: 'Sam Customer', email: 'sam@example.com', password: 'short', confirm: 'short' });
    assert.match(await r.text(), /at least 10 characters/);
    r = await post('/account/register', { name: 'Sam Customer', email: 'Sam@Example.com', password: 'correct horse battery', confirm: 'correct horse battery', return: '/company/hn-group/request' });
    assert.equal(r.status, 303); assert.equal(r.headers.get('location'), '/company/hn-group/request');
    const sam = cookieOf(r, 'hn_companies_customer');
    assert.match(await (await post('/account/register', { name: 'Dup', email: 'sam@example.com', password: 'correct horse battery', confirm: 'correct horse battery' })).text(), /already uses that email/);
    // Off-site return addresses are ignored.
    r = await post('/account/login', { email: 'sam@example.com', password: 'correct horse battery', return: '//evil.example' });
    assert.equal(r.headers.get('location'), '/account');
    assert.match(await (await post('/account/login', { email: 'sam@example.com', password: 'wrong password!' })).text(), /email address or password is wrong/);

    // Request a document; forged forms (wrong token or other site) are refused.
    html = await (await get('/company/hn-group/request', sam)).text();
    const samCsrf = csrfIn(html);
    assert.equal((await post('/company/hn-group/request', { csrf: 'x', kind: 'copy', message: 'Hi' }, sam)).status, 403);
    assert.equal((await post('/company/hn-group/request', { csrf: samCsrf, kind: 'copy', message: 'Hi' }, sam, { origin: 'https://evil.example' })).status, 403);
    r = await post('/company/hn-group/request', { csrf: samCsrf, kind: 'certificate', message: 'Please send a certificate.' }, sam);
    assert.equal(r.status, 303);
    const requestPath = r.headers.get('location');
    assert.match(await (await get(requestPath, sam)).text(), /Please send a certificate\./);
    r = await post('/company/hn-group/report', { csrf: samCsrf, message: 'The website is wrong.' }, sam);
    assert.equal(r.status, 303);

    // Another customer can't see Sam's request.
    r = await post('/account/register', { name: 'Alex Other', email: 'alex@example.com', password: 'another long password', confirm: 'another long password' });
    const alex = cookieOf(r, 'hn_companies_customer');
    assert.equal((await get(requestPath, alex)).status, 404);
    const alexAccount = await (await get('/account', alex)).text();
    assert.match(alexAccount, /Alex Other/); assert.doesNotMatch(alexAccount, /Change of|R[0-9A-F]{8}/);

    // Submit a filing: PDFs only.
    assert.match(await (await upload('/company/horizon-network/file', { csrf: samCsrf, category: 'Address', description: 'Change of address' }, Buffer.from('not a pdf'), sam)).text(), /Upload a PDF file/);
    html = await (await upload('/company/horizon-network/file', { csrf: samCsrf, category: 'Address', description: 'Change of registered office address', note: 'New office' }, PDF, sam)).text();
    assert.match(html, /has been sent for review/);
    assert.doesNotMatch(await (await get('/company/horizon-network/filing-history')).text(), /Change of registered office address/);

    // Customers never get into administration; staff sign in through Auth.
    r = await get('/admin', sam);
    assert.equal(r.status, 303); assert.match(r.headers.get('location'), /^\/auth\/login\?return=%2Fadmin/);
    const staffLogin = async (user) => {
      nextUser = user;
      let s = await get('/auth/login?return=%2Fadmin');
      const state = cookieOf(s, 'hn_companies_staff_state');
      const a = await fetch(s.headers.get('location'), { redirect: 'manual' });
      const cb = new URL(a.headers.get('location'));
      s = await get(cb.pathname + cb.search, state);
      return cookieOf(s, 'hn_companies_staff');
    };
    const nonAdmin = await staffLogin({ id: 's2', displayName: 'Regular Staff', email: 'staff@hngroup.org.uk', statusAdminAllowed: false });
    assert.equal((await get('/admin', nonAdmin)).status, 403);
    const owner = await staffLogin({ id: 's1', displayName: 'Owner Person', email: 'owner@hngroup.org.uk', statusAdminAllowed: true, ownerAccess: true });
    html = await (await get('/admin', owner)).text();
    assert.match(html, /<strong>1<\/strong><span>filings to review/);
    const staffCsrf = csrfIn(html);

    // Accept the submission: it becomes a public filing with its PDF.
    html = await (await get('/admin/submissions', owner)).text();
    const subId = html.match(/\/admin\/submissions\/([a-f0-9]{24})/)[1];
    assert.equal((await get('/admin/submission-file/' + subId, owner)).headers.get('content-type'), 'application/pdf');
    await post('/admin/submissions/' + subId, { csrf: staffCsrf, decision: 'accept', note: 'Thanks' }, owner);
    html = await (await get('/company/horizon-network/filing-history')).text();
    assert.match(html, /Change of registered office address/);
    const docId = html.match(/\/document\/([a-f0-9]{24})/)[1];
    const doc = await get('/document/' + docId);
    assert.equal(doc.headers.get('content-type'), 'application/pdf');
    assert.match(doc.headers.get('content-security-policy'), /sandbox/);
    assert.deepEqual(Buffer.from(await doc.arrayBuffer()), PDF);
    const samAccount = await (await get('/account', sam)).text();
    assert.match(samAccount, />Accepted</); assert.match(samAccount, /Note from HN Group: Thanks/);

    // Staff reply to the request; Sam sees it.
    const reqId = requestPath.split('/').pop();
    await post('/admin/requests/' + reqId, { csrf: staffCsrf, text: 'Certificate attached to your account.', status: 'Answered' }, owner);
    const thread = await (await get(requestPath, sam)).text();
    assert.match(thread, /Certificate attached to your account\./); assert.match(thread, />Answered</);

    // Staff edit a company, add an officer and a filing, and can hide a company.
    await post('/admin/company/hn-group', { csrf: staffCsrf, legalName: 'HN Group Limited', name: 'HN Group', number: '12345678', status: 'Active', registeredOffice: '1 Example Street\nTown' }, owner);
    await post('/admin/company/hn-group/officers', { csrf: staffCsrf, name: 'Jamie Director', role: 'Director', appointed: '2026-01-02' }, owner);
    await upload('/admin/company/hn-group/filings', { csrf: staffCsrf, date: '2026-02-03', category: 'Accounts', description: 'Annual accounts' }, PDF, owner);
    html = await (await get('/company/hn-group')).text();
    assert.match(html, /Company number 12345678/); assert.match(html, /1 Example Street<br>Town/); assert.match(html, /Annual accounts/);
    assert.match(await (await get('/search?q=jamie')).text(), /Director of HN Group Limited/);
    assert.match(await (await get('/search?q=12345678')).text(), /HN Group Limited/);
    await post('/admin/company/horizon-network', { csrf: staffCsrf, legalName: 'Horizon Network Limited', parent: 'hn-group', hidden: 'on' }, owner);
    assert.equal((await get('/company/horizon-network')).status, 404);
    assert.equal((await get('/company/horizon-network', owner)).status, 200);
    assert.equal((await get('/document/' + docId)).status, 404);

    // Disabling a customer signs them out.
    html = await (await get('/admin/customers', owner)).text();
    const samId = html.match(/Sam Customer[\s\S]*?\/admin\/customers\/([a-f0-9]{24})/)[1];
    await post('/admin/customers/' + samId, { csrf: staffCsrf, disabled: '1' }, owner);
    assert.equal((await get('/account', sam)).status, 303);

    // Data survives a restart.
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'register.json'), 'utf8'));
    assert.equal(saved.customers.length, 2);
    assert.ok(saved.customers.every((c) => c.hash && c.salt && !('password' in c)));
  } finally {
    child.kill();
    auth.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
