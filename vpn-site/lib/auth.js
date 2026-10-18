'use strict';
// Sign-in through HN Group Auth (auth.hngroup.org.uk), where the VPN is registered as the "vpn"
// application with the fixed callback https://vpn.hngroup.org.uk/auth/callback. Every enabled staff
// account that has finished its password and PIN setup may use the VPN.
//
// The website keeps a browser-session cookie tied to the Auth sign-in (rechecked every minute).
// The Mac app signs in the same way in the browser: it starts with /auth/login?app=<challenge>, and
// after Auth the browser hands a one-time code back to the app (hngroupvpn://signed-in?code=…),
// which the app swaps, with the secret behind its challenge, for its own token (/api/app/exchange).
const fs = require('node:fs');
const crypto = require('node:crypto');

const AUTH_ORIGIN = process.env.AUTH_ORIGIN || 'https://auth.hngroup.org.uk';
const AUTH_BACKEND = process.env.AUTH_BACKEND || 'http://127.0.0.1:3400';
const VPN_ORIGIN = process.env.VPN_ORIGIN || 'https://vpn.hngroup.org.uk';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const SECURE = VPN_ORIGIN.startsWith('https://');
const SESSION_COOKIE = (SECURE ? '__Host-' : '') + 'hn_vpn_session';
const STATE_COOKIE = (SECURE ? '__Host-' : '') + 'hn_vpn_state';
const APP_SCHEME = 'hngroupvpn://signed-in';
const HEX = /^[a-f0-9]{64}$/;
const appCodes = new Map(); // hash(code) -> { token, challenge, expires }
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });

function cookie(req, name) {
  return (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(name + '='))?.slice(name.length + 1) || '';
}
function setCookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly;${SECURE ? ' Secure;' : ''} SameSite=Lax${maxAge === undefined ? '' : '; Max-Age=' + maxAge}`;
}

async function authApi(endpoint, data) {
  let secret;
  try { secret = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch { throw fail(503, 'Sign-in isn’t set up on this server yet (HN Group Auth integration missing).'); }
  if (!HEX.test(secret)) throw fail(503, 'Sign-in isn’t configured on this server.');
  let response;
  try {
    response = await fetch(AUTH_BACKEND + '/api/sso/' + endpoint, {
      method: 'POST', headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, client_id: 'vpn' }), signal: AbortSignal.timeout(5000), redirect: 'error',
    });
  } catch { throw fail(503, 'HN Group Auth is unavailable. Please try again shortly.'); }
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw fail(response.status === 403 ? 403 : response.status === 401 ? 401 : 503, value.error || 'Your sign-in couldn’t be checked.');
  if (!HEX.test(value.session || '') || !value.user) throw fail(503, 'Invalid response from HN Group Auth.');
  return value;
}

// Keeps the VPN's copy of the person's staff profile picture up to date (see store.setAvatar).
async function refreshAvatar(store, user, session, hasPicture) {
  if (!hasPicture) { store.setAvatar(user.id, null); return; }
  try {
    const secret = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    const response = await fetch(AUTH_BACKEND + '/api/sso/avatar', {
      method: 'POST', headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, client_id: 'vpn' }), signal: AbortSignal.timeout(5000), redirect: 'error',
    });
    if (response.status === 404) { store.setAvatar(user.id, null); return; }
    if (!response.ok) return;
    store.setAvatar(user.id, Buffer.from(await response.arrayBuffer()), response.headers.get('content-type'));
  } catch { /* keep the copy we have */ }
}

const userOf = (u) => ({ id: String(u.id || ''), email: String(u.email || '').toLowerCase(), displayName: String(u.displayName || u.email || 'Staff member'), admin: u.ownerAccess === true || u.statusAdminAllowed === true });

function createAuth(store) {
  // The signed-in staff member for this request: the Mac app's bearer token, or the website's cookie.
  async function current(req) {
    const bearer = (String(req.headers.authorization || '').match(/^Bearer ([a-f0-9]{64})$/) || [])[1];
    if (bearer) { const s = store.session(bearer); return s ? { user: s.user, token: bearer } : null; }
    const token = cookie(req, SESSION_COOKIE);
    const s = token && store.session(token);
    if (!s) return null;
    // Changes from the website must come from the website itself.
    if (req.method !== 'GET' && req.headers.origin !== VPN_ORIGIN) throw fail(403, 'That request didn’t come from the VPN website.');
    if (s.authSession && Date.now() - (s.checked || 0) > 60000) {
      try {
        const r = await authApi('session', { session: s.authSession }); s.user = userOf(r.user); s.checked = Date.now();
        if (Date.now() - (s.avatarChecked || 0) > 10 * 60000) { s.avatarChecked = Date.now(); await refreshAvatar(store, s.user, s.authSession, !!r.user.avatarUrl); }
      }
      catch (e) { if ([401, 403].includes(e.status)) { store.endSession(token); return null; } throw e; }
    }
    return { user: s.user, token, cookie: true };
  }

  function redirect(res, location, cookies) {
    res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', 'Set-Cookie': cookies || [] });
    res.end();
  }

  // /auth/login, /auth/callback and /auth/logout, plus the Mac app's code exchange.
  async function handle(req, res, url, showPage) {
    if (url.pathname === '/auth/login' && req.method === 'GET') {
      const state = crypto.randomBytes(32).toString('hex');
      const app = url.searchParams.get('app') || '';
      if (app && !HEX.test(app)) { showPage(res, 400, 'Sign-in failed', 'The app’s sign-in request wasn’t valid. Start again from the app.'); return true; }
      redirect(res, AUTH_ORIGIN + '/authorize?client_id=vpn&state=' + state, [setCookie(STATE_COOKIE, state + '.' + (app || 'web'), 600)]);
      return true;
    }
    if (url.pathname === '/auth/callback' && req.method === 'GET') {
      const [expected, app] = cookie(req, STATE_COOKIE).split('.');
      const state = url.searchParams.get('state') || '';
      const clear = setCookie(STATE_COOKIE, '', 0);
      if (!HEX.test(state) || !HEX.test(expected || '') || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected))) {
        showPage(res, 400, 'Sign-in expired', 'That sign-in has expired or was started in another browser. Please try again.', [clear]); return true;
      }
      if (url.searchParams.get('error')) { showPage(res, 403, 'Staff only', 'This account can’t use the HN Group VPN.', [clear]); return true; }
      if (!HEX.test(url.searchParams.get('code') || '')) { showPage(res, 400, 'Sign-in failed', 'The sign-in code was missing or invalid.', [clear]); return true; }
      let result;
      try { result = await authApi('exchange', { code: url.searchParams.get('code'), state }); }
      catch (e) { showPage(res, e.status === 403 ? 403 : 503, 'Sign-in failed', e.message, [clear]); return true; }
      const user = userOf(result.user);
      await refreshAvatar(store, user, result.session, !!result.user.avatarUrl);
      if (app && HEX.test(app)) {
        // The Mac app gets its own long-lived token; the browser only carries a short one-time code.
        const token = store.createSession(user, { app: true });
        for (const [k, v] of appCodes) if (v.expires <= Date.now()) appCodes.delete(k);
        if (appCodes.size > 5000) { showPage(res, 503, 'Please try again', 'Please try signing in again shortly.', [clear]); return true; }
        const code = crypto.randomBytes(32).toString('hex');
        appCodes.set(hash(code), { token, challenge: app, expires: Date.now() + 3 * 60000 });
        showPage(res, 200, 'You’re signed in', 'Return to the HN Group VPN app to finish. If it doesn’t open by itself, use the button below.', [clear], APP_SCHEME + '?code=' + code);
        return true;
      }
      const old = cookie(req, SESSION_COOKIE); if (old) store.endSession(old);
      const token = store.createSession(user, { authSession: result.session, expires: Number(result.expires) || 0 });
      redirect(res, '/', [clear, setCookie(SESSION_COOKIE, token)]);
      return true;
    }
    if (url.pathname === '/auth/logout' && req.method === 'POST') {
      if (req.headers.origin === VPN_ORIGIN) store.endSession(cookie(req, SESSION_COOKIE));
      redirect(res, '/', [setCookie(SESSION_COOKIE, '', 0)]);
      return true;
    }
    return false;
  }

  // The Mac app swaps its one-time code (and the secret behind its challenge) for its token.
  function exchangeAppCode(code, verifier) {
    const key = hash(String(code || '')), entry = appCodes.get(key);
    appCodes.delete(key);
    if (!entry || entry.expires <= Date.now() || !HEX.test(String(verifier || '')) || hash(String(verifier)) !== entry.challenge) {
      if (entry) store.endSession(entry.token);
      throw fail(401, 'That sign-in has expired. Sign in again from the app.');
    }
    const s = store.session(entry.token);
    if (!s) throw fail(401, 'That sign-in has expired. Sign in again from the app.');
    return { token: entry.token, user: s.user };
  }

  return { current, handle, exchangeAppCode, SESSION_COOKIE, VPN_ORIGIN, AUTH_ORIGIN };
}

module.exports = { createAuth };
