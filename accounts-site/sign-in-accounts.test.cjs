'use strict';
// Sign-in accounts (the user's request, 28 October 2026): accounts are separate from staff records, are made only on
// HN Account, have their own password, PIN and permissions, and can use several profiles (each company on a staff
// record is its own profile) with a default, or none. HN Group Auth asks which profile to use. The real staff
// account service, Auth and HN Account run here with temporary data.
//   node --test accounts-site/sign-in-accounts.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { spawn } = require('node:child_process');

const freePort = async () => { const s = http.createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise((r) => s.close(r)); return p; };
const cookieOf = (res, name) => (res.headers.getSetCookie().find((c) => c.startsWith(name + '=')) || '').split(';')[0];
const waitFor = async (url) => { for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 50)); } throw new Error('did not start: ' + url); };

test('sign-in accounts: made on HN Account, several profiles with a default, own permissions, none at all', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-sign-in-accounts-'));
  const store = require('../staff-portal/lib/store'); store.init(dir);
  const make = (first, local, password, pin, extra) => { const p = store.saveEmployee({ firstName: first, lastName: 'Test', jobTitle: 'Analyst', company: 'HN Group', emails: [{ local, domain: 'hngroup.org.uk', primary: true }], ...extra }); if (password) { store.issueTemporaryPassword(p); store.setPassword(p, password); store.setCode(p, pin); } return p; };
  const ada = make('Ada', 'ada.test', 'Ada-password-582!', '582947');
  const sam = make('Sam', 'sam.test', 'Sam-password-582!', '493817', { otherRoles: [{ company: 'Horizon Network', jobTitle: 'Network engineer' }] });
  const nia = make('Nia', 'nia.test');
  store.setRoleMembers(store.listRoles().find((r) => r.name === 'Super Admin'), [ada.id]);
  store.saveAvatar(sam, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
  const itRole = store.listRoles().find((r) => r.name === 'IT Support');
  const secret = path.join(dir, 'secret'); fs.writeFileSync(secret, 'e'.repeat(64));

  const [authPort, staffPort, accPort] = [await freePort(), await freePort(), await freePort()];
  const authBase = 'http://127.0.0.1:' + authPort, staffBase = 'http://127.0.0.1:' + staffPort, ACC = 'http://127.0.0.1:' + accPort;
  const staffProc = spawn(process.execPath, ['staff-portal/server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(staffPort), DATA_DIR: dir, AUTH_BACKEND: authBase, STATUS_SSO_SECRET_FILE: secret }, stdio: ['ignore', 'ignore', 'inherit'] });
  process.env.STAFF_PORTAL_BACKEND = staffBase; process.env.STATUS_SSO_SECRET_FILE = secret;
  const { server: auth } = require('../auth-site/server'); await new Promise((r) => auth.listen(authPort, '127.0.0.1', r));
  const acc = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(accPort), ACCOUNTS_ORIGIN: ACC, AUTH_ORIGIN: authBase, AUTH_BACKEND: authBase, STAFF_BACKEND: staffBase, STATUS_SSO_SECRET_FILE: secret }, stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    await waitFor(staffBase + '/healthz'); await waitFor(ACC + '/healthz');
    const authPost = (route, data, cookie = '') => fetch(authBase + route, { method: 'POST', headers: { Origin: 'https://auth.hngroup.org.uk', 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(data) });
    // Signs in at Auth (password, then the PIN if there is one); returns the Auth session cookie and the user.
    async function authSignIn(username, password, pin) {
      const login = await authPost('/api/login', { username, password });
      assert.equal(login.status, 200, await login.clone().text());
      const value = await login.json();
      if (!value.codeRequired) return { session: cookieOf(login, '__Host-hn_auth_session'), user: value.user };
      const verified = await authPost('/api/login/code', { code: pin }, cookieOf(login, '__Host-hn_auth_flow'));
      assert.equal(verified.status, 200);
      return { session: cookieOf(verified, '__Host-hn_auth_session'), user: (await verified.json()).user };
    }
    async function hnAccount(username, password, pin) {
      const start = await fetch(ACC + '/auth/login', { redirect: 'manual' });
      const to = new URL(start.headers.get('location')), state = to.searchParams.get('state'), stateCookie = start.headers.getSetCookie()[0].split(';')[0];
      const { session } = await authSignIn(username, password, pin);
      const grant = await (await authPost('/api/continue', { client_id: 'accounts', state }, session)).json();
      const back = new URL(grant.redirect);
      const done = await fetch(ACC + back.pathname + back.search, { headers: { Cookie: stateCookie }, redirect: 'manual' });
      assert.equal(done.status, 302);
      const cookie = cookieOf(done, 'hn_account');
      const csrf = (await (await fetch(ACC + '/api/session', { headers: { Cookie: cookie } })).json()).csrf;
      return {
        get: (p) => fetch(ACC + p, { headers: { Cookie: cookie } }),
        post: (p, body) => fetch(ACC + p, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: ACC, 'X-CSRF-Token': csrf }, body: JSON.stringify(body) }),
      };
    }

    // Existing logins were converted: same username, password, PIN and permissions.
    const admin = await hnAccount('ada.test@hngroup.org.uk', 'Ada-password-582!', '582947');
    let data = await (await admin.get('/api/logins')).json();
    assert.equal(data.accounts.length, 2, 'Ada’s and Sam’s own accounts');
    const samOwn = data.accounts.find((a) => a.username === 'sam.test@hngroup.org.uk');
    assert.deepEqual(samOwn.profiles.map((p) => p.company), ['HN Group', 'Horizon Network'], 'each company is its own profile');
    assert.equal(samOwn.profiles.find((p) => p.default).company, 'HN Group');
    const samNetwork = data.profiles.find((p) => p.personId === sam.id && p.company === 'Horizon Network');
    const adaGroup = data.profiles.find((p) => p.personId === ada.id && p.company === 'HN Group');
    assert.notEqual(samNetwork.profileId, sam.id, 'other companies have their own profile id');

    // Accounts are only made on HN Account: the staff portal can't create one any more.
    const portalLogin = await fetch(staffBase + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'ada.test@hngroup.org.uk', password: 'Ada-password-582!' }) });
    const portalCode = await fetch(staffBase + '/api/login/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge: (await portalLogin.json()).challenge, code: '582947' }) });
    const portal = cookieOf(portalCode, 'hn_staff_session');
    const refused = await fetch(staffBase + '/api/employees/' + nia.id + '/account', { method: 'POST', headers: { Cookie: portal, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(refused.status, 403); assert.match((await refused.json()).error, /HN Account/);
    assert.equal((await fetch(staffBase + '/api/logins', { headers: { Cookie: portal } })).status, 403);
    // ...but HN Account can, for a staff record (its own account) or as a separate account.
    const niaOwn = await admin.post('/api/employees/' + nia.id + '/account', {});
    assert.equal(niaOwn.status, 200); assert.equal((await niaOwn.json()).username, 'nia.test@hngroup.org.uk');

    // A second account with two profiles (one of Sam's, one of Ada's), a default, and its own permissions.
    let made = await admin.post('/api/logins', { displayName: 'Shared desk', username: 'desk@example.com', profiles: [{ personId: sam.id, company: 'Horizon Network' }, { personId: ada.id, company: 'HN Group' }], defaultProfile: samNetwork.key, roleIds: [itRole.id] });
    assert.equal(made.status, 201, await made.clone().text());
    const desk = await made.json();
    assert.equal(desk.username, 'desk@example.com'); assert.ok(desk.temporaryPassword.length >= 12);
    assert.equal((await admin.post('/api/logins', { displayName: 'Again', username: 'desk@example.com' })).status, 409, 'usernames are unique');
    assert.equal((await admin.post('/api/logins', { displayName: 'Again', username: 'sam.test@hngroup.org.uk' })).status, 409, 'including staff email addresses');

    // Signing in with it: set the password and PIN, then Auth asks which profile (the default first).
    let first = await authSignIn('desk@example.com', desk.temporaryPassword);
    assert.equal(first.user.passwordChangeRequired, true);
    await authPost('/api/password', { newPassword: 'Desk-password-7731!' }, first.session);
    await authPost('/api/setup-code', { code: '736251' }, first.session);
    let signed = await authSignIn('desk@example.com', 'Desk-password-7731!', '736251');
    assert.equal(signed.user.profiles.length, 2);
    assert.equal(signed.user.profiles.find((p) => p.default).key, samNetwork.key);
    assert.equal(signed.user.company, 'Horizon Network', 'starts as the default profile');
    assert.equal(signed.user.id, samNetwork.profileId);
    assert.equal(signed.user.jobTitle, 'Network engineer');
    assert.deepEqual(signed.user.companies, ['Horizon Network']);
    assert.equal(signed.user.statusAdminAllowed, false, 'its own permissions, not Sam’s or Ada’s');
    // Choosing a profile shows each one's picture (only for this account's own profiles).
    assert.equal(signed.user.profiles.find((p) => p.key === samNetwork.key).photo, true);
    assert.equal(signed.user.profiles.find((p) => p.key === adaGroup.key).photo, false);
    const pic = await fetch(authBase + '/api/profile/avatar?key=' + encodeURIComponent(samNetwork.key), { headers: { Cookie: signed.session } });
    assert.equal(pic.status, 200); assert.equal(pic.headers.get('content-type'), 'image/png');
    const samOwnKey = data.profiles.find((p) => p.personId === sam.id && p.company === 'HN Group').key;
    assert.equal((await fetch(authBase + '/api/profile/avatar?key=' + encodeURIComponent(samOwnKey), { headers: { Cookie: signed.session } })).status, 404, 'not another account’s profiles');
    // Choosing Ada's HN Group profile: Ada's details, but still this account's own permissions.
    let chosen = await authPost('/api/profile/select', { key: adaGroup.key }, signed.session);
    assert.equal(chosen.status, 200);
    let user = (await chosen.json()).user;
    assert.equal(user.id, ada.id); assert.equal(user.displayName, 'Ada Test'); assert.equal(user.statusAdminAllowed, false); assert.equal(user.ownerAccess, false);
    assert.equal((await authPost('/api/profile/select', { key: 'f'.repeat(16) + ':' + 'a'.repeat(8) }, signed.session)).status, 400, 'only its own profiles');
    // The chosen profile is what applications get.
    const state = 'c'.repeat(64);
    const grant = await (await authPost('/api/continue', { client_id: 'wiki', state }, signed.session)).json();
    const code = new URL(grant.redirect).searchParams.get('code');
    const exchanged = await fetch(authBase + '/api/sso/exchange', { method: 'POST', headers: { Authorization: 'Bearer ' + 'e'.repeat(64), 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: 'wiki', code, state }) });
    assert.equal((await exchanged.json()).user.id, ada.id);

    // Websites checking an account by profile id: enabled while any account using that profile is.
    const status = async (ids) => (await (await fetch(staffBase + '/api/auth/account-status', { method: 'POST', headers: { Authorization: 'Bearer ' + 'e'.repeat(64), 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })).json()).accounts;
    assert.deepEqual(await status([samNetwork.profileId, 'f'.repeat(16)]), { [samNetwork.profileId]: true, ['f'.repeat(16)]: false });

    // Editing: permissions, profiles and default; disabling ends its sign-ins.
    let edited = await (await admin.post('/api/logins/' + desk.account.id, { profiles: [{ personId: sam.id, company: 'Horizon Network' }], defaultProfile: samNetwork.key, roleIds: [] })).json();
    assert.equal(edited.account.profiles.length, 1); assert.deepEqual(edited.account.roleIds, []);
    assert.equal((await admin.post('/api/logins/' + desk.account.id + '/disable', {})).status, 200);
    assert.equal((await authPost('/api/login', { username: 'desk@example.com', password: 'Desk-password-7731!' })).status, 401);
    assert.equal((await fetch(authBase + '/api/me', { headers: { Cookie: signed.session } })).status, 401, 'signed out');
    assert.equal((await admin.post('/api/logins/' + desk.account.id + '/enable', {})).status, 200);

    // An account with no staff profile: works on HN Group websites, but not the staff portal.
    made = await (await admin.post('/api/logins', { displayName: 'Contractor', username: 'contractor' })).json();
    first = await authSignIn('contractor', made.temporaryPassword);
    await authPost('/api/password', { newPassword: 'Contractor-pass-9182!' }, first.session);
    await authPost('/api/setup-code', { code: '615273' }, first.session);
    signed = await authSignIn('contractor', 'Contractor-pass-9182!', '615273');
    assert.equal(signed.user.standalone, true); assert.equal(signed.user.profiles.length, 0); assert.equal(signed.user.displayName, 'Contractor');
    const portalGrant = await (await authPost('/api/continue', { client_id: 'portal', state }, signed.session)).json();
    assert.match(portalGrant.redirect, /error=access_denied/);
    const wikiGrant = await (await authPost('/api/continue', { client_id: 'wiki', state }, signed.session)).json();
    assert.match(wikiGrant.redirect, /code=/);

    // Deleting: separate accounts can be deleted; someone's own account can only be disabled.
    data = await (await admin.get('/api/logins')).json();
    assert.equal((await admin.post('/api/logins/' + made.account.id + '/delete', {})).status, 200);
    assert.equal((await admin.post('/api/logins/' + samOwn.id + '/delete', {})).status, 400);
    // Only people who manage staff see accounts; only people who can manage roles give permissions.
    const samSite = await hnAccount('sam.test@hngroup.org.uk', 'Sam-password-582!', '493817');
    assert.equal((await samSite.get('/api/logins')).status, 403);
  } finally {
    await new Promise((r) => auth.close(r));
    for (const p of [staffProc, acc]) if (p.exitCode === null) { p.kill(); await new Promise((r) => p.once('exit', r)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
