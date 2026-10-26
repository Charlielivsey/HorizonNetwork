'use strict';
// The settings App Manager can change for each app. They're written to the app's own preferences file only while the
// app is closed, and the app reads them when it next opens. Only these fields, with exactly these values, can ever be
// written, and every other key already in the file (including ones App Manager doesn't know) is kept as it was.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const choice = (group, label, values, value, hint = '') => ({ type: 'choice', group, label, hint, values, default: value });
const bool = (group, label, value, hint = '') => ({ type: 'boolean', group, label, hint, default: value });
const BROWSER = {
  theme: choice('Appearance', 'Browser theme', ['midnight-lavender', 'daylight', 'deep-ocean', 'forest', 'rose'], 'midnight-lavender'),
  hnThemes: bool('Appearance', 'Theme HN Group websites to match', true, 'HN websites take on your browser theme.'),
  reduceMotion: bool('Appearance', 'Reduce animations', false),
  homeButton: bool('Appearance', 'Show the Home button', true),
  startup: choice('Tabs', 'When HN Browser opens', ['newtab', 'restore'], 'newtab'),
  confirmClose: bool('Tabs', 'Ask before closing several tabs', true),
  newTabNextToCurrent: bool('Tabs', 'Open new tabs beside the current one', false),
  greeting: bool('New tab page', 'Show a greeting', true),
  recentSites: bool('New tab page', 'Show your most visited sites', true),
  searchEngine: choice('Search and privacy', 'Search engine', ['google', 'bing', 'duckduckgo'], 'google'),
  suggestions: bool('Search and privacy', 'Suggestions as you type', true),
  saveHistory: bool('Search and privacy', 'Keep browsing history', true),
  popups: bool('Search and privacy', 'Allow pop-up windows', true),
  askDownload: bool('Downloads', 'Ask where to save each download', true),
  downloadNotify: bool('Downloads', 'Notify me when a download finishes', true),
  openDownloadsOnStart: bool('Downloads', 'Show downloads when one starts', false),
  autoLock: choice('Account', 'Lock after I’m away for', [0, 5, 15, 30, 60], 0, 'You unlock with your six-digit PIN.'),
  lockOnSleep: bool('Account', 'Lock when this computer sleeps', false),
};
const NETWORK_WINDOWS = {
  theme: choice('Appearance', 'Appearance', ['system', 'light', 'dark'], 'system'),
  launchAtLogin: bool('Startup', 'Open when I sign in to Windows', true, 'It waits in the system tray.'),
  connectOnLaunch: bool('Startup', 'Ask to connect when it opens', false, 'It opens on your PIN, so connecting takes one step.'),
};
const NETWORK_MAC = {
  launchAtLogin: bool('Startup', 'Open when I log in', false, 'Needs HN Secure Network 2.4.1 or later.'),
  sshUser: { type: 'text', group: 'SSH', label: 'Server username', hint: 'Filled in on the SSH page. You still type the password each time.', default: 'root' },
};
const LABELS = { 'midnight-lavender': 'Midnight Lavender', daylight: 'Daylight', 'deep-ocean': 'Deep Ocean', forest: 'Forest', rose: 'Rose Quartz', newtab: 'A new tab', restore: 'My tabs from last time', system: 'Match the computer', light: 'Light', dark: 'Dark', google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo' };

function schema(id, platform) {
  if (id === 'browser') return BROWSER;
  if (id === 'network') return platform === 'darwin' ? NETWORK_MAC : NETWORK_WINDOWS;
  throw Object.assign(Error('Unknown app.'), { status: 400 });
}
function validate(id, platform, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw Object.assign(Error('Those settings aren’t valid.'), { status: 400 });
  const spec = schema(id, platform), out = {};
  for (const [k, v] of Object.entries(patch)) {
    const f = Object.hasOwn(spec, k) ? spec[k] : null;
    if (!f) throw Object.assign(Error('That setting can’t be changed here.'), { status: 400 });
    const ok = f.type === 'boolean' ? typeof v === 'boolean' : f.type === 'choice' ? f.values.includes(v) : typeof v === 'string' && /^[a-z_][a-z0-9_.-]{0,31}$/.test(v);
    if (!ok) throw Object.assign(Error('That isn’t a valid value for “' + f.label + '”.'), { status: 400 });
    out[k] = v;
  }
  return out;
}
function values(id, platform, saved) {
  return Object.fromEntries(Object.entries(schema(id, platform)).map(([k, f]) => { let v = f.default; try { v = validate(id, platform, { [k]: saved[k] })[k]; } catch {} return [k, v]; }));
}
// For the window: the fields with their labels, and labels for each choice.
function describe(id, platform) {
  return Object.entries(schema(id, platform)).map(([key, f]) => ({ key, ...f, options: f.values ? f.values.map((v) => ({ value: v, label: typeof v === 'number' ? (v === 0 ? 'Never' : v + ' minutes') : LABELS[v] || String(v) })) : undefined }));
}
async function readJSON(file) {
  try {
    const s = await fs.promises.lstat(file);
    if (s.isSymbolicLink() || !s.isFile() || s.size > 1048576) throw Error('The app’s preferences file isn’t safe to change.');
    const v = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('The app’s preferences file is damaged.');
    return v;
  } catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
}
async function writeJSON(file, id, platform, patch) {
  const checked = validate(id, platform, patch), previous = await readJSON(file);
  await fs.promises.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.manager-' + crypto.randomUUID();
  try { await fs.promises.writeFile(tmp, JSON.stringify({ ...previous, ...checked }, null, 2), { flag: 'wx', mode: 0o600 }); await fs.promises.rename(tmp, file); }
  finally { await fs.promises.rm(tmp, { force: true }); }
}
module.exports = { schema, validate, values, describe, readJSON, writeJSON };
