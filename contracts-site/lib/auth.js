'use strict';
// Sign-in through HN Group Auth (auth.hngroup.org.uk), where this site is the registered "contracts" application with
// the fixed callback https://contract.hngroup.org.uk/auth/callback. Every enabled sign-in account can sign in, to read
// and sign what it has been sent. Sending needs the staff portal's "Send contracts for signing" permission: HN Group
// Auth passes every permission the account has with each check (at least once a minute), the same as every other
// HN Group website. The site keeps a browser-session cookie tied to the Auth sign-in.
const fs = require('node:fs');
const crypto = require('node:crypto');

const AUTH_ORIGIN = process.env.AUTH_ORIGIN || 'https://auth.hngroup.org.uk';
const AUTH_BACKEND = process.env.AUTH_BACKEND || 'http://127.0.0.1:3400';
const ORIGIN = process.env.CONTRACTS_ORIGIN || 'https://contract.hngroup.org.uk';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const SECURE = ORIGIN.startsWith('https://');
const SESSION_COOKIE = (SECURE ? '__Host-' : '') + 'hn_contracts_session';
const STATE_COOKIE = (SECURE ? '__Host-' : '') + 'hn_contracts_state';
const HEX = /^[a-f0-9]{64}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });

function cookie(req, name) { return (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(name + '='))?.slice(name.length + 1) || ''; }
function setCookie(name, value, maxAge) { return `${name}=${value}; Path=/; HttpOnly;${SECURE ? ' Secure;' : ''} SameSite=Lax${maxAge === undefined ? '' : '; Max-Age=' + maxAge}`; }
// Who is signed in: the profile they chose, their sign-in account (so they can sign from any of its profiles), their
// permissions, and whether an administrator is logged in as them.
function userOf(u) {
  const full = [u.firstName, u.lastName].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
  return { id: String(u.id || ''), accountId: String(u.accountId || ''), email: String(u.email || '').toLowerCase(), displayName: String(u.displayName || u.email || 'Staff member'),
    fullName: full || String(u.displayName || ''), jobTitle: String(u.jobTitle || '').slice(0, 120), owner: u.ownerAccess === true, impersonated: u.impersonated === true,
    permissions: (Array.isArray(u.permissions) ? u.permissions : []).filter((k) => typeof k === 'string' && /^[a-z.]{1,40}$/.test(k)).slice(0, 100) };
}
// Where to go after signing in: only a path on this site.
const safeNext = (next) => (typeof next === 'string' && /^\/[A-Za-z0-9/_?=&.-]{0,200}$/.test(next) && !next.startsWith('//') ? next : '/');

async function authApi(endpoint, data) {
  let secret;
  try { secret = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch { throw fail(503, 'Sign-in isn’t set up on this server yet (HN Group Auth integration missing).'); }
  if (!HEX.test(secret)) throw fail(503, 'Sign-in isn’t configured on this server.');
  let response;
  try {
    response = await fetch(AUTH_BACKEND + '/api/sso/' + endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, client_id: 'contracts' }), signal: AbortSignal.timeout(5000), redirect: 'error' });
  } catch { throw fail(503, 'HN Group Auth is unavailable. Please try again shortly.'); }
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw fail(response.status === 403 ? 403 : response.status === 401 ? 401 : 503, value.error || 'Your sign-in couldn’t be checked.');
  if (!HEX.test(value.session || '') || !value.user) throw fail(503, 'Invalid response from HN Group Auth.');
  return value;
}

function createAuth(store) {
  async function current(req) {
    const token = cookie(req, SESSION_COOKIE), s = token && store.session(token);
    if (!s) return null;
    // Changes must come from this website itself.
    if (req.method !== 'GET' && req.headers.origin !== ORIGIN) throw fail(403, 'That request didn’t come from HN Group Contracts.');
    if (Date.now() - (s.checked || 0) > 60000) {
      try { const r = await authApi('session', { session: s.authSession }); store.updateSession(token, { user: userOf(r.user), checked: Date.now() }); }
      catch (e) { if ([401, 403].includes(e.status)) { store.endSession(token); return null; } throw e; }
    }
    return { user: store.session(token).user, token };
  }
  function redirect(res, location, cookies) { res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', 'Set-Cookie': cookies || [] }); res.end(); }
  async function handle(req, res, url, showPage) {
    if (url.pathname === '/auth/login' && req.method === 'GET') {
      const state = crypto.randomBytes(32).toString('hex'), next = Buffer.from(safeNext(url.searchParams.get('next'))).toString('base64url');
      redirect(res, AUTH_ORIGIN + '/authorize?client_id=contracts&state=' + state, [setCookie(STATE_COOKIE, state + '.' + next, 600)]);
      return true;
    }
    if (url.pathname === '/auth/callback' && req.method === 'GET') {
      const [expected, nextRaw] = cookie(req, STATE_COOKIE).split('.'), state = url.searchParams.get('state') || '', clear = setCookie(STATE_COOKIE, '', 0);
      if (!HEX.test(state) || !HEX.test(expected || '') || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected))) { showPage(res, 400, 'Sign-in expired', 'That sign-in has expired or was started in another browser. Please try again.', [clear]); return true; }
      if (url.searchParams.get('error')) { showPage(res, 403, 'Staff only', 'This account can’t use HN Group Contracts.', [clear]); return true; }
      if (!HEX.test(url.searchParams.get('code') || '')) { showPage(res, 400, 'Sign-in failed', 'The sign-in code was missing or invalid.', [clear]); return true; }
      let result;
      try { result = await authApi('exchange', { code: url.searchParams.get('code'), state }); }
      catch (e) { showPage(res, e.status === 403 ? 403 : 503, 'Sign-in failed', e.message, [clear]); return true; }
      const old = cookie(req, SESSION_COOKIE); if (old) store.endSession(old);
      const token = store.createSession(userOf(result.user), result.session, result.expires);
      let next = '/'; try { next = safeNext(Buffer.from(nextRaw || '', 'base64url').toString('utf8')); } catch {}
      redirect(res, next, [clear, setCookie(SESSION_COOKIE, token)]);
      return true;
    }
    if (url.pathname === '/auth/logout' && req.method === 'POST') {
      if (req.headers.origin === ORIGIN) store.endSession(cookie(req, SESSION_COOKIE));
      redirect(res, '/signed-out', [setCookie(SESSION_COOKIE, '', 0)]);
      return true;
    }
    return false;
  }
  return { current, handle, ORIGIN };
}
module.exports = { createAuth, safeNext };
