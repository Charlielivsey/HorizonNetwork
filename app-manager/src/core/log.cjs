'use strict';
// A plain-text record of everything App Manager does (logs/app-manager.log in its data folder, rotated at 1 MB with
// one older copy kept), so a problem on someone's computer can be looked at afterwards: Settings → Diagnostics can
// copy it. It never records tokens, passwords, PINs or codes: anything that looks like one is removed first.
const fs = require('node:fs');
const path = require('node:path');

const SECRET = /\b(?:[a-f0-9]{40,}|Bearer\s+\S+)\b|\b(?:code|pin|token|secret|password|verifier|state)=[^&\s"']+/gi;
const clean = (value) => String(value).replace(SECRET, (m) => (m.includes('=') ? m.split('=')[0] + '=…' : '…'));

class Log {
  constructor(dir, { echo = false } = {}) {
    this.dir = path.join(dir, 'logs');
    this.file = path.join(this.dir, 'app-manager.log');
    this.echo = echo;
    try { fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 }); } catch {}
  }
  write(level, area, message, extra) {
    let detail = '';
    if (extra !== undefined) { try { detail = ' ' + JSON.stringify(extra); } catch { detail = ''; } }
    const line = new Date().toISOString() + ' ' + level.padEnd(5) + ' ' + area + ': ' + clean(String(message).replace(/\s+/g, ' ') + detail.slice(0, 2000)) + '\n';
    try { if (fs.statSync(this.file).size > 1048576) fs.renameSync(this.file, this.file + '.1'); } catch {}
    try { fs.appendFileSync(this.file, line, { mode: 0o600 }); } catch {}
    if (this.echo) process.stdout.write(line);
  }
  info(area, message, extra) { this.write('INFO', area, message, extra); }
  warn(area, message, extra) { this.write('WARN', area, message, extra); }
  error(area, message, extra) { this.write('ERROR', area, message, extra); }
  // The most recent lines, oldest first (for Settings → Diagnostics).
  tail(count = 300) {
    const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
    return (read(this.file + '.1') + read(this.file)).split('\n').filter(Boolean).slice(-count);
  }
}
module.exports = { Log, clean };
