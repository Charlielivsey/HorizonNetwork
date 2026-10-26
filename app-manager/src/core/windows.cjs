'use strict';
// Everything App Manager does on a Windows PC. Apps are found from their registered install (the Uninstall keys
// their installers write), installs and updates run the checked installer silently, and removal only ever runs an
// "Uninstall….exe" inside the app's own registered folder. App Manager never stops another app.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { app: entry } = require('./catalog.cjs');
const { verify, short } = require('./feed.cjs');

const fail = (message, extra) => Object.assign(new Error(message), extra || {});
const psq = (s) => "'" + String(s).replace(/'/g, "''") + "'";
function run(file, args, { timeout = 60000 } = {}) {
  return new Promise((resolve) => execFile(file, args, { timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) =>
    resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, out: String(stdout || ''), err: String(stderr || '') })));
}
const ps = (script, timeout = 30000) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', "$ErrorActionPreference='Stop'; " + script], { timeout });
// Only an "Uninstall….exe" directly inside the app's registered folder.
function uninstaller(command, dir) {
  if (typeof command !== 'string') return null;
  const m = /^"([^"]+\.exe)"(?:\s|$)/i.exec(command) || /^([^"\r\n]+?\.exe)(?:\s|$)/i.exec(command);
  const exe = m && m[1];
  if (!exe || !path.win32.isAbsolute(exe) || !/^Uninstall[^\\/]*\.exe$/i.test(path.win32.basename(exe)) || path.win32.dirname(exe).toLowerCase() !== path.win32.resolve(dir).toLowerCase()) return null;
  return exe;
}
const folderPrefix = (dir) => path.win32.resolve(dir).replace(/[\\/]+$/, '') + '\\';

class WindowsPlatform {
  constructor({ log, roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), exe = process.execPath, packaged = true } = {}) {
    Object.assign(this, { log, roaming, exe, packaged });
    this.name = 'win32';
    this.supported = process.arch === 'x64' || !packaged;
  }
  async find(id) {
    const a = entry(id);
    const r = await ps("$items=@(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq " + psq(a.name) + " } | Select-Object DisplayVersion,InstallLocation,UninstallString,QuietUninstallString); ConvertTo-Json -Compress -InputObject $items");
    if (r.code !== 0) throw fail('Installed apps couldn’t be checked.', { detail: r.err.trim() });
    let items = []; try { items = JSON.parse(r.out.trim() || '[]'); } catch {}
    for (const v of Array.isArray(items) ? items : [items]) {
      const dir = typeof v.InstallLocation === 'string' ? v.InstallLocation.replace(/^"|"$/g, '') : '';
      if (!path.win32.isAbsolute(dir)) continue;
      const exe = path.win32.join(dir, a.exe);
      if (!fs.existsSync(exe)) continue;
      let version = String(v.DisplayVersion || '0.0.0'), build = 0;
      // Electron reads inside app.asar, so the app's own version and build number can be used.
      try { const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'resources', 'app.asar', 'package.json'), 'utf8')); if (/^\d+\.\d+\.\d+$/.test(pkg.version)) version = pkg.version; } catch {}
      for (const b of ['src/build.json', 'build.json']) { try { build = Number(JSON.parse(fs.readFileSync(path.join(dir, 'resources', 'app.asar', b), 'utf8')).build) || build; } catch {} }
      return { path: dir, exe, version, build, uninstall: uninstaller(v.QuietUninstallString || v.UninstallString, dir) };
    }
    return null;
  }
  async running(found) {
    if (!found) return false;
    const r = await ps('$root=' + psq(folderPrefix(found.path)) + "; @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root,[System.StringComparison]::OrdinalIgnoreCase) }).Count");
    return Number(r.out.trim()) > 0;
  }
  async install(id, file, rel) {
    const a = entry(id);
    await verify(file, rel);
    const existing = await this.find(id);
    if (existing && await this.running(existing)) throw fail('Quit ' + a.name + ' first.');
    this.log.info('win', 'Running the ' + a.name + ' ' + rel.version + ' installer');
    const r = await run(file, ['/S'], { timeout: 900000 });
    if (r.code !== 0) throw fail('The ' + a.name + ' installer stopped with an error (' + r.code + '). Windows may have blocked it.');
    const now = await this.find(id);
    if (!now || short(now.version) !== short(rel.version)) throw fail(a.name + ' didn’t install properly. Try again.');
    return now;
  }
  async uninstall(id, found) {
    if (!found.uninstall || !fs.existsSync(found.uninstall)) throw fail('No uninstaller was found inside ' + entry(id).name + '’s folder. Remove it in Settings → Apps instead.');
    const r = await run(found.uninstall, ['/S'], { timeout: 600000 });
    if (r.code !== 0) throw fail('The uninstaller stopped with an error (' + r.code + ').');
    for (let i = 0; i < 30 && await this.find(id); i++) await new Promise((res) => setTimeout(res, 1000));
  }
  preferencesFile(id) { return path.join(this.roaming, entry(id).data, 'preferences.json'); }
  async readNative() { return {}; }
  async writeNative() {}
  self() { return { bundle: null, location: this.packaged ? 'installed' : 'development' }; }
  async stageSelf(file, rel) { await verify(file, rel); return { kind: 'win', path: file, version: rel.version, size: rel.size, sha256: rel.sha256 }; }
  async applySelf(staged, { reopen = true } = {}) {
    await verify(staged.path, staged);
    this.log.info('self', 'Running the App Manager ' + staged.version + ' installer' + (reopen ? ' and reopening' : ''));
    const child = spawn(staged.path, ['/S', ...(reopen ? ['--force-run'] : [])], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  }
}
module.exports = { WindowsPlatform, uninstaller, folderPrefix };
