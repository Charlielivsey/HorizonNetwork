'use strict';
// Checks with the single private staff-account backend (hn-accounts) that the staff accounts using
// the VPN are still enabled. Signing in itself goes through HN Group Auth (lib/auth.js).
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

// Which of these staff accounts are still enabled ({ id: true|false }), or null if it can't be checked now.
async function accountStatus(ids) {
  if (!ids.length) return {};
  try { const { value } = await call('/api/auth/account-status', { ids }); return value.accounts || null; } catch { return null; }
}

module.exports = { accountStatus, hash, fail };
