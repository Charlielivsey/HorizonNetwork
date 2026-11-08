'use strict';
// HN Group People at people.hngroup.org.uk (the user's request, 7 November 2026): a fully public staff list for every
// company, an org chart per company, one org chart with everyone, and each person's About me. Everything comes live
// from the staff portal (the staff backend's /api/auth/people-public with the service secret, never exposed), so changes
// made on the staff portal are picked up by the page’s 15-second refresh. Nobody signs in here.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');

const PORT = Number(process.env.PORT || 5670);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC = path.join(__dirname, 'public');
const BACKEND = process.env.STAFF_PORTAL_BACKEND || 'http://127.0.0.1:3200';
const SECRET = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const FRESH = Number(process.env.PEOPLE_CACHE_MS || 5000);
const PHOTO_FRESH = 10 * 60 * 1000;

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
const HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
const send = (res, code, body, type, extra) => { res.writeHead(code, { ...HEADERS, 'Content-Type': type, ...(extra || {}) }); res.end(body); };
const json = (res, code, value, extra) => send(res, code, JSON.stringify(value), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store', ...(extra || {}) });

function secret() {
  const s = fs.readFileSync(SECRET, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(s)) throw new Error('Configuration unavailable');
  return s;
}
function backend(route, body) {
  return fetch(BACKEND + '/api/auth/' + route, { method: 'POST', headers: { Authorization: 'Bearer ' + secret(), 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(6000), redirect: 'error' });
}

// The staff list, kept for five seconds; if the staff portal can't be reached the last copy is shown for up to a day.
let cache = null, pending = null;
async function people() {
  if (cache && Date.now() - cache.at < FRESH) return cache.data;
  if (!pending) pending = (async () => {
    try {
      const r = await backend('people-public');
      if (!r.ok) throw new Error('Staff list unavailable');
      const data = await r.json();
      if (!Array.isArray(data.people) || !Array.isArray(data.companies)) throw new Error('Staff list unavailable');
      cache = { at: Date.now(), data: { companies: data.companies, people: data.people, positions: Array.isArray(data.positions) ? data.positions : [], updatedAt: new Date().toISOString() } };
    } catch (e) {
      if (!cache || Date.now() - cache.at > 24 * 3600 * 1000) throw e;
    } finally { pending = null; }
    return cache.data;
  })();
  return pending;
}

const photos = new Map();
async function photo(id) {
  const hit = photos.get(id);
  if (hit && Date.now() - hit.at < PHOTO_FRESH) return hit;
  const r = await backend('people-avatar', { id });
  const type = r.headers.get('content-type') || '';
  if (!r.ok || !/^image\/(png|jpeg|webp|gif)$/.test(type)) { photos.set(id, { at: Date.now(), none: true }); return photos.get(id); }
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 5 * 1024 * 1024) return { none: true };
  if (photos.size > 500) photos.delete(photos.keys().next().value);
  photos.set(id, { at: Date.now(), type, buf });
  return photos.get(id);
}

function file(res, rel, code) {
  const full = path.join(PUBLIC, rel);
  if (!full.startsWith(PUBLIC + path.sep)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  fs.readFile(full, (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    const ext = path.extname(full);
    send(res, code || 200, buf, MIME[ext] || 'application/octet-stream', { 'Cache-Control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=3600' });
  });
}

// Pages are drawn by people.js from /api/people; every page address serves the same shell.
const PAGE = /^\/(|org|org\/[a-z0-9-]{1,40}|people\/[a-f0-9]{16})$/;

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, 'Bad request', 'text/plain; charset=utf-8'); }
  const route = url.pathname.replace(/\/+$/, '') || '/';
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
  try {
    if (route === '/healthz') return json(res, 200, { ok: true });
    if (route === '/api/people') return json(res, 200, await people());
    const m = /^\/api\/people\/([a-f0-9]{16})\/photo$/.exec(route);
    if (m) {
      const p = await photo(m[1]).catch(() => ({ none: true }));
      if (p.none) return json(res, 404, { error: 'No picture.' });
      return send(res, 200, p.buf, p.type, { 'Cache-Control': 'public, max-age=600' });
    }
    if (route.startsWith('/assets/')) return file(res, route.slice(1));
    if (route === '/robots.txt') return file(res, 'robots.txt');
    if (PAGE.test(route === '/' ? '/' : route)) return file(res, 'index.html');
    return file(res, '404.html', 404);
  } catch {
    if (route.startsWith('/api/')) return json(res, 503, { error: 'The staff list is temporarily unavailable. Please try again shortly.' });
    return send(res, 500, 'Something went wrong', 'text/plain; charset=utf-8');
  }
});

if (require.main === module) server.listen(PORT, HOST, () => console.log('HN Group People on ' + HOST + ':' + PORT));
module.exports = { server };
