'use strict';
// HN Group service websites. Shared source, installed separately per website with its own config,
// data directory, loopback port, PM2 process, nginx host and certificate.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { fail, json, cookie } = require('./lib/http');
const { createStore } = require('./lib/store');
const { createAuth } = require('./lib/auth');
const accounts = require('./lib/accounts');
const items = require('./lib/items');
const builder = require('./lib/builder');
const forum = require('./lib/forum');
const slots = require('./lib/slots');
const monitor = require('./lib/monitor');
const sign = require('./lib/sign');
const bridge = require('./lib/bridge');

const config = JSON.parse(fs.readFileSync(process.env.SITE_CONFIG || path.join(__dirname, 'config.json'), 'utf8'));
if (!/^[a-z]{2,20}$/.test(config.id) || !Array.isArray(config.modules)) throw new Error('Invalid website configuration.');
const PUBLIC = path.join(__dirname, 'public');
const store = createStore(process.env.DATA_DIR || '/var/lib/hn-' + config.id);
const auth = createAuth(config);
const modules = new Map(config.modules.map(m => [m.key, m]));

// Seed content is added once; anything later edited or deleted by staff is never restored.
store.change(d => {
  for (const m of config.modules) for (const seed of m.seed || []) {
    const key = m.key + ':' + seed.id;
    if (d.seeded[key]) continue;
    d.seeded[key] = true;
    const seedId = require('node:crypto').createHash('sha256').update(key).digest('hex').slice(0, 24);
    if (m.type === 'status') (d.items[m.key] ||= []).push({ id: seedId, name: seed.name, group: seed.group || '', url: seed.url || '', override: 'auto' });
    else (d.items[m.key] ||= []).push({ id: seedId, fields: seed.fields, status: seed.status || m.initial || 'open', published: seed.published !== false, visibility: seed.visibility || 'public', createdBy: { type: 'staff', id: 'seed', name: config.seedAuthor || 'HN Group' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), parentId: null, files: [], comments: [], history: [{ at: new Date().toISOString(), by: 'Installer', action: 'seeded' }] });
  }
});
for (const m of config.modules) {
  if (m.type === 'status') monitor.startStatus(store, m);
  if (m.type === 'health') monitor.startHealth(m);
}

function publicConfig(ctx) {
  return {
    id: config.id, domain: config.domain, name: config.name, company: config.company, logo: config.logo, brand: config.brand, hero: config.hero, sections: config.sections || [], notices: config.notices || [],
    providers: config.providers || {}, accounts: config.accounts ? { mode: config.accounts.mode, label: config.accounts.label, guidelines: config.accounts.guidelines || '' } : null,
    staffOnly: !!config.staffOnly, related: config.related || [], footer: config.footer, privacy: config.privacy || null, brandkit: config.brandkit || null, tools: config.tools || null,
    modules: config.modules.map(({ seed, targets, ...m }) => m)
  };
}

async function context(req, res, url) {
  const ctx = { req, res, url, method: req.method, config, store, auth, staff: null, admin: false, account: null };
  if (cookie(req, `__Host-hn_${config.id}_session`)) {
    try { ctx.staff = await auth.authorize(req); } catch (e) { if (url.pathname.startsWith('/api/')) throw e; }
    ctx.admin = !!ctx.staff?.statusAdminAllowed;
    if (ctx.staff) remember(ctx.staff);
  }
  ctx.account = accounts.current(ctx);
  return ctx;
}
// Staff who use this website can be chosen as assignees; only id and name are kept.
function remember(user) {
  const uid = String(user.id || user.email);
  const known = store.data.users.find(u => u.id === uid);
  if (known && known.name === user.displayName && Date.parse(known.lastSeen) > Date.now() - 3600000) return;
  store.change(d => {
    const u = d.users.find(x => x.id === uid);
    if (u) Object.assign(u, { name: user.displayName, lastSeen: new Date().toISOString() });
    else d.users.push({ id: uid, name: user.displayName, lastSeen: new Date().toISOString() });
  });
}

const mime = { '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
function page(res, head = false) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  if (head) return res.end();
  res.end(fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8').replaceAll('{{TITLE}}', config.name).replaceAll('{{DESCRIPTION}}', (config.hero?.lead || '').replace(/[<>"&]/g, '')).replaceAll('{{THEME}}', config.company === 'network' ? 'network' : 'group'));
}
function securityTxt(res) {
  const expires = new Date(Date.now() + 180 * 86400000).toISOString();
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Contact: https://${config.domain}/#/m/${config.securityTxt.module}\nExpires: ${expires}\nPreferred-Languages: en\nCanonical: https://${config.domain}/.well-known/security.txt\nPolicy: https://${config.domain}/\n`);
}

async function api(ctx, parts) {
  const [area, key, ...rest] = parts;
  if (area === 'site' && ctx.method === 'GET') return json(ctx.res, 200, { site: publicConfig(ctx), staff: ctx.staff ? { name: ctx.staff.displayName, email: ctx.staff.email, jobTitle: ctx.staff.jobTitle || '', admin: ctx.admin, avatar: !!ctx.staff.avatarUrl } : null, account: ctx.account ? accounts.safe(ctx.account) : null });
  if (area === 'avatar' && ctx.method === 'GET') return auth.avatar(ctx.req, ctx.res);
  if (area === 'account') return accounts.route(ctx, [key, ...rest].filter(Boolean));
  if (area === 'ref' && ctx.method === 'POST') return items.reference(ctx, key || 'view');
  if (area === 'users' && ctx.method === 'GET') { if (!ctx.staff) throw fail(401, 'Sign in with HN Group Auth.'); return json(ctx.res, 200, { users: store.data.users.map(u => ({ id: u.id, name: u.name })) }); }
  if (area === 'audit' && ctx.method === 'GET') { if (!ctx.admin) throw fail(403, 'Only administrators can read the activity log.'); return json(ctx.res, 200, { audit: store.data.audit.slice(-300).reverse() }); }
  const m = modules.get(key);
  if (!m) throw fail(404, 'Not found.');
  if (area === 'm' && m.type === 'items') return items.route(ctx, m, rest);
  if (area === 'b' && m.type === 'builder') return builder.route(ctx, m, rest);
  if (area === 'forum' && m.type === 'forum') return forum.route(ctx, m, rest);
  if (area === 'slots' && m.slots && ctx.method === 'GET') return slots.route(ctx, m, rest);
  if (area === 'status' && m.type === 'status') return monitor.statusRoute(ctx, m, rest);
  if (area === 'health' && m.type === 'health') return monitor.healthRoute(ctx, m);
  if (area === 'sign' && m.type === 'sign') return sign.route(ctx, m, rest);
  if (area === 'bridge' && m.type === 'bridge') return bridge.route(ctx, m, rest);
  throw fail(404, 'Not found.');
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url = new URL(req.url, 'https://' + config.domain);
    const route = url.pathname;
    if (route === '/healthz') return json(res, 200, { ok: true, site: config.id });
    if (await auth.handle(req, res, route)) return;
    if (route === '/.well-known/security.txt' && config.securityTxt) return securityTxt(res);
    if (route.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      const ctx = await context(req, res, url);
      return await api(ctx, route.slice(5).split('/').filter(Boolean));
    }
    if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, 'Method not allowed.');
    if (['/', '/admin', '/admin/denied'].includes(route)) { res.setHeader('Cache-Control', 'no-store'); return page(res, req.method === 'HEAD'); }
    let decoded; try { decoded = decodeURIComponent(route); } catch { throw fail(404, 'Not found.'); }
    const target = path.resolve(PUBLIC, '.' + decoded);
    if (!target.startsWith(PUBLIC + path.sep) || decoded.split('/').some(s => s.startsWith('.')) || !mime[path.extname(target)] || !fs.existsSync(target) || !fs.statSync(target).isFile()) throw fail(404, 'Not found.');
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)], 'Cache-Control': route.startsWith('/assets/') ? 'public, max-age=3600' : 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).on('error', () => res.destroy()).pipe(res);
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'The request could not be completed.' });
    else res.destroy();
  }
});
server.requestTimeout = 60000;
server.headersTimeout = 15000;
if (require.main === module) server.listen(Number(process.env.PORT || config.port), '127.0.0.1');
module.exports = { server, store };
