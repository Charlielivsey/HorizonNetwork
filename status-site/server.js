'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createAuth, STATUS_ORIGIN } = require('./auth');
const auth = createAuth();
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });
const file = path.join(DATA, 'status.json');
let db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {
  services: [
    { id: crypto.randomUUID(), name: 'HN Group website', url: 'https://hngroup.org.uk', override: 'auto', checks: [], days: {} },
    { id: crypto.randomUUID(), name: 'Staff portal', url: 'https://staff.hngroup.org.uk', override: 'auto', checks: [], days: {} }
  ], incidents: []
};
const states = ['operational', 'degraded', 'outage', 'maintenance'];
function save() { fs.writeFileSync(file + '.tmp', JSON.stringify(db), { mode: 0o600 }); fs.renameSync(file + '.tmp', file); }
function effective(s) {
  if (s.override !== 'auto') return s.override;
  const last = s.checks.at(-1);
  if (!last || Date.now() - Date.parse(last.at) > 180000) return 'unknown';
  return last.ok ? 'operational' : 'outage';
}
function snapshot() {
  return { updatedAt: new Date().toISOString(), services: db.services.map(s => ({
    id: s.id, name: s.name, status: effective(s), lastChecked: s.checks.at(-1)?.at || null,
    latency: s.checks.at(-1)?.latency ?? null,
    uptime: Object.values(s.days).reduce((a, d) => a + d.total, 0) ?
      100 * Object.values(s.days).reduce((a, d) => a + d.ok, 0) / Object.values(s.days).reduce((a, d) => a + d.total, 0) : null,
    days: s.days
  })), incidents: db.incidents };
}
let checking = false;
async function checkAll() {
  if (checking) return;
  checking = true;
  try {
    await Promise.all(db.services.map(async s => {
      if (!s.url) return;
      const start = Date.now(); let ok = false;
      try { const r = await fetch(s.url, { signal: AbortSignal.timeout(10000), redirect: 'follow', headers: { 'User-Agent': 'HN-Status/1.0' } }); ok = r.ok; if (r.body) await r.body.cancel(); } catch {}
      if (!db.services.includes(s)) return;
      const at = new Date().toISOString(), day = at.slice(0, 10);
      s.checks.push({ at, ok, latency: Date.now() - start });
      s.checks = s.checks.slice(-90);
      s.days[day] ||= { total: 0, ok: 0 };
      s.days[day].total++; if (ok) s.days[day].ok++;
      const cutoff = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      for (const key of Object.keys(s.days)) if (key < cutoff) delete s.days[key];
    })); save();
  } finally { checking = false; }
}
async function body(req) {
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > 32768) throw new Error('Request too large'); }
  return JSON.parse(data || '{}');
}
function str(v, max, required = true) {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim())) throw new Error('Invalid text');
  return v.trim();
}
function url(v) {
  if (!v) return '';
  const u = new URL(str(v, 2048));
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('Use an HTTP or HTTPS address without credentials');
  return u.href;
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const route = new URL(req.url, 'http://localhost').pathname;
  const send = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  try {
    if (await auth.handle(req, res, route)) return;
    if (route === '/healthz' && req.method === 'GET') return send(200, { ok: true });
    if (route === '/api/status' && req.method === 'GET') return send(200, snapshot());
    if (['/api/account','/api/account/avatar'].includes(route) && req.method === 'GET') {
      let user;
      try { user = await auth.authorize(req); } catch (e) { return send(e.status || 503, { error: e.message }); }
      if (!user) return send(401, { error: 'Sign in through HN Group Auth.' });
      if (route.endsWith('/avatar')) return await auth.avatar(req, res);
      return send(200, { user: { ...user, avatarUrl: user.avatarUrl ? '/api/account/avatar' : null } });
    }
    if (route.startsWith('/api/admin')) {
      let user;
      try { user = await auth.authorize(req); } catch (e) { return send(e.status || 503, { error: e.message }); }
      if (!user) return send(401, { error: 'Sign in through HN Group Auth to manage status.' });
      if (req.method === 'POST' && (req.headers.origin !== STATUS_ORIGIN || !(req.headers['content-type'] || '').startsWith('application/json'))) return send(403, { error: 'Request origin or content type not allowed.' });
      if (route === '/api/admin' && req.method === 'GET') return send(200, { ...db, user: { ...user, avatarUrl: user.avatarUrl ? '/api/account/avatar' : null } });
      if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });
      const b = await body(req);
      if (route === '/api/admin/service') {
        const name = str(b.name, 100), address = url(b.url), override = b.override;
        if (!['auto', ...states].includes(override)) throw new Error('Invalid status');
        if (override === 'auto' && !address) throw new Error('Automatic checks need a URL');
        if (b.id) {
          const s = db.services.find(s => s.id === b.id); if (!s) return send(404, { error: 'Service not found' });
          if (s.url !== address) { s.checks = []; s.days = {}; }
          Object.assign(s, { name, url: address, override });
        } else {
          if (db.services.length >= 50) throw new Error('Maximum 50 services');
          db.services.push({ id: crypto.randomUUID(), name, url: address, override, checks: [], days: {} });
        }
      } else if (route === '/api/admin/delete-service') {
        db.services = db.services.filter(s => s.id !== b.id);
      } else if (route === '/api/admin/incident') {
        const title = str(b.title, 160), message = str(b.message, 4000);
        if (!['investigating', 'identified', 'monitoring', 'resolved', 'scheduled'].includes(b.status)) throw new Error('Invalid incident status');
        if (!Array.isArray(b.serviceIds) || b.serviceIds.some(id => !db.services.some(s => s.id === id))) throw new Error('Invalid affected services');
        const at = new Date().toISOString();
        if (b.id) {
          const incident = db.incidents.find(i => i.id === b.id); if (!incident) return send(404, { error: 'Incident not found' });
          Object.assign(incident, { title, status: b.status, serviceIds: b.serviceIds });
          incident.updates.unshift({ at, message, status: b.status });
        } else db.incidents.unshift({ id: crypto.randomUUID(), title, status: b.status, serviceIds: b.serviceIds, createdAt: at, updates: [{ at, message, status: b.status }] });
      } else return send(404, { error: 'Not found' });
      save(); send(200, { ok: true }); void checkAll(); return;
    }
    const assets = { '/': 'index.html', '/admin': 'admin.html', '/admin/denied': 'denied.html', '/app.js': 'app.js', '/style.css': 'style.css', '/assets/favicon.svg': 'assets/favicon.svg', '/assets/brand/hn-group-wordmark.svg': 'assets/brand/hn-group-wordmark.svg', '/assets/brand/hn-group-wordmark-white.svg': 'assets/brand/hn-group-wordmark-white.svg', '/assets/fonts/plus-jakarta-sans.woff2': 'assets/fonts/plus-jakarta-sans.woff2' };
    if (!assets[route] || req.method !== 'GET') return send(404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': route.endsWith('.js') ? 'text/javascript' : route.endsWith('.css') ? 'text/css' : route.endsWith('.svg') ? 'image/svg+xml' : route.endsWith('.woff2') ? 'font/woff2' : 'text/html', 'Cache-Control': route === '/admin' ? 'no-store' : 'no-cache' });
    res.end(fs.readFileSync(path.join(__dirname, 'public', assets[route])));
  } catch (e) { send(400, { error: e.message }); }
});
if (require.main === module) {
  server.listen(Number(process.env.PORT || 3300), process.env.HOST || '127.0.0.1', () => { void checkAll(); });
  setInterval(() => void checkAll(), 60000).unref();
}
module.exports = { server, checkAll, snapshot };
