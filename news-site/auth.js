'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const PORTAL_ORIGIN = 'https://auth.hngroup.org.uk';
const STATUS_ORIGIN = 'https://news.hngroup.org.uk';
const SESSION_COOKIE = '__Host-hn_news_session';
const STATE_COOKIE = '__Host-hn_news_state';
const HEX = /^[a-f0-9]{64}$/;
const secretFile = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const portalBackend = process.env.AUTH_BACKEND || 'http://127.0.0.1:3400';
function cookie(req, name) {
  return (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
}
function setCookie(name, value, maxAge) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax${maxAge === undefined ? '' : '; Max-Age=' + maxAge}`; }
function createAuth() {
  const sessions = new Map();
  const redirect = (res, location, cookies = []) => { res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', 'Set-Cookie': cookies }); res.end(); };
  const error = (res, status, message) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: message })); };
  async function portal(endpoint, data) {
    let secret;
    try { secret = fs.readFileSync(secretFile, 'utf8').trim(); } catch { throw Object.assign(new Error('HN Group Auth integration is not installed. Please run the website installer.'), { status: 503 }); }
    if (!HEX.test(secret)) throw Object.assign(new Error('HN Group Auth integration is not configured.'), { status: 503 });
    let response;
    try { response = await fetch(portalBackend + '/api/sso/' + endpoint, {
      method: 'POST', headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, client_id: 'news' }), signal: AbortSignal.timeout(5000), redirect: 'error'
    }); } catch { throw Object.assign(new Error('HN Group Auth is unavailable. Please try again shortly.'), { status: 503 }); }
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(value.error || 'Staff sign-in could not be verified.'), { status: response.status === 403 ? 403 : response.status === 401 ? 401 : 503 });
    if (!HEX.test(value.session || '') || !value.user || !Number.isFinite(value.expires)) throw Object.assign(new Error('Invalid staff sign-in response.'), { status: 503 });
    return value;
  }
  async function authorize(req) {
    const token = cookie(req, SESSION_COOKIE);
    const stored = sessions.get(token);
    if (!stored || stored.expires <= Date.now()) { sessions.delete(token); return null; }
    try {
      const result = await portal('session', { session: stored.portalSession });
      return result.user;
    } catch (e) { if ([401, 403].includes(e.status)) sessions.delete(token); throw e; }
  }
  async function avatar(req, res) {
    const entry = sessions.get(cookie(req, SESSION_COOKIE));
    if (!entry || entry.expires <= Date.now()) return error(res, 401, 'Please sign in again.');
    let response;
    try {
      const secret = fs.readFileSync(secretFile, 'utf8').trim();
      if (!HEX.test(secret)) throw new Error('Invalid configuration');
      response = await fetch(portalBackend + '/api/sso/avatar', { method: 'POST', headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ session: entry.portalSession, client_id: 'news' }), signal: AbortSignal.timeout(5000), redirect: 'error' });
    } catch { return error(res, 503, 'Profile picture is temporarily unavailable.'); }
    if (!response.ok) return error(res, [401,403,404].includes(response.status) ? response.status : 503, 'Profile picture is unavailable.');
    const image = Buffer.from(await response.arrayBuffer());
    res.writeHead(200, { 'Content-Type': response.headers.get('content-type'), 'Cache-Control': 'no-store' });
    res.end(image);
  }
  async function handle(req, res, route) {
    if (route === '/auth/login' && req.method === 'GET') {
      const state = crypto.randomBytes(32).toString('hex');
      const next = '/authorize?client_id=news&state=' + state;
      const switchAccount = new URL(req.url, STATUS_ORIGIN).searchParams.get('switch') === '1';
      redirect(res, PORTAL_ORIGIN + (next + (switchAccount ? '&switch=1' : '')), [setCookie(STATE_COOKIE, state, 600)]); return true;
    }
    if (route === '/auth/callback' && req.method === 'GET') {
      const query = new URL(req.url, STATUS_ORIGIN).searchParams;
      const state = query.get('state'), expected = cookie(req, STATE_COOKIE);
      if (!HEX.test(state || '') || !HEX.test(expected) || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected))) {
        error(res, 400, 'Sign-in request expired or does not match this browser. Start again from the Admin button.'); return true;
      }
      const clearState = setCookie(STATE_COOKIE, '', 0);
      if (query.get('error')) { redirect(res, '/admin/denied', [clearState]); return true; }
      if (!HEX.test(query.get('code') || '')) { error(res, 400, 'Invalid sign-in code.'); return true; }
      try {
        const result = await portal('exchange', { code: query.get('code'), state });
        for (const [id, entry] of sessions) if (entry.expires <= Date.now()) sessions.delete(id);
        const old = cookie(req, SESSION_COOKIE); if (old) sessions.delete(old);
        if (sessions.size >= 1000) throw Object.assign(new Error('Please try signing in again shortly.'), { status: 503 });
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(token, { portalSession: result.session, expires: Math.min(result.expires, Date.now() + 12 * 60 * 60 * 1000) });
        redirect(res, '/admin', [clearState, setCookie(SESSION_COOKIE, token)]);
      } catch (e) { redirect(res, '/admin/denied?reason=' + (e.status === 403 ? 'denied' : e.status === 503 ? 'unavailable' : 'expired'), [clearState]); }
      return true;
    }
    if (route === '/auth/logout' && req.method === 'POST') {
      if (req.headers.origin !== STATUS_ORIGIN) { error(res, 403, 'Request origin not allowed.'); return true; }
      sessions.delete(cookie(req, SESSION_COOKIE));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': setCookie(SESSION_COOKIE, '', 0) }); res.end('{"ok":true}'); return true;
    }
    if (route === '/admin' && req.method === 'GET') {
      try { if (await authorize(req)) return false; redirect(res, '/auth/login'); }
      catch (e) { redirect(res, '/admin/denied?reason=' + (e.status === 503 ? 'unavailable' : e.status === 403 ? 'denied' : 'expired')); }
      return true;
    }
    return false;
  }
  return { authorize, handle, avatar };
}
module.exports = { createAuth, STATUS_ORIGIN };
