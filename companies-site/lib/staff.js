'use strict';
// Staff accounts for the Company Register's administration. These are the register's own accounts,
// completely separate from other group websites and from customer accounts. A new register
// starts with one administrator, admin@hngroup.org.uk / admin, who must choose a new password at
// first sign-in. Administrators can add and remove staff; staff can manage the register.
const crypto = require('node:crypto');
const store = require('./store');

const SECURE = (process.env.COMPANIES_ORIGIN || 'https://companies.hngroup.org.uk').startsWith('https://');
const COOKIE = (SECURE ? '__Host-' : '') + 'hn_companies_staff';
const LIFETIME = 12 * 3600 * 1000;
const ROLES = { admin: 'Administrator', staff: 'Staff' };
const sessions = new Map(); // sha256(token) -> { staff, csrf, expires }
const failures = new Map();
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });

function db() {
  const d = store.db;
  if (!d.staff) d.staff = [];
  return d;
}
function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) { return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') }; }
function checkPassword(s, pw) { return crypto.timingSafeEqual(Buffer.from(hashPassword(String(pw || ''), s.salt).hash, 'hex'), Buffer.from(s.hash, 'hex')); }
const list = () => db().staff;
const byId = (id) => list().find((s) => s.id === id) || null;
const byEmail = (email) => list().find((s) => s.email === String(email || '').trim().toLowerCase()) || null;
const admins = () => list().filter((s) => s.role === 'admin' && !s.disabled);

// The first time the register starts, create the default administrator.
function ensureDefault() {
  if (list().length) return;
  list().push({ id: crypto.randomBytes(12).toString('hex'), name: 'Administrator', email: 'admin@hngroup.org.uk', role: 'admin', ...hashPassword('admin'), mustChange: true, createdAt: new Date().toISOString(), lastLoginAt: null });
  store.audit('system', 'staff.default-created', 'admin@hngroup.org.uk');
  store.save();
}

function validPassword(pw) {
  pw = String(pw || '');
  if (pw.length < 10) throw fail(400, 'Choose a password of at least 10 characters.');
  if (pw.length > 200) throw fail(400, 'That password is too long.');
  if (pw.toLowerCase() === 'admin' || pw.toLowerCase() === 'password123') throw fail(400, 'Choose a less obvious password.');
  return pw;
}

function add(input, actor) {
  const name = String(input.name || '').trim().slice(0, 80);
  const email = String(input.email || '').trim().toLowerCase();
  if (!name) throw fail(400, 'Enter the staff member’s name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) throw fail(400, 'Enter a valid email address.');
  if (byEmail(email)) throw fail(400, 'A staff account already uses that email address.');
  if (list().length >= 500) throw fail(400, 'There are too many staff accounts.');
  const pw = validPassword(input.password);
  const s = { id: crypto.randomBytes(12).toString('hex'), name, email, role: input.role === 'admin' ? 'admin' : 'staff', ...hashPassword(pw), mustChange: true, createdAt: new Date().toISOString(), lastLoginAt: null };
  list().push(s);
  store.audit(actor, 'staff.add', email + ' (' + ROLES[s.role] + ')');
  store.save();
  return s;
}

function remove(id, me, actor) {
  const s = byId(id);
  if (!s) return;
  if (s.id === me.id) throw fail(400, 'You can’t remove your own account.');
  if (s.role === 'admin' && admins().length <= 1) throw fail(400, 'Keep at least one administrator.');
  db().staff = list().filter((x) => x.id !== id);
  endAllFor(id);
  store.audit(actor, 'staff.remove', s.email);
  store.save();
}

function setRole(id, role, me, actor) {
  const s = byId(id);
  if (!s) return;
  role = role === 'admin' ? 'admin' : 'staff';
  if (s.id === me.id && role !== 'admin') throw fail(400, 'You can’t remove your own administrator access.');
  if (s.role === 'admin' && role !== 'admin' && admins().length <= 1) throw fail(400, 'Keep at least one administrator.');
  s.role = role;
  store.audit(actor, 'staff.role', s.email + ' → ' + ROLES[role]);
  store.save();
}

// An administrator sets a temporary password; the staff member must change it when they sign in.
function resetPassword(id, password, actor) {
  const s = byId(id);
  if (!s) return;
  Object.assign(s, hashPassword(validPassword(password)), { mustChange: true });
  endAllFor(id);
  store.audit(actor, 'staff.reset-password', s.email);
  store.save();
}

function changeOwnPassword(s, current, next) {
  if (!checkPassword(s, current)) throw fail(400, 'Your current password is wrong.');
  const pw = validPassword(next);
  if (checkPassword(s, pw)) throw fail(400, 'Choose a different password from your current one.');
  Object.assign(s, hashPassword(pw), { mustChange: false });
  store.audit('staff:' + s.email, 'staff.password');
  store.save();
}

// ---------- Sessions ----------
function cookie(req) {
  return (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
}
const setCookie = (value, maxAge) => `${COOKIE}=${value}; Path=/; HttpOnly;${SECURE ? ' Secure;' : ''} SameSite=Lax; Max-Age=${maxAge}`;

function current(req) {
  const raw = cookie(req);
  if (!/^[a-f0-9]{64}$/.test(raw)) return null;
  const entry = sessions.get(hash(raw));
  if (!entry || entry.expires <= Date.now()) { sessions.delete(hash(raw)); return null; }
  const s = byId(entry.staff);
  if (!s) { sessions.delete(hash(raw)); return null; }
  return { account: s, id: s.id, name: s.name, email: s.email, admin: s.role === 'admin', mustChange: !!s.mustChange, csrf: entry.csrf };
}
function start(s) {
  for (const [k, v] of sessions) if (v.expires <= Date.now()) sessions.delete(k);
  const raw = crypto.randomBytes(32).toString('hex');
  sessions.set(hash(raw), { staff: s.id, csrf: crypto.randomBytes(24).toString('hex'), expires: Date.now() + LIFETIME });
  s.lastLoginAt = new Date().toISOString();
  store.audit('staff:' + s.email, 'staff.sign-in');
  store.save();
  return setCookie(raw, LIFETIME / 1000);
}
function end(req) { sessions.delete(hash(cookie(req))); return setCookie('', 0); }
function endAllFor(id) { for (const [k, v] of sessions) if (v.staff === id) sessions.delete(k); }

// Ten wrong passwords for an email address or from one IP address in 15 minutes pause sign-in.
function limited(key) { const f = failures.get(key); if (!f) return false; if (Date.now() - f.first > 15 * 60000) { failures.delete(key); return false; } return f.count >= 10; }
function noteFailure(key) { const f = failures.get(key); if (!f || Date.now() - f.first > 15 * 60000) failures.set(key, { count: 1, first: Date.now() }); else f.count++; if (failures.size > 50000) failures.clear(); }

function login(email, password, ip) {
  const key = String(email || '').trim().toLowerCase();
  if (limited('e:' + key) || limited('i:' + ip)) throw fail(429, 'Too many attempts. Please wait 15 minutes and try again.');
  const s = byEmail(key);
  const ok = s ? checkPassword(s, password) : (checkPassword({ salt: '0', hash: '00'.repeat(64) }, password) && false);
  if (!ok) { noteFailure('e:' + key); noteFailure('i:' + ip); store.audit('staff:' + key, 'staff.sign-in-failed'); store.save(); throw fail(400, 'The email address or password is wrong.'); }
  failures.delete('e:' + key);
  return s;
}

module.exports = { ROLES, ensureDefault, list, byId, add, remove, setRole, resetPassword, changeOwnPassword, current, start, end, login };
