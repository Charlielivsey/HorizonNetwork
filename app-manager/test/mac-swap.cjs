'use strict';
// Runs the real Mac swap scripts against throwaway .app folders: a fresh install, an update that replaces the old
// copy, waiting for a process to end first, cleaning up afterwards, and leaving the installed copy alone when the copy
// fails. Everywhere else it only checks the scripts are valid bash.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { scripts } = require('../src/core/macos.cjs');

const mac = process.platform === 'darwin';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-mac-swap-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

function bundle(at, version) {
  fs.mkdirSync(path.join(at, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(at, 'Contents', 'version.txt'), version);
  return at;
}
function prepare(name, opts) {
  const work = path.join(root, name + '-work');
  fs.mkdirSync(work, { recursive: true });
  const s = scripts({ work, prompt: 'Test', ...opts });
  fs.writeFileSync(s.swapFile, s.swap, { mode: 0o700 });
  fs.writeFileSync(s.mainFile, s.main, { mode: 0o700 });
  return { ...s, work };
}
const run = (file) => spawnSync('/bin/bash', [file], { encoding: 'utf8', timeout: 90000 });
const version = (b) => fs.readFileSync(path.join(b, 'Contents', 'version.txt'), 'utf8');
const leftovers = (dir) => fs.readdirSync(dir).filter((n) => n.includes('.hn-manager-') || n.includes('.hn-old-'));

test('the scripts are valid bash', () => {
  const s = prepare('syntax', { source: '/x/New.app', target: "/Applications/It's.app", pid: 123, reopen: true, fallback: '/x/Old.app', cleanup: true });
  for (const f of [s.swapFile, s.mainFile]) assert.equal(spawnSync('/bin/bash', ['-n', f]).status, 0, f);
});

test('installs a new app', { skip: !mac }, () => {
  const apps = path.join(root, 'install'); fs.mkdirSync(apps);
  const source = bundle(path.join(root, 'staged-1', 'Test.app'), '1.0.0');
  const target = path.join(apps, 'Test.app');
  const s = prepare('install', { source, target });
  assert.equal(run(s.mainFile).status, 0);
  assert.equal(version(target), '1.0.0');
  assert.deepEqual(leftovers(apps), []);
});

test('replaces an installed copy after its process ends, then cleans up', { skip: !mac }, async () => {
  const apps = path.join(root, 'update'); fs.mkdirSync(apps);
  const target = bundle(path.join(apps, 'Test.app'), '1.0.0');
  const source = bundle(path.join(root, 'staged-2', 'Test.app'), '2.0.0');
  const sleeper = spawn('/bin/sleep', ['2']);
  const s = prepare('update', { source, target, pid: sleeper.pid, cleanup: true });
  const started = Date.now();
  const r = run(s.mainFile);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Date.now() - started >= 1500, 'waited for the process to end');
  assert.equal(version(target), '2.0.0');
  assert.deepEqual(leftovers(apps), []);
  assert.equal(fs.existsSync(s.work), false, 'work folder removed');
});

// A signed app with framework-style links, zipped as the release builds are, and checked by the real unpack.
function zipped(name, { escape = false } = {}) {
  const dir = path.join(root, name), app = path.join(dir, 'Test.app');
  fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>uk.org.hngroup.test</string><key>CFBundleShortVersionString</key><string>1.2.3</string><key>CFBundleExecutable</key><string>Test</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>\n');
  fs.copyFileSync('/usr/bin/true', path.join(app, 'Contents', 'MacOS', 'Test'));
  const fw = path.join(app, 'Contents', 'Resources', 'Thing');
  fs.mkdirSync(path.join(fw, 'Versions', 'A', 'Resources'), { recursive: true });
  fs.writeFileSync(path.join(fw, 'Versions', 'A', 'Resources', 'x.txt'), 'x');
  fs.symlinkSync('A', path.join(fw, 'Versions', 'Current'));
  fs.symlinkSync('Versions/Current/Resources', path.join(fw, 'Resources'));
  if (escape) fs.symlinkSync('/etc', path.join(app, 'Contents', 'outside'));
  // The escaping link is refused before the signature is checked, so that copy isn't signed.
  if (!escape) { const sign = spawnSync('/usr/bin/codesign', ['--force', '-s', '-', app], { encoding: 'utf8' }); assert.equal(sign.status, 0, 'ad-hoc sign: ' + sign.stderr); }
  const zip = path.join(root, name + '.zip');
  assert.equal(spawnSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', app, zip]).status, 0, 'zip');
  return zip;
}

test('unpacks a signed app with framework links from the temporary folder', { skip: !mac }, async () => {
  const { MacPlatform } = require('../src/core/macos.cjs');
  const p = new MacPlatform({ log: { info() {}, warn() {}, error() {} } });
  const r = await p.unpack(zipped('links'), 'uk.org.hngroup.test', '1.2.3-9');
  assert.ok(fs.existsSync(path.join(r.source, 'Contents', 'Resources', 'Thing', 'Resources', 'x.txt')));
  fs.rmSync(r.work, { recursive: true, force: true });
  await assert.rejects(p.unpack(zipped('escape', { escape: true }), 'uk.org.hngroup.test', '1.2.3-9'), /unsafe link/);
});

test('a failed copy leaves the installed app as it was', { skip: !mac }, () => {
  const apps = path.join(root, 'fail'); fs.mkdirSync(apps);
  const target = bundle(path.join(apps, 'Test.app'), '1.0.0');
  const s = prepare('fail', { source: path.join(root, 'missing', 'Test.app'), target });
  const r = run(s.mainFile);
  assert.notEqual(r.status, 0);
  assert.equal(version(target), '1.0.0');
  assert.deepEqual(leftovers(apps), []);
});
