'use strict';
// "Sign in with Google" for HN Group Auth (the user's request, 27 October 2026). Optional for each person: once
// they've turned it on (signed in here with their password and PIN, then "Turn on" under Sign in with Google), the
// "Continue with Google" button replaces their email and password. The six-digit PIN is still asked every time, and a
// Google sign-in never makes the browser remember the account (no "Welcome back" resume; the user's request).
//
// Google is only used to confirm who someone is. Auth runs the authorization-code flow with PKCE, a state bound to
// this browser by a cookie and a nonce, and reads the ID token it gets straight back from Google's token endpoint
// (over TLS, so no signature check is needed): issuer, audience, expiry, nonce and a verified email. The staff
// account service decides which account that Google account is connected to (by Google's permanent id), and only lets
// someone connect a Google account that has one of their own email addresses.
//
// Set-up (owner): create a Google Cloud OAuth client of type "Web application" with the authorised redirect URI
// https://auth.hngroup.org.uk/google/callback, and save {"client_id":"…","client_secret":"…"} as
// /var/lib/hn-auth/google-oauth.json (root only). It's read when needed, so no restart; without it the option is hidden.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const GOOGLE_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const BINDING = '__Host-hn_auth_google', TICKET = '__Host-hn_auth_google_result';

function createGoogle({ origin, staff, send, profile, entryFor, setCookie, cookie, challenges, destination, random, hash, fail, fetcher = fetch,
  file = process.env.GOOGLE_OAUTH_FILE || path.join(process.env.DATA_DIR || '/var/lib/hn-auth', 'google-oauth.json') }) {
  const REDIRECT = origin + '/google/callback';
  const pending = new Map(), results = new Map();
  // Sign-ins that were never finished are tidied away.
  setInterval(() => { for (const map of [pending, results]) for (const [k, v] of map) if (v.expires <= Date.now()) map.delete(k); }, 60000).unref();
  let cached = null;
  // The OAuth client, or null when Sign in with Google isn't set up.
  function config() {
    let stat; try { stat = fs.statSync(file); } catch { return null; }
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.value;
    let value = null;
    try {
      const v = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (/^[\w.-]+\.apps\.googleusercontent\.com$/.test(v.client_id || '') && typeof v.client_secret === 'string' && v.client_secret.length >= 8) value = { id: v.client_id, secret: v.client_secret };
    } catch {}
    cached = { mtimeMs: stat.mtimeMs, value };
    return value;
  }
  // Where to come back to: Auth's own page, or an application sign-in that Auth recognises.
  function safeNext(next) {
    if (typeof next !== 'string' || next.length > 4096 || !next.startsWith('/') || next.startsWith('//')) return '/';
    if (next === '/' || /^\/\?[^#]*$/.test(next)) return '/';
    try { const url = new URL(next, origin); if (url.origin === origin && url.pathname === '/authorize' && destination(url)) return url.pathname + url.search; } catch {}
    return '/';
  }
  const back = (next) => next + (next.includes('?') ? '&' : '?') + 'google=1';
  function finish(res, next, result) {
    const token = random(); results.set(hash(token), { ...result, expires: Date.now() + 5 * 60000 });
    res.writeHead(302, { Location: back(next), 'Cache-Control': 'no-store', 'Set-Cookie': [setCookie(BINDING, '', 0), setCookie(TICKET, token, 300)] });
    res.end();
  }
  // Google's answer about who signed in, from the token endpoint.
  async function identity(code, record, client) {
    let response;
    try {
      response = await fetcher(GOOGLE_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ code, client_id: client.id, client_secret: client.secret, redirect_uri: REDIRECT, grant_type: 'authorization_code', code_verifier: record.verifier }).toString(),
        signal: AbortSignal.timeout(10000), redirect: 'error' });
    } catch { throw fail(503, 'Google couldn’t be reached. Please try again.'); }
    const value = await response.json().catch(() => ({}));
    if (!response.ok || typeof value.id_token !== 'string') throw fail(401, 'Google didn’t confirm the sign-in. Please try again.');
    let claims;
    try { claims = JSON.parse(Buffer.from(value.id_token.split('.')[1], 'base64url').toString('utf8')); } catch { throw fail(401, 'Google’s answer couldn’t be read. Please try again.'); }
    const now = Date.now() / 1000;
    if (!ISSUERS.includes(claims.iss) || claims.aud !== client.id || !(claims.exp > now) || !(claims.iat < now + 300) || claims.nonce !== record.nonce) throw fail(401, 'Google’s answer didn’t check out, so you weren’t signed in.');
    if (claims.email_verified !== true && claims.email_verified !== 'true') throw fail(403, 'Your Google account’s email address isn’t verified.');
    if (typeof claims.sub !== 'string' || !/^[0-9A-Za-z_-]{1,255}$/.test(claims.sub) || typeof claims.email !== 'string') throw fail(401, 'Google’s answer didn’t check out, so you weren’t signed in.');
    return { sub: claims.sub, email: claims.email.toLowerCase() };
  }
  // Handles Auth's Google routes. Returns true when it answered.
  return async function google(req, res, route, data) {
    // Whether the option is shown at all.
    if (route === '/api/google' && req.method === 'GET') { send(res, 200, { enabled: !!config() }); return true; }
    // Starts a Google sign-in (mode "login") or turning it on for the signed-in person (mode "link").
    if (route === '/api/google/start') {
      const client = config(); if (!client) throw fail(404, 'Sign in with Google isn’t set up yet.');
      const mode = data.mode === 'link' ? 'link' : 'login', record = { mode, next: safeNext(data.next), verifier: random(), nonce: random(), expires: Date.now() + 10 * 60000 };
      if (mode === 'link') {
        const entry = entryFor(req), user = await profile(entry);
        if (user.passwordChangeRequired || user.codeSetupRequired) throw fail(403, 'Finish setting up your account first.');
        record.staffSession = entry.staffSession; record.email = user.email;
      }
      if (pending.size >= 10000) throw fail(503, 'Please try again shortly.');
      const binding = random(), state = random(); record.state = state;
      pending.set(hash(binding), record);
      const url = new URL(GOOGLE_AUTHORIZE);
      for (const [k, v] of Object.entries({ client_id: client.id, redirect_uri: REDIRECT, response_type: 'code', scope: 'openid email profile', state, nonce: record.nonce,
        code_challenge: crypto.createHash('sha256').update(record.verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account', ...(record.email ? { login_hint: record.email } : {}) })) url.searchParams.set(k, v);
      send(res, 200, { url: url.href }, [setCookie(BINDING, binding, 600)]); return true;
    }
    // Google sends the person back here.
    if (route === '/google/callback' && req.method === 'GET') {
      const url = new URL(req.url, origin), key = hash(cookie(req, BINDING)), record = pending.get(key);
      pending.delete(key);
      if (!record || record.expires <= Date.now() || record.state !== url.searchParams.get('state')) { finish(res, '/', { error: 'That Google sign-in expired. Please try again.' }); return true; }
      if (url.searchParams.get('error') || !url.searchParams.get('code')) { finish(res, record.next, { error: url.searchParams.get('error') === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google didn’t finish signing you in. Please try again.' }); return true; }
      try {
        const client = config(); if (!client) throw fail(404, 'Sign in with Google isn’t set up.');
        const who = await identity(url.searchParams.get('code'), record, client);
        if (record.mode === 'link') {
          await staff('/api/auth/google-link', { session: record.staffSession, sub: who.sub, email: who.email });
          finish(res, record.next, { linked: who.email });
        } else {
          const { value } = await staff('/api/auth/google-login', { sub: who.sub, email: who.email }, req);
          if (!value.codeRequired || !value.challenge) throw fail(403, 'Sign in with your email and password.');
          finish(res, record.next, { challenge: value.challenge, email: who.email });
        }
      } catch (e) { finish(res, record.next, { error: e.status ? e.message : 'Sign in with Google is unavailable right now. Please try again shortly.' }); }
      return true;
    }
    // The page asks what happened once it's back (the redirect itself is a page load, which ends Auth sessions).
    if (route === '/api/google/result') {
      const key = hash(cookie(req, TICKET)), result = results.get(key); results.delete(key);
      const clear = [setCookie(TICKET, '', 0)];
      if (!result || result.expires <= Date.now()) { send(res, 200, { none: true }, clear); return true; }
      if (result.error) { send(res, 200, { error: result.error }, clear); return true; }
      if (result.linked) { send(res, 200, { linked: result.linked }, clear); return true; }
      if (challenges.size >= 10000) throw fail(503, 'Please try again shortly.');
      const flow = random(); challenges.set(hash(flow), { challenge: result.challenge, expires: Date.now() + 5 * 60000, google: true });
      send(res, 200, { codeRequired: true, email: result.email }, [...clear, setCookie('__Host-hn_auth_flow', flow, 300)]); return true;
    }
    // Turning it off.
    if (route === '/api/google/unlink') {
      const entry = entryFor(req); await profile(entry);
      await staff('/api/auth/google-unlink', { session: entry.staffSession }, req);
      send(res, 200, { user: await profile(entry) }); return true;
    }
    return false;
  };
}
module.exports = { createGoogle, BINDING, TICKET };
