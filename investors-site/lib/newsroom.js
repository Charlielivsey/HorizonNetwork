'use strict';
// Investor news is written on HN Group News (news.hngroup.org.uk) by ticking "HN Group Investors".
// This reads the published items over loopback with the service secret (the feed isn't public) and
// keeps the last copy in DATA_DIR/newsroom.json, so investors still see it while News is offline.
// Unpublishing or deleting an item on News removes it here at the next refresh.
const fs = require('node:fs');
const path = require('node:path');

const FEED_URL = process.env.NEWS_FEED_URL || 'http://127.0.0.1:4600/api/private/investor-news';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
let file = null, items = [], fetching = null;

const shape = (p) => (p && /^[a-f0-9]{24}$/.test(p.id) && typeof p.title === 'string' ? {
  id: p.id, title: p.title.slice(0, 160), summary: String(p.summary || '').slice(0, 300), body: String(p.body || '').slice(0, 40000),
  topic: String(p.category || '').slice(0, 80), author: String(p.author || '').slice(0, 120),
  publishedAt: String(p.publishedAt || p.updatedAt || ''), updatedAt: String(p.updatedAt || ''), status: 'published', source: 'news',
  document: p.document && /^https:\/\/news\.hngroup\.org\.uk\/api\/posts\/[a-f0-9]{24}\/document$/.test(p.document.url || '') ? { url: p.document.url, label: String(p.document.label || 'Document (PDF)').slice(0, 80) } : null,
} : null);

function init(dataDir) {
  file = path.join(dataDir, 'newsroom.json');
  try { const saved = JSON.parse(fs.readFileSync(file, 'utf8')); if (Array.isArray(saved.posts)) items = saved.posts.map(shape).filter(Boolean); } catch {}
}
async function refresh() {
  if (fetching) return fetching;
  fetching = (async () => {
    let secret = '';
    try { secret = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch {}
    if (!/^[a-f0-9]{64}$/.test(secret)) return false;
    try {
      const response = await fetch(FEED_URL, { headers: { Authorization: 'Bearer ' + secret }, signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!response.ok) return false;
      const next = await response.json();
      if (!next || !Array.isArray(next.posts)) return false;
      items = next.posts.map(shape).filter(Boolean);
      if (file) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ posts: items, at: new Date().toISOString() }), { mode: 0o600 }); fs.renameSync(tmp, file); }
      return true;
    } catch { return false; }
  })().finally(() => { fetching = null; });
  return fetching;
}
function start(ms) { refresh(); const timer = setInterval(refresh, ms); timer.unref(); }
const all = () => items.slice();

module.exports = { init, refresh, start, all };
