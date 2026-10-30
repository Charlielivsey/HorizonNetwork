'use strict';
// The private Company Register (the user's request, 30 October 2026: a second register "completely separate from the
// main ones", on private.companies.hngroup.org.uk, signed in through HN Group Auth). The same register code runs a
// second time with its own data folder and COMPANIES_PRIVATE=1, which turns this on:
//  - every page needs an HN Group Auth sign-in (Auth's `private-companies` client; any enabled HN Group account);
//  - the signed-in account is the register's customer (an account is made and linked the first time), so anyone
//    signed in can read the register, request documents and file changes for companies they manage;
//  - the system owner, owner-level accounts and Super Admin members (`statusAdminAllowed` / `ownerAccess`) are also
//    administrators of the staff area; nobody else is, and nobody is while logged in as someone else;
//  - the register's own passwords, customer sign-up and staff sign-in are switched off;
//  - its company feed answers only over loopback, for the private wiki, never through nginx.
// Sign-ins are kept with the register's data (hashed), so they survive restarts, and rechecked with Auth every minute.
const fs = require('node:fs');
const crypto = require('node:crypto');
const store = require('./store');
const saved = require('./sessions');

const ENABLED = process.env.COMPANIES_PRIVATE === '1';
const CLIENT = process.env.COMPANIES_AUTH_CLIENT || 'private-companies';
const AUTH_ORIGIN = process.env.AUTH_ORIGIN || 'https://auth.hngroup.org.uk';
const AUTH_BACKEND = process.env.AUTH_BACKEND || 'http://127.0.0.1:3400';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const ORIGIN = process.env.COMPANIES_ORIGIN || 'https://private.companies.hngroup.org.uk';
const SECURE = ORIGIN.startsWith('https://');
const COOKIE = (SECURE ? '__Host-' : '') + 'hn_private_register';
const STATE = (SECURE ? '__Host-' : '') + 'hn_private_register_state';
const HEX = /^[a-f0-9]{64}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });
const cookie = (req, name) => (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(name + '='))?.slice(name.length + 1) || '';
const setCookie = (name, value, maxAge) => `${name}=${value}; Path=/; HttpOnly;${SECURE ? ' Secure;' : ''} SameSite=Lax; Max-Age=${maxAge}`;
const safeNext = (v) => (typeof v === 'string' && /^\/(?!\/)[^\s\\]*$/.test(v) && !v.startsWith('/auth/') ? v : '/');

async function authApi(endpoint, data) {
  let secret;
  try { secret = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch { throw fail(503, 'Sign-in isn’t set up on this server yet (HN Group Auth integration missing).'); }
  if (!HEX.test(secret)) throw fail(503, 'Sign-in isn’t configured on this server.');
  let response;
  try {
    response = await fetch(AUTH_BACKEND + '/api/sso/' + endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, client_id: CLIENT }), signal: AbortSignal.timeout(5000), redirect: 'error' });
  } catch { throw fail(503, 'HN Group Auth is unavailable. Please try again shortly.'); }
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw fail([401, 403].includes(response.status) ? response.status : 503, value.error || 'Your sign-in couldn’t be checked.');
  if (!HEX.test(value.session || '') || !value.user) throw fail(503, 'Invalid response from HN Group Auth.');
  return value;
}

const who = (u) => ({ id: String(u.accountId || u.id || ''), profileId: String(u.id || ''), name: String(u.displayName || u.email || 'HN Group account').slice(0, 80),
  email: String(u.email || u.username || '').trim().toLowerCase(), admin: !!(u.statusAdminAllowed || u.ownerAccess) && !u.impersonated });

// The register customer for an HN Group account, made (or linked by email) the first time it signs in.
function customerFor(user) {
  let c = store.db.customers.find((x) => x.authAccount === user.id);
  if (!c && user.email) { c = store.customerByEmail(user.email); if (c && c.authAccount && c.authAccount !== user.id) c = null; }
  if (!c) {
    const salt = crypto.randomBytes(16).toString('hex');
    c = { id: crypto.randomBytes(12).toString('hex'), email: user.email || user.id + '@accounts.hngroup.org.uk', name: user.name, salt, hash: crypto.randomBytes(64).toString('hex'), createdAt: new Date().toISOString(), lastLoginAt: null, disabled: false };
    store.db.customers.push(c); store.audit('customer:' + c.email, 'customer.linked', 'HN Group Auth account');
  }
  if (c.authAccount !== user.id || c.name !== user.name) { c.authAccount = user.id; c.name = user.name; store.save(); }
  return c;
}
// The register staff account (administrator) for an owner-level or Super Admin account.
function staffFor(user) {
  const list = store.db.staff = store.db.staff || [];
  let s = list.find((x) => x.authAccount === user.id) || (user.email && list.find((x) => x.email === user.email));
  if (!s) {
    s = { id: crypto.randomBytes(12).toString('hex'), name: user.name, email: user.email || user.id + '@accounts.hngroup.org.uk', role: 'admin', salt: '00', hash: crypto.randomBytes(64).toString('hex'), mustChange: false, createdAt: new Date().toISOString(), lastLoginAt: null };
    list.push(s); store.audit('staff:' + s.email, 'staff.linked', 'HN Group Auth (owner-level or Super Admin)');
  }
  if (s.authAccount !== user.id || s.role !== 'admin' || s.mustChange || s.name !== user.name) { Object.assign(s, { authAccount: user.id, role: 'admin', mustChange: false, name: user.name }); store.save(); }
  return s;
}

// What this request's sign-in is, set by gate(): read by the customers/staff overrides below.
const signed = new WeakMap();
function install(customers, staff) {
  customers.current = (req) => {
    const w = signed.get(req); if (!w) return null;
    const c = customerFor(w.user); if (c.disabled) return null;
    return { account: c, csrf: w.csrf };
  };
  staff.current = (req) => {
    const w = signed.get(req); if (!w || !w.user.admin) return null;
    const s = staffFor(w.user);
    return { account: s, id: s.id, name: s.name, email: s.email, admin: true, mustChange: false, csrf: w.csrf };
  };
}

function redirect(res, location, cookies) { res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', 'Set-Cookie': cookies || [] }); res.end(); }
const isLoopback = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && !req.headers['x-real-ip'] && !req.headers['x-forwarded-for'];

// Runs before every other route. Returns true when it answered the request itself.
async function gate(req, res, url, p, showMessage) {
  if (p === '/api/public/companies') { if (isLoopback(req)) return false; showMessage(res, 404, 'Page not found', 'That page isn’t on the register.'); return true; }
  if (p === '/auth/login' && req.method === 'GET') {
    const state = crypto.randomBytes(32).toString('hex'), next = Buffer.from(safeNext(url.searchParams.get('next'))).toString('base64url');
    redirect(res, AUTH_ORIGIN + '/authorize?client_id=' + CLIENT + '&state=' + state, [setCookie(STATE, state + '.' + next, 600)]); return true;
  }
  if (p === '/auth/callback' && req.method === 'GET') {
    const [expected, nextRaw] = cookie(req, STATE).split('.'), state = url.searchParams.get('state') || '', clear = setCookie(STATE, '', 0);
    if (!HEX.test(state) || !HEX.test(expected || '') || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected))) { showMessage(res, 400, 'Sign-in expired', 'That sign-in has expired or was started in another browser. Please try again.', [clear], true); return true; }
    if (url.searchParams.get('error')) { showMessage(res, 403, 'Can’t sign in', 'This account can’t use the private register.', [clear], true); return true; }
    if (!HEX.test(url.searchParams.get('code') || '')) { showMessage(res, 400, 'Sign-in failed', 'The sign-in code was missing or invalid.', [clear], true); return true; }
    let result;
    try { result = await authApi('exchange', { code: url.searchParams.get('code'), state }); }
    catch (e) { showMessage(res, e.status === 403 ? 403 : 503, 'Sign-in failed', e.message, [clear], true); return true; }
    saved.remove(cookie(req, COOKIE));
    const user = who(result.user), raw = saved.create('auth', { authSession: result.session, user, checked: Date.now() });
    store.audit((user.admin ? 'staff:' : 'customer:') + user.email, 'auth.sign-in'); store.save();
    let next = '/'; try { next = safeNext(Buffer.from(nextRaw || '', 'base64url').toString('utf8')); } catch {}
    redirect(res, next, [clear, setCookie(COOKIE, raw, saved.COOKIE_AGE)]); return true;
  }
  if (p === '/signed-out' && req.method === 'GET') { showMessage(res, 200, 'You’re signed out', 'Sign in with your HN Group account to use the private register again.', [], true); return true; }
  const raw = cookie(req, COOKIE), entry = saved.get('auth', raw);
  if (p === '/auth/logout' || p === '/staff/logout' || p === '/account/logout') {
    if (req.method !== 'POST') { redirect(res, '/'); return true; }
    if (raw) saved.remove(raw);
    redirect(res, '/signed-out', [setCookie(COOKIE, '', 0)]); return true;
  }
  if (!entry) {
    if (req.method !== 'GET') { showMessage(res, 401, 'Sign in again', 'Your sign-in has ended. Sign in with your HN Group account and try again.', [], true); return true; }
    redirect(res, '/auth/login?next=' + encodeURIComponent(p + url.search)); return true;
  }
  const s = entry.user;
  if (Date.now() - (s.checked || 0) > 60000) {
    try { const r = await authApi('session', { session: s.authSession }); s.user = who(r.user); s.checked = Date.now(); store.save(); }
    catch (e) {
      if ([401, 403].includes(e.status)) { saved.remove(raw); redirect(res, '/auth/login?next=' + encodeURIComponent(p + url.search), [setCookie(COOKIE, '', 0)]); return true; }
      throw e;
    }
  }
  signed.set(req, { user: s.user, csrf: entry.csrf });
  if ((p === '/admin' || p.startsWith('/admin/')) && !s.user.admin) { showMessage(res, 403, 'Administrators only', 'The staff area of the private register is for the system owner, owner-level accounts and Super Admin members.'); return true; }
  // The register's own sign-in, sign-up and password pages don't apply here: access comes from HN Group Auth.
  if (p === '/staff/login') { redirect(res, s.user.admin ? '/admin' : '/'); return true; }
  if (p === '/account/login' || p === '/account/register' || p === '/account/settings') { redirect(res, '/account'); return true; }
  if (p === '/admin/password' || p.startsWith('/admin/staff')) {
    showMessage(res, 200, 'Access comes from HN Group Auth', 'On the private register, the system owner, owner-level accounts and Super Admin members are administrators automatically, and everyone else signs in with their own HN Group account. There are no register passwords to manage.');
    return true;
  }
  return false;
}

module.exports = { ENABLED, install, gate };
