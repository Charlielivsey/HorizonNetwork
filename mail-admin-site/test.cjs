'use strict';
// HN Group mail administration: HN Group Auth sign-in and permissions, staff provisioning (one mailbox per staff record,
// no duplicates, failures visible and retryable, disabled accounts suspend without deleting), shared mailboxes,
// groups, aliases, quotas, the audit log and HN Mail's service API. With HN_MAIL_LIVE=1 (a test container with the
// real mail server from mail-server/install.sh) changes are applied to Postfix/Dovecot too; otherwise a stand-in records them.
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');

test('mail admin: sign-in, provisioning, shared mailboxes, groups, quotas, audit and HN Mail access', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-mail-admin-test-'));
  process.env.DATA_DIR = dir; const secret = 'e'.repeat(64), secretFile = path.join(dir, 'secret'); fs.writeFileSync(secretFile, secret); process.env.STATUS_SSO_SECRET_FILE = secretFile;
  const portal = await require('../status-site/test-portal.cjs').fixture(); process.env.STAFF_PORTAL_BACKEND = portal.base;
  const auth = require('../auth-site/server').server; await new Promise((r) => auth.listen(0, '127.0.0.1', r)); const authBase = `http://127.0.0.1:${auth.address().port}`; process.env.AUTH_BACKEND = authBase;
  // The staff backend's mail directory: one entry per staff record.
  let records = [
    { id: 'aaaaaaaaaaaaaaa1', displayName: 'Jack Test', emails: [{ address: 'jack@hngroup.org.uk', primary: true }, { address: 'j.test@hngroup.org.uk', primary: false }, { address: 'jack@gmail.com', primary: false }], accounts: [{ id: 'acc1', username: 'jack@hngroup.org.uk', enabled: true }, { id: 'acc2', username: 'jack.other@hngroup.org.uk', enabled: true }] },
    { id: 'aaaaaaaaaaaaaaa2', displayName: 'Contact Only', emails: [], contactEmail: 'someone@example.com', accounts: [] },
    { id: 'aaaaaaaaaaaaaaa3', displayName: 'Clash', emails: [{ address: 'billing@hngroup.org.uk', primary: true }], accounts: [] },
    { id: 'aaaaaaaaaaaaaaa4', displayName: 'No Account Yet', emails: [{ address: 'new.starter@horizon-network.co.uk', primary: true }], accounts: [] },
  ];
  const staff = http.createServer((req, res) => { if (req.headers.authorization !== 'Bearer ' + secret) { res.writeHead(403); return res.end('{}'); } res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ records })); });
  await new Promise((r) => staff.listen(0, '127.0.0.1', r)); process.env.STAFF_BACKEND = `http://127.0.0.1:${staff.address().port}`;
  const live = process.env.HN_MAIL_LIVE === '1';
  const applied = [];
  const applier = live ? undefined : { apply: async (r, boxes) => { applied.push(r()); boxes(); return { ok: true }; }, usage: async () => ({}), usageOf: async () => ({ usedKB: 0, limitKB: null, messages: 0 }), status: () => ({ ok: true }), queue: async () => ({ items: [] }), failures: async () => [], logs: async () => [], health: async () => ({ ok: true }) };
  const { createServer } = require('./server');
  const site = createServer({ dir: path.join(dir, 'mail-admin'), applier, syncEvery: 0 });
  await new Promise((r) => site.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${site.address().port}`;
  const ORIGIN = 'https://admin.mail.hngroup.org.uk';
  async function signIn(name) {
    const start = await fetch(base + '/auth/login', { redirect: 'manual' }); const stateCookie = start.headers.getSetCookie()[0].split(';')[0], authorize = new URL(start.headers.get('location'));
    assert.equal(authorize.searchParams.get('client_id'), 'mail-admin');
    const login = await fetch(authBase + '/api/login', { method: 'POST', headers: { Origin: 'https://auth.hngroup.org.uk', 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, password: 'test-password' }) });
    const authCookie = (login.headers.getSetCookie().find((x) => x.startsWith('__Host-hn_auth_session=')) || assert.fail('Auth login: ' + login.status + ' ' + await login.text())).split(';')[0];
    const grant = await fetch(authBase + '/api/continue', { method: 'POST', headers: { Cookie: authCookie, Origin: 'https://auth.hngroup.org.uk', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: 'mail-admin', state: authorize.searchParams.get('state') }) });
    if (!grant.ok) return { denied: grant.status };
    const callback = new URL((await grant.json()).redirect); assert.equal(callback.origin, ORIGIN);
    if (callback.searchParams.get('error')) {
      const page = await fetch(base + callback.pathname + callback.search, { redirect: 'manual', headers: { Cookie: stateCookie } });
      assert.equal(page.status, 403); assert.match(await page.text(), /No mail permission/);
      return { denied: 403 };
    }
    const result = await fetch(base + callback.pathname + callback.search, { redirect: 'manual', headers: { Cookie: stateCookie } });
    return { cookie: result.headers.getSetCookie().find((x) => x.includes('hn_mail_admin_session=')).split(';')[0] };
  }
  try {
    // Only mail administrators: an account without a mail permission is turned away by HN Group Auth.
    assert.ok((await signIn('staff')).denied >= 400, 'no mail permission, no entry');
    const { cookie } = await signIn('owner');
    const call = async (method, url, body) => { const r = await fetch(base + url, { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { Origin: ORIGIN } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    let st = (await call('GET', '/api/state')).body;
    assert.equal(st.me.owner, true); assert.deepEqual(st.me.permissions, ['mail.view', 'mail.mailboxes', 'mail.groups', 'mail.shared', 'mail.settings']);
    assert.equal(st.counts.shared, 16, 'the 16 shared mailboxes asked for'); assert.equal(st.counts.groups, 4, 'the 4 distribution groups'); assert.equal(st.counts.pendingGroups, 4, 'group members are imported, never invented');
    // Requests from other sites are refused.
    assert.equal((await fetch(base + '/api/provisioning/run', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.example' } })).status, 403);

    // Provisioning: twice, to prove there are no duplicates.
    await call('POST', '/api/provisioning/run'); await call('POST', '/api/provisioning/run');
    let boxes = (await call('GET', '/api/mailboxes')).body.mailboxes;
    const jack = boxes.filter((m) => m.recordId === 'aaaaaaaaaaaaaaa1');
    assert.equal(jack.length, 1, 'one mailbox per staff record, even with two sign-in accounts');
    assert.equal(jack[0].address, 'jack@hngroup.org.uk'); assert.deepEqual(jack[0].aliases, ['j.test@hngroup.org.uk'], 'other HN addresses become aliases; outside ones never do'); assert.equal(jack[0].quotaMB, 1024, '1 GB by default');
    assert.ok(boxes.some((m) => m.address === 'new.starter@horizon-network.co.uk'), 'a record without a sign-in account still gets its mailbox');
    let prov = (await call('GET', '/api/provisioning')).body.records;
    assert.equal(prov.find((p) => p.recordId === 'aaaaaaaaaaaaaaa2').status, 'skipped', 'contact emails are never provisioned');
    const clash = prov.find((p) => p.recordId === 'aaaaaaaaaaaaaaa3'); assert.equal(clash.status, 'error'); assert.match(clash.message, /billing@hngroup.org.uk is already used by the shared mailbox/);
    // Fix it on the staff side and retry just that record.
    records[2].emails = [{ address: 'clash.person@hngroup.org.uk', primary: true }];
    assert.equal((await call('POST', '/api/provisioning/aaaaaaaaaaaaaaa3/retry')).body.record.status, 'ok');
    // An address change on the staff record moves the mailbox's address (same mailbox, same storage).
    records[0].emails[0].address = 'jack.test@hngroup.org.uk';
    await call('POST', '/api/provisioning/run');
    boxes = (await call('GET', '/api/mailboxes')).body.mailboxes;
    const moved = boxes.find((m) => m.recordId === 'aaaaaaaaaaaaaaa1'); assert.equal(moved.id, jack[0].id); assert.equal(moved.address, 'jack.test@hngroup.org.uk');
    // Mailboxes from staff records can't be renamed here.
    assert.equal((await call('PATCH', '/api/mailboxes/' + moved.id, { address: 'other@hngroup.org.uk' })).status, 409);
    // Quota per mailbox.
    assert.equal((await call('PATCH', '/api/mailboxes/' + moved.id, { quotaMB: 2048 })).body.mailbox.quotaMB, 2048);
    assert.equal((await call('PATCH', '/api/mailboxes/' + moved.id, { quotaMB: 5 })).status, 400);

    // Shared mailbox members with send-as.
    const billing = boxes.find((m) => m.address === 'billing@hngroup.org.uk');
    const set = await call('PUT', '/api/mailboxes/' + billing.id + '/members', { members: [{ mailbox: moved.id, access: 'full', sendAs: true }] });
    assert.equal(set.status, 200); assert.equal(set.body.mailbox.members[0].address, 'jack.test@hngroup.org.uk');
    assert.equal((await call('PUT', '/api/mailboxes/' + billing.id + '/members', { members: [{ mailbox: billing.id }] })).status, 400, 'members are people’s mailboxes');
    await call('PUT', '/api/mailboxes/' + billing.id + '/members', { members: [{ mailbox: moved.id, access: 'full', sendAs: true }] });

    // Groups: nested, no loops, members must exist.
    const groups = (await call('GET', '/api/groups')).body.groups, staffG = groups.find((g) => g.address === 'staff@hngroup.org.uk'), all = groups.find((g) => g.address === 'all-staff@hngroup.org.uk');
    assert.equal((await call('PATCH', '/api/groups/' + staffG.id, { address: staffG.address, name: staffG.name, members: ['jack.test@hngroup.org.uk', 'clash.person@hngroup.org.uk'] })).status, 200);
    assert.equal((await call('PATCH', '/api/groups/' + all.id, { address: all.address, name: all.name, members: ['staff@hngroup.org.uk'] })).status, 200);
    assert.match((await call('PATCH', '/api/groups/' + staffG.id, { address: staffG.address, name: staffG.name, members: ['all-staff@hngroup.org.uk'] })).body.error, /loop/);
    assert.match((await call('PATCH', '/api/groups/' + staffG.id, { address: staffG.address, name: staffG.name, members: ['ghost@hngroup.org.uk'] })).body.error, /isn’t a mailbox/);
    const rendered = require('./lib/render').render(site.directory.data());
    assert.match(rendered.files['postfix/aliases'], /^all-staff@hngroup\.org\.uk (jack\.test@hngroup\.org\.uk,clash\.person@hngroup\.org\.uk|clash\.person@hngroup\.org\.uk,jack\.test@hngroup\.org\.uk)$/m, 'nested groups are flattened');
    assert.doesNotMatch(rendered.files['postfix/aliases'], /^staff@media\.hngroup\.org\.uk /m, 'an empty group delivers nowhere (mail to it is refused)');
    assert.match(rendered.files['postfix/senders'], /^billing@hngroup\.org\.uk jack\.test@hngroup\.org\.uk,jack\.test@hngroup\.org\.uk\*hnmail$/m, 'send-as for the shared mailbox');
    assert.match(rendered.files['postfix/senders'], /^staff@hngroup\.org\.uk nobody@invalid$/m, 'nobody sends as a group');
    assert.match(rendered.files['dovecot/users'], /^jack\.test@hngroup\.org\.uk:::::\/var\/vmail\/[a-f0-9]{16}::userdb_quota_rule=\*:storage=2048M$/m);
    assert.match(rendered.files['dovecot/denied'], /^billing@hngroup\.org\.uk$/m, 'shared mailboxes can’t be signed in to directly');

    // Aliases and forwarders.
    assert.equal((await call('POST', '/api/aliases', { address: 'accounts@hngroup.org.uk', targets: ['billing@hngroup.org.uk', 'outside@example.com'] })).status, 201);
    assert.equal((await call('POST', '/api/aliases', { address: 'jack.test@hngroup.org.uk', targets: ['x@example.com'] })).status, 409, 'addresses can’t be used twice');

    // HN Mail's service API: only with the service secret, and only this account's records' mailboxes.
    const svc = (body, key = secret) => fetch(base + '/api/service/access', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await svc({ recordIds: ['aaaaaaaaaaaaaaa1'] }, 'f'.repeat(64))).status, 403);
    const access = await (await svc({ recordIds: ['aaaaaaaaaaaaaaa1'] })).json();
    assert.deepEqual(access.mailboxes.map((m) => m.address).sort(), ['billing@hngroup.org.uk', 'jack.test@hngroup.org.uk']);
    assert.deepEqual(access.mailboxes.find((m) => m.kind === 'shared').sendAs, ['billing@hngroup.org.uk']);
    assert.equal(access.mailboxes.find((m) => m.kind === 'shared').login, 'jack.test@hngroup.org.uk', 'shared mailboxes are opened through the member’s own mailbox');
    assert.deepEqual((await (await svc({ recordIds: ['aaaaaaaaaaaaaaa4'] })).json()).mailboxes.map((m) => m.address), ['new.starter@horizon-network.co.uk']);
    // App passwords: own mailbox only.
    const ap = (body) => fetch(base + '/api/service/app-passwords', { method: 'POST', headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await ap({ recordIds: ['aaaaaaaaaaaaaaa4'], mailbox: moved.id, action: 'create', label: 'x' })).status, 404, 'not someone else’s mailbox');
    const made = await (await ap({ recordIds: ['aaaaaaaaaaaaaaa1'], mailbox: moved.id, action: 'create', label: 'Phone' })).json();
    assert.match(made.password, /^[a-z2-9]{5}(-[a-z2-9]{5}){3}$/);
    assert.ok(!JSON.stringify(site.directory.data()).includes(made.password), 'only a hash is kept');
    assert.ok(!JSON.stringify((await call('GET', '/api/mailboxes')).body).includes('"hash"'), 'hashes never reach the browser');

    // Disabling every sign-in account suspends the mailbox: no access, mail kept.
    records[0].accounts = records[0].accounts.map((a) => ({ ...a, enabled: false }));
    await call('POST', '/api/provisioning/run');
    const after = await (await svc({ recordIds: ['aaaaaaaaaaaaaaa1'] })).json();
    assert.deepEqual(after.mailboxes, [], 'no access while suspended (shared membership included)');
    assert.equal(after.blocked[0].reason, 'suspended');
    assert.ok((await call('GET', '/api/mailboxes')).body.mailboxes.find((m) => m.id === moved.id), 'the mailbox itself is kept');
    // A removed staff record keeps its mailbox.
    records = records.filter((r) => r.id !== 'aaaaaaaaaaaaaaa4');
    await call('POST', '/api/provisioning/run');
    assert.ok((await call('GET', '/api/mailboxes')).body.mailboxes.find((m) => m.address === 'new.starter@horizon-network.co.uk').recordGone);

    // Everything above is in the audit log, with who did it.
    const audit = (await call('GET', '/api/audit')).body.entries;
    for (const action of ['provisioning.create', 'provisioning.error', 'mailbox.update', 'shared.members', 'group.update', 'alias.create', 'app-password.create', 'mailbox.suspend', 'provisioning.record-gone']) assert.ok(audit.some((e) => e.action === action), action + ' is audited');
    assert.equal(audit.find((e) => e.action === 'shared.members').actor.name, 'owner');
    if (!live) assert.ok(applied.length > 5, 'changes are applied to the mail server');
  } finally {
    site.close(); staff.close(); auth.close(); portal.server.close();
  }
});
