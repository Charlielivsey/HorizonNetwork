'use strict';
// Browser checks for the service websites (temporary data only):
//   PLAYWRIGHT_MODULE=/path/to/playwright node service-suite/browser-smoke.cjs [screenshot-dir]
// Every site's home at 320/390/768/1280px in light and dark with reduced motion: no horizontal
// scrolling, no console errors, logos load. Then real UI flows: quote request + private reference,
// community sign-up and posting, tools, brand kit, status page and keyboard navigation.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT = path.resolve(__dirname, '..');
const catalog = require('./catalog.json');
const shots = process.argv[2] || null;
async function freePort() { const s = http.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-service-browser-'));
  const secret = path.join(tmp, 'secret'); fs.writeFileSync(secret, 'd'.repeat(64));
  const children = [];
  async function start(id) {
    const dir = path.join(tmp, 'opt-' + id);
    fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'server.js'), path.join(dir, 'server.js'));
    for (const f of fs.readdirSync(path.join(__dirname, 'lib'))) fs.copyFileSync(path.join(__dirname, 'lib', f), path.join(dir, 'lib', f));
    fs.cpSync(path.join(__dirname, 'public'), path.join(dir, 'public'), { recursive: true });
    fs.cpSync(path.join(ROOT, id + '-site/public'), path.join(dir, 'public'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, id + '-site/config.json'), path.join(dir, 'config.json'));
    const port = await freePort();
    const child = spawn(process.execPath, [path.join(dir, 'server.js')], { env: { ...process.env, PORT: String(port), DATA_DIR: path.join(tmp, 'data-' + id), STATUS_SSO_SECRET_FILE: secret, AUTH_BACKEND: 'http://127.0.0.1:9' }, stdio: 'ignore' });
    children.push(child);
    for (let n = 0; n < 200; n++) { try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 25)); }
    return { port, base: `http://localhost:${port}`, domain: JSON.parse(fs.readFileSync(path.join(dir, 'config.json'))).domain };
  }
  const browser = await chromium.launch();
  const problems = [];
  // The sites only accept POSTs from their public origin; present that origin to the local server.
  async function context(site, opts = {}) {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', ...opts });
    await ctx.route('**/*', route => { const r = route.request(); route.continue(r.method() === 'POST' ? { headers: { ...r.headers(), origin: 'https://' + site.domain } } : {}); });
    return ctx;
  }
  async function check(page, label) {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, broken: [...document.images].filter(i => i.complete && !i.naturalWidth && i.offsetParent).map(i => i.src), h1: document.querySelectorAll('h1').length, unlabeled: [...document.querySelectorAll('input:not([type=hidden]):not(.hp),select,textarea')].filter(el => !el.labels?.length && !el.getAttribute('aria-label') && !el.closest('label') && !el.closest('fieldset')).map(el => el.outerHTML.slice(0, 80)) }));
    if (r.overflow > 1) problems.push(`${label}: horizontal overflow ${r.overflow}px`);
    if (r.broken.length) problems.push(`${label}: broken images ${r.broken.join(', ')}`);
    if (r.h1 !== 1) problems.push(`${label}: expected one h1, found ${r.h1}`);
    if (r.unlabeled.length) problems.push(`${label}: unlabelled controls ${r.unlabeled.join(' | ')}`);
  }
  try {
    // 1) Every website's home page across sizes and colour schemes.
    for (const entry of catalog) {
      const site = await start(entry.id);
      for (const scheme of ['light', 'dark']) {
        const ctx = await context(site, { colorScheme: scheme });
        const page = await ctx.newPage();
        page.on('console', m => { if (m.type() === 'error') problems.push(`${entry.id} ${scheme}: console ${m.text()}`); });
        page.on('pageerror', e => problems.push(`${entry.id} ${scheme}: ${e.message}`));
        for (const width of [320, 390, 768, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(site.base + '/');
          await page.waitForSelector('h1');
          await check(page, `${entry.id} ${scheme} ${width}px`);
          if (shots && ['services', 'hosting', 'expenses', 'community'].includes(entry.id) && [390, 1280].includes(width)) await page.screenshot({ path: path.join(shots, `${entry.id}-${scheme}-${width}.png`), fullPage: true });
        }
        // Every navigation link opens without errors.
        await page.setViewportSize({ width: 1280, height: 900 });
        const links = await page.$$eval('.nav a', as => as.map(a => a.getAttribute('href')));
        for (const href of links) { await page.goto(site.base + '/' + href); await page.waitForSelector('h1'); await check(page, `${entry.id} ${scheme} ${href}`); }
        await ctx.close();
      }
    }

    // 2) Quote request with a private reference, then lookup and reply.
    {
      const site = await start('services');
      const ctx = await context(site); const page = await ctx.newPage();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(site.base + '/#/m/catalogue');
      await page.click('text=Software development');
      await page.click('a.btn:has-text("Request a quote")');
      await page.fill('#f-quotes-name', 'Browser Visitor');
      await page.fill('#f-quotes-email', 'visitor@example.test');
      await page.fill('#f-quotes-body', 'We need a web application.');
      await page.click('button:has-text("Submit")');
      await page.waitForSelector('.form-error:not([hidden])');
      await page.check('#f-quotes-consent');
      await page.click('button:has-text("Submit")');
      const reference = (await page.textContent('.reference code')).trim();
      assert.match(reference, /^[a-f0-9]{64}$/);
      await page.click('a:has-text("Check progress")');
      await page.fill('#ref-input', reference);
      await page.click('button:has-text("View")');
      await page.waitForSelector('text=Software development');
      await page.fill('#ref-reply', 'Timeline is flexible.');
      await page.click('button:has-text("Send reply")');
      await page.waitForSelector('text=Timeline is flexible.');
      await check(page, 'services reference flow');
      if (shots) await page.screenshot({ path: path.join(shots, 'flow-reference.png'), fullPage: true });
      await ctx.close();
    }
    // 3) Community: create an account, start a discussion, reply.
    {
      const site = await start('community');
      const ctx = await context(site, { colorScheme: 'dark' }); const page = await ctx.newPage();
      await page.goto(site.base + '/#/forum/forum');
      await page.click('a:has-text("Sign in to post")');
      await page.fill('#reg-name', 'Browser Tester');
      await page.fill('#reg-email', 'tester@example.test');
      await page.fill('#reg-pass', 'a-long-browser-password');
      await page.check('#reg-terms');
      await page.click('button:has-text("Create account")');
      await page.waitForSelector('h1:has-text("Start a discussion")');
      await page.selectOption('#fn-cat', 'general');
      await page.fill('#fn-title', 'Hello from the browser test');
      await page.fill('#fn-body', 'First post.');
      await page.click('button:has-text("Post")');
      await page.waitForSelector('h1:has-text("Hello from the browser test")');
      await page.fill('#forum-reply', 'A reply.');
      await page.click('button:has-text("Post reply")');
      await page.waitForSelector('text=A reply.');
      await check(page, 'community flow');
      if (shots) await page.screenshot({ path: path.join(shots, 'flow-community.png'), fullPage: true });
      await ctx.close();
    }
    // 4) Tools, brand kit and status pages work; keyboard skip link reaches main content.
    {
      const tools = await start('tools');
      const ctx = await context(tools); const page = await ctx.newPage();
      await page.goto(tools.base + '/#/tools');
      await page.waitForSelector('#tool-password output');
      assert.ok((await page.textContent('#tool-password output')).length >= 20);
      await page.fill('#cidr-in', '10.0.0.0/30');
      await page.click('#tool-subnet button');
      assert.match(await page.textContent('#tool-subnet output'), /Usable hosts: 2/);
      await page.goto(tools.base + '/'); await page.waitForSelector('h1');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'skip', 'first Tab reaches the skip link');
      await page.goto(tools.base + '/#/tools'); await page.waitForSelector('#tool-subnet output');
      await check(page, 'tools page');
      if (shots) await page.screenshot({ path: path.join(shots, 'tools.png'), fullPage: true });
      const brand = await start('brand');
      await page.goto(brand.base + '/#/brand');
      await page.waitForSelector('.logo-tile img');
      await check(page, 'brand kit');
      if (shots) await page.screenshot({ path: path.join(shots, 'brand.png'), fullPage: true });
      const status = await start('netstatus');
      await page.goto(status.base + '/#/status/components');
      await page.waitForSelector('.components li');
      await check(page, 'network status');
      if (shots) await page.screenshot({ path: path.join(shots, 'status.png'), fullPage: true });
      await ctx.close();
    }
    // 5) Reduced motion: revealed content is visible immediately.
    {
      const site = await start('events');
      const ctx = await context(site); const page = await ctx.newPage();
      await page.goto(site.base + '/');
      await page.waitForSelector('.reveal');
      const hidden = await page.$$eval('.reveal', els => els.filter(e => getComputedStyle(e).opacity !== '1').length);
      if (hidden) problems.push(`reduced motion: ${hidden} elements not fully visible`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    for (const c of children) c.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log(`Browser checks passed for ${catalog.length} websites and the key flows.`);
})().catch(e => { console.error(e); process.exit(1); });
