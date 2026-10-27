'use strict';
// App Manager on Linux, without a window: Linux release records, installing an AppImage into ~/Applications with a menu
// entry, recognising its version, noticing it's open, settings and "open when I sign in", removing it to the Bin, and
// App Manager's own update. Uses a pretend home folder; the "AppImages" are small files with an AppImage header.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const feed = require('../src/core/feed.cjs');
const settings = require('../src/core/settings.cjs');
const { LinuxPlatform, cleanEnv } = require('../src/core/linux.cjs');

const log = { info() {}, warn() {}, error() {} };
// A tiny file that looks like an AppImage (ELF header, "AI" 2 at byte 8), different for each version.
const fakeAppImage = (v) => Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0x41, 0x49, 2]), Buffer.alloc(64), Buffer.from('version ' + v)]);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
// The install/update tests use /proc, Unix permissions and /bin/sh, so they run on Linux (CI's Ubuntu runner).
const onlyLinux = { skip: process.platform !== 'linux' && 'needs Linux' };
const rel = (id, version, data) => ({ id, version, name: 'x', size: data.length, sha256: sha(data), url: 'https://downloads.hngroup.org.uk/download/x' });

test('Linux release records: the AppImage of each app, never another platform’s file', () => {
  const asset = (name, route, data = 'x') => ({ name, size: 10, sha256: 'a'.repeat(64), url: '/download/' + route });
  const f = { release: { version: '1.2.0-50', assets: { 'linux-x64': asset('HN-Browser-1.2.0-linux-x86_64.AppImage', 'linux-x64'), 'windows-x64': asset('HN-Browser-1.2.0-win-x64.exe', 'windows-x64') } },
    apps: { 'secure-network-linux': { version: '2.1.0', build: 7, asset: asset('HN-Secure-Network-2.1.0-linux-x86_64.AppImage', 'secure-network-linux') }, 'app-manager-linux': { version: '3.1.0', build: 9, asset: asset('HN-Group-App-Manager-3.1.0-linux-x86_64.AppImage', 'app-manager-linux') } } };
  assert.equal(feed.release(f, 'browser', 'linux', 'x64').url, 'https://downloads.hngroup.org.uk/download/linux-x64');
  assert.equal(feed.release(f, 'network', 'linux', 'x64').version, '2.1.0-7');
  assert.equal(feed.release(f, 'manager', 'linux', 'x64').name, 'HN-Group-App-Manager-3.1.0-linux-x86_64.AppImage');
  assert.equal(feed.release(f, 'browser', 'linux', 'arm64'), null);
  assert.equal(feed.release({ release: { version: '1.2.0-50', assets: { 'linux-x64': asset('HN-Browser-1.2.0-win-x64.exe', 'linux-x64') } } }, 'browser', 'linux', 'x64'), null);
  assert.deepEqual(settings.describe('network', 'linux').map((x) => x.label), ['Appearance', 'Open when I sign in', 'Ask to connect when it opens']);
});

test('Linux: install into ~/Applications with a menu entry, find it, notice it’s open, update, settings, remove to the Bin', onlyLinux, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-manager-linux-')), dl = path.join(home, 'dl');
  fs.mkdirSync(dl);
  try {
    const p = new LinuxPlatform({ log, home, env: { HOME: home }, arch: 'x64', dataDir: path.join(home, 'data'), ui: path.join(__dirname, '..', 'ui') });
    assert.equal(p.supported, true); assert.equal(await p.find('browser'), null);
    const v1 = fakeAppImage('1.1.8'), r1 = rel('browser', '1.1.8-43', v1), f1 = path.join(dl, 'a'); fs.writeFileSync(f1, v1);
    const installed = await p.install('browser', f1, r1);
    const target = path.join(home, 'Applications', 'HN-Browser.AppImage');
    assert.equal(installed.path, target); assert.equal(installed.version, '1.1.8'); assert.equal(installed.build, 43);
    assert.equal(fs.statSync(target).mode & 0o777, 0o755);
    const menu = fs.readFileSync(path.join(home, '.local', 'share', 'applications', 'hn-browser.desktop'), 'utf8');
    assert.match(menu, /^Exec=\S+HN-Browser\.AppImage %U$/m); assert.match(menu, /^Icon=hn-browser$/m); assert.match(menu, /^StartupWMClass=hn-browser$/m);
    assert.ok(fs.existsSync(path.join(home, '.local', 'share', 'icons', 'hicolor', 'scalable', 'apps', 'hn-browser.svg')));
    // A wrong file is never installed.
    fs.writeFileSync(f1, 'not an appimage'); await assert.rejects(p.install('network', f1, rel('network', '2.1.0-1', Buffer.from('not an appimage'))), /isn’t an AppImage/);
    // The app updated itself (a different file): recognised from the release App Manager knows about.
    const v2 = fakeAppImage('1.2.0'); fs.writeFileSync(target, v2); fs.utimesSync(target, new Date(), new Date(Date.now() + 5000));
    assert.equal((await p.find('browser', { latest: rel('browser', '1.2.0-50', v2) })).version, '1.2.0');
    assert.equal((await p.find('browser')).build, 50, 'remembered for next time');
    // A downloaded AppImage saved with its version in the name, in ~/AppImages.
    fs.mkdirSync(path.join(home, 'AppImages')); fs.writeFileSync(path.join(home, 'AppImages', 'HN-Secure-Network-2.0.9-linux-x86_64.AppImage'), fakeAppImage('2.0.9'));
    assert.equal((await p.find('network')).version, '2.0.9');
    // Open: a process started from the AppImage.
    const found = await p.find('browser');
    assert.equal(await p.running(found), false);
    const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{},20000)'], { env: { ...process.env, APPIMAGE: target }, stdio: 'ignore' });
    try {
      for (let i = 0; i < 50 && !await p.running(found); i++) await new Promise((r) => setTimeout(r, 50));
      assert.equal(await p.running(found), true);
      await assert.rejects(p.install('browser', (fs.writeFileSync(f1, v2), f1), rel('browser', '1.2.0-50', v2)), /Quit HN Browser first/);
    } finally { child.kill(); }
    // Settings go to the app's own data folder; Secure Network's "open when I sign in" is an autostart entry.
    assert.equal(p.preferencesFile('browser'), path.join(home, '.config', 'HN Browser', 'preferences.json'));
    const net = await p.find('network');
    await p.afterSettings('network', net, { launchAtLogin: true });
    assert.match(fs.readFileSync(path.join(home, '.config', 'autostart', 'hn-secure-network.desktop'), 'utf8'), /^Exec=\S+HN-Secure-Network-2\.0\.9-linux-x86_64\.AppImage --hidden$/m);
    // Removing moves the AppImage to the Bin (restorable) and takes the menu entry away; data is kept.
    fs.mkdirSync(path.join(home, '.config', 'HN Browser'), { recursive: true }); fs.writeFileSync(path.join(home, '.config', 'HN Browser', 'preferences.json'), '{}');
    await p.uninstall('browser', found);
    assert.equal(fs.existsSync(target), false); assert.equal(await p.find('browser'), null);
    assert.ok(fs.existsSync(path.join(home, '.local', 'share', 'Trash', 'files', 'HN-Browser.AppImage')));
    assert.match(fs.readFileSync(path.join(home, '.local', 'share', 'Trash', 'info', 'HN-Browser.AppImage.trashinfo'), 'utf8'), /^Path=.*\/Applications\/HN-Browser\.AppImage$/m);
    assert.equal(fs.existsSync(path.join(home, '.local', 'share', 'applications', 'hn-browser.desktop')), false);
    assert.ok(fs.existsSync(path.join(home, '.config', 'HN Browser', 'preferences.json')), 'the app’s data is kept');
    await p.uninstall('network', net);
    assert.equal(fs.existsSync(path.join(home, '.config', 'autostart', 'hn-secure-network.desktop')), false);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('Linux: App Manager’s own update is staged, checked and swapped in after it quits', onlyLinux, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-manager-self-'));
  try {
    const dev = new LinuxPlatform({ log, home, env: {}, packaged: true });
    assert.equal(dev.self().location, 'development');
    const downloadsCopy = path.join(home, 'Downloads', 'HN-Group-App-Manager-3.0.0-linux-x86_64.AppImage');
    fs.mkdirSync(path.dirname(downloadsCopy), { recursive: true }); fs.writeFileSync(downloadsCopy, fakeAppImage('3.0.0'));
    assert.equal(new LinuxPlatform({ log, home, env: { APPIMAGE: downloadsCopy } }).self().location, 'temporary');
    const installedCopy = path.join(home, 'Applications', 'HN-Group-App-Manager.AppImage');
    fs.mkdirSync(path.dirname(installedCopy), { recursive: true }); fs.writeFileSync(installedCopy, fakeAppImage('3.0.0'), { mode: 0o755 });
    const p = new LinuxPlatform({ log, home, env: { APPIMAGE: installedCopy, PATH: process.env.PATH }, dataDir: path.join(home, 'data') });
    assert.equal(p.self().location, 'installed');
    const data = fakeAppImage('3.1.0'), r = rel('manager', '3.1.0-9', data), file = path.join(home, 'dl'); fs.writeFileSync(file, data);
    const staged = await p.stageSelf(file, r, path.join(home, 'updates'));
    assert.equal(staged.kind, 'linux'); assert.equal(fs.readFileSync(staged.path).equals(data), true);
    await p.applySelf(staged, { reopen: false, pid: 0 });
    for (let i = 0; i < 100 && !fs.readFileSync(installedCopy).equals(data); i++) await new Promise((res) => setTimeout(res, 50));
    assert.ok(fs.readFileSync(installedCopy).equals(data), 'the new App Manager is in place');
    assert.equal(fs.statSync(installedCopy).mode & 0o777, 0o755);
    assert.match(fs.readFileSync(path.join(home, '.local', 'share', 'applications', 'hn-group-app-manager.desktop'), 'utf8'), /^Name=HN Group App Manager$/m);
    // A changed staged file is refused.
    fs.appendFileSync(staged.path, 'x'); await assert.rejects(p.applySelf(staged, { reopen: false, pid: 0 }), /checksum|wrong size/);
    const env = cleanEnv({ APPDIR: '/tmp/.mount_a', APPIMAGE: '/a', PATH: '/tmp/.mount_a:/usr/bin', LD_LIBRARY_PATH: '/tmp/.mount_a/usr/lib', HOME: '/h' });
    assert.deepEqual(env, { PATH: '/usr/bin', HOME: '/h' });
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
