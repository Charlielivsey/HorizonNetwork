'use strict';
// App Manager's own preferences and its activity history (app-manager.json in its data folder), kept between runs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PREFERENCES = Object.freeze({
  theme: { values: ['system', 'light', 'dark'], default: 'system' },
  autoCheck: { type: 'boolean', default: true },        // check for updates when it opens and every few hours
  autoUpdateApps: { type: 'boolean', default: false },   // install app updates by themselves (closed apps only)
  autoUpdateSelf: { type: 'boolean', default: true },    // download its own updates and install them when it quits
  notify: { type: 'boolean', default: true },
  background: { type: 'boolean', default: true },        // keep running in the menu bar / system tray
  openAtLogin: { type: 'boolean', default: false },
});
const KINDS = ['install', 'update', 'reinstall', 'remove', 'settings', 'check', 'manager', 'account', 'error'];
const MAX = 200;
function clean(saved) {
  const out = {};
  for (const [k, spec] of Object.entries(PREFERENCES)) {
    const v = saved ? saved[k] : undefined;
    out[k] = spec.type === 'boolean' ? (typeof v === 'boolean' ? v : spec.default) : (spec.values.includes(v) ? v : spec.default);
  }
  return out;
}
class Store {
  constructor(dir) {
    this.file = path.join(dir, 'app-manager.json');
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch {}
    this.preferences = clean(saved.preferences);
    this.activity = (Array.isArray(saved.activity) ? saved.activity : []).filter((a) => a && typeof a.message === 'string' && Number.isFinite(a.at) && KINDS.includes(a.kind)).slice(0, MAX);
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = this.file + '.' + crypto.randomUUID();
    fs.writeFileSync(tmp, JSON.stringify({ preferences: this.preferences, activity: this.activity }), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
  set(key, value) {
    const spec = Object.hasOwn(PREFERENCES, key) ? PREFERENCES[key] : null;
    if (!spec || (spec.type === 'boolean' ? typeof value !== 'boolean' : !spec.values.includes(value))) throw Object.assign(Error('That setting can’t be changed.'), { status: 400 });
    this.preferences = { ...this.preferences, [key]: value };
    this.save();
  }
  record(kind, message, app = null) {
    this.activity.unshift({ at: Date.now(), kind: KINDS.includes(kind) ? kind : 'manager', app, message: String(message).slice(0, 300) });
    this.activity.length = Math.min(this.activity.length, MAX);
    this.save();
  }
  clearActivity() { this.activity = []; this.save(); }
}
module.exports = { Store, PREFERENCES, clean };
