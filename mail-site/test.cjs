'use strict';
// HN Mail (the user's request, 6 November 2026). Runs the real server against stand-ins for HN Group Auth, Google and
// Gmail.   node --test mail-site/test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-mail-'));
const secretFile = path.join(dir, 'secret'); fs.writeFileSync(secretFile, 'a'.repeat(64));
const googleFile = path.join(dir, 'google-oauth.json'); fs.writeFileSync(googleFile, JSON.stringify({ client_id: 'test.apps.googleusercontent.com', client_secret: 'secret-1234' }));
const hex = (c) => c.repeat(64);

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

// ---- Google and Gmail stand-ins (the server's fetch) ----
const sent = [], revoked = [];
let googleAnswer = { sub: 'g-ada', email: 'ada@hngroup.org.uk', scope: 'openid email https://www.googleapis.com/auth/gmail.modify' }, nonce = '';
const idToken = (claims) => 'x.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.y';
const b64 = (s) => Buffer.from(s).toString('base64url');
const MESSAGE = { id: 'aaaaaaaa11', threadId: 'bbbbbbbb22', labelIds: ['INBOX', 'UNREAD'], internalDate: String(Date.now()), snippet: 'Hello &amp; welcome',
  payload: { mimeType: 'multipart/mixed', headers: [{ name: 'From', value: 'Bob Smith <bob@example.com>' }, { name: 'To', value: 'ada@hngroup.org.uk' }, { name: 'Subject', value: 'Welcome' }, { name: 'Message-ID', value: '<m1@example.com>' }, { name: 'Content-Type', value: 'multipart/mixed' }],
    parts: [{ partId: '0', mimeType: 'text/html', headers: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: { data: b64('<p>Hi <img src="https://tracker.example/p.gif"><img src="cid:logo1"></p><img alt="HN Group" src="https://staff.hngroup.org.uk/assets/brand/png/hn-group-email-logo.png"><script>alert(1)</script><meta http-equiv="refresh" content="0;url=https://evil.example">') } },
      { partId: '1', mimeType: 'image/png', filename: 'logo.png', headers: [{ name: 'Content-ID', value: '<logo1>' }, { name: 'Content-Disposition', value: 'inline' }], body: { attachmentId: 'att-logo', size: 4 } },
      { partId: '2', mimeType: 'application/pdf', filename: 'report.pdf', headers: [{ name: 'Content-Disposition', value: 'attachment; filename="report.pdf"' }], body: { attachmentId: 'att-pdf', size: 3 } }] } };
async function fakeFetch(url, opts = {}) {
  const u = new URL(url), json = (status, v) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.href === 'https://oauth2.googleapis.com/token') {
    const form = new URLSearchParams(opts.body);
    if (form.get('grant_type') === 'refresh_token') return form.get('refresh_token') === 'refresh-ada' ? json(200, { access_token: 'access-2', expires_in: 3600 }) : json(400, { error: 'invalid_grant' });
    assert.ok(form.get('code_verifier')); assert.equal(form.get('client_secret'), 'secret-1234');
    return json(200, { access_token: 'access-1', expires_in: 3600, refresh_token: 'refresh-ada', scope: googleAnswer.scope,
      id_token: idToken({ iss: 'https://accounts.google.com', aud: 'test.apps.googleusercontent.com', exp: Date.now() / 1000 + 600, nonce, sub: googleAnswer.sub, email: googleAnswer.email, email_verified: true }) });
  }
  if (u.hostname === 'staff.hngroup.org.uk') return u.pathname.endsWith('.png') ? new Response(Buffer.from('PNG!'), { status: 200, headers: { 'Content-Type': 'image/png' } }) : new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
  if (u.origin === 'https://oauth2.googleapis.com' && u.pathname === '/revoke') { revoked.push(u.searchParams.get('token')); return json(200, {}); }
  assert.ok(String(opts.headers && opts.headers.Authorization).startsWith('Bearer access-'), 'Gmail calls carry the access token');
  const p = u.pathname.replace('/gmail/v1/users/me', '').replace('/upload', '');
  if (p === '/labels') return json(200, { labels: [{ id: 'INBOX', type: 'system' }, { id: 'Label_1', name: 'Projects', type: 'user' }] });
  if (p.startsWith('/labels/')) return json(200, { id: decodeURIComponent(p.slice(8)), name: 'Projects', type: p.includes('INBOX') ? 'system' : 'user', threadsUnread: 2, threadsTotal: 9 });
  if (p === '/threads') return json(200, { threads: [{ id: 'bbbbbbbb22' }], resultSizeEstimate: 1 });
  if (p === '/threads/bbbbbbbb22') return json(200, { id: 'bbbbbbbb22', messages: [MESSAGE] });
  if (p === '/messages/aaaaaaaa11') return json(200, MESSAGE);
  if (p === '/messages/aaaaaaaa11/attachments/att-logo') return json(200, { data: b64('PNG!') });
  if (p === '/messages/aaaaaaaa11/attachments/att-pdf') return json(200, { data: b64('PDF') });
  if (p === '/settings/sendAs') return json(200, { sendAs: [{ sendAsEmail: 'ada@hngroup.org.uk', displayName: 'Ada Test', isDefault: true, signature: '<b>Ada</b>' }] });
  if (p === '/threads/bbbbbbbb22/modify') return json(200, {});
  if (p === '/messages/send') { sent.push({ url: u.href, body: Buffer.from(opts.body).toString('utf8'), type: opts.headers['Content-Type'] }); return json(200, { id: 'cccccccc33', threadId: 'bbbbbbbb22' }); }
  return json(404, { error: { message: 'not found ' + p } });
}

let base = '', server, cookie = '';
const req = (route, { method = 'GET', body, headers = {}, jar = true } = {}) => fetch(base + route, { method, redirect: 'manual', headers: { ...(jar && cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { Origin: base } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
async function signIn(user) {
  authUser = user;
  const start = await req('/auth/login', { jar: false });
  assert.equal(start.status, 302);
  const state = new URL(start.headers.get('location')).searchParams.get('state'), stateCookie = start.headers.getSetCookie()[0].split(';')[0];
  const back = await fetch(base + '/auth/callback?state=' + state + '&code=' + hex('c'), { redirect: 'manual', headers: { Cookie: stateCookie } });
  const set = back.headers.getSetCookie().find((c) => c.startsWith('hn_mail_session='));
  cookie = set ? set.split(';')[0] : '';
  return back;
}
const ADA = { id: 'p1', accountId: 'acct-ada', username: 'ada@hngroup.org.uk', displayName: 'Ada', google: { email: 'ada@hngroup.org.uk', sub: 'g-ada' } };

test('HN Mail: only accounts with a linked Google account, never while impersonating', async () => {
  await new Promise((r) => auth.listen(0, '127.0.0.1', r));
  process.env.AUTH_BACKEND = 'http://127.0.0.1:' + auth.address().port; process.env.STATUS_SSO_SECRET_FILE = secretFile;
  const probe = http.createServer(); await new Promise((r) => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise((r) => probe.close(r));
  base = 'http://127.0.0.1:' + port; process.env.MAIL_ORIGIN = base;
  const { createServer } = require('./server');
  server = createServer({ dir: path.join(dir, 'data'), fetcher: fakeFetch, googleFile });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));

  assert.equal((await req('/api/session', { jar: false })).status, 401);
  assert.match((await req('/', { jar: false })).headers.get('location'), /^\/auth\/login/);
  const noGoogle = await signIn({ ...ADA, google: null });
  assert.equal(noGoogle.status, 403); assert.match(await noGoogle.text(), /Link a Google account first/);
  assert.equal(cookie, '', 'no session without a linked Google account');
  const imp = await signIn({ ...ADA, impersonated: true });
  assert.equal(imp.status, 403); assert.equal(cookie, '');
  assert.equal((await signIn(ADA)).status, 302);
  const s = await (await req('/api/session')).json();
  assert.equal(s.gmail.connected, false); assert.equal(s.gmail.linkedEmail, 'ada@hngroup.org.uk');
  assert.match(s.hnSignature, /hn-group-email-logo\.png/, 'the HN Group signature is made for whoever is signed in');
  // HN Mail asks for HN Group Auth on every reload (the user's request, 6 November 2026).
  assert.equal((await req('/')).status, 200, 'the page straight after signing in opens');
  const reload = await req('/');
  assert.equal(reload.status, 302); assert.match(reload.headers.get('location'), /^\/auth\/login/);
  assert.equal((await req('/api/session')).status, 401, 'reloading ended that sign-in');
  assert.equal((await signIn(ADA)).status, 302);
  assert.equal((await req('/api/labels')).status, 409, 'Gmail must be connected first');
});

async function connect() {
  const go = await req('/google/connect');
  assert.equal(go.status, 302);
  const to = new URL(go.headers.get('location'));
  assert.equal(to.origin + to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.match(to.searchParams.get('scope'), /gmail\.modify/); assert.equal(to.searchParams.get('login_hint'), 'ada@hngroup.org.uk'); assert.equal(to.searchParams.get('access_type'), 'offline');
  nonce = to.searchParams.get('nonce');
  const bound = go.headers.getSetCookie()[0].split(';')[0];
  return req('/google/callback?state=' + to.searchParams.get('state') + '&code=abc', { headers: { Cookie: cookie + '; ' + bound } });
}

test('HN Mail: Gmail is only connected for the linked Google account, and its key is kept encrypted', async () => {
  googleAnswer = { ...googleAnswer, sub: 'g-someone-else', email: 'other@gmail.com' };
  const wrong = await connect();
  assert.equal(wrong.status, 403); assert.match(await wrong.text(), /isn’t the Google account linked/);
  googleAnswer = { ...googleAnswer, sub: 'g-ada', email: 'ada@hngroup.org.uk', scope: 'openid email' };
  const noScope = await connect();
  assert.equal(noScope.status, 403); assert.match(await noScope.text(), /Gmail access wasn’t allowed/);
  googleAnswer.scope = 'openid email https://www.googleapis.com/auth/gmail.modify';
  const forged = await req('/google/callback?state=' + 'd'.repeat(64) + '&code=abc');
  assert.equal(forged.status, 400, 'a state this browser didn’t start is refused');
  const ok = await connect();
  assert.equal(ok.status, 302); assert.equal(ok.headers.get('location'), '/');
  const stored = fs.readFileSync(path.join(dir, 'data', 'grants.json'), 'utf8');
  assert.ok(!stored.includes('refresh-ada'), 'the refresh token is never stored in plain text');
  assert.equal((await (await req('/api/session')).json()).gmail.connected, true);
});

test('HN Mail: labels, conversations, a locked-down body page and downloads', async () => {
  const labels = (await (await req('/api/labels')).json()).labels;
  assert.deepEqual(labels.map((l) => l.name), ['Inbox'], 'only the built-in folders (labels were removed at the user’s request)'); assert.equal(labels[0].unread, 2);
  const list = await (await req('/api/threads?label=INBOX')).json();
  assert.equal(list.threads[0].subject, 'Welcome'); assert.equal(list.threads[0].unread, true); assert.equal(list.threads[0].snippet, 'Hello & welcome');
  const t = await (await req('/api/threads/bbbbbbbb22')).json();
  assert.equal(t.messages[0].remoteImages, true); assert.deepEqual(t.messages[0].attachments.map((a) => a.name), ['report.pdf']);
  const body = await req('/api/messages/aaaaaaaa11/body');
  const csp = body.headers.get('content-security-policy'), html = await body.text();
  assert.match(csp, /sandbox allow-scripts allow-popups/); assert.match(csp, /img-src data:;/, 'no outside images until asked');
  assert.match(csp, /script-src 'nonce-/); assert.doesNotMatch(html, /alert\(1\)/); assert.doesNotMatch(html, /http-equiv/);
  assert.match(html, /data:image\/png;base64,UE5HIQ==/, 'inline images are embedded');
  assert.match(html, /<img alt="HN Group" data-hn-logo="1" src="data:image\/png;base64,iVBOR/, 'HN Group signature logos use HN Mail’s see-through copy, shown even before Show images');
  assert.match((await req('/api/messages/aaaaaaaa11/body?images=1')).headers.get('content-security-policy'), /img-src data: https:/);
  assert.doesNotMatch(html, /invert/, 'Light Lavender shows emails as they are');
  assert.match(await (await req('/api/messages/aaaaaaaa11/body?theme=dark')).text(), /html\{filter:invert\(1\)/, 'Midnight Lavender turns emails dark (no white box)');
  // Signature pictures: only HN Group's sites and Google's image hosts, only real images.
  assert.equal((await req('/api/img?u=' + encodeURIComponent('https://evil.example/x.png'))).status, 404);
  assert.equal((await req('/api/img?u=' + encodeURIComponent('http://staff.hngroup.org.uk/x.png'))).status, 404);
  const logo = await req('/api/img?u=' + encodeURIComponent('https://staff.hngroup.org.uk/assets/brand/png/hn-group-email-logo.png'));
  assert.equal(logo.status, 200); assert.equal(logo.headers.get('content-type'), 'image/png'); assert.match(logo.headers.get('content-security-policy'), /sandbox/);
  assert.deepEqual(Buffer.from(await logo.arrayBuffer()).subarray(0, 4), Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'HN Group signature logos come from HN Mail’s own copy');
  assert.equal((await req('/api/img?u=' + encodeURIComponent('https://staff.hngroup.org.uk/page.html'))).status, 404, 'not an image');
  const file = await req('/api/messages/aaaaaaaa11/parts/2');
  assert.equal(file.headers.get('content-type'), 'application/octet-stream'); assert.match(file.headers.get('content-disposition'), /^attachment; filename="report.pdf"/);
  assert.equal(await file.text(), 'PDF');
  assert.equal((await req('/api/threads/bbbbbbbb22/modify', { method: 'POST', body: { remove: ['UNREAD'] } })).status, 200);
  assert.equal((await req('/api/threads/bbbbbbbb22/modify', { method: 'POST', body: { remove: ['UNREAD'] }, headers: { Origin: 'https://evil.example' } })).status, 403, 'changes only from HN Mail itself');
});

test('HN Mail: sending builds a proper email through Gmail’s upload address', async () => {
  const bad = await req('/api/send', { method: 'POST', body: { to: 'not an address', subject: 'x', html: 'x' } });
  assert.equal(bad.status, 400); assert.match((await bad.json()).error, /isn’t an email address/);
  const big = await req('/api/send', { method: 'POST', body: { to: 'bob@example.com', attachments: [{ name: 'big.bin', type: 'application/octet-stream', data: Buffer.alloc(26 * 1024 * 1024).toString('base64') }] } });
  assert.equal(big.status, 413);
  const r = await req('/api/send', { method: 'POST', body: { to: 'Bob Smith <bob@example.com>', cc: 'carol@example.com', subject: 'Re: Welcome', html: '<p>Thanks!</p>', threadId: 'bbbbbbbb22', inReplyTo: '<m1@example.com>', references: '<m1@example.com>',
    attachments: [{ name: 'notes.txt', type: 'text/plain', data: Buffer.from('notes').toString('base64') }], include: [{ messageId: 'aaaaaaaa11', partId: '2' }] } });
  assert.equal(r.status, 200, await r.clone().text());
  const last = sent[sent.length - 1];
  assert.match(last.url, /\/upload\/gmail\/v1\/users\/me\/messages\/send\?uploadType=multipart/); assert.match(last.type, /^multipart\/related/);
  assert.match(last.body, /"threadId":"bbbbbbbb22"/);
  assert.match(last.body, /From: "Ada Test" <ada@hngroup\.org\.uk>/); assert.match(last.body, /To: "Bob Smith" <bob@example\.com>/); assert.match(last.body, /In-Reply-To: <m1@example\.com>/);
  assert.match(last.body, /filename="notes.txt"/); assert.match(last.body, /filename="report.pdf"/, 'forwarded attachments come from Gmail');
});

test('HN Mail: a changed linked Google account drops the old grant; disconnecting revokes it', async () => {
  authUser = { ...ADA, google: { email: 'ada@hngroup.org.uk', sub: 'g-ada' } };
  assert.equal((await req('/api/google/disconnect', { method: 'POST' })).status, 200);
  assert.deepEqual(revoked, ['refresh-ada']);
  assert.equal((await (await req('/api/session')).json()).gmail.connected, false);
  assert.equal((await connect()).status, 302);
  // Someone links a different Google account on Auth: HN Mail stops using the old one at once (within its 30 s check).
  authUser = { ...ADA, google: { email: 'ada.new@gmail.com', sub: 'g-new' } };
  const fresh = await signIn(authUser);
  assert.equal(fresh.status, 302);
  assert.equal((await (await req('/api/session')).json()).gmail.connected, false);
  server.close(); auth.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
