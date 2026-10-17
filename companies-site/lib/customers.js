'use strict';
// Customer accounts: anyone can register with an email address and password. These are separate
// from HN Group staff accounts and never give access to the register's administration.
const crypto = require('node:crypto');
const store = require('./store');
const saved = require('./sessions');

const SECURE = (process.env.COMPANIES_ORIGIN || 'https://companies.hngroup.org.uk').startsWith('https://');
const COOKIE = (SECURE ? '__Host-' : '') + 'hn_companies_customer';
const failures = new Map(); // email or IP -> { count, first }

function cookie(req) {
  return (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
}
const setCookie = (value, maxAge) => `${COOKIE}=${value}; Path=/; HttpOnly;${SECURE ? ' Secure;' : ''} SameSite=Lax; Max-Age=${maxAge}`;

function current(req) {
  const raw = cookie(req);
  const entry = saved.get('customer', raw);
  if (!entry) return null;
  const c = store.customer(entry.user);
  if (!c || c.disabled) { saved.remove(raw); return null; }
  return { account: c, csrf: entry.csrf };
}

function start(c) {
  const raw = saved.create('customer', c.id);
  store.touchLogin(c);
  return setCookie(raw, saved.COOKIE_AGE);
}
function end(req) { saved.remove(cookie(req)); return setCookie('', 0); }
function endAllFor(customerId) { saved.removeUser('customer', customerId); }

// Ten wrong passwords for an email address or from one IP address in 15 minutes pause sign-in.
function limited(key) {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() - f.first > 15 * 60000) { failures.delete(key); return false; }
  return f.count >= 10;
}
function fail(key) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > 15 * 60000) failures.set(key, { count: 1, first: Date.now() }); else f.count++;
  if (failures.size > 50000) failures.clear();
}

function login(email, password, ip) {
  const key = String(email || '').trim().toLowerCase();
  if (limited('e:' + key) || limited('i:' + ip)) throw Object.assign(new Error('Too many attempts. Please wait 15 minutes and try again.'), { status: 429 });
  const c = store.customerByEmail(key);
  // Check a password even for unknown emails so response times don't reveal which accounts exist.
  const ok = c ? store.checkPassword(c, password) : (store.checkPassword({ salt: '0', hash: '00'.repeat(64) }, password) && false);
  if (!ok || c.disabled) {
    fail('e:' + key); fail('i:' + ip);
    throw Object.assign(new Error(c && c.disabled && ok ? 'This account has been disabled. Contact HN Group if you think that’s wrong.' : 'The email address or password is wrong.'), { status: 400 });
  }
  failures.delete('e:' + key);
  return c;
}

module.exports = { current, start, end, endAllFor, login };
