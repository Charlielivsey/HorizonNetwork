'use strict';
// Releases from downloads.hngroup.org.uk. Only exact records are accepted (the right app, platform, file name and
// fixed download route, a sensible size and a SHA-256), and every download is checked for its size and SHA-256 when
// it finishes and again just before it's used. Nothing is ever run from anywhere else.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ORIGIN = 'https://downloads.hngroup.org.uk';
const MAX = 400 * 1024 * 1024;
const fail = (message, extra) => Object.assign(new Error(message), extra || {});

// "1.2.3" or "1.2.3-45" (version and build). Anything else isn't a version.
function parts(v) { return typeof v === 'string' && /^\d+\.\d+\.\d+(?:-\d+)?$/.test(v) ? v.split(/[.-]/).map(Number) : null; }
function newer(a, b) {
  const x = parts(a), y = parts(b);
  if (!x || !y) return false;
  for (let i = 0; i < 4; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
const short = (v) => String(v || '').split('-')[0];

// The release for one app on this computer, or null.
function release(feed, id, platform, arch) {
  const mac = platform === 'darwin', win = platform === 'win32' && arch === 'x64';
  if (!mac && !win) return null;
  let version, asset, route, name, publishedAt = null;
  if (id === 'browser') {
    if (mac && arch !== 'arm64') return null;
    const r = feed && feed.release;
    version = r && r.version;
    if (!parts(version)) return null;
    route = mac ? 'mac-arm64-zip' : 'windows-x64';
    asset = r.assets && r.assets[route];
    name = 'HN-Browser-' + short(version) + (mac ? '-mac-arm64.zip' : '-win-x64.exe');
    publishedAt = r.publishedAt;
  } else if (id === 'network' || id === 'manager') {
    const key = id === 'network' ? (mac ? 'secure-network' : 'secure-network-windows') : (mac ? 'app-manager-mac' : 'app-manager-windows');
    const a = feed && feed.apps && feed.apps[key];
    version = a && a.version;
    const build = a && a.build ? a.build : 0;
    if (!parts(version) || !Number.isSafeInteger(build) || build < 0) return null;
    if (build && !version.includes('-')) version += '-' + build;
    route = id === 'network' ? (mac ? 'secure-network-mac' : 'secure-network-windows') : key;
    name = (id === 'network' ? 'HN-Secure-Network-' : 'HN-Group-App-Manager-') + short(version) + (id === 'network' ? (mac ? '-macOS.zip' : '-windows-x64.exe') : (mac ? '-mac-universal.zip' : '-win-x64.exe'));
    asset = a.asset;
    publishedAt = a.publishedAt;
  } else return null;
  if (!asset || asset.url !== '/download/' + route || asset.name !== name || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > MAX || !/^[a-f0-9]{64}$/.test(asset.sha256 || '')) return null;
  const at = Date.parse(publishedAt || '');
  return { id, version, name, size: asset.size, sha256: asset.sha256, url: ORIGIN + asset.url, publishedAt: Number.isFinite(at) ? new Date(at).toISOString() : null };
}

async function fetchFeed(fetcher = fetch) {
  let response;
  try { response = await fetcher(ORIGIN + '/api/releases', { signal: AbortSignal.timeout(20000), redirect: 'error', headers: { Accept: 'application/json' } }); }
  catch (e) { throw fail('downloads.hngroup.org.uk can’t be reached. Check your internet connection.', { cause: e }); }
  if (!response.ok) throw fail('The downloads service isn’t available right now (' + response.status + '). Try again in a few minutes.');
  const value = await response.json().catch(() => null);
  if (!value || typeof value !== 'object') throw fail('The downloads service sent something unexpected.');
  return value;
}

async function verify(file, r) {
  const stat = await fs.promises.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== r.size) throw fail('The download is the wrong size, so it wasn’t used. Try again.');
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  if (hash.digest('hex') !== r.sha256) throw fail('The download didn’t match its checksum, so it wasn’t used. Try again.');
  return file;
}

// Downloads a release into dir (reusing an earlier complete download) and returns the checked file.
async function download(r, dir, { fetcher = fetch, signal, progress = () => {} } = {}) {
  if (!r || !r.url.startsWith(ORIGIN + '/download/') || r.name !== path.basename(r.name) || !parts(r.version) || !Number.isSafeInteger(r.size) || r.size < 1 || r.size > MAX || !/^[a-f0-9]{64}$/.test(r.sha256)) throw fail('That download isn’t valid.');
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
  const out = path.join(dir, r.sha256.slice(0, 16) + '-' + r.name);
  try { await verify(out, r); progress(r.size, r.size); return out; } catch { await fs.promises.rm(out, { force: true }); }
  const tmp = out + '.' + crypto.randomUUID() + '.part';
  const response = await fetcher(r.url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(1800000)]) : AbortSignal.timeout(1800000) })
    .catch((e) => { throw e.name === 'AbortError' && signal && signal.aborted ? fail('Cancelled.', { cancelled: true }) : fail('The download couldn’t start. Check your internet connection.'); });
  if (!response.ok || !response.body) throw fail('The download isn’t available right now (' + response.status + ').');
  const handle = await fs.promises.open(tmp, 'wx', 0o600);
  let received = 0;
  try {
    for await (const chunk of response.body) {
      received += chunk.length;
      if (received > r.size) throw fail('The download was bigger than expected, so it was stopped.');
      await handle.write(chunk);
      progress(received, r.size);
    }
    await handle.close();
    await verify(tmp, r);
    await fs.promises.rename(tmp, out);
    return out;
  } catch (e) {
    await handle.close().catch(() => {});
    await fs.promises.rm(tmp, { force: true });
    if (signal && signal.aborted) throw fail('Cancelled.', { cancelled: true });
    throw e;
  }
}
module.exports = { ORIGIN, MAX, parts, newer, short, release, fetchFeed, verify, download };
