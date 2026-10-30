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
