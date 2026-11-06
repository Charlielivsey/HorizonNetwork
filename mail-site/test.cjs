'use strict';
// HN Mail on HN Group's own mail server.   node --test mail-site/test.cjs
// The first test needs nothing else. The second (HN_MAIL_LIVE=1, in a test container where mail-server/install.sh has
// installed the real Postfix + Dovecot + Rspamd) runs HN Mail against the real mail server and the real mail
// administration site (mail-admin-site) with a stand-in staff backend and a stand-in HN Group Auth.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), { execFileSync } = require('node:child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-mail-'));
const secretFile = path.join(dir, 'secret'); fs.writeFileSync(secretFile, 'a'.repeat(64)); process.env.STATUS_SSO_SECRET_FILE = secretFile;
const hex = (c) => c.repeat(64);
const LIVE = process.env.HN_MAIL_LIVE === '1';

// ---- HN Group Auth stand-in: the account it hands over is set by each test ----
let authUser = null;
const auth = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
    const v = JSON.parse(body || '{}');
    assert.equal(req.headers.authorization, 'Bearer ' + 'a'.repeat(64)); assert.equal(v.client_id, 'mail');
    if (req.url === '/api/sso/avatar') { res.writeHead(404); return res.end(); }
    if (!authUser) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{"error":"Signed out"}'); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ session: hex('b'), user: authUser, expires: Date.now() + 86400000 }));
  });
});
// ---- the staff directory (people and pictures) and, without a live server, the mail directory ----
let adminBase = '';
async function fakeFetch(url, opts = {}) {
  const u = new URL(url), json = (status, v) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
  if (adminBase && url.startsWith(adminBase)) return fetch(url, opts);
  if (u.port === '5670') return json(200, { mailboxes: [], blocked: [] });
  if (u.port === '3250') {
    assert.equal(opts.headers.Authorization, 'Bearer ' + 'a'.repeat(64), 'staff list calls carry the service secret');
    if (u.pathname === '/api/auth/staff-directory') return json(200, { people: [{ id: 'p-jack', displayName: 'Jack', legalName: 'Jack Vinckx', jobTitle: 'Chief Executive Officer', company: 'HN Group', photo: true, emails: ['jack.vinckx@hngroup.org.uk'], email: 'jack.vinckx@hngroup.org.uk' }] });
    if (u.pathname === '/api/auth/directory-avatar') return new Response(Buffer.from('JPG!'), { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
  }
  if (u.hostname === 'staff.hngroup.org.uk') return new Response(Buffer.from('PNG!'), { status: 200, headers: { 'Content-Type': 'image/png' } });
  return json(404, {});
}

let base = '', server, cookie = '';
const req = (route, { method = 'GET', body, headers = {}, jar = true } = {}) => fetch(base + route, { method, redirect: 'manual', headers: { ...(jar && cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { Origin: base } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const getJson = async (route, opts) => { const r = await req(route, opts); return { status: r.status, body: await r.json().catch(() => ({})) }; };
async function signIn(user) {
  authUser = user;
  const start = await req('/auth/login', { jar: false });
  assert.equal(start.status, 302);
  const state = new URL(start.headers.get('location')).searchParams.get('state'), stateCookie = start.headers.getSetCookie()[0].split(';')[0];
  const back = await fetch(base + '/auth/callback?state=' + state + '&code=' + hex('c'), { redirect: 'manual', headers: { Cookie: stateCookie } });
  const set = back.headers.getSetCookie().find((c) => c.startsWith('hn_mail_session='));
  cookie = set ? set.split(';')[0] : '';
  if (set) await req('/'); // the page straight after signing in
  return back;
}

test.before(async () => {
  await new Promise((r) => auth.listen(0, '127.0.0.1', r));
  process.env.AUTH_BACKEND = 'http://127.0.0.1:' + auth.address().port;
  process.env.MAIL_ORIGIN = 'http://127.0.0.1';
});
test.after(() => { auth.close(); if (server) server.close(); });

async function start() {
  if (server) server.close();
  delete require.cache[require.resolve('./server')]; delete require.cache[require.resolve('./lib/auth')];
  const { createServer } = require('./server');
  server = createServer({ dir: path.join(dir, 'data'), fetcher: fakeFetch });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port; process.env.MAIL_ORIGIN = base;
  delete require.cache[require.resolve('./server')]; delete require.cache[require.resolve('./lib/auth')];
  server.close(); server = require('./server').createServer({ dir: path.join(dir, 'data'), fetcher: fakeFetch });
  await new Promise((r) => server.listen(Number(new URL(base).port), '127.0.0.1', r));
}

test('HN Mail: any HN Group Auth account signs in (no Google needed), never while impersonating; no mailbox is explained', async () => {
  await start();
  assert.equal((await req('/api/session', { jar: false })).status, 401);
  assert.match((await req('/', { jar: false })).headers.get('location'), /^\/auth\/login/);
  const imp = await signIn({ id: 'p9', accountId: 'acct-x', username: 'x@hngroup.org.uk', displayName: 'X', impersonated: true });
  assert.equal(imp.status, 403); assert.equal(cookie, '');
  assert.equal((await signIn({ id: 'p1', accountId: 'acct-ada', username: 'ada@hngroup.org.uk', displayName: 'Ada', recordIds: [] })).status, 302, 'no Google account needed');
  const s = (await getJson('/api/session')).body;
  assert.equal(s.gmail.connected, false); assert.match(s.gmail.problem, /don’t have a mailbox/);
  assert.match(s.hnSignature, /hn-group-email-logo\.png/, 'the HN Group signature is made for whoever is signed in');
  assert.equal(s.settings.imap.host, 'mx.hngroup.org.uk');
  assert.equal((await getJson('/api/labels')).status, 403, 'no mailbox, nothing to open');
  const reload = await req('/'); assert.equal(reload.status, 302, 'reloading signs in again through HN Group Auth');
  assert.equal((await req('/api/session')).status, 401);
  // Pictures in signatures are limited to HN Group's own logos and Google's image hosts.
  await signIn({ id: 'p1', accountId: 'acct-ada', username: 'ada@hngroup.org.uk', displayName: 'Ada', recordIds: [] });
  assert.equal((await req('/api/img?u=' + encodeURIComponent('https://evil.example/x.png'))).status, 404);
  const logo = await req('/api/img?u=' + encodeURIComponent('https://staff.hngroup.org.uk/assets/brand/png/hn-group-email-logo.png'));
  assert.equal(logo.status, 200); assert.deepEqual(Buffer.from(await logo.arrayBuffer()).subarray(0, 4), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  assert.equal((await req('/api/google/connect')).status, 404, 'no Google connection any more');
});

test('HN Mail on the real mail server: folders, conversations, body page, attachments, sending, send-as, drafts, app passwords', { skip: !LIVE && 'needs the real mail server (HN_MAIL_LIVE=1)' }, async () => {
  // The mail administration site, for real, with two staff records.
  const records = [
    { id: 'bbbbbbbbbbbbbbb1', displayName: 'Mail Test', emails: [{ address: 'mail.test@hngroup.org.uk', primary: true }], accounts: [{ id: 'acct-mt', username: 'mail.test@hngroup.org.uk', enabled: true }] },
    { id: 'bbbbbbbbbbbbbbb2', displayName: 'Other Person', emails: [{ address: 'other.person@horizon-network.co.uk', primary: true }], accounts: [{ id: 'acct-op', username: 'other.person@horizon-network.co.uk', enabled: true }] },
  ];
  const staff = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'application/json' }); s.end(JSON.stringify({ records })); });
  await new Promise((r) => staff.listen(0, '127.0.0.1', r)); process.env.STAFF_BACKEND = 'http://127.0.0.1:' + staff.address().port;
  const admin = require('../mail-admin-site/server').createServer({ dir: path.join(dir, 'admin'), syncEvery: 0 });
  await new Promise((r) => admin.listen(0, '127.0.0.1', r)); adminBase = 'http://127.0.0.1:' + admin.address().port; process.env.MAIL_ADMIN_BACKEND = adminBase;
  await admin.sync.run(null);
  const d = admin.directory, me = d.byRecord('bbbbbbbbbbbbbbb1'), billing = d.byAddress('billing@hngroup.org.uk');
  d.setMembers(null, billing.id, [{ mailbox: me.id, access: 'full', sendAs: true }]);
  await admin.sync.run(null);
  // Wait until Dovecot has read the new users file (it checks the file's time, in whole seconds).
  for (const [address, box] of [['mail.test@hngroup.org.uk', me], ['billing@hngroup.org.uk', billing]]) {
    for (let i = 0; i < 20 && !execFileSync('doveadm', ['user', address]).toString().includes('/var/vmail/' + box.id); i++) await new Promise((r) => setTimeout(r, 500));
  }
  await start();
  try {
    // Mail arrives (straight into the mailbox, as LMTP would).
    const mid = '<welcome-' + Date.now() + '@example.com>';
    const msg = (subject, extra, body) => ['From: Bob Smith <bob@example.com>', 'To: mail.test@hngroup.org.uk', 'Subject: ' + subject, 'Message-ID: ' + extra.mid, ...(extra.irt ? ['In-Reply-To: ' + extra.irt, 'References: ' + extra.irt] : []), 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="b1"', '', '--b1', 'Content-Type: multipart/related; boundary="b2"', '', '--b2', 'Content-Type: text/html; charset=utf-8', '',
      body, '--b2', 'Content-Type: image/png', 'Content-ID: <logo1>', 'Content-Transfer-Encoding: base64', '', Buffer.from('PNG!').toString('base64'), '--b2--', '--b1', 'Content-Type: application/pdf; name="report.pdf"', 'Content-Disposition: attachment; filename="report.pdf"', 'Content-Transfer-Encoding: base64', '', Buffer.from('PDF').toString('base64'), '--b1--', ''].join('\r\n');
    execFileSync('doveadm', ['save', '-u', 'mail.test@hngroup.org.uk'], { input: msg('Welcome', { mid }, '<p>Hi <img src="https://tracker.example/p.gif"><img src="cid:logo1"></p><img alt="HN Group" src="https://staff.hngroup.org.uk/assets/brand/png/hn-group-email-logo.png"><script>alert(1)</script><meta http-equiv="refresh" content="0;url=https://evil.example">') });
    execFileSync('doveadm', ['save', '-u', 'mail.test@hngroup.org.uk'], { input: msg('Re: Welcome', { mid: '<reply-' + Date.now() + '@example.com>', irt: mid }, '<p>And another thing</p>') });
    execFileSync('doveadm', ['save', '-u', 'billing@hngroup.org.uk'], { input: msg('Invoice question', { mid: '<inv-' + Date.now() + '@example.com>' }, '<p>Where is my invoice?</p>').replace('To: mail.test@hngroup.org.uk', 'To: billing@hngroup.org.uk') });

    await signIn({ id: 'bbbbbbbbbbbbbbb1', accountId: 'acct-mt', username: 'mail.test@hngroup.org.uk', displayName: 'Mail Test', recordIds: ['bbbbbbbbbbbbbbb1'] });
    const s = (await getJson('/api/session')).body;
    assert.equal(s.gmail.connected, true);
    assert.deepEqual(s.mailboxes.map((m) => m.email).sort(), ['billing@hngroup.org.uk', 'mail.test@hngroup.org.uk'], 'own mailbox and the shared one they’re a member of');
    const shared = s.mailboxes.find((m) => m.kind === 'shared');
    const boxes = (await getJson('/api/mailboxes')).body.mailboxes;
    assert.equal(boxes.find((m) => m.kind === 'shared').unread, 1); assert.equal(boxes.find((m) => m.kind === 'person').limitKB, 1048576, '1 GB quota shown');

    const labels = (await getJson('/api/labels')).body.labels;
    assert.equal(labels.find((l) => l.id === 'INBOX').unread, 2);
    const list = (await getJson('/api/threads?label=INBOX')).body;
    assert.equal(list.threads.length, 1, 'the reply joins its conversation'); assert.equal(list.threads[0].count, 2);
    assert.equal(list.threads[0].subject, 'Welcome'); assert.equal(list.threads[0].attachments, true); assert.equal(list.threads[0].snippet, 'And another thing');
    const t = (await getJson('/api/threads/' + list.threads[0].id)).body;
    const first = t.messages[0];
    assert.equal(first.remoteImages, true); assert.deepEqual(first.attachments.map((a) => a.name), ['report.pdf']);
    // The email body: its own locked-down page.
    const page = await req('/api/messages/' + first.id + '/body'), csp = page.headers.get('content-security-policy'), html = await page.text();
    assert.match(csp, /sandbox allow-scripts allow-popups/); assert.match(csp, /img-src data:;/, 'no outside images until asked');
    assert.doesNotMatch(html, /alert\(1\)/); assert.doesNotMatch(html, /http-equiv/);
    assert.match(html, /data:image\/png;base64,UE5HIQ==/, 'inline images are embedded');
    assert.match(html, /data-hn-logo="1" src="data:image\/png;base64,iVBOR/, 'HN Group logos use HN Mail’s own copies');
    assert.match((await req('/api/messages/' + first.id + '/body?theme=dark')).headers.get('content-type'), /text\/html/);
    assert.match(await (await req('/api/messages/' + first.id + '/body?theme=dark')).text(), /hnDusk\.apply/);
    const file = await req('/api/messages/' + first.id + '/parts/' + first.attachments[0].partId);
    assert.equal(file.headers.get('content-type'), 'application/octet-stream'); assert.match(file.headers.get('content-disposition'), /^attachment; filename="report.pdf"/); assert.equal(await file.text(), 'PDF');
    // Star, read, archive, back.
    assert.equal((await req('/api/threads/' + list.threads[0].id + '/modify', { method: 'POST', body: { add: ['STARRED'], remove: ['UNREAD'] } })).status, 200);
    assert.equal((await req('/api/threads/' + list.threads[0].id + '/modify', { method: 'POST', body: { remove: ['UNREAD'] }, headers: { Origin: 'https://evil.example' } })).status, 403, 'other sites can’t make changes');
    assert.equal((await getJson('/api/threads?label=STARRED')).body.threads.length, 2);
    assert.equal((await getJson('/api/labels')).body.labels.find((l) => l.id === 'INBOX').unread, 0);
    assert.equal((await req('/api/threads/' + list.threads[0].id + '/modify', { method: 'POST', body: { remove: ['INBOX'] } })).status, 200);
    assert.equal((await getJson('/api/threads?label=ARCHIVE')).body.threads.length, 1, 'archived');
    assert.equal((await getJson('/api/threads?label=ALL&q=' + encodeURIComponent('from:bob welcome'))).body.threads.length >= 2, true, 'search');

    // The shared mailbox, through the member's own account.
    const sharedList = (await getJson('/api/threads?label=INBOX&mb=' + shared.id)).body.threads;
    assert.equal(sharedList[0].subject, 'Invoice question');
    // Sending: as yourself, and as the shared mailbox only from it; anything else refused.
    const bad = await req('/api/send', { method: 'POST', body: { to: 'not an address', subject: 'x', html: 'x' } }); assert.equal(bad.status, 400);
    const okSend = await req('/api/send', { method: 'POST', body: { to: 'Bob Smith <bob@example.com>', subject: 'Hello Bob', html: '<p>Hi</p>' } });
    assert.equal(okSend.status, 200, await okSend.clone().text());
    assert.ok((await getJson('/api/threads?label=SENT')).body.threads.some((x) => x.subject === 'Hello Bob'), 'kept in Sent');
    assert.equal((await req('/api/send', { method: 'POST', body: { from: 'billing@hngroup.org.uk', to: 'bob@example.com', subject: 'x', html: 'x' } })).status, 403, 'not from your own mailbox');
    assert.equal((await req('/api/send', { method: 'POST', body: { mb: shared.id, from: 'billing@hngroup.org.uk', to: 'bob@example.com', subject: 'Re: Invoice question', html: '<p>Sent it</p>' } })).status, 200, 'send as the shared mailbox');
    assert.equal((await req('/api/send', { method: 'POST', body: { mb: shared.id, from: 'mail.test@hngroup.org.uk', to: 'bob@example.com', subject: 'x', html: 'x' } })).status, 403, 'only the shared address from the shared mailbox');
    await new Promise((r) => setTimeout(r, 2500));
    assert.ok((await getJson('/api/threads?label=SENT&mb=' + shared.id)).body.threads.some((x) => x.subject === 'Re: Invoice question'), 'the shared mailbox keeps one shared Sent folder');
    // Drafts (with an attachment), opened again, then deleted.
    const draft = (await getJson('/api/drafts', { method: 'POST', body: { to: 'bob@example.com', subject: 'Draft one', html: '<p>Draft</p>', attachments: [{ name: 'notes.txt', type: 'text/plain', data: Buffer.from('notes').toString('base64') }] } })).body;
    assert.match(draft.draftId, /^[a-f0-9]{24}$/);
    const again = (await getJson('/api/drafts', { method: 'POST', body: { draftId: draft.draftId, to: 'bob@example.com', subject: 'Draft two', html: '<p>Draft</p>', include: [{ messageId: draft.draftId, partId: '2' }] } })).body;
    const opened = (await getJson('/api/drafts/for/' + again.draftId)).body;
    assert.equal(opened.subject, 'Draft two'); assert.deepEqual(opened.attachments.map((a) => a.name), ['notes.txt'], 'attachments kept when a draft is saved again');
    assert.equal((await getJson('/api/labels')).body.labels.find((l) => l.id === 'DRAFT').drafts, 1, 'each save replaces the last');
    assert.equal((await req('/api/drafts/' + again.draftId, { method: 'DELETE' })).status, 200);
    // Mailboxes that aren't yours can't be opened.
    const other = d.byRecord('bbbbbbbbbbbbbbb2');
    assert.equal((await getJson('/api/threads?label=INBOX&mb=' + other.id)).status, 403);
    // Mail app passwords: made here, they open the mailbox in a mail app (IMAP), and can be removed.
    const made = (await getJson('/api/app-passwords', { method: 'POST', body: { label: 'Test phone' } })).body;
    assert.match(made.password, /^[a-z2-9]{5}(-[a-z2-9]{5}){3}$/);
    await new Promise((r) => setTimeout(r, 1500));
    const { connect } = require('./lib/imap');
    const c = await connect({ user: 'mail.test@hngroup.org.uk', pass: made.password }); await c.logout();
    await assert.rejects(connect({ user: 'other.person@horizon-network.co.uk', pass: made.password }), 'an app password only opens its own mailbox');
    const listed = (await getJson('/api/app-passwords')).body.appPasswords; assert.equal(listed.length, 1); assert.equal(listed[0].label, 'Test phone'); assert.ok(!('hash' in listed[0]));
    assert.equal((await req('/api/app-passwords', { method: 'DELETE', body: { id: made.id } })).status, 200);
    await new Promise((r) => setTimeout(r, 1500));
    await assert.rejects(connect({ user: 'mail.test@hngroup.org.uk', pass: made.password }), 'a removed app password stops working');
    assert.match((await getJson('/api/pulse')).body.historyId, /^[a-f0-9]{16}$/);
  } finally { admin.close(); staff.close(); }
});
