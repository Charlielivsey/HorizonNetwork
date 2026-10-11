// Backups of everything in DATA_DIR (except the backups themselves and signed-in sessions).
// A backup is a .tar.gz file in DATA_DIR/backups. One is taken automatically every night at 02:00
// (server time); the newest 14 automatic ones are kept. Restoring first takes a safety backup of
// the current data.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const KEEP_AUTOMATIC = 14;
const SKIP = new Set(["backups", "sessions.json"]);

let dataDir;
let backupDir;

function init(dir) {
  dataDir = dir;
  backupDir = path.join(dataDir, "backups");
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
}

// ---- Minimal tar (ustar) writer and reader: regular files only ----

function tarHeader(name, size, mtime) {
  const h = Buffer.alloc(512, 0);
  const write = (str, offset, length) => h.write(str, offset, Math.min(Buffer.byteLength(str), length), "utf8");
  const octal = (n, length) => n.toString(8).padStart(length - 1, "0") + "\0";
  let prefix = "";
  let base = name;
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf("/", 154);
    prefix = name.slice(0, cut);
    base = name.slice(cut + 1);
  }
  write(base, 0, 100);
  write(octal(0o600, 8), 100, 8);
  write(octal(0, 8), 108, 8);
  write(octal(0, 8), 116, 8);
  write(octal(size, 12), 124, 12);
  write(octal(Math.floor(mtime / 1000), 12), 136, 12);
  h.fill(" ", 148, 156);
  write("0", 156, 1);
  write("ustar\0", 257, 6);
  write("00", 263, 2);
  write(prefix, 345, 155);
  let sum = 0;
  for (const b of h) sum += b;
  write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return h;
}

function collectFiles(dir, rel = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!rel && SKIP.has(entry.name)) continue;
    if (entry.name.endsWith(".tmp")) continue;
    const full = path.join(dir, entry.name);
    const relPath = rel ? rel + "/" + entry.name : entry.name;
    if (entry.isDirectory()) out.push(...collectFiles(full, relPath));
    else if (entry.isFile()) out.push({ full, rel: relPath });
  }
  return out;
}

function makeTar(files) {
  const parts = [];
  for (const f of files) {
    const content = fs.readFileSync(f.full);
    parts.push(tarHeader(f.rel, content.length, fs.statSync(f.full).mtimeMs), content);
    const pad = (512 - (content.length % 512)) % 512;
    if (pad) parts.push(Buffer.alloc(pad, 0));
  }
  parts.push(Buffer.alloc(1024, 0));
  return Buffer.concat(parts);
}

function readTar(buffer) {
  const files = [];
  for (let off = 0; off + 512 <= buffer.length; ) {
    const h = buffer.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const field = (start, len) => h.subarray(start, start + len).toString("utf8").replace(/\0.*$/s, "");
    const name = (field(345, 155) ? field(345, 155) + "/" : "") + field(0, 100);
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const type = field(156, 1) || "0";
    off += 512;
    if (type === "0") files.push({ name, content: buffer.subarray(off, off + size) });
    off += Math.ceil(size / 512) * 512;
  }
  return files;
}

// ---- Backups ----

function stamp() {
  return new Date().toISOString().replace(/[:T]/g, "-").replace(/\..+$/, "");
}

function createBackup(kind) {
  const name = `${kind}-${stamp()}.tar.gz`;
  const gz = zlib.gzipSync(makeTar(collectFiles(dataDir)));
  fs.writeFileSync(path.join(backupDir, name), gz, { mode: 0o600 });
  if (kind === "auto") prune();
  return name;
}

function prune() {
  const autos = listBackups().filter((b) => b.kind === "auto");
  for (const b of autos.slice(KEEP_AUTOMATIC)) fs.rmSync(path.join(backupDir, b.name), { force: true });
}

function listBackups() {
  return fs.readdirSync(backupDir)
    .filter((n) => /^(auto|manual|pre-restore)-[\d-]+\.tar\.gz$/.test(n))
    .map((name) => {
      const st = fs.statSync(path.join(backupDir, name));
      return { name, kind: name.split("-")[0] === "pre" ? "pre-restore" : name.split("-")[0], size: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function backupPath(name) {
  if (!/^(auto|manual|pre-restore)-[\d-]+\.tar\.gz$/.test(String(name || ""))) return null;
  const full = path.join(backupDir, name);
  return fs.existsSync(full) ? full : null;
}

function deleteBackup(name) {
  const full = backupPath(name);
  if (full) fs.rmSync(full, { force: true });
}

// Replaces the current data with a backup. Takes a safety backup first.
function restoreBackup(name) {
  const full = backupPath(name);
  if (!full) throw Object.assign(new Error("Backup not found."), { status: 404 });
  const files = readTar(zlib.gunzipSync(fs.readFileSync(full)));
  if (!files.some((f) => f.name === "people.json")) throw Object.assign(new Error("That backup doesn't look complete."), { status: 400 });
  const safety = createBackup("pre-restore");
  // The activity log is never rolled back, so the record of what happened (including this restore) stays complete.
  for (const entry of fs.readdirSync(dataDir)) {
    if (SKIP.has(entry) || entry === "audit.log") continue;
    fs.rmSync(path.join(dataDir, entry), { recursive: true, force: true });
  }
  for (const f of files) {
    if (f.name === "audit.log") continue;
    const target = path.resolve(dataDir, f.name);
    if (!target.startsWith(path.resolve(dataDir) + path.sep)) continue; // never write outside DATA_DIR
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, f.content, { mode: 0o600 });
  }
  return safety;
}

// Runs createBackup("auto") every night at 02:00 server time.
function scheduleNightly(onDone) {
  const next = new Date();
  next.setHours(2, 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  setTimeout(() => {
    try {
      onDone(null, createBackup("auto"));
    } catch (err) {
      onDone(err);
    }
    scheduleNightly(onDone);
  }, next - new Date()).unref();
}

module.exports = { init, createBackup, listBackups, backupPath, deleteBackup, restoreBackup, scheduleNightly, readTar };
