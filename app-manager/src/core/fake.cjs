'use strict';
// Desktop tests only (left out of builds): a pretend Windows PC with HN Browser installed, whose apps are "open"
// when the test says so. Downloads are still checked for real; settings are real preferences files in the test's
// folder; nothing is installed or run.
const path = require('node:path');
const { app: entry } = require('./catalog.cjs');
const { verify, short } = require('./feed.cjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

class FakePlatform {
  constructor({ log, dir }) {
    Object.assign(this, { log, roaming: dir });
    this.name = 'win32';
    this.supported = true;
    this.apps = { browser: { path: 'C:\\Program Files\\HN Browser', exe: 'C:\\Program Files\\HN Browser\\HN Browser.exe', version: '1.1.5', build: 40 }, network: null };
    this.open = new Set();
    this.events = [];
    this.failNext = null;
  }
  async find(id) { entry(id); return this.apps[id] ? { ...this.apps[id] } : null; }
  async running(found) { return !!found && [...this.open].some((id) => this.apps[id] && this.apps[id].path === found.path); }
  async install(id, file, rel) {
    await verify(file, rel);
    await wait(400);
    if (this.failNext) { const m = this.failNext; this.failNext = null; throw Object.assign(new Error(m)); }
    const a = entry(id), [version, build] = rel.version.split('-');
    this.apps[id] = { path: 'C:\\Program Files\\' + a.name, exe: 'C:\\Program Files\\' + a.name + '\\' + a.exe, version, build: Number(build) || 0 };
    this.events.push({ install: id, version: rel.version });
    return this.find(id);
  }
  async uninstall(id) { await wait(250); this.apps[id] = null; this.events.push({ uninstall: id }); }
  preferencesFile(id) { return path.join(this.roaming, entry(id).data, 'preferences.json'); }
  async readNative() { return {}; }
  async writeNative() {}
  self() { return { bundle: null, location: 'installed' }; }
  async stageSelf(file, rel) { await verify(file, rel); return { kind: 'fake', path: file, version: rel.version, size: rel.size, sha256: rel.sha256 }; }
  async applySelf(staged, { reopen }) { this.events.push({ selfUpdate: short(staged.version), reopen }); }
}
module.exports = { FakePlatform };
