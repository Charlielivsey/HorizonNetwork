'use strict';
// HN Group Auth client: a fixed registered callback per website. Staff identities never mix with
// customer/community accounts, which are stored separately by lib/accounts.js.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { fail, cookie, setCookie, json } = require('./http');
const HEX = /^[a-f0-9]{64}$/;

function createAuth(config) {
  const AUTH_ORIGIN = process.env.AUTH_ORIGIN || 'https://auth.hngroup.org.uk';
  const ORIGIN = 'https://' + config.domain;
  const CLIENT = config.id;
  const SESSION = `__Host-hn_${CLIENT}_session`, STATE = `__Host-hn_${CLIENT}_state`;
  const secretFile = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
  const backend = process.env.AUTH_BACKEND || 'http://127.0.0.1:3400';
  const sessions = new Map();

  function secret() {
    let value;
    try { value = fs.readFileSync(secretFile, 'utf8').trim(); } catch { throw fail(503, 'HN Group Auth integration is not installed. Please run the website installer.'); }
    if (!HEX.test(value)) throw fail(503, 'HN Group Auth integration is not configured.');
    return value;
  }
  async function call(endpoint, data, timeout = 5000) {
    let response;
    try {
      response = await fetch(backend + '/api/sso/' + endpoint, {
        method: 'POST', headers: { Authorization: 'Bearer ' + secret(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, client_id: CLIENT }), signal: AbortSignal.timeout(timeout), redirect: 'error'
      });
    } catch (e) { if (e.status) throw e; throw fail(503, 'HN Group Auth is unavailable. Please try again shortly.'); }
    return response;
  }
  async function portal(endpoint, data) {
    const response = await call(endpoint, data);
    let value = {}; try { value = await response.json(); } catch {}
    if (!response.ok) throw fail(response.status === 403 ? 403 : response.status === 401 ? 401 : 503, value.error || 'Staff sign-in could not be verified.');
    if (!HEX.test(value.session || '') || !value.user || !Number.isFinite(value.expires)) throw fail(503, 'Invalid staff sign-in response.');
    return value;
  }
  function entry(req) {
    const raw = cookie(req, SESSION);
    const stored = HEX.test(raw) && sessions.get(raw);
    if (!stored || stored.expires <= Date.now()) { sessions.delete(raw); return null; }
    return stored;
  }
  // Permissions are re-checked with Auth at least every 15 seconds, so revocation applies quickly.
  async function authorize(req) {
    const stored = entry(req);
    if (!stored) return null;
    if (stored.user && stored.checked > Date.now() - 15000) return stored.user;
    try {
      const result = await portal('session', { session: stored.portalSession });
      stored.user = result.user; stored.checked = Date.now();
      return result.user;
    } catch (e) {
      if ([401, 403].includes(e.status)) { sessions.delete(cookie(req, SESSION)); return null; }
      throw e;
    }
  }
  async function avatar(req, res) {
    const stored = entry(req);
    if (!stored) return json(res, 401, { error: 'Please sign in again.' });
    let response;
    try { response = await call('avatar', { session: stored.portalSession }); } catch { return json(res, 503, { error: 'Profile picture is temporarily unavailable.' }); }
    if (!response.ok) return json(res, [401, 403, 404].includes(response.status) ? response.status : 503, { error: 'Profile picture is unavailable.' });
    const type = response.headers.get('content-type') || '';
    if (!/^image\/(png|jpeg|webp|gif)$/.test(type)) return json(res, 404, { error: 'Profile picture is unavailable.' });
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(Buffer.from(await response.arrayBuffer()));
  }
  // Reads/writes staff-portal records as the signed-in person. Auth and the portal both check an
  // allowlist of routes for this website, and the portal applies its own permission rules.
  async function bridge(req, method, path, payload) {
    const stored = entry(req);
    if (!stored) throw fail(401, 'Please sign in with HN Group Auth.');
    const response = await call('staff', { session: stored.portalSession, method, path, body: payload }, 20000);
    return response;
  }
  function redirect(res, location, cookies = []) { res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', ...(cookies.length ? { 'Set-Cookie': cookies } : {}) }); res.end(); }
  async function handle(req, res, route) {
    if (route === '/auth/login' && req.method === 'GET') {
      const state = crypto.randomBytes(32).toString('hex');
      const switchAccount = new URL(req.url, ORIGIN).searchParams.get('switch') === '1';
      redirect(res, `${AUTH_ORIGIN}/authorize?client_id=${CLIENT}&state=${state}${switchAccount ? '&switch=1' : ''}`, [setCookie(STATE, state, 600)]);
      return true;
    }
    if (route === '/auth/callback' && req.method === 'GET') {
      const query = new URL(req.url, ORIGIN).searchParams;
      const state = query.get('state') || '', expected = cookie(req, STATE);
      const clear = setCookie(STATE, '', 0);
      if (!HEX.test(state) || !HEX.test(expected) || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected))) {
        redirect(res, '/admin/denied?reason=expired', [clear]); return true;
      }
      if (query.get('error')) { redirect(res, '/admin/denied?reason=denied', [clear]); return true; }
      if (!HEX.test(query.get('code') || '')) { redirect(res, '/admin/denied?reason=expired', [clear]); return true; }
      try {
        const result = await portal('exchange', { code: query.get('code'), state });
        for (const [key, value] of sessions) if (value.expires <= Date.now()) sessions.delete(key);
        sessions.delete(cookie(req, SESSION));
        if (sessions.size >= 2000) throw fail(503, 'Please try signing in again shortly.');
        const raw = crypto.randomBytes(32).toString('hex');
        sessions.set(raw, { portalSession: result.session, user: result.user, checked: Date.now(), expires: Math.min(result.expires, Date.now() + 12 * 3600000) });
        redirect(res, '/admin', [clear, setCookie(SESSION, raw)]);
      } catch (e) {
        redirect(res, '/admin/denied?reason=' + (e.status === 403 ? 'denied' : e.status === 503 ? 'unavailable' : 'expired'), [clear]);
      }
      return true;
    }
    if (route === '/auth/logout' && req.method === 'POST') {
      if (req.headers.origin !== ORIGIN) { json(res, 403, { error: 'Request origin not allowed.' }); return true; }
      sessions.delete(cookie(req, SESSION));
      json(res, 200, { ok: true }, [setCookie(SESSION, '', 0)]);
      return true;
    }
    if (route === '/admin' && req.method === 'GET') {
      try { if (await authorize(req)) return false; redirect(res, '/auth/login'); }
      catch (e) { redirect(res, '/admin/denied?reason=' + (e.status === 403 ? 'denied' : 'unavailable')); }
      return true;
    }
    return false;
  }
  return { authorize, avatar, bridge, handle, ORIGIN };
}
module.exports = { createAuth };
