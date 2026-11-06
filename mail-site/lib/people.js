'use strict';
// Who people are (the user's request, 6 November 2026: senders' profile pictures "from his auth account" and a card
// when hovering over someone, "even myself"). The staff backend's directory (service secret, loopback) gives each
// profile's name, job title, company, time zone, email addresses and whether it has a picture; pictures come from its
// directory-avatar route and are served through HN Mail's own address (its pages only show its own images).
const fs = require('node:fs');
const STAFF_BACKEND = process.env.STAFF_BACKEND || 'http://127.0.0.1:3250';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';

function createPeople({ fetcher = fetch } = {}) {
  let cache = { at: 0, list: [] };
  const pictures = new Map();
  const secret = () => { try { const s = fs.readFileSync(SECRET_FILE, 'utf8').trim(); return /^[a-f0-9]{64}$/.test(s) ? s : ''; } catch { return ''; } };
  async function post(route, body) {
    const key = secret(); if (!key) return null;
    try { return await fetcher(STAFF_BACKEND + route, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(5000), redirect: 'error' }); } catch { return null; }
  }
  // One entry per email address (the first profile wins, so someone's main company is shown).
  async function list() {
    if (Date.now() - cache.at < 300000) return cache.list;
    const r = await post('/api/auth/staff-directory');
    const value = r && r.ok ? await r.json().catch(() => ({})) : null;
    if (!value || !Array.isArray(value.people)) return cache.list;
    const seen = new Set(), out = [];
    for (const p of value.people) for (const email of Array.isArray(p.emails) ? p.emails : []) {
      const e = String(email).toLowerCase(); if (seen.has(e)) continue; seen.add(e);
      out.push({ email: e, id: String(p.id), name: String(p.displayName || ''), jobTitle: String(p.jobTitle || ''), company: String(p.company || ''), timezone: String(p.timezone || ''), photo: !!p.photo });
    }
    cache = { at: Date.now(), list: out };
    return out;
  }
  async function picture(id) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
    const held = pictures.get(id);
    if (held && held.at > Date.now() - 600000) return held.pic;
    const r = await post('/api/auth/directory-avatar', { id });
    const type = r && r.ok ? String(r.headers.get('content-type') || '') : '';
    const pic = /^image\/(png|jpeg|gif|webp)$/.test(type) ? { type, bytes: Buffer.from(await r.arrayBuffer()) } : null;
    pictures.set(id, { at: Date.now(), pic });
    if (pictures.size > 300) pictures.delete(pictures.keys().next().value);
    return pic;
  }
  return { list, picture };
}
module.exports = { createPeople };
