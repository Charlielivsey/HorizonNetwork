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
