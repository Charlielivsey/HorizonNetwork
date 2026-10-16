'use strict';
// Each website keeps its own private JSON store and file directory. Writes are atomic (temp file + rename).
const fs = require('node:fs');
const path = require('node:path');
const { fail, id } = require('./http');

function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'data.json');
  const files = path.join(dir, 'files');
  fs.mkdirSync(files, { recursive: true, mode: 0o700 });
  let data = { version: 1, items: {}, accounts: [], users: [], seeded: {}, audit: [], meta: {} };
  if (fs.existsSync(file)) {
    const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (loaded.version !== 1 || typeof loaded.items !== 'object') throw new Error('Unrecognised website data file: ' + file);
    data = { ...data, ...loaded };
  }
  function write(next) {
    const temp = file + '.tmp';
    const fd = fs.openSync(temp, 'w', 0o600);
    try { fs.writeSync(fd, JSON.stringify(next)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  }
  // Edits run against a copy; a thrown validation error leaves the saved state untouched.
  function change(edit) {
    const next = structuredClone(data);
    const result = edit(next);
    write(next);
    data = next;
    return result;
  }
  const list = key => data.items[key] || [];
  function audit(next, actor, action, detail = '') {
    next.audit.push({ at: new Date().toISOString(), actor: String(actor || 'anonymous').slice(0, 160), action: String(action).slice(0, 120), detail: String(detail).slice(0, 200) });
    if (next.audit.length > 2000) next.audit = next.audit.slice(-2000);
  }
  // Uploaded files are stored privately under random names; only metadata enters data.json.
  function putFile(buffer) {
    const name = id();
    fs.writeFileSync(path.join(files, name), buffer, { mode: 0o600, flag: 'wx' });
    return name;
  }
  function filePath(name) {
    if (!/^[a-f0-9]{24}$/.test(name)) throw fail(404, 'File not found.');
    return path.join(files, name);
  }
  function removeFile(name) { try { fs.unlinkSync(filePath(name)); } catch {} }
  function usage() {
    let total = 0;
    for (const name of fs.readdirSync(files)) { try { total += fs.statSync(path.join(files, name)).size; } catch {} }
    return total;
  }
  if (!fs.existsSync(file)) write(data);
  return { get data() { return data; }, list, change, audit, putFile, filePath, removeFile, usage, dir };
}
module.exports = { createStore };
