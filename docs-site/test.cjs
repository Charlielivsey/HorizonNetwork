'use strict';
// HN Group Docs tests: staff sign-in through a stand-in HN Group Auth, every template for every company,
// filtering by company, type and author, saving with version checks, cleaning of document HTML, private documents,
// who may delete or change sharing, duplicating, and that nothing but the sign-in assets is served signed out.
//   node --test docs-site/test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { sanitize, plain } = require('./lib/sanitize');
const catalog = require('./lib/catalog');

const freePort = () => new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const hex = () => crypto.randomBytes(32).toString('hex');

test('document HTML is rebuilt from allowed formatting only', () => {
  const evil = '<p onclick="x()">Hi <script>alert(1)</script><b>bold</b> <img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a> <a href="https://hngroup.org.uk" target=_blank>good</a></p>' +
    '<style>p{}</style><iframe src="https://evil"></iframe><svg><script>1</script></svg><!-- c --><h2 style="text-align: center; color:red">T</h2><table><tr><td colspan="2" style="x">c</td></tr></table>' +
    '<p>&lt;script&gt; stays text &amp; more &nbsp;</p><div><unknown>kept text</unknown></div><p>unclosed <em>em';
  const out = sanitize(evil);
  assert.ok(!/script|onerror|onclick|iframe|svg|style>|<img|javascript:|target=|color/i.test(out.replace(/&lt;script&gt;/g, '')), out);
  assert.match(out, /<p>Hi <strong>bold<\/strong> <a>bad<\/a> <a href="https:\/\/hngroup.org.uk" rel="noopener noreferrer">good<\/a><\/p>/);
  assert.match(out, /<h2 style="text-align:center">T<\/h2>/);
  assert.match(out, /<td colspan="2">c<\/td>/);
  assert.match(out, /<p>&lt;script&gt; stays text &amp; more  <\/p>/);
  assert.match(out, /<div>kept text<\/div>/);
  assert.match(out, /<p>unclosed <em>em<\/em><\/p>$/, 'open tags are closed');
  assert.equal(sanitize('<a href=" jav&#x61;script:alert(1)">x</a>'), '<a>x</a>');
  assert.equal(sanitize('a < b and <3'), 'a &lt; b and &lt;3');
  assert.equal(sanitize('<p>x</p></div></p>'), '<p>x</p>');
  assert.equal(plain('  Line one\n\nLine two  ', 100, false), 'Line one Line two');
  assert.equal(plain('a\n\n\n\nb', 100, true), 'a\n\nb');
});

test('every template starts filled in for every company, signed with the author’s full name and job title', () => {
  const me = { displayName: 'Sam', fullName: 'Sam Taylor', jobTitle: 'Head of People' };
  for (const c of catalog.COMPANIES) {
    assert.ok(fs.existsSync(path.join(__dirname, 'public', 'assets', 'brand', c.logo + '.svg')), c.logo);
    assert.ok(fs.existsSync(path.join(__dirname, 'public', 'assets', 'brand', c.logo + '-white.svg')), c.logo + '-white');
    for (const t of catalog.TEMPLATES) {
      const s = catalog.start(t, c, me, new Date('2026-10-26T12:00:00Z'));
      assert.ok(!/\{(company|legal|about|jobTitle)\}/.test(s.body + JSON.stringify(s.fields) + s.title), t.id + ' fills every placeholder');
      if (t.layout === 'letter') {
        assert.equal(s.fields.senderName, 'Sam Taylor', t.id); assert.equal(s.fields.senderRole, 'Head of People', t.id); assert.equal(s.fields.date, '26 October 2026');
      }
      if (t.id === 'press') assert.ok(s.body.includes(c.about.replace(/&/g, '&amp;')));
    }
  }
  for (const id of ['termination', 'resignation', 'onboarding', 'welcome']) assert.equal(catalog.template(id).group, 'HR letters', id);
  // The staff contract (HN Group Limited employs) and the same contract with the branded company as the employer.
  const network = catalog.company('horizon-network');
  const group = catalog.start(catalog.template('contract'), network, me), own = catalog.start(catalog.template('contract-company'), network, me);
  assert.match(group.body, /made between <strong>HN Group Limited<\/strong>/); assert.match(group.body, /64 days’ paid holiday/); assert.match(group.body, /two weeks’ written notice/);
  assert.match(group.body, /Any director of HN Group Limited, as listed on the Company Register/); assert.equal(group.fields.deployedTo, 'Horizon Network Limited');
  assert.match(own.body, /made between <strong>Horizon Network Limited<\/strong>/); assert.match(own.body, /Any director of Horizon Network Limited/); assert.match(own.body, /On behalf of Horizon Network Limited/);
  assert.ok(!/HN Group Limited/.test(own.body), 'the company version never names HN Group Limited as employer');
  assert.ok(catalog.template('contract').confidential && catalog.template('contract-company').confidential);
  assert.match(catalog.start(catalog.template('resignation'), catalog.company('hn-group'), me).body, /my role as Head of People at HN Group Limited/);
  assert.match(catalog.start(catalog.template('termination'), catalog.company('hn-group'), me).body, /right to appeal/);
});

test('policy versions: changed sections are listed and the number goes up', () => {
  const store = require('./lib/store');
  const before = { title: 'Leave', fields: { owner: 'A', effective: '1 May', review: '' }, body: '<h2>1. Purpose</h2><p>Old</p><h2>2. Scope</h2><p>All staff</p><h2>3. Old bit</h2><p>x</p>' };
  const after = { title: 'Leave policy', fields: { owner: 'B', effective: '1 May', review: '' }, body: '<h2>1. Purpose</h2><p>New</p><h2>2. Scope</h2><p>All staff</p><h2>4. Monitoring</h2><p>y</p>' };
  assert.deepEqual(store.describeChanges(before, after), ['Renamed from “Leave”', 'Updated 1. Purpose', 'Added 4. Monitoring', 'Removed 3. Old bit', 'Changed the policy owner']);
  assert.equal(store.nextVersion('1.0'), '1.1'); assert.equal(store.nextVersion('2.9'), '2.10'); assert.equal(store.nextVersion('3'), '3.1');
});

test('HN Group Docs: sign-in, storage, files, access, templates, filters, editing and permissions', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-docs-'));
  const secret = hex(); fs.writeFileSync(path.join(dir, 'secret'), secret);
  const seedDir = path.join(dir, 'seed'); fs.mkdirSync(seedDir);
  fs.copyFileSync(path.join(__dirname, 'seed', 'hn-group-merger-agreement.pdf'), path.join(seedDir, 'merger.pdf'));
  fs.writeFileSync(path.join(seedDir, 'index.json'), JSON.stringify([{ id: 'merger', ownerEmail: 'charlie@hngroup.org.uk', file: 'merger.pdf', name: 'HN Group merger agreement.pdf', company: 'hn-group' }]));
  const later = (days) => new Date(Date.now() + days * 86400000).toISOString();
  const people = {
    sam: { id: 'p-sam', email: 'sam@hngroup.org.uk', displayName: 'Sam', firstName: 'Sam', lastName: 'Taylor', jobTitle: 'Head of People', avatarUrl: '/api/avatar', statusAdminAllowed: false, ownerAccess: false },
    alex: { id: 'p-alex', email: 'alex@hngroup.org.uk', displayName: 'Alex Jones', firstName: 'Alex', lastName: 'Jones', jobTitle: 'Designer', statusAdminAllowed: false, ownerAccess: false, storageGrants: [] },
    owner: { id: 'p-owner', accountId: 'a-owner', email: 'charlie@hngroup.org.uk', displayName: 'Charlie', firstName: 'Charlie', lastName: 'Livsey', jobTitle: 'Managing Director', ownerAccess: true, permissions: ['contracts.send', 'contracts.manage'] },
  };
  const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const codes = new Map(), sessions = new Map(), imports = []; let stubBroken = false;
  const authServer = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      const data = JSON.parse(body || '{}'), send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
      if (req.url === '/api/service/import' && stubBroken) { imports.push({}); return send(401, { error: 'Sign in to use HN Group Documents.' }); }
      if (req.url === '/api/service/import') { imports.push({ auth: req.headers.authorization, ...data }); return req.headers.authorization === 'Bearer ' + secret ? send(201, { id: 'c1', url: 'https://contracts.example/contract/0b1c2d3e-4f50-4a61-8b72-938495a6b7c8' }) : send(404, {}); }
      if (req.url === '/api/auth/staff-directory') return req.headers.authorization === 'Bearer ' + secret ? send(200, { people: Object.values(people).map((p) => ({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, company: 'HN Group' })) }) : send(401, { error: 'No.' });
      if (req.headers.authorization !== 'Bearer ' + secret || data.client_id !== 'docs') return send(401, { error: 'No.' });
      if (req.url === '/api/sso/exchange') { const g = codes.get(data.code); codes.delete(data.code); if (!g || g.state !== data.state) return send(401, { error: 'Expired.' }); const s = hex(); sessions.set(s, g.who); return send(200, { session: s, expires: Date.now() + 3600000, user: people[g.who] }); }
      if (req.url === '/api/sso/session') { const who = sessions.get(data.session); return who ? send(200, { session: data.session, user: people[who] }) : send(401, { error: 'Expired.' }); }
      if (req.url === '/api/sso/avatar') { const who = sessions.get(data.session); if (!who || !people[who].avatarUrl) return send(404, { error: 'None.' }); res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(PNG); }
      send(404, { error: 'Not found' });
    });
  });
  await new Promise((r) => authServer.listen(0, '127.0.0.1', r));
  const port = await freePort(), SITE = 'http://127.0.0.1:' + port;
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', DOCS_DATA_DIR: path.join(dir, 'data'), DOCS_SEED_DIR: seedDir, DOCS_ORIGIN: SITE, AUTH_ORIGIN: 'https://auth.example', AUTH_BACKEND: 'http://127.0.0.1:' + authServer.address().port, STAFF_BACKEND: 'http://127.0.0.1:' + authServer.address().port, CONTRACTS_BACKEND: 'http://127.0.0.1:' + authServer.address().port, STATUS_SSO_SECRET_FILE: path.join(dir, 'secret') };
  let child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: ['ignore', 'ignore', 'inherit'] });
  const call = async (p, o = {}) => {
    const headers = { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.origin === false ? {} : typeof o.origin === 'string' ? { origin: o.origin } : o.method && o.method !== 'GET' || o.json ? { origin: SITE } : {}), ...(o.headers || {}) };
    const r = await fetch(SITE + p, { method: o.method || (o.json ? 'POST' : 'GET'), headers, body: o.json ? JSON.stringify(o.json) : o.body, redirect: 'manual' });
    const type = r.headers.get('content-type') || '';
    return { status: r.status, body: type.startsWith('application/json') ? await r.json() : type.startsWith('text') ? await r.text() : Buffer.from(await r.arrayBuffer()), headers: r.headers };
  };
  const cookieOf = (r, name) => (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map((c) => c.split(';')[0]).find((c) => c.startsWith(name + '='));
  const signIn = async (who, next) => {
    const start = await call('/auth/login' + (next ? '?next=' + encodeURIComponent(next) : ''));
    const location = new URL(start.headers.get('location')); assert.equal(location.searchParams.get('client_id'), 'docs');
    const state = location.searchParams.get('state'), code = hex(); codes.set(code, { state, who });
    const back = await call('/auth/callback?code=' + code + '&state=' + state, { cookie: cookieOf(start, 'hn_docs_state') });
    assert.equal(back.status, 302); return { cookie: cookieOf(back, 'hn_docs_session'), location: back.headers.get('location') };
  };
  const ready = async () => { for (let i = 0; i < 50; i++) { try { if ((await fetch(SITE + '/healthz')).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); } };
  const upload = (cookie, name, bytes, extra = {}) => call('/api/files', { cookie, method: 'POST', body: bytes, headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), ...extra } });
  try {
    await ready();
    // Signed out: straight to HN Group Auth; only the sign-in page's assets are public.
    let r = await call('/templates');
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/auth/login?next=%2Ftemplates');
    assert.equal((await call('/api/me')).status, 401);
    assert.equal((await call('/assets/documents.js')).status, 401);
    assert.equal((await call('/assets/brand/horizon-media-group-logo.svg')).status, 401);
    assert.equal((await call('/assets/documents.css')).status, 200);
    assert.equal((await call('/assets/brand/hn-group-wordmark.svg')).status, 200);

    const sam = await signIn('sam', '/templates');
    assert.equal(sam.location, '/templates', 'signing in returns to the page asked for');
    for (const page of ['/storage', '/storage/p-owner', '/doc/' + crypto.randomUUID()]) { r = await call(page, { cookie: sam.cookie }); assert.equal(r.status, 200, page); assert.match(r.body, /id="view-editor"/); }
    const me = (await call('/api/me', { cookie: sam.cookie })).body;
    assert.equal(me.user.name, 'Sam'); assert.equal(me.user.fullName, 'Sam Taylor'); assert.equal(me.user.jobTitle, 'Head of People'); assert.equal(me.user.picture, true);
    assert.equal(me.user.storageAccess, false);
    assert.equal(me.companies.length, catalog.COMPANIES.length); assert.equal(me.templates.length, catalog.TEMPLATES.length);
    r = await call('/api/avatar', { cookie: sam.cookie });
    assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/png'); assert.ok(r.body.equals(PNG), 'the staff profile picture comes through');

    // Every template for every company, shared with staff.
    const made = [];
    for (const c of catalog.COMPANIES) for (const t of catalog.TEMPLATES) {
      r = await call('/api/documents', { cookie: sam.cookie, json: { company: c.id, template: t.id, title: t.name + ' for ' + c.name, sharing: 'staff' } });
      assert.equal(r.status, 201, JSON.stringify(r.body)); made.push(r.body.document);
      assert.equal(r.body.document.sharing, 'staff'); assert.equal(r.body.document.version, 1);
    }
    assert.equal((await call('/api/documents', { cookie: sam.cookie, json: { company: 'nope', template: 'letter' } })).status, 400);
    assert.equal((await call('/api/documents', { cookie: sam.cookie, json: { company: 'hn-group', template: 'letter' }, origin: 'https://evil.example' })).status, 403, 'changes must come from the site');
    const termination = made.find((d) => d.template === 'termination' && d.company === 'hn-group');
    assert.equal(termination.fields.senderName, 'Sam Taylor'); assert.equal(termination.fields.senderRole, 'Head of People');

    // Filters (shared).
    let list = (await call('/api/documents?company=horizon-network', { cookie: sam.cookie })).body;
    assert.equal(list.documents.length, catalog.TEMPLATES.length); assert.ok(list.documents.every((d) => d.company === 'horizon-network' && !('body' in d)));
    list = (await call('/api/documents?template=memo', { cookie: sam.cookie })).body;
    assert.equal(list.documents.length, catalog.COMPANIES.length);
    list = (await call('/api/documents?q=' + encodeURIComponent('press release advertising'), { cookie: sam.cookie })).body;
    assert.deepEqual(list.documents.map((d) => d.title), ['Press release for Horizon Advertising']);

    // Editing: fields, body (cleaned), company; stale versions are refused.
    const letter = made.find((d) => d.template === 'letter' && d.company === 'hn-group');
    r = await call('/api/documents/' + letter.id, { cookie: sam.cookie, method: 'PUT', json: { version: 1, title: 'Welcome\nletter', fields: { recipient: 'Jo Bloggs\n1 High Street', reference: 'HN/1', evil: 'x' }, body: '<p>Hello<script>alert(1)</script></p>', company: 'horizon-network' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.document.title, 'Welcome letter'); assert.equal(r.body.document.body, '<p>Hello</p>'); assert.equal(r.body.document.company, 'horizon-network');
    assert.equal(r.body.document.fields.recipient, 'Jo Bloggs\n1 High Street'); assert.ok(!('evil' in r.body.document.fields));
    r = await call('/api/documents/' + letter.id, { cookie: sam.cookie, method: 'PUT', json: { version: 1, title: 'Old' } });
    assert.equal(r.status, 409); assert.match(r.body.error, /Sam changed this document/);

    // Policy versions: first final is 1.0; editing and marking final again gives 1.1 with the changes listed.
    const policy = made.find((d) => d.template === 'policy' && d.company === 'hn-group');
    let v = policy.version;
    r = await call('/api/documents/' + policy.id, { cookie: sam.cookie, method: 'PUT', json: { version: v, status: 'final' } }); v = r.body.document.version;
    assert.deepEqual(r.body.document.history.map((h) => [h.version, h.by, h.changes]), [['1.0', 'Sam Taylor', ['First version']]]);
    r = await call('/api/documents/' + policy.id, { cookie: sam.cookie, method: 'PUT', json: { version: v, status: 'draft' } }); v = r.body.document.version;
    r = await call('/api/documents/' + policy.id, { cookie: sam.cookie, method: 'PUT', json: { version: v, status: 'final' } }); v = r.body.document.version;
    assert.equal(r.body.document.history.length, 1, 'no new version without changes');
    r = await call('/api/documents/' + policy.id, { cookie: sam.cookie, method: 'PUT', json: { version: v, status: 'draft' } }); v = r.body.document.version;
    const body = r.body.document.body.replace('[The rules.]', 'Staff may work from home two days a week.');
    r = await call('/api/documents/' + policy.id, { cookie: sam.cookie, method: 'PUT', json: { version: v, body } }); v = r.body.document.version;
    r = await call('/api/documents/' + policy.id, { cookie: sam.cookie, method: 'PUT', json: { version: v, status: 'final' } }); v = r.body.document.version;
    assert.equal(r.body.document.fields.version, '1.1');
    assert.deepEqual(r.body.document.history[1].changes, ['Updated 3. Policy']);

    // Private storage: new documents go there by default and nobody else sees them.
    const alex = await signIn('alex');
    r = await call('/api/documents', { cookie: alex.cookie, json: { company: 'hn-group', template: 'memo', title: 'Alex private notes' } });
    const secretDoc = r.body.document;
    assert.equal(secretDoc.sharing, 'private');
    assert.deepEqual((await call('/api/documents?scope=mine', { cookie: alex.cookie })).body.documents.map((d) => d.title), ['Alex private notes']);
    assert.ok(!(await call('/api/documents', { cookie: alex.cookie })).body.documents.some((d) => d.id === secretDoc.id), 'private documents aren’t shared');
    assert.equal((await call('/api/documents/' + secretDoc.id, { cookie: sam.cookie })).status, 404, 'nobody else can open it');
    assert.equal((await call('/api/storage/p-alex', { cookie: sam.cookie })).status, 403);

    // Files in private storage: checked by content, private, renamable and deletable by their owner only.
    assert.equal((await upload(alex.cookie, 'evil.pdf', Buffer.from('<script>alert(1)</script>'))).status, 415, 'contents must match the type');
    assert.equal((await upload(alex.cookie, 'run.exe', Buffer.from('MZ....'))).status, 415);
    r = await upload(alex.cookie, 'Contract.pdf', fs.readFileSync(path.join(__dirname, 'seed', 'hn-group-merger-agreement.pdf')), { 'X-Company': 'horizon-network' });
    assert.equal(r.status, 201); const file = r.body.file;
    assert.equal(file.mime, 'application/pdf'); assert.equal(file.company, 'horizon-network');
    assert.equal((await upload(alex.cookie, 'notes.txt', Buffer.from('Remember the meeting'))).status, 201);
    list = (await call('/api/documents?scope=mine', { cookie: alex.cookie })).body;
    assert.deepEqual(list.files.map((f) => f.name).sort(), ['Contract.pdf', 'notes.txt']);
    r = await call('/api/files/' + file.id, { cookie: alex.cookie });
    assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /^inline/); assert.match(r.headers.get('content-security-policy'), /sandbox/);
    assert.match((await call('/api/files/' + file.id + '?download=1', { cookie: alex.cookie })).headers.get('content-disposition'), /^attachment/);
    assert.equal((await call('/api/files/' + file.id, { cookie: sam.cookie })).status, 404, 'files are private');
    r = await call('/api/files/' + file.id, { cookie: alex.cookie, method: 'PUT', json: { name: 'Signed contract' } });
    assert.equal(r.body.file.name, 'Signed contract.pdf');

    // The merger agreement waits for Charlie and is in his private storage once he signs in.
    const owner = await signIn('owner');
    list = (await call('/api/documents?scope=mine', { cookie: owner.cookie })).body;
    assert.deepEqual(list.files.map((f) => f.name), ['HN Group merger agreement.pdf']);
    assert.ok((await call('/api/files/' + list.files[0].id, { cookie: owner.cookie })).body.subarray(0, 5).toString() === '%PDF-');
    assert.equal((await call('/api/files/' + list.files[0].id, { cookie: sam.cookie })).status, 404);

    // Storage access: the owner (and anyone with the permission) can open anyone's storage, view only, and it's logged.
    r = await call('/api/storage/p-alex', { cookie: owner.cookie });
    assert.equal(r.status, 200); assert.equal(r.body.person.name, 'Alex Jones'); assert.equal(r.body.access, 'permission');
    assert.deepEqual(r.body.documents.map((d) => d.title), ['Alex private notes']); assert.equal(r.body.files.length, 2);
    r = await call('/api/documents/' + secretDoc.id, { cookie: owner.cookie });
    assert.equal(r.status, 200); assert.equal(r.body.document.readOnly, true);
    assert.equal((await call('/api/documents/' + secretDoc.id, { cookie: owner.cookie, method: 'PUT', json: { version: secretDoc.version, title: 'Changed' } })).status, 403, 'view only');
    assert.equal((await call('/api/documents/' + secretDoc.id, { cookie: owner.cookie, method: 'DELETE' })).status, 403);
    assert.equal((await call('/api/files/' + file.id, { cookie: owner.cookie, method: 'DELETE' })).status, 403);
    assert.equal((await call('/api/files/' + file.id, { cookie: owner.cookie })).status, 200);

    // An individual, timed grant from the staff portal lets Sam into Alex's storage only, until it ends.
    people.sam.storageGrants = [{ personId: 'p-alex', name: 'Alex Jones', until: later(2) }];
    const sam2 = await signIn('sam');
    r = await call('/api/storage/p-alex', { cookie: sam2.cookie });
    assert.equal(r.status, 200); assert.equal(r.body.access, 'grant'); assert.ok(r.body.until);
    assert.equal((await call('/api/storage/p-owner', { cookie: sam2.cookie })).status, 403, 'only the storage they were given');
    people.sam.storageGrants = [{ personId: 'p-alex', name: 'Alex Jones', until: new Date(Date.now() - 1000).toISOString() }];
    const sam3 = await signIn('sam');
    assert.equal((await call('/api/storage/p-alex', { cookie: sam3.cookie })).status, 403, 'expired grants stop working');

    // Shared documents: anyone can edit; only the author or an owner-level account deletes or moves them.
    const report = made.find((d) => d.template === 'report' && d.company === 'hn-group');
    r = await call('/api/documents/' + report.id, { cookie: alex.cookie, method: 'PUT', json: { version: 1, body: '<h2>Findings</h2><p>Edited by Alex</p>' } });
    assert.equal(r.status, 200); assert.equal(r.body.document.updatedBy, 'Alex Jones'); assert.equal(r.body.document.canManage, false);
    assert.equal((await call('/api/documents/' + report.id, { cookie: alex.cookie, method: 'PUT', json: { version: 2, sharing: 'private' } })).status, 403);
    assert.equal((await call('/api/documents/' + report.id, { cookie: alex.cookie, method: 'DELETE' })).status, 403);
    r = await call('/api/documents/' + report.id + '/duplicate', { cookie: alex.cookie, method: 'POST' });
    assert.equal(r.status, 201); assert.equal(r.body.document.title, 'Report for HN Group (copy)'); assert.equal(r.body.document.canManage, true);
    assert.equal((await call('/api/documents/' + report.id, { cookie: owner.cookie, method: 'DELETE' })).status, 200);
    assert.equal((await call('/api/documents/' + report.id, { cookie: sam.cookie })).status, 404);

    // Private & confidential, permanent protection from deletion, and deleting several things at once.
    r = await call('/api/documents', { cookie: alex.cookie, json: { company: 'hn-group', template: 'termination' } });
    const hr = r.body.document;
    assert.equal(hr.confidential, true, 'termination letters start private & confidential');
    r = await call('/api/documents', { cookie: alex.cookie, json: { company: 'hn-group', template: 'memo', title: 'Keep forever', confidential: true } });
    let keep = r.body.document; assert.equal(keep.confidential, true); assert.equal(keep.canDelete, true);
    r = await call('/api/documents/' + keep.id, { cookie: alex.cookie, method: 'PUT', json: { version: keep.version, confidential: false } }); keep = r.body.document;
    assert.equal(keep.confidential, false);
    r = await call('/api/documents/' + keep.id, { cookie: alex.cookie, method: 'PUT', json: { version: keep.version, protected: true } }); keep = r.body.document;
    assert.equal(keep.protected, true); assert.equal(keep.canDelete, false);
    assert.equal((await call('/api/documents/' + keep.id, { cookie: alex.cookie, method: 'PUT', json: { version: keep.version, protected: false } })).status, 403, 'protection can’t be undone');
    assert.equal((await call('/api/documents/' + keep.id, { cookie: alex.cookie, method: 'DELETE' })).status, 403);
    assert.equal((await call('/api/documents/' + keep.id, { cookie: owner.cookie, method: 'DELETE' })).status, 403, 'not even an owner-level account can delete it');
    const sharedOfSam = made.find((d) => d.template === 'minutes' && d.company === 'hn-group');
    r = await call('/api/delete-many', { cookie: alex.cookie, json: { documents: [hr.id, keep.id, sharedOfSam.id, 'nope'], files: [file.id] } });
    assert.deepEqual(r.body.deleted, { documents: 1, files: 1 });
    assert.deepEqual(r.body.skipped.map((x) => x.reason).sort(), ['Not found.', 'Only the author can delete it.', 'Protected from deletion.']);
    assert.equal((await call('/api/documents/' + keep.id, { cookie: alex.cookie })).status, 200);
    assert.equal((await call('/api/documents/' + hr.id, { cookie: alex.cookie })).status, 404);

    // Download PDF: made on the server, with the fonts embedded, page numbers and no website address.
    r = await call('/api/documents/' + termination.id + '/pdf', { cookie: sam.cookie });
    assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/pdf');
    assert.match(r.headers.get('content-disposition'), /^attachment; filename="Termination%20letter%20for%20HN%20Group.pdf"/);
    const pdfText = r.body.toString('latin1');
    assert.ok(pdfText.startsWith('%PDF-1.7') && pdfText.trimEnd().endsWith('%%EOF'));
    assert.match(pdfText, /PlusJakartaSans-Regular/); assert.match(pdfText, /\/Subtype \/Image/);
    assert.equal((await call('/api/documents/' + secretDoc.id + '/pdf', { cookie: sam3.cookie })).status, 404, 'PDFs follow the same access rules');

    // Staff storage: everyone for people allowed to open any storage, only their grants for others.
    r = await call('/api/people', { cookie: owner.cookie });
    assert.equal(r.body.all, true); assert.deepEqual(r.body.people.map((p) => p.id).sort(), ['p-alex', 'p-sam']);
    people.sam.storageGrants = [{ personId: 'p-alex', name: 'Alex Jones', until: later(1) }];
    const sam4 = await signIn('sam');
    r = await call('/api/people', { cookie: sam4.cookie });
    assert.equal(r.body.all, false); assert.deepEqual(r.body.people.map((p) => p.id), ['p-alex']);

    // The staff portal's view of someone's storage: loopback with the service secret only, never through nginx.
    const svc = (p, headers) => call(p, { headers: { authorization: 'Bearer ' + secret, ...(headers || {}) } });
    assert.equal((await call('/api/service/storage/p-alex')).status, 404);
    assert.equal((await svc('/api/service/storage/p-alex', { 'x-real-ip': '203.0.113.9' })).status, 404, 'refused when it came through nginx');
    r = await svc('/api/service/storage/p-alex?by=Portal%20Person&byId=p-x');
    assert.equal(r.status, 200); assert.deepEqual(r.body.documents.map((d) => d.title).sort(), ['Alex private notes', 'Keep forever']);
    r = await svc('/api/service/documents/' + secretDoc.id + '/pdf?by=Portal%20Person&byId=p-x');
    assert.equal(r.status, 200); assert.ok(r.body.subarray(0, 5).toString() === '%PDF-');
    assert.equal((await svc('/api/service/documents/' + termination.id + '?by=x')).status, 404, 'only private storage');

    // Send for signing: a PDF of the document goes to HN Group Contracts over loopback, only for people with the permission.
    const contractDoc = (await call('/api/documents', { cookie: owner.cookie, json: { company: 'hn-group', template: 'contract' } })).body.document;
    assert.equal((await call('/api/me', { cookie: sam.cookie })).body.user.canSendContracts, false);
    assert.equal((await call('/api/me', { cookie: owner.cookie })).body.user.canSendContracts, true);
    assert.equal((await call('/api/documents/' + letter.id + '/send-for-signing', { cookie: sam.cookie, json: {} })).status, 403);
    r = await call('/api/documents/' + contractDoc.id + '/send-for-signing', { cookie: owner.cookie, json: {} });
    assert.equal(r.status, 200); assert.equal(r.body.url, 'https://contracts.example/contract/0b1c2d3e-4f50-4a61-8b72-938495a6b7c8');
    // Anything else answering on the Contracts port (an old service) gives a clear message, not its own error.
    stubBroken = true;
    r = await call('/api/documents/' + contractDoc.id + '/send-for-signing', { cookie: owner.cookie, json: {} });
    assert.equal(r.status, 503); assert.match(r.body.error, /isn’t running on this server/);
    stubBroken = false;
    const sent = imports.at(-2);
    assert.equal(sent.auth, 'Bearer ' + secret); assert.equal(sent.by.id, 'p-owner'); assert.deepEqual(sent.by.permissions, ['contracts.send', 'contracts.manage']);
    assert.equal(sent.title, 'Employee Agreement'); assert.equal(sent.docId, contractDoc.id); assert.ok(Buffer.from(sent.pdf, 'base64').subarray(0, 5).toString() === '%PDF-');

    // Everything survives a restart, the seed isn't added twice, and sign-out needs the site's own origin.
    child.kill(); await new Promise((res) => child.once('exit', res));
    child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: ['ignore', 'ignore', 'inherit'] });
    await ready();
    assert.equal((await call('/api/documents?scope=mine', { cookie: owner.cookie })).body.files.length, 1, 'seeded once');
    r = await call('/auth/logout', { cookie: alex.cookie, method: 'POST' });
    assert.equal(r.status, 302); assert.equal((await call('/api/me', { cookie: alex.cookie })).status, 401);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'documents.json'), 'utf8'));
    assert.ok(saved.audit.some((a) => a.action === 'opened storage' && a.of === 'p-alex' && a.byId === 'p-owner'), 'storage visits are logged');
    assert.ok(saved.audit.some((a) => a.action === 'opened storage' && a.by === 'Portal Person (staff portal)'), 'visits from the staff portal are logged');
    assert.ok(!JSON.stringify(saved.sessions).includes(sam.cookie.split('=')[1]), 'only hashes of sign-in tokens are kept');
  } finally {
    child.kill(); authServer.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
