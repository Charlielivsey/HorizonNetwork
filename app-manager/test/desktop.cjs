'use strict';
// HN Group App Manager 3, end to end in the real app on a pretend Windows PC (src/core/fake.cjs) with a local release
// feed and a stand-in HN Group Auth: the "not authorised" window, signing in and the PIN, an update that waits for
// the app to be quit, installing, settings, the "…" menu, removing, App Manager's own update (download, ready,
// restart), activity, preferences, diagnostics, locking and isolation. Screenshots (light and dark) go in
// app-manager/screenshots/.
//   xvfb-run -a node test/desktop.cjs
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const shots = path.join(__dirname, '..', 'screenshots');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-manager-desktop-')), profile = path.join(dir, 'profile'), fixtures = path.join(dir, 'fixtures');
  fs.mkdirSync(fixtures); fs.mkdirSync(shots, { recursive: true });
  const file = (route, name, version, build) => { const data = Buffer.from('installer ' + name + ' '.repeat(300000)); fs.writeFileSync(path.join(fixtures, route), data); return { version, build, publishedAt: '2026-10-25T10:00:00Z', asset: { name, size: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex'), url: '/download/' + route } }; };
  const browser = file('windows-x64', 'HN-Browser-1.1.6-win-x64.exe', '1.1.6', 41);
  fs.writeFileSync(path.join(fixtures, 'feed.json'), JSON.stringify({ release: { version: '1.1.6-41', publishedAt: '2026-10-25T10:00:00Z', assets: { 'windows-x64': browser.asset } }, apps: { 'secure-network-windows': file('secure-network-windows', 'HN-Secure-Network-2.0.1-windows-x64.exe', '2.0.1', 4), 'app-manager-windows': file('app-manager-windows', 'HN-Group-App-Manager-9.0.0-win-x64.exe', '9.0.0', 9) } }));
  // HN Browser's settings, with one App Manager doesn't know about; and this PC isn't approved yet.
  fs.mkdirSync(path.join(profile, 'roaming', 'HN Browser'), { recursive: true });
  fs.writeFileSync(path.join(profile, 'roaming', 'HN Browser', 'preferences.json'), JSON.stringify({ theme: 'daylight', futureFeature: 42 }));
  fs.writeFileSync(path.join(profile, 'device-status.txt'), 'unlinked');
  let app;
  const step = (name) => console.log('· ' + name);
  try {
    app = await electron.launch({ args: [path.join(__dirname, '..'), ...((process.getuid?.() === 0 || process.env.CI) ? ['--no-sandbox'] : [])], env: { ...process.env, HN_MANAGER_TEST: '1', HN_MANAGER_TEST_PROFILE: profile, HN_MANAGER_TEST_FIXTURES: fixtures } });
    const test = (fn, arg) => app.evaluate(fn, arg);
    const events = () => test(() => global.__managerTest.platform.events);
    const setOpen = (id, on) => test(({}, [id, on]) => { const s = global.__managerTest.platform.open; if (on) s.add(id); else s.delete(id); }, [id, on]);
    const testLog = () => test(() => global.__managerTest.log);

    step('this device is not authorised');
    const gate = await app.firstWindow(); gate.setDefaultTimeout(15000); await gate.waitForURL(/device\.html$/);
    await gate.waitForFunction(() => document.querySelector('#code')?.textContent === 'ABCD-2345');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1, 'App Manager waits for approval');
    fs.writeFileSync(path.join(profile, 'device-status.txt'), 'authorised');
    const opened = app.waitForEvent('window', { predicate: (w) => !w.url().endsWith('device.html'), timeout: 20000 });
    await gate.locator('#check').click();
    const page = await opened; page.setDefaultTimeout(15000); await page.waitForURL(/index\.html$/);
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const shot = async (name) => { await page.evaluate(() => { document.getElementById('toast').hidden = true; }); for (const scheme of ['light', 'dark']) { await page.emulateMedia({ colorScheme: scheme }); await page.waitForTimeout(450); await page.screenshot({ path: path.join(shots, name + '-' + scheme + '.png') }); } await page.emulateMedia({ colorScheme: 'light' }); };
    const confirm = async (title) => { await page.locator('#sheet', { hasText: title }).waitFor(); assert.equal(await page.evaluate(() => document.activeElement?.dataset.choice), 'cancel', 'the safe choice has focus'); await page.locator('#sheet [data-choice=ok]').click(); await page.locator('#layer').waitFor({ state: 'hidden' }); };

    step('sign in with HN Group Auth');
    await page.locator('[data-step=signed-out]').waitFor();
    assert.equal(await page.locator('#shell').isVisible(), false);
    assert.match((await page.evaluate(() => window.manager.call('enqueue', 'browser', 'update'))).error, /Unlock App Manager/);
    await shot('sign-in');
    await page.locator('#sign-in').click(); await page.locator('[data-step=waiting]').waitFor();
    const signIn = new URL((await testLog()).find((x) => x.signIn).signIn);
    assert.equal(signIn.searchParams.get('client_id'), 'app-manager');
    const back = new URL(signIn.searchParams.get('redirect_uri'));
    const reply = await fetch(back.href + '?code=' + 'b'.repeat(64) + '&state=' + signIn.searchParams.get('state'));
    assert.equal(reply.status, 200);
    await page.locator('#shell').waitFor();
    await page.locator('#me-name', { hasText: 'Charlie Livsey' }).waitFor();

    step('apps, and an update that waits for the app to be quit');
    await page.locator('#apps-title', { hasText: 'HN Browser has an update' }).waitFor();
    await page.locator('[data-app=browser] .pill', { hasText: 'Update available' }).waitFor();
    await page.locator('[data-app=network] .pill', { hasText: 'Not installed' }).waitFor();
    await page.waitForTimeout(300); await shot('apps');
    await setOpen('browser', true);
    await page.locator('[data-app=browser] [data-action=update]').click();
    await page.locator('#dock-title', { hasText: 'Waiting for you to quit HN Browser' }).waitFor();
    await page.waitForTimeout(400); assert.deepEqual(await events(), [], 'nothing changes while it’s open');
    await shot('waiting');
    await setOpen('browser', false);
    await page.locator('[data-app=browser] .pill', { hasText: 'Up to date' }).waitFor({ timeout: 20000 });
    assert.deepEqual((await events()).filter((e) => e.install), [{ install: 'browser', version: '1.1.6-41' }]);

    step('install, asked in the HN design');
    await page.locator('[data-app=network] [data-action=install]').click();
    await page.locator('#sheet', { hasText: 'Install HN Secure Network 2.0.1?' }).waitFor(); await page.waitForTimeout(400); await shot('install-question');
    await confirm('Install HN Secure Network 2.0.1?');
    await page.locator('#dock').waitFor(); await shot('installing');
    await page.locator('[data-app=network] .pill', { hasText: 'Up to date' }).waitFor({ timeout: 20000 });

    step('an app page and its settings');
    await page.locator('[data-app=browser] .app-name').click();
    await page.locator('#app-name', { hasText: 'HN Browser' }).waitFor();
    await page.locator('#setting-theme').waitFor();
    assert.equal(await page.locator('#setting-theme').inputValue(), 'daylight', 'the app’s current settings are read');
    assert.equal(await page.locator('[data-setting=vpnAutoConnect]').count(), 0, 'the VPN auto-connect setting is gone');
    await page.locator('#setting-theme').selectOption('forest'); await page.locator('#setting-reduceMotion').click(); await page.locator('#setting-startup [data-value=restore]').click();
    await page.locator('#save-bar').waitFor(); await shot('app');
    await page.locator('#settings-save').click(); await page.locator('#save-bar').waitFor({ state: 'hidden' });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile, 'roaming', 'HN Browser', 'preferences.json'), 'utf8')), { theme: 'forest', futureFeature: 42, reduceMotion: true, startup: 'restore' });
    await setOpen('browser', true);
    await page.locator('#app-pill', { hasText: 'open' }).waitFor({ timeout: 20000 });
    assert.equal(await page.locator('#setting-theme').isDisabled(), true, 'settings can’t change while the app is open');
    await setOpen('browser', false);

    step('the … menu, and removing an app');
    await page.locator('.nav[data-go=apps]').click();
    await page.locator('[data-app=network] [data-action=more]').click();
    await page.locator('#menu').waitFor(); await page.waitForTimeout(250); await shot('menu');
    await page.locator('#menu button', { hasText: 'Remove' }).click();
    await page.locator('#sheet', { hasText: 'Disconnect the VPN first' }).waitFor();
    await confirm('Remove HN Secure Network?');
    await page.locator('[data-app=network] .pill', { hasText: 'Not installed' }).waitFor({ timeout: 20000 });
    assert.deepEqual((await events()).at(-1), { uninstall: 'network' });

    step('App Manager updates itself in the app');
    await page.locator('.nav[data-go=updates]').click();
    // "Keep App Manager up to date" is on: the update downloads by itself after checking.
    await page.locator('#self-install').waitFor({ timeout: 20000 });
    assert.equal(await page.locator('.page[data-page=updates] [data-pref=autoUpdateSelf]').getAttribute('aria-checked'), 'true', 'switches show their real setting on every page');
    await page.locator('#self-status', { hasText: 'Version 9.0.0 is ready to install' }).waitFor();
    await page.locator('#self-note', { hasText: 'Restart to update' }).waitFor();
    await shot('updates');
    await page.locator('#self-install').click();
    await confirm('Restart to update App Manager?');
    await page.waitForFunction(() => window.manager.call('state').then((r) => r.value.updater.status === 'installing'));
    assert.ok((await testLog()).some((x) => x.restartToUpdate === '9.0.0-9'));
    assert.deepEqual((await events()).at(-1), { selfUpdate: '9.0.0', reopen: true });

    step('activity');
    await page.locator('.nav[data-go=activity]').click();
    for (const t of ['HN Browser was updated to 1.1.6.', 'HN Secure Network 2.0.1 was installed.', 'HN Browser settings changed', 'HN Secure Network was removed.', 'App Manager is updating to 9.0.0']) await page.locator('.event', { hasText: t }).first().waitFor();
    await shot('activity');

    step('settings and diagnostics');
    await page.locator('.nav[data-go=settings]').click();
    await page.locator('#device-text', { hasText: 'Approved on devices.hngroup.org.uk' }).waitFor();
    await page.locator('.page[data-page=settings] [data-pref=notify]').click();
    await page.waitForFunction(() => window.manager.call('state').then((r) => r.value.preferences.notify === false));
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'app-manager.json'), 'utf8')).preferences.notify, false, 'preferences are kept');
    await page.locator('.page[data-page=settings] [data-pref=notify][aria-checked=false]').waitFor();
    await page.locator('#run-check').click();
    await page.locator('#checks li', { hasText: 'downloads.hngroup.org.uk answers' }).waitFor();
    assert.equal(await page.locator('#checks li.bad').count(), 0, 'the self-check passes');
    await page.locator('#log-tail').waitFor();
    assert.match(await page.locator('#log-tail').textContent(), /HN Browser update to 1\.1\.6-41 finished/);
    await shot('settings');
    await page.locator('#open-logs').click();
    await page.waitForFunction(() => true);
    assert.ok((await testLog()).length);
    const logText = fs.readFileSync(path.join(profile, 'logs', 'app-manager.log'), 'utf8');
    assert.ok(!logText.includes('b'.repeat(64)) && !logText.includes('a'.repeat(64)), 'the log never keeps sign-in codes or tokens');

    step('locking, and the PIN');
    await page.locator('#lock').click(); await page.locator('[data-step=locked]').waitFor();
    assert.match((await page.evaluate(() => window.manager.call('enqueue', 'browser', 'reinstall'))).error, /Unlock App Manager/, 'a locked App Manager changes nothing');
    await page.keyboard.type('111111'); await page.locator('#pin-status', { hasText: 'That PIN isn’t right' }).waitFor();
    await page.keyboard.type('2468'); await page.waitForTimeout(250); await shot('pin');
    await page.keyboard.type('10'); await page.locator('#shell').waitFor();

    step('isolation');
    assert.equal(await page.evaluate(() => typeof require), 'undefined');
    assert.deepEqual(await page.evaluate(() => Object.keys(window.manager).sort()), ['call', 'onDialog', 'onGo', 'onState']);
    assert.match((await page.evaluate(() => window.manager.call('shell', 'rm -rf /'))).error, /Unknown request/);
    assert.match((await page.evaluate(() => window.manager.call('enqueue', '../evil', 'install'))).error, /Choose an HN Group app/);
    assert.match((await page.evaluate(() => window.manager.call('enqueue', 'browser', 'format-disk'))).error, /isn’t something/);
    await page.locator('.nav[data-go=apps]').click(); await page.setViewportSize({ width: 900, height: 640 }); await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no sideways scrolling at the smallest size');
    assert.deepEqual(errors, []);
    console.log('App Manager desktop passed: not-authorised window, sign-in and PIN, waiting update, install, settings, menu, removal, in-app self-update, activity, preferences, diagnostics, locking and isolation. Screenshots in app-manager/screenshots.');
  } finally {
    await app?.evaluate(({ app }) => { setTimeout(() => app.exit(0), 50); }).catch(() => {});
    await app?.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
