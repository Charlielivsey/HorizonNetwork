'use strict';
// HN Group Contracts tests: sign-in through a stand-in HN Group Auth, the staff portal's permissions (send, manage,
// none, logged in as someone else), uploading, choosing signers, any order and one after another, a date to sign by,
// reading before signing, signing, declining, reminders, cancelling, the signing certificate, who can see what, the
// health check and HN Group Docs sending a document over loopback.
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
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

test('HN Group Contracts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-contracts-'));
  const secret = hex(); fs.writeFileSync(path.join(dir, 'secret'), secret);
  const PDF = fs.readFileSync(path.join(__dirname, '..', 'docs-site', 'seed', 'hn-group-merger-agreement.pdf'));
  const people = {
    hr: { id: 'p-hr', accountId: 'a-hr', email: 'hr@hngroup.org.uk', displayName: 'Harriet', firstName: 'Harriet', lastName: 'Reed', jobTitle: 'Head of People', permissions: ['contracts.send'] },
    jo: { id: 'p-jo', accountId: 'a-jo', email: 'jo@hngroup.org.uk', displayName: 'Jo', firstName: 'Jo', lastName: 'Bloggs', jobTitle: 'Designer', permissions: [] },
    joOther: { id: 'p-jo-2', accountId: 'a-jo', email: 'jo@hngroup.org.uk', displayName: 'Jo', firstName: 'Jo', lastName: 'Bloggs', jobTitle: 'Producer', permissions: [] },
    sam: { id: 'p-sam', accountId: 'a-sam', email: 'sam@hngroup.org.uk', displayName: 'Sam', firstName: 'Sam', lastName: 'Lee', jobTitle: 'Developer', permissions: [] },
    boss: { id: 'p-boss', accountId: 'a-boss', email: 'charlie@hngroup.org.uk', displayName: 'Charlie', firstName: 'Charlie', lastName: 'Livsey', jobTitle: 'Managing Director', ownerAccess: true, permissions: ['contracts.send', 'contracts.manage'] },
    fake: { id: 'p-jo', accountId: 'a-jo', email: 'jo@hngroup.org.uk', displayName: 'Jo', jobTitle: 'Designer', permissions: [], impersonated: true },
  };
  const codes = new Map(), sessions = new Map();
  const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const authServer = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
      const data = JSON.parse(b || '{}'), send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
      if (req.headers.authorization !== 'Bearer ' + secret) return send(401, { error: 'No.' });
      if (req.url === '/api/auth/staff-directory') return send(200, { people: [people.hr, people.jo, people.joOther, people.sam, people.boss].map((p) => ({ id: p.id, accountIds: [p.accountId], displayName: p.displayName, jobTitle: p.jobTitle, company: 'HN Group' })) });
      if (req.url === '/api/auth/directory-avatar') { if (data.id !== 'p-jo') return send(404, { error: 'None.' }); res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(PNG); }
      if (data.client_id !== 'contracts') return send(401, { error: 'No.' });
      if (req.url === '/api/sso/avatar') { if (sessions.get(data.session) !== 'hr') return send(404, { error: 'None.' }); res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(PNG); }
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
  const upload = (cookie, bytes = PDF, extra = {}) => call('/api/contracts', { cookie, method: 'POST', body: bytes, headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent('Employee Agreement.pdf'), 'X-Title': encodeURIComponent('Employee Agreement – Jo Bloggs'), ...extra } });
  const sign = (cookie, c, name = 'Jo Bloggs', extra = {}) => call('/api/contracts/' + c.id + '/sign', { cookie, json: { name, agree: true, sha256: c.file.sha256, ...extra } });
  const open = (cookie, c) => call('/api/contracts/' + c.id + '/file', { cookie });
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(SITE + '/healthz')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
    // The health check says what the site needs, and nothing private.
    let r = await call('/healthz');
    assert.deepEqual(r.body, { ok: true, service: 'hn-contracts', version: '2.0.0', checks: { data: true, auth: true, pages: true } });
    // Signed out: only the sign-in; pages are in the HN Group website theme.
    assert.equal((await call('/')).status, 302);
    assert.equal((await call('/api/contracts')).status, 401);
    r = await call('/nowhere'); assert.equal(r.status, 404); assert.match(r.body, /site\.css/); assert.match(r.body, /Page not found/);

    const hr = await signIn('hr'), jo = await signIn('jo'), sam = await signIn('sam'), boss = await signIn('boss');
    r = await call('/', { cookie: hr }); assert.match(r.body, /class="site-header"/); assert.match(r.body, /assets\/site\.css/);
    assert.deepEqual([(await call('/api/me', { cookie: hr })).body.canSend, (await call('/api/me', { cookie: jo })).body.canSend, (await call('/api/me', { cookie: jo })).body.canManage], [true, false, false]);

    // Profile pictures: your own from HN Group Auth, anyone else's from the staff list, never anything but an image.
    r = await call('/api/picture/p-hr', { cookie: hr }); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/png'); assert.deepEqual(r.body, PNG);
    r = await call('/api/picture/p-jo', { cookie: hr }); assert.equal(r.status, 200); assert.deepEqual(r.body, PNG);
    assert.equal((await call('/api/picture/p-sam', { cookie: hr })).status, 404, 'no picture, so the page shows initials');
    assert.equal((await call('/api/picture/p-hr')).status, 401, 'signed in only');
    assert.equal((await call('/api/me', { cookie: hr })).body.user.id, 'p-hr');

    // Only people with "Send contracts for signing" upload or see the staff list.
    assert.equal((await upload(jo)).status, 403);
    assert.equal((await call('/api/people', { cookie: jo })).status, 403);
    assert.equal((await upload(hr, Buffer.from('not a pdf'))).status, 400);
    assert.equal((await upload(hr, PDF, { origin: 'https://evil.example' })).status, 403, 'changes must come from the site');
    r = await upload(hr); assert.equal(r.status, 201);
    let c = r.body.contract;
    assert.equal(c.status, 'draft'); assert.equal(c.file.sha256, crypto.createHash('sha256').update(PDF).digest('hex'));
    assert.equal((await call('/api/contracts/' + c.id, { cookie: jo })).status, 404, 'nobody else sees a draft');
    assert.deepEqual((await call('/api/contracts', { cookie: hr })).body.drafts.map((x) => x.id), [c.id]);

    // A draft: signers from the staff list only, the order, a date to sign by.
    assert.equal((await call('/api/contracts/' + c.id, { cookie: hr, method: 'PUT', json: { signers: [{ id: 'nobody' }] } })).status, 400);
    assert.equal((await call('/api/contracts/' + c.id, { cookie: hr, method: 'PUT', json: { dueDate: '2001-01-01' } })).status, 400, 'not in the past');
    assert.equal((await call('/api/contracts/' + c.id, { cookie: sam, method: 'PUT', json: { signers: [{ id: 'p-sam' }] } })).status, 404, 'only the sender edits it');
    assert.equal((await call('/api/contracts/' + c.id + '/send', { cookie: hr, json: {} })).status, 400, 'needs someone to sign');
    r = await call('/api/contracts/' + c.id, { cookie: hr, method: 'PUT', json: { message: 'Please sign by Friday.', order: 'sequence', dueDate: tomorrow(), signers: [{ id: 'p-jo', role: 'Employee' }, { id: 'p-hr', role: 'On behalf of HN Group Limited' }] } });
    assert.equal(r.status, 200); assert.deepEqual(r.body.contract.signers.map((s) => s.name), ['Jo', 'Harriet']); assert.equal(r.body.contract.order, 'sequence');
    c = (await call('/api/contracts/' + c.id + '/send', { cookie: hr, json: {} })).body.contract;
    assert.equal(c.status, 'out');
    assert.equal((await call('/api/contracts/' + c.id, { cookie: hr, method: 'PUT', json: { title: 'Changed' } })).status, 409, 'a sent contract can’t change');

    // Jo sees it waiting; Sam can't see it at all.
    let jl = (await call('/api/contracts', { cookie: jo })).body;
    assert.deepEqual(jl.toSign.map((x) => x.id), [c.id]);
    assert.equal((await call('/api/contracts/' + c.id, { cookie: sam })).status, 404);
    // In order: Harriet can't sign before Jo.
    await open(hr, c);
    r = await sign(hr, c, 'Harriet Reed'); assert.equal(r.status, 409); assert.match(r.body.error, /in order/);
    assert.equal((await call('/api/contracts/' + c.id, { cookie: hr })).body.contract.can.waitingFor, 'Jo');
    // Reminders show on Jo's list.
    r = await call('/api/contracts/' + c.id + '/remind', { cookie: hr, json: {} }); assert.equal(r.status, 200);
    assert.equal((await call('/api/contracts', { cookie: jo })).body.toSign[0].reminded, true);
    assert.equal((await call('/api/contracts/' + c.id + '/remind', { cookie: jo, json: {} })).status, 409, 'only the sender reminds');
    // Jo must open it first, can't sign as someone else, must agree, and must have the same file.
    const fake = await signIn('fake');
    r = await sign(jo, c); assert.equal(r.status, 409); assert.match(r.body.error, /Open and read/);
    r = await open(jo, c); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/pdf'); assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal((await sign(fake, c)).status, 403, 'not while logged in as someone else');
    assert.equal((await sign(jo, c, 'Jo Bloggs', { agree: false })).status, 400, 'has to agree');
    assert.equal((await sign(jo, c, 'Jo Bloggs', { sha256: 'x' })).status, 409, 'the file they read');
    r = await sign(jo, c, 'Jo Bloggs', {}); assert.equal(r.status, 200);
    assert.equal(r.body.contract.signers[0].signature, 'Jo Bloggs'); assert.equal(r.body.contract.status, 'out');
    assert.equal((await sign(jo, c)).status, 409, 'once');
    assert.equal((await call('/api/contracts/' + c.id + '/certificate', { cookie: hr })).status, 404, 'no certificate until everyone has signed');
    r = await sign(hr, c, 'Harriet Reed'); assert.equal(r.body.contract.status, 'completed'); assert.ok(r.body.contract.certificate);
    r = await call('/api/contracts/' + c.id + '/certificate', { cookie: jo }); assert.equal(r.status, 200); assert.equal(r.body.subarray(0, 5).toString(), '%PDF-');
    assert.equal((await call('/api/contracts/' + c.id + '/cancel', { cookie: hr, json: {} })).status, 409, 'a finished contract can’t be cancelled');
    jl = (await call('/api/contracts', { cookie: jo })).body;
    assert.deepEqual([jl.toSign.length, jl.completed.map((x) => x.id)], [0, [c.id]]);
    // Someone who manages contracts sees everything; others don't get that list.
    assert.ok((await call('/api/contracts', { cookie: boss })).body.everything.some((x) => x.id === c.id));
    assert.equal((await call('/api/contracts', { cookie: hr })).body.everything, null);

    // Any order, signing from another profile of the same sign-in account, declining and cancelling.
    c = (await upload(hr)).body.contract;
    await call('/api/contracts/' + c.id, { cookie: hr, method: 'PUT', json: { signers: [{ id: 'p-jo-2' }, { id: 'p-sam' }] } });
    await call('/api/contracts/' + c.id + '/send', { cookie: hr, json: {} });
    assert.equal((await call('/api/contracts', { cookie: jo })).body.toSign.length, 1, 'Jo’s other profile, same account');
    assert.equal((await call('/api/contracts', { cookie: sam })).body.toSign.length, 1, 'any order: Sam can sign straight away');
    assert.equal((await call('/api/contracts/' + c.id + '/decline', { cookie: jo, json: { reason: '' } })).status, 400);
    r = await call('/api/contracts/' + c.id + '/decline', { cookie: jo, json: { reason: 'The start date is wrong.' } });
    assert.equal(r.body.contract.status, 'declined');
    assert.equal((await call('/api/contracts/' + c.id + '/cancel', { cookie: hr, json: {} })).body.contract.status, 'cancelled');
    c = (await upload(hr)).body.contract;
    assert.deepEqual((await call('/api/contracts/' + c.id + '/cancel', { cookie: hr, json: {} })).body, { deleted: true }, 'a draft is deleted outright');

    // HN Group Docs sends documents over loopback with the service secret, never through nginx.
    const importBody = (by) => JSON.stringify({ by, title: 'Employee Agreement', fileName: 'Employee Agreement.pdf', docId: crypto.randomUUID(), pdf: PDF.toString('base64') });
    const service = (json, headers = {}) => call('/api/service/import', { method: 'POST', origin: false, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret, ...headers }, body: json });
    assert.equal((await service(importBody({ id: 'p-hr', permissions: ['contracts.send'] }), { 'X-Real-IP': '1.2.3.4' })).status, 404);
    assert.equal((await service(importBody({ id: 'p-hr', permissions: ['contracts.send'] }), { Authorization: 'Bearer ' + hex() })).status, 404);
    assert.equal((await service(importBody({ id: 'p-jo', accountId: 'a-jo', displayName: 'Jo', permissions: [] }))).status, 403, 'Docs users need the permission too');
    r = await service(importBody({ id: 'p-hr', accountId: 'a-hr', displayName: 'Harriet', permissions: ['contracts.send'] }));
    assert.equal(r.status, 201); assert.match(r.body.url, /\/contract\/[0-9a-f-]{36}$/);
    const imported = (await call('/api/contracts/' + r.body.id, { cookie: hr })).body.contract;
    assert.deepEqual([imported.source.kind, imported.status], ['docs', 'draft']);
    // Sign-out needs the site's own origin.
    r = await call('/auth/logout', { cookie: jo, method: 'POST' }); assert.equal(r.status, 302); assert.equal((await call('/api/me', { cookie: jo })).status, 401);
  } finally {
    child.kill(); authServer.close(); fs.rmSync(dir, { recursive: true, force: true });
  }
});
