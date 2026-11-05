'use strict';
// HN Group Sites (sites.hngroup.org.uk). Run: node --test links-site/test.cjs (needs Playwright's Chromium).
// Uses only local servers: a stand-in Status feed and the site itself; no external pages are visited.
const { test } = require('node:test'), assert = require('node:assert/strict'), http = require('node:http'), path = require('node:path');

test('HN Group Sites: every catalogue website, search, filters, pins, live status, layouts', async () => {
  const data = require('./sites.json').sites;
  // Every website in website control's catalogue is listed (except this directory itself); private pages never are.
  const catalog = require('../admin-site/catalog.json');
  const listed = new Set(data.map((s) => s.host));
  for (const site of catalog) if (site.id !== 'links') assert.ok(listed.has(site.hosts[0]), site.name + ' is listed');
  for (const hidden of ['evan.hngroup.org.uk', 'oldstaffportal.hngroup.org.uk']) assert.ok(!listed.has(hidden), hidden + ' is never listed');
  assert.ok(catalog.find((s) => s.id === 'links').hosts.includes('sites.hngroup.org.uk'));

  const status = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ services: [{ id: 'website:vpn:vpn.hngroup.org.uk', status: 'outage' }, { id: 'website:docs:docs.hngroup.org.uk', status: 'operational' }, { id: 'manual:somewhere.example', status: 'outage' }] }));
  });
  await new Promise((r) => status.listen(0, '127.0.0.1', r));
  process.env.STATUS_BACKEND = 'http://127.0.0.1:' + status.address().port;
  const { server } = require('./server');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch();
  try {
    // The page carries every card in its HTML; the status feed passes on only listed hosts.
    const html = await (await fetch(base + '/')).text();
    assert.equal((html.match(/<article class="site-card/g) || []).length, data.length);
    assert.match(html, /<link rel="canonical" href="https:\/\/sites\.hngroup\.org\.uk\/">/);
    assert.match(html, /assets\/site\.css/, 'the approved HN Group stylesheet');
    assert.deepEqual(JSON.parse(await (await fetch(base + '/api/status')).text()).hosts, { 'vpn.hngroup.org.uk': 'outage', 'docs.hngroup.org.uk': 'operational' });
    assert.equal((await fetch(base + '/nope')).status, 404);
    assert.equal((await fetch(base + '/../server.js')).status, 404);
    assert.equal((await fetch(base + '/sites.json')).status, 404, 'the data file is not served');
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);

    const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 }); await page.goto(base);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scrolling at ' + width + ' (' + scheme + ')');
        assert.ok(await page.locator('.card-mark.logo img:visible').evaluateAll((imgs) => imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0)), 'company logos load');
      }
    }
    // Live status: the VPN's dot shows a problem and the header says so.
    await page.waitForFunction(() => document.querySelector('.site-card[data-id="vpn"]').dataset.status === 'outage');
    assert.equal(await page.textContent('#status-pill-text'), '1 site having problems');
    // Filters and search (words in any order, across name, description and keywords).
    await page.click('[data-filter="companies"]');
    assert.equal(await page.locator('.directory .group:not(.pinned) .site-card:visible').count(), data.filter((s) => s.group === 'companies').length);
    await page.click('[data-filter="all"]');
    await page.fill('#search', 'payslips');
    assert.deepEqual(await page.locator('.directory .group:not(.pinned) .site-card:visible').evaluateAll((c) => c.map((x) => x.dataset.id)), ['staff']);
    await page.fill('#search', 'contract sign');
    assert.ok((await page.locator('.directory .group:not(.pinned) .site-card:visible').evaluateAll((c) => c.map((x) => x.dataset.id))).includes('contracts'));
    await page.fill('#search', 'no such thing here');
    assert.ok(await page.isVisible('#empty'));
    await page.click('#reset'); assert.equal(await page.inputValue('#search'), '');
    // "/" jumps to search; Escape clears it.
    await page.locator('body').click({ position: { x: 5, y: 5 } }); await page.keyboard.press('/');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'search');
    await page.keyboard.type('wiki'); await page.keyboard.press('Escape'); assert.equal(await page.inputValue('#search'), '');
    // Pins are kept in this browser and survive a reload.
    await page.locator('.directory .group:not(.pinned) .site-card[data-id="docs"] .pin').click();
    assert.equal(await page.locator('#pinned-grid .site-card').count(), 1);
    assert.equal(await page.isVisible('#pinned'), true);
    await page.reload();
    assert.equal(await page.locator('#pinned-grid .site-card[data-id="docs"]').count(), 1);
    await page.locator('#pinned-grid .site-card[data-id="docs"] .pin').click();
    assert.equal(await page.isVisible('#pinned'), false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); status.close(); }
});
