'use strict';
// What App Manager knows and does, without any window: the state of each app, checking for updates, and one change
// at a time from a queue (install, update, reinstall or remove). A change for an app that's open waits until the
// person quits it — App Manager never closes another app — and can be cancelled while it waits or downloads.
// Everything has a time limit, and every step and problem is written to the log.
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { APPS, IDS, app: entry } = require('./catalog.cjs');
const { release, newer, short, download, fetchFeed } = require('./feed.cjs');
const settings = require('./settings.cjs');

const KINDS = ['install', 'update', 'reinstall', 'remove'];
const fail = (message, extra) => Object.assign(new Error(message), extra || {});
const sleep = (ms, signal) => new Promise((resolve, reject) => { const t = setTimeout(resolve, ms); signal && signal.addEventListener('abort', () => { clearTimeout(t); reject(fail('Cancelled.', { cancelled: true })); }, { once: true }); });
const within = (promise, ms, message) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(fail(message)), ms).unref?.())]);

class Manager extends EventEmitter {
  constructor({ platform, store, log, updater, dataDir, arch, fetcher = fetch, guard = () => {} }) {
    super();
    Object.assign(this, { platform, store, log, updater, dataDir, arch, fetcher, guard });
    this.feed = null;
    this.queue = [];
    this.job = null;
    this.working = false;
    this.state = { checking: false, checkedAt: null, error: null, apps: Object.fromEntries(IDS.map((id) => [id, this.blank(id)])) };
  }
  blank(id) { const a = APPS[id]; return { id, name: a.name, kind: a.kind, tagline: a.tagline, icon: a.icon, installed: null, running: false, latest: null, update: false, available: this.availableHere(id), error: null }; }
  availableHere(id) { const a = APPS[id]; return this.platform.supported && (this.platform.name !== 'darwin' || a.macArch.includes(this.arch)); }
  changed() { this.emit('changed'); }
  snapshot() {
    return { ...this.state, apps: IDS.map((id) => this.state.apps[id]),
      job: this.job ? { id: this.job.id, kind: this.job.kind, phase: this.job.phase, received: this.job.received, total: this.job.total, version: this.job.version, cancellable: this.job.cancellable, auto: this.job.auto } : null,
      queue: this.queue.map((j) => ({ id: j.id, kind: j.kind })) };
  }
  // Looks at what's installed and open (all apps at once; each look has a time limit).
  async refresh() {
    await Promise.all(IDS.map(async (id) => {
      const s = this.state.apps[id];
      try {
        const latest = this.feed && s.available ? release(this.feed, id, this.platform.name, this.arch) : s.latest;
        const installed = s.available ? await within(this.platform.find(id, { latest }), 60000, 'Looking for ' + s.name + ' took too long.') : null;
        const running = installed ? await within(this.platform.running(installed), 15000, 'Checking whether ' + s.name + ' is open took too long.') : false;
        Object.assign(s, { installed, running, latest, error: null, update: !!installed && !!latest && newer(latest.version, installed.version + (installed.build ? '-' + installed.build : '')) });
      } catch (e) { this.log.warn('apps', s.name + ': ' + e.message); s.error = e.message; }
    }));
    this.changed();
  }
  // Fetches the release feed (it also tells App Manager about its own updates), then looks at the apps.
  async check({ quiet = false } = {}) {
    if (this.state.checking) return;
    this.state.checking = true; this.state.error = null; this.changed();
    try {
      this.feed = await fetchFeed(this.fetcher);
      this.updater.consider(this.feed);
      this.state.checkedAt = Date.now();
      await this.refresh();
      const updates = IDS.filter((id) => this.state.apps[id].update);
      this.log.info('check', updates.length ? 'Updates: ' + updates.map((id) => this.state.apps[id].name + ' ' + this.state.apps[id].latest.version).join(', ') : 'Everything is up to date');
      if (!quiet) this.store.record('check', updates.length ? updates.map((id) => this.state.apps[id].name + ' ' + short(this.state.apps[id].latest.version)).join(' and ') + (updates.length === 1 ? ' is' : ' are') + ' ready to install.' : 'Checked for updates. Everything is up to date.');
      this.emit('checked', updates);
    } catch (e) { this.log.warn('check', e.message); this.state.error = e.message; }
    finally { this.state.checking = false; this.changed(); }
  }
  // ---------- The queue ----------
  enqueue(id, kind, { auto = false } = {}) {
    entry(id);
    if (!KINDS.includes(kind)) throw fail('That isn’t something App Manager can do.', { status: 400 });
    const s = this.state.apps[id];
    if (!s.available) throw fail(s.name + ' isn’t available for this computer.');
    if ((this.job && this.job.id === id) || this.queue.some((j) => j.id === id)) throw fail(s.name + ' already has a change waiting.');
    if (kind !== 'remove' && !this.feed) throw fail('Check for updates first, so App Manager knows the latest version.');
    this.guard(kind, { auto });
    this.queue.push({ id, kind, auto });
    this.log.info('queue', 'Queued ' + kind + ' ' + s.name + (auto ? ' (automatic)' : ''));
    this.changed();
    this.work();
  }
  cancel(id) {
    const i = this.queue.findIndex((j) => j.id === id);
    if (i >= 0) { this.queue.splice(i, 1); this.log.info('queue', 'Removed ' + id + ' from the queue'); return this.changed(); }
    if (this.job && this.job.id === id && this.job.cancellable) this.job.controller.abort();
  }
  async work() {
    if (this.working) return;
    this.working = true;
    try {
      while (this.queue.length) {
        const j = this.queue.shift();
        this.job = { ...j, phase: 'preparing', received: 0, total: 0, version: null, cancellable: true, controller: new AbortController() };
        this.changed();
        try { await this.run(this.job); }
        catch (e) {
          const name = APPS[j.id].name;
          if (e.cancelled) { this.log.info('queue', 'Cancelled ' + j.kind + ' ' + name); this.store.record(j.kind === 'remove' ? 'remove' : j.kind, 'Cancelled: ' + (j.kind === 'remove' ? 'removing ' : j.kind + ' of ') + name + '.', j.id); }
          else { this.log.error('job', j.kind + ' ' + name + ' failed: ' + e.message, e.detail ? { detail: e.detail } : undefined); this.store.record('error', name + ': ' + e.message, j.id); this.emit('failed', { id: j.id, message: e.message }); }
        } finally { this.job = null; await this.refresh().catch(() => {}); }
      }
    } finally { this.working = false; this.changed(); }
  }
  async run(job) {
    const a = APPS[job.id], signal = job.controller.signal;
    const phase = (p, extra) => { Object.assign(job, { phase: p }, extra || {}); this.changed(); };
    let installed = await this.platform.find(job.id, { latest: this.state.apps[job.id].latest });
    // Never close another app: wait until the person quits it. Automatic updates skip apps that are open.
    if (installed && await this.platform.running(installed)) {
      if (job.auto) { this.log.info('job', a.name + ' is open, so its automatic update waits for next time'); return; }
      phase('waiting');
      this.log.info('job', 'Waiting for ' + a.name + ' to be quit');
      while (installed && await this.platform.running(installed)) { await sleep(2000, signal); installed = await this.platform.find(job.id, { latest: this.state.apps[job.id].latest }); }
    }
    if (job.kind === 'remove') {
      if (!installed) throw fail(a.name + ' isn’t installed.');
      phase('removing', { cancellable: false });
      await this.platform.uninstall(job.id, installed);
      this.store.record('remove', a.name + ' was removed. Its settings and account were kept.', job.id);
      return;
    }
    if (job.kind === 'install' && installed) throw fail(a.name + ' is already installed.');
    if (job.kind !== 'install' && !installed) throw fail('Install ' + a.name + ' first.');
    const rel = release(this.feed, job.id, this.platform.name, this.arch);
    if (!rel) throw fail('There’s no download of ' + a.name + ' for this computer yet.');
    if (job.kind === 'update' && !newer(rel.version, installed.version + (installed.build ? '-' + installed.build : ''))) { this.log.info('job', a.name + ' is already up to date'); return; }
    phase('downloading', { version: rel.version, total: rel.size });
    let last = 0;
    const file = await download(rel, path.join(this.dataDir, 'downloads'), { fetcher: this.fetcher, signal, progress: (received, total) => { job.received = received; job.total = total; const now = Date.now(); if (now - last > 200 || received === total) { last = now; this.changed(); } } });
    phase('installing', { cancellable: false });
    try { await this.platform.install(job.id, file, rel); }
    finally { await fs.promises.rm(file, { force: true }).catch(() => {}); }
    const v = short(rel.version);
    this.store.record(job.kind, job.kind === 'install' ? a.name + ' ' + v + ' was installed.' : job.kind === 'reinstall' ? a.name + ' ' + v + ' was reinstalled.' : a.name + ' was updated to ' + v + (job.auto ? ' automatically.' : '.'), job.id);
    this.log.info('job', a.name + ' ' + job.kind + ' to ' + rel.version + ' finished');
  }
  // ---------- Settings ----------
  async readSettings(id) {
    const s = this.state.apps[id] || entry(id);
    const installed = await this.platform.find(id);
    if (!installed) return { installed: false, fields: [], values: {} };
    const file = this.platform.preferencesFile(id);
    let saved = file ? await settings.readJSON(file) : await this.platform.readNative(id, installed);
    let fields = settings.describe(id, this.platform.name);
    if (!file && saved.launchAtLogin === undefined) fields = fields.filter((f) => f.key !== 'launchAtLogin');
    return { installed: true, running: await this.platform.running(installed), fields, values: settings.values(id, this.platform.name, saved || {}), name: s.name };
  }
  async saveSettings(id, patch) {
    const a = entry(id);
    if ((this.job && this.job.id === id) || this.queue.some((j) => j.id === id)) throw fail('Wait until the change to ' + a.name + ' has finished.');
    const installed = await this.platform.find(id);
    if (!installed) throw fail('Install ' + a.name + ' first.');
    if (await this.platform.running(installed)) throw fail('Quit ' + a.name + ' first. Its settings can only be changed here while it’s closed.');
    const checked = settings.validate(id, this.platform.name, patch);
    const file = this.platform.preferencesFile(id);
    if (file) await settings.writeJSON(file, id, this.platform.name, checked); else await this.platform.writeNative(id, installed, checked);
    if (this.platform.afterSettings) await this.platform.afterSettings(id, installed, checked);
    this.store.record('settings', a.name + ' settings changed: ' + Object.keys(checked).length + ' setting' + (Object.keys(checked).length === 1 ? '' : 's') + '. They apply when it next opens.', id);
    this.log.info('settings', 'Saved ' + Object.keys(checked).join(', ') + ' for ' + a.name);
  }
}
module.exports = { Manager, KINDS };
