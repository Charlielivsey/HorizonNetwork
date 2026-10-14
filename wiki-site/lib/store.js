'use strict';
// Wiki pages and their full revision history, kept in DATA_DIR/pages.json. Articles in seed/ are
// added the first time they're missing. A starting article nobody has edited yet is refreshed when its
// seed changes; once someone edits it on the wiki, it is never overwritten.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { normaliseTitle } = require('./markup');

const MAX_TEXT = 200000;
let file, data;

function init(dataDir, seedDir) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  file = path.join(dataDir, 'pages.json');
  data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { pages: {}, seeded: {} };
  data.pages = data.pages || {}; data.seeded = data.seeded || {};
  if (seedDir && fs.existsSync(seedDir)) seed(seedDir);
}

function save() {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const key = (title) => normaliseTitle(title).toLowerCase();

// Seed files: the first line is "title: Page title", optionally "protected: yes", then "---".
function seed(dir) {
  let changed = false;
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.wiki')).sort()) {
    const raw = fs.readFileSync(path.join(dir, name), 'utf8').replace(/\r/g, '');
    const split = raw.indexOf('\n---\n');
    if (split === -1) continue;
    const meta = {};
    for (const line of raw.slice(0, split).split('\n')) { const m = /^(\w+):\s*(.*)$/.exec(line); if (m) meta[m[1]] = m[2].trim(); }
    const title = normaliseTitle(meta.title);
    const text = raw.slice(split + 5).trim() + '\n';
    const existing = title && get(title);
    if (existing) {
      const last = latest(existing);
      if (last.author && last.author.id === 'system' && last.text !== text) {
        addRevision(existing, text, { name: 'HN Group Wiki', id: 'system' }, 'Updated article');
        changed = true;
      }
      data.seeded[key(title)] = true;
      continue;
    }
    if (!title || data.seeded[key(title)]) continue;
    create(title, text, { name: 'HN Group Wiki', id: 'system' }, 'Initial article', { protected: meta.protected === 'yes' });
    data.seeded[key(title)] = true;
    changed = true;
  }
  if (changed) save();
}

function get(title) {
  return data.pages[key(title)] || null;
}

function latest(page) {
  return page.revisions[page.revisions.length - 1];
}

function create(title, text, author, summary, opts) {
  const page = { title: normaliseTitle(title), protected: !!(opts && opts.protected), revisions: [] };
  data.pages[key(title)] = page;
  addRevision(page, text, author, summary);
  return page;
}

function addRevision(page, text, author, summary) {
  const rev = {
    id: crypto.randomBytes(6).toString('hex'),
    at: new Date().toISOString(),
    text: String(text).replace(/\r/g, '').slice(0, MAX_TEXT),
    summary: String(summary || '').trim().slice(0, 250),
    author: { id: String(author.id || ''), name: String(author.name || 'Staff editor').slice(0, 80) },
  };
  page.revisions.push(rev);
  if (page.revisions.length > 500) page.revisions.splice(1, page.revisions.length - 500);
  return rev;
}

// Saves an edit. baseId is the revision the editor started from, so two people editing at once
// don't silently overwrite each other.
function edit(title, text, author, summary, baseId) {
  const page = get(title);
  if (!page) { const p = create(title, text, author, summary || 'Created page'); save(); return { page: p, rev: latest(p) }; }
  const current = latest(page);
  if (baseId && baseId !== current.id) { const e = new Error('Someone else changed this page while you were editing.'); e.conflict = true; e.current = current; throw e; }
  if (current.text === String(text).replace(/\r/g, '')) return { page, rev: current, unchanged: true };
  const rev = addRevision(page, text, author, summary);
  save();
  return { page, rev };
}

function setProtected(title, on) {
  const page = get(title); if (!page) return null;
  page.protected = !!on; save(); return page;
}

function remove(title) {
  const k = key(title); if (!data.pages[k]) return false;
  delete data.pages[k]; data.seeded[k] = true; save(); return true;
}

function all() {
  return Object.values(data.pages).sort((a, b) => a.title.localeCompare(b.title));
}

function recentChanges(limit) {
  const list = [];
  for (const page of Object.values(data.pages)) page.revisions.forEach((rev, i) => list.push({ title: page.title, rev, isNew: i === 0, size: rev.text.length, prevSize: i ? page.revisions[i - 1].text.length : 0 }));
  return list.sort((a, b) => b.rev.at.localeCompare(a.rev.at)).slice(0, limit || 100);
}

module.exports = { init, get, latest, edit, setProtected, remove, all, recentChanges, key };
