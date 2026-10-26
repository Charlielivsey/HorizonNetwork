'use strict';
// App Manager's core, without a window: release records, checked downloads, settings, preferences, the queue
// (waiting for an app to be quit, cancelling, failures), and App Manager's own updates.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const feed = require('../src/core/feed.cjs');
const settings = require('../src/core/settings.cjs');
const { Store } = require('../src/core/store.cjs');
const { Manager } = require('../src/core/manager.cjs');
const { Updater } = require('../src/core/updater.cjs');
const { FakePlatform } = require('../src/core/fake.cjs');
const { Log, clean } = require('../src/core/log.cjs');
const { uninstaller } = require('../src/core/windows.cjs');
const { scripts, bundleOf, temporary } = require('../src/core/macos.cjs');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hn-manager-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await wait(25); } throw Error('Timed out'); }

// A stand-in downloads service: the feed, and the files it lists.
function service() {
  const files = {}, add = (route, name, version, build) => { const data = Buffer.from(name + ' '.repeat(4096)); files[route] = data; return { version, build, publishedAt: '2026-10-25T10:00:00Z', asset: { name, size: data.length, sha256: sha(data), url: '/download/' + route } }; };
  const browser = add('windows-x64', 'HN-Browser-1.1.6-win-x64.exe', '1.1.6', 41);
  const value = { release: { version: '1.1.6-41', publishedAt: '2026-10-25T10:00:00Z', assets: { 'windows-x64': browser.asset } }, apps: { 'secure-network-windows': add('secure-network-windows', 'HN-Secure-Network-2.0.1-windows-x64.exe', '2.0.1', 4), 'app-manager-windows': add('app-manager-windows', 'HN-Group-App-Manager-3.1.0-win-x64.exe', '3.1.0', 9) } };
  let down = false, slow = 0;
  const fetcher = async (url, o = {}) => {
    if (down) throw Error('offline');
    const u = new URL(url);
    if (u.pathname === '/api/releases') return Response.json(value);
    const data = files[u.pathname.slice('/download/'.length)];
    if (!data) return new Response('', { status: 404 });
    if (!slow) return new Response(data);
    const chunks = [data.subarray(0, 100), data.subarray(100)];
    return new Response(new ReadableStream({ async pull(c) { if (o.signal && o.signal.aborted) return c.error(o.signal.reason); await wait(slow); const next = chunks.shift(); if (next) c.enqueue(next); else c.close(); } }));
  };
  return { value, fetcher, files, offline: (v) => { down = v; }, slow: (ms) => { slow = ms; } };
}
function setup() {
  const dir = tmp(), log = new Log(dir), platform = new FakePlatform({ log, dir }), store = new Store(dir), svc = service();
  const updater = new Updater({ platform, log, dir, version: '3.0.0', build: 7, arch: 'x64', fetcher: svc.fetcher });
  const manager = new Manager({ platform, store, log, updater, dataDir: dir, arch: 'x64', fetcher: svc.fetcher });
  return { dir, log, platform, store, svc, updater, manager, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('release records: only the exact app, platform, name and route', () => {
  const { value } = service();
  assert.equal(feed.release(value, 'browser', 'win32', 'x64').version, '1.1.6-41');
  assert.equal(feed.release(value, 'network', 'win32', 'x64').version, '2.0.1-4');
  assert.equal(feed.release(value, 'manager', 'win32', 'x64').version, '3.1.0-9');
  assert.equal(feed.release(value, 'browser', 'win32', 'arm64'), null);
  assert.equal(feed.release(value, 'browser', 'linux', 'x64'), null);
  for (const bad of [{ url: '/download/elsewhere' }, { name: 'evil.exe' }, { size: 0 }, { size: feed.MAX + 1 }, { sha256: 'x' }]) { const v = structuredClone(value); Object.assign(v.release.assets['windows-x64'], bad); assert.equal(feed.release(v, 'browser', 'win32', 'x64'), null, JSON.stringify(bad)); }
  assert.ok(feed.newer('1.1.6-41', '1.1.6-40') && feed.newer('1.2.0', '1.1.9-99') && !feed.newer('1.1.6', '1.1.6') && !feed.newer('x', '1.0.0'));
});

test('downloads are checked, reused when complete, and never kept when wrong', async () => {
  const dir = tmp(), svc = service();
  try {
    const r = feed.release(svc.value, 'browser', 'win32', 'x64');
    const file = await feed.download(r, dir, { fetcher: svc.fetcher });
    assert.ok(fs.readFileSync(file).equals(svc.files['windows-x64']));
    svc.offline(true); assert.equal(await feed.download(r, dir, { fetcher: svc.fetcher }), file, 'a complete earlier download is reused'); svc.offline(false);
    fs.writeFileSync(file, 'tampered');
    await assert.rejects(feed.verify(file, r), /wrong size|checksum/);
    svc.files['windows-x64'] = Buffer.alloc(svc.files['windows-x64'].length, 1);
    await assert.rejects(feed.download(r, dir, { fetcher: svc.fetcher }), /checksum/);
    assert.deepEqual(fs.readdirSync(dir), [], 'nothing wrong is left behind');
    await assert.rejects(feed.download({ ...r, url: 'https://evil.example/x' }, dir, { fetcher: svc.fetcher }), /isn’t valid/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('app settings: only known fields and values, unknown keys kept', async () => {
  const dir = tmp(), file = path.join(dir, 'HN Browser', 'preferences.json');
  try {
    fs.mkdirSync(path.dirname(file)); fs.writeFileSync(file, JSON.stringify({ theme: 'forest', future: 1 }));
    await settings.writeJSON(file, 'browser', 'win32', { theme: 'rose', saveHistory: false });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { theme: 'rose', future: 1, saveHistory: false });
    assert.throws(() => settings.validate('browser', 'win32', { vpnAutoConnect: true }), /can’t be changed/, 'the removed VPN auto-connect setting can’t be written');
    assert.throws(() => settings.validate('browser', 'win32', { theme: 'neon' }), /valid value/);
    assert.throws(() => settings.validate('network', 'darwin', { sshUser: 'root; rm -rf /' }), /valid value/);
    assert.equal(settings.values('browser', 'win32', { autoLock: 15, theme: 'bogus' }).theme, 'midnight-lavender');
    assert.ok(settings.describe('browser', 'win32').find((f) => f.key === 'autoLock').options.some((o) => o.label === 'Never'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('App Manager’s preferences and history are kept and checked', () => {
  const dir = tmp();
  try {
    const a = new Store(dir);
    assert.deepEqual(a.preferences, { theme: 'system', autoCheck: true, autoUpdateApps: false, autoUpdateSelf: true, notify: true, background: true, openAtLogin: false });
    a.set('theme', 'dark'); a.record('update', 'HN Browser was updated to 1.1.6.', 'browser');
    assert.throws(() => a.set('theme', 'neon')); assert.throws(() => a.set('shell', true));
    const b = new Store(dir); assert.equal(b.preferences.theme, 'dark'); assert.equal(b.activity[0].message, 'HN Browser was updated to 1.1.6.');
    for (let i = 0; i < 250; i++) b.record('check', 'x'); assert.equal(new Store(dir).activity.length, 200);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the log never keeps tokens, codes or PINs', () => {
  assert.equal(clean('code=123456&state=abc token=' + 'a'.repeat(64)), 'code=…&state=… token=…');
  assert.equal(clean('Bearer ' + 'f'.repeat(64)), '…');
  const dir = tmp(); try { const l = new Log(dir); l.info('t', 'pin=246810 ok'); assert.match(l.tail().pop(), /pin=… ok/); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('checking finds updates; a change for an open app waits until it’s quit, and can be cancelled', async () => {
  const t = setup();
  try {
    await t.manager.check();
    const s = t.manager.snapshot();
    assert.equal(s.apps.find((a) => a.id === 'browser').update, true);
    assert.equal(s.apps.find((a) => a.id === 'network').installed, null);
    assert.equal(t.updater.state.status, 'available', 'App Manager’s own update was noticed');
    // Open: it waits, never closes the app, and continues once it's quit.
    t.platform.open.add('browser');
    t.manager.enqueue('browser', 'update');
    await until(() => t.manager.snapshot().job && t.manager.snapshot().job.phase === 'waiting');
    await wait(300); assert.deepEqual(t.platform.events, [], 'nothing changes while it’s open');
    t.platform.open.delete('browser');
    await until(() => !t.manager.snapshot().job);
    assert.deepEqual(t.platform.events, [{ install: 'browser', version: '1.1.6-41' }]);
    assert.equal(t.manager.snapshot().apps.find((a) => a.id === 'browser').update, false);
    assert.equal(t.store.activity[0].message, 'HN Browser was updated to 1.1.6.');
    // Cancelled while waiting: nothing happens.
    t.platform.open.add('browser');
    t.manager.enqueue('browser', 'reinstall');
    await until(() => t.manager.snapshot().job && t.manager.snapshot().job.phase === 'waiting');
    t.manager.cancel('browser');
    await until(() => !t.manager.snapshot().job);
    assert.equal(t.platform.events.length, 1);
    // Cancelled while downloading: nothing is installed and nothing is left behind.
    t.platform.open.delete('browser'); t.svc.slow(400);
    t.manager.enqueue('network', 'install');
    await until(() => t.manager.snapshot().job && t.manager.snapshot().job.phase === 'downloading');
    t.manager.cancel('network');
    await until(() => !t.manager.snapshot().job);
    assert.equal(t.platform.events.length, 1);
    assert.deepEqual(fs.readdirSync(path.join(t.dir, 'downloads')).filter((n) => n.endsWith('.part')), []);
    // Automatic updates skip apps that are open.
    t.svc.slow(0); t.platform.apps.network = { path: 'C:\\SN', exe: 'C:\\SN\\x.exe', version: '2.0.0', build: 3 }; t.platform.open.add('network');
    t.manager.enqueue('network', 'update', { auto: true });
    await until(() => !t.manager.working);
    assert.equal(t.platform.events.length, 1, 'an open app isn’t updated automatically');
    // A failure is reported and recorded.
    t.platform.open.delete('network'); t.platform.failNext = 'Windows blocked the installer.';
    t.manager.enqueue('network', 'update');
    await until(() => !t.manager.working);
    assert.match(t.store.activity[0].message, /HN Secure Network: Windows blocked the installer\./);
    assert.ok(t.log.tail().some((l) => l.includes('ERROR') && l.includes('Windows blocked')), 'and written to the log');
    // Removing.
    t.manager.enqueue('network', 'remove');
    await until(() => !t.manager.working);
    assert.deepEqual(t.platform.events.at(-1), { uninstall: 'network' });
    assert.throws(() => t.manager.enqueue('browser', 'format-disk'), /isn’t something/);
    assert.throws(() => t.manager.enqueue('../evil', 'install'), /Choose an HN Group app/);
  } finally { t.done(); }
});

test('the guard can refuse changes (device not approved, account locked)', async () => {
  const t = setup();
  try {
    await t.manager.check();
    t.manager.guard = () => { throw Error('This computer isn’t approved.'); };
    assert.throws(() => t.manager.enqueue('browser', 'update'), /isn’t approved/);
    assert.equal(t.manager.snapshot().queue.length, 0);
  } finally { t.done(); }
});

test('settings are read from and written to the app, only while it’s closed', async () => {
  const t = setup();
  try {
    let s = await t.manager.readSettings('browser');
    assert.equal(s.values.theme, 'midnight-lavender');
    await t.manager.saveSettings('browser', { theme: 'forest' });
    assert.equal(JSON.parse(fs.readFileSync(path.join(t.dir, 'HN Browser', 'preferences.json'), 'utf8')).theme, 'forest');
    t.platform.open.add('browser');
    await assert.rejects(t.manager.saveSettings('browser', { theme: 'rose' }), /Quit HN Browser first/);
    await assert.rejects(t.manager.saveSettings('network', { theme: 'dark' }), /Install HN Secure Network first/);
  } finally { t.done(); }
});

test('App Manager updates itself: download, check, ready, install (and survives a restart)', async () => {
  const t = setup();
  try {
    await t.updater.check();
    assert.equal(t.updater.state.status, 'available');
    assert.equal(t.updater.state.latest.version, '3.1.0-9');
    await t.updater.download();
    assert.equal(t.updater.state.status, 'ready');
    // A restart keeps the ready update.
    const again = new Updater({ platform: t.platform, log: t.log, dir: t.dir, version: '3.0.0', build: 7, arch: 'x64', fetcher: t.svc.fetcher });
    again.consider(t.svc.value);
    assert.equal(again.state.status, 'ready');
    await again.apply({ reopen: true });
    assert.deepEqual(t.platform.events.at(-1), { selfUpdate: '3.1.0', reopen: true });
    // Once it's the running version, it's up to date and the staged copy is forgotten.
    const updated = new Updater({ platform: t.platform, log: t.log, dir: t.dir, version: '3.1.0', build: 9, arch: 'x64', fetcher: t.svc.fetcher });
    updated.consider(t.svc.value);
    assert.equal(updated.state.status, 'up-to-date');
    assert.ok(!fs.existsSync(path.join(t.dir, 'updates', 'staged.json')));
    // A tampered download is refused.
    const fresh = setup();
    try { fresh.svc.files['app-manager-windows'] = Buffer.alloc(fresh.svc.files['app-manager-windows'].length); await fresh.updater.check(); await assert.rejects(fresh.updater.download(), /checksum/); assert.equal(fresh.updater.state.status, 'error'); }
    finally { fresh.done(); }
    // Offline: an error with a message, not a hang.
    t.svc.offline(true); const offline = await updated.check(); assert.equal(offline.status, 'error'); assert.match(offline.error, /can’t be reached/);
  } finally { t.done(); }
});

test('Windows removal only uses an uninstaller inside the app’s own folder', () => {
  assert.equal(uninstaller('"C:\\Apps\\HN\\Uninstall HN Browser.exe" /currentuser', 'C:\\Apps\\HN'), 'C:\\Apps\\HN\\Uninstall HN Browser.exe');
  for (const cmd of ['cmd.exe /c evil', '"C:\\Windows\\Uninstall.exe"', '"C:\\Apps\\HN\\evil.exe"', null]) assert.equal(uninstaller(cmd, 'C:\\Apps\\HN'), null);
});

test('Mac update scripts: wait, swap with rollback, admin only when needed, always reopen', () => {
  assert.equal(bundleOf('/Applications/HN Group App Manager.app/Contents/MacOS/HN Group App Manager'), '/Applications/HN Group App Manager.app');
  assert.ok(temporary('/private/var/folders/x/AppTranslocation/y/d/HN Group App Manager.app') && temporary('/Volumes/HN/HN Group App Manager.app') && !temporary('/Applications/X.app'));
  const s = scripts({ source: '/tmp/w/New.app', target: '/Applications/HN Group App Manager.app', work: '/tmp/w', pid: 42, reopen: true, fallback: '/Volumes/x/HN Group App Manager.app', cleanup: true });
  assert.match(s.main, /kill -0 42/);
  assert.match(s.main, /\[ -w '\/Applications' \]/);
  assert.match(s.main, /with administrator privileges/);
  assert.match(s.main, /else \/usr\/bin\/open '\/Volumes\/x\/HN Group App Manager.app'/);
  assert.match(s.main, /rm -rf '\/tmp\/w'\nexit \$status/, 'the work folder is removed before exiting');
  assert.match(s.swap, /then \/bin\/rm -rf .*hn-old.*else \[ -e .*hn-old.* \] && \/bin\/mv .*hn-old/s, 'the old copy comes back if the swap fails');
});
