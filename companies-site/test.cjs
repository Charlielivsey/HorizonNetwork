'use strict';
// Company Register tests: public records, customer accounts, requests, filing submissions,
// staff accounts and review, and generated filings, using temporary data.
//   node --test companies-site/test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const freePort = () => new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page >> endobj\ntrailer << >>\n%%EOF\n');

test('company register: public records, customers, requests, submissions and staff review', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-companies-test-'));
  const sitePort = await freePort();
  const SITE = 'http://127.0.0.1:' + sitePort;
  const startServer = () => spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(sitePort), HOST: '127.0.0.1', COMPANIES_ORIGIN: SITE, COMPANIES_DATA_DIR: path.join(dir, 'data'), COMPANIES_GROUP_UPDATES: 'off' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  let child = startServer();
  const waitUp = async () => { for (let i = 0; i < 50; i++) { try { if ((await fetch(SITE + '/healthz')).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); } };
  const get = (p, cookie) => fetch(SITE + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
  const post = (p, fields, cookie, extra) => fetch(SITE + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}), ...(extra || {}) }, body: new URLSearchParams(fields).toString() });
  const follow = async (r, cookie) => (r.status === 303 ? fetch(SITE + r.headers.get('location'), { headers: { cookie } }) : r);
  // Uploads follow the redirect back to the account page that a successful submission sends the browser to.
  const upload = async (p, fields, file, cookie) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); if (file) fd.append('document', new Blob([file], { type: 'application/pdf' }), 'doc.pdf'); const r = await fetch(SITE + p, { method: 'POST', redirect: 'manual', headers: { cookie }, body: fd }); return r.status === 303 && r.headers.get('location').startsWith('/account?sent=') ? fetch(SITE + r.headers.get('location'), { headers: { cookie } }) : r; };
  const cookieOf = (r, name) => (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).map((c) => c.split(';')[0]).find((c) => c.startsWith(name + '='));
  const csrfIn = (html) => html.match(/name="csrf" value="([a-f0-9]+)"/)[1];
  try {
    await waitUp();

    // The home page is a search page with the HN Group logo but not the HN Group website theme, and no company list.
    let html = await (await get('/')).text();
    assert.match(html, /hn-group-wordmark-white\.svg/); assert.match(html, /Staff sign in/);
    assert.doesNotMatch(html, /Plus Jakarta|site\.css|Horizon Network Limited|Holding Co|Assets Management|Group Management/);
    assert.match(html, /run by HN Group Limited for the companies in HN Group/);
    assert.equal((await get('/assets/brand/hn-group-wordmark.svg')).status, 200);
    // Only HN Group and Horizon Network are on the register, with unknown details left blank.
    html = await (await get('/search?q=limited')).text();
    assert.match(html, /HN Group Limited/); assert.match(html, /Horizon Network Limited/);
    assert.match(html, /2 results for “limited”/);
    html = await (await get('/company/horizon-network')).text();
    assert.match(html, /Company number <strong>not recorded<\/strong>/);
    assert.match(html, /href="\/company\/hn-group">HN Group Limited</);
    assert.match(html, /Horizon Development/);
    assert.match(await (await get('/company/horizon-network/persons-with-significant-control')).text(), /HN Group Limited[\s\S]*Ownership of shares – 75% or more/);
    const pscHtml = await (await get('/company/horizon-network/persons-with-significant-control')).text();
    assert.match(pscHtml, /<dd>Parent company<\/dd>/); assert.match(pscHtml, /<dd>100%<\/dd>/); assert.match(pscHtml, /<dd><a href="\/company\/hn-group">HN Group Limited<\/a><\/dd>/);
    assert.match(await (await get('/search?q=network')).text(), /1 result/);
    assert.equal((await get('/company/nope')).status, 404);
    assert.doesNotMatch(html, /style="/);
    // The public feed the HN Group Wiki follows: current facts only, with a version for If-None-Match.
    let feedRes = await get('/api/public/companies');
    assert.equal(feedRes.headers.get('content-type'), 'application/json; charset=utf-8');
    const feed = await feedRes.json();
    assert.match(feed.version, /^[a-f0-9]{16}$/);
    const feedNet = feed.companies.find((c) => c.slug === 'horizon-network');
    assert.equal(feedNet.parent, 'hn-group'); assert.deepEqual(feedNet.divisions, ['Horizon Development']);
    assert.deepEqual(feedNet.owners.map((o) => [o.name, o.kind, o.share]), [['HN Group Limited', 'Parent company', '100']]);
    assert.equal(feedRes.headers.get('etag'), '"' + feed.version + '"');
    assert.equal((await fetch(SITE + '/api/public/companies', { headers: { 'If-None-Match': '"' + feed.version + '"' } })).status, 304);

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

    // Only people who manage a company can file changes; anyone else asks to manage it first.
    assert.match(await (await get('/company/horizon-network/file', sam)).text(), /You don’t manage this company/);
    assert.equal((await upload('/company/horizon-network/file', { csrf: samCsrf, category: 'Address', description: 'Change of address' }, PDF, sam)).status, 403);
    html = await (await get('/company/horizon-network', sam)).text();
    assert.match(html, /\/company\/horizon-network\/claim/); assert.doesNotMatch(html, /File for this company|Register a subsidiary/);
    assert.match(await (await upload('/company/horizon-network/claim', { csrf: samCsrf, note: '' }, null, sam)).text(), /Tell us why you should manage this company/);
    assert.match(await (await upload('/company/horizon-network/claim', { csrf: samCsrf, note: 'I am a director of the company.' }, null, sam)).text(), /request S[0-9A-F]{8} to manage Horizon Network Limited has been sent for review/);
    assert.match(await (await upload('/company/horizon-network/claim', { csrf: samCsrf, note: 'Again.' }, null, sam)).text(), /already asked to manage this company/);

    // Customers never get into administration. Staff use the register's own accounts, starting
    // with admin@hngroup.org.uk / admin, which must be changed at first sign-in.
    r = await get('/admin', sam);
    assert.equal(r.status, 303); assert.equal(r.headers.get('location'), '/staff/login?return=%2Fadmin');
    assert.match(await (await post('/staff/login', { email: 'admin@hngroup.org.uk', password: 'wrong' })).text(), /email address or password is wrong/);
    assert.match(await (await post('/staff/login', { email: 'sam@example.com', password: 'correct horse battery' })).text(), /email address or password is wrong/);
    r = await post('/staff/login', { email: 'Admin@HNGroup.org.uk', password: 'admin', return: '/admin' });
    assert.equal(r.headers.get('location'), '/admin/password');
    const owner = cookieOf(r, 'hn_companies_staff');
    assert.equal((await get('/admin', owner)).headers.get('location'), '/admin/password');
    html = await (await get('/admin/password', owner)).text();
    let staffCsrf = csrfIn(html);
    assert.match(await (await post('/admin/password', { csrf: staffCsrf, current: 'admin', password: 'admin', confirm: 'admin' }, owner)).text(), /at least 10 characters/);
    assert.match(await (await post('/admin/password', { csrf: staffCsrf, current: 'admin', password: 'a much better password', confirm: 'a much better password' }, owner)).text(), /Your password has been changed/);
    html = await (await get('/admin', owner)).text();
    assert.match(html, /<strong>1<\/strong><span>filings to review/);
    staffCsrf = csrfIn(html);

    // Administrators add and remove staff; staff can't manage staff accounts.
    assert.match(await (await post('/admin/staff', { csrf: staffCsrf, name: 'Robin Staff', email: 'robin@example.com', password: 'temporary password 1', role: 'staff' }, owner)).text(), /Robin Staff has been added/);
    assert.match(await (await post('/admin/staff', { csrf: staffCsrf, name: 'Dup', email: 'robin@example.com', password: 'temporary password 1', role: 'staff' }, owner)).text(), /already uses that email/);
    r = await post('/staff/login', { email: 'robin@example.com', password: 'temporary password 1' });
    const robin = cookieOf(r, 'hn_companies_staff');
    assert.equal(r.headers.get('location'), '/admin/password');
    const robinCsrf = csrfIn(await (await get('/admin/password', robin)).text());
    await post('/admin/password', { csrf: robinCsrf, current: 'temporary password 1', password: 'robin own password', confirm: 'robin own password' }, robin);
    assert.equal((await get('/admin', robin)).status, 200);
    assert.equal((await get('/admin/staff', robin)).status, 403);
    html = await (await get('/admin/staff', owner)).text();
    const robinId = html.match(/\/admin\/staff\/([a-f0-9]{24})\/remove/)[1];
    const ownerId = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'register.json'), 'utf8')).staff.find((x) => x.email === 'admin@hngroup.org.uk').id;
    assert.match(await (await post('/admin/staff/' + ownerId + '/remove', { csrf: staffCsrf }, owner)).text(), /can’t remove your own account/);
    assert.match(await (await post('/admin/staff/' + robinId + '/remove', { csrf: staffCsrf }, owner)).text(), /Staff account removed/);
    assert.equal((await get('/admin', robin)).status, 303);

    // Staff approve Sam's request to manage the company; Sam can then file changes for it.
    html = await (await get('/admin/submissions', owner)).text();
    assert.match(html, /Request to manage a company/); assert.match(html, /I am a director of the company\./);
    const claimId = html.match(/\/admin\/submissions\/([a-f0-9]{24})/)[1];
    assert.match(await (await post('/admin/submissions/' + claimId, { csrf: staffCsrf, decision: 'accept' }, owner)).text(), /approved\. They now manage the company/);
    html = await (await get('/company/horizon-network', sam)).text();
    assert.match(html, /File for this company/); assert.match(html, /Register a subsidiary/);
    assert.match(await (await get('/account', sam)).text(), /Your companies[\s\S]*Horizon Network Limited/);
    assert.match(await (await get('/admin/customers', owner)).text(), /sam@example\.com<\/td><td><a href="\/admin\/company\/horizon-network">/);

    // Submit a filing: PDFs only.
    assert.match(await (await upload('/company/horizon-network/file', { csrf: samCsrf, category: 'Address', description: 'Change of address' }, Buffer.from('not a pdf'), sam)).text(), /Upload a PDF file/);
    html = await (await upload('/company/horizon-network/file', { csrf: samCsrf, category: 'Address', description: 'Change of registered office address', note: 'New office' }, PDF, sam)).text();
    assert.match(html, /has been sent for review/);
    assert.doesNotMatch(await (await get('/company/horizon-network/filing-history')).text(), /Change of registered office address/);

    // Sending the same filing twice (a double click or a refresh) only records it once, and a
    // successful submission sends the browser to the account page so refreshing can't resend it.
    r = await fetch(SITE + '/company/horizon-network/file', { method: 'POST', redirect: 'manual', headers: { cookie: sam, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf: samCsrf, kind: 'sic', sic: '62020 - Consultancy' }).toString() });
    assert.equal(r.status, 303); assert.match(r.headers.get('location'), /^\/account\?sent=S[0-9A-F]{8}$/);
    const r2 = await fetch(SITE + '/company/horizon-network/file', { method: 'POST', redirect: 'manual', headers: { cookie: sam, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf: samCsrf, kind: 'sic', sic: '62020 - Consultancy' }).toString() });
    assert.equal(r2.headers.get('location'), r.headers.get('location'));
    assert.match(await (await get(r.headers.get('location'), sam)).text(), /Your filing S[0-9A-F]{8} has been sent for review/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'data', 'register.json'), 'utf8')).submissions.filter((x) => x.kind === 'sic' && x.status === 'Pending').length, 1);
    html = await (await get('/admin/submissions', owner)).text();
    await post('/admin/submissions/' + html.match(/Change of nature of business[\s\S]*?\/admin\/submissions\/([a-f0-9]{24})"/)?.[1], { csrf: staffCsrf, decision: 'reject' }, owner);

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
    await post('/admin/company/hn-group/psc', { csrf: staffCsrf, name: 'Jamie Director', kind: 'Individual', share: '50.5', control: 'Ownership of shares – more than 50% but less than 75%' }, owner);
    assert.match(await (await post('/admin/company/hn-group/psc', { csrf: staffCsrf, name: 'Too Much', kind: 'Individual', share: '150' }, owner)).text(), /between 0 and 100/);
    const hnPsc = await (await get('/company/hn-group/persons-with-significant-control')).text();
    assert.match(hnPsc, /Jamie Director[\s\S]*<dd>Individual<\/dd>[\s\S]*<dd>50.5%<\/dd>/); assert.doesNotMatch(hnPsc, /Too Much/);
    await upload('/admin/company/hn-group/filings', { csrf: staffCsrf, date: '2026-02-03', category: 'Accounts', description: 'Annual accounts' }, PDF, owner);
    html = await (await get('/company/hn-group')).text();
    assert.match(html, /Company number <strong>12345678<\/strong>/); assert.match(html, /1 Example Street<br>Town/); assert.match(html, /Annual accounts/);
    assert.match(await (await get('/search?q=jamie')).text(), /Director of HN Group Limited/);

    // Appointing a director and recording incorporation file their documents automatically, once.
    await post('/admin/company/hn-group', { csrf: staffCsrf, legalName: 'HN Group Limited', name: 'HN Group', number: '12345678', status: 'Active', incorporated: '2026-01-01', registeredOffice: '1 Example Street\nTown' }, owner);
    await post('/admin/company/hn-group', { csrf: staffCsrf, legalName: 'HN Group Limited', name: 'HN Group', number: '12345678', status: 'Active', incorporated: '2026-01-01', registeredOffice: '1 Example Street\nTown' }, owner);
    html = await (await get('/company/hn-group/filing-history')).text();
    assert.equal((html.match(/Incorporation of HN Group Limited/g) || []).length, 1);
    assert.equal((html.match(/Appointment of Jamie Director as a director on 2 January 2026/g) || []).length, 1);
    const genId = html.match(/Incorporation of HN Group Limited<\/td><td class="nowrap"><a href="\/document\/([a-f0-9]{24})/)[1];
    const gen = Buffer.from(await (await get('/document/' + genId)).arrayBuffer()).toString('latin1');
    assert.match(gen, /^%PDF-1\.4/); assert.match(gen, /\(HN Group Limited\)/); assert.match(gen, /%%EOF\n$/);

    // A notified person with significant control is filed automatically too.
    await post('/admin/company/hn-group/psc', { csrf: staffCsrf, name: 'Sky Holder', kind: 'Individual', share: '25', notified: '2026-03-04', control: 'Ownership of shares – more than 25% but not more than 50%' }, owner);
    assert.match(await (await get('/company/hn-group/filing-history')).text(), /Notification of Sky Holder as a person with significant control on 4 March 2026/);

    // A new company needs its first officer and person with significant control.
    html = await (await get('/admin/companies/new', owner)).text();
    assert.match(html, /First officer/); assert.match(html, /name="officer_name"/); assert.match(html, /name="psc_share"/);
    html = await (await post('/admin/companies/new', { csrf: staffCsrf, legalName: 'Example Trading Limited', incorporated: '2026-05-06', officer_name: '', psc_name: 'Someone' }, owner)).text();
    assert.match(html, /Enter the officer’s name/); assert.match(html, /value="Example Trading Limited"/);
    assert.equal((await get('/company/example-trading-limited')).status, 404);
    r = await post('/admin/companies/new', { csrf: staffCsrf, legalName: 'Example Trading Limited', parent: 'hn-group', incorporated: '2026-05-06', officer_name: 'Pat Founder', officer_role: 'Director', psc_name: 'HN Group Limited', psc_kind: 'Parent company', psc_share: '100', psc_control: 'Ownership of shares – 75% or more' }, owner);
    assert.equal(r.status, 303); assert.equal(r.headers.get('location'), '/admin/company/example-trading-limited');
    html = await (await get('/company/example-trading-limited/filing-history')).text();
    assert.match(html, /Incorporation of Example Trading Limited/);
    assert.match(html, /Appointment of Pat Founder as a director on 6 May 2026/);
    assert.match(html, /Notification of HN Group Limited as a person with significant control on 6 May 2026/);

    // Related companies: parent, subsidiaries, significant control and shared officers.
    html = await (await get('/company/example-trading-limited/related-companies')).text();
    assert.match(html, /HN Group Limited[\s\S]*Parent company[\s\S]*Has significant control over this company/);
    assert.match(html, /Horizon Network Limited[\s\S]*Fellow subsidiary of the same parent/);
    html = await (await get('/company/hn-group/related-companies')).text();
    assert.match(html, /Example Trading Limited[\s\S]*Subsidiary[\s\S]*This company has significant control over it/);
    assert.match(await (await get('/search?q=12345678')).text(), /HN Group Limited/);
    await post('/admin/company/horizon-network', { csrf: staffCsrf, legalName: 'Horizon Network Limited', parent: 'hn-group', hidden: 'on' }, owner);
    assert.equal((await get('/company/horizon-network')).status, 404);
    assert.equal((await get('/company/horizon-network', owner)).status, 200);
    assert.ok(!(await (await get('/api/public/companies')).json()).companies.some((c) => c.slug === 'horizon-network'), 'hidden companies are left out of the feed');
    assert.equal((await get('/document/' + docId)).status, 404);

    // Staff can make a customer a manager directly.
    assert.match(await (await post('/admin/company/hn-group/managers', { csrf: staffCsrf, email: 'nobody@example.com' }, owner)).text(), /no customer account with that email/);
    assert.match(await (await post('/admin/company/hn-group/managers', { csrf: staffCsrf, email: 'SAM@example.com' }, owner)).text(), /Manager added/);

    // Customers file changes; accepting them updates the record and files them.
    html = await (await get('/company/hn-group/file', sam)).text();
    assert.match(html, /What do you want to file\?/); assert.match(html, /\?type=address/); assert.match(html, /\?type=terminate/);
    assert.match(await (await get('/company/hn-group/file?type=address', sam)).text(), /New registered office address/);
    assert.match(await (await upload('/company/hn-group/file', { csrf: samCsrf, kind: 'appoint', name: 'Casey New', role: 'Secretary' }, null, sam)).text(), /Enter the date of appointment/);
    await upload('/company/hn-group/file', { csrf: samCsrf, kind: 'address', registeredOffice: '2 New Road\nCity' }, null, sam);
    await upload('/company/hn-group/file', { csrf: samCsrf, kind: 'appoint', name: 'Casey New', role: 'Secretary', appointed: '2026-07-01' }, null, sam);
    const jamieId = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'register.json'), 'utf8')).companies.find((x) => x.slug === 'hn-group').officers.find((o) => o.name === 'Jamie Director').id;
    await upload('/company/hn-group/file', { csrf: samCsrf, kind: 'terminate', officer: jamieId, resigned: '2026-07-02' }, null, sam);
    await upload('/company/hn-group/file', { csrf: samCsrf, kind: 'confirmation', madeUpTo: '2026-07-03' }, PDF, sam);
    html = await (await get('/admin/submissions', owner)).text();
    assert.match(html, /Change of registered office address to 2 New Road, City/);
    assert.match(html, /Appointment of Casey New as a secretary on 1 July 2026/);
    assert.match(html, /<dd>Secretary<\/dd>/);
    for (const sid of [...html.matchAll(/\/admin\/submissions\/([a-f0-9]{24})"/g)].map((x) => x[1])) await post('/admin/submissions/' + sid, { csrf: staffCsrf, decision: 'accept' }, owner);
    html = await (await get('/company/hn-group')).text();
    assert.match(html, /2 New Road<br>City/);
    assert.match(html, /<dt>Last statement dated<\/dt><dd>3 July 2026/);
    html = await (await get('/company/hn-group/officers')).text();
    assert.match(html, /Casey New[\s\S]*Secretary/); assert.match(html, /Jamie Director <span class="status warn">Resigned<\/span>/);
    html = await (await get('/company/hn-group/filing-history')).text();
    assert.match(html, /Change of registered office address to 2 New Road, City/);
    assert.equal((html.match(/Appointment of Casey New as a secretary on 1 July 2026/g) || []).length, 1);
    assert.match(html, /Termination of appointment of Jamie Director as a director on 2 July 2026/);
    assert.match(html, /Confirmation statement made up to 3 July 2026/);
    // Notifying and changing persons with significant control (their "Type" field must not clash with the change type).
    html = await (await upload('/company/hn-group/file', { csrf: samCsrf, kind: 'psc_add', psc_name: 'Morgan Holder', psc_kind: 'Individual', psc_share: '10', psc_notified: '2026-07-04', psc_control: 'Right to appoint and remove directors' }, null, sam)).text();
    assert.match(html, /Notification of Morgan Holder as a person with significant control on 4 July 2026/); assert.doesNotMatch(html, /Attach the filing as a PDF/);
    assert.match(await (await upload('/company/hn-group/file', { csrf: samCsrf, kind: 'psc_add', psc_name: 'No Date', psc_kind: 'Individual', psc_control: 'One\nTwo' }, null, sam)).text(), /Enter the date they became a person with significant control/);
    html = await (await get('/company/hn-group/file?type=psc_change', sam)).text();
    assert.match(html, /Whose details have changed\?/);
    const skyId = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'register.json'), 'utf8')).companies.find((x) => x.slug === 'hn-group').psc.find((p) => p.name === 'Sky Holder').id;
    html = await (await get('/company/hn-group/file?type=psc_change&psc=' + skyId, sam)).text();
    assert.match(html, /name="psc_share" type="number" value="25"/);
    assert.match(html, /data-vote-preview data-others="\[\[50.5,0,0\]/, 'voting power preview with the other holdings'); assert.match(html, /% of votes<\/p>|% of votes/);
    assert.match(await (await upload('/company/hn-group/file', { csrf: samCsrf, kind: 'psc_change', psc: skyId, psc_name: 'Sky Holder', psc_kind: 'Individual', psc_share: '25', psc_control: 'Ownership of shares – more than 25% but not more than 50%', changed: '2026-07-05' }, null, sam)).text(), /Nothing has changed/);
    await upload('/company/hn-group/file', { csrf: samCsrf, kind: 'psc_change', psc: skyId, psc_name: 'Sky Holder', psc_kind: 'Individual', psc_share: '39.5', psc_control: 'Ownership of shares – more than 50% but less than 75%', changed: '2026-07-05' }, null, sam);
    html = await (await get('/admin/submissions', owner)).text();
    assert.match(html, /Change of details of Sky Holder as a person with significant control on 5 July 2026/); assert.match(html, /New details<\/dt><dd>Sky Holder · Individual · 39.5%/);
    for (const sid of [...html.matchAll(/\/admin\/submissions\/([a-f0-9]{24})"/g)].map((x) => x[1])) await post('/admin/submissions/' + sid, { csrf: staffCsrf, decision: 'accept' }, owner);
    html = await (await get('/company/hn-group/persons-with-significant-control')).text();
    assert.match(html, /Morgan Holder[\s\S]*<dd>10%<\/dd>/); assert.match(html, /Sky Holder[\s\S]*<dd>39.5%<\/dd>[\s\S]*more than 50% but less than 75%/);
    assert.match(await (await get('/company/hn-group/filing-history')).text(), /Change of details of Sky Holder as a person with significant control on 5 July 2026/);

    // A change that no longer fits the record can't be accepted.
    const caseyId = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'register.json'), 'utf8')).companies.find((x) => x.slug === 'hn-group').officers.find((o) => o.name === 'Casey New').id;
    await upload('/company/hn-group/file', { csrf: samCsrf, kind: 'terminate', officer: caseyId, resigned: '2026-08-01' }, null, sam);
    await upload('/company/hn-group/file', { csrf: samCsrf, kind: 'terminate', officer: caseyId, resigned: '2026-08-02' }, null, sam);
    html = await (await get('/admin/submissions', owner)).text();
    const pendingIds = [...html.matchAll(/\/admin\/submissions\/([a-f0-9]{24})"/g)].map((x) => x[1]);
    assert.equal(pendingIds.length, 2);
    await post('/admin/submissions/' + pendingIds[0], { csrf: staffCsrf, decision: 'accept' }, owner);
    assert.match(await (await post('/admin/submissions/' + pendingIds[1], { csrf: staffCsrf, decision: 'accept' }, owner)).text(), /no longer current/);

    // Changing the company status files a change of status automatically, once per change.
    await post('/admin/company/hn-group', { csrf: staffCsrf, legalName: 'HN Group Limited', name: 'HN Group', number: '12345678', status: 'Dormant', incorporated: '2026-01-01', registeredOffice: '2 New Road\nCity' }, owner);
    await post('/admin/company/hn-group', { csrf: staffCsrf, legalName: 'HN Group Limited', name: 'HN Group', number: '12345678', status: 'Dormant', incorporated: '2026-01-01', registeredOffice: '2 New Road\nCity' }, owner);
    html = await (await get('/company/hn-group/filing-history')).text();
    assert.equal((html.match(/Change of company status from Active to Dormant/g) || []).length, 1);
    const stsId = html.match(/Change of company status from Active to Dormant<\/td><td class="nowrap"><a href="\/document\/([a-f0-9]{24})/)[1];
    const sts = Buffer.from(await (await get('/document/' + stsId)).arrayBuffer()).toString('latin1');
    assert.match(sts, /\(REG-STS\)/); assert.match(sts, /\(Dormant\)/);
    await post('/admin/company/hn-group', { csrf: staffCsrf, legalName: 'HN Group Limited', name: 'HN Group', number: '12345678', status: 'Active', incorporated: '2026-01-01', registeredOffice: '2 New Road\nCity' }, owner);

    // Changing the registered name keeps the old one and files the change automatically.
    await post('/admin/company/hn-group', { csrf: staffCsrf, legalName: 'HN Group Holdings Limited', name: 'HN Group', number: '12345678', status: 'Active', incorporated: '2026-01-01', registeredOffice: '2 New Road\nCity' }, owner);
    html = await (await get('/company/hn-group')).text();
    assert.match(html, /HN Group Holdings Limited/); assert.match(html, /Previous company names<\/dt><dd>HN Group Limited/);
    assert.match(await (await get('/company/hn-group/filing-history')).text(), /Change of name from HN Group Limited to HN Group Holdings Limited/);
    await post('/admin/company/hn-group', { csrf: staffCsrf, legalName: 'HN Group Holdings Limited', name: 'HN Group', number: '12345678', status: 'Active', incorporated: '2026-01-01', registeredOffice: '2 New Road\nCity' }, owner);
    assert.equal(((await (await get('/company/hn-group/filing-history')).text()).match(/Change of name from/g) || []).length, 1);

    // Customers register new companies and subsidiaries of companies they manage.
    const alexCsrf = csrfIn(await (await get('/account/register-company', alex)).text());
    assert.match(await (await post('/account/register-company', { csrf: alexCsrf, legalName: 'Alex Co Limited', registeredOffice: '1 Road', parent: 'hn-group', officer_name: 'Alex Other', psc_name: 'Alex Other' }, alex)).text(), /only register subsidiaries of companies you manage/);
    html = await (await get('/account/register-company?parent=hn-group', sam)).text();
    assert.match(html, /Register a subsidiary/); assert.match(html, /name="psc_name" type="text" value="HN Group Holdings Limited"/); assert.match(html, /<option value="hn-group" selected>/);
    assert.match(await (await post('/account/register-company', { csrf: samCsrf, legalName: 'HN Group Holdings Limited', registeredOffice: '1 Road', officer_name: 'A', psc_name: 'B' }, sam)).text(), /already on the register/);
    html = await (await follow(await post('/account/register-company', { csrf: samCsrf, legalName: 'Sam Subsidiary Limited', type: 'Private limited company', registeredOffice: '3 Side Street\nCity', parent: 'hn-group', incorporated: '2026-09-01',
      officer_name: 'Sam Customer', officer_role: 'Director', psc_name: 'HN Group Holdings Limited', psc_kind: 'Parent company', psc_share: '100', psc_control: 'Ownership of shares – 75% or more\nRight to appoint and remove directors' }, sam), sam)).text();
    assert.match(html, /application S[0-9A-F]{8} has been sent for review/); assert.match(html, /Application to register Sam Subsidiary Limited as a subsidiary of HN Group Holdings Limited/);
    assert.equal((await get('/company/sam-subsidiary-limited')).status, 404);
    html = await (await get('/admin/submissions', owner)).text();
    assert.match(html, /Application to register a company/); assert.match(html, /First officer<\/dt><dd>Sam Customer \(Director\)/);
    const appId = html.match(/\/admin\/submissions\/([a-f0-9]{24})"/)[1];
    assert.match(await (await post('/admin/submissions/' + appId, { csrf: staffCsrf, decision: 'accept' }, owner)).text(), /accepted\. The company has been registered/);
    html = await (await get('/company/sam-subsidiary-limited', sam)).text();
    assert.match(html, /Sam Subsidiary Limited/); assert.match(html, /3 Side Street<br>City/); assert.match(html, /File for this company/);
    html = await (await get('/company/sam-subsidiary-limited/filing-history')).text();
    assert.match(html, /Incorporation of Sam Subsidiary Limited/);
    assert.match(html, /Appointment of Sam Customer as a director on 1 September 2026/);
    assert.match(html, /Notification of HN Group Holdings Limited as a person with significant control on 1 September 2026/);
    assert.match(await (await get('/company/sam-subsidiary-limited/persons-with-significant-control')).text(), /Ownership of shares – 75% or more<br>Right to appoint and remove directors/);
    assert.match(await (await get('/company/hn-group/related-companies')).text(), /Sam Subsidiary Limited[\s\S]*Subsidiary/);
    // Company reports cover the company and, optionally, all its subsidiaries (hidden companies are left out).
    assert.equal((await get('/company/hn-group/group-report')).headers.get('location'), '/account/login?return=%2Fcompany%2Fhn-group%2Fgroup-report');
    html = await (await get('/company/hn-group/group-report', alex)).text();
    assert.match(html, /Download a company report/); assert.match(html, /Sam Subsidiary Limited/); assert.match(html, /name="subsidiaries"/);
    r = await get('/company/hn-group/group-report?generate=1&subsidiaries=1&officers=1&psc=1&charges=1&filings=1', alex);
    assert.equal(r.headers.get('content-type'), 'application/pdf'); assert.match(r.headers.get('content-disposition'), /attachment; filename="hn-group-group-report-/);
    let report = Buffer.from(await r.arrayBuffer()).toString('latin1');
    assert.match(report, /^%PDF-1\.4/); assert.match(report, /\(Group report\)/); assert.match(report, /\(Sam Subsidiary Limited\)/); assert.match(report, /\(Example Trading Limited\)/);
    assert.doesNotMatch(report, /Horizon Network Limited \(/); assert.match(report, /\/Count [2-9]/);
    report = Buffer.from(await (await get('/company/hn-group/group-report?generate=1&officers=1', alex)).arrayBuffer()).toString('latin1');
    assert.match(report, /\(Company report\)/); assert.doesNotMatch(report, /\(Sam Subsidiary Limited\)/);

    // Changing the trading name, the registered name, or both.
    html = await (await get('/company/sam-subsidiary-limited/file?type=name', sam)).text();
    assert.match(html, /name="newName" type="text" value="Sam Subsidiary Limited"/); assert.match(html, /name="tradingName"/);
    assert.match(await (await upload('/company/sam-subsidiary-limited/file', { csrf: samCsrf, kind: 'name', newName: 'Sam Subsidiary Limited', tradingName: '' }, null, sam)).text(), /Nothing has changed/);
    assert.match(await (await upload('/company/sam-subsidiary-limited/file', { csrf: samCsrf, kind: 'name', newName: 'HN Group Holdings Limited', tradingName: '' }, null, sam)).text(), /already uses that name/);
    assert.match(await (await upload('/company/sam-subsidiary-limited/file', { csrf: samCsrf, kind: 'name', newName: 'Sam Subsidiary Limited', tradingName: 'Sam Trading' }, null, sam)).text(), /has been sent for review/);
    html = await (await get('/admin/submissions', owner)).text();
    assert.match(html, /Change of trading name to Sam Trading/);
    await post('/admin/submissions/' + html.match(/\/admin\/submissions\/([a-f0-9]{24})"/)[1], { csrf: staffCsrf, decision: 'accept' }, owner);
    html = await (await get('/company/sam-subsidiary-limited')).text();
    assert.match(html, /Trading as Sam Trading/); assert.doesNotMatch(html, /Previous company names/);
    await upload('/company/sam-subsidiary-limited/file', { csrf: samCsrf, kind: 'name', newName: 'Sam Renamed Limited', tradingName: 'Sam Trading' }, null, sam);
    html = await (await get('/admin/submissions', owner)).text();
    assert.match(html, /Change of name from Sam Subsidiary Limited to Sam Renamed Limited/);
    await post('/admin/submissions/' + html.match(/\/admin\/submissions\/([a-f0-9]{24})"/)[1], { csrf: staffCsrf, decision: 'accept' }, owner);
    html = await (await get('/company/sam-subsidiary-limited')).text();
    assert.match(html, /Sam Renamed Limited/); assert.match(html, /Trading as Sam Trading/); assert.match(html, /Previous company names<\/dt><dd>Sam Subsidiary Limited/);

    // Several ticked natures of control are kept, one per line.
    html = await (await post('/admin/company/hn-group/psc', { csrf: staffCsrf, name: 'Tick Boxes', kind: 'Individual', control: 'Right to appoint and remove directors' }, owner, {})).text();
    const fd = new URLSearchParams([['csrf', staffCsrf], ['name', 'Many Ticks'], ['kind', 'Individual'], ['control', 'Right to appoint and remove directors'], ['control', 'Has significant influence or control'], ['control', '']]);
    await fetch(SITE + '/admin/company/hn-group/psc', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: owner }, body: fd.toString() });
    assert.match(await (await get('/company/hn-group/persons-with-significant-control')).text(), /Many Ticks[\s\S]*Right to appoint and remove directors<br>Has significant influence or control/);

    // Managing a parent company covers its subsidiaries.
    const samCustomerId = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'register.json'), 'utf8')).customers.find((x) => x.email === 'sam@example.com').id;
    await post('/admin/company/sam-subsidiary-limited/managers/' + samCustomerId + '/delete', { csrf: staffCsrf }, owner);
    assert.match(await (await get('/company/sam-subsidiary-limited/file', sam)).text(), /What do you want to file\?/);
    await post('/admin/company/hn-group/managers/' + samCustomerId + '/delete', { csrf: staffCsrf }, owner);
    assert.match(await (await get('/company/sam-subsidiary-limited/file', sam)).text(), /You don’t manage this company/);

    // Signed-in customers and staff stay signed in across a restart.
    child.kill(); await new Promise((r) => setTimeout(r, 300)); child = startServer(); await waitUp();
    assert.equal((await get('/account', sam)).status, 200);
    assert.equal((await get('/admin', owner)).status, 200);

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
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The group structure update of 18 October 2026, applied to a register like the live one, with its filings.
test('company register: group structure update', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-companies-group-'));
  const store = path.join(__dirname, 'lib', 'store.js');
  const fresh = () => { delete require.cache[require.resolve(store)]; return require(store); };
  try {
    // The register before the update.
    process.env.COMPANIES_GROUP_UPDATES = 'off';
    let s = fresh(); s.init(dir);
    s.saveCompany('hn-group', { legalName: 'HN Group Limited', name: 'HN Group', status: 'Active', incorporated: '2025-01-01' }, 't');
    s.saveItem('hn-group', 'officers', '', { name: 'Charlie Livsey', role: 'Director', appointed: '2025-01-01', nationality: 'British' }, 't');
    s.saveItem('horizon-network', 'officers', '', { name: 'Jack Example', role: 'Director', appointed: '2025-03-01' }, 't');
    s.saveCompany('', { legalName: 'Horizon Media Group Limited', parent: 'hn-group', incorporated: '2025-02-01' }, 't', { officer: { name: 'Media Director', role: 'Director' }, psc: { name: 'HN Group Limited', kind: 'Parent company', share: '100', control: 'Ownership of shares – 75% or more' } });
    s.saveCompany('', { legalName: 'Horizon Advertising Limited', parent: 'horizon-media-group-limited' }, 't', { officer: { name: 'Ad Director', role: 'Director' }, psc: { name: 'Horizon Media Group Limited', kind: 'Parent company', share: '100' } });
    s.saveCompany('', { legalName: 'Horizon Assets Management Limited', parent: 'hn-group' }, 't', { officer: { name: 'Someone Else', role: 'Secretary' }, psc: { name: 'Old Holder', kind: 'Individual', share: '100' } });
    const adBefore = JSON.stringify(s.db.companies.find((c) => c.legalName === 'Horizon Advertising Limited'));
    // The update runs once, on the next start.
    delete process.env.COMPANIES_GROUP_UPDATES;
    s = fresh(); s.init(dir); s = fresh(); s.init(dir);
    const by = (n) => s.db.companies.find((c) => c.legalName === n);
    const current = (c) => c.psc.filter((p) => !p.ceased);
    const hn = by('HN Group Limited'), inv = by('HN Group Investments Limited'), media = by('Horizon Media Group Limited'), net = by('Horizon Network Limited'), ham = by('HN Group Management Limited');
    // Horizon Assets Management Limited was renamed HN Group Management Limited (20 October 2026), with a Change of name filing.
    assert.equal(ham.name, 'HN Group Management'); assert.deepEqual(ham.previousNames.map((p) => p.name), ['Horizon Assets Management Limited']);
    assert.ok(!by('Horizon Assets Management Limited'));
    // Then HN Group Limited's holders of 28 October 2026 (tested on their own below).
    assert.deepEqual(current(hn).map((p) => [p.name, p.kind, p.share]), [['Charlie Livsey', 'Individual', '30'], ['CLivsey Holdings Limited', 'Parent company', '55'], ['Jack Vinckx', 'Individual', '15']]);
    assert.ok(inv && inv.parent === hn.slug && inv.managedBy === hn.slug && inv.officers.some((o) => o.name === 'Charlie Livsey'));
    assert.deepEqual(current(inv).map((p) => [p.name, p.share, p.control.length]), [['HN Group Limited', '100', 4]]);
    for (const c of [media, net]) {
      assert.equal(c.parent, inv.slug);
      assert.deepEqual(current(c).map((p) => p.name), ['HN Group Investments Limited']);
      assert.ok(c.psc.some((p) => p.name === 'HN Group Limited' && p.ceased));
    }
    assert.ok(net.officers.some((o) => o.name === 'Jack Example' && !o.resigned));
    assert.equal(JSON.stringify(by('Horizon Advertising Limited')), adBefore);
    assert.equal(ham.parent, hn.slug);
    assert.ok(ham.officers.some((o) => o.name === 'Charlie Livsey' && !o.resigned) && ham.officers.some((o) => o.name === 'Someone Else'));
    assert.deepEqual(current(ham).map((p) => p.name), ['HN Group Limited']);
    const filed = (c) => s.filings(c.slug).map((f) => f.description).join('\n');
    assert.match(filed(hn), /Notification of Charlie Livsey as a person with significant control/);
    assert.match(filed(inv), /Incorporation of HN Group Investments Limited/); assert.match(filed(inv), /Appointment of Charlie Livsey as a managing director/); assert.match(filed(inv), /Notification of HN Group Limited/);
    for (const c of [media, net]) { assert.match(filed(c), /Cessation of HN Group Limited/); assert.match(filed(c), /Notification of HN Group Investments Limited/); }
    assert.match(filed(ham), /Cessation of Old Holder/); assert.match(filed(ham), /Appointment of Charlie Livsey/); assert.match(filed(ham), /Notification of HN Group Limited/); assert.match(filed(ham), /Change of name from Horizon Assets Management Limited to HN Group Management Limited/);
    // Charlie Livsey is Managing director on every company where he is a current officer.
    const charlies = s.db.companies.flatMap((x) => x.officers.filter((o) => !o.resigned && o.name === 'Charlie Livsey'));
    assert.ok(charlies.length >= 3); assert.ok(charlies.every((o) => o.role === 'Managing director'));
    // Running again changes nothing, and every filing has its PDF.
    assert.equal(s.db.filings.filter((f) => /Cessation of HN Group Limited/.test(f.description)).length, 2);
    for (const f of s.db.filings) assert.ok(fs.existsSync(s.filePath(f.file)));
  } finally {
    delete process.env.COMPANIES_GROUP_UPDATES;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The user's request (28 October 2026): HN Group Limited is held by CLivsey Holdings Limited (55% Class C), Charlie
// Livsey (30% Class C) and Jack Vinckx (the rest, Class B), with every filing and nobody deleted.
test('company register: HN Group shareholding of 28 October 2026', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-companies-hng-'));
  const store = path.join(__dirname, 'lib', 'store.js');
  const fresh = () => { delete require.cache[require.resolve(store)]; return require(store); };
  try {
    process.env.COMPANIES_GROUP_UPDATES = 'off';
    let s = fresh(); s.init(dir);
    s.saveCompany('hn-group', { legalName: 'HN Group Limited', name: 'HN Group', status: 'Active', incorporated: '2026-09-01' }, 't');
    s.saveItem('hn-group', 'officers', '', { name: 'Charlie Livsey', role: 'Managing director', appointed: '2026-09-01' }, 't');
    s.saveItem('hn-group', 'psc', '', { name: 'Charlie Livsey', kind: 'Individual', classC: '75', classCIssuedBy: 'Charlie Livsey', notified: '2026-09-01', control: 'Ownership of shares – 75% or more\nOwnership of voting rights – 75% or more\nRight to appoint and remove directors' }, 't');
    s.saveItem('hn-group', 'psc', '', { name: 'Jack Vinckx', kind: 'Individual', classB: '15', notified: '2026-09-01' }, 't');
    s.saveItem('hn-group', 'psc', '', { name: 'Old Holder', kind: 'Individual', classA: '5', notified: '2026-09-01' }, 't');
    // Only this update is still to run.
    s.db.migrations.push('group-structure-2026-10-18', 'charlie-managing-director', 'rename-hn-group-management'); s.save();
    const before = s.db.filings.length;
    delete process.env.COMPANIES_GROUP_UPDATES;
    s = fresh(); s.init(dir); s = fresh(); s.init(dir);
    const hn = s.company('hn-group'), current = hn.psc.filter((p) => !p.ceased);
    assert.deepEqual(current.map((p) => [p.name, p.kind, p.share, p.classB, p.classC]).sort(), [['CLivsey Holdings Limited', 'Parent company', '55', '', '55'], ['Charlie Livsey', 'Individual', '30', '', '30'], ['Jack Vinckx', 'Individual', '15', '15', '']]);
    assert.ok(hn.psc.some((p) => p.name === 'Old Holder' && p.ceased), 'other holders cease rather than being deleted');
    const charlie = current.find((p) => p.name === 'Charlie Livsey'), cl = current.find((p) => p.name === 'CLivsey Holdings Limited');
    assert.deepEqual(charlie.control, ['Ownership of shares – more than 25% but not more than 50%', 'Ownership of voting rights – more than 25% but not more than 50%', 'Right to appoint and remove directors']);
    assert.deepEqual(cl.control, ['Ownership of shares – more than 50% but less than 75%', 'Ownership of voting rights – more than 50% but less than 75%']);
    const v = s.votingPower(hn);
    assert.deepEqual([v[cl.id].votes, v[cl.id].control, v[charlie.id].votes], [61.97, true, 33.8]);
    const filed = s.db.filings.slice(before).map((f) => f.category + ': ' + f.description);
    assert.equal(filed.length, 4, filed.join('\n'));
    assert.ok(filed.some((f) => /^Persons with significant control: Cessation of Old Holder/.test(f)));
    assert.ok(filed.some((f) => /^Persons with significant control: Change of details of Charlie Livsey/.test(f)));
    assert.ok(filed.some((f) => /^Persons with significant control: Notification of CLivsey Holdings Limited/.test(f)));
    assert.ok(filed.some((f) => /^Capital: Statement of capital/.test(f)));
    assert.ok(!filed.some((f) => /Jack Vinckx/.test(f)), 'Jack’s holding is unchanged, so nothing is filed for him');
    for (const f of s.db.filings) assert.ok(fs.existsSync(s.filePath(f.file)));
    // CLivsey Holdings Limited is HN Group Limited's parent company, on the register with nothing invented.
    const parent = s.company(hn.parent);
    assert.ok(parent && parent.legalName === 'CLivsey Holdings Limited' && parent.status === 'Active');
    assert.deepEqual([parent.officers.length, parent.psc.length, parent.number, parent.incorporated], [0, 0, '', '']);
    assert.ok(s.children(parent.slug).some((c) => c.slug === 'hn-group'));
    // Where the shareholding was already in place with CLivsey Holdings as a relevant legal entity, it becomes a parent company with a filing.
    process.env.COMPANIES_GROUP_UPDATES = 'off';
    s = fresh(); s.init(dir);
    const entry = s.company('hn-group').psc.find((p) => p.name === 'CLivsey Holdings Limited' && !p.ceased); entry.kind = 'Relevant legal entity';
    s.company('hn-group').parent = '';
    s.db.migrations.splice(s.db.migrations.indexOf('clivsey-holdings-parent-2026-10-28'), 1); s.save();
    delete process.env.COMPANIES_GROUP_UPDATES;
    s = fresh(); s.init(dir);
    assert.equal(s.company('hn-group').parent, parent.slug);
    assert.equal(s.company('hn-group').psc.find((p) => p.name === 'CLivsey Holdings Limited' && !p.ceased).kind, 'Parent company');
    assert.equal(s.db.companies.filter((c) => c.legalName === 'CLivsey Holdings Limited').length, 1, 'not added twice');
    assert.ok(/Previous details.*Relevant legal entity/.test(JSON.stringify(s.db.filings.at(-1).doc.rows)) && /Change of details of CLivsey Holdings Limited/.test(s.db.filings.at(-1).description));
  } finally {
    delete process.env.COMPANIES_GROUP_UPDATES;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('company register: share classes and voting power', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-companies-classes-'));
  const store = path.join(__dirname, 'lib', 'store.js');
  delete require.cache[require.resolve(store)];
  process.env.COMPANIES_GROUP_UPDATES = 'off';
  try {
    const s = require(store); s.init(dir);
    const c = s.saveCompany('', { legalName: 'Class Test Limited', incorporated: '2026-01-01' }, 't', { officer: { name: 'Clara Chair', role: 'Secretary' }, psc: { name: 'Xavier Public', kind: 'Individual', classA: '60' } });
    const err = (fn) => { try { fn(); } catch (e) { return e.message; } return ''; };
    const votes = () => { const v = s.votingPower(s.company(c.slug)); return Object.fromEntries(s.company(c.slug).psc.filter((p) => !p.ceased).map((p) => [p.name, v[p.id]])); };
    assert.equal(s.company(c.slug).psc[0].share, '60', 'the shareholding is the total of its classes');
    // Class B is for staff: people only. Class C needs the Chair. Classes must match the shareholding.
    assert.match(err(() => s.saveItem(c.slug, 'psc', '', { name: 'Parent Co Limited', kind: 'Parent company', classB: '10' }, 't')), /only a person/);
    assert.match(err(() => s.saveItem(c.slug, 'psc', '', { name: 'Zed', kind: 'Individual', classC: '20' }, 't')), /one of the company’s officers/);
    assert.match(err(() => s.saveItem(c.slug, 'psc', '', { name: 'Zed', kind: 'Individual', classC: '20', classCIssuedBy: 'Someone Else' }, 't')), /Clara Chair/);
    assert.match(err(() => s.saveItem(c.slug, 'psc', '', { name: 'Yasmin Staff', kind: 'Individual', share: '30', classB: '20' }, 't')), /add up to 20%, but the shareholding is 30%/);
    assert.match(err(() => s.saveItem(c.slug, 'psc', '', { name: 'Too Much', kind: 'Individual', classA: '50' }, 't')), /Only 100% of a company’s shares can be issued/);
    // Without Class C: A one vote, B half a vote.
    s.saveItem(c.slug, 'psc', '', { name: 'Yasmin Staff', kind: 'Individual', classB: '20' }, 't');
    assert.deepEqual(votes(), { 'Xavier Public': { votes: 85.71, control: false }, 'Yasmin Staff': { votes: 14.29, control: false } });
    // Class C issued by an officer: the largest holder with more than 10% of the Class C shares has 51% of the votes.
    s.saveItem(c.slug, 'psc', '', { name: 'Zara Special', kind: 'Individual', classC: '15', classCIssuedBy: 'clara chair' }, 't');
    let v = votes();
    assert.deepEqual(v['Zara Special'], { votes: 51, control: true });
    assert.equal(v['Xavier Public'].votes, 42); assert.equal(v['Yasmin Staff'].votes, 7);
    // Several holders can pass 10% of the Class C shares; the one holding the most has the 51%, the others count double.
    s.saveItem(c.slug, 'psc', '', { name: 'Walt', kind: 'Individual', classC: '4', classCIssuedBy: 'Clara Chair' }, 't');
    v = votes();
    assert.deepEqual(v['Zara Special'], { votes: 51, control: true });
    assert.deepEqual(v['Walt'], { votes: 5.03, control: false }, 'double votes: 49% × 8/78');
    assert.equal(v['Xavier Public'].votes, 37.69); assert.equal(v['Yasmin Staff'].votes, 6.28);
    // Only 100% of the shares can be issued, whether or not a holding is split into classes (99% issued so far).
    assert.match(err(() => s.saveItem(c.slug, 'psc', '', { name: 'Too Much', kind: 'Individual', share: '2' }, 't')), /Only 100% of a company’s shares can be issued.*101%/);
    s.saveItem(c.slug, 'psc', '', { name: 'Last One', kind: 'Individual', share: '1' }, 't');
    // Holders tied for the most Class C shares share the extra voting power.
    const tie = s.saveCompany('', { legalName: 'Tie Limited' }, 't', { officer: { name: 'Olive Officer', role: 'Secretary' }, psc: { name: 'Ann', kind: 'Individual', classC: '40', classCIssuedBy: 'Olive Officer' } });
    s.saveItem(tie.slug, 'psc', '', { name: 'Ben', kind: 'Individual', classC: '40', classCIssuedBy: 'Olive Officer' }, 't');
    s.saveItem(tie.slug, 'psc', '', { name: 'Cat', kind: 'Individual', classA: '20' }, 't');
    const tv = Object.fromEntries(s.company(tie.slug).psc.map((p) => [p.name, s.votingPower(s.company(tie.slug))[p.id]]));
    assert.deepEqual(tv, { Ann: { votes: 44.44, control: true }, Ben: { votes: 44.44, control: true }, Cat: { votes: 11.11, control: false } });
    // The public feed carries classes, votes and the company's shares by class.
    const feed = s.publicFeed().companies.find((x) => x.slug === c.slug);
    const zara = feed.owners.find((o) => o.name === 'Zara Special');
    assert.deepEqual([zara.classes, zara.votes, zara.votingControl, zara.classCIssuedBy], [{ A: '', B: '', C: '15' }, 51, true, 'clara chair']);
    assert.deepEqual(feed.shareClasses, { classA: 60, classB: 20, classC: 19 });
    // Holdings not split into classes count as Class A.
    const d = s.saveCompany('', { legalName: 'Plain Limited' }, 't', { officer: { name: 'Pat Director' }, psc: { name: 'Pat Director', kind: 'Individual', share: '100' } });
    assert.equal(Object.values(s.votingPower(s.company(d.slug)))[0].votes, 100);
    assert.equal(s.publicFeed().companies.find((x) => x.slug === d.slug).owners[0].classes, null);
  } finally {
    delete process.env.COMPANIES_GROUP_UPDATES;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('company register: one-off reset deletes every company, keeps accounts and a full backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-companies-reset-'));
  const store = path.join(__dirname, 'lib', 'store.js');
  const fresh = () => { delete require.cache[require.resolve(store)]; return require(store); };
  process.env.COMPANIES_GROUP_UPDATES = 'off';
  try {
    let s = fresh(); s.init(dir);
    assert.ok(s.company('hn-group'), 'a new register starts with its seeds (nothing to reset)');
    s.saveCompany('', { legalName: 'Old Company Limited', incorporated: '2026-01-01' }, 't', { officer: { name: 'Olive Officer' }, psc: { name: 'Olive Officer', kind: 'Individual', share: '100' } });
    const file = path.join(dir, 'register.json'), data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const pdfs = data.filings.map((f) => f.file).filter(Boolean);
    assert.ok(pdfs.length, 'generated filings have PDFs');
    // An existing register from before the reset: some customer items, and no record of the reset.
    data.customers.push({ id: 'c1', email: 'keep@example.com', name: 'Kept Customer' });
    data.requests.push({ id: 'r1', company: 'hn-group', customer: 'c1', status: 'Open' });
    data.submissions.push({ id: 's1', company: 'hn-group', customer: 'c1', status: 'Pending', file: '' }, { id: 's2', company: '', kind: 'incorporate', customer: 'c1', status: 'Pending', file: '' });
    data.migrations = data.migrations.filter((m) => m !== 'reset-companies-2026-10-20');
    fs.writeFileSync(file, JSON.stringify(data));
    s = fresh(); s.init(dir);
    assert.deepEqual(s.db.companies, []); assert.deepEqual(s.db.filings, []);
    assert.deepEqual(s.db.requests, []); assert.deepEqual(s.db.submissions.map((x) => x.id), ['s2']);
    assert.equal(s.db.customers.length, 1, 'customer accounts are kept');
    for (const f of pdfs) assert.ok(!fs.existsSync(path.join(dir, 'files', f)), 'company PDFs are removed');
    const backups = fs.readdirSync(path.join(dir, 'backups'));
    assert.equal(backups.length, 1);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'backups', backups[0], 'register.json'), 'utf8'));
    assert.ok(saved.companies.some((c) => c.legalName === 'Old Company Limited'));
    for (const f of pdfs) assert.ok(fs.existsSync(path.join(dir, 'backups', backups[0], 'files', f)), 'PDFs are in the backup');
    assert.equal(s.publicFeed().companies.length, 0);
    assert.ok(s.db.audit.some((a) => a.action === 'register.reset'));
    // It runs once: the seeds don't come back and new companies stay.
    s.saveCompany('', { legalName: 'New Start Limited' }, 't', { officer: { name: 'Nia' }, psc: { name: 'Nia', kind: 'Individual', share: '100' } });
    s = fresh(); s.init(dir);
    assert.deepEqual(s.db.companies.map((c) => c.legalName), ['New Start Limited']);
  } finally {
    delete process.env.COMPANIES_GROUP_UPDATES;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('company register: staff change (backdate) an incorporation date with its filings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-companies-backdate-'));
  const store = path.join(__dirname, 'lib', 'store.js');
  delete require.cache[require.resolve(store)];
  process.env.COMPANIES_GROUP_UPDATES = 'off';
  try {
    const s = require(store); s.init(dir);
    const c = s.saveCompany('', { legalName: 'Backdate Limited', incorporated: '2026-06-01' }, 't', { officer: { name: 'Olive Officer', role: 'Director' }, psc: { name: 'Olive Officer', kind: 'Individual', share: '100' } });
    s.saveItem(c.slug, 'officers', '', { name: 'Later Director', role: 'Director', appointed: '2026-08-01' }, 't');
    const err = (input) => { try { s.changeIncorporation(c.slug, input, 't'); } catch (e) { return e.message; } return ''; };
    assert.match(err({ date: '2999-01-01' }), /future/);
    assert.match(err({ date: '2026-02-30' }), /real date/);
    assert.match(err({ date: '2026-06-01' }), /already/);
    const r = s.changeIncorporation(c.slug, { date: '2025-04-21', reason: 'Started earlier', moveRecords: 'on' }, 'staff:test');
    assert.equal(r.moved, 2, 'the first officer and PSC move with it');
    const now = s.company(c.slug);
    assert.equal(now.incorporated, '2025-04-21');
    assert.equal(now.officers.find((o) => o.name === 'Olive Officer').appointed, '2025-04-21');
    assert.equal(now.officers.find((o) => o.name === 'Later Director').appointed, '2026-08-01', 'later appointments stay');
    assert.equal(now.psc[0].notified, '2025-04-21');
    const inc = s.filing(now.incorporationFiling);
    assert.equal(inc.date, '2025-04-21');
    assert.ok(inc.doc.rows.some(([k, v]) => k === 'Incorporated on' && v === '21 April 2025'), 'the document shows the new date');
    assert.equal(s.filings(c.slug).filter((f) => f.category === 'Incorporation').length, 1, 'no second Incorporation filing');
    assert.ok(s.db.audit.some((a) => a.action === 'company.incorporation-date' && a.detail.includes('Started earlier')));
    // Without moving records, only the date and filing move; editing it in the details form does the same.
    s.changeIncorporation(c.slug, { date: '2025-01-10' }, 't');
    assert.equal(s.company(c.slug).officers.find((o) => o.name === 'Olive Officer').appointed, '2025-04-21');
    s.saveCompany(c.slug, { ...s.company(c.slug), sic: '', divisions: '', incorporated: '2024-12-01' }, 't');
    assert.equal(s.filing(s.company(c.slug).incorporationFiling).date, '2024-12-01');
  } finally {
    delete process.env.COMPANIES_GROUP_UPDATES;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
