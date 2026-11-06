'use strict';
// Installers kept on this server's disk (the user's report, 6 November 2026: browser updates weren't arriving; App
// Manager's check of its own 107 MB update was cut off after ~100 s every time). Streaming each download from GitHub
// through this process let a large file pile up in memory until PM2's 256 MB limit restarted it mid-download. Now each
// current installer is fetched once into /var/lib/hn-downloads/files, written straight to disk (never held in memory),
// checked against the release record's exact size and SHA-256, and served from there with byte ranges, so downloads
// can resume. Files no longer in any current release are removed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const SHA = /^[a-f0-9]{64}$/;

function createFiles(dataDir, { fetcher = fetch } = {}) {
  const dir = path.join(dataDir, 'files');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const pending = new Map();
  const where = (asset) => path.join(dir, asset.sha256);
  const valid = (asset) => !!asset && SHA.test(String(asset.sha256)) && Number.isSafeInteger(asset.size) && asset.size > 0 && typeof asset.url === 'string';
  function ready(asset) { try { return fs.statSync(where(asset)).size === asset.size; } catch { return false; } }

  async function fetchToDisk(asset) {
    const temp = where(asset) + '.' + crypto.randomUUID() + '.partial';
    try {
      const r = await fetcher(asset.url, { signal: AbortSignal.timeout(1800000), headers: { 'User-Agent': 'HN-Group-Downloads' } });
      if (r.status !== 200 || !r.body) throw Error('GitHub answered ' + r.status);
      const hash = crypto.createHash('sha256');
      let size = 0;
      const count = new Transform({ transform(chunk, _e, done) { size += chunk.length; if (size > asset.size) return done(Error('too large')); hash.update(chunk); done(null, chunk); } });
      await pipeline(Readable.fromWeb(r.body), count, fs.createWriteStream(temp, { mode: 0o600 }));
      if (size !== asset.size || hash.digest('hex') !== asset.sha256) throw Error('The download didn’t match its release record.');
      fs.renameSync(temp, where(asset));
      return where(asset);
    } finally { fs.rmSync(temp, { force: true }); }
  }
  // The local copy of an installer, fetching it first if needed (one fetch at a time per file).
  function local(asset) {
    if (!valid(asset)) return Promise.reject(Error('Unknown installer.'));
    if (ready(asset)) return Promise.resolve(where(asset));
    if (!pending.has(asset.sha256)) pending.set(asset.sha256, fetchToDisk(asset).finally(() => pending.delete(asset.sha256)));
    return pending.get(asset.sha256);
  }
  // Fetch every current installer ahead of time (one after another) and remove ones no release offers any more.
  let warming = null;
  function warm(assets) {
    const list = assets.filter(valid);
    const keep = new Set(list.map((a) => a.sha256));
    try { for (const f of fs.readdirSync(dir)) if (!keep.has(f.slice(0, 64)) && !pending.has(f.slice(0, 64))) fs.rmSync(path.join(dir, f), { force: true }); } catch {}
    if (warming) return warming;
    warming = (async () => { for (const a of list) { try { await local(a); } catch {} } })().finally(() => { warming = null; });
    return warming;
  }
  // Sends a local file, honouring a single "bytes=a-b" range.
  function send(req, res, file, asset) {
    const total = asset.size;
    let start = 0, end = total - 1, status = 200;
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    if (m && (m[1] || m[2])) {
      if (m[1]) { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1; }
      else { start = Math.max(0, total - Number(m[2])); }
      if (start > end || start >= total) { res.writeHead(416, { 'Content-Range': 'bytes */' + total }); return res.end(); }
      status = 206;
    }
    res.writeHead(status, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="' + asset.name + '"', 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes',
      ...(status === 206 ? { 'Content-Range': 'bytes ' + start + '-' + end + '/' + total } : {}) });
    if (req.method === 'HEAD') return res.end();
    return pipeline(fs.createReadStream(file, { start, end }), res).catch(() => {});
  }
  return { local, warm, send, ready, dir };
}

module.exports = { createFiles };
