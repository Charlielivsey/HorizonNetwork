'use strict';
// Investor relations data, kept in DATA_DIR/investors.json: investor accounts (scrypt passwords,
// single-use invitations, hashed sessions), company valuations, investor news and an activity log.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

let file, db;
const now = () => new Date().toISOString();
const id = () => crypto.randomBytes(12).toString('hex');
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const bad = (message, status) => Object.assign(new Error(message), { status: status || 400 });
const INVITE_DAYS = 7, SESSION_DAYS = 30;

function init(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  file = path.join(dataDir, 'investors.json');
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { db = {}; }
  for (const k of ['investors', 'sessions', 'news', 'audit']) db[k] = Array.isArray(db[k]) ? db[k] : [];
  db.valuations = db.valuations && typeof db.valuations === 'object' ? db.valuations : {};
  db.migrations = Array.isArray(db.migrations) ? db.migrations : [];
  // The user's request (20 October 2026): the Company Register starts again from scratch, so the company
  // valuations recorded here and the cached copy of the register go too. A backup of both is kept in
  // DATA_DIR/backups/; investor accounts, sessions and news stay.
  if (!db.migrations.includes('reset-companies-2026-10-20')) {
    const cached = path.join(dataDir, 'register.json');
    if (Object.keys(db.valuations).length || fs.existsSync(cached)) {
      const backup = path.join(dataDir, 'backups', 'company-reset-' + now().replace(/[:.]/g, '-'));
      fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(backup, 'investors.json'), JSON.stringify(db), { mode: 0o600 });
      if (fs.existsSync(cached)) { fs.copyFileSync(cached, path.join(backup, 'register.json')); fs.rmSync(cached, { force: true }); }
      audit('system', 'companies.reset', Object.keys(db.valuations).length + ' companies’ valuations removed; backup in ' + path.relative(dataDir, backup));
      db.valuations = {};
    }
    db.migrations.push('reset-companies-2026-10-20');
  }
  save();
}
function save() { const tmp = file + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 }); fs.renameSync(tmp, file); }
function audit(actor, action, detail) { db.audit.unshift({ at: now(), actor: String(actor || ''), action, detail: String(detail || '').slice(0, 300) }); db.audit = db.audit.slice(0, 2000); }

const text = (v, max, label, required) => { const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); if (required && !s) throw bad('Enter ' + label + '.'); if (s.length > max) throw bad(label[0].toUpperCase() + label.slice(1) + ' is too long.'); return s; };
const emailOf = (v) => { const e = text(v, 160, 'an email address', true).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw bad('Enter a valid email address.'); return e; };
const namesOf = (list) => [...new Set((Array.isArray(list) ? list : [list]).map((n) => text(n, 160, 'a register name')).filter(Boolean))].slice(0, 20);

// ---------- Investors ----------
const investors = () => db.investors.slice().sort((a, b) => a.name.localeCompare(b.name));
const investor = (iid) => db.investors.find((x) => x.id === iid) || null;
const byEmail = (email) => db.investors.find((x) => x.email === String(email || '').trim().toLowerCase()) || null;
const view = (x) => x && ({ id: x.id, name: x.name, email: x.email, holders: x.holders.slice(), enabled: x.enabled, active: !!x.password, createdAt: x.createdAt, lastSignIn: x.lastSignIn || null, inviteExpires: x.invite ? x.invite.expires : null, newsSeen: x.newsSeen || null });

// Creates an investor and returns a one-time invitation token (shown to staff once, never stored).
function createInvestor(input, actor) {
  const email = emailOf(input.email);
  if (byEmail(email)) throw bad('An investor with that email address already exists.');
  const x = { id: id(), name: text(input.name, 120, 'the investor’s name', true), email, holders: namesOf(input.holders), enabled: true, password: null, invite: null, createdAt: now(), createdBy: actor };
  db.investors.push(x);
  const token = issueInvite(x);
  audit(actor, 'investor.create', x.name + ' <' + x.email + '>');
  save();
  return { investor: view(x), token };
}
function updateInvestor(iid, input, actor) {
  const x = investor(iid); if (!x) throw bad('Investor not found.', 404);
  const email = emailOf(input.email), other = byEmail(email);
  if (other && other.id !== x.id) throw bad('Another investor uses that email address.');
  x.name = text(input.name, 120, 'the investor’s name', true); x.email = email; x.holders = namesOf(input.holders);
  audit(actor, 'investor.update', x.name + ' · ' + x.holders.join(', '));
  save(); return view(x);
}
function setEnabled(iid, on, actor) {
  const x = investor(iid); if (!x) throw bad('Investor not found.', 404);
  x.enabled = !!on; if (!on) endSessions(x.id);
  audit(actor, on ? 'investor.enable' : 'investor.disable', x.name); save();
}
function removeInvestor(iid, actor) {
  const x = investor(iid); if (!x) throw bad('Investor not found.', 404);
  db.investors = db.investors.filter((y) => y.id !== iid); endSessions(iid);
  audit(actor, 'investor.delete', x.name); save();
}
// A new invitation replaces any earlier one. Accepting it sets (or resets) the password.
function issueInvite(x) { const token = crypto.randomBytes(32).toString('hex'); x.invite = { hash: sha(token), expires: new Date(Date.now() + INVITE_DAYS * 86400000).toISOString() }; return token; }
function reinvite(iid, actor) { const x = investor(iid); if (!x) throw bad('Investor not found.', 404); const token = issueInvite(x); audit(actor, 'investor.invite', x.name); save(); return token; }
function inviteFor(token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
  const x = db.investors.find((y) => y.invite && y.invite.hash === sha(token));
  return x && x.enabled && x.invite.expires > now() ? x : null;
}
function acceptInvite(token, password, confirm) {
  const x = inviteFor(token); if (!x) throw bad('This invitation has expired or has already been used. Ask your HN Group contact for a new one.');
  x.password = hashPassword(password, confirm); x.invite = null; endSessions(x.id);
  audit(x.email, 'investor.password.set', x.name); save();
  return x;
}

// ---------- Passwords and sessions ----------
function hashPassword(password, confirm) {
  const p = String(password || '');
  if (p.length < 10) throw bad('Your password must be at least 10 characters.');
  if (p.length > 200) throw bad('Your password is too long.');
  if (confirm !== undefined && p !== String(confirm)) throw bad('The passwords don’t match.');
  const salt = crypto.randomBytes(16).toString('hex');
  return 'scrypt$' + salt + '$' + crypto.scryptSync(p, salt, 64).toString('hex');
}
const DUMMY = 'scrypt$' + '0'.repeat(32) + '$' + '0'.repeat(128);
function checkPassword(stored, password) {
  const [, salt, hash] = String(stored || DUMMY).split('$');
  const got = crypto.scryptSync(String(password || ''), salt || '', 64);
  return crypto.timingSafeEqual(got, Buffer.from(hash || '', 'hex').length === 64 ? Buffer.from(hash, 'hex') : Buffer.alloc(64)) && !!stored;
}
// Repeated wrong passwords lock an address for 15 minutes (5 tries).
const attempts = new Map();
function signIn(email, password) {
  const key = String(email || '').trim().toLowerCase(), a = attempts.get(key);
  if (a && a.until > Date.now()) throw bad('Too many attempts. Try again in a few minutes.', 429);
  const x = byEmail(key), ok = checkPassword(x && x.password, password);
  if (!ok || !x || !x.enabled) {
    const recent = a && a.first > Date.now() - 900000, n = (recent ? a.count : 0) + 1;
    attempts.set(key, { count: n, first: recent ? a.first : Date.now(), until: n >= 5 ? Date.now() + 900000 : 0 });
    if (attempts.size > 10000) attempts.clear();
    throw bad(x && !x.enabled && ok ? 'This investor account has been disabled.' : 'The email address or password is incorrect.', 401);
  }
  attempts.delete(key);
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions = db.sessions.filter((s) => s.expires > now());
  db.sessions.push({ hash: sha(token), investor: x.id, csrf: crypto.randomBytes(24).toString('hex'), expires: new Date(Date.now() + SESSION_DAYS * 86400000).toISOString() });
  x.lastSignIn = now(); audit(x.email, 'investor.signin', x.name); save();
  return token;
}
// The investor for a session token; sessions last 30 days from the last visit.
function session(token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
  const s = db.sessions.find((y) => y.hash === sha(token));
  if (!s || s.expires <= now()) return null;
  const x = investor(s.investor);
  if (!x || !x.enabled || !x.password) return null;
  const next = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  if (next.slice(0, 13) !== s.expires.slice(0, 13)) { s.expires = next; save(); }
  return { investor: x, csrf: s.csrf };
}
function signOut(token) { const h = sha(token); const before = db.sessions.length; db.sessions = db.sessions.filter((s) => s.hash !== h); if (db.sessions.length !== before) save(); }
function endSessions(iid) { db.sessions = db.sessions.filter((s) => s.investor !== iid); }
function changePassword(iid, current, next, confirm) {
  const x = investor(iid); if (!x) throw bad('Investor not found.', 404);
  if (!checkPassword(x.password, current)) throw bad('Your current password is incorrect.');
  x.password = hashPassword(next, confirm); endSessions(x.id); audit(x.email, 'investor.password.change', x.name); save();
}
function markNewsSeen(iid) { const x = investor(iid); if (x) { x.newsSeen = now(); save(); } }

// ---------- Valuations ----------
function addValuation(slug, input, actor) {
  const amount = Number(String(input.amount || '').replace(/[£,\s]/g, ''));
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e13) throw bad('Enter the valuation in pounds, for example 250000.');
  const asOf = String(input.asOf || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || isNaN(Date.parse(asOf))) throw bad('Enter the date of the valuation.');
  if (asOf > now().slice(0, 10)) throw bad('A valuation date can’t be in the future.');
  const entry = { id: id(), amount: Math.round(amount * 100) / 100, asOf, note: text(input.note, 300, 'the note'), by: actor, at: now() };
  (db.valuations[slug] = db.valuations[slug] || []).push(entry);
  audit(actor, 'valuation.add', slug + ' £' + entry.amount + ' at ' + asOf); save();
  return entry;
}
function removeValuation(slug, vid, actor) {
  const list = db.valuations[slug] || [], v = list.find((x) => x.id === vid);
  if (!v) throw bad('Valuation not found.', 404);
  db.valuations[slug] = list.filter((x) => x.id !== vid);
  audit(actor, 'valuation.delete', slug + ' £' + v.amount + ' at ' + v.asOf); save();
}
const valuations = () => db.valuations;

// ---------- News ----------
const news = (all) => db.news.filter((n) => all || n.status === 'published').sort((a, b) => (b.publishedAt || b.updatedAt).localeCompare(a.publishedAt || a.updatedAt));
const post = (nid) => db.news.find((n) => n.id === nid) || null;
function savePost(nid, input, actor) {
  const n = nid ? post(nid) : { id: id(), createdAt: now(), status: 'draft', publishedAt: null };
  if (!n) throw bad('News item not found.', 404);
  n.title = text(input.title, 160, 'a title', true);
  n.body = String(input.body || '').replace(/\r/g, '').trim();
  if (!n.body) throw bad('Write the news item.'); if (n.body.length > 20000) throw bad('The news item is too long.');
  n.company = text(input.company, 80, 'the company');
  const publish = input.status === 'published';
  if (publish && n.status !== 'published') n.publishedAt = now();
  n.status = publish ? 'published' : 'draft';
  n.updatedAt = now(); n.by = actor;
  if (!nid) db.news.push(n);
  audit(actor, nid ? 'news.update' : 'news.create', (publish ? '[published] ' : '[draft] ') + n.title); save();
  return n;
}
function removePost(nid, actor) { const n = post(nid); if (!n) throw bad('News item not found.', 404); db.news = db.news.filter((x) => x.id !== nid); audit(actor, 'news.delete', n.title); save(); }

const activity = (limit) => db.audit.slice(0, limit || 200);

module.exports = { init, investors, investor, view, createInvestor, updateInvestor, setEnabled, removeInvestor, reinvite, inviteFor, acceptInvite, signIn, session, signOut, changePassword, markNewsSeen, addValuation, removeValuation, valuations, news, post, savePost, removePost, activity, audit, hashPassword };
