'use strict';
// Reads the HN Group Company Register (companies.hngroup.org.uk) through its public feed. The register
// is the source of truth for who holds what: each company's current persons with significant control,
// with their share. The last copy is kept on disk so investors still see their holdings while the
// register is offline.
const fs = require('node:fs');
const path = require('node:path');

const FEED_URL = process.env.COMPANIES_FEED_URL || 'http://127.0.0.1:4900/api/public/companies';
const PUBLIC_URL = process.env.COMPANIES_PUBLIC_URL || 'https://companies.hngroup.org.uk';
let file = null, feed = { version: '', companies: [] }, timer = null, fetching = null, lastOk = 0;

function init(dataDir) {
  file = path.join(dataDir, 'register.json');
  try { const saved = JSON.parse(fs.readFileSync(file, 'utf8')); if (saved && Array.isArray(saved.companies)) feed = saved; } catch {}
}
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
      feed = { version: String(next.version || ''), companies: next.companies, at: new Date().toISOString() };
      if (file) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(feed), { mode: 0o600 }); fs.renameSync(tmp, file); }
      return true;
    } catch { return false; } finally { fetching = null; }
  })();
  return fetching;
}
function start(ms) { refresh(); timer = setInterval(refresh, ms || 20000); timer.unref?.(); }
function stop() { clearInterval(timer); }

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const all = () => feed.companies.slice().sort((a, b) => displayName(a).localeCompare(displayName(b)));
const bySlug = (slug) => feed.companies.find((c) => c.slug === slug) || null;
// The name a company goes by, without "Limited".
const displayName = (c) => String(c.name || c.legalName || '').trim().replace(/\s+(limited|ltd\.?)$/i, '') || c.slug;
// The register company an owner entry refers to (owners are recorded by registered name).
const companyNamed = (name) => feed.companies.find((c) => same(c.legalName, name) || same(c.name, name) || same(displayName(c), name)) || null;
const registerUrl = (c) => PUBLIC_URL + '/company/' + encodeURIComponent(c.slug);
// A share as a number of percent when the register records one, otherwise null.
const sharePercent = (o) => (o.share !== '' && o.share != null && Number.isFinite(Number(o.share)) && Number(o.share) >= 0 && Number(o.share) <= 100 ? Number(o.share) : null);
function shareText(o) {
  const n = sharePercent(o);
  if (n !== null) return n + '%';
  const m = /shares\s*[–-]\s*(more than 25% but not more than 50%|more than 50% but less than 75%|75% or more)/i.exec((o.control || []).join(' '));
  return m ? m[1] : 'Not recorded';
}
// Every name that holds a share of a company on the register: people and companies.
function holderNames() {
  const names = new Map();
  for (const c of feed.companies) for (const o of c.owners || []) { const k = String(o.name || '').trim(); if (k && !names.has(k.toLowerCase())) names.set(k.toLowerCase(), { name: k, kind: o.kind }); }
  return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
}
const status = () => ({ version: feed.version, at: feed.at || null, healthy: Date.now() - lastOk < 120000, companies: feed.companies.length });
// Tests replace the data directly.
function set(next) { feed = { version: String(next.version || Date.now()), companies: next.companies || [], at: new Date().toISOString() }; lastOk = Date.now(); }

// A holding's classes, for example "Class A 60%, Class C 15%", or '' when not split into classes.
const classText = (o) => (o.classes ? ['A', 'B', 'C'].filter((k) => Number(o.classes[k] || 0) > 0).map((k) => 'Class ' + k + ' ' + Number(o.classes[k]) + '%').join(', ') : '');
module.exports = { classText, init, refresh, start, stop, set, all, bySlug, displayName, companyNamed, registerUrl, sharePercent, shareText, holderNames, status, same, PUBLIC_URL };
