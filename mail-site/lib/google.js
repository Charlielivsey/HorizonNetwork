'use strict';
// Connecting Gmail (the user's choice, 6 November 2026: "Each person allows it"). The first time someone opens HN Mail,
// Google asks them once to let HN Mail read, send and organise their mail (scope gmail.modify, which can't delete mail
// permanently). Only the Google account already linked to their HN Group Auth account is accepted: Google's answer
// must name the same Google account (its permanent id, or its email for links made before Auth shared the id).
//
// Uses HN Group Auth's existing Google OAuth client (/var/lib/hn-auth/google-oauth.json). In Google Cloud the owner
// enables the Gmail API, adds https://mail.hngroup.org.uk/google/callback as an authorised redirect URI and adds the
// gmail.modify scope to the consent screen (see README.md). The refresh token Google gives is kept encrypted
// (AES-256-GCM, key in the data folder, root only) and never leaves the server; short-lived access tokens are kept in
// memory only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const GOOGLE_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
const SCOPES = ['openid', 'email', GMAIL_SCOPE].join(' ');
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const b64url = (buf) => Buffer.from(buf).toString('base64url');

function createGoogle({ dir, origin, fetcher = fetch, file = process.env.GOOGLE_OAUTH_FILE || '/var/lib/hn-auth/google-oauth.json' }) {
  const REDIRECT = origin + '/google/callback';
  const grantsFile = path.join(dir, 'grants.json'), keyFile = path.join(dir, 'key');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  let key;
  try { key = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex'); } catch {}
  if (!key || key.length !== 32) { key = crypto.randomBytes(32); fs.writeFileSync(keyFile, key.toString('hex'), { mode: 0o600 }); }
  let grants = {};
  try { grants = JSON.parse(fs.readFileSync(grantsFile, 'utf8')); } catch {}
  const save = () => { const tmp = grantsFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(grants), { mode: 0o600 }); fs.renameSync(tmp, grantsFile); };
  const seal = (text) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv), body = Buffer.concat([c.update(text, 'utf8'), c.final()]); return [iv, c.getAuthTag(), body].map(b64url).join('.'); };
  const open = (sealed) => { const [iv, tag, body] = String(sealed).split('.').map((x) => Buffer.from(x, 'base64url')); const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag); return Buffer.concat([d.update(body), d.final()]).toString('utf8'); };
  const pending = new Map(), tokens = new Map();
  setInterval(() => { for (const [k, v] of pending) if (v.expires < Date.now()) pending.delete(k); }, 60000).unref();

  let cached = null;
  function config() {
    let stat; try { stat = fs.statSync(file); } catch { return null; }
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.value;
    let value = null;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')), v = raw && raw.web && typeof raw.web === 'object' ? raw.web : raw;
      const id = String(v.client_id || '').trim(), secret = String(v.client_secret || '').trim();
      if (/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id) && secret.length >= 8) value = { id, secret };
    } catch {}
    cached = { mtimeMs: stat.mtimeMs, value };
    return value;
  }
  // The grant for this person, only while it's for the Google account linked to their Auth account.
  function grantFor(user) {
    const g = grants[user.accountId];
    if (!g) return null;
    const linked = user.google || {};
    const same = linked.sub ? g.sub === linked.sub : g.email === linked.email;
    if (!same) { delete grants[user.accountId]; tokens.delete(user.accountId); save(); return null; }
    return g;
  }
  function status(user) {
    const g = grantFor(user);
    return { configured: !!config(), connected: !!g, email: g ? g.email : null, linkedEmail: user.google ? user.google.email : null };
  }
  // Starts the Google consent screen; the state is bound to this browser (cookie) and to this sign-in account.
  function start(user) {
    const client = config();
    if (!client) throw fail(503, 'Google isn’t set up on this server yet, so Gmail can’t be connected. Ask the system owner.');
    const state = crypto.randomBytes(32).toString('hex'), verifier = b64url(crypto.randomBytes(48)), nonce = b64url(crypto.randomBytes(24));
    pending.set(state, { accountId: user.accountId, verifier, nonce, expires: Date.now() + 10 * 60000 });
    const q = new URLSearchParams({ client_id: client.id, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPES, access_type: 'offline', prompt: 'consent',
      include_granted_scopes: 'true', login_hint: (user.google && user.google.email) || '', state, nonce, code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256' });
    return { state, url: GOOGLE_AUTHORIZE + '?' + q };
  }
  async function finish(user, state, code, boundState) {
    const record = pending.get(state);
    pending.delete(state);
    if (!record || record.expires < Date.now() || !boundState || boundState !== state || record.accountId !== user.accountId) throw fail(400, 'That Google sign-in expired or was started in another browser. Please try again.');
    const client = config();
    if (!client) throw fail(503, 'Google isn’t set up on this server.');
    let response;
    try {
      response = await fetcher(GOOGLE_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ code, client_id: client.id, client_secret: client.secret, redirect_uri: REDIRECT, grant_type: 'authorization_code', code_verifier: record.verifier }).toString(),
        signal: AbortSignal.timeout(10000), redirect: 'error' });
    } catch { throw fail(503, 'Google couldn’t be reached. Please try again.'); }
    const value = await response.json().catch(() => ({}));
    if (!response.ok || typeof value.id_token !== 'string') throw fail(401, 'Google didn’t confirm access. Please try again.');
    let claims; try { claims = JSON.parse(Buffer.from(value.id_token.split('.')[1], 'base64url').toString('utf8')); } catch { throw fail(401, 'Google’s answer couldn’t be read.'); }
    const now = Date.now() / 1000;
    if (!ISSUERS.includes(claims.iss) || claims.aud !== client.id || !(claims.exp > now) || claims.nonce !== record.nonce || typeof claims.sub !== 'string') throw fail(401, 'Google’s answer didn’t check out, so Gmail wasn’t connected.');
    const email = String(claims.email || '').toLowerCase(), linked = user.google || {};
    if (linked.sub ? claims.sub !== linked.sub : email !== linked.email) {
      throw fail(403, 'That isn’t the Google account linked to your HN Group Auth account (' + (linked.email || 'none') + '). Choose that account on Google’s screen.', 'wrong-account');
    }
    if (!String(value.scope || '').split(' ').includes(GMAIL_SCOPE)) throw fail(403, 'Gmail access wasn’t allowed on Google’s screen, so HN Mail can’t open your mail. Try again and tick the Gmail box.', 'no-scope');
    if (typeof value.refresh_token !== 'string') throw fail(401, 'Google didn’t give lasting access. Please try again.');
    grants[user.accountId] = { sub: claims.sub, email, refresh: seal(value.refresh_token), at: Date.now() };
    save();
    tokens.set(user.accountId, { token: value.access_token, expires: Date.now() + (Number(value.expires_in) || 3000) * 1000 - 60000 });
  }
  // A current Gmail access token for this person (refreshed with the stored refresh token when needed).
  async function accessToken(user, force = false) {
    const g = grantFor(user);
    if (!g) throw fail(409, 'Connect Gmail to HN Mail first.', 'connect');
    const held = tokens.get(user.accountId);
    if (!force && held && held.expires > Date.now()) return held.token;
    const client = config();
    if (!client) throw fail(503, 'Google isn’t set up on this server.');
    let response;
    try {
      response = await fetcher(GOOGLE_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, refresh_token: open(g.refresh), grant_type: 'refresh_token' }).toString(), signal: AbortSignal.timeout(10000), redirect: 'error' });
    } catch { throw fail(503, 'Google couldn’t be reached. Please try again.'); }
    const value = await response.json().catch(() => ({}));
    if (response.status === 400 && value.error === 'invalid_grant') {
      delete grants[user.accountId]; tokens.delete(user.accountId); save();
      throw fail(409, 'Google says HN Mail’s access to your Gmail has ended (for example it was removed in your Google account). Connect Gmail again.', 'connect');
    }
    if (!response.ok || typeof value.access_token !== 'string') throw fail(503, 'Google didn’t answer. Please try again shortly.');
    tokens.set(user.accountId, { token: value.access_token, expires: Date.now() + (Number(value.expires_in) || 3000) * 1000 - 60000 });
    return value.access_token;
  }
  async function disconnect(user) {
    const g = grants[user.accountId];
    delete grants[user.accountId]; tokens.delete(user.accountId); save();
    if (g) { try { await fetcher(GOOGLE_REVOKE + '?token=' + encodeURIComponent(open(g.refresh)), { method: 'POST', signal: AbortSignal.timeout(8000) }); } catch {} }
  }
  return { status, start, finish, accessToken, disconnect, config, REDIRECT };
}
module.exports = { createGoogle, GMAIL_SCOPE };
