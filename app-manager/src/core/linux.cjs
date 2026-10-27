'use strict';
// Everything App Manager does on Linux (Bazzite, Fedora and other x64 desktops). HN Group apps are AppImages: App
// Manager keeps them in ~/Applications under a fixed name (HN-Browser.AppImage and so on), adds them to the desktop's
// app menu (a desktop entry and icon in ~/.local/share), and updates them by putting the checked new AppImage in place
// in one step. It also finds copies kept in ~/AppImages (Gear Lever) or ~/.local/bin, and ones just downloaded to
// Downloads or the Desktop under any name (those are moved into ~/Applications when App Manager updates or reinstalls
// them). Paths are compared after resolving links: on Bazzite and other Fedora Atomic systems /home is a link to
// /var/home, and the AppImage runtime and /proc report the resolved path. Removing moves the AppImage to the Bin and
// takes its menu entry away; the app's own data (~/.config/<app>) is never touched. App Manager never stops another
// app, and never reads account data, SSH or VPN keys.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { app: entry, APPS, MANAGER } = require('./catalog.cjs');
const { verify, short, parts, newer } = require('./feed.cjs');
const appimage = require('../appimage.cjs');

const fail = (message, extra) => Object.assign(new Error(message), extra || {});
function run(file, args, { timeout = 60000, cwd, env } = {}) {
  return new Promise((resolve) => execFile(file, args, { timeout, cwd, env, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) =>
    resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, out: String(stdout || ''), err: String(stderr || '') })));
}
// What each app is in the desktop's app menu.
const MENU = {
  browser: { categories: 'Network;WebBrowser;', args: ['%U'] },
  network: { categories: 'Network;Security;', args: [] },
  manager: { categories: 'Utility;System;', args: [] },
};
// The environment another app is opened with: App Manager's own AppImage folders and libraries are left out.
function cleanEnv(env = process.env) {
  const out = { ...env };
  for (const k of ['APPIMAGE', 'APPDIR', 'ARGV0', 'OWD', 'LD_LIBRARY_PATH', 'GSETTINGS_SCHEMA_DIR', 'ELECTRON_RUN_AS_NODE', 'CHROME_DESKTOP']) delete out[k];
  if (env.APPDIR) {
    out.PATH = String(env.PATH || '').split(':').filter((p) => !p.startsWith(env.APPDIR)).join(':');
    const data = String(env.XDG_DATA_DIRS || '').split(':').filter((p) => p && !p.startsWith(env.APPDIR)).join(':');
    if (data) out.XDG_DATA_DIRS = data; else delete out.XDG_DATA_DIRS;
  }
  return out;
}

const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
// Is this file name an AppImage of the app with this key? (Case and punctuation don't matter.)
const matches = (spec, name) => !name.startsWith('.') && /\.appimage$/i.test(name) && name.toLowerCase().replace(/[^a-z0-9.]/g, '').startsWith(spec.key);

class LinuxPlatform {
  constructor({ log, home = os.homedir(), env = process.env, arch = process.arch, packaged = true, dataDir, ui = path.join(__dirname, '..', '..', 'ui') } = {}) {
    home = real(home);
    Object.assign(this, { log, home, env, arch, packaged, ui });
    this.name = 'linux';
    this.supported = arch === 'x64' || !packaged;
    this.config = env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : path.join(home, '.config');
    this.data = env.XDG_DATA_HOME && path.isAbsolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : path.join(home, '.local', 'share');
    this.applications = path.join(home, 'Applications');
    this.records = path.join(dataDir || path.join(this.config, 'HN Group App Manager'), 'linux-apps.json');
    this.hashes = new Map();
  }
  // Folders an HN app's AppImage is kept in (App Manager's own first), then where a downloaded one may be waiting.
  folders() { return [this.applications, path.join(this.home, 'AppImages'), path.join(this.home, '.local', 'bin')]; }
  downloads() { return [path.join(this.home, 'Downloads'), path.join(this.home, 'Desktop')]; }
  managed(file) { return this.folders().includes(path.dirname(real(file))); }
  readRecords() { try { const v = JSON.parse(fs.readFileSync(this.records, 'utf8')); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } }
  writeRecords(v) { fs.mkdirSync(path.dirname(this.records), { recursive: true, mode: 0o700 }); const tmp = this.records + '.' + crypto.randomUUID(); fs.writeFileSync(tmp, JSON.stringify(v, null, 1), { mode: 0o600 }); fs.renameSync(tmp, this.records); }
  remember(file, version, build) {
    const st = fs.statSync(file), all = this.readRecords();
    all[file] = { version: short(version), build: Number(build) || 0, size: st.size, mtimeMs: st.mtimeMs };
    this.writeRecords(all);
  }
  async sha256(file, st) {
    const key = file + ':' + st.size + ':' + st.mtimeMs;
    if (this.hashes.has(key)) return this.hashes.get(key);
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    const value = hash.digest('hex'); this.hashes.set(key, value); return value;
  }
  // The version inside an AppImage, from its desktop entry (X-AppImage-Version), without running the app itself.
  async embeddedVersion(file) {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hn-app-manager-look-'));
    try {
      await run(file, ['--appimage-extract', '*.desktop'], { cwd: dir, timeout: 60000 });
      const root = path.join(dir, 'squashfs-root');
      for (const n of await fs.promises.readdir(root).catch(() => [])) {
        if (!n.endsWith('.desktop')) continue;
        const m = /^X-AppImage-Version=(\d+\.\d+\.\d+)\s*$/m.exec(await fs.promises.readFile(path.join(root, n), 'utf8').catch(() => ''));
        if (m) return m[1];
      }
      return null;
    } finally { await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  }
  // The installed copy of an app, or null. latest (the release App Manager knows about) lets an AppImage that updated
  // itself be recognised by its checksum.
  async find(id, { latest, managedOnly = false } = {}) {
    const a = id === 'manager' ? MANAGER : entry(id), spec = a.linux;
    for (const dir of [...this.folders(), ...(managedOnly ? [] : this.downloads())]) {
      let names = [];
      try { names = (await fs.promises.readdir(dir)).filter((n) => matches(spec, n)); } catch { continue; }
      names.sort((x, y) => (y === spec.file) - (x === spec.file) || y.localeCompare(x, 'en', { numeric: true }));
      for (const n of names) {
        const file = real(path.join(dir, n));
        let st; try { st = await fs.promises.stat(file); } catch { continue; }
        if (!st.isFile()) continue;
        const known = this.readRecords()[file];
        let version = null, build = 0;
        if (known && known.size === st.size && known.mtimeMs === st.mtimeMs && parts(known.version)) ({ version, build } = known);
        else {
          if (latest && latest.size === st.size && await this.sha256(file, st) === latest.sha256) { [version, build] = [short(latest.version), Number(String(latest.version).split('-')[1]) || 0]; }
          else { const named = /-(\d+\.\d+\.\d+)-linux-x86_64[^/]*\.AppImage$/i.exec(n); version = named ? named[1] : await this.embeddedVersion(file).catch(() => null); }
          if (version) try { this.remember(file, version, build); } catch {}
        }
        return { path: file, exe: file, version: version || '0.0.0', build, managed: this.managed(file) };
      }
    }
    return null;
  }
  // Open if any process is this AppImage (its runtime) or was started from it.
  async running(found) {
    if (!found) return false;
    let pids = [];
    try { pids = (await fs.promises.readdir('/proc')).filter((p) => /^\d+$/.test(p) && Number(p) !== process.pid); } catch { return false; }
    const file = real(found.path), marker = Buffer.from('APPIMAGE=' + file + '\0'), other = Buffer.from('APPIMAGE=' + found.path + '\0');
    for (const pid of pids) {
      try { const exe = await fs.promises.readlink('/proc/' + pid + '/exe'); if (exe === file || exe === found.path) return true; } catch {}
      try { const e = await fs.promises.readFile('/proc/' + pid + '/environ'); if (e.includes(marker) || e.includes(other)) return true; } catch {}
    }
    return false;
  }
  // The app's entry in the desktop's app menu, with its icon. Only entries App Manager made are ever replaced.
  menuFile(spec) { return path.join(this.data, 'applications', spec.desktop + '.desktop'); }
  async addToMenu(id, file) {
    const a = id === 'manager' ? MANAGER : entry(id), spec = a.linux, menu = MENU[id];
    const iconDir = path.join(this.data, 'icons', 'hicolor', 'scalable', 'apps');
    try { await fs.promises.mkdir(iconDir, { recursive: true }); await fs.promises.writeFile(path.join(iconDir, spec.desktop + '.svg'), await fs.promises.readFile(path.join(this.ui, 'assets', a.icon))); }
    catch (e) { this.log.warn('linux', 'The ' + a.name + ' icon couldn’t be added: ' + e.message); }
    const lines = ['[Desktop Entry]', 'Type=Application', 'Name=' + a.name, ...(a.tagline ? ['Comment=' + a.tagline] : []),
      'Exec=' + [file, ...menu.args].map((v) => v.startsWith('%') ? v : appimage.desktopQuote(v)).join(' '), 'TryExec=' + file, 'Icon=' + spec.desktop, 'Terminal=false',
      'Categories=' + menu.categories, 'StartupWMClass=' + spec.desktop, 'X-HN-Group-App-Manager=true', ''];
    const target = this.menuFile(spec);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target + '.tmp', lines.join('\n'), { mode: 0o644 });
    await fs.promises.rename(target + '.tmp', target);
    this.refreshMenu();
  }
  // Tells the desktop its app menu changed (KDE's menu cache, and the desktop entry database other desktops read).
  refreshMenu() {
    const env = cleanEnv(this.env);
    run('update-desktop-database', [path.join(this.data, 'applications')], { timeout: 15000, env }).catch(() => {});
    run('kbuildsycoca6', [], { timeout: 60000, env }).then((r) => { if (r.code !== 0) return run('kbuildsycoca5', [], { timeout: 60000, env }); }).catch(() => {});
  }
  async removeFromMenu(id) {
    const spec = (id === 'manager' ? MANAGER : entry(id)).linux, file = this.menuFile(spec);
    const text = await fs.promises.readFile(file, 'utf8').catch(() => '');
    if (!text.includes('X-HN-Group-App-Manager=true')) return;
    await fs.promises.rm(file, { force: true });
    await fs.promises.rm(path.join(this.data, 'icons', 'hicolor', 'scalable', 'apps', spec.desktop + '.svg'), { force: true });
    this.refreshMenu();
  }
  // Puts a checked AppImage at target in one step (the old one stays if anything fails).
  async place(source, target) {
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const staged = path.join(path.dirname(target), '.' + path.basename(target) + '.hn-' + crypto.randomUUID().slice(0, 8));
    try { await fs.promises.copyFile(source, staged); await fs.promises.chmod(staged, 0o755); await fs.promises.rename(staged, target); }
    catch (e) { await fs.promises.rm(staged, { force: true }); throw fail('The app couldn’t be put in place. ' + e.message); }
  }
  async install(id, file, rel) {
    const a = entry(id);
    await verify(file, rel);
    if (!appimage.isAppImage(file)) throw fail('The download isn’t an AppImage, so it wasn’t used.');
    const existing = await this.find(id, { latest: rel });
    if (existing && await this.running(existing)) throw fail('Quit ' + a.name + ' first.');
    // A copy that's only in Downloads or on the Desktop is replaced by one in ~/Applications (the old one goes to the Bin).
    const target = existing && existing.managed ? existing.path : path.join(this.applications, a.linux.file);
    this.log.info('linux', 'Installing ' + a.name + ' ' + rel.version + ' to ' + target);
    await this.place(file, target);
    await verify(target, rel);
    this.remember(target, rel.version, Number(String(rel.version).split('-')[1]) || 0);
    if (existing && !existing.managed && existing.path !== target) {
      await this.trash(existing.path).catch((e) => this.log.warn('linux', 'The downloaded copy of ' + a.name + ' couldn’t be moved to the Bin: ' + e.message));
      const all = this.readRecords(); delete all[existing.path]; try { this.writeRecords(all); } catch {}
    }
    await this.addToMenu(id, target);
    const now = await this.find(id, { latest: rel });
    if (!now || short(now.version) !== short(rel.version)) throw fail(a.name + ' didn’t install properly. Try again.');
    return now;
  }
  // Moves the AppImage to the Bin (the desktop's trash), so it can be restored.
  async trash(file) {
    const trash = path.join(this.data, 'Trash'), base = path.basename(file);
    let name = base;
    for (let i = 2; fs.existsSync(path.join(trash, 'files', name)) || fs.existsSync(path.join(trash, 'info', name + '.trashinfo')); i++) name = base.replace(/(\.AppImage)?$/, ' ' + i + '$1');
    await fs.promises.mkdir(path.join(trash, 'files'), { recursive: true }); await fs.promises.mkdir(path.join(trash, 'info'), { recursive: true });
    const info = '[Trash Info]\nPath=' + file.split('/').map(encodeURIComponent).join('/') + '\nDeletionDate=' + new Date().toISOString().slice(0, 19) + '\n';
    await fs.promises.writeFile(path.join(trash, 'info', name + '.trashinfo'), info, { flag: 'wx' });
    try { await fs.promises.rename(file, path.join(trash, 'files', name)); }
    catch (e) { await fs.promises.rm(path.join(trash, 'info', name + '.trashinfo'), { force: true }); if (e.code !== 'EXDEV') throw e; await fs.promises.rm(file, { force: true }); }
  }
  async uninstall(id, found) {
    const a = entry(id);
    await this.trash(found.path);
    await this.removeFromMenu(id);
    // HN Secure Network's "open when I sign in" entry points at the AppImage that's gone.
    if (id === 'network') appimage.setAutostart(false, { id: a.linux.desktop, name: a.name, config: this.config });
    const all = this.readRecords(); delete all[found.path]; try { this.writeRecords(all); } catch {}
  }
  preferencesFile(id) { return path.join(this.config, entry(id).data, 'preferences.json'); }
  async readNative() { return {}; }
  async writeNative() {}
  // After settings are saved: HN Secure Network's "Open when I sign in" is a desktop entry in ~/.config/autostart.
  async afterSettings(id, found, saved) {
    if (id !== 'network' || !Object.hasOwn(saved, 'launchAtLogin')) return;
    const a = entry(id);
    appimage.setAutostart(saved.launchAtLogin, { id: a.linux.desktop, name: a.name, exec: found.path, args: ['--hidden'], comment: 'The HN Group VPN and SSH', config: this.config });
  }
  // Opens an app the way its menu entry would.
  async open(found) {
    const child = spawn(found.path, [], { detached: true, stdio: 'ignore', env: cleanEnv(this.env) });
    await new Promise((resolve, reject) => { child.once('error', (e) => reject(fail('It couldn’t be opened. ' + e.message))); setTimeout(resolve, 300); });
    child.unref();
  }
  // ---------- App Manager itself ----------
  // Where App Manager is running from: 'installed' (~/Applications and the like), 'temporary' (a download, for example)
  // or 'development'. The AppImage runtime gives the resolved path, so it's compared with resolved folders.
  self() {
    const given = this.packaged ? this.env.APPIMAGE : null;
    if (!given || !path.isAbsolute(given)) return { bundle: null, location: 'development' };
    const file = real(given);
    return { bundle: file, location: this.managed(file) ? 'installed' : 'temporary' };
  }
  // Opened from a download while App Manager is already installed (the same version or newer): opens the installed one
  // instead, once this one has quit, so you never see "Install App Manager" again. Returns true when it's handing over.
  async handOver(version) {
    const { bundle, location } = this.self();
    if (location !== 'temporary') return false;
    const installed = await this.find('manager', { managedOnly: true }).catch(() => null);
    if (!installed || installed.path === bundle || (installed.version !== '0.0.0' && newer(version, installed.version))) return false;
    this.log.info('self', 'Already installed at ' + installed.path + ' (' + installed.version + '); opening that one');
    const script = ['#!/bin/sh', 'for i in $(seq 1 120); do kill -0 ' + Number(process.pid) + ' 2>/dev/null || break; sleep 0.25; done',
      'nohup ' + "'" + installed.path.replace(/'/g, "'\\''") + "'" + ' >/dev/null 2>&1 &'].join('\n') + '\n';
    const child = spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore', env: cleanEnv(this.env) });
    child.on('error', () => {});
    child.unref();
    return true;
  }
  async stageSelf(file, rel, dir) {
    await verify(file, rel);
    if (!appimage.isAppImage(file)) throw fail('The update isn’t an AppImage, so it wasn’t used.');
    const out = path.join(dir, 'staged-' + rel.version.replace(/[^0-9.-]/g, '') + '.AppImage');
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.copyFile(file, out); await fs.promises.chmod(out, 0o755);
    await verify(out, rel);
    return { kind: 'linux', path: out, version: rel.version, size: rel.size, sha256: rel.sha256 };
  }
  // Puts the staged copy in place once App Manager has quit (a copy running from Downloads goes into ~/Applications)
  // and reopens it when asked to. Returns straight away: the caller quits.
  async applySelf(staged, { reopen = true, pid = process.pid } = {}) {
    const { bundle, location } = this.self();
    if (!bundle) throw fail('App Manager isn’t running from its AppImage, so it can’t update itself.');
    if (!fs.existsSync(staged.path)) throw fail('The downloaded update is missing. Check for updates again.');
    if (staged.sha256) await verify(staged.path, staged);
    const target = location === 'installed' ? bundle : path.join(this.applications, MANAGER.linux.file);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const work = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hn-app-manager-self-')), source = path.join(work, 'update.AppImage');
    await fs.promises.copyFile(staged.path, source); await fs.promises.chmod(source, 0o755);
    await this.addToMenu('manager', target).catch((e) => this.log.warn('linux', 'App Manager’s menu entry couldn’t be added: ' + e.message));
    const script = path.join(work, 'update.sh');
    await fs.promises.writeFile(script, appimage.swapScript({ pid, target, source, work, reopen }), { mode: 0o700 });
    this.log.info('self', 'Updating App Manager in ' + target + (reopen ? ' and reopening' : ''));
    const child = spawn('/bin/sh', [script], { detached: true, stdio: 'ignore', env: cleanEnv(this.env) });
    child.on('error', () => {});
    child.unref();
  }
  async moveToApplications() { const { bundle } = this.self(); return this.applySelf({ path: bundle }, { reopen: true }); }
}
module.exports = { LinuxPlatform, cleanEnv, MENU };
