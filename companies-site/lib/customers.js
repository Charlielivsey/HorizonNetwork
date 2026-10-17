'use strict';
// Customer accounts: anyone can register with an email address and password. These are separate
// from HN Group staff accounts and never give access to the register's administration.
const crypto = require('node:crypto');
const store = require('./store');

const SECURE = (process.env.COMPANIES_ORIGIN || 'https://companies.hngroup.org.uk').startsWith('https://');
const COOKIE = (SECURE ? '__Host-' : '') + 'hn_companies_customer';
const sessions = new Map(); // sha256(token) -> { customer, csrf, expires }
const failures = new Map(); // email or IP -> { count, first }
const LIFETIME = 30 * 24 * 3600 * 1000;
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

function cookie(req) {
  return (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
}
const setCookie = (value, maxAge) => `${COOKIE}=${value}; Path=/; HttpOnly;${SECURE ? ' Secure;' : ''} SameSite=Lax; Max-Age=${maxAge}`;

function current(req) {
  const raw = cookie(req);
  if (!/^[a-f0-9]{64}$/.test(raw)) return null;
  const entry = sessions.get(hash(raw));
  if (!entry || entry.expires <= Date.now()) { sessions.delete(hash(raw)); return null; }
  const c = store.customer(entry.customer);
  if (!c || c.disabled) { sessions.delete(hash(raw)); return null; }
  return { account: c, csrf: entry.csrf };
}

function start(c) {
  for (const [k, v] of sessions) if (v.expires <= Date.now()) sessions.delete(k);
  const raw = crypto.randomBytes(32).toString('hex');
  sessions.set(hash(raw), { customer: c.id, csrf: crypto.randomBytes(24).toString('hex'), expires: Date.now() + LIFETIME });
  store.touchLogin(c);
  return setCookie(raw, LIFETIME / 1000);
}
function end(req) { sessions.delete(hash(cookie(req))); return setCookie('', 0); }
function endAllFor(customerId) { for (const [k, v] of sessions) if (v.customer === customerId) sessions.delete(k); }

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
