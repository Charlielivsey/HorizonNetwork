'use strict';
// Staff sign-in for the VPN. Passwords and PINs are checked by the single private staff-account
// backend (hn-accounts), exactly as website control does; the VPN never sees stored credentials.
const fs = require('node:fs');
const crypto = require('node:crypto');

const BACKEND = process.env.VPN_ACCOUNTS_BACKEND || 'http://127.0.0.1:3250';
const SECRET_FILE = process.env.STATUS_SSO_SECRET_FILE || '/var/lib/hn-status-sso/secret';
const HEX = /^[a-f0-9]{64}$/;
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const fail = (status, message, extra) => Object.assign(new Error(message), { status }, extra || {});

function secret() {
  let value;
  try { value = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch { throw fail(503, 'Staff sign-in is not configured on this server.'); }
  if (!HEX.test(value)) throw fail(503, 'Staff sign-in is not configured on this server.');
  return value;
}

async function call(endpoint, data, client) {
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret(), 'X-Forwarded-Proto': 'https' };
  if (client) { headers['X-Real-IP'] = client.ip; headers['User-Agent'] = String(client.agent || 'HN Group VPN').slice(0, 300); }
  let response;
  try { response = await fetch(BACKEND + endpoint, { method: 'POST', headers, body: JSON.stringify(data || {}), signal: AbortSignal.timeout(8000), redirect: 'error' }); }
  catch { throw fail(503, 'The staff account service is temporarily unavailable. Please try again shortly.'); }
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw fail(response.status === 429 ? 429 : response.status >= 500 ? 503 : response.status === 401 ? 401 : 400, value.error || 'Sign-in could not be verified.', { restart: !!value.restart });
  return { response, value };
}

// The signed-in staff member, once the backend has created their staff session.
async function profileFrom(response) {
  const raw = (response.headers.get('set-cookie') || '').match(/(?:^|,\s*)hn_staff_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!raw) throw fail(503, 'The staff account service did not complete the sign-in.');
  const { value } = await call('/api/auth/profile', { session: hash(raw) });
  const u = value.user || {};
  if (u.passwordChangeRequired || u.codeSetupRequired) throw fail(403, 'Finish setting up your staff account first (a new password and a six-digit PIN) at staff.hngroup.org.uk, then sign in here.');
  return { id: u.id, email: String(u.email || '').toLowerCase(), displayName: u.displayName || u.email, admin: u.ownerAccess === true || u.statusAdminAllowed === true };
}

// Step one: email address and password. Returns { challenge } when a PIN is needed, else { user }.
async function signIn(email, password, client) {
  if (!email || !password) throw fail(400, 'Enter your email address and password.');
  const { value, response } = await call('/api/login', { username: String(email).trim(), password: String(password) }, client);
  if (value.codeRequired) return { challenge: value.challenge };
  return { user: await profileFrom(response) };
}
// Step two: the six-digit PIN.
async function signInCode(challenge, code, client) {
  if (!/^\d{6}$/.test(String(code || ''))) throw fail(400, 'Enter your six-digit PIN.');
  const { response } = await call('/api/login/code', { challenge, code: String(code) }, client);
  return { user: await profileFrom(response) };
}

// Which of these staff accounts are still enabled ({ id: true|false }), or null if it can't be checked now.
async function accountStatus(ids) {
  if (!ids.length) return {};
  try { const { value } = await call('/api/auth/account-status', { ids }); return value.accounts || null; } catch { return null; }
}

module.exports = { signIn, signInCode, accountStatus, hash, fail };
