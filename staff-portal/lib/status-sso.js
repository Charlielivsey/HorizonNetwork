'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const STATUS_ORIGIN = 'https://status.hngroup.org.uk';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const HEX = /^[a-f0-9]{64}$/;

// Role membership is deliberately narrower than system.admin permission.
function allowed(session, store) {
  if (!session || session.data.impersonatorId || !session.person.account?.enabled) return false;
  if (store.maintenance().on && !store.isOwner(session.person)) return false;
  return store.isOwner(session.person) || (!session.person.system && (session.person.roleIds || []).some(id => {
    const role = store.getRole(id);
    return role?.name.toLowerCase() === 'super admin';
  }));
}
function loginNext(value) {
  return typeof value === 'string' && /^\/status-admin\/authorize\?state=[a-f0-9]{64}$/.test(value) ? value : null;
}
function createStatusSso({ store, sessions, sendJson, redirect, readJsonBody, logEvent }) {
  const codes = new Map();
  function current(token) {
    const data = sessions.get(token);
    if (!data || data.expires <= Date.now()) return null;
    const person = store.getPerson(data.personId);
    return person ? { token, data, person } : null;
  }
  function credentials(req) {
    let secret;
    try { secret = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch { return false; }
    const supplied = (req.headers.authorization || '').replace(/^Bearer /, '');
    return HEX.test(secret) && HEX.test(supplied) && supplied.length === secret.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
  }
  return async function handle(req, res, pathname, session) {
    if (pathname === '/status-admin/authorize') {
      if (req.method !== 'GET') { sendJson(res, 405, { error: 'Method not allowed.' }); return true; }
      const state = new URL(req.url, 'http://localhost').searchParams.get('state');
      if (!HEX.test(state || '')) { sendJson(res, 400, { error: 'Invalid sign-in request.' }); return true; }
      if (!session) { redirect(res, '/login?next=' + encodeURIComponent('/status-admin/authorize?state=' + state)); return true; }
      if (!allowed(session, store)) {
        logEvent(req, session, 'status-admin-denied');
        redirect(res, `${STATUS_ORIGIN}/auth/callback?error=access_denied&state=${state}`); return true;
      }
      for (const [code, grant] of codes) if (grant.expires <= Date.now()) codes.delete(code);
      if (codes.size >= 1000) { sendJson(res, 503, { error: 'Please try signing in again shortly.' }); return true; }
      const code = crypto.randomBytes(32).toString('hex');
      codes.set(code, { token: session.token, state, expires: Date.now() + 60000 });
      logEvent(req, session, 'status-admin-sign-in');
      redirect(res, `${STATUS_ORIGIN}/auth/callback?code=${code}&state=${state}`); return true;
    }
    if (!['/api/status-sso/exchange', '/api/status-sso/session'].includes(pathname)) return false;
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed.' }); return true; }
    if (!credentials(req)) { sendJson(res, 401, { error: 'Status integration not authenticated.' }); return true; }
    const body = await readJsonBody(req);
    let token = body.session;
    if (pathname.endsWith('/exchange')) {
      const grant = codes.get(body.code);
      // Failed exchanges also consume the code, preventing repeated guesses/replays.
      codes.delete(body.code);
      if (!grant || grant.expires <= Date.now() || grant.state !== body.state) {
        sendJson(res, 401, { error: 'Sign-in link expired or already used.' }); return true;
      }
      token = grant.token;
    }
    const active = HEX.test(token || '') ? current(token) : null;
    if (!active) { sendJson(res, 401, { error: 'Staff sign-in expired. Please sign in again.' }); return true; }
    if (!allowed(active, store)) { sendJson(res, 403, { error: 'Only the system owner and Super Admin members can manage status.' }); return true; }
    sendJson(res, 200, { session: token, expires: active.data.expires, user: { id: active.person.id, displayName: active.person.displayName } });
    return true;
  };
}
module.exports = { createStatusSso, allowed, loginNext };
