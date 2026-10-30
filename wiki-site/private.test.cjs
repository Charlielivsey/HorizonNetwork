'use strict';
// The private wiki (WIKI_PRIVATE=1): every page needs an HN Group Auth sign-in through the `private-wiki` client, any
// HN Group account reads, only owner-level and Super Admin accounts edit, its own starting pages (nothing from the
// public wiki), company articles from the private register's feed, and sign-ins that survive a restart.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const hex = () => crypto.randomBytes(32).toString('hex');
const freePort = () => new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

test('private wiki: sign-in to read, owner/Super Admin edit, separate pages, private register only', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-private-wiki-'));
  const secret = hex(); fs.writeFileSync(path.join(dir, 'secret'), secret);
  const users = { reader: { id: 'p-sam', displayName: 'Sam', statusAdminAllowed: false }, admin: { id: 'p-charlie', displayName: 'Charlie', statusAdminAllowed: false, ownerAccess: true } };
  const codes = new Map(), sessions = new Map(), clients = new Set();
  const auth = http.createServer((req, res) => { let b = ''; req.on('data', (c) => b += c); req.on('end', () => {
    const d = JSON.parse(b || '{}'), send = (s, v) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v)); };
    clients.add(d.client_id);
    if (req.headers.authorization !== 'Bearer ' + secret) return send(401, {});
    if (req.url === '/api/sso/exchange') { const who = codes.get(d.code); const s = hex(); sessions.set(s, who); return send(200, { session: s, expires: Date.now() + 30 * 86400000, user: users[who] }); }
    if (req.url === '/api/sso/session') { const who = sessions.get(d.session); return who ? send(200, { session: d.session, expires: Date.now() + 30 * 86400000, user: users[who] }) : send(401, {}); }
    send(404, {});
  }); });
  await new Promise((r) => auth.listen(0, '127.0.0.1', r));
  const feed = { version: 'p1', companies: [{ slug: 'private-holdings', legalName: 'Private Holdings Limited', name: 'Private Holdings', number: 'P0001', status: 'Active', type: '', incorporated: '', dissolved: '', registeredOffice: '', sic: [], description: '', website: '', emailDomain: '', parent: '', managedBy: '', divisions: [], previousNames: [], officers: [], owners: [] }] };
  const register = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json', ETag: '"' + feed.version + '"' }); res.end(JSON.stringify(feed)); });
  await new Promise((r) => register.listen(0, '127.0.0.1', r));
  const port = await freePort(), WIKI = 'http://127.0.0.1:' + port;
  const env = { ...process.env, PORT: String(port), WIKI_PRIVATE: '1', WIKI_NAME: 'HN Group Private Wiki', WIKI_DATA_DIR: path.join(dir, 'data'), WIKI_SEED_DIR: path.join(__dirname, '..', 'private-wiki-site', 'seed'),
    WIKI_SESSIONS_FILE: path.join(dir, 'sessions.json'), WIKI_ORIGIN: WIKI, AUTH_ORIGIN: 'https://auth.example', AUTH_BACKEND: 'http://127.0.0.1:' + auth.address().port, STATUS_SSO_SECRET_FILE: path.join(dir, 'secret'),
    COMPANIES_FEED_URL: 'http://127.0.0.1:' + register.address().port + '/api/public/companies', COMPANIES_PUBLIC_URL: 'https://private.companies.hngroup.org.uk', COMPANIES_FEED_INTERVAL: '100' };
  let child;
  const start = async () => { child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: 'ignore' }); for (let i = 0; i < 80; i++) { try { if ((await fetch(WIKI + '/healthz')).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); } };
  const stop = async () => { if (child && child.exitCode === null) { child.kill(); await new Promise((r) => child.once('exit', r)); } };
  const get = (p, cookie) => fetch(WIKI + p, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
  try {
    await start();
    // Nothing without signing in, not even pictures or the sitemap.
    let r = await get('/wiki/Main_Page');
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/auth/login?return=%2Fwiki%2FMain_Page');
    assert.equal((await get('/sitemap.xml')).status, 302);
    assert.equal((await get('/assets/wiki.css')).status, 200);
    r = await get('/auth/login?return=/wiki/Main_Page');
    assert.match(r.headers.get('location'), /^https:\/\/auth\.example\/authorize\?client_id=private-wiki&state=/);
    const signIn = async (who) => {
      const s = await get('/auth/login?return=/wiki/Main_Page'), state = new URL(s.headers.get('location')).searchParams.get('state');
      const code = hex(); codes.set(code, who);
      const back = await get('/auth/callback?code=' + code + '&state=' + state, s.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '));
      assert.equal(back.status, 302);
      const set = back.headers.getSetCookie().find((c) => c.startsWith('hn_private_wiki_session='));
      assert.match(set, /Max-Age=2592000/, 'stays signed in for 30 days');
      return set.split(';')[0];
    };
    const sam = await signIn('reader');
    r = await get('/wiki/Main_Page', sam); assert.equal(r.status, 200);
    const main = await r.text();
    assert.match(main, /Welcome to HN Group Private Wiki/); assert.match(main, /read only/);
    assert.doesNotMatch(main, /Horizon Network|Horizon Media Group/, 'nothing from the public wiki');
    assert.equal((await get('/wiki/HN_Group', sam)).status, 404, 'the public wiki’s articles aren’t here');
    // Company articles come from the private register's feed.
    let found = false; for (let i = 0; i < 50 && !found; i++) { found = (await get('/wiki/Private_Holdings', sam)).status === 200; if (!found) await new Promise((x) => setTimeout(x, 100)); }
    assert.ok(found, 'the private register’s company has an article');
    // Readers can't edit; owner-level and Super Admin accounts can.
    const csrfOf = async (cookie) => (/name="csrf" value="([a-f0-9]+)"/.exec(await (await get('/wiki/Test_page?action=edit', cookie)).text()) || [])[1] || '';
    const save = (cookie, csrf) => fetch(WIKI + '/wiki/Test_page?action=submit', { method: 'POST', redirect: 'manual', headers: { cookie, Origin: WIKI, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf, text: 'Private notes.', save: '1' }) });
    assert.equal((await save(sam, await csrfOf(sam))).status, 403);
    const charlie = await signIn('admin');
    assert.equal((await save(charlie, await csrfOf(charlie))).status, 303);
    // Sign-ins survive a restart.
    await new Promise((x) => setTimeout(x, 1300));
    await stop(); await start();
    r = await get('/wiki/Test_page', sam); assert.equal(r.status, 200); assert.match(await r.text(), /Private notes\./);
    assert.ok(!fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8').includes(sam.split('=')[1]), 'only hashes of tokens are saved');
    assert.deepEqual([...clients].filter(Boolean), ['private-wiki']);
    r = await fetch(WIKI + '/auth/logout', { method: 'POST', headers: { cookie: sam, Origin: WIKI }, redirect: 'manual' });
    assert.equal(r.headers.get('location'), '/signed-out');
    assert.equal((await get('/wiki/Main_Page', sam)).status, 302);
  } finally { await stop(); auth.close(); register.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
