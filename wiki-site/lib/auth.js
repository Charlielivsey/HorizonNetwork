'use strict';
// Staff sign-in for editing, through HN Group Auth (auth.hngroup.org.uk), registered there as the
// "wiki" application with the fixed callback https://wiki.hngroup.org.uk/auth/callback. Any staff
// account can edit; the system owner and Super Admin members can also protect and delete pages.
// Reading the wiki needs no sign-in.
const fs = require('node:fs');
const crypto = require('node:crypto');

const AUTH_ORIGIN = process.env.AUTH_ORIGIN || 'https://auth.hngroup.org.uk';
const AUTH_BACKEND = process.env.AUTH_BACKEND || 'http://127.0.0.1:3400';
const WIKI_ORIGIN = process.env.WIKI_ORIGIN || 'https://wiki.hngroup.org.uk';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const SECURE = WIKI_ORIGIN.startsWith('https://');
// The private wiki (the user's request, 30 October 2026: private.wiki.hngroup.org.uk, separate from this wiki) runs
// the same code with WIKI_PRIVATE=1: everyone signs in through Auth's `private-wiki` client to read anything, only
// owner-level and Super Admin accounts edit, and sign-ins are saved (hashed) in WIKI_SESSIONS_FILE so they last
// 30 days and survive restarts.
const PRIVATE = process.env.WIKI_PRIVATE === '1';
const CLIENT = process.env.WIKI_AUTH_CLIENT || (PRIVATE ? 'private-wiki' : 'wiki');
const SESSIONS_FILE = process.env.WIKI_SESSIONS_FILE || '';
const SESSION_COOKIE = (SECURE ? '__Host-' : '') + (PRIVATE ? 'hn_private_wiki_session' : 'hn_wiki_session');
const STATE_COOKIE = (SECURE ? '__Host-' : '') + (PRIVATE ? 'hn_private_wiki_state' : 'hn_wiki_state');
const HEX = /^[a-f0-9]{64}$/;
const tokenKey = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const sessions = new Map(); // sha256(token) -> { authSession, user, checked, csrf, expires }
try { if (SESSIONS_FILE) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')))) if (v && v.expires > Date.now()) sessions.set(k, v); } catch {}
let saveTimer = null;
function persist() {
  if (!SESSIONS_FILE || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const out = {}; for (const [k, v] of sessions) if (v.expires > Date.now()) out[k] = v;
    try { fs.writeFileSync(SESSIONS_FILE + '.tmp', JSON.stringify(out), { mode: 0o600 }); fs.renameSync(SESSIONS_FILE + '.tmp', SESSIONS_FILE); } catch (e) { console.error('Could not save wiki sign-ins:', e.message); }
  }, 1000);
  saveTimer.unref?.();
}

function cookie(req, name) {
  return (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(name + '='))?.slice(name.length + 1) || '';
}
function setCookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly;${SECURE ? ' Secure;' : ''} SameSite=Lax${maxAge === undefined ? '' : '; Max-Age=' + maxAge}`;
}
const fail = (status, message) => Object.assign(new Error(message), { status });

async function authApi(endpoint, data) {
  let secret;
  try { secret = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch { throw fail(503, 'Editing isn’t set up on this server yet (HN Group Auth integration missing).'); }
  if (!HEX.test(secret)) throw fail(503, 'Editing isn’t configured on this server.');
  let response;
  try {
    response = await fetch(AUTH_BACKEND + '/api/sso/' + endpoint, {
      method: 'POST', headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, client_id: CLIENT }), signal: AbortSignal.timeout(5000), redirect: 'error',
    });
  } catch { throw fail(503, 'HN Group Auth is unavailable. Please try again shortly.'); }
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw fail(response.status === 403 ? 403 : response.status === 401 ? 401 : 503, value.error || 'Your sign-in couldn’t be checked.');
  if (!HEX.test(value.session || '') || !value.user) throw fail(503, 'Invalid response from HN Group Auth.');
  return value;
}

const userView = (u) => ({ name: String(u.displayName || u.name || 'Staff editor'), id: String(u.id || u.email || u.displayName || ''), admin: !!(u.statusAdminAllowed || (PRIVATE && u.ownerAccess)) && !(PRIVATE && u.impersonated) });

// The signed-in editor for this request, or null. The Auth session is rechecked at most once a
// minute for page views, and every time with { fresh: true } (used before saving).
// On the private wiki everyone signed in can read; current() gives only those who can edit (owner-level and
// Super Admin), and signedIn() anyone signed in.
async function signedIn(req, opts) {
  const token = cookie(req, SESSION_COOKIE), key = token && tokenKey(token);
  const entry = key && sessions.get(key);
  if (!entry || entry.expires <= Date.now()) { if (key && sessions.delete(key)) persist(); return null; }
  if (opts && opts.fresh || Date.now() - entry.checked > 60000) {
    try {
      const result = await authApi('session', { session: entry.authSession });
      entry.user = userView(result.user); entry.checked = Date.now();
      if (PRIVATE && Number(result.expires) > Date.now()) entry.expires = Math.min(Number(result.expires), Date.now() + 30 * 86400000);
      persist();
    } catch (e) {
      if ([401, 403].includes(e.status)) { sessions.delete(key); persist(); return null; }
      if (opts && opts.fresh) throw e;
    }
  }
  return { ...entry.user, csrf: entry.csrf };
}
async function current(req, opts) {
  const user = await signedIn(req, opts);
  return user && (!PRIVATE || user.admin) ? user : null;
}

function redirect(res, location, cookies) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', 'Set-Cookie': cookies || [] });
  res.end();
}
const safeReturn = (p) => (typeof p === 'string' && /^\/(wiki|w)\/[^\s\\]*$/.test(p) ? p : '/wiki/Main_Page');

// /auth/login, /auth/callback and /auth/logout. Returns true when it handled the request.
async function handle(req, res, url, showError) {
  if (url.pathname === '/auth/login' && req.method === 'GET') {
    const state = crypto.randomBytes(32).toString('hex');
    const back = safeReturn(url.searchParams.get('return'));
    redirect(res, AUTH_ORIGIN + '/authorize?client_id=' + CLIENT + '&state=' + state, [setCookie(STATE_COOKIE, state + '.' + Buffer.from(back).toString('base64url'), 600)]);
    return true;
  }
  if (url.pathname === '/auth/callback' && req.method === 'GET') {
    const [expected, backEncoded] = cookie(req, STATE_COOKIE).split('.');
    const state = url.searchParams.get('state') || '';
    const clear = setCookie(STATE_COOKIE, '', 0);
    if (!HEX.test(state) || !HEX.test(expected || '') || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected))) {
      showError(res, 400, 'Sign-in expired', 'That sign-in link has expired or was started in another browser. Please try again.', [clear]); return true;
    }
    const back = safeReturn(Buffer.from(backEncoded || '', 'base64url').toString());
    if (url.searchParams.get('error')) { showError(res, 403, PRIVATE ? 'Can’t sign in' : 'Can’t sign in to edit', PRIVATE ? 'This account can’t use the private wiki.' : 'This account isn’t allowed to edit the HN Group Wiki.', [clear]); return true; }
    if (!HEX.test(url.searchParams.get('code') || '')) { showError(res, 400, 'Sign-in failed', 'The sign-in code was missing or invalid.', [clear]); return true; }
    try {
      const result = await authApi('exchange', { code: url.searchParams.get('code'), state });
      for (const [k, v] of sessions) if (v.expires <= Date.now()) sessions.delete(k);
      if (sessions.size > 5000) throw fail(503, 'Please try again shortly.');
      const old = cookie(req, SESSION_COOKIE); if (old) sessions.delete(tokenKey(old));
      const token = crypto.randomBytes(32).toString('hex'), longest = PRIVATE ? 30 * 86400 * 1000 : 12 * 3600 * 1000;
      sessions.set(tokenKey(token), { authSession: result.session, user: userView(result.user), checked: Date.now(), csrf: crypto.randomBytes(24).toString('hex'), expires: Math.min(Number(result.expires) || 0, Date.now() + longest) || Date.now() + 3600 * 1000 });
      persist();
      redirect(res, back, [clear, setCookie(SESSION_COOKIE, token, PRIVATE ? 30 * 86400 : undefined)]);
    } catch (e) {
      showError(res, e.status === 403 ? 403 : 503, 'Sign-in failed', e.message, [clear]);
    }
    return true;
  }
  if (url.pathname === '/auth/logout' && req.method === 'POST') {
    sessions.delete(tokenKey(cookie(req, SESSION_COOKIE))); persist();
    redirect(res, PRIVATE ? '/signed-out' : '/wiki/Main_Page', [setCookie(SESSION_COOKIE, '', 0)]);
    return true;
  }
  return false;
}

module.exports = { current, signedIn, handle, WIKI_ORIGIN, PRIVATE };
