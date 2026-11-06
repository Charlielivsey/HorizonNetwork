'use strict';
// HN Group Auth's fixed "mail" client (mail.hngroup.org.uk). HN Mail now uses HN Group's own mail server (the user's
// request, 6 November 2026: "A linked Google account or Google consent must no longer be required"): any HN Group Auth
// account may sign in, and HN Mail then opens only the mailboxes of that account's staff records (identity recordIds)
// and the shared mailboxes they're members of. Checked again at least every 30 seconds; never while someone is logged
// in as someone else. The browser cookie points to a private server-side session.
const fs = require('node:fs');
const crypto = require('node:crypto');

const AUTH_ORIGIN = process.env.AUTH_ORIGIN || 'https://auth.hngroup.org.uk';
const AUTH_BACKEND = process.env.AUTH_BACKEND || 'http://127.0.0.1:3400';
const ORIGIN = process.env.MAIL_ORIGIN || 'https://mail.hngroup.org.uk';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const SECURE = ORIGIN.startsWith('https://');
const SESSION_COOKIE = (SECURE ? '__Host-' : '') + 'hn_mail_session';
const STATE_COOKIE = (SECURE ? '__Host-' : '') + 'hn_mail_state';
const HEX = /^[a-f0-9]{64}$/;
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

function cookie(req, name) { return (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(name + '='))?.slice(name.length + 1) || ''; }
function setCookie(name, value, maxAge) { return `${name}=${value}; Path=/; HttpOnly;${SECURE ? ' Secure;' : ''} SameSite=Lax${maxAge === undefined ? '' : '; Max-Age=' + maxAge}`; }
const permitted = (u) => !!u && u.impersonated !== true;
function userOf(u) {
  return { id: u.id, accountId: u.accountId || u.id, username: u.username, email: u.email, displayName: u.displayName,
    firstName: u.firstName, lastName: u.lastName, company: u.company, jobTitle: u.jobTitle, impersonated: u.impersonated === true,
    // The staff records behind this account: HN Mail opens exactly their mailboxes (and their shared mailboxes).
    recordIds: Array.isArray(u.recordIds) ? u.recordIds.filter((x) => typeof x === 'string').slice(0, 20) : [] };
}
const safeNext = (next) => (typeof next === 'string' && /^\/[A-Za-z0-9/_?=&.%#-]{0,300}$/.test(next) && !next.startsWith('//') ? next : '/');

function secret() {
  let value;
  try { value = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch { throw fail(503, 'Sign-in isn’t set up on this server yet (HN Group Auth integration missing).'); }
  if (!HEX.test(value)) throw fail(503, 'Sign-in isn’t configured on this server.');
  return value;
}
async function authApi(endpoint, data) {
  let response;
  try {
    response = await fetch(AUTH_BACKEND + '/api/sso/' + endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + secret(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, client_id: 'mail' }), signal: AbortSignal.timeout(5000), redirect: 'error' });
  } catch (e) { if (e.status) throw e; throw fail(503, 'HN Group Auth is unavailable. Please try again shortly.'); }
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw fail(response.status === 403 ? 403 : response.status === 401 ? 401 : 503, value.error || 'Your sign-in couldn’t be checked.');
  if (!HEX.test(value.session || '') || !value.user) throw fail(503, 'Invalid response from HN Group Auth.');
  return value;
}

const NO_GOOGLE = 'HN Mail can’t be opened with this HN Group Auth account (it can’t be used while you’re logged in as someone else).';

function createAuth(store) {
  async function current(req) {
    const token = cookie(req, SESSION_COOKIE), s = token && store.session(token);
    if (!s) return null;
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== ORIGIN) throw fail(403, 'That request didn’t come from HN Mail.');
    // Auth is asked again at most every 30 seconds, so permissions and the linked Google account stay current without
    // slowing every message down.
    if (!s.checked || Date.now() - s.checked > 30000) {
      try { const r = await authApi('session', { session: s.authSession }); store.updateSession(token, { user: userOf(r.user), checked: Date.now(), ...(r.expires > Date.now() ? { expires: Math.min(r.expires, Date.now() + 30 * 86400000) } : {}) }); }
      catch (e) { if ([401, 403].includes(e.status)) { store.endSession(token); if (e.status === 403) throw fail(403, e.message || NO_GOOGLE, 'no-google'); return null; } throw e; }
    }
    const now = store.session(token);
    if (!now) return null;
    if (now.user.impersonated) throw fail(403, 'HN Mail can’t be used while you’re logged in as someone else.');
    if (!permitted(now.user)) throw fail(403, NO_GOOGLE, 'no-google');
    return { user: now.user, token, authSession: now.authSession };
  }
  function redirect(res, location, cookies) { res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', 'Set-Cookie': cookies || [] }); res.end(); }
  async function handle(req, res, url, showPage) {
    if (url.pathname === '/auth/login' && req.method === 'GET') {
      const state = crypto.randomBytes(32).toString('hex'), next = Buffer.from(safeNext(url.searchParams.get('next'))).toString('base64url');
      redirect(res, AUTH_ORIGIN + '/authorize?client_id=mail&state=' + state, [setCookie(STATE_COOKIE, state + '.' + next, 600)]);
      return true;
    }
    if (url.pathname === '/auth/callback' && req.method === 'GET') {
      const [expected, nextRaw] = cookie(req, STATE_COOKIE).split('.'), state = url.searchParams.get('state') || '', clear = setCookie(STATE_COOKIE, '', 0);
      if (!HEX.test(state) || !HEX.test(expected || '') || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected))) { showPage(res, 400, 'Sign-in expired', 'That sign-in has expired or was started in another browser. Please try again.', [clear]); return true; }
      if (url.searchParams.get('error')) { showPage(res, 403, 'HN Mail isn’t available', NO_GOOGLE, [clear], true); return true; }
      if (!HEX.test(url.searchParams.get('code') || '')) { showPage(res, 400, 'Sign-in failed', 'The sign-in code was missing or invalid.', [clear]); return true; }
      let result;
      try { result = await authApi('exchange', { code: url.searchParams.get('code'), state }); }
      catch (e) { showPage(res, e.status === 403 ? 403 : 503, e.status === 403 ? 'HN Mail isn’t available' : 'Sign-in failed', e.status === 403 ? NO_GOOGLE : e.message, [clear], e.status === 403); return true; }
      if (result.user.impersonated) { showPage(res, 403, 'Not while logged in as someone else', 'HN Mail can’t be used while you’re logged in as someone else.', [clear]); return true; }
      if (!permitted(result.user)) { showPage(res, 403, 'HN Mail isn’t available', NO_GOOGLE, [clear], true); return true; }
      const old = cookie(req, SESSION_COOKIE); if (old) store.endSession(old);
      const token = store.createSession(userOf(result.user), result.session, result.expires);
      store.updateSession(token, { fresh: true }); // the first page load after signing in opens HN Mail
      let next = '/'; try { next = safeNext(Buffer.from(nextRaw || '', 'base64url').toString('utf8')); } catch {}
      redirect(res, next, [clear, setCookie(SESSION_COOKIE, token, 30 * 86400)]);
      return true;
    }
    if (url.pathname === '/auth/logout' && req.method === 'POST') {
      if (req.headers.origin !== ORIGIN) throw fail(403, 'Request origin not allowed.');
      store.endSession(cookie(req, SESSION_COOKIE));
      redirect(res, '/signed-out', [setCookie(SESSION_COOKIE, '', 0)]);
      return true;
    }
    return false;
  }
  // The signed-in person's own profile picture from HN Group Auth: {type, bytes} or null.
  async function ownPicture(authSession) {
    try {
      const r = await fetch(AUTH_BACKEND + '/api/sso/avatar', { method: 'POST', headers: { Authorization: 'Bearer ' + secret(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: authSession, client_id: 'mail' }), signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!r.ok) return null;
      const type = r.headers.get('content-type') || '';
      if (!/^image\/(png|jpeg|gif|webp)$/.test(type)) return null;
      return { type, bytes: Buffer.from(await r.arrayBuffer()) };
    } catch { return null; }
  }
  return { current, handle, ownPicture, ORIGIN };
}
module.exports = { createAuth, safeNext, permitted, NO_GOOGLE };
