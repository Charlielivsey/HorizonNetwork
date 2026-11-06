'use strict';
// Guest sign-in accounts and temporary staff records (the user's request, 6 November 2026: guest accounts "not
// neccessarlily linked to a permanant staff record, but have access to toggles that will be specified when the account
// is created", which can use a temporary staff record and be "moved to a full staff record if they move to a permanant
// position"). Run: node --test staff-portal/guest-accounts.test.cjs
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');

test('guest accounts, temporary staff records and Make permanent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-guest-'));
  try {
    const store = require('./lib/store'); store.init(dir);
    const company = store.COMPANIES[0], domain = store.COMPANY_DOMAINS[company];
    let n = 0;
    const make = (first, extra) => store.saveEmployee({ firstName: first, lastName: 'Tester', jobTitle: 'Assistant', company, emails: [{ domain, auto: true, primary: true }], discordId: '1000000000000000' + String(++n).padStart(2, '0'), ...extra }, null);
    const temp = make('Tia', { temporary: true }), perm = make('Pat', {}), owned = make('Ola', {});
    assert.equal(store.publicView(temp).temporary, true);
    assert.equal(store.publicView(perm).temporary, false);
    store.issueTemporaryPassword(owned); // Ola has her own sign-in account already.
    const tempProfile = store.allProfiles().find((p) => p.personId === temp.id);
    assert.equal(tempProfile.temporary, true, 'HN Account can show which profiles are temporary');

    // Guests choose their websites; at least one, and only known ones.
    assert.throws(() => store.createLogin({ displayName: 'No sites', username: 'nosites@example.com', guest: { sites: [] } }), /at least one website/);
    const { login: g1 } = store.createLogin({ displayName: 'Tia', username: 'tia@example.com', guest: { sites: ['docs', 'portal', 'made-up'] }, profiles: [{ personId: temp.id, company }] });
    assert.deepEqual(store.loginView(g1).guest, { sites: ['docs', 'portal'] });
    store.updateLogin(g1, { guest: { sites: ['docs'] } });
    assert.deepEqual(g1.guest.sites, ['docs'], 'a guest’s websites can be changed');
    const { login: normal } = store.createLogin({ displayName: 'Normal', username: 'normal@example.com' });
    store.updateLogin(normal, { guest: { sites: ['docs'] } });
    assert.equal(normal.guest, null, 'an ordinary account doesn’t become a guest by editing');
    for (const s of store.GUEST_SITES) assert.ok(require('../auth-site/server').CLIENTS[s.id], s.id + ' is an HN Group Auth website or app');

    // Make permanent, keeping their temporary record: it becomes permanent and the account becomes its own.
    store.makePermanent(g1);
    assert.equal(g1.guest, null); assert.equal(temp.temporary, false); assert.equal(g1.primaryFor, temp.id);
    assert.throws(() => store.makePermanent(g1), /isn't a guest/);

    // A guest with no record has to be moved onto one; a temporary record can't be the destination.
    const temp2 = make('Tom', { temporary: true });
    const { login: g2 } = store.createLogin({ displayName: 'Visitor', username: 'visitor@example.com', guest: { sites: ['wiki'] } });
    assert.throws(() => store.makePermanent(g2), /Choose the permanent staff record/);
    assert.throws(() => store.makePermanent(g2, { personId: temp2.id }), /temporary too/);
    store.makePermanent(g2, { personId: perm.id });
    assert.equal(g2.primaryFor, perm.id, 'moved onto Pat’s record as its own account (Pat had none)');
    assert.equal(g2.guest, null);
    // Onto a record that already has its own account: the guest uses its profiles instead.
    const { login: g3 } = store.createLogin({ displayName: 'Helper', username: 'helper@example.com', guest: { sites: ['docs'] } });
    store.makePermanent(g3, { personId: owned.id });
    assert.equal(g3.primaryFor, null); assert.deepEqual(store.loginProfiles(g3).map((p) => p.personId), [owned.id]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
