'use strict';
// HN Group Wiki tests: reading, staff editing through a stand-in for HN Group Auth, history,
// conflicts, protection, CSRF and escaping. Uses temporary data only.
//   node --test wiki-site/test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const freePort = () => new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

test('HN Group Wiki: reading, editing, history, protection and safety', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-wiki-test-'));
  const secret = 'a'.repeat(64);
  fs.writeFileSync(path.join(dir, 'secret'), secret);
  const [wikiPort, authPort] = [await freePort(), await freePort()];
  const WIKI = 'http://127.0.0.1:' + wikiPort, AUTH = 'http://127.0.0.1:' + authPort;

  // Stand-in for HN Group Auth: /authorize hands back a code for whoever `nextUser` is.
  let nextUser = { id: 'p1', displayName: 'Ella Brooks', statusAdminAllowed: false };
  const codes = new Map(), sessions = new Map();
  const auth = http.createServer(async (req, res) => {
    const url = new URL(req.url, AUTH);
    if (url.pathname === '/authorize') {
      assert.equal(url.searchParams.get('client_id'), 'wiki');
      const code = require('node:crypto').randomBytes(32).toString('hex');
      codes.set(code, { ...nextUser });
      res.writeHead(302, { Location: WIKI + '/auth/callback?code=' + code + '&state=' + url.searchParams.get('state') }); return res.end();
    }
    let body = ''; for await (const c of req) body += c;
    const data = JSON.parse(body || '{}');
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'Bearer ' + secret || data.client_id !== 'wiki') { res.writeHead(401); return res.end('{"error":"no"}'); }
    if (url.pathname === '/api/sso/exchange') {
      const user = codes.get(data.code); codes.delete(data.code);
      if (!user) { res.writeHead(401); return res.end('{"error":"expired"}'); }
      const session = require('node:crypto').randomBytes(32).toString('hex'); sessions.set(session, user);
      return res.end(JSON.stringify({ session, expires: Date.now() + 3600000, user }));
    }
    if (url.pathname === '/api/sso/session') {
      const user = sessions.get(data.session);
      if (!user) { res.writeHead(401); return res.end('{"error":"ended"}'); }
      return res.end(JSON.stringify({ session: data.session, expires: Date.now() + 3600000, user }));
    }
    res.writeHead(404); res.end('{}');
  });
  await new Promise((r) => auth.listen(authPort, '127.0.0.1', r));

  const env = { ...process.env, PORT: String(wikiPort), WIKI_DATA_DIR: path.join(dir, 'data'), WIKI_ORIGIN: WIKI, AUTH_ORIGIN: AUTH, AUTH_BACKEND: AUTH, STATUS_SSO_SECRET_FILE: path.join(dir, 'secret') };
  let child;
  const start = async () => {
    child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { try { if ((await fetch(WIKI + '/healthz')).ok) return; } catch {} await new Promise((r) => setTimeout(r, 50)); }
    throw new Error('wiki did not start');
  };
  const stop = () => new Promise((r) => { child.once('exit', r); child.kill(); });

  // A tiny browser: follows redirects by hand so cookies are kept.
  function browser() {
    const jar = {};
    const go = async (url, opts) => {
      url = new URL(url, WIKI).href;
      for (let hops = 0; hops < 6; hops++) {
        const headers = { ...(opts && opts.headers) };
        const host = new URL(url, WIKI).origin;
        if (host === WIKI && Object.keys(jar).length) headers.Cookie = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
        const r = await fetch(new URL(url, WIKI), { ...opts, headers, redirect: 'manual' });
        for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, ...v] = kv.split('='); if (host === WIKI) { if (/Max-Age=0/.test(c)) delete jar[k]; else jar[k] = v.join('='); } }
        if (r.status >= 300 && r.status < 400 && !(opts && opts.noFollow)) { url = new URL(r.headers.get('location'), url).href; opts = { headers: opts && opts.headers }; continue; }
        return { status: r.status, url, text: await r.text(), location: r.headers.get('location') };
      }
      throw new Error('too many redirects');
    };
    const form = (url, fields, extra) => go(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: WIKI, ...(extra || {}) }, body: new URLSearchParams(fields).toString() });
    return { go, form, jar };
  }
  const field = (html, name) => (new RegExp('name="' + name + '" value="([^"]*)"').exec(html) || [])[1];
  const sourceOf = (html) => /<textarea[^>]*>([\s\S]*?)<\/textarea>/.exec(html)[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

  try {
    await start();
    const anon = browser();
    // Reading
    for (const [route, text] of [['/wiki/Main_Page', 'Welcome to HN Group Wiki'], ['/wiki/HN_Group', 'parent company'], ['/wiki/Horizon_Network', 'horizon-network.co.uk'], ['/wiki/Horizon_Advertising', 'subsidiary of'], ['/wiki/Horizon_Development', 'Custom software'], ['/wiki/Horizon_Media_Group', 'media arm'], ['/wiki/Horizon_Holding_Co', 'Discord servers'], ['/wiki/Horizon_Network_Limited', 'Horizon Network Limited'], ['/wiki/List_of_HN_Group_companies', 'Horizon Advertising'], ['/wiki/Help:Editing', 'Infoboxes'], ['/wiki/Category:Companies', 'Pages in category']]) {
      const r = await anon.go(route); assert.equal(r.status, 200, route); assert.ok(r.text.includes(text), route + ' should mention ' + text);
    }
    assert.ok((await anon.go('/wiki/Horizon_Advertising')).text.includes('Managed by'), 'Advertising infobox shows who manages it');
    for (const t of ['HN_Group', 'Horizon_Network', 'Horizon_Advertising', 'Horizon_Development', 'Horizon_Media_Group', 'Horizon_Holding_Co', 'List_of_HN_Group_companies']) {
      const html = (await anon.go('/wiki/' + t)).text;
      assert.ok(!html.includes('Legal name') && !/(Network|Media Group|Holding Co|Advertising) Limited/.test(html.replace(/<footer[\s\S]*$/, '')), t + ' shows no legal names');
    }
    assert.ok((await anon.go('/wiki/HNGroup')).url.endsWith('/wiki/HN_Group?from=HNGroup'), 'redirect page');
    assert.ok((await anon.go('/wiki/hn_group')).url.endsWith('/wiki/HN_Group'), 'case-insensitive titles');
    assert.equal((await anon.go('/wiki/No_such_page')).status, 404);
    assert.ok((await anon.go('/wiki/Special:Search?search=lavender&fulltext=1')).text.includes('Horizon Advertising'));
    assert.ok((await anon.go('/sitemap.xml')).text.includes('/wiki/Horizon_Network'));

    // Search suggestions: prefix matches first, short descriptions, logos, redirects resolved, no duplicates.
    const sug = async (q) => JSON.parse((await anon.go('/w/api/suggest?q=' + encodeURIComponent(q))).text).results;
    const hor = await sug('horizon a');
    assert.equal(hor[0].title, 'Horizon Advertising');
    assert.equal(hor[0].description, 'Digital advertising company managed by Horizon Network');
    assert.equal(hor[0].image.light, '/assets/brand/horizon-advertising-logo.svg');
    const hn = await sug('hngroup');
    assert.equal(hn[0].title, 'HN Group'); assert.equal(hn[0].redirectFrom, 'HNGroup');
    assert.equal(new Set(hn.map((r) => r.title)).size, hn.length, 'no duplicate targets');
    assert.ok((await sug('development')).some((r) => r.title === 'Horizon Development'), 'word matches');
    assert.deepEqual(await sug(''), []);
    assert.ok((await sug('Horizon')).length <= 8);
    assert.ok(!(await anon.go('/wiki/Horizon_Advertising')).text.includes('Short description'), 'short description is hidden');
    assert.equal((await anon.go('/assets/../server.js')).status, 404);
    // No articles about the websites (the user asked for companies only).
    for (const t of ['HN_Group_Staff_Portal', 'HN_Group_Auth', 'HN_Group_Status', 'HN_Group_Links', 'List_of_HN_Group_websites']) assert.equal((await anon.go('/wiki/' + t)).status, 404, t);
    // Every internal link on every page points at a page that exists (no red links in seeded content).
    for (const p of (await anon.go('/wiki/Special:AllPages')).text.match(/href="\/wiki\/[^"?#]+"/g)) {
      const r = await anon.go(p.slice(6, -1)); assert.ok(!r.text.includes('class="new"'), 'red link on ' + p);
    }

    // Anonymous people can view source but not save.
    const anonEdit = await anon.go('/wiki/HN_Group?action=edit');
    assert.ok(anonEdit.text.includes('readonly') && anonEdit.text.includes('sign in'));
    assert.equal((await anon.form('/wiki/HN_Group?action=submit', { text: 'x', save: '1', csrf: '' })).status, 401);

    // Staff editor signs in through Auth and comes back to where they started.
    const ella = browser();
    const back = await ella.go('/auth/login?return=' + encodeURIComponent('/wiki/HN_Group?action=edit'));
    assert.ok(back.url.endsWith('/wiki/HN_Group?action=edit'), 'returns to the edit page');
    assert.ok(back.text.includes('Ella Brooks') && !back.text.includes(' readonly'));
    const csrf = field(back.text, 'csrf'), base = field(back.text, 'base');
    const original = sourceOf(back.text);
    assert.ok(original.includes('{{Infobox'));

    // CSRF and cross-site protection
    assert.equal((await ella.form('/wiki/HN_Group?action=submit', { text: original + '\nx', save: '1', csrf: 'wrong', base })).status, 403);
    assert.equal((await ella.form('/wiki/HN_Group?action=submit', { text: original + '\nx', save: '1', csrf, base }, { Origin: 'https://evil.example' })).status, 403);

    // Preview doesn't save; publishing does.
    const preview = await ella.form('/wiki/HN_Group?action=submit', { text: original + '\n\nPreview only paragraph.', preview: '1', csrf, base });
    assert.ok(preview.text.includes('Preview only paragraph.') && preview.text.includes('preview-label'));
    assert.ok(!(await anon.go('/wiki/HN_Group')).text.includes('Preview only paragraph.'));
    const saved = await ella.form('/wiki/HN_Group?action=submit', { text: original + '\n\nA new paragraph <script>alert(1)</script> added by staff.', save: '1', summary: 'Added a paragraph', csrf, base });
    assert.equal(saved.status, 200);
    assert.ok(saved.text.includes('A new paragraph &lt;script&gt;alert(1)&lt;/script&gt; added by staff.'), 'typed HTML is escaped');
    assert.ok(!saved.text.includes('<script>alert(1)'));

    // Edit conflict: saving from the old base revision is refused, and their text is kept.
    const conflict = await ella.form('/wiki/HN_Group?action=submit', { text: original + '\n\nConflicting change.', save: '1', csrf, base });
    assert.ok(conflict.text.includes('Edit conflict') && conflict.text.includes('Conflicting change.'));

    // History: names only for signed-in staff.
    const histStaff = await ella.go('/wiki/HN_Group?action=history');
    assert.ok(histStaff.text.includes('Ella Brooks') && histStaff.text.includes('Added a paragraph'));
    const histAnon = await anon.go('/wiki/HN_Group?action=history');
    assert.ok(!histAnon.text.includes('Ella Brooks') && histAnon.text.includes('Staff editor'));
    const firstRev = /\?oldid=([a-f0-9]+)">[^<]+<\/a> · <span class="history-user">HN Group Wiki/.exec(histAnon.text)[1];

    // Restoring the first version
    const oldView = await ella.go('/wiki/HN_Group?oldid=' + firstRev);
    assert.ok(oldView.text.includes('old revision'));
    await ella.form('/wiki/HN_Group?action=restore', { rev: firstRev, csrf });
    assert.ok(!(await anon.go('/wiki/HN_Group')).text.includes('A new paragraph'), 'restored');

    // Creating a new page
    const created = await ella.form('/wiki/Test_page?action=submit', { text: "'''Test page''' links to [[Horizon Network]].\n[[Category:Companies]]", save: '1', csrf, base: '' });
    assert.ok(created.url.endsWith('/wiki/Test_page') && created.text.includes('links to'));
    assert.ok((await anon.go('/wiki/Category:Companies')).text.includes('Test page'));
    assert.ok((await anon.go('/wiki/Special:RecentChanges')).text.includes('Test page'));

    // Protected Main Page: editors can't change it; admins can, and can protect/delete pages.
    assert.equal((await ella.form('/wiki/Main_Page?action=submit', { text: 'Vandalised', save: '1', csrf, base: '' })).status, 403);
    assert.equal((await ella.form('/wiki/Test_page?action=delete', { csrf })).status, 400, 'editors cannot delete');
    nextUser = { id: 'p0', displayName: 'Charlie Livsey', statusAdminAllowed: true };
    const admin = browser();
    const adminEdit = await admin.go('/auth/login?return=' + encodeURIComponent('/wiki/Test_page?action=edit'));
    assert.ok(adminEdit.text.includes('Administrator tools'));
    const acsrf = field(adminEdit.text, 'csrf');
    await admin.form('/wiki/Test_page?action=protect', { on: '1', csrf: acsrf });
    assert.equal((await ella.form('/wiki/Test_page?action=submit', { text: 'Changed', save: '1', csrf, base: '' })).status, 403, 'protected page');
    await admin.form('/wiki/Test_page?action=delete', { csrf: acsrf });
    assert.equal((await anon.go('/wiki/Test_page')).status, 404, 'deleted');

    // Signing out ends the editing session.
    await ella.form('/auth/logout', {});
    assert.ok((await ella.go('/wiki/HN_Group?action=edit')).text.includes('readonly'));

    // Restarting keeps edits and doesn't bring deleted or edited seed pages back over them.
    const editedBefore = (await anon.go('/wiki/HN_Group?action=history')).text.match(/<li>/g).length;
    await stop(); await start();
    assert.equal((await anon.go('/wiki/HN_Group?action=history')).text.match(/<li>/g).length, editedBefore);
    assert.equal((await anon.go('/wiki/Test_page')).status, 404);
  } finally {
    if (child && child.exitCode === null) await stop();
    await new Promise((r) => auth.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('HN Group Wiki: seed updates refresh unedited articles only', () => {
  const store = require('./lib/store');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-wiki-seed-'));
  const seedDir = path.join(dir, 'seed'), dataDir = path.join(dir, 'data');
  fs.mkdirSync(seedDir);
  const write = (name, title, text) => fs.writeFileSync(path.join(seedDir, name), 'title: ' + title + '\n---\n' + text + '\n');
  try {
    write('a.wiki', 'Alpha', 'First'); write('b.wiki', 'Beta', 'First');
    store.init(dataDir, seedDir);
    store.edit('Beta', 'Edited by staff\n', { id: 's1', name: 'Staff' }, '', store.latest(store.get('Beta')).id);
    write('a.wiki', 'Alpha', 'Second'); write('b.wiki', 'Beta', 'Second');
    store.init(dataDir, seedDir);
    assert.equal(store.latest(store.get('Alpha')).text, 'Second\n');
    assert.equal(store.get('Alpha').revisions.length, 2);
    assert.equal(store.latest(store.get('Beta')).text, 'Edited by staff\n');
    store.init(dataDir, seedDir);
    assert.equal(store.get('Alpha').revisions.length, 2, 'no duplicate revision when unchanged');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
