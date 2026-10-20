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

  // Stand-in for the Company Register's public feed, shaped like the real group structure.
  const regPort = await freePort();
  const co = (slug, legalName, name, extra) => ({ slug, legalName, name, number: '', status: 'Active', type: '', incorporated: '', dissolved: '', registeredOffice: '', sic: [], description: '', website: '', emailDomain: '', parent: '', managedBy: '', divisions: [], previousNames: [], officers: [], owners: [], ...extra });
  const parentOwner = (name) => [{ name, kind: 'Parent company', share: '100', control: ['Ownership of shares – 75% or more'] }];
  let regFeed = { version: 'v1', companies: [
    co('hn-group', 'HN Group Limited', 'HN Group', { website: 'hngroup.org.uk', emailDomain: 'hngroup.org.uk', incorporated: '2024-03-01', officers: [{ name: 'Charlie Livsey', role: 'Director' }], owners: [{ name: 'Charlie Livsey', kind: 'Individual', share: '100', control: [] }] }),
    co('hn-group-investments', 'HN Group Investments Limited', 'HN Group Investments', { parent: 'hn-group', managedBy: 'hn-group', description: 'A wholly owned subsidiary of HN Group Limited, managed by HN Group Limited.', owners: parentOwner('HN Group Limited') }),
    co('horizon-network', 'Horizon Network Limited', 'Horizon Network', { parent: 'hn-group-investments', website: 'horizon-network.co.uk', emailDomain: 'horizon-network.co.uk', divisions: ['Horizon Development'], owners: [...parentOwner('HN Group Investments Limited'), { name: 'Jack Example', kind: 'Individual', share: '', control: ['Has significant influence or control'] }] }),
    co('horizon-media-group', 'Horizon Media Group Limited', 'Horizon Media Group', { parent: 'hn-group-investments', owners: parentOwner('HN Group Investments Limited') }),
    co('horizon-advertising', 'Horizon Advertising Limited', 'Horizon Advertising', { parent: 'horizon-media-group', managedBy: 'horizon-network', website: 'horizonadvertising.co.uk', emailDomain: 'horizonadvertising.co.uk', owners: parentOwner('Horizon Media Group Limited') }),
    co('hn-group-management', 'HN Group Management Limited', 'HN Group Management', { parent: 'hn-group', emailDomain: 'holding.hngroup.org.uk', owners: parentOwner('HN Group Limited'), previousNames: [{ name: 'Horizon Holding Co Limited', until: '2026-10-17' }] }),
  ] };
  const register = http.createServer((req, res) => {
    if (req.url !== '/api/public/companies') { res.writeHead(404); return res.end(); }
    if (req.headers['if-none-match'] === '"' + regFeed.version + '"') { res.writeHead(304); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json', ETag: '"' + regFeed.version + '"' }); res.end(JSON.stringify(regFeed));
  });
  await new Promise((r) => register.listen(regPort, '127.0.0.1', r));
  const until = async (check, what) => { for (let i = 0; i < 100; i++) { if (await check()) return; await new Promise((r) => setTimeout(r, 50)); } throw new Error('timed out waiting for ' + what); };

  const env = { ...process.env, PORT: String(wikiPort), WIKI_DATA_DIR: path.join(dir, 'data'), WIKI_ORIGIN: WIKI, AUTH_ORIGIN: AUTH, AUTH_BACKEND: AUTH, STATUS_SSO_SECRET_FILE: path.join(dir, 'secret'), COMPANIES_FEED_URL: 'http://127.0.0.1:' + regPort + '/api/public/companies', COMPANIES_FEED_INTERVAL: '100' };
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
    // The register's companies arrive within a moment of starting.
    await until(async () => (await anon.go('/wiki/HN_Group_Investments')).status === 200, 'the register feed');
    // Reading
    for (const [route, text] of [['/wiki/Main_Page', 'Welcome to HN Group Wiki'], ['/wiki/HN_Group', 'parent company'], ['/wiki/Horizon_Network', 'horizon-network.co.uk'], ['/wiki/Horizon_Advertising', 'subsidiary of'], ['/wiki/Horizon_Development', 'Custom software'], ['/wiki/Horizon_Media_Group', 'media arm'], ['/wiki/Horizon_Assets_Management', 'Discord servers'], ['/wiki/Horizon_Network_Limited', 'Horizon Network Limited'], ['/wiki/List_of_HN_Group_companies', 'Horizon Advertising'], ['/wiki/Help:Editing', 'Infoboxes'], ['/wiki/Category:Companies', 'Pages in category']]) {
      const r = await anon.go(route); assert.equal(r.status, 200, route); assert.ok(r.text.includes(text), route + ' should mention ' + text);
    }
    assert.ok((await anon.go('/wiki/Horizon_Advertising')).text.includes('Managed by'), 'Advertising infobox shows who manages it');
    for (const t of ['HN_Group', 'Horizon_Network', 'Horizon_Advertising', 'Horizon_Development', 'Horizon_Media_Group', 'Horizon_Assets_Management', 'List_of_HN_Group_companies']) {
      const html = (await anon.go('/wiki/' + t)).text;
      assert.ok(!html.includes('Legal name') && !/(Network|Media Group|Group Management|Advertising) Limited/.test(html.replace(/<footer[\s\S]*$/, '')), t + ' shows no legal names');
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
    assert.ok(original.includes('{{Company infobox|HN Group'));

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

    // ---------- The Company Register ----------
    // Owners come from the register: a person, a company, or both.
    const hnPage = (await anon.go('/wiki/HN_Group')).text;
    assert.match(hnPage, /<th scope="row">Owner<\/th><td>Charlie Livsey \(100%\)<\/td>/);
    assert.ok(hnPage.includes('HN Group Investments') && hnPage.includes('Company Register'));
    const networkPage = (await anon.go('/wiki/Horizon_Network')).text;
    assert.match(networkPage, /<th scope="row">Owners<\/th><td><a href="\/wiki\/HN_Group_Investments">HN Group Investments<\/a> \(100%\)<br>Jack Example<\/td>/);
    assert.ok(networkPage.includes('Horizon Network is owned by'), 'ownership sentence');
    assert.ok(networkPage.includes('Jack Example. HN Group Investments is owned by <a href="/wiki/HN_Group">HN Group</a> (100%), which is owned by Charlie Livsey (100%).'), 'ownership chain');
    const advertising = (await anon.go('/wiki/Horizon_Advertising')).text;
    assert.match(advertising, /Managed by<\/th><td><a href="\/wiki\/Horizon_Network">/);
    assert.match(advertising, /Owner<\/th><td><a href="\/wiki\/Horizon_Media_Group">Horizon Media Group<\/a> \(100%\)/);
    // Automatically created article, registered-name redirect and no legal names in what's shown.
    const investments = await anon.go('/wiki/HN_Group_Investments');
    assert.ok(investments.text.includes('a company in <a href="/wiki/HN_Group">HN Group</a>') && investments.text.includes('managed by HN Group.'));
    assert.ok(!/Limited/.test(investments.text.replace(/<footer[\s\S]*$/, '')), 'no registered names on an automatic article');
    assert.ok((await anon.go('/wiki/HN_Group_Investments_Limited')).url.endsWith('/wiki/HN_Group_Investments?from=HN%20Group%20Investments%20Limited'));
    assert.ok((await anon.go('/wiki/List_of_HN_Group_companies')).text.includes('<a href="/wiki/HN_Group_Investments">HN Group Investments</a>'));
    assert.ok((await anon.go('/wiki/Main_Page')).text.includes('href="/wiki/HN_Group_Investments"'), 'Main Page card');
    // A new company on the register gets an article; a change of owner shows up without anyone editing.
    regFeed = { version: 'v2', companies: [...regFeed.companies.map((c) => c.slug === 'horizon-media-group' ? { ...c, owners: [...c.owners, { name: 'Ella Brooks', kind: 'Individual', share: '10', control: [] }] } : c),
      co('horizon-studios', 'Horizon Studios Limited', 'Horizon Studios', { parent: 'horizon-media-group', incorporated: '2026-10-20', description: 'Video production for Horizon Media Group Limited.', owners: parentOwner('Horizon Media Group Limited') })] };
    await until(async () => (await anon.go('/wiki/Horizon_Studios')).status === 200, 'the new company');
    const studios = (await anon.go('/wiki/Horizon_Studios')).text;
    assert.ok(studios.includes('Video production for Horizon Media Group.') && studios.includes('20 October 2026'));
    const media = (await anon.go('/wiki/Horizon_Media_Group')).text;
    assert.ok(media.includes('Ella Brooks (10%)') && media.includes('href="/wiki/Horizon_Studios"'), 'owners and subsidiaries follow the register');
    // Renaming on the register moves the article (staff edits kept) and leaves a redirect.
    const studioEdit = await ella.go('/wiki/Horizon_Studios?action=edit');
    await ella.form('/wiki/Horizon_Studios?action=submit', { text: sourceOf(studioEdit.text) + '\nStaff-written history.', save: '1', csrf, base: field(studioEdit.text, 'base') });
    regFeed = { version: 'v3', companies: regFeed.companies.map((c) => c.slug === 'horizon-studios' ? { ...c, name: 'Horizon Pictures', legalName: 'Horizon Pictures Limited', previousNames: [{ name: 'Horizon Studios Limited', until: '2026-10-20' }] } : c) };
    await until(async () => (await anon.go('/wiki/Horizon_Pictures')).status === 200, 'the renamed company');
    const pictures = await anon.go('/wiki/Horizon_Studios');
    assert.ok(pictures.url.endsWith('/wiki/Horizon_Pictures?from=Horizon%20Studios') && pictures.text.includes('Staff-written history.'));
    assert.ok(pictures.text.includes('<caption>Horizon Pictures</caption>'));
    // A dissolved company is shown as defunct everywhere: notice, infobox, ownership, list, tree, cards and category.
    regFeed = { version: 'v4', companies: regFeed.companies.map((c) => c.slug === 'horizon-studios' ? { ...c, status: 'Dissolved', dissolved: '2026-10-19' } : c) };
    await until(async () => (await anon.go('/wiki/Horizon_Pictures')).text.includes('Defunct since 19 October 2026'), 'the defunct status');
    const dissolved = (await anon.go('/wiki/Horizon_Pictures')).text;
    assert.ok(dissolved.includes('class="notice company-status status-defunct"') && dissolved.includes('Horizon Pictures is defunct: it ceased to exist as a company on 19 October 2026.'));
    assert.ok(!/dissolved/i.test(dissolved.replace(/<footer[\s\S]*$/, '')), 'the word shown is defunct');
    assert.match(dissolved, /<th scope="row">Status<\/th><td>Defunct since 19 October 2026<\/td>/);
    assert.ok(dissolved.includes('company-infobox status-defunct') && dissolved.includes('Horizon Pictures was owned by'));
    assert.ok(dissolved.includes('Defunct companies'), 'category');
    assert.ok((await anon.go('/wiki/Category:Defunct_companies')).text.includes('Horizon Pictures'));
    assert.ok((await anon.go('/wiki/List_of_HN_Group_companies')).text.includes('defunct since 19 October 2026'), 'tree');
    assert.ok((await anon.go('/wiki/Main_Page')).text.includes('company-card status-defunct'), 'card');
    assert.match((await anon.go('/wiki/HN_Group')).text, /<th scope="row">Status<\/th><td>Active<\/td>/, 'active companies show their status too');
    // Share classes: each owner's classes and votes, the company's classes and who has voting control.
    regFeed = { version: 'v5', companies: regFeed.companies.map((c) => c.slug === 'horizon-media-group' ? { ...c, shareClasses: { classA: 60, classB: 20, classC: 15 }, owners: [
      { name: 'HN Group Investments Limited', kind: 'Parent company', share: '60', classes: { A: '60', B: '', C: '' }, votes: 42, votingControl: false, control: [] },
      { name: 'Yasmin Staff', kind: 'Individual', share: '20', classes: { A: '', B: '20', C: '' }, votes: 7, votingControl: false, control: [] },
      { name: 'Zara Special', kind: 'Individual', share: '15', classes: { A: '', B: '', C: '15' }, votes: 51, votingControl: true, control: [] }] } : c) };
    await until(async () => (await anon.go('/wiki/Horizon_Media_Group')).text.includes('Voting control'), 'share classes');
    const classed = (await anon.go('/wiki/Horizon_Media_Group')).text;
    assert.ok(classed.includes('<a href="/wiki/HN_Group_Investments">HN Group Investments</a> (Class A 60% · 42% of votes)') && classed.includes('Zara Special (Class C 15% · 51% of votes)'));
    assert.match(classed, /<th scope="row">Share classes<\/th><td>Class A 60%<br>Class B 20%<br>Class C 15%<\/td>/);
    assert.match(classed, /<th scope="row">Voting control<\/th><td>Zara Special \(51% of votes, through Class C shares\)<\/td>/);
    assert.ok(classed.includes('so the votes are held as follows: Zara Special 51% (the largest holder of Class C shares, with more than 10% of them, holds 51% of the votes or more)'));

    // ---------- Images and logos ----------
    const png = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex').toString('base64');
    assert.equal((await anon.form('/wiki/Special:Upload', { file: png, name: 'x', csrf: '' })).status, 401);
    assert.ok((await anon.go('/wiki/Special:Upload')).text.includes('sign in'));
    const up = await ella.form('/wiki/Special:Upload', { file: png, name: 'Office Reception.png', description: 'Reception', csrf });
    assert.ok(up.url.includes('/wiki/Special:ListFiles?uploaded=office-reception.png') && up.text.includes('[[File:office-reception.png|thumb|Caption]]'));
    const stored = /src="(\/w\/upload\/[a-f0-9]{24}\.png)"/.exec(up.text)[1];
    const img = await fetch(WIKI + stored);
    assert.equal(img.headers.get('content-type'), 'image/png'); assert.match(img.headers.get('content-security-policy'), /sandbox/);
    const evil = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    assert.ok((await ella.form('/wiki/Special:Upload', { file: evil, name: 'evil', csrf })).text.includes('scripts or links'), 'SVG scripts refused');
    assert.ok((await ella.form('/wiki/Special:Upload', { file: 'data:text/html;base64,' + Buffer.from('<p>hi</p>').toString('base64'), csrf })).text.includes('Upload a PNG'));
    assert.equal((await fetch(WIKI + '/w/upload/../pages.json')).status, 404);
    // Changing a company's logo shows the new one everywhere at once; resetting brings the brand logo back.
    assert.ok((await ella.go('/wiki/Horizon_Network')).text.includes('/wiki/Special:CompanyLogo?company=horizon-network'), 'Logo tab');
    const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#5514B4"/></svg>').toString('base64');
    const logoSaved = await ella.form('/wiki/Special:CompanyLogo?company=horizon-network', { company: 'horizon-network', light: svg, csrf });
    assert.ok(logoSaved.url.endsWith('/wiki/Horizon_Network'));
    const newLogo = /<td colspan="2" class="ib-logo"><img class="" src="(\/w\/upload\/[a-f0-9]{24}\.svg)"/.exec(logoSaved.text)[1];
    assert.ok((await anon.go('/wiki/Main_Page')).text.includes(newLogo), 'Main Page card uses the new logo');
    assert.equal((await sug('horizon net'))[0].image.light, newLogo, 'search suggestions use the new logo');
    assert.ok((await anon.go('/wiki/Special:CompanyLogo')).text.includes(newLogo));
    await ella.form('/wiki/Special:CompanyLogo?company=horizon-network', { company: 'horizon-network', reset: '1', csrf });
    assert.ok((await anon.go('/wiki/Horizon_Network')).text.includes('/assets/brand/horizon-network-wordmark.svg'));

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
    await new Promise((r) => register.close(r));
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

test('HN Group Wiki: an empty register feed does not wipe the companies the wiki knows', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-wiki-empty-'));
  const port = await freePort();
  const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ version: 'empty', companies: [] })); });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const regPath = path.join(__dirname, 'lib', 'register.js');
  process.env.COMPANIES_FEED_URL = 'http://127.0.0.1:' + port + '/feed';
  delete require.cache[require.resolve(regPath)];
  try {
    const register = require(regPath);
    register.init(dir, { feed: { version: 'v1', companies: [{ slug: 'hn-group', name: 'HN Group', legalName: 'HN Group Limited', owners: [] }] } });
    assert.equal(await register.refresh(), false);
    assert.equal(register.all().length, 1, 'kept');
    assert.ok(register.find('HN Group'));
  } finally {
    delete process.env.COMPANIES_FEED_URL; delete require.cache[require.resolve(regPath)];
    await new Promise((r) => server.close(r)); fs.rmSync(dir, { recursive: true, force: true });
  }
});
