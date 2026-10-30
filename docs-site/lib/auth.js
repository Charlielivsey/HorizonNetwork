'use strict';
// Sign-in through HN Group Auth (auth.hngroup.org.uk), where this site is the registered "docs" application
// with the fixed callback https://docs.hngroup.org.uk/auth/callback. Every enabled staff account that has
// finished its password and PIN setup can sign in; owner-level and Super Admin accounts can manage every shared document.
// The website keeps a browser-session cookie tied to the Auth sign-in, rechecked every minute.
const fs = require('node:fs');
const crypto = require('node:crypto');

const AUTH_ORIGIN = process.env.AUTH_ORIGIN || 'https://auth.hngroup.org.uk';
const AUTH_BACKEND = process.env.AUTH_BACKEND || 'http://127.0.0.1:3400';
const ORIGIN = process.env.DOCS_ORIGIN || 'https://docs.hngroup.org.uk';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const SECURE = ORIGIN.startsWith('https://');
const SESSION_COOKIE = (SECURE ? '__Host-' : '') + 'hn_docs_session';
const STATE_COOKIE = (SECURE ? '__Host-' : '') + 'hn_docs_state';
const HEX = /^[a-f0-9]{64}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });

function cookie(req, name) { return (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(name + '='))?.slice(name.length + 1) || ''; }
function setCookie(name, value, maxAge) { return `${name}=${value}; Path=/; HttpOnly;${SECURE ? ' Secure;' : ''} SameSite=Lax${maxAge === undefined ? '' : '; Max-Age=' + maxAge}`; }
// What this site keeps about the signed-in person. Names and job title fill in document sign-offs; storage access
// (the "Access staff document storage" permission, Super Admin or the system owner) and individual, timed grants
// to someone's storage are set in the staff portal and arrive with every Auth check (at least once a minute).
function userOf(u) {
  const full = [u.firstName, u.lastName].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
  const grants = (Array.isArray(u.storageGrants) ? u.storageGrants : []).filter((g) => g && typeof g.personId === 'string' && Date.parse(g.until) > Date.now())
    .slice(0, 200).map((g) => ({ personId: g.personId.slice(0, 64), name: String(g.name || '').slice(0, 120), until: String(g.until) }));
  return { id: String(u.id || ''), email: String(u.email || '').toLowerCase(), displayName: String(u.displayName || u.email || 'Staff member'), fullName: full || String(u.displayName || ''),
    jobTitle: String(u.jobTitle || '').slice(0, 120), picture: !!u.avatarUrl, admin: u.ownerAccess === true || u.statusAdminAllowed === true,
    storageAccess: u.storageAccess === true || u.ownerAccess === true || u.statusAdminAllowed === true, storageGrants: grants,
    // The staff portal permissions HN Group Auth passes to every website (for sending documents to HN Group Contracts).
    accountId: String(u.accountId || ''), owner: u.ownerAccess === true, impersonated: u.impersonated === true,
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
      body: JSON.stringify({ ...data, client_id: 'docs' }), signal: AbortSignal.timeout(5000), redirect: 'error' });
  } catch { throw fail(503, 'HN Group Auth is unavailable. Please try again shortly.'); }
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw fail(response.status === 403 ? 403 : response.status === 401 ? 401 : 503, value.error || 'Your sign-in couldn’t be checked.');
  if (!HEX.test(value.session || '') || !value.user) throw fail(503, 'Invalid response from HN Group Auth.');
  return value;
}

// Keeps this site's copy of the person's staff profile picture (from HN Group Auth) up to date.
async function refreshAvatar(store, user, session) {
  if (!user.picture) { store.setAvatar(user.id, null); return; }
  try {
    const secret = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    const response = await fetch(AUTH_BACKEND + '/api/sso/avatar', { method: 'POST', headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, client_id: 'docs' }), signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (response.status === 404) { store.setAvatar(user.id, null); return; }
    if (!response.ok) return;
    store.setAvatar(user.id, Buffer.from(await response.arrayBuffer()), response.headers.get('content-type'));
  } catch { /* keep the copy we have */ }
}

function createAuth(store) {
  async function current(req) {
    const token = cookie(req, SESSION_COOKIE), s = token && store.session(token);
    if (!s) return null;
    // Changes must come from this website itself.
    if (req.method !== 'GET' && req.headers.origin !== ORIGIN) throw fail(403, 'That request didn’t come from HN Group Docs.');
    if (Date.now() - (s.checked || 0) > 60000) {
      try {
        const r = await authApi('session', { session: s.authSession }), user = userOf(r.user);
        store.updateSession(token, { user, checked: Date.now(), ...(r.expires > Date.now() ? { expires: Math.min(r.expires, Date.now() + 30 * 86400000) } : {}) }); store.notePerson(user);
        if (Date.now() - (s.avatarChecked || 0) > 10 * 60000) { store.updateSession(token, { avatarChecked: Date.now() }); await refreshAvatar(store, user, s.authSession); }
      }
      catch (e) { if ([401, 403].includes(e.status)) { store.endSession(token); return null; } throw e; }
    }
    return { user: store.session(token).user, token };
  }
  function redirect(res, location, cookies) { res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', 'Set-Cookie': cookies || [] }); res.end(); }
  async function handle(req, res, url, showPage) {
    if (url.pathname === '/auth/login' && req.method === 'GET') {
      const state = crypto.randomBytes(32).toString('hex'), next = Buffer.from(safeNext(url.searchParams.get('next'))).toString('base64url');
      redirect(res, AUTH_ORIGIN + '/authorize?client_id=docs&state=' + state, [setCookie(STATE_COOKIE, state + '.' + next, 600)]);
      return true;
    }
    if (url.pathname === '/auth/callback' && req.method === 'GET') {
      const [expected, nextRaw] = cookie(req, STATE_COOKIE).split('.'), state = url.searchParams.get('state') || '', clear = setCookie(STATE_COOKIE, '', 0);
      if (!HEX.test(state) || !HEX.test(expected || '') || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected))) { showPage(res, 400, 'Sign-in expired', 'That sign-in has expired or was started in another browser. Please try again.', [clear]); return true; }
      if (url.searchParams.get('error')) { showPage(res, 403, 'Staff only', 'This account can’t use HN Group Docs.', [clear]); return true; }
      if (!HEX.test(url.searchParams.get('code') || '')) { showPage(res, 400, 'Sign-in failed', 'The sign-in code was missing or invalid.', [clear]); return true; }
      let result;
      try { result = await authApi('exchange', { code: url.searchParams.get('code'), state }); }
      catch (e) { showPage(res, e.status === 403 ? 403 : 503, 'Sign-in failed', e.message, [clear]); return true; }
      const old = cookie(req, SESSION_COOKIE); if (old) store.endSession(old);
      const user = userOf(result.user);
      const token = store.createSession(user, result.session, result.expires);
      store.notePerson(user);
      await refreshAvatar(store, user, result.session);
      let next = '/'; try { next = safeNext(Buffer.from(nextRaw || '', 'base64url').toString('utf8')); } catch {}
      redirect(res, next, [clear, setCookie(SESSION_COOKIE, token, 30 * 86400)]);
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
