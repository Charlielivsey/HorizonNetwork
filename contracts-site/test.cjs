'use strict';
// HN Group Contracts tests: sign-in through a stand-in HN Group Auth, the staff portal's permissions (send, manage,
// none, logged in as someone else), uploading, choosing signers, reading before signing, signing, declining,
// cancelling, the signing certificate, who can see what, and HN Group Docs sending a document over loopback.
//   node --test contracts-site/test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const freePort = () => new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const hex = () => crypto.randomBytes(32).toString('hex');

test('HN Group Contracts: send, sign, certificate and permissions', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-contracts-'));
  const secret = hex(); fs.writeFileSync(path.join(dir, 'secret'), secret);
  const PDF = fs.readFileSync(path.join(__dirname, '..', 'docs-site', 'seed', 'hn-group-merger-agreement.pdf'));
  const people = {
    hr: { id: 'p-hr', accountId: 'a-hr', email: 'hr@hngroup.org.uk', displayName: 'Harriet', firstName: 'Harriet', lastName: 'Reed', jobTitle: 'Head of People', permissions: ['contracts.send'] },
    jo: { id: 'p-jo', accountId: 'a-jo', email: 'jo@hngroup.org.uk', displayName: 'Jo', firstName: 'Jo', lastName: 'Bloggs', jobTitle: 'Designer', permissions: [] },
    // Jo's other profile (another company on her staff record) uses the same sign-in account.
    joOther: { id: 'p-jo-2', accountId: 'a-jo', email: 'jo@hngroup.org.uk', displayName: 'Jo', firstName: 'Jo', lastName: 'Bloggs', jobTitle: 'Producer', permissions: [] },
    sam: { id: 'p-sam', accountId: 'a-sam', email: 'sam@hngroup.org.uk', displayName: 'Sam', firstName: 'Sam', lastName: 'Lee', jobTitle: 'Developer', permissions: [] },
    boss: { id: 'p-boss', accountId: 'a-boss', email: 'charlie@hngroup.org.uk', displayName: 'Charlie', firstName: 'Charlie', lastName: 'Livsey', jobTitle: 'Managing Director', ownerAccess: true, permissions: ['contracts.send', 'contracts.manage'] },
    fake: { id: 'p-jo', accountId: 'a-jo', email: 'jo@hngroup.org.uk', displayName: 'Jo', jobTitle: 'Designer', permissions: [], impersonated: true },
  };
  const codes = new Map(), sessions = new Map();
  const authServer = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      const data = JSON.parse(body || '{}'), send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
      if (req.headers.authorization !== 'Bearer ' + secret) return send(401, { error: 'No.' });
      if (req.url === '/api/auth/staff-directory') return send(200, { people: [people.hr, people.jo, people.joOther, people.sam, people.boss].map((p) => ({ id: p.id, accountIds: [p.accountId], displayName: p.displayName, jobTitle: p.jobTitle, company: 'HN Group' })) });
      if (data.client_id !== 'contracts') return send(401, { error: 'No.' });
      if (req.url === '/api/sso/exchange') { const g = codes.get(data.code); codes.delete(data.code); if (!g || g.state !== data.state) return send(401, { error: 'Expired.' }); const s = hex(); sessions.set(s, g.who); return send(200, { session: s, expires: Date.now() + 3600000, user: people[g.who] }); }
      if (req.url === '/api/sso/session') { const who = sessions.get(data.session); return who ? send(200, { session: data.session, user: people[who] }) : send(401, { error: 'Expired.' }); }
      send(404, { error: 'Not found' });
    });
  });
  await new Promise((r) => authServer.listen(0, '127.0.0.1', r));
  const port = await freePort(), SITE = 'http://127.0.0.1:' + port, A = 'http://127.0.0.1:' + authServer.address().port;
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', CONTRACTS_DATA_DIR: path.join(dir, 'data'), CONTRACTS_ORIGIN: SITE, AUTH_ORIGIN: 'https://auth.example', AUTH_BACKEND: A, STAFF_BACKEND: A, STATUS_SSO_SECRET_FILE: path.join(dir, 'secret') }, stdio: ['ignore', 'ignore', 'inherit'] });
  const call = async (p, o = {}) => {
    const headers = { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.origin === false ? {} : (o.method && o.method !== 'GET') || o.json ? { origin: SITE } : {}), ...(o.headers || {}) };
    const r = await fetch(SITE + p, { method: o.method || (o.json ? 'POST' : 'GET'), headers, body: o.json ? JSON.stringify(o.json) : o.body, redirect: 'manual' });
    const type = r.headers.get('content-type') || '';
    return { status: r.status, body: type.startsWith('application/json') ? await r.json() : type.startsWith('text') ? await r.text() : Buffer.from(await r.arrayBuffer()), headers: r.headers };
  };
  const cookieOf = (r, name) => (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map((c) => c.split(';')[0]).find((c) => c.startsWith(name + '='));
  const signIn = async (who) => {
    const start = await call('/auth/login');
    const location = new URL(start.headers.get('location')); assert.equal(location.searchParams.get('client_id'), 'contracts');
    const state = location.searchParams.get('state'), code = hex(); codes.set(code, { state, who });
    const back = await call('/auth/callback?code=' + code + '&state=' + state, { cookie: cookieOf(start, 'hn_contracts_state') });
    assert.equal(back.status, 302); return cookieOf(back, 'hn_contracts_session');
  };
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(SITE + '/healthz')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
    // Signed out: only the sign-in.
    assert.equal((await call('/')).status, 302);
    assert.equal((await call('/api/contracts')).status, 401);
    const hr = await signIn('hr'), jo = await signIn('jo'), sam = await signIn('sam'), boss = await signIn('boss');
    assert.match((await call('/', { cookie: hr })).body, /id="main"/);
    assert.deepEqual((await call('/api/me', { cookie: hr })).body.canSend, true);
    assert.deepEqual([(await call('/api/me', { cookie: jo })).body.canSend, (await call('/api/me', { cookie: jo })).body.canManage], [false, false]);

    // Only people with "Send contracts for signing" can upload or see the staff list.
    const upload = (cookie, bytes, extra = {}) => call('/api/contracts', { cookie, method: 'POST', body: bytes, headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent('Employee Agreement.pdf'), 'X-Title': encodeURIComponent('Employee Agreement – Jo Bloggs'), ...extra } });
    assert.equal((await upload(jo, PDF)).status, 403);
    assert.equal((await call('/api/people', { cookie: jo })).status, 403);
    assert.equal((await upload(hr, Buffer.from('not a pdf'))).status, 400);
    assert.equal((await upload(hr, PDF, { origin: 'https://evil.example' })).status, 403, 'changes must come from the site');
    let r = await upload(hr, PDF);
    assert.equal(r.status, 201); let c = r.body.contract;
    assert.equal(c.status, 'draft'); assert.equal(c.file.sha256, crypto.createHash('sha256').update(PDF).digest('hex'));
    assert.equal((await call('/api/contracts/' + c.id, { cookie: jo })).status, 404, 'nobody else sees a draft');
    assert.ok((await call('/api/people', { cookie: hr })).body.people.some((p) => p.id === 'p-jo'));

    // Choose who signs (from the staff list only) and send it.
    assert.equal((await call('/api/contracts/' + c.id, { cookie: hr, method: 'PUT', json: { signers: [{ id: 'nobody' }] } })).status, 400);
    assert.equal((await call('/api/contracts/' + c.id, { cookie: sam, method: 'PUT', json: { signers: [{ id: 'p-sam' }] } })).status, 404, 'only the sender edits it');
    r = await call('/api/contracts/' + c.id, { cookie: hr, method: 'PUT', json: { message: 'Please sign by Friday.', signers: [{ id: 'p-jo', role: 'Employee' }, { id: 'p-hr', role: 'On behalf of HN Group Limited' }] } });
    assert.equal(r.status, 200); assert.deepEqual(r.body.contract.signers.map((s) => s.name), ['Jo', 'Harriet']);
    r = await call('/api/contracts/' + c.id + '/send', { cookie: hr, json: {} }); assert.equal(r.body.contract.status, 'out');
    assert.equal((await call('/api/contracts/' + c.id, { cookie: hr, method: 'PUT', json: { title: 'Changed' } })).status, 409, 'a sent contract can’t change');

    // Jo sees it waiting; Sam doesn't.
    assert.deepEqual((await call('/api/contracts', { cookie: jo })).body.toSign.map((x) => x.id), [c.id]);
    assert.equal((await call('/api/contracts/' + c.id, { cookie: sam })).status, 404);
    // Logged in as Jo by someone else: can look, can't sign.
    const fake = await signIn('fake');
    // Must read it first.
    r = await call('/api/contracts/' + c.id + '/sign', { cookie: jo, json: { name: 'Jo Bloggs', agree: true, sha256: c.file.sha256 } });
    assert.equal(r.status, 409); assert.match(r.body.error, /Open and read/);
    r = await call('/api/contracts/' + c.id + '/file', { cookie: jo });
    assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/pdf'); assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal((await call('/api/contracts/' + c.id + '/sign', { cookie: fake, json: { name: 'Jo Bloggs', agree: true, sha256: c.file.sha256 } })).status, 403, 'not while logged in as someone else');
    assert.equal((await call('/api/contracts/' + c.id + '/sign', { cookie: jo, json: { name: 'Jo Bloggs', agree: false, sha256: c.file.sha256 } })).status, 400, 'has to agree');
    assert.equal((await call('/api/contracts/' + c.id + '/sign', { cookie: jo, json: { name: 'Jo Bloggs', agree: true, sha256: 'x' } })).status, 409, 'the file they read');
    r = await call('/api/contracts/' + c.id + '/sign', { cookie: jo, json: { name: 'Jo Bloggs', agree: true, sha256: c.file.sha256 }, headers: { 'X-Real-IP': '203.0.113.9' } });
    assert.equal(r.status, 200); assert.equal(r.body.contract.signers[0].signature, 'Jo Bloggs'); assert.equal(r.body.contract.status, 'out');
    assert.equal((await call('/api/contracts/' + c.id + '/sign', { cookie: jo, json: { name: 'Jo Bloggs', agree: true, sha256: c.file.sha256 } })).status, 409, 'once');
    assert.equal((await call('/api/contracts/' + c.id + '/certificate', { cookie: hr })).status, 404, 'no certificate until everyone has signed');
    await call('/api/contracts/' + c.id + '/file', { cookie: hr });
    r = await call('/api/contracts/' + c.id + '/sign', { cookie: hr, json: { name: 'Harriet Reed', agree: true, sha256: c.file.sha256 } });
    assert.equal(r.body.contract.status, 'completed'); assert.ok(r.body.contract.certificate);
    r = await call('/api/contracts/' + c.id + '/certificate', { cookie: jo });
    assert.equal(r.status, 200); assert.ok(r.body.subarray(0, 5).toString() === '%PDF-');
    assert.equal((await call('/api/contracts/' + c.id + '/cancel', { cookie: hr, json: {} })).status, 409, 'a finished contract can’t be cancelled');
    assert.deepEqual((await call('/api/contracts', { cookie: jo })).body.signed.map((x) => x.id), [c.id]);
    // Someone who manages contracts sees everything.
    assert.ok((await call('/api/contracts', { cookie: boss })).body.everyone.some((x) => x.id === c.id));
    assert.equal((await call('/api/contracts', { cookie: hr })).body.everyone, null);

    // Signing from another profile of the same sign-in account works; declining and cancelling.
    c = (await upload(hr, PDF)).body.contract;
    await call('/api/contracts/' + c.id, { cookie: hr, method: 'PUT', json: { signers: [{ id: 'p-jo-2' }] } });
    await call('/api/contracts/' + c.id + '/send', { cookie: hr, json: {} });
    assert.equal((await call('/api/contracts', { cookie: jo })).body.toSign.length, 1, 'Jo’s other profile, same account');
    assert.equal((await call('/api/contracts/' + c.id + '/decline', { cookie: jo, json: { reason: '' } })).status, 400);
    r = await call('/api/contracts/' + c.id + '/decline', { cookie: jo, json: { reason: 'The start date is wrong.' } });
    assert.equal(r.body.contract.status, 'declined');
    assert.equal((await call('/api/contracts/' + c.id + '/cancel', { cookie: hr, json: {} })).body.contract.status, 'cancelled');
    // A draft is deleted outright.
    c = (await upload(hr, PDF)).body.contract;
    assert.deepEqual((await call('/api/contracts/' + c.id + '/cancel', { cookie: hr, json: {} })).body, { deleted: true });

    // HN Group Docs sends documents over loopback with the service secret, never through nginx.
    const importBody = (by) => ({ by, title: 'Employee Agreement', fileName: 'Employee Agreement.pdf', docId: crypto.randomUUID(), pdf: PDF.toString('base64') });
    const service = (json, headers = {}) => call('/api/service/import', { method: 'POST', origin: false, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret, ...headers }, body: JSON.stringify(json) });
    assert.equal((await service(importBody({ id: 'p-hr', accountId: 'a-hr', displayName: 'Harriet', permissions: ['contracts.send'] }), { 'X-Real-IP': '1.2.3.4' })).status, 404);
    assert.equal((await service(importBody({ id: 'p-hr', permissions: ['contracts.send'] }), { Authorization: 'Bearer ' + hex() })).status, 404);
    assert.equal((await service(importBody({ id: 'p-jo', accountId: 'a-jo', displayName: 'Jo', permissions: [] }))).status, 403, 'Docs users need the permission too');
    r = await service(importBody({ id: 'p-hr', accountId: 'a-hr', displayName: 'Harriet', permissions: ['contracts.send'] }));
    assert.equal(r.status, 201); assert.ok(r.body.url.endsWith('/contract/' + r.body.id));
    const imported = (await call('/api/contracts/' + r.body.id, { cookie: hr })).body.contract;
    assert.equal(imported.source.kind, 'docs'); assert.equal(imported.status, 'draft');
  } finally {
    child.kill(); authServer.close(); fs.rmSync(dir, { recursive: true, force: true });
  }
});
