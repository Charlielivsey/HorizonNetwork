'use strict';
// Continue with Discord: a new staff record needs its Discord user ID, connecting only accepts that Discord account,
// signing in with it (no password or PIN, nothing remembered), the bot keeping usernames current, and turning it off.
// The real staff account service and Auth run here; only Discord's API is a stand-in.
//   node --test auth-site/discord.test.cjs
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), { spawn } = require('node:child_process');

test('Continue with Discord: Discord ID on the staff record, connect, sign in, bot usernames', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-auth-discord-'));
  const store = require('../staff-portal/lib/store'); store.init(dir);
  const person = store.saveEmployee({ firstName: 'Dee', lastName: 'Scord', company: store.COMPANIES[0], jobTitle: 'Team member', discordId: '111111111111111111', emails: [{ local: 'dee.scord', domain: 'hngroup.org.uk', primary: true }] });
  store.issueTemporaryPassword(person); store.setPassword(person, 'Cedar-river-9842!'); store.setCode(person, '582947');
  assert.throws(() => store.saveEmployee({ firstName: 'Bad', lastName: 'Id', company: store.COMPANIES[0], jobTitle: 'x', discordId: 'abc', emails: [{ local: 'bad.id', domain: 'hngroup.org.uk', primary: true }] }), /Discord user ID/);
  const secret = path.join(dir, 'secret'); fs.writeFileSync(secret, 'f'.repeat(64)); process.env.STATUS_SSO_SECRET_FILE = secret;
  const discordFile = path.join(dir, 'discord.json'); process.env.DISCORD_OAUTH_FILE = discordFile; process.env.HN_DISCORD_PRESENCE = '0';
  const reserve = http.createServer(); await new Promise((r) => reserve.listen(0, '127.0.0.1', r)); const port = reserve.address().port; await new Promise((r) => reserve.close(r));
  const child = spawn(process.execPath, [path.resolve(__dirname, '../staff-portal/server.js')], { env: { ...process.env, PORT: String(port), DATA_DIR: dir }, stdio: 'ignore' });
  process.env.STAFF_PORTAL_BACKEND = 'http://127.0.0.1:' + port;
  // Discord's API: the token endpoint, /users/@me for whoever `fake.next` is, and the bot's /users/<id>.
  const realFetch = global.fetch, fake = { next: null, names: { '111111111111111111': 'dee_new_name' }, codes: new Set() };
  global.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u === 'https://discord.com/api/v10/oauth2/token') {
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('client_id'), '1564969421800472698'); assert.equal(form.get('client_secret'), 'discord-secret-123');
      assert.equal(form.get('redirect_uri'), 'https://auth.hngroup.org.uk/discord/callback');
      if (!fake.codes.has(form.get('code'))) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({ access_token: 'user-token', token_type: 'Bearer' });
    }
    if (u === 'https://discord.com/api/v10/users/@me') { assert.equal(options.headers.Authorization, 'Bearer user-token'); return Response.json(fake.next); }
    const m = /^https:\/\/discord\.com\/api\/v10\/users\/(\d+)$/.exec(u);
    if (m) { assert.equal(options.headers.Authorization, 'Bot ' + 'b'.repeat(70)); return fake.names[m[1]] ? Response.json({ id: m[1], username: fake.names[m[1]], global_name: 'Dee S', avatar: 'a'.repeat(32) }) : new Response('{}', { status: 404 }); }
    return realFetch(url, options);
  };
  const { server, discord } = require('./server'); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port, origin = 'https://auth.hngroup.org.uk';
  const cookie = (res, name) => res.headers.getSetCookie().find((c) => c.startsWith(name + '='))?.split(';')[0];
  const post = (route, data, jar = '') => fetch(base + route, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: jar }, body: JSON.stringify(data) });
  async function viaDiscord(start, jar, who) {
    assert.equal(start.status, 200); const { url } = await start.json(), u = new URL(url), binding = cookie(start, '__Host-hn_auth_discord');
    assert.equal(u.origin + u.pathname, 'https://discord.com/oauth2/authorize'); assert.equal(u.searchParams.get('scope'), 'identify');
    const code = String(Math.random()).slice(2); fake.codes.add(code); fake.next = who;
    const back = await fetch(base + '/discord/callback?state=' + u.searchParams.get('state') + '&code=' + code, { headers: { Cookie: [jar, binding].filter(Boolean).join('; ') }, redirect: 'manual' });
    const result = await post('/api/discord/result', {}, cookie(back, '__Host-hn_auth_discord_result'));
    return { location: back.headers.get('location'), result, value: await result.clone().json() };
  }
  const me = { id: '111111111111111111', username: 'dee_discord' };
  try {
    let ready = false; for (let i = 0; i < 100; i++) { try { if ((await realFetch(process.env.STAFF_PORTAL_BACKEND + '/healthz')).ok) { ready = true; break; } } catch {} await new Promise((r) => setTimeout(r, 50)); } assert.ok(ready);
    assert.deepEqual(await (await fetch(base + '/api/discord')).json(), { enabled: false }, 'hidden until set up');
    fs.writeFileSync(discordFile, JSON.stringify({ client_id: '1564969421800472698', client_secret: 'discord-secret-123', bot_token: 'b'.repeat(70) }));
    assert.deepEqual(await (await fetch(base + '/api/discord')).json(), { enabled: true });
    // Not connected yet.
    let d = await viaDiscord(await post('/api/discord/start', { mode: 'login', next: '/' }), '', me);
    assert.match(d.value.error, /isn’t connected/);
    // Connecting: only the Discord account on the staff record.
    const login = await post('/api/login', { username: 'dee.scord@hngroup.org.uk', password: 'Cedar-river-9842!' });
    const signed = await post('/api/login/code', { code: '582947' }, cookie(login, '__Host-hn_auth_flow'));
    const session = cookie(signed, '__Host-hn_auth_session');
    d = await viaDiscord(await post('/api/discord/start', { mode: 'link', next: '/' }, session), session, { id: '222222222222222222', username: 'someone_else' });
    assert.match(d.value.error, /Discord account that’s on your staff profile/);
    d = await viaDiscord(await post('/api/discord/start', { mode: 'link', next: '/' }, session), session, me);
    assert.deepEqual(d.value, { linked: 'dee_discord' });
    assert.equal((await (await fetch(base + '/api/me', { headers: { Cookie: session } })).json()).user.discord.username, 'dee_discord');
    // Signing in with Discord: straight in, nothing remembered.
    const next = '/authorize?client_id=portal&state=' + 'a'.repeat(64);
    d = await viaDiscord(await post('/api/discord/start', { mode: 'login', next }), '', me);
    assert.equal(d.location, next + '&discord=1'); assert.equal(d.result.status, 200, JSON.stringify(d.value));
    assert.ok(cookie(d.result, '__Host-hn_auth_session')); assert.equal(cookie(d.result, '__Host-hn_auth_resume'), undefined);
    // The bot keeps the username on the account and the staff record up to date.
    assert.equal(await discord.refreshNames(), 2);
    const status = await (await realFetch(process.env.STAFF_PORTAL_BACKEND + '/api/auth/discord-accounts', { method: 'POST', headers: { Authorization: 'Bearer ' + 'f'.repeat(64), 'Content-Type': 'application/json' }, body: '{}' })).json();
    assert.deepEqual(status.ids, ['111111111111111111']);
    const people = JSON.parse(fs.readFileSync(path.join(dir, 'people.json'))), stored = people.find((p) => p.id === person.id).discord;
    assert.equal(stored.username, 'dee_new_name'); assert.equal(stored.globalName, 'Dee S'); assert.equal(stored.avatar, 'a'.repeat(32), 'the Discord profile picture too');
    // A forged return is refused; turning it off stops Discord sign-in.
    const forged = await fetch(base + '/discord/callback?state=' + 'b'.repeat(64) + '&code=x', { redirect: 'manual' });
    assert.match((await (await post('/api/discord/result', {}, cookie(forged, '__Host-hn_auth_discord_result'))).json()).error, /expired/);
    const off = await post('/api/discord/unlink', {}, session); assert.equal(off.status, 200); assert.equal((await off.json()).user.discord, null);
    d = await viaDiscord(await post('/api/discord/start', { mode: 'login', next: '/' }), '', me);
    assert.match(d.value.error, /isn’t connected/);
  } finally {
    global.fetch = realFetch;
    await new Promise((r) => server.close(r)); if (child.exitCode === null) { child.kill(); await new Promise((r) => child.once('exit', r)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
