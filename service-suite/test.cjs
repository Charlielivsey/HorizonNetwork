'use strict';
// Engine tests with a stand-in HN Group Auth. Uses temporary installs and data only.
//   node --test service-suite/test.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const catalog = require('./catalog.json');

async function freePort() { const s = http.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }

// Stand-in Auth: code a…a = administrator, b…b = ordinary staff, c…c = second ordinary staff.
const USERS = { a: { id: 'p-admin', displayName: 'Admin Fixture', email: 'admin@example.test', statusAdminAllowed: true }, b: { id: 'p-staff', displayName: 'Staff Fixture', email: 'staff@example.test', statusAdminAllowed: false }, c: { id: 'p-other', displayName: 'Other Fixture', email: 'other@example.test', statusAdminAllowed: false } };
const bridgeCalls = [];
let authServer, authPort, secretFile, tmp;
async function startAuth() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-service-test-'));
  secretFile = path.join(tmp, 'secret'); fs.writeFileSync(secretFile, 'd'.repeat(64));
  const sessions = new Map();
  authServer = http.createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    const data = raw ? JSON.parse(raw) : {};
    const send = (s, v) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v)); };
    if (req.headers.authorization !== 'Bearer ' + 'd'.repeat(64)) return send(401, { error: 'no' });
    if (req.url === '/api/sso/exchange') { const key = data.code[0]; const session = key.repeat(32) + 'f'.repeat(32); sessions.set(session, USERS[key]); return send(200, { session, expires: Date.now() + 3600000, user: USERS[key] }); }
    if (req.url === '/api/sso/session') { const u = sessions.get(data.session); return u ? send(200, { session: data.session, expires: Date.now() + 3600000, user: u }) : send(401, { error: 'expired' }); }
    if (req.url === '/api/sso/avatar') return send(404, { error: 'none' });
    if (req.url === '/api/sso/staff') {
      bridgeCalls.push(data);
      if (data.path.startsWith('/api/expenses') && data.method === 'GET' && data.path.includes('/receipt')) { res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="r.pdf"' }); return res.end('%PDF-1.4 receipt'); }
      if (data.path === '/api/expenses' && data.method === 'GET') return send(200, { mine: [{ id: '0123456789abcdef', date: '2026-10-01', category: 'Travel', description: 'Train', amount: 12.5, status: 'submitted', statusLabel: 'Waiting for approval', canCancel: true, receipt: { fileName: 'r.pdf' } }], toApprove: [], all: [], canPay: false });
      if (data.path === '/api/bills' && data.method === 'POST') return send(201, { ok: true });
      if (data.path === '/api/training' && data.method === 'POST') return send(201, { ok: true });
      return send(200, { ok: true, echo: data.path });
    }
    send(404, { error: 'not found' });
  });
  authPort = await freePort();
  await new Promise(r => authServer.listen(authPort, '127.0.0.1', r));
}

// Mirrors service-suite/install.sh: shared runtime + the site's own config and assets.
function installDir(id) {
  const dir = path.join(tmp, 'opt-' + id);
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'server.js'), path.join(dir, 'server.js'));
  for (const f of fs.readdirSync(path.join(__dirname, 'lib'))) fs.copyFileSync(path.join(__dirname, 'lib', f), path.join(dir, 'lib', f));
  fs.cpSync(path.join(__dirname, 'public'), path.join(dir, 'public'), { recursive: true });
  fs.cpSync(path.join(ROOT, id + '-site/public'), path.join(dir, 'public'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, id + '-site/config.json'), path.join(dir, 'config.json'));
  return dir;
}
async function startSite(id, dataDir) {
  const dir = installDir(id), port = await freePort();
  const child = spawn(process.execPath, [path.join(dir, 'server.js')], { env: { ...process.env, PORT: String(port), DATA_DIR: dataDir || path.join(tmp, 'data-' + id), AUTH_BACKEND: 'http://127.0.0.1:' + authPort, STATUS_SSO_SECRET_FILE: secretFile }, stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = ''; child.stderr.on('data', c => { errors += c; });
  for (let n = 0; n < 200; n++) { try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 25)); if (n === 199) throw new Error(id + ' did not start: ' + errors); }
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  const origin = 'https://' + config.domain;
  const site = {
    id, port, config, child, errors: () => errors,
    async stop() { child.kill(); await new Promise(r => child.once('exit', r)); },
    client() {
      const jar = new Map();
      const cookie = () => [...jar].map(([k, v]) => k + '=' + v).join('; ');
      const keep = res => { for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const i = pair.indexOf('='); const k = pair.slice(0, i), v = pair.slice(i + 1); if (/Max-Age=0/.test(c)) jar.delete(k); else jar.set(k, v); } return res; };
      const call = async (route, opts = {}) => keep(await fetch(`http://127.0.0.1:${port}${route}`, { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), redirect: 'manual', headers: { Cookie: cookie(), ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(opts.method === 'POST' || opts.body !== undefined ? { Origin: opts.origin || origin } : {}) }, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined }));
      const api = async (route, body, opts = {}) => { const res = await call(route, { body, ...opts }); const value = await res.json().catch(() => ({})); return { status: res.status, value, res }; };
      return {
        call, api, jar,
        async staff(key) {
          const start = await call('/auth/login');
          assert.equal(start.status, 302);
          const state = new URL(start.headers.get('location')).searchParams.get('state');
          assert.match(start.headers.get('location'), new RegExp('^https://auth\\.hngroup\\.org\\.uk/authorize\\?client_id=' + id + '&state='));
          const back = await call(`/auth/callback?code=${key.repeat(64)}&state=${state}`);
          assert.equal(back.headers.get('location'), '/admin');
        }
      };
    }
  };
  return site;
}

before(startAuth);
after(async () => { await new Promise(r => authServer.close(r)); fs.rmSync(tmp, { recursive: true, force: true }); });

test('all 40 service websites boot with their own config, assets, security headers and SPA', async () => {
  assert.equal(catalog.length, 40);
  assert.equal(new Set(catalog.map(c => c.port)).size, 40);
  for (const entry of catalog) {
    const site = await startSite(entry.id);
    try {
      const c = site.client();
      const health = await c.api('/healthz');
      assert.deepEqual(health.value, { ok: true, site: entry.id });
      const home = await c.call('/');
      assert.equal(home.status, 200);
      assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
      const html = await home.text();
      assert.ok(html.includes(`<title>${entry.name}</title>`), entry.id + ' title');
      for (const asset of ['/app.js', '/style.css', '/assets/favicon.svg', `/assets/brand/${entry.logo}.svg`, `/assets/brand/${entry.logo}-white.svg`, '/assets/fonts/plus-jakarta-sans.woff2']) assert.equal((await c.call(asset)).status, 200, entry.id + asset);
      const info = await c.api('/api/site');
      assert.equal(info.status, 200);
      assert.equal(info.value.site.domain, entry.domain);
      assert.equal(info.value.staff, null);
      assert.ok(!JSON.stringify(info.value).includes('"targets"'), 'internal ports are not public');
      assert.equal((await c.call('/../config.json')).status, 404);
      assert.equal((await c.call('/assets/../../config.json')).status, 404);
      // Every listable public module answers without sign-in; private modules require it.
      for (const m of info.value.site.modules) {
        if (m.type === 'items') {
          const r = await c.api('/api/m/' + m.key);
          if (m.view === 'public' || m.create === 'public') assert.equal(r.status, 200, entry.id + '/' + m.key);
          else assert.ok([200, 401].includes(r.status), entry.id + '/' + m.key);
          if (m.view === 'staff' && m.create !== 'public') assert.ok(r.status === 401 || r.value.items.length === 0);
        }
        if (m.type === 'bridge' || m.type === 'health') assert.equal((await c.api(`/api/${m.type}/${m.key}`)).status, 401, entry.id + ' ' + m.type);
      }
      assert.equal(site.errors(), '', entry.id + ' stderr');
    } finally { await site.stop(); }
  }
});

test('intake with private reference, staff triage, permissions and Origin checks (services)', async () => {
  const site = await startSite('services');
  try {
    const visitor = site.client();
    const services = (await visitor.api('/api/m/catalogue')).value.items;
    assert.equal(services.length, 5, 'documented services are seeded once');
    const hosting = services.find(s => s.fields.title === 'Horizon Hosting');
    const bad = await visitor.api('/api/m/quotes', { parentId: hosting.id, fields: { name: 'A', email: 'a@example.test', details: 'x' }, consent: true }, { origin: 'https://evil.example' });
    assert.equal(bad.status, 403);
    assert.equal((await visitor.api('/api/m/quotes', { parentId: hosting.id, fields: { name: 'A', email: 'not-an-email', body: 'x' }, consent: true })).status, 400);
    assert.equal((await visitor.api('/api/m/quotes', { parentId: hosting.id, fields: { name: 'A', email: 'a@example.test', body: 'Need hosting' } })).status, 400, 'consent required');
    const created = await visitor.api('/api/m/quotes', { parentId: hosting.id, fields: { name: 'Ada Visitor', email: 'ada@example.test', body: 'Need hosting <script>' }, consent: true });
    assert.equal(created.status, 201);
    const reference = created.value.reference;
    assert.match(reference, /^[a-f0-9]{64}$/);
    assert.equal((await visitor.api('/api/m/quotes')).value.items.length, 0, 'anonymous visitors cannot list submissions');
    const lookup = await visitor.api('/api/ref', { reference });
    assert.equal(lookup.status, 200);
    assert.equal(lookup.value.parentTitle, 'Horizon Hosting');
    assert.equal((await visitor.api('/api/ref', { reference: 'f'.repeat(64) })).status, 404);
    assert.equal((await visitor.api('/api/ref/reply', { reference, body: 'More details' })).status, 200);
    // Ordinary staff are not managers here (administrator-only).
    const staff = site.client(); await staff.staff('b');
    assert.equal((await staff.api('/api/m/quotes')).value.items.length, 0);
    const admin = site.client(); await admin.staff('a');
    const list = await admin.api('/api/m/quotes');
    assert.equal(list.value.items.length, 1);
    assert.equal(list.value.manager, true);
    const item = list.value.items[0];
    assert.equal(item.fields.email, 'ada@example.test');
    assert.equal((await staff.api(`/api/m/quotes/${item.id}/status`, { status: 'quoted' })).status, 404);
    assert.equal((await admin.api(`/api/m/quotes/${item.id}/status`, { status: 'quoted', note: 'Quote attached' })).status, 200);
    assert.equal((await admin.api(`/api/m/quotes/${item.id}/comment`, { body: 'Internal only', internal: true })).status, 201);
    const after = await visitor.api('/api/ref', { reference });
    assert.equal(after.value.status, 'quoted');
    assert.deepEqual(after.value.comments.map(c => c.body), ['More details', 'Quote attached']);
    const csv = await admin.call('/api/m/quotes/export.csv');
    assert.equal(csv.status, 200); const text = await csv.text(); assert.ok(text.includes('ada@example.test'));
    assert.equal((await visitor.call('/api/m/quotes/export.csv')).status, 403);
    // Catalogue drafts stay private; only managers publish.
    assert.equal((await staff.api('/api/m/catalogue', { fields: { title: 'X' } })).status, 403);
    const draft = await admin.api('/api/m/catalogue', { fields: { title: 'Draft service', provider: 'HN Group', availability: 'available' }, published: false });
    assert.equal(draft.status, 201);
    assert.equal((await visitor.api('/api/m/catalogue')).value.items.length, 5);
    assert.equal((await visitor.api('/api/m/quotes', { parentId: draft.value.item.id, fields: { name: 'A', email: 'b@example.test', body: 'x' }, consent: true })).status, 400, 'cannot request a draft service');
    assert.equal((await admin.api(`/api/m/catalogue/${draft.value.item.id}/delete`, {})).status, 200);
    assert.equal(site.errors(), '');
  } finally { await site.stop(); }
});

test('data persists across restarts; seeds are not duplicated or restored after deletion', async () => {
  const data = path.join(tmp, 'persist-services');
  let site = await startSite('services', data);
  const admin = site.client(); await admin.staff('a');
  const first = (await admin.api('/api/m/catalogue')).value.items;
  const removed = await admin.api(`/api/m/catalogue/${first[0].id}/delete`, {});
  assert.equal(removed.status, 200, JSON.stringify(removed.value));
  await site.stop();
  site = await startSite('services', data);
  try {
    const items = (await site.client().api('/api/m/catalogue')).value.items;
    assert.equal(items.length, 4);
    const stat = fs.statSync(path.join(data, 'data.json'));
    assert.equal(stat.mode & 0o777, 0o600);
    assert.equal(fs.statSync(data).mode & 0o777, 0o700);
  } finally { await site.stop(); }
});

test('events capacity, unique registrations and cancellation by reference', async () => {
  const site = await startSite('events');
  try {
    const admin = site.client(); await admin.staff('a');
    const event = (await admin.api('/api/m/events', { fields: { title: 'Open day', starts: '2099-01-01T10:00', capacity: 1 }, published: true })).value.item;
    const v = site.client();
    const one = await v.api('/api/m/registrations', { parentId: event.id, fields: { name: 'One', email: 'one@example.test' }, consent: true });
    assert.equal(one.status, 201);
    assert.equal((await v.api('/api/m/registrations', { parentId: event.id, fields: { name: 'Two', email: 'two@example.test' }, consent: true })).value.error, 'Sorry, this is full.');
    assert.equal((await v.api('/api/ref/cancel', { reference: one.value.reference })).status, 200);
    assert.equal((await v.api('/api/m/registrations', { parentId: event.id, fields: { name: 'One again', email: 'ONE@example.test' }, consent: true })).status, 201, 'cancelled place is released');
    assert.equal((await v.api('/api/m/registrations', { parentId: event.id, fields: { name: 'Dup', email: 'one@example.test' }, consent: true })).status, 400);
    const detail = await v.api('/api/m/events/' + event.id);
    assert.equal(detail.value.item.taken, 1);
    assert.equal(detail.value.item.fields.online, undefined, 'internal fields hidden from the public');
  } finally { await site.stop(); }
});

test('bookings offer UK-time slots and prevent double booking', async () => {
  const site = await startSite('bookings');
  try {
    const admin = site.client(); await admin.staff('a');
    const type = (await admin.api('/api/m/types', { fields: { title: 'Consultation', duration: 30, days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], start: '09:00', end: '10:00', lead: 0, horizon: 30 }, published: true })).value.item;
    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const v = site.client();
    const slots = await v.api(`/api/slots/appointments/${type.id}?date=${date}`);
    assert.deepEqual(slots.value.slots, ['09:00', '09:30']);
    const booked = await v.api('/api/m/appointments', { parentId: type.id, fields: { date, time: '09:00', name: 'B', email: 'b@example.test' }, consent: true });
    assert.equal(booked.status, 201);
    assert.equal((await v.api('/api/m/appointments', { parentId: type.id, fields: { date, time: '09:00', name: 'C', email: 'c@example.test' }, consent: true })).status, 400);
    assert.deepEqual((await v.api(`/api/slots/appointments/${type.id}?date=${date}`)).value.slots, ['09:30']);
    assert.equal((await v.api('/api/m/appointments', { parentId: type.id, fields: { date, time: '11:00', name: 'D', email: 'd@example.test' }, consent: true })).status, 400, 'outside availability');
  } finally { await site.stop(); }
});

test('community accounts are separate from staff; forum posting and moderation', async () => {
  const site = await startSite('community');
  try {
    const a = site.client();
    assert.equal((await a.api('/api/forum/forum', { category: 'general', title: 'Hi', body: 'x' })).status, 401);
    assert.equal((await a.api('/api/account/register', { name: 'Alice', email: 'alice@example.test', password: 'short', terms: true })).status, 400);
    const reg = await a.api('/api/account/register', { name: 'Alice', email: 'alice@example.test', password: 'a-long-password-1', terms: true });
    assert.equal(reg.status, 201);
    assert.equal((await site.client().api('/api/account/register', { name: 'alice', email: 'x@example.test', password: 'a-long-password-1', terms: true })).status, 400, 'display names are unique');
    const thread = await a.api('/api/forum/forum', { category: 'general', title: 'Hello', body: 'First post' });
    assert.equal(thread.status, 201);
    const list = await site.client().api('/api/forum/forum');
    assert.equal(list.value.threads.length, 1);
    assert.ok(!JSON.stringify(list.value).includes('alice@example.test'), 'emails never public');
    // A community account is not staff.
    assert.equal((await a.api('/api/audit')).status, 403);
    assert.equal((await a.api('/admin')).status, 302);
    const b = site.client();
    await b.api('/api/account/register', { name: 'Bob', email: 'bob@example.test', password: 'a-long-password-2', terms: true });
    assert.equal((await b.api(`/api/forum/forum/${thread.value.thread.id}/reply`, { body: 'Welcome' })).status, 201);
    assert.equal((await b.api(`/api/forum/forum/${thread.value.thread.id}/report`, { reason: 'test report' })).status, 200);
    assert.equal((await b.api(`/api/forum/forum/${thread.value.thread.id}/moderate`, { hidden: true })).status, 403);
    assert.equal((await b.api(`/api/forum/forum/${thread.value.thread.id}/edit`, { body: 'hijack' })).status, 403);
    const admin = site.client(); await admin.staff('a');
    assert.equal((await admin.api(`/api/forum/forum/${thread.value.thread.id}/moderate`, { hidden: true, clearReports: true })).status, 200);
    assert.equal((await site.client().api(`/api/forum/forum/${thread.value.thread.id}`)).status, 404);
    // Login and logout.
    const again = site.client();
    assert.equal((await again.api('/api/account/login', { email: 'alice@example.test', password: 'wrong-password-123' })).status, 401);
    assert.equal((await again.api('/api/account/login', { email: 'alice@example.test', password: 'a-long-password-1' })).status, 200);
    assert.equal((await again.api('/api/account/me')).value.account.name, 'Alice');
    await again.api('/api/account/logout', {});
    assert.equal((await again.api('/api/account/me')).value.account, null);
  } finally { await site.stop(); }
});

test('membership: application, approval invitation, activation and members-only content', async () => {
  const site = await startSite('members');
  try {
    const v = site.client();
    const app = await v.api('/api/m/applications', { fields: { name: 'Mia Member', email: 'mia@example.test', reason: 'Interested' }, consent: true });
    assert.equal(app.status, 201);
    const admin = site.client(); await admin.staff('a');
    await admin.api('/api/m/resources', { fields: { title: 'Member guide' }, published: true, visibility: 'members' });
    assert.equal((await v.api('/api/m/resources')).status, 401, 'not visible before membership');
    const invite = await admin.api(`/api/m/applications/${app.value.item.id}/invite`, {});
    const raw = invite.value.invite.split('/').pop();
    assert.equal((await v.api('/api/account/activate', { invite: raw, password: 'member-password-1' })).status, 200);
    assert.equal((await v.api('/api/account/activate', { invite: raw, password: 'member-password-1' })).status, 400, 'single use');
    assert.equal((await v.api('/api/m/resources')).value.items.length, 1);
    const req = await v.api('/api/m/requests', { fields: { title: 'Help', body: 'Please' } });
    assert.equal(req.status, 201);
    assert.equal((await v.api('/api/m/requests')).value.items.length, 1);
    assert.equal((await site.client().api('/api/m/requests')).status, 401);
  } finally { await site.stop(); }
});

test('customer data isolation on my.horizonetwork.com', async () => {
  const site = await startSite('my');
  try {
    const admin = site.client(); await admin.staff('a');
    const links = [];
    for (const [name, email] of [['Ann', 'ann@example.test'], ['Ben', 'ben@example.test']]) links.push((await admin.api('/api/account/invite', { name, email })).value.invite.split('/').pop());
    const accounts = (await admin.api('/api/account/list')).value.accounts;
    const ann = accounts.find(a => a.email === 'ann@example.test'), ben = accounts.find(a => a.email === 'ben@example.test');
    const svc = await admin.api('/api/m/services', { fields: { customer: ann.id, title: 'Ann hosting', kind: 'hosting', notes: 'secret note' } });
    assert.equal(svc.status, 201);
    const a = site.client(), b = site.client();
    await a.api('/api/account/activate', { invite: links[0], password: 'ann-password-123' });
    await b.api('/api/account/activate', { invite: links[1], password: 'ben-password-123' });
    const annView = (await a.api('/api/m/services')).value.items;
    assert.equal(annView.length, 1);
    assert.equal(annView[0].fields.notes, undefined, 'internal notes hidden from customers');
    assert.equal((await b.api('/api/m/services')).value.items.length, 0);
    assert.equal((await b.api('/api/m/services/' + svc.value.item.id)).status, 404);
    assert.equal((await b.api('/api/m/services/' + svc.value.item.id + '/comment', { body: 'x' })).status, 404);
    assert.equal((await a.api('/api/m/services/' + svc.value.item.id + '/comment', { body: 'Question' })).status, 201);
    assert.equal((await a.api('/api/account/invite', { name: 'x', email: 'x@example.test' })).status, 401, 'customers cannot manage accounts');
    await admin.api('/api/account/disable', { id: ann.id });
    assert.equal((await a.api('/api/m/services')).status, 401, 'disabling revokes sessions');
    assert.equal(ben.disabled, false);
  } finally { await site.stop(); }
});

test('surveys: builder, responses and aggregated public results', async () => {
  const site = await startSite('surveys');
  try {
    const admin = site.client(); await admin.staff('a');
    const saved = await admin.api('/api/b/surveys', { title: 'Satisfaction', audience: 'public', open: true, published: true, resultsPublic: true, questions: [{ label: 'Rating', type: 'rating' }, { label: 'Pick', type: 'select', options: ['A', 'B'] }, { label: 'Comments', type: 'textarea', required: false }] });
    assert.equal(saved.status, 200);
    const form = saved.value.form;
    const v = site.client();
    const q = form.questions;
    assert.equal((await v.api(`/api/b/surveys/${form.id}/respond`, { answers: { [q[0].id]: 9, [q[1].id]: 'A' } })).status, 400);
    assert.equal((await v.api(`/api/b/surveys/${form.id}/respond`, { answers: { [q[0].id]: 4, [q[1].id]: 'A', [q[2].id]: 'private words' } })).status, 201);
    assert.equal((await v.api(`/api/b/surveys/${form.id}/respond`, { answers: { [q[0].id]: 2, [q[1].id]: 'B' } })).status, 201);
    const results = await v.api(`/api/b/surveys/${form.id}/results`);
    assert.equal(results.value.total, 2);
    assert.equal(results.value.results[0].average, 3);
    assert.ok(!JSON.stringify(results.value).includes('private words'), 'free text answers are not public');
    assert.equal((await v.api(`/api/b/surveys/${form.id}/responses`)).status, 403);
    assert.equal((await admin.api(`/api/b/surveys/${form.id}/responses`)).value.responses.length, 2);
    assert.equal((await admin.api('/api/b/surveys', { id: form.id, title: 'Satisfaction', open: true, published: true, questions: [{ label: 'Only one', type: 'text' }] })).status, 400, 'structure locked after responses');
  } finally { await site.stop(); }
});

test('document signing: private links, typed-name confirmation, completion and record', async () => {
  const site = await startSite('sign');
  try {
    const staff = site.client(); await staff.staff('b');
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');
    assert.equal((await staff.api('/api/sign/documents', { title: 'NDA', file: { name: 'n.txt', data: Buffer.from('hello').toString('base64') }, signers: [{ name: 'Sam Signer', email: 'sam@example.test' }] })).status, 400, 'PDF only');
    const created = await staff.api('/api/sign/documents', { title: 'NDA', file: { name: 'nda.pdf', data: pdf }, signers: [{ name: 'Sam Signer', email: 'sam@example.test' }, { name: 'Tia Two', email: 'tia@example.test' }] });
    assert.equal(created.status, 201);
    const [sam, tia] = created.value.links.map(l => l.link.split('/').pop());
    const v = site.client();
    const open = await v.api('/api/sign/documents/open', { token: sam });
    assert.equal(open.value.signer.name, 'Sam Signer');
    const sha = open.value.file.sha256;
    assert.equal((await v.call('/api/sign/documents/document', { body: { token: sam } })).status, 200);
    assert.equal((await v.api('/api/sign/documents/sign', { token: sam, typedName: 'Someone Else', consent: true, sha256: sha })).status, 400);
    assert.equal((await v.api('/api/sign/documents/sign', { token: sam, typedName: 'sam  signer', consent: true, sha256: sha })).status, 200);
    assert.equal((await v.api('/api/sign/documents/sign', { token: sam, typedName: 'Sam Signer', consent: true, sha256: sha })).status, 404, 'link retired after signing');
    assert.equal((await v.api('/api/sign/documents/sign', { token: tia, typedName: 'Tia Two', consent: true, sha256: sha })).status, 200);
    const doc = (await staff.api('/api/sign/documents')).value.documents[0];
    assert.equal(doc.status, 'completed');
    const record = await staff.call(`/api/sign/documents/${doc.id}/record`);
    const text = await record.text();
    assert.ok(text.includes(sha) && text.includes('not a qualified or advanced electronic signature'));
    const other = site.client(); await other.staff('c');
    assert.equal((await other.api('/api/sign/documents')).value.documents.length, 0, 'other staff cannot see it');
    assert.equal((await other.call(`/api/sign/documents/${doc.id}/file`)).status, 404);
  } finally { await site.stop(); }
});

test('vault files are private to their owner, even from administrators', async () => {
  const site = await startSite('vault');
  try {
    const staff = site.client(); await staff.staff('b');
    const item = await staff.api('/api/m/files', { fields: { title: 'Payslip notes' }, file: { name: 'notes.txt', data: Buffer.from('mine').toString('base64') } });
    assert.equal(item.status, 201);
    const admin = site.client(); await admin.staff('a');
    assert.equal((await admin.api('/api/m/files')).value.items.length, 0);
    assert.equal((await admin.call(`/api/m/files/${item.value.item.id}/file/${item.value.item.files[0].id}`)).status, 404);
    const own = await staff.call(`/api/m/files/${item.value.item.id}/file/${item.value.item.files[0].id}`);
    assert.equal(await own.text(), 'mine');
    assert.equal((await admin.call('/api/m/files/export.csv')).status, 403);
  } finally { await site.stop(); }
});

test('procurement approvals: no self-approval, admin decision, portal bill via bridge', async () => {
  const site = await startSite('procurement');
  try {
    const staff = site.client(); await staff.staff('b');
    const req = await staff.api('/api/m/requests', { fields: { title: 'Laptop', supplier: 'Acme', amount: '999.99', company: 'HN Group', justification: 'Old one broke' } });
    assert.equal(req.status, 201);
    assert.equal(req.value.item.fields.amount, 99999);
    const id = req.value.item.id;
    assert.deepEqual(req.value.item.can.status, ['cancelled'], 'requester may only cancel');
    const other = site.client(); await other.staff('c');
    assert.equal((await other.api('/api/m/requests')).value.items.length, 0, 'own requests only');
    const admin = site.client(); await admin.staff('a');
    const mine = await admin.api('/api/m/requests', { fields: { title: 'Admin item', supplier: 'S', amount: '1', company: 'HN Group', justification: 'j' } });
    assert.ok(!mine.value.item.can.status.includes('approved'), 'administrators cannot approve their own');
    assert.equal((await admin.api(`/api/m/requests/${id}/portal-bill`, { dueDate: '2026-12-01' })).status, 400, 'not before approval');
    assert.equal((await admin.api(`/api/m/requests/${id}/status`, { status: 'approved' })).status, 200);
    assert.equal((await admin.api(`/api/m/requests/${id}/status`, { status: 'received' })).status, 403, 'transitions enforced');
    const bill = await admin.api(`/api/m/requests/${id}/portal-bill`, { dueDate: '2026-12-01', category: 'IT' });
    assert.equal(bill.status, 200);
    const call = bridgeCalls.at(-1);
    assert.equal(call.client_id, 'procurement');
    assert.deepEqual([call.method, call.path], ['POST', '/api/bills']);
    assert.equal(call.body.json.amount, '999.99');
    assert.equal((await admin.api(`/api/m/requests/${id}/portal-bill`, { dueDate: '2026-12-01' })).status, 400, 'only once');
  } finally { await site.stop(); }
});

test('staff-portal bridge: fixed routes only, ids validated, downloads forced to attachment', async () => {
  const site = await startSite('expenses');
  try {
    const staff = site.client(); await staff.staff('b');
    const list = await staff.api('/api/bridge/claims');
    assert.equal(list.status, 200);
    assert.equal(list.value.mine[0].description, 'Train');
    assert.deepEqual([bridgeCalls.at(-1).method, bridgeCalls.at(-1).path, bridgeCalls.at(-1).client_id], ['GET', '/api/expenses', 'expenses']);
    assert.equal((await staff.api('/api/bridge/claims/action/mine/cancel', { id: '../../people' })).status, 400);
    assert.equal((await staff.api('/api/bridge/claims/action/mine/cancel', { id: '0123456789abcdef' })).status, 200);
    assert.equal(bridgeCalls.at(-1).path, '/api/expenses/0123456789abcdef/cancel');
    assert.equal((await staff.api('/api/bridge/claims/action/mine/delete-everything', { id: '0123456789abcdef' })).status, 404);
    const upload = await staff.api('/api/bridge/claims/form/claim', { values: { date: '2026-10-01', amount: '4.20', description: 'Coffee', evil: 'x' }, file: { name: 'r.pdf', data: Buffer.from('%PDF').toString('base64') } });
    assert.equal(upload.status, 200);
    const call = bridgeCalls.at(-1);
    assert.equal(call.body.upload.header, 'x-claim');
    assert.equal(call.body.upload.meta.fileName, 'r.pdf');
    assert.equal(call.body.upload.meta.evil, undefined, 'only configured fields are sent');
    const mileage = await staff.api('/api/bridge/claims/form/mileage', { values: { date: '2026-10-01', miles: 10, from: 'A', to: 'B', kind: 'not-mileage' } });
    assert.equal(mileage.status, 200);
    assert.equal(bridgeCalls.at(-1).body.upload.meta.kind, 'mileage', 'fixed values cannot be overridden');
    const receipt = await staff.call('/api/bridge/claims/download/mine?id=0123456789abcdef');
    assert.equal(receipt.status, 200);
    assert.match(receipt.headers.get('content-disposition'), /^attachment/);
    assert.match(receipt.headers.get('content-security-policy'), /sandbox/);
    assert.equal((await site.client().api('/api/bridge/claims')).status, 401);
  } finally { await site.stop(); }
});

test('learning completion is recorded and pushed to staff-portal training records', async () => {
  const site = await startSite('learn');
  try {
    const admin = site.client(); await admin.staff('a');
    const course = (await admin.api('/api/m/courses', { fields: { title: 'Security basics' }, published: true, visibility: 'staff' })).value.item;
    const staff = site.client(); await staff.staff('b');
    const done = await staff.api(`/api/m/courses/${course.id}/complete`, {});
    assert.equal(done.value.portal, 'recorded');
    const call = bridgeCalls.at(-1);
    assert.deepEqual([call.client_id, call.path, call.body.upload.header, call.body.upload.meta.course], ['learn', '/api/training', 'x-training', 'Security basics']);
    assert.equal((await staff.api(`/api/m/courses/${course.id}/complete`, {})).status, 400);
    assert.equal((await site.client().api('/api/m/courses')).status, 401, 'courses are staff only');
  } finally { await site.stop(); }
});

test('security.txt and Network status checks are real', async () => {
  const sec = await startSite('security');
  try {
    const txt = await (await sec.client().call('/.well-known/security.txt')).text();
    assert.match(txt, /^Contact: https:\/\/security\.hngroup\.org\.uk\/#\/m\/reports/m);
    assert.match(txt, /^Expires: \d{4}-/m);
  } finally { await sec.stop(); }
  const target = http.createServer((req, res) => { res.writeHead(req.url === '/down' ? 503 : 200); res.end('ok'); });
  const tPort = await freePort(); await new Promise(r => target.listen(tPort, '127.0.0.1', r));
  const site = await startSite('netstatus');
  try {
    const admin = site.client(); await admin.staff('a');
    const staffOnly = site.client(); await staffOnly.staff('b').catch(() => {});
    assert.equal((await admin.api('/api/status/components/component', { name: 'Fixture up', url: `http://127.0.0.1:${tPort}/up` })).status, 200);
    const status = await site.client().api('/api/status/components');
    assert.ok(status.value.components.some(c => c.name === 'Horizon Network website'));
    assert.equal(status.value.components.find(c => c.name === 'Fixture up').url, undefined, 'check addresses are not public');
    assert.equal((await admin.api('/api/status/components/incident', { title: 'Investigating', status: 'investigating', impact: 'degraded', message: 'Looking into it' })).status, 200);
    assert.equal((await site.client().api('/api/status/components')).value.incidents.length, 1);
  } finally { await site.stop(); await new Promise(r => target.close(r)); }
});

