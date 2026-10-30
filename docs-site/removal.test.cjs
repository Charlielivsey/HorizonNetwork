'use strict';
// The system owner's one-off removal (30 October 2026): the protected draft "Letter" in catnap@hngroup.org.uk's storage
// goes, once, with a private backup; nothing else is touched, protected or not.
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
test('the protected "Letter" is removed from catnap’s storage once, with a backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-docs-removal-'));
  try {
    const at = Date.parse('2026-10-26T15:00:00Z'), base = { template: 'letter', company: 'hn-group', status: 'draft', sharing: 'private', protected: true, confidential: true, updatedAt: at, createdAt: at };
    const docs = {
      target: { ...base, id: 'target', title: 'Letter', ownerId: 'catnap', ownerEmail: 'catnap@hngroup.org.uk' },
      otherOwner: { ...base, id: 'otherOwner', title: 'Letter', ownerId: 'charlie', ownerEmail: 'charlie.livsey@hngroup.org.uk' },
      otherTitle: { ...base, id: 'otherTitle', title: 'Merger letter', ownerId: 'catnap', ownerEmail: 'catnap@hngroup.org.uk' },
      otherDay: { ...base, id: 'otherDay', title: 'Letter', ownerId: 'catnap', ownerEmail: 'catnap@hngroup.org.uk', updatedAt: Date.parse('2026-10-27T15:00:00Z') },
    };
    fs.writeFileSync(path.join(dir, 'documents.json'), JSON.stringify({ documents: docs, people: { catnap: { email: 'catnap@hngroup.org.uk', displayName: 'Catnap' } } }));
    const store = require('./lib/store'); store.init(dir);
    const saved = () => JSON.parse(fs.readFileSync(path.join(dir, 'documents.json'), 'utf8'));
    assert.deepEqual(Object.keys(saved().documents).sort(), ['otherDay', 'otherOwner', 'otherTitle']);
    const backups = fs.readdirSync(path.join(dir, 'backups'));
    assert.equal(backups.length, 1); assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'backups', backups[0]), 'utf8'))[0].id, 'target');
    // Only once: a new document like it later stays.
    const d = saved(); d.documents.again = { ...docs.target, id: 'again' }; fs.writeFileSync(path.join(dir, 'documents.json'), JSON.stringify(d));
    store.init(dir); assert.ok(saved().documents.again);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
