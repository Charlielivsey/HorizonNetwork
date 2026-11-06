'use strict';
// Every HN Group website keeps its own copy of the motion kit; this checks they're all the same as brand/web.
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..', '..');
const COPIES = require('./copies.json');
test('the HN motion kit is identical on every website', () => {
  for (const file of ['hn-motion.css', 'hn-motion.js']) {
    const master = fs.readFileSync(path.join(__dirname, file), 'utf8');
    for (const dir of COPIES) assert.equal(fs.readFileSync(path.join(ROOT, dir, file), 'utf8'), master, dir + '/' + file + ' differs from brand/web/' + file);
  }
});

// The support section (hn-support.js/.css) is on hngroup.org.uk, network.hngroup.org.uk, media and development.
test('the support section is identical on every website that has it', () => {
  for (const file of ['hn-support.css', 'hn-support.js']) {
    const master = fs.readFileSync(path.join(__dirname, file), 'utf8');
    for (const dir of ['hngroup-site/public/assets', 'horizon-network-site/public/assets', 'website-suite/public/assets']) assert.equal(fs.readFileSync(path.join(ROOT, dir, file), 'utf8'), master, dir + '/' + file + ' differs from brand/web/' + file);
  }
});

// The two HN Group themes (Light and Lavender Dusk, the user's request, 6 November 2026) are applied by hn-theme.js,
// identical on every website, and every page loads it straight after its stylesheets.
test('the HN theme script is identical on every website and loaded by their pages', () => {
  const master = fs.readFileSync(path.join(__dirname, 'hn-theme.js'), 'utf8');
  for (const dir of require('./theme-copies.json')) assert.equal(fs.readFileSync(path.join(ROOT, dir, 'hn-theme.js'), 'utf8'), master, dir + '/hn-theme.js differs from brand/web/hn-theme.js');
  for (const page of ['hngroup-site/public/index.html', 'auth-site/public/index.html', 'status-site/public/index.html', 'accounts-site/public/app.html', 'mail-site/public/index.html', 'staff-portal/public/app.html', 'downloads-site/public/index.html', 'website-suite/public/index.html']) {
    assert.match(fs.readFileSync(path.join(ROOT, page), 'utf8'), /<script src="[^"]*hn-theme\.js[^"]*"><\/script>/, page + ' loads hn-theme.js');
  }
});
