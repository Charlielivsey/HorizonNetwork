'use strict';
// The published Mac app: its version and build, read from the Info.plist inside the zip, plus the
// zip's SHA-256 so the app can check an update before installing it.
const fs = require('node:fs');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

let cached = null; // { key, info }

// Finds and inflates "<name>.app/Contents/Info.plist" in a zip (as made by ditto).
function infoPlist(zip) {
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) if (zip.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) return null;
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  for (let n = 0; n < count && at + 46 <= zip.length && zip.readUInt32LE(at) === 0x02014b50; n++) {
    const method = zip.readUInt16LE(at + 10), size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28), extra = zip.readUInt16LE(at + 30), comment = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extra + comment;
    if (!/^[^/]+\.app\/Contents\/Info\.plist$/.test(name) || size > 1024 * 1024) continue;
    if (zip.readUInt32LE(local) !== 0x04034b50) return null;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    if (method === 0) return data.toString('utf8');
    if (method === 8) return zlib.inflateRawSync(data).toString('utf8');
    return null;
  }
  return null;
}

const plistValue = (plist, key) => (new RegExp('<key>' + key + '</key>\\s*<string>([^<]{1,40})</string>').exec(plist) || [])[1] || '';

// Version details of the zip at `file`, or null when nothing is published.
function info(file) {
  let stat; try { stat = fs.statSync(file); } catch { return null; }
  const key = stat.size + ':' + stat.mtimeMs;
  if (cached && cached.key === key && cached.file === file) return cached.info;
  const zip = fs.readFileSync(file);
  let plist = null; try { plist = infoPlist(zip); } catch { plist = null; }
  const version = plist ? plistValue(plist, 'CFBundleShortVersionString') : '';
  const build = Number.parseInt(plist ? plistValue(plist, 'CFBundleVersion') : '', 10);
  const result = {
    version: /^[0-9][0-9A-Za-z.\-]*$/.test(version) ? version : '',
    build: Number.isFinite(build) && build > 0 ? build : 0,
    size: stat.size, sha256: crypto.createHash('sha256').update(zip).digest('hex'),
    publishedAt: new Date(stat.mtimeMs).toISOString(),
  };
  cached = { key, file, info: result };
  return result;
}

module.exports = { info, infoPlist };
