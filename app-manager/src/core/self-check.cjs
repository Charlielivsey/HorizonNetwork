'use strict';
// A check of everything App Manager relies on, on the real computer, changing nothing: the downloads service, finding
// each app and whether it's open, reading their settings, and (when asked) downloading and checking App Manager's own
// release exactly as an update would — on a Mac that includes unpacking it and checking its bundle id, version and
// signature. CI runs it on the built app on a real Mac and PC (--self-check=<file>); Settings → Diagnostics runs
// the quick version.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { IDS, APPS } = require('./catalog.cjs');
const { fetchFeed, release, download } = require('./feed.cjs');
const settings = require('./settings.cjs');

async function selfCheck({ platform, log, fetcher = fetch, arch, deep = false }) {
  const steps = [];
  const step = async (name, fn) => {
    const started = Date.now();
    try { const detail = await fn(); steps.push({ name, ok: true, detail: detail === undefined ? '' : String(detail), ms: Date.now() - started }); }
    catch (e) { steps.push({ name, ok: false, detail: e.message + (e.detail ? ' (' + e.detail + ')' : ''), ms: Date.now() - started }); }
  };
  let feed = null;
  await step('This computer is supported', () => { if (!platform.supported) throw Error(platform.name + ' ' + arch + ' isn’t supported.'); return platform.name + ' ' + arch + ', ' + os.release(); });
  await step('downloads.hngroup.org.uk answers', async () => { feed = await fetchFeed(fetcher); return 'release feed received'; });
  for (const id of [...IDS, 'manager']) {
    await step('Release record for ' + (APPS[id] ? APPS[id].name : 'App Manager'), () => {
      if (!feed) throw Error('No release feed.');
      if (id === 'browser' && platform.name === 'darwin' && arch !== 'arm64') return 'not built for this Mac (Apple silicon only)';
      const r = release(feed, id, platform.name, arch);
      if (!r) throw Error('No valid release for this computer.');
      return r.version + ', ' + Math.round(r.size / 1048576) + ' MB';
    });
  }
  for (const id of IDS) {
    await step('Look for ' + APPS[id].name, async () => {
      const found = await platform.find(id);
      if (!found) return 'not installed';
      const open = await platform.running(found);
      return found.version + ' at ' + found.path + (open ? ' (open)' : '');
    });
  }
  await step('Read HN Browser’s settings', async () => {
    const file = platform.preferencesFile('browser');
    const saved = await settings.readJSON(file);
    return Object.keys(saved).length + ' saved settings in ' + file;
  });
  if (deep) {
    await step('Download and check App Manager’s own update', async () => {
      const r = feed && release(feed, 'manager', platform.name, arch);
      if (!r) throw Error('No App Manager release for this computer.');
      const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hn-app-manager-check-'));
      try {
        const file = await download(r, path.join(dir, 'downloads'), { fetcher });
        const staged = await platform.stageSelf(file, r, dir);
        return 'App Manager ' + r.version + ' downloaded and checked (' + staged.kind + ')';
      } finally { await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {}); }
    });
  }
  const ok = steps.every((s) => s.ok);
  if (log) for (const s of steps) log[s.ok ? 'info' : 'warn']('self-check', (s.ok ? 'OK ' : 'FAILED ') + s.name + ': ' + s.detail);
  return { ok, at: new Date().toISOString(), steps };
}
module.exports = { selfCheck };
