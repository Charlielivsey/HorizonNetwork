'use strict';
const network = require('./network-leadership');
const crypto = require('node:crypto');
const fs = require('node:fs');
const STATUS_ORIGIN = 'https://status.hngroup.org.uk';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const HEX = /^[a-f0-9]{64}$/;

// Role membership is deliberately narrower than system.admin permission.
function allowed(session, store) {
  if (!session || session.data.impersonatorId || !session.person.account?.enabled || session.person.account.passwordTemporary || !store.hasCode(session.person)) return false;
  if (store.maintenance().on && !store.isOwner(session.person)) return false;
  return store.isOwner(session.person) || (!session.person.system && (session.person.roleIds || []).some(id => {
    const role = store.getRole(id);
    return role?.name.toLowerCase() === 'super admin';
  }));
}
// True for a request made by HN Group Auth itself, carrying the shared service secret.
function serviceRequest(req) {
  let secret;
  try { secret = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch { return false; }
  const supplied = (req.headers.authorization || '').replace(/^Bearer /, '');
  return HEX.test(secret) && HEX.test(supplied) && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}
function loginNext(value) {
  return typeof value === 'string' && /^\/status-admin\/authorize\?state=[a-f0-9]{64}$/.test(value) ? value : null;
}
// Service websites that show staff-portal records (so both stay in sync) may call only these routes,
// as the signed-in person; the portal's normal permission checks then apply unchanged.
const ID = '[a-f0-9]{16}';
const BRIDGE = {
  expenses: [['GET', '/api/expenses'], ['GET', '/api/expenses/mileage'], ['GET', `/api/expenses/${ID}/receipt`], ['POST', '/api/expenses'], ['POST', `/api/expenses/${ID}/(approve|reject|pay|cancel)`]],
  learn: [['GET', '/api/training'], ['POST', '/api/training'], ['POST', '/api/training/required'], ['POST', `/api/training/required/${ID}/delete`], ['GET', `/api/training/${ID}/certificate`], ['POST', `/api/training/${ID}/(verify|delete)`]],
  billing: [['GET', '/api/invoices'], ['POST', '/api/invoices'], ['POST', '/api/invoices/settings'], ['POST', `/api/invoices/${ID}`], ['POST', `/api/invoices/${ID}/(sent|paid|void|delete)`]],
  reports: [['GET', '/api/reports']],
  vault: [['GET', '/api/staff-files'], ['GET', `/api/staff-files/${ID}/file`], ['POST', '/api/staff-files/upload'], ['POST', `/api/staff-files/${ID}`], ['POST', `/api/staff-files/${ID}/delete`]],
  surveys: [['GET', '/api/polls'], ['POST', '/api/polls'], ['POST', `/api/polls/${ID}/(respond|close|reopen|delete)`]],
  feedback: [['GET', '/api/ideas'], ['POST', '/api/ideas'], ['POST', `/api/ideas/${ID}/(vote|comment|status|delete)`]],
  events: [['GET', '/api/calendar'], ['POST', '/api/events'], ['POST', `/api/events/${ID}`], ['POST', `/api/events/${ID}/delete`]],
  procurement: [['GET', '/api/bills'], ['POST', '/api/bills']],
  suppliers: [['GET', '/api/bills']],
};
const BRIDGE_QUERY = new Set(['month', 'person', 'from', 'to', 'download', 'date', 'miles']);
const UPLOAD_HEADERS = new Set(['x-claim', 'x-training', 'x-document']);
function bridgeAllowed(client, method, pathname) {
  return (BRIDGE[client] || []).some(([m, pattern]) => m === method && new RegExp('^' + pattern + '$').test(pathname));
}

function createStatusSso({ store, sessions, sendJson, redirect, readJsonBody, logEvent, handleChangePassword, handleSetCode, routeApi }) {
  const codes = new Map();
  function current(token) {
    const data = sessions.get(token);
    if (!data || data.expires <= Date.now()) return null;
    const person = store.getPerson(data.personId);
    return person ? { token, data, person } : null;
  }
  const credentials = serviceRequest;
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
    if (pathname === '/api/auth/bridge') {
      if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed.' }); return true; }
      if (!credentials(req) || typeof routeApi !== 'function') { sendJson(res, 401, { error: 'Integration not authenticated.' }); return true; }
      const data = await readJsonBody(req, 30 * 1024 * 1024);
      const active = HEX.test(data.session || '') ? current(data.session) : null;
      if (!active || !active.person.account?.enabled || active.data.impersonatorId) { sendJson(res, 401, { error: 'Staff sign-in expired. Please sign in again.' }); return true; }
      const method = data.method === 'POST' ? 'POST' : data.method === 'GET' ? 'GET' : '';
      let url;
      try { url = new URL(String(data.path || ''), 'http://localhost'); } catch { url = null; }
      if (!method || !url || url.origin !== 'http://localhost' || !bridgeAllowed(String(data.client_id || ''), method, url.pathname) || [...url.searchParams.keys()].some(k => !BRIDGE_QUERY.has(k))) {
        sendJson(res, 403, { error: 'This website cannot use that staff portal feature.' }); return true;
      }
      const headers = { 'user-agent': 'HN Group service website (' + String(data.client_id).slice(0, 20) + ')' };
      let payload = Buffer.alloc(0);
      if (method === 'POST') {
        const upload = data.body?.upload;
        if (upload) {
          if (!UPLOAD_HEADERS.has(upload.header) || (upload.data && (typeof upload.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(upload.data)))) { sendJson(res, 400, { error: 'Invalid upload.' }); return true; }
          payload = Buffer.from(upload.data || '', 'base64');
          headers['content-type'] = 'application/octet-stream';
          headers[upload.header] = encodeURIComponent(JSON.stringify(upload.meta && typeof upload.meta === 'object' ? upload.meta : {}));
        } else {
          payload = Buffer.from(JSON.stringify(data.body?.json && typeof data.body.json === 'object' ? data.body.json : {}));
          headers['content-type'] = 'application/json';
        }
        headers['content-length'] = String(payload.length);
      }
      const { Readable } = require('node:stream');
      const synthetic = Readable.from(payload.length ? [payload] : []);
      Object.assign(synthetic, { method, url: url.pathname + url.search, headers, socket: { remoteAddress: '127.0.0.1' } });
      await routeApi(synthetic, res, url.pathname, { token: data.session, raw: '', person: active.person, data: active.data });
      return true;
    }
    if (!['/api/status-sso/exchange', '/api/status-sso/session', '/api/auth/profile', '/api/auth/avatar', '/api/auth/password', '/api/auth/code', '/api/auth/network-leadership', '/api/auth/network-avatar'].includes(pathname)) return false;
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed.' }); return true; }
    if (!credentials(req)) { sendJson(res, 401, { error: 'Status integration not authenticated.' }); return true; }
    const body = await readJsonBody(req);
    if (pathname === '/api/auth/network-leadership') {
      sendJson(res, 200, { leaders: network.publicMembers(store) }); return true;
    }
    if (pathname === '/api/auth/network-avatar') {
      const person = network.members(store).find(p => p.id === body.id);
      const avatar = person && store.avatarFile(person);
      if (!avatar) { sendJson(res, 404, { error: 'Not found.' }); return true; }
      res.writeHead(200, { 'Content-Type': avatar.mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      fs.createReadStream(avatar.file).on('error', () => res.destroy()).pipe(res); return true;
    }
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
    if (pathname.startsWith('/api/auth/')) {
      if (!active.person.account?.enabled || active.data.impersonatorId || (store.maintenance().on && !store.isOwner(active.person))) {
        sendJson(res, 403, { error: 'This account cannot sign in right now.' }); return true;
      }
      if (pathname === '/api/auth/password') {
        if (!active.person.account.passwordTemporary) { sendJson(res, 403, { error: 'A temporary password change is not required.' }); return true; }
        await handleChangePassword(req, res, active, { newPassword: body.newPassword }); return true;
      }
      if (pathname === '/api/auth/code') {
        if (store.hasCode(active.person)) { sendJson(res, 403, { error: 'A sign-in PIN is already configured.' }); return true; }
        await handleSetCode(req, res, active, { code: body.code }); return true;
      }
      if (pathname === '/api/auth/avatar') {
        const avatar = store.avatarFile(active.person);
        if (!avatar) { sendJson(res, 404, { error: 'No profile picture.' }); return true; }
        res.writeHead(200, { 'Content-Type': avatar.mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        fs.createReadStream(avatar.file).on('error', () => res.destroy()).pipe(res); return true;
      }
      const p = active.person;
      sendJson(res, 200, { session: token, expires: active.data.expires, user: {
        id: p.id, displayName: p.displayName, email: (p.emails || []).find(e => e.primary)?.address || p.emails?.[0]?.address || store.loginName(p),
        jobTitle: p.jobTitle || '', company: p.company || '', avatarUrl: store.avatarFile(p) ? '/api/avatar' : null,
        ...(p.account.passwordTemporary ? { passwordChangeRequired: true, passwordMinLength: store.meView(p).passwordMinLength } : {}),
        ...(!store.hasCode(p) ? { codeSetupRequired: true } : {}),
        statusAdminAllowed: allowed(active, store)
      } }); return true;
    }
    if (!allowed(active, store)) { sendJson(res, 403, { error: 'Only the system owner and Super Admin members can manage status.' }); return true; }
    sendJson(res, 200, { session: token, expires: active.data.expires, user: { id: active.person.id, displayName: active.person.displayName } });
    return true;
  };
}
module.exports = { createStatusSso, allowed, loginNext, serviceRequest };
