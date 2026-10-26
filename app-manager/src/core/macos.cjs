'use strict';
// Everything App Manager does on a Mac. Apps are found by bundle id (in Applications, then by Spotlight in case one
// was moved or renamed). An install or update unpacks the checked zip into a private folder, checks it's exactly the
// expected app, version and signature, then copies it next to the installed copy and swaps the two in one step,
// putting the old copy back if anything fails. macOS asks for an administrator only when the folder needs one.
// App Manager never stops another app, and never reads account data, SSH or VPN keys.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { app: entry, MANAGER } = require('./catalog.cjs');
const { verify, short, newer } = require('./feed.cjs');

const fail = (message, extra) => Object.assign(new Error(message), extra || {});
const sq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
function run(file, args, { timeout = 60000 } = {}) {
  return new Promise((resolve) => execFile(file, args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) =>
    resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, out: String(stdout || ''), err: String(stderr || '') })));
}
// The .app that contains an executable (…/X.app/Contents/MacOS/X).
function bundleOf(exe) { const b = path.posix.resolve(exe, '..', '..', '..'); return b.endsWith('.app') ? b : null; }
// A copy running from the disk image or Downloads (which macOS runs from a read-only "translocated" copy).
const temporary = (b) => b.includes('/AppTranslocation/') || b.startsWith('/Volumes/') || b.startsWith('/private/var/folders/');
const ignored = (p) => temporary(p) || p.includes('/.Trash/') || p.includes('/Library/Application Support/');

// Two scripts: swap.sh copies the new app beside the target and swaps them (run as an administrator only when the
// folder needs it); run.sh optionally waits for a process to end, runs it, and optionally reopens the app.
function scripts({ source, target, work, pid = 0, reopen = false, fallback = null, prompt, cleanup = false }) {
  const id = crypto.randomUUID().slice(0, 8), dir = path.posix.dirname(target);
  const staged = path.posix.join(dir, '.hn-manager-' + id + '.app'), backup = target + '.hn-old-' + id;
  const swap = ['#!/bin/bash', 'set -u',
    '/usr/bin/ditto ' + sq(source) + ' ' + sq(staged) + ' || { /bin/rm -rf ' + sq(staged) + '; echo "copy failed" >&2; exit 2; }',
    'if [ -e ' + sq(target) + ' ]; then /bin/mv ' + sq(target) + ' ' + sq(backup) + ' || { /bin/rm -rf ' + sq(staged) + '; echo "move old failed" >&2; exit 3; }; fi',
    'if /bin/mv ' + sq(staged) + ' ' + sq(target) + '; then /bin/rm -rf ' + sq(backup) + '; else [ -e ' + sq(backup) + ' ] && /bin/mv ' + sq(backup) + ' ' + sq(target) + '; /bin/rm -rf ' + sq(staged) + '; echo "swap failed" >&2; exit 4; fi',
    '/usr/bin/xattr -dr com.apple.quarantine ' + sq(target) + ' 2>/dev/null', 'exit 0'].join('\n') + '\n';
  const swapFile = path.posix.join(work, 'swap.sh');
  const admin = 'do shell script "/bin/bash ' + sq(swapFile).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '" with prompt "' + String(prompt || 'HN Group App Manager needs your password to install this app.').replace(/"/g, "'") + '" with administrator privileges';
  const main = ['#!/bin/bash',
    ...(pid ? ['for i in $(seq 1 240); do /bin/kill -0 ' + Number(pid) + ' 2>/dev/null || break; /bin/sleep 0.25; done'] : []),
    'if [ -w ' + sq(dir) + ' ] && { [ ! -e ' + sq(target) + ' ] || [ -w ' + sq(target) + ' ]; }; then /bin/bash ' + sq(swapFile) + '; else /usr/bin/osascript -e ' + sq(admin) + '; fi',
    'status=$?',
    ...(reopen ? ['if [ -d ' + sq(target) + ' ]; then /usr/bin/open ' + sq(target) + '; ' + (fallback ? 'else /usr/bin/open ' + sq(fallback) + '; ' : '') + 'fi'] : []),
    ...(cleanup ? ['/bin/rm -rf ' + sq(work)] : []),
    'exit $status'].join('\n') + '\n';
  return { swap, main, swapFile, mainFile: path.posix.join(work, 'run.sh') };
}

class MacPlatform {
  constructor({ log, home = os.homedir(), arch = process.arch, exe = process.execPath, packaged = true } = {}) {
    Object.assign(this, { log, home, arch, exe, packaged });
    this.name = 'darwin';
    this.supported = true;
  }
  async plist(bundle) {
    const r = await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(bundle, 'Contents', 'Info.plist')], { timeout: 10000 });
    if (r.code !== 0) throw fail('This app’s details couldn’t be read.');
    return JSON.parse(r.out);
  }
  async applications() {
    try { await fs.promises.access('/Applications', fs.constants.W_OK); return '/Applications'; }
    catch { const d = path.join(this.home, 'Applications'); await fs.promises.mkdir(d, { recursive: true }); return d; }
  }
  // The installed copy of an app, or null.
  async find(id) {
    const a = entry(id), seen = new Set(), candidates = [];
    for (const root of ['/Applications', path.join(this.home, 'Applications')]) for (const name of [a.mac, ...(a.macOld || [])]) candidates.push(path.join(root, name));
    const spot = await run('/usr/bin/mdfind', ['kMDItemCFBundleIdentifier == "' + a.bundle + '"'], { timeout: 6000 });
    if (spot.code === 0) for (const p of spot.out.split('\n').map((s) => s.trim())) if (p.endsWith('.app') && !ignored(p)) candidates.push(p);
    for (const bundle of candidates) {
      if (seen.has(bundle)) continue; seen.add(bundle);
      if (!fs.existsSync(path.join(bundle, 'Contents', 'Info.plist'))) continue;
      try {
        const info = await this.plist(bundle);
        if (info.CFBundleIdentifier !== a.bundle) continue;
        return { path: bundle, version: String(info.CFBundleShortVersionString || '0.0.0'), build: Number(info.CFBundleVersion) || 0, exe: path.join(bundle, 'Contents', 'MacOS', String(info.CFBundleExecutable || '')) };
      } catch (e) { this.log.warn('mac', 'Couldn’t read ' + bundle + ': ' + e.message); }
    }
    return null;
  }
  async running(found) {
    if (!found) return false;
    const r = await run('/bin/ps', ['-axww', '-o', 'args='], { timeout: 10000 });
    const prefix = found.path + '/Contents/MacOS/';
    return r.out.split('\n').some((l) => l.trim().startsWith(prefix));
  }
  // Unpacks a checked zip into a private folder and checks it: no unsafe paths or links, exactly one app with the
  // expected bundle id and version, and an intact signature. Returns the folder and the app inside it.
  async unpack(file, bundleId, version, into) {
    const work = into || await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hn-app-manager-'));
    await fs.promises.mkdir(work, { recursive: true, mode: 0o700 });
    try {
      const list = await run('/usr/bin/unzip', ['-Z1', file], { timeout: 60000 });
      if (list.code !== 0) throw fail('The download couldn’t be opened.');
      if (list.out.split('\n').some((n) => n.startsWith('/') || n.split('/').includes('..'))) throw fail('The download contains unsafe file names, so it wasn’t used.');
      const x = await run('/usr/bin/ditto', ['-x', '-k', file, work], { timeout: 300000 });
      if (x.code !== 0) throw fail('The download couldn’t be unpacked.');
      const apps = (await fs.promises.readdir(work)).filter((n) => n.endsWith('.app'));
      if (apps.length !== 1) throw fail('The download should contain exactly one app.');
      const source = path.join(work, apps[0]);
      const walk = async (dir) => { for (const item of await fs.promises.readdir(dir, { withFileTypes: true })) { const p = path.join(dir, item.name); if (item.isSymbolicLink()) { const real = await fs.promises.realpath(p).catch(() => ''); if (!real.startsWith(source + path.sep) && real !== source) throw fail('The download contains an unsafe link, so it wasn’t used.'); } else if (item.isDirectory()) await walk(p); } };
      await walk(source);
      const info = await this.plist(source);
      if (info.CFBundleIdentifier !== bundleId) throw fail('The download is a different app, so it wasn’t used.');
      if (String(info.CFBundleShortVersionString) !== short(version)) throw fail('The download is a different version than expected, so it wasn’t used.');
      const sig = await run('/usr/bin/codesign', ['--verify', '--deep', source], { timeout: 120000 });
      if (sig.code !== 0) throw fail('The app’s signature didn’t check out, so it wasn’t used.', { detail: sig.err.trim() });
      await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', source]);
      return { work, source };
    } catch (e) { if (!into) await fs.promises.rm(work, { recursive: true, force: true }).catch(() => {}); throw e; }
  }
  // Runs the swap now and waits for it.
  async replace(source, target, prompt) {
    const work = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hn-app-manager-swap-'));
    try {
      const s = scripts({ source, target, work, prompt });
      await fs.promises.writeFile(s.swapFile, s.swap, { mode: 0o700 });
      await fs.promises.writeFile(s.mainFile, s.main, { mode: 0o700 });
      const r = await run('/bin/bash', [s.mainFile], { timeout: 600000 });
      if (r.code !== 0) throw fail(/User canceled|-128/.test(r.err) ? 'The install was cancelled at the password prompt.' : 'The app couldn’t be put in place. ' + (r.err.trim().split('\n').pop() || ''));
    } finally { await fs.promises.rm(work, { recursive: true, force: true }).catch(() => {}); }
  }
  async install(id, file, rel) {
    const a = entry(id);
    await verify(file, rel);
    const { work, source } = await this.unpack(file, a.bundle, rel.version);
    try {
      const existing = await this.find(id);
      if (existing && await this.running(existing)) throw fail('Quit ' + a.name + ' first.');
      const target = existing ? existing.path : path.join(await this.applications(), a.mac);
      this.log.info('mac', 'Installing ' + a.name + ' ' + rel.version + ' to ' + target);
      await this.replace(source, target, 'HN Group App Manager needs your password to install ' + a.name + '.');
      const now = await this.find(id);
      if (!now || short(now.version) !== short(rel.version)) throw fail(a.name + ' didn’t install properly. Try again.');
      return now;
    } finally { await fs.promises.rm(work, { recursive: true, force: true }).catch(() => {}); }
  }
  async uninstall(id, found) {
    const a = entry(id);
    const trash = path.join(this.home, '.Trash'), to = path.join(trash, path.basename(found.path, '.app') + ' ' + new Date().toISOString().slice(0, 19).replace(/:/g, '.') + '.app');
    await fs.promises.mkdir(trash, { recursive: true });
    try { await fs.promises.rename(found.path, to); }
    catch (e) {
      if (!['EACCES', 'EPERM', 'EXDEV'].includes(e.code)) throw e;
      const cmd = '/bin/mv ' + sq(found.path) + ' ' + sq(to);
      const r = await run('/usr/bin/osascript', ['-e', 'do shell script "' + cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '" with prompt "HN Group App Manager needs your password to remove ' + a.name + '." with administrator privileges'], { timeout: 300000 });
      if (r.code !== 0) throw fail(/User canceled|-128/.test(r.err) ? 'Removing was cancelled at the password prompt.' : a.name + ' couldn’t be moved to the Bin.');
    }
  }
  preferencesFile(id) { return id === 'browser' ? path.join(this.home, 'Library', 'Application Support', entry(id).data, 'preferences.json') : null; }
  // HN Secure Network for Mac keeps its settings in macOS: the SSH username in its user defaults, and its login item
  // (2.4.1 and later), which only the app itself can change, through its fixed --app-manager-login-item mode.
  async readNative(id, found) {
    const out = {};
    const u = await run('/usr/bin/defaults', ['read', entry(id).bundle, 'sshUser'], { timeout: 5000 });
    if (u.code === 0 && u.out.trim()) out.sshUser = u.out.trim();
    if (found && !newer('2.4.1', found.version) && !await this.running(found)) {
      const r = await run(found.exe, ['--app-manager-login-item', 'read'], { timeout: 20000 });
      if (r.code === 0) out.launchAtLogin = r.out.trim() === 'true';
    }
    return out;
  }
  async writeNative(id, found, patch) {
    if (Object.hasOwn(patch, 'sshUser')) { const r = await run('/usr/bin/defaults', ['write', entry(id).bundle, 'sshUser', '-string', patch.sshUser]); if (r.code !== 0) throw fail('The SSH username couldn’t be saved.'); }
    if (Object.hasOwn(patch, 'launchAtLogin')) {
      if (newer('2.4.1', found.version)) throw fail('Update HN Secure Network to change this here.');
      const r = await run(found.exe, ['--app-manager-login-item', String(patch.launchAtLogin)], { timeout: 20000 });
      if (r.code !== 0 || (r.out.trim() === 'true') !== patch.launchAtLogin) throw fail('macOS didn’t allow it. Approve HN Secure Network in System Settings → General → Login Items, then try again.');
    }
  }
  // ---------- App Manager itself ----------
  self() { const bundle = this.packaged ? bundleOf(this.exe) : null; return { bundle, location: !bundle ? 'development' : temporary(bundle) ? 'temporary' : 'installed' }; }
  async stageSelf(file, rel, dir) {
    await verify(file, rel);
    const into = path.join(dir, 'staged-' + rel.version.replace(/[^0-9.-]/g, ''));
    await fs.promises.rm(into, { recursive: true, force: true });
    const { source } = await this.unpack(file, MANAGER.bundle, rel.version, into);
    return { kind: 'mac', path: source, version: rel.version };
  }
  // Swaps in the staged copy once App Manager has quit (copies running from the disk image or Downloads go into
  // Applications), and reopens it when asked to. Returns straight away: the caller quits.
  async applySelf(staged, { reopen = true, pid = process.pid } = {}) {
    const { bundle } = this.self();
    if (!bundle) throw fail('App Manager isn’t running from an app, so it can’t update itself.');
    if (!fs.existsSync(path.join(staged.path, 'Contents', 'Info.plist'))) throw fail('The downloaded update is missing. Check for updates again.');
    const target = temporary(bundle) ? path.posix.join('/Applications', MANAGER.mac) : bundle;
    const work = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hn-app-manager-self-'));
    const s = scripts({ source: staged.path, target, work, pid, reopen, fallback: bundle, cleanup: true, prompt: 'HN Group App Manager needs your password to finish updating.' });
    await fs.promises.writeFile(s.swapFile, s.swap, { mode: 0o700 });
    await fs.promises.writeFile(s.mainFile, s.main, { mode: 0o700 });
    this.log.info('self', 'Updating App Manager in ' + target + (reopen ? ' and reopening' : ''));
    const child = spawn('/bin/bash', [s.mainFile], { detached: true, stdio: 'ignore' });
    child.unref();
  }
  async moveToApplications() { const { bundle } = this.self(); return this.applySelf({ path: bundle }, { reopen: true }); }
}
module.exports = { MacPlatform, scripts, bundleOf, temporary, run };
