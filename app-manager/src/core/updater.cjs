'use strict';
// App Manager's own updates, in the app: it finds a newer App Manager on downloads.hngroup.org.uk, downloads and
// checks it (size, SHA-256, and on a Mac the bundle id, version and signature), keeps it ready, and installs it either
// when the person clicks "Restart to update" or, with "Keep App Manager up to date" on, when App Manager next quits.
// A downloaded update survives restarts (updates/staged.json). States:
//   idle → checking → up-to-date | available → downloading → ready → installing
//   error (with a message), or unsupported (not an installed copy, e.g. while developing).
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { release, newer, download, fetchFeed, short } = require('./feed.cjs');

class Updater extends EventEmitter {
  constructor({ platform, log, dir, version, build, arch, fetcher = fetch }) {
    super();
    Object.assign(this, { platform, log, dir: path.join(dir, 'updates'), fetcher, arch });
    this.current = version + (build ? '-' + build : '');
    this.state = { status: 'idle', current: this.current, latest: null, progress: 0, error: null, checkedAt: null, location: platform.self().location };
    this.staged = null;
    // A ready update from before a restart is kept; one that's no longer newer (it's been installed) is tidied away.
    try { const s = JSON.parse(fs.readFileSync(path.join(this.dir, 'staged.json'), 'utf8')); if (s && newer(s.version, this.current) && fs.existsSync(s.path)) this.staged = s; else this.forget(); } catch {}
    if (this.state.location === 'development') this.state.status = 'unsupported';
  }
  set(patch) { this.state = { ...this.state, ...patch }; this.emit('changed', this.state); }
  // Looks at a release feed (fetched by App Manager anyway when it checks the apps).
  consider(feed) {
    const rel = release(feed, 'manager', this.platform.name, this.arch);
    const update = !!rel && newer(rel.version, this.current);
    if (this.staged && (!update || this.staged.version !== rel.version)) this.forget();
    if (['downloading', 'installing'].includes(this.state.status)) return;
    if (this.state.status === 'unsupported') return this.set({ latest: update ? rel : null, checkedAt: Date.now() });
    this.set({ latest: update ? rel : null, checkedAt: Date.now(), error: null, status: !update ? 'up-to-date' : this.staged ? 'ready' : 'available' });
  }
  async check() {
    if (['checking', 'downloading', 'installing'].includes(this.state.status)) return this.state;
    const before = this.state.status;
    this.set({ status: before === 'unsupported' ? before : 'checking', error: null });
    try { this.consider(await fetchFeed(this.fetcher)); }
    catch (e) { this.log.warn('self', 'Check failed: ' + e.message); this.set({ status: before === 'unsupported' ? before : 'error', error: e.message }); }
    return this.state;
  }
  async download() {
    const rel = this.state.latest;
    if (this.state.status === 'unsupported') throw Error('This copy of App Manager can’t update itself.');
    if (!rel) throw Error('App Manager is up to date.');
    if (this.state.status === 'ready' || this.state.status === 'downloading') return;
    this.set({ status: 'downloading', progress: 0, error: null });
    this.log.info('self', 'Downloading App Manager ' + rel.version);
    try {
      let last = 0;
      const file = await download(rel, path.join(this.dir, 'downloads'), { fetcher: this.fetcher, progress: (r, t) => { const p = Math.floor(r / t * 100); if (p !== last) { last = p; this.set({ progress: p }); } } });
      this.set({ progress: 100 });
      const staged = await this.platform.stageSelf(file, rel, this.dir);
      this.staged = { ...staged, version: rel.version };
      await fs.promises.mkdir(this.dir, { recursive: true });
      await fs.promises.writeFile(path.join(this.dir, 'staged.json'), JSON.stringify(this.staged), { mode: 0o600 });
      this.log.info('self', 'App Manager ' + rel.version + ' is ready to install');
      this.set({ status: 'ready' });
    } catch (e) {
      this.log.error('self', 'Download failed: ' + e.message, e.detail ? { detail: e.detail } : undefined);
      this.set({ status: 'error', error: e.message });
      throw e;
    }
  }
  // Starts installing; the caller then quits App Manager. reopen: open it again afterwards.
  async apply({ reopen = true } = {}) {
    if (this.state.status !== 'ready' || !this.staged) throw Error('There’s no App Manager update ready to install.');
    this.set({ status: 'installing' });
    try { await this.platform.applySelf(this.staged, { reopen }); }
    catch (e) { this.log.error('self', 'Install failed: ' + e.message); this.set({ status: 'error', error: e.message }); throw e; }
  }
  forget() {
    this.staged = null;
    for (const name of ['staged.json', 'downloads']) { try { fs.rmSync(path.join(this.dir, name), { recursive: true, force: true }); } catch {} }
    try { for (const n of fs.readdirSync(this.dir)) if (n.startsWith('staged-')) fs.rmSync(path.join(this.dir, n), { recursive: true, force: true }); } catch {}
  }
  get version() { return short(this.current); }
}
module.exports = { Updater };
