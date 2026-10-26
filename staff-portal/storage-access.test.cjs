'use strict';
// Document storage access: the permission (Super Admin gets it once), individual timed grants and what HN Group
// Auth passes to HN Group Docs about each person.
//   node --test staff-portal/storage-access.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('document storage: permission, Super Admin, timed grants and the Auth profile', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-storage-access-'));
  try {
    const store = require('./lib/store'), access = require('./lib/storage-access');
    store.init(dir); access.init(dir);
    const person = (first, last) => store.saveEmployee({ firstName: first, lastName: last, jobTitle: 'Officer', company: store.COMPANIES[0], timezone: 'Europe/London', emails: [{ domain: 'hngroup.org.uk', auto: true, primary: true }] });
    const sam = person('Sam', 'Taylor'), alex = person('Alex', 'Jones'), jo = person('Jo', 'Smith');
    assert.ok(sam && sam.id && alex.id && jo.id, 'staff created');
    const superAdmin = store.listRoles().find((r) => r.name.toLowerCase() === 'super admin');
    assert.ok(superAdmin.permissions.includes(access.ACCESS), 'Super Admin can open everyone’s storage');
    assert.equal(access.canAccessAll(sam), false);
    sam.roleIds = [superAdmin.id];
    assert.equal(access.canAccessAll(sam), true);

    const err = (input) => { try { access.add(input, sam); } catch (e) { return e.message; } return ''; };
    assert.match(err({ granteeId: alex.id, ownerId: alex.id, until: new Date(Date.now() + 86400000).toISOString() }), /own storage/);
    assert.match(err({ granteeId: alex.id, ownerId: jo.id, until: new Date(Date.now() - 1000).toISOString() }), /future/);
    assert.match(err({ granteeId: alex.id, ownerId: jo.id, until: new Date(Date.now() + 400 * 86400000).toISOString() }), /a year/);
    const g = access.add({ granteeId: alex.id, ownerId: jo.id, until: new Date(Date.now() + 2 * 86400000).toISOString(), reason: 'Covering' }, sam);
    assert.equal(g.ownerName, 'Jo Smith');
    assert.equal(access.canOpen(alex, jo.id), true, 'a grant opens that one person’s storage');
    assert.equal(access.canOpen(alex, sam.id), false);
    assert.equal(access.canOpen(sam, alex.id), true, 'the permission opens anyone’s');
    let id = access.forIdentity(alex);
    assert.equal(id.storageAccess, false);
    assert.deepEqual(id.storageGrants.map((x) => [x.personId, x.name]), [[jo.id, 'Jo Smith']]);
    // Giving access again replaces the end date rather than adding a second grant.
    access.add({ granteeId: alex.id, ownerId: jo.id, until: new Date(Date.now() + 5 * 86400000).toISOString() }, sam);
    assert.equal(access.list().filter((x) => x.granteeId === alex.id).length, 1);
    access.remove(access.list()[0].id);
    assert.equal(access.canOpen(alex, jo.id), false, 'removed access stops at once');
    assert.deepEqual(access.forIdentity(alex).storageGrants, []);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'storage-access.json'), 'utf8'));
    assert.equal(saved.grants.length, 0);
    assert.ok(access.people().some((p) => p.id === jo.id && p.storageUrl === 'https://docs.hngroup.org.uk/storage/' + jo.id));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
