'use strict';
// Signing in to the portal through HN Group Auth (auth.hngroup.org.uk).
// /auth/start sends the browser to Auth with a one-time state; Auth sends it back to /auth/callback
// with a one-time code, which the portal exchanges server-to-server (with the shared service secret)
// for the signed-in person, then gives the browser a normal portal session.
// "Resume session" is unchanged: it stays on the portal's own sign-in page.
const crypto = require('node:crypto');
const fs = require('node:fs');

const AUTH_ORIGIN = 'https://auth.hngroup.org.uk';
const AUTH_BACKEND = process.env.AUTH_BACKEND || 'http://127.0.0.1:3400';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const STATE_COOKIE = 'hn_staff_auth_state';
const STATE_TTL_MS = 10 * 60 * 1000;
const HEX = /^[a-f0-9]{64}$/;

function readSecret() {
  try {
    const secret = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    return HEX.test(secret) ? secret : null;
  } catch { return null; }
}

// Auth sign-in is used whenever the shared secret is installed; otherwise the portal keeps its own form.
function enabled() { return !!readSecret(); }

function createPortalAuth({ store, sessions, resume, createSession, cookieFor, parseCookies, send, redirect, logEvent, loginNext, clientIp }) {
  const states = new Map(); // state -> { next, expires }

  function stateCookie(req, value, maxAge) {
    // Lax so the cookie comes back on the top-level redirect from auth.hngroup.org.uk.
    const parts = [`${STATE_COOKIE}=${value}`, 'Path=/auth/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
    if (req.headers['x-forwarded-proto'] === 'https') parts.push('Secure');
    return parts.join('; ');
  }

  function start(req, res, next) {
    for (const [s, v] of states) if (v.expires <= Date.now()) states.delete(s);
    if (states.size >= 10000) return send(res, 503, 'Please try again shortly.', { 'Content-Type': 'text/plain' });
    const state = crypto.randomBytes(32).toString('hex');
    states.set(state, { next: loginNext(next) || null, expires: Date.now() + STATE_TTL_MS });
    send(res, 302, '', {
      Location: `${AUTH_ORIGIN}/authorize?client_id=portal&state=${state}`,
      'Cache-Control': 'no-store',
      'Set-Cookie': stateCookie(req, state, STATE_TTL_MS / 1000),
    });
  }

  function back(req, res, query) {
    send(res, 302, '', { Location: '/login?' + query, 'Cache-Control': 'no-store', 'Set-Cookie': stateCookie(req, '', 0) });
  }

  async function callback(req, res, url) {
    const state = url.searchParams.get('state') || '';
    const pending = HEX.test(state) && states.get(state);
    states.delete(state);
    // The state must be one this portal issued, to this same browser, and not yet used.
    if (!pending || pending.expires <= Date.now() || parseCookies(req)[STATE_COOKIE] !== state) return back(req, res, 'auth_error=expired');
    if (url.searchParams.get('error')) return back(req, res, 'auth_error=denied');
    const code = url.searchParams.get('code') || '';
    const secret = readSecret();
    if (!HEX.test(code) || !secret) return back(req, res, 'auth_error=expired');

    let user, staffSession;
    try {
      const response = await fetch(AUTH_BACKEND + '/api/sso/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret },
        body: JSON.stringify({ client_id: 'portal', code, state }),
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return back(req, res, response.status === 403 ? 'auth_error=denied' : 'auth_error=expired');
      user = data.user;
      staffSession = data.staffSession;
    } catch {
      return back(req, res, 'auth_error=unavailable');
    }

    const person = user && store.getPerson(user.id);
    if (!person || !person.account || !person.account.enabled) return back(req, res, 'auth_error=denied');
    if (store.maintenance().on && !store.hasOwnerAccess(person)) return back(req, res, 'maintenance=1');

    // Auth checked the password and PIN through its own portal session; end it now the browser gets its own.
    const used = HEX.test(staffSession || '') && sessions.get(staffSession);
    if (used && used.personId === person.id) sessions.delete(staffSession);

    store.recordLogin(person);
    const token = createSession(person.id, req, { allowPageLoad: true });
    console.log(`${store.meView(person).username} signed in from ${clientIp(req)} (HN Group Auth)`);
    logEvent(req, null, 'signed-in', { actor: store.loginName(person), detail: 'HN Group Auth', ua: String(req.headers['user-agent'] || '').slice(0, 300) });
    const cookies = [cookieFor(req, token), stateCookie(req, '', 0)];
    // Remember this browser for "Resume session", exactly as a sign-in on the portal's own page does.
    if (store.hasCode(person)) cookies.push(resume.cookie(req, resume.issue(person.id, parseCookies(req)[resume.COOKIE], req.headers['user-agent'])));
    send(res, 302, '', { Location: pending.next || '/home', 'Cache-Control': 'no-store', 'Set-Cookie': cookies });
  }

  // Returns true when it handled the request.
  return async function handle(req, res, pathname) {
    if (pathname !== '/auth/start' && pathname !== '/auth/callback') return false;
    if (req.method !== 'GET') { send(res, 405, 'Method not allowed', { Allow: 'GET' }); return true; }
    const url = new URL(req.url, 'http://localhost');
    if (!enabled()) { redirect(res, '/login'); return true; }
    if (pathname === '/auth/start') start(req, res, url.searchParams.get('next'));
    else await callback(req, res, url);
    return true;
  };
}

module.exports = { createPortalAuth, enabled };
