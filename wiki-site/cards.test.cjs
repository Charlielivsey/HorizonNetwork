'use strict';
// The Main Page shows each company once: a hand-written {{Company card}} is left out when the register's
// {{Company cards}} already has that company (the user's report, 30 October 2026: Horizon Development twice).
const { test } = require('node:test'), assert = require('node:assert/strict'), markup = require('./lib/markup');
test('a company appears once in the Main Page cards', () => {
  const list = [{ slug: 'hn', name: 'HN Group' }, { slug: 'hd', name: 'Horizon Development', parent: 'hn' }];
  const R = { roots: () => [list[0]], children: (c) => list.filter((x) => x.parent === c.slug), displayName: (c) => c.name, find: (n) => list.find((c) => c.name === n) || null, bySlug: (s) => list.find((c) => c.slug === s) || null };
  markup.setCompanySource({ register: R, logo: () => null, blurb: () => '' });
  const page = (src) => markup.render(src, {}).html || markup.render(src, {});
  const html = String(page('{{Cards start}}\n{{Company cards}}\n{{Company card|Horizon Development|x.svg|Custom software.}}\n{{Company card|Horizon Hosting|y.svg|Planned.}}\n{{Cards end}}'));
  assert.equal((html.match(/cc-name">Horizon Development/g) || []).length, 1);
  assert.equal((html.match(/cc-name">Horizon Hosting/g) || []).length, 1, 'cards for anything not on the register still show');
});

test('an infobox Type row is the kind of company, never what it belongs to', () => {
  const list = [{ slug: 'hn', name: 'Horizon Network', legalName: 'Horizon Network Limited', type: 'Part of HN Group' }, { slug: 'hd', name: 'Horizon Development', legalName: 'Horizon Development Limited', parent: 'hn' }];
  const R = { roots: () => [list[0]], children: (c) => list.filter((x) => x.parent === c.slug), managedBy: () => [], displayName: (c) => c.name, owners: () => [], registerUrl: () => 'https://companies.hngroup.org.uk/', find: (n) => list.find((c) => c.name === n) || null, bySlug: (s) => list.find((c) => c.slug === s) || null };
  markup.setCompanySource({ register: R, logo: () => null, blurb: () => '' });
  const html = (src) => { const r = markup.render(src, {}); return String(r.html || r); };
  const typeRow = (h) => (/<th scope="row">Type<\/th><td>([^<]*)/.exec(h) || [])[1];
  // A company infobox with a hand-written Type and Parent: the register's type, and one Parent row.
  const hd = html('{{Company infobox|Horizon Development\n| Type = Part of [[Horizon Network]]\n| Parent = [[Horizon Network]]\n| Services = Web apps\n}}');
  assert.equal(typeRow(hd), 'Private limited company'); assert.equal((hd.match(/>Parent</g) || []).length, 1); assert.match(hd, /Web apps/);
  // A type recorded on the register that only says what it belongs to isn't used.
  assert.equal(typeRow(html('{{Company infobox|Horizon Network}}')), 'Private limited company');
  // A plain {{Infobox}} for a company on the register shows its type; one that isn't drops "Part of …".
  assert.equal(typeRow(html('{{Infobox\n| name = Horizon Development\n| Type = Part of [[Horizon Network]]\n}}')), 'Private limited company');
  assert.equal(typeRow(html('{{Infobox\n| name = Somewhere else\n| Type = Subsidiary of X\n}}')), undefined);
  assert.equal(typeRow(html('{{Infobox\n| name = Somewhere else\n| Type = Partnership\n}}')), 'Partnership');
});

test('every company infobox has its Parent row, under Key people', () => {
  const list = [{ slug: 'hng', name: 'HN Group', legalName: 'HN Group Limited' }, { slug: 'hn', name: 'Horizon Network', legalName: 'Horizon Network Limited', parent: 'hng', officers: [{ name: 'Charlie Livsey', role: 'Managing director' }] }];
  const R = { roots: () => [list[0]], children: (c) => list.filter((x) => x.parent === c.slug), managedBy: () => [], displayName: (c) => c.name, registerUrl: () => 'https://companies.hngroup.org.uk/', find: (n) => list.find((c) => c.name === n) || null, bySlug: (s) => list.find((c) => c.slug === s) || null,
    owners: (c) => (c.slug === 'hn' ? [{ name: 'HN Group', company: list[0], share: '70%' }] : []) };
  markup.setCompanySource({ register: R, logo: () => null, blurb: () => '' });
  const keys = (src) => { const r = markup.render(src, {}); return [...String(r.html || r).matchAll(/<th scope="row">([^<]*)<\/th>/g)].map((m) => m[1]); };
  // Even when the parent is also an owner, it has its own row, straight after Key people.
  const k = keys('{{Company infobox|Horizon Network}}');
  assert.equal(k[k.indexOf('Key people') + 1], 'Parent');
  // A plain {{Infobox}}: the Parent row moves under Key people, and a register company's parent comes from the register.
  const p = keys('{{Infobox\n| name = Horizon Network\n| Parent = Someone\n| Founded = 2025\n| Key people = A\n| Website = x\n}}');
  assert.deepEqual(p, ['Founded', 'Key people', 'Parent', 'Website']);
});
