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
    env: { ...process.env, PORT: String(sitePort), HOST: '127.0.0.1', COMPANIES_ORIGIN: SITE, COMPANIES_DATA_DIR: path.join(dir, 'data') },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  let child = startServer();
  const waitUp = async () => { for (let i = 0; i < 50; i++) { try { if ((await fetch(SITE + '/healthz')).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); } };
  const get = (p, cookie) => fetch(SITE + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
  const post = (p, fields, cookie, extra) => fetch(SITE + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}), ...(extra || {}) }, body: new URLSearchParams(fields).toString() });
  const upload = (p, fields, file, cookie) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); if (file) fd.append('document', new Blob([file], { type: 'application/pdf' }), 'doc.pdf'); return fetch(SITE + p, { method: 'POST', redirect: 'manual', headers: { cookie }, body: fd }); };
  const cookieOf = (r, name) => (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).map((c) => c.split(';')[0]).find((c) => c.startsWith(name + '='));
  const csrfIn = (html) => html.match(/name="csrf" value="([a-f0-9]+)"/)[1];
  try {
    await waitUp();

    // The home page is a search page branded Horizon Assets Management, with no company list and no HN Group branding.
    let html = await (await get('/')).text();
    assert.match(html, /horizon-assets-management-logo-white\.svg/); assert.match(html, /Staff sign in/);
    assert.doesNotMatch(html, /hn-group-wordmark|Plus Jakarta|Horizon Network Limited|Holding Co/);
    assert.match(html, /run by Horizon Assets Management Limited, a wholly owned subsidiary of HN Group Limited/);
    assert.equal((await get('/assets/brand/hn-group-wordmark.svg')).status, 404);
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
    assert.match(html, /\/company\/horizon-network\/claim/); assert.doesNotMatch(html, /File a change|Register a subsidiary/);
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
    assert.match(html, /File a change/); assert.match(html, /Register a subsidiary/);
    assert.match(await (await get('/account', sam)).text(), /Your companies[\s\S]*Horizon Network Limited/);
    assert.match(await (await get('/admin/customers', owner)).text(), /sam@example\.com<\/td><td><a href="\/admin\/company\/horizon-network">/);

    // Submit a filing: PDFs only.
    assert.match(await (await upload('/company/horizon-network/file', { csrf: samCsrf, category: 'Address', description: 'Change of address' }, Buffer.from('not a pdf'), sam)).text(), /Upload a PDF file/);
    html = await (await upload('/company/horizon-network/file', { csrf: samCsrf, category: 'Address', description: 'Change of registered office address', note: 'New office' }, PDF, sam)).text();
    assert.match(html, /has been sent for review/);
    assert.doesNotMatch(await (await get('/company/horizon-network/filing-history')).text(), /Change of registered office address/);

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
    assert.match(samAccount, />Accepted</); assert.match(samAccount, /Note from Horizon Assets Management: Thanks/);

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
    const genId = html.match(/Incorporation of HN Group Limited<\/td><td><a href="\/document\/([a-f0-9]{24})/)[1];
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
    assert.match(await (await upload('/company/hn-group/file', { csrf: samCsrf, kind: 'psc_change', psc: skyId, psc_name: 'Sky Holder', psc_kind: 'Individual', psc_share: '25', psc_control: 'Ownership of shares – more than 25% but not more than 50%', changed: '2026-07-05' }, null, sam)).text(), /Nothing has changed/);
    await upload('/company/hn-group/file', { csrf: samCsrf, kind: 'psc_change', psc: skyId, psc_name: 'Sky Holder', psc_kind: 'Individual', psc_share: '60', psc_control: 'Ownership of shares – more than 50% but less than 75%', changed: '2026-07-05' }, null, sam);
    html = await (await get('/admin/submissions', owner)).text();
    assert.match(html, /Change of details of Sky Holder as a person with significant control on 5 July 2026/); assert.match(html, /New details<\/dt><dd>Sky Holder · Individual · 60%/);
    for (const sid of [...html.matchAll(/\/admin\/submissions\/([a-f0-9]{24})"/g)].map((x) => x[1])) await post('/admin/submissions/' + sid, { csrf: staffCsrf, decision: 'accept' }, owner);
    html = await (await get('/company/hn-group/persons-with-significant-control')).text();
    assert.match(html, /Morgan Holder[\s\S]*<dd>10%<\/dd>/); assert.match(html, /Sky Holder[\s\S]*<dd>60%<\/dd>[\s\S]*more than 50% but less than 75%/);
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
    html = await (await post('/account/register-company', { csrf: samCsrf, legalName: 'Sam Subsidiary Limited', type: 'Private limited company', registeredOffice: '3 Side Street\nCity', parent: 'hn-group', incorporated: '2026-09-01',
      officer_name: 'Sam Customer', officer_role: 'Director', psc_name: 'HN Group Holdings Limited', psc_kind: 'Parent company', psc_share: '100', psc_control: 'Ownership of shares – 75% or more\nRight to appoint and remove directors' }, sam)).text();
    assert.match(html, /application S[0-9A-F]{8} has been sent for review/); assert.match(html, /Application to register Sam Subsidiary Limited as a subsidiary of HN Group Holdings Limited/);
    assert.equal((await get('/company/sam-subsidiary-limited')).status, 404);
    html = await (await get('/admin/submissions', owner)).text();
    assert.match(html, /Application to register a company/); assert.match(html, /First officer<\/dt><dd>Sam Customer \(Director\)/);
    const appId = html.match(/\/admin\/submissions\/([a-f0-9]{24})"/)[1];
    assert.match(await (await post('/admin/submissions/' + appId, { csrf: staffCsrf, decision: 'accept' }, owner)).text(), /accepted\. The company has been registered/);
    html = await (await get('/company/sam-subsidiary-limited', sam)).text();
    assert.match(html, /Sam Subsidiary Limited/); assert.match(html, /3 Side Street<br>City/); assert.match(html, /File a change/);
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
