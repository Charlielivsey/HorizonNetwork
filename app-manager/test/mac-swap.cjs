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

test('a failed copy leaves the installed app as it was', { skip: !mac }, () => {
  const apps = path.join(root, 'fail'); fs.mkdirSync(apps);
  const target = bundle(path.join(apps, 'Test.app'), '1.0.0');
  const s = prepare('fail', { source: path.join(root, 'missing', 'Test.app'), target });
  const r = run(s.mainFile);
  assert.notEqual(r.status, 0);
  assert.equal(version(target), '1.0.0');
  assert.deepEqual(leftovers(apps), []);
});
