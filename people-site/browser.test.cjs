'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('../browser-app/node_modules/playwright');

test('an open org chart redraws when only reporting positions change', async () => {
  let positions = [
    { company: 'Horizon Network', title: 'Executive Assistant', reportsTo: null, holders: ['b'.repeat(16)], key: 'ea' },
    { company: 'Horizon Network', title: 'Founder', reportsTo: null, holders: ['a'.repeat(16)], key: 'founder' },
    { company: 'HN Group', title: 'Chief Executive Officer', reportsTo: null, holders: [], key: 'ceo' },
  ];
  const people = [
    { id: 'a'.repeat(16), name: 'Human', roles: [{ company: 'Horizon Network', jobTitle: 'Founder', main: true }], skills: [], languages: [] },
    { id: 'b'.repeat(16), name: 'Vee', roles: [{ company: 'Horizon Network', jobTitle: 'Executive Assistant', main: true }], skills: [], languages: [] },
  ];
  const server = http.createServer((req, res) => {
    if (req.url === '/api/people') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ companies: ['HN Group', 'Horizon Network'], people, positions })); }
    const name = req.url.startsWith('/assets/') ? req.url.split('?')[0] : '/index.html';
    const file = path.join(__dirname, 'public', name);
    try { res.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'); res.end(fs.readFileSync(file)); }
    catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.clock.install();
    await page.goto('http://127.0.0.1:' + server.address().port + '/org');
    const founder = page.locator('.org-node').filter({ has: page.locator('.org-pos strong', { hasText: /^Founder$/ }) });
    await founder.waitFor();
    const parentTitle = () => founder.evaluate(n => {
      const parent = n.parentElement.parentElement.parentElement;
      return parent.querySelector(':scope > .org-node .org-pos strong')?.textContent || null;
    });
    assert.equal(await parentTitle(), null);
    positions[1] = { ...positions[1], reportsTo: { company: 'Horizon Network', title: 'Executive Assistant' } };
    await page.clock.runFor(15000);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.org-pos strong')).find(n => n.textContent === 'Founder')?.closest('li').parentElement.closest('li')?.querySelector(':scope > .org-node strong')?.textContent === 'Executive Assistant');
    assert.equal(await parentTitle(), 'Executive Assistant');
    assert.match(await founder.textContent(), /Human/);
    positions[1] = { ...positions[1], reportsTo: { company: 'HN Group', title: 'Chief Executive Officer' } };
    await page.clock.runFor(15000);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.org-pos strong')).find(n => n.textContent === 'Founder')?.closest('li').parentElement.closest('li')?.querySelector(':scope > .org-node strong')?.textContent === 'Chief Executive Officer');
    assert.equal(await parentTitle(), 'Chief Executive Officer');
    await page.goto('http://127.0.0.1:' + server.address().port + '/org/horizon-network');
    await founder.waitFor();
    assert.match(await founder.textContent(), /Reports to Chief Executive Officer, HN Group/);
    positions = [{ company: 'HN Group', title: 'Board Chairman', reportsTo: null, holders: [], key: 'chair' }];
    for (let i = 0; i < 9; i++) positions.push({ company: 'HN Group', title: 'Leadership position ' + i, reportsTo: { company: 'HN Group', title: 'Board Chairman' }, holders: [], key: 'lead-' + i });
    positions.push({ company: 'Horizon Network', title: 'President', reportsTo: { company: 'HN Group', title: 'Leadership position 0' }, holders: [], key: 'pres' });
    for (let i = 0; i < 5; i++) positions.push({ company: 'Horizon Network', title: 'Network position ' + i, reportsTo: { company: 'Horizon Network', title: 'President' }, holders: [], key: 'network-' + i });
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('http://127.0.0.1:' + server.address().port + '/org');
      await page.locator('.org-node').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      const clipped = await page.evaluate(() => {
        const box = document.querySelector('.org-scroll').getBoundingClientRect();
        return Array.from(document.querySelectorAll('.org-node')).filter(n => {
          const r = n.getBoundingClientRect(); return r.left < box.left - 1 || r.right > box.right + 1;
        }).map(n => n.textContent);
      });
      assert.deepEqual(clipped, [], 'no clipped cards at width ' + width);
    }
  } finally { if (browser) await browser.close(); await new Promise(r => server.close(r)); }
});
