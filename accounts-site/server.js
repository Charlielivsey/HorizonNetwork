'use strict';
// HN Account — accounts.hngroup.org.uk. Every member of staff manages their own HN account here (profile
// and photo, password, sign-in PIN, signed-in devices, and which HN Group websites they can use); the
// system owner and Super Admin members also manage staff accounts. Staff sign in through HN Group Auth
// as the registered "accounts" application. The site then holds its own staff session on the private
// staff account service (hn-accounts), which stays off the internet: the browser only ever talks to
// this site, and only a fixed list of account requests is passed on, so every change goes through the
// account service's own checks and permissions.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ORIGIN = process.env.ACCOUNTS_ORIGIN || 'https://accounts.hngroup.org.uk';
const AUTH_ORIGIN = process.env.AUTH_ORIGIN || 'https://auth.hngroup.org.uk';
const AUTH_BACKEND = process.env.AUTH_BACKEND || 'http://127.0.0.1:3400';
const STAFF_BACKEND = process.env.STAFF_BACKEND || 'http://127.0.0.1:3250';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const PUBLIC = process.env.ACCOUNTS_PUBLIC_DIR || path.join(__dirname, 'public');
const SECURE = ORIGIN.startsWith('https://');
const COOKIE = (SECURE ? '__Host-' : '') + 'hn_account', STATE = (SECURE ? '__Host-' : '') + 'hn_account_state';
const HEX = /^[a-f0-9]{64}$/;
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const sessions = new Map(); // our cookie token -> { staff (raw staff session token), user, csrf, expires }
const fail = (status, message) => Object.assign(new Error(message), { status });

// The account requests this site passes on. Admin requests also need owner-level access or Super Admin
// membership (as Auth reports it); the account service then applies its own permission checks too.
const ROUTES = [
  ['GET', /^\/api\/me$/], ['POST', /^\/api\/me\/profile$/], ['POST', /^\/api\/me\/password$/], ['POST', /^\/api\/me\/code$/],
  ['POST', /^\/api\/me\/avatar$/, 2.5 * 1024 * 1024], ['POST', /^\/api\/me\/avatar\/remove$/],
  ['GET', /^\/api\/me\/sessions$/], ['POST', /^\/api\/me\/sessions\/(?:[a-f0-9]{12}\/end|end-others)$/],
  ['GET', /^\/api\/avatars\/[a-f0-9]{16}$/],
  ['GET', /^\/api\/employees$/, 0, true], ['GET', /^\/api\/roles$/, 0, true],
  ['POST', /^\/api\/employees\/[a-f0-9]{16}\/(?:account|account\/disable|account\/enable|code\/reset)$/, 0, true],
  // Sign-in accounts (made and managed only here): their profiles, default profile and permissions.
  ['GET', /^\/api\/logins$/, 0, true], ['POST', /^\/api\/logins$/, 0, true],
  ['POST', /^\/api\/logins\/[a-f0-9]{16}(?:\/(?:reset|code\/reset|disable|enable|delete))?$/, 0, true],
];
const isAdmin = (u) => !!(u && (u.ownerAccess || u.statusAdminAllowed));

function secret() {
  let s; try { s = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch { throw fail(503, 'Sign-in isn’t set up on this server yet (HN Group Auth integration missing).'); }
  if (!HEX.test(s)) throw fail(503, 'Sign-in isn’t configured on this server.');
  return s;
}
async function service(base, endpoint, data) {
  let response;
  try {
    response = await fetch(base + endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + secret(), 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(8000), redirect: 'error' });
  } catch { throw fail(503, 'The account service is unavailable. Please try again shortly.'); }
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw fail(response.status === 403 ? 403 : response.status === 401 ? 401 : 503, value.error || 'Your sign-in couldn’t be completed.');
  return value;
}
const cookieOf = (req, name) => (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(name + '='))?.slice(name.length + 1) || '';
const setCookie = (name, value, maxAge) => `${name}=${value}; Path=/; HttpOnly;${SECURE ? ' Secure;' : ''} SameSite=Lax; Max-Age=${maxAge}`;
const clientIp = (req) => (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && req.headers['x-real-ip']) || req.socket.remoteAddress || '';
function current(req) {
  const token = cookieOf(req, COOKIE), s = HEX.test(token) && sessions.get(token);
  if (!s || s.expires <= Date.now()) { if (s) sessions.delete(token); return null; }
  return { token, ...s, entry: s };
}
const safeBack = (p) => (typeof p === 'string' && /^\/(?!\/)[^\s\\]*$/.test(p) && !p.startsWith('/auth/') && !p.startsWith('/api/') ? p : '/');

function send(res, status, body, headers) { res.writeHead(status, { 'Cache-Control': 'no-store', ...(headers || {}) }); res.end(body); }
function json(res, status, value, headers) { send(res, status, JSON.stringify(value), { 'Content-Type': 'application/json; charset=utf-8', ...(headers || {}) }); }
function redirect(res, location, cookies) { send(res, 302, '', { Location: location, 'Set-Cookie': cookies || [] }); }
function page(res, status, file, headers) {
  const html = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
  send(res, status, html, { 'Content-Type': 'text/html; charset=utf-8', ...(headers || {}) });
}
function messagePage(res, status, title, text, cookies) {
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const html = fs.readFileSync(path.join(PUBLIC, 'message.html'), 'utf8').replace('{{title}}', esc(title)).replace('{{title}}', esc(title)).replace('{{text}}', esc(text));
  send(res, status, html, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': cookies || [] });
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(fail(413, 'That’s too large to send.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Passes one allowed account request to the account service as the signed-in person.
async function relay(req, res, s, route) {
  const [method, , limit, admin] = route;
  if (admin && !isAdmin(s.user)) return json(res, 403, { error: 'Only the system owner and Super Admin members can manage staff accounts.' });
  const body = method === 'POST' ? await readBody(req, limit || 64 * 1024) : null;
  let upstream;
  try {
    upstream = await fetch(STAFF_BACKEND + req.url, {
      method, body, redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { Cookie: 'hn_staff_session=' + s.staff, 'X-Real-IP': clientIp(req), 'User-Agent': String(req.headers['user-agent'] || 'HN Account').slice(0, 300), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch { return json(res, 503, { error: 'The account service is unavailable. Please try again shortly.' }); }
  // The staff session has ended (signed out elsewhere, password changed, account disabled): so has this one.
  if (upstream.status === 401) { sessions.delete(s.token); return json(res, 401, { error: 'Your sign-in has ended. Please sign in again.' }, { 'Set-Cookie': setCookie(COOKIE, '', 0) }); }
  const type = upstream.headers.get('content-type') || 'application/json';
  if (!/^(application\/json|image\/(png|jpeg|webp|gif))/.test(type)) return json(res, 502, { error: 'Unexpected response from the account service.' });
  s.entry.expires = Math.max(s.entry.expires, Date.now() + 30 * 60000);
  send(res, upstream.status, Buffer.from(await upstream.arrayBuffer()), { 'Content-Type': type, ...(type.startsWith('image/') ? { 'Cache-Control': 'private, max-age=300' } : {}) });
}

async function handle(req, res) {
  const url = new URL(req.url, ORIGIN), route = url.pathname;
  if (route === '/healthz') return json(res, 200, { ok: true });

  if (route === '/auth/login' && req.method === 'GET') {
    const state = crypto.randomBytes(32).toString('hex');
    return redirect(res, AUTH_ORIGIN + '/authorize?client_id=accounts&state=' + state, [setCookie(STATE, state + '.' + Buffer.from(safeBack(url.searchParams.get('return'))).toString('base64url'), 600)]);
  }
  if (route === '/auth/callback' && req.method === 'GET') {
    const [expected, back] = cookieOf(req, STATE).split('.'), state = url.searchParams.get('state') || '', clear = setCookie(STATE, '', 0);
    if (!HEX.test(state) || !HEX.test(expected || '') || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected))) return messagePage(res, 400, 'Sign-in expired', 'That sign-in link has expired or was started in another browser. Please try again.', [clear]);
    if (url.searchParams.get('error') || !HEX.test(url.searchParams.get('code') || '')) return messagePage(res, 403, 'Sign-in failed', 'HN Group Auth didn’t complete the sign-in. Please try again.', [clear]);
    try {
      const auth = await service(AUTH_BACKEND, '/api/sso/exchange', { client_id: 'accounts', code: url.searchParams.get('code'), state });
      if (!HEX.test(auth.staffSession || '')) throw fail(503, 'HN Group Auth didn’t hand over the sign-in.');
      const result = await service(STAFF_BACKEND, '/api/auth/accounts-session', { session: auth.staffSession, ip: clientIp(req), userAgent: String(req.headers['user-agent'] || '') });
      if (!HEX.test(result.token || '')) throw fail(503, 'The account service didn’t start a session.');
      for (const [k, v] of sessions) if (v.expires <= Date.now()) sessions.delete(k);
      if (sessions.size > 5000) throw fail(503, 'Please try again shortly.');
      const old = cookieOf(req, COOKIE); if (old) sessions.delete(old);
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, { staff: result.token, user: result.user, csrf: crypto.randomBytes(24).toString('hex'), expires: Date.now() + 12 * 3600000 });
      return redirect(res, safeBack(Buffer.from(back || '', 'base64url').toString()), [clear, setCookie(COOKIE, token, 12 * 3600)]);
    } catch (e) { return messagePage(res, e.status === 403 ? 403 : 503, 'Sign-in failed', e.message, [clear]); }
  }
  if (route === '/auth/logout' && req.method === 'POST') {
    const s = current(req), form = new URLSearchParams((await readBody(req, 4096)).toString());
    if (s && form.get('csrf') === s.csrf) {
      sessions.delete(s.token);
      fetch(STAFF_BACKEND + '/api/logout', { method: 'POST', headers: { Cookie: 'hn_staff_session=' + s.staff, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000) }).catch(() => {});
    }
    return redirect(res, '/?signed-out=1', [setCookie(COOKIE, '', 0)]);
  }

  if (req.method === 'GET' && (route.startsWith('/assets/') || route === '/robots.txt')) {
    const file = path.normalize(path.join(PUBLIC, route));
    if ((file.startsWith(path.join(PUBLIC, 'assets') + path.sep) || route === '/robots.txt') && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
      return fs.createReadStream(file).pipe(res);
    }
    return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  if (route.startsWith('/api/')) {
    const s = current(req);
    if (!s) return json(res, 401, { error: 'Please sign in.' });
    if (route === '/api/session' && req.method === 'GET') return json(res, 200, { user: s.user, csrf: s.csrf, admin: isAdmin(s.user) });
    // Changes must come from this site's own pages.
    if (req.method !== 'GET' && (req.headers.origin !== ORIGIN || req.headers['x-csrf-token'] !== s.csrf)) return json(res, 403, { error: 'This request didn’t come from HN Account. Reload the page and try again.' });
    const found = ROUTES.find(([m, re]) => m === req.method && re.test(route));
    if (!found) return json(res, 404, { error: 'Not found.' });
    return relay(req, res, s, found);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '');
  const s = current(req);
  if (route === '/' || route === '/index.html') return page(res, 200, s ? 'app.html' : 'index.html');
  return messagePage(res, 404, 'Not found', 'That page isn’t part of HN Account.');
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self' " + AUTH_ORIGIN + "; frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  try { await handle(req, res); } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) (req.url.startsWith('/api/') ? json(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong.' }) : messagePage(res, e.status || 500, 'Something went wrong', e.status ? e.message : 'HN Account couldn’t complete that request. Please try again.'));
    else res.destroy();
  }
});

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 5300;
  server.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log('HN Account on ' + PORT));
}
module.exports = { server };
