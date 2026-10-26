'use strict';
// HN Group Documents tests: staff sign-in through a stand-in HN Group Auth, every template for every company,
// filtering by company, type and author, saving with version checks, cleaning of document HTML, private documents,
// who may delete or change sharing, duplicating, and that nothing but the sign-in assets is served signed out.
//   node --test documents-site/test.cjs
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

test('every template starts filled in for every company', () => {
  for (const c of catalog.COMPANIES) {
    assert.ok(fs.existsSync(path.join(__dirname, 'public', 'assets', 'brand', c.logo + '.svg')), c.logo);
    assert.ok(fs.existsSync(path.join(__dirname, 'public', 'assets', 'brand', c.logo + '-white.svg')), c.logo + '-white');
    for (const t of catalog.TEMPLATES) {
      const s = catalog.start(t, c, 'Sam Taylor', new Date('2026-10-26T12:00:00Z'));
      assert.ok(!/\{(company|legal|about)\}/.test(s.body + JSON.stringify(s.fields)), t.id + ' fills every placeholder');
      if (t.id === 'letter') { assert.equal(s.fields.senderName, 'Sam Taylor'); assert.equal(s.fields.date, '26 October 2026'); assert.equal(s.fields.senderCompany, c.legal); }
      if (t.id === 'press') assert.ok(s.body.includes(c.about.replace(/&/g, '&amp;')));
    }
  }
});

test('HN Group Documents: sign-in, templates, filters, editing and permissions', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-documents-'));
  const secret = hex(); fs.writeFileSync(path.join(dir, 'secret'), secret);
  const people = {
    sam: { id: 'p-sam', email: 'sam@hngroup.org.uk', displayName: 'Sam Taylor', statusAdminAllowed: false, ownerAccess: false },
    alex: { id: 'p-alex', email: 'alex@hngroup.org.uk', displayName: 'Alex Jones', statusAdminAllowed: false, ownerAccess: false },
    owner: { id: 'p-owner', email: 'charlie@hngroup.org.uk', displayName: 'Charlie', ownerAccess: true },
  };
  const codes = new Map(), sessions = new Map();
  const authServer = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      const data = JSON.parse(body || '{}'), send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
      if (req.headers.authorization !== 'Bearer ' + secret || data.client_id !== 'documents') return send(401, { error: 'No.' });
      if (req.url === '/api/sso/exchange') { const g = codes.get(data.code); codes.delete(data.code); if (!g || g.state !== data.state) return send(401, { error: 'Expired.' }); const s = hex(); sessions.set(s, g.who); return send(200, { session: s, expires: Date.now() + 3600000, user: people[g.who] }); }
      if (req.url === '/api/sso/session') { const who = sessions.get(data.session); return who ? send(200, { session: data.session, user: people[who] }) : send(401, { error: 'Expired.' }); }
      send(404, { error: 'Not found' });
    });
  });
  await new Promise((r) => authServer.listen(0, '127.0.0.1', r));
  const port = await freePort(), SITE = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DOCUMENTS_DATA_DIR: path.join(dir, 'data'), DOCUMENTS_ORIGIN: SITE, AUTH_ORIGIN: 'https://auth.example', AUTH_BACKEND: 'http://127.0.0.1:' + authServer.address().port, STATUS_SSO_SECRET_FILE: path.join(dir, 'secret') }, stdio: ['ignore', 'ignore', 'inherit'] });
  const call = async (p, o = {}) => {
    const headers = { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.origin === false ? {} : typeof o.origin === 'string' ? { origin: o.origin } : o.method && o.method !== 'GET' || o.json ? { origin: SITE } : {}) };
    const r = await fetch(SITE + p, { method: o.method || (o.json ? 'POST' : 'GET'), headers, body: o.json ? JSON.stringify(o.json) : undefined, redirect: 'manual' });
    const type = r.headers.get('content-type') || '';
    return { status: r.status, body: type.startsWith('application/json') ? await r.json() : await r.text(), headers: r.headers };
  };
  const cookieOf = (r, name) => (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map((c) => c.split(';')[0]).find((c) => c.startsWith(name + '='));
  const signIn = async (who, next) => {
    const start = await call('/auth/login' + (next ? '?next=' + encodeURIComponent(next) : ''));
    const location = new URL(start.headers.get('location')); assert.equal(location.searchParams.get('client_id'), 'documents');
    const state = location.searchParams.get('state'), code = hex(); codes.set(code, { state, who });
    const back = await call('/auth/callback?code=' + code + '&state=' + state, { cookie: cookieOf(start, 'hn_documents_state') });
    assert.equal(back.status, 302); return { cookie: cookieOf(back, 'hn_documents_session'), location: back.headers.get('location') };
  };
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(SITE + '/healthz')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
    // Signed out: straight to HN Group Auth; only the sign-in page's assets are public.
    let r = await call('/templates');
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/auth/login?next=%2Ftemplates');
    assert.equal((await call('/api/me')).status, 401);
    assert.equal((await call('/assets/documents.js')).status, 401);
    assert.equal((await call('/assets/brand/horizon-media-group-logo.svg')).status, 401);
    assert.equal((await call('/assets/documents.css')).status, 200);
    assert.equal((await call('/assets/brand/hn-group-wordmark.svg')).status, 200);
    assert.equal((await call('/assets/../server.js')).status, 302);

    const sam = await signIn('sam', '/templates');
    assert.equal(sam.location, '/templates', 'signing in returns to the page asked for');
    r = await call('/doc/' + crypto.randomUUID(), { cookie: sam.cookie });
    assert.equal(r.status, 200); assert.match(r.body, /id="view-editor"/); assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal((await call('/assets/documents.js', { cookie: sam.cookie })).status, 200);
    const me = (await call('/api/me', { cookie: sam.cookie })).body;
    assert.equal(me.user.name, 'Sam Taylor'); assert.equal(me.companies.length, catalog.COMPANIES.length); assert.equal(me.templates.length, catalog.TEMPLATES.length);
    assert.ok(!('body' in me.templates[0]), 'starting text stays on the server');

    // Every template for every company.
    const made = [];
    for (const c of catalog.COMPANIES) for (const t of catalog.TEMPLATES) {
      r = await call('/api/documents', { cookie: sam.cookie, json: { company: c.id, template: t.id, title: t.name + ' for ' + c.name } });
      assert.equal(r.status, 201, JSON.stringify(r.body)); made.push(r.body.document);
      assert.equal(r.body.document.company, c.id); assert.equal(r.body.document.status, 'draft'); assert.equal(r.body.document.version, 1);
    }
    assert.equal((await call('/api/documents', { cookie: sam.cookie, json: { company: 'nope', template: 'letter' } })).status, 400);
    assert.equal((await call('/api/documents', { cookie: sam.cookie, json: { company: 'hn-group', template: 'letter' }, origin: 'https://evil.example' })).status, 403, 'changes must come from the site');

    // Filters.
    let list = (await call('/api/documents?company=horizon-network', { cookie: sam.cookie })).body;
    assert.equal(list.documents.length, catalog.TEMPLATES.length); assert.ok(list.documents.every((d) => d.company === 'horizon-network' && !('body' in d)));
    assert.equal(list.counts['horizon-media-group'], catalog.TEMPLATES.length);
    list = (await call('/api/documents?template=memo', { cookie: sam.cookie })).body;
    assert.equal(list.documents.length, catalog.COMPANIES.length);
    list = (await call('/api/documents?q=' + encodeURIComponent('press release advertising'), { cookie: sam.cookie })).body;
    assert.deepEqual(list.documents.map((d) => d.title), ['Press release for Horizon Advertising']);

    // Editing: fields, body (cleaned), company; stale versions are refused.
    const letter = made.find((d) => d.template === 'letter' && d.company === 'hn-group');
    assert.equal(letter.fields.senderName, 'Sam Taylor'); assert.match(letter.body, /Dear/);
    r = await call('/api/documents/' + letter.id, { cookie: sam.cookie, method: 'PUT', json: { version: 1, title: 'Welcome\nletter', fields: { recipient: 'Jo Bloggs\n1 High Street', reference: 'HN/1', evil: 'x' }, body: '<p>Hello<script>alert(1)</script></p>', company: 'horizon-network' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.document.title, 'Welcome letter'); assert.equal(r.body.document.body, '<p>Hello</p>'); assert.equal(r.body.document.company, 'horizon-network');
    assert.equal(r.body.document.fields.recipient, 'Jo Bloggs\n1 High Street'); assert.ok(!('evil' in r.body.document.fields)); assert.equal(r.body.document.version, 2);
    r = await call('/api/documents/' + letter.id, { cookie: sam.cookie, method: 'PUT', json: { version: 1, title: 'Old' } });
    assert.equal(r.status, 409); assert.match(r.body.error, /Sam Taylor changed this document/);
    r = await call('/api/documents/' + letter.id, { cookie: sam.cookie, method: 'PUT', json: { version: 2, status: 'final' } });
    assert.equal(r.body.document.status, 'final');

    // Another member of staff sees shared documents and can edit them, but not private ones; only the author or an
    // owner-level account deletes or changes sharing.
    const alex = await signIn('alex');
    const memo = made.find((d) => d.template === 'memo' && d.company === 'hn-group');
    r = await call('/api/documents/' + memo.id, { cookie: sam.cookie, method: 'PUT', json: { version: 1, sharing: 'private' } });
    assert.equal(r.body.document.sharing, 'private');
    assert.equal((await call('/api/documents/' + memo.id, { cookie: alex.cookie })).status, 404);
    assert.ok(!(await call('/api/documents', { cookie: alex.cookie })).body.documents.some((d) => d.id === memo.id));
    const report = made.find((d) => d.template === 'report' && d.company === 'hn-group');
    r = await call('/api/documents/' + report.id, { cookie: alex.cookie, method: 'PUT', json: { version: 1, body: '<h2>Findings</h2><p>Edited by Alex</p>' } });
    assert.equal(r.status, 200); assert.equal(r.body.document.updatedBy, 'Alex Jones'); assert.equal(r.body.document.canManage, false);
    assert.equal((await call('/api/documents/' + report.id, { cookie: alex.cookie, method: 'PUT', json: { version: 2, sharing: 'private' } })).status, 403);
    assert.equal((await call('/api/documents/' + report.id, { cookie: alex.cookie, method: 'DELETE' })).status, 403);
    r = await call('/api/documents/' + report.id + '/duplicate', { cookie: alex.cookie, method: 'POST' });
    assert.equal(r.status, 201); assert.equal(r.body.document.title, 'Report for HN Group (copy)'); assert.equal(r.body.document.canManage, true); assert.match(r.body.document.body, /Edited by Alex/);
    assert.equal((await call('/api/documents?mine=1', { cookie: alex.cookie })).body.documents.length, 1);
    const owner = await signIn('owner');
    assert.equal((await call('/api/documents/' + memo.id, { cookie: owner.cookie })).status, 200, 'owner-level accounts see private documents');
    assert.equal((await call('/api/documents/' + report.id, { cookie: owner.cookie, method: 'DELETE' })).status, 200);
    assert.equal((await call('/api/documents/' + report.id, { cookie: sam.cookie })).status, 404);

    // Sign-ins and documents survive a restart; sign-out needs the site's own origin.
    r = await call('/auth/logout', { cookie: alex.cookie, method: 'POST' });
    assert.equal(r.status, 302); assert.equal((await call('/api/me', { cookie: alex.cookie })).status, 401);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'documents.json'), 'utf8'));
    assert.equal(Object.keys(saved.documents).length, made.length);
    assert.ok(saved.audit.some((a) => a.action === 'deleted'));
    assert.ok(!JSON.stringify(saved.sessions).includes(sam.cookie.split('=')[1]), 'only hashes of sign-in tokens are kept');
  } finally {
    child.kill(); authServer.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
