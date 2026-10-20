'use strict';
// Follows the HN Group Company Register (companies.hngroup.org.uk). The register is the source of truth
// for each company's facts: owners, parent, management, officers, status and dates. The wiki reads its
// public feed every few seconds and keeps the last copy on disk, so company articles stay correct even
// while the register is offline. Only the names companies go by are shown on the wiki, never their
// registered (legal) names.
const fs = require('node:fs');
const path = require('node:path');

let file = null, feed = { version: '', companies: [] }, listeners = [], timer = null, fetching = null, lastOk = 0;
const FEED_URL = process.env.COMPANIES_FEED_URL || 'http://127.0.0.1:4900/api/public/companies';
const PUBLIC_URL = process.env.COMPANIES_PUBLIC_URL || 'https://companies.hngroup.org.uk';

function init(dataDir, opts) {
  file = path.join(dataDir, 'register.json');
  try { const saved = JSON.parse(fs.readFileSync(file, 'utf8')); if (saved && Array.isArray(saved.companies)) feed = saved; } catch {}
  if (opts && opts.feed) feed = opts.feed;
}
function onChange(fn) { listeners.push(fn); }

// Fetches the feed; when anything changed it is saved and everyone listening is told.
async function refresh() {
  if (fetching) return fetching;
  fetching = (async () => {
    try {
      const response = await fetch(FEED_URL, { headers: feed.version ? { 'If-None-Match': '"' + feed.version + '"' } : {}, signal: AbortSignal.timeout(5000) });
      if (response.status === 304) { lastOk = Date.now(); return false; }
      if (!response.ok) return false;
      const next = await response.json();
      if (!next || !Array.isArray(next.companies)) return false;
      lastOk = Date.now();
      if (next.version && next.version === feed.version) return false;
      const previous = feed;
      feed = { version: String(next.version || ''), companies: next.companies };
      if (file) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(feed), { mode: 0o600 }); fs.renameSync(tmp, file); }
      for (const fn of listeners) { try { fn(feed, previous); } catch (e) { console.error(e); } }
      return true;
    } catch { return false; } finally { fetching = null; }
  })();
  return fetching;
}
function start(intervalMs) { refresh(); timer = setInterval(refresh, intervalMs || 20000); timer.unref?.(); }
function stop() { clearInterval(timer); }
// Replaces the data directly (tests, and the first sync after an install).
function set(next) { const previous = feed; feed = { version: String(next.version || Date.now()), companies: next.companies || [] }; for (const fn of listeners) fn(feed, previous); }

const all = () => feed.companies;
const version = () => feed.version;
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
// The name a company goes by (never its registered name unless that's all there is, without "Limited").
const displayName = (c) => String(c.name || c.legalName || '').trim().replace(/\s+(limited|ltd\.?)$/i, '') || c.slug;
const bySlug = (slug) => feed.companies.find((c) => c.slug === slug) || null;
// A company by the name it goes by, its registered name, or a former name.
function find(name) {
  const n = String(name || '').trim().replace(/_/g, ' ');
  if (!n) return null;
  return feed.companies.find((c) => c.slug === n.toLowerCase()) || feed.companies.find((c) => same(displayName(c), n) || same(c.name, n) || same(c.legalName, n))
    || feed.companies.find((c) => (c.previousNames || []).some((p) => same(p.name, n) || same(String(p.name).replace(/\s+(limited|ltd\.?)$/i, ''), n))) || null;
}
const children = (c) => feed.companies.filter((x) => x.parent === c.slug).sort((a, b) => displayName(a).localeCompare(displayName(b)));
const managedBy = (c) => feed.companies.filter((x) => x.managedBy === c.slug).sort((a, b) => displayName(a).localeCompare(displayName(b)));
const registerUrl = (c) => PUBLIC_URL + '/company/' + encodeURIComponent(c.slug);

// Who owns a company: its current persons with significant control, which may be people, companies or
// both. A company owner is matched to its register entry so the wiki can link to its article.
function owners(c) {
  return (c.owners || []).map((o) => {
    const company = o.kind === 'Individual' ? null : find(o.name);
    return { name: company ? displayName(company) : String(o.name || '').trim(), company, kind: o.kind, share: shareText(o), classes: o.classes || null, votes: typeof o.votes === 'number' ? o.votes : null, votingControl: !!o.votingControl };
  });
}
function shareText(o) {
  if (o.share !== '' && o.share != null && Number.isFinite(Number(o.share))) return Number(o.share) + '%';
  const control = (o.control || []).join(' ');
  const m = /shares\s*[–-]\s*(more than 25% but not more than 50%|more than 50% but less than 75%|75% or more)/i.exec(control);
  return m ? m[1] : '';
}
// The chain of parents above a company (nearest first), stopping at loops.
function ancestors(c) {
  const out = [], seen = new Set([c.slug]);
  let p = c.parent && bySlug(c.parent);
  while (p && !seen.has(p.slug)) { out.push(p); seen.add(p.slug); p = p.parent && bySlug(p.parent); }
  return out;
}
const roots = () => feed.companies.filter((c) => !c.parent || !bySlug(c.parent)).sort((a, b) => displayName(a).localeCompare(displayName(b)));
const healthy = () => Date.now() - lastOk < 120000;

module.exports = { init, start, stop, refresh, set, onChange, all, version, find, bySlug, displayName, children, managedBy, owners, ancestors, roots, registerUrl, healthy, PUBLIC_URL };
