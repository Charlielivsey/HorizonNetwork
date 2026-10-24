'use strict';
// HN Group Devices: the computers allowed to use HN Group's desktop apps (HN Browser, HN Secure Network and
// HN Group App Manager). Each computer has an id and a secret made on it, and a fingerprint of its hardware
// id; only hashes of the secret and fingerprint are kept. A new computer gets a pairing code; a staff member
// links it to their account on devices.hngroup.org.uk, and an owner-level or Super Admin account approves it.
// Data lives in one JSON file (devices.json), written atomically.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const STATUSES = ['unlinked', 'pending', 'authorised', 'revoked'];
const APPS = { browser: 'HN Browser', 'secure-network': 'HN Secure Network', 'app-manager': 'HN Group App Manager' };
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_DEVICES = 5000, MAX_AUDIT = 2000;
const SESSION_MS = 12 * 3600 * 1000;
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const now = () => Date.now();
let file = null, data = null;

function init(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  file = path.join(dir, 'devices.json');
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = null; }
  if (!data || typeof data !== 'object') data = {};
  data.devices = data.devices && typeof data.devices === 'object' ? data.devices : {};
  data.sessions = data.sessions && typeof data.sessions === 'object' ? data.sessions : {};
  data.audit = Array.isArray(data.audit) ? data.audit : [];
  tidy(); save();
}
function save() {
  const tmp = file + '.' + crypto.randomUUID();
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
// Unlinked computers that haven't been seen for 30 days, and old sign-ins, are cleared away.
function tidy() {
  for (const [id, d] of Object.entries(data.devices)) if (d.status === 'unlinked' && now() - (d.lastSeen || d.createdAt) > 30 * 86400000) delete data.devices[id];
  for (const [k, s] of Object.entries(data.sessions)) if (s.expires <= now()) delete data.sessions[k];
}
function audit(actor, action, detail, deviceId = null) {
  data.audit.unshift({ at: now(), actor: String(actor || 'device'), action, detail: String(detail || '').slice(0, 300), device: deviceId });
  data.audit.length = Math.min(data.audit.length, MAX_AUDIT);
}
function newCode() {
  const used = new Set(Object.values(data.devices).map((d) => d.code).filter(Boolean));
  for (;;) {
    const bytes = crypto.randomBytes(8); let code = '';
    for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length] + (i === 3 ? '-' : '');
    if (!used.has(code)) return code;
  }
}
const cleanCode = (code) => { const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : ''; };
const cleanName = (name, fallback = 'Computer') => String(name || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || fallback;

// ---------- What the apps ask: "is this computer allowed?" ----------
// Registers the computer the first time it's seen, then reports its status. A wrong secret is refused; a
// different hardware fingerprint with the right secret (a copied identity) is reported as a mismatch.
function check({ id, secret, machine, name, platform, os, app, version, ip }) {
  let d = data.devices[id];
  if (!d) {
    if (Object.keys(data.devices).length >= MAX_DEVICES) { tidy(); if (Object.keys(data.devices).length >= MAX_DEVICES) throw Object.assign(new Error('Too many computers are waiting. Please try again later.'), { status: 503 }); }
    d = data.devices[id] = { id, secretHash: hash(secret), machineHash: hash(machine), name: cleanName(name), nameFromUser: false, platform, os: String(os || '').slice(0, 60), status: 'unlinked', code: newCode(), owner: null, createdAt: now(), apps: {} };
    audit('device', 'device.registered', d.name + ' (' + platform + ')', id);
  }
  const given = Buffer.from(hash(secret)), stored = Buffer.from(d.secretHash);
  if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) throw Object.assign(new Error('This computer’s identity couldn’t be checked.'), { status: 403 });
  const mismatch = hash(machine) !== d.machineHash;
  d.lastSeen = now(); d.lastIp = String(ip || '').slice(0, 64);
  if (!d.nameFromUser) d.name = cleanName(name, d.name);
  if (os) d.os = String(os).slice(0, 60);
  if (APPS[app]) d.apps[app] = { version: String(version || '').slice(0, 32), at: now() };
  // A copied identity on other hardware is held back; an administrator can approve that hardware instead.
  if (mismatch) { d.otherMachineHash = hash(machine); if (!d.mismatchAt) { d.mismatchAt = now(); audit('device', 'device.mismatch', d.name + ' was used from different hardware', id); } }
  save();
  return view(d, { forApp: true, mismatch });
}

// ---------- The website ----------
function view(d, { forApp = false, mismatch = false } = {}) {
  const status = mismatch ? 'mismatch' : d.status;
  const base = { id: d.id, name: d.name, platform: d.platform, os: d.os, status, owner: d.owner ? { displayName: d.owner.displayName, ...(forApp ? {} : { email: d.owner.email, id: d.owner.id }) } : null };
  if (forApp) return { ...base, code: d.status === 'unlinked' && !mismatch ? d.code : null };
  return { ...base, createdAt: d.createdAt, linkedAt: d.linkedAt || null, approvedAt: d.approvedAt || null, approvedBy: d.approvedBy || null, revokedAt: d.revokedAt || null, lastSeen: d.lastSeen || null, lastIp: d.lastIp || null, mismatchAt: d.mismatchAt || null,
    apps: Object.entries(d.apps || {}).map(([k, v]) => ({ id: k, name: APPS[k] || k, version: v.version, at: v.at })) };
}
function forOwner(userId) { return Object.values(data.devices).filter((d) => d.owner?.id === userId).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)).map((d) => view(d)); }
function all() { return Object.values(data.devices).filter((d) => d.status !== 'unlinked').sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || (b.lastSeen || 0) - (a.lastSeen || 0)).map((d) => view(d)); }
function get(id) { return data.devices[id] || null; }
// Links a computer (by the code it shows) to a staff member. Owner-level and Super Admin accounts approve their own.
function link(code, user) {
  const c = cleanCode(code), d = c && Object.values(data.devices).find((x) => x.status === 'unlinked' && x.code === c);
  if (!d) throw Object.assign(new Error('That code doesn’t match a computer waiting to be added. Check the code shown in the app.'), { status: 404 });
  d.owner = { id: user.id, email: user.email, displayName: user.displayName }; d.code = null; d.linkedAt = now();
  if (user.admin) { d.status = 'authorised'; d.approvedAt = now(); d.approvedBy = user.displayName; }
  else d.status = 'pending';
  audit(user.email, user.admin ? 'device.linked-authorised' : 'device.linked', d.name, d.id); save();
  return view(d);
}
function setStatus(id, status, user) {
  const d = data.devices[id];
  if (!d || d.status === 'unlinked') throw Object.assign(new Error('That computer can’t be found.'), { status: 404 });
  if (status === 'authorised') { d.status = 'authorised'; d.approvedAt = now(); d.approvedBy = user.displayName; d.revokedAt = null; if (d.mismatchAt && d.otherMachineHash) d.machineHash = d.otherMachineHash; d.mismatchAt = null; d.otherMachineHash = null; }
  else if (status === 'revoked') { d.status = 'revoked'; d.revokedAt = now(); }
  else throw Object.assign(new Error('That change isn’t allowed.'), { status: 400 });
  audit(user.email, 'device.' + (status === 'authorised' ? 'approved' : 'revoked'), d.name, id); save();
  return view(d);
}
function rename(id, name, user) {
  const d = data.devices[id]; if (!d) throw Object.assign(new Error('That computer can’t be found.'), { status: 404 });
  d.name = cleanName(name, d.name); d.nameFromUser = true; audit(user.email, 'device.renamed', d.name, id); save();
  return view(d);
}
// Removing a computer forgets it entirely: if it's used again it starts as a new, unlinked computer.
function remove(id, user) {
  const d = data.devices[id]; if (!d) throw Object.assign(new Error('That computer can’t be found.'), { status: 404 });
  delete data.devices[id]; audit(user.email, 'device.removed', d.name, id); save();
}
function recentAudit(limit = 100) { return data.audit.slice(0, limit); }
function counts() { const c = { pending: 0, authorised: 0, revoked: 0 }; for (const d of Object.values(data.devices)) if (c[d.status] !== undefined) c[d.status]++; return c; }

// ---------- Website sign-ins ----------
function createSession(user, authSession, expires) {
  tidy();
  const token = crypto.randomBytes(32).toString('hex');
  data.sessions[hash(token)] = { user, authSession, checked: now(), expires: Math.min(now() + SESSION_MS, Number(expires) || now() + SESSION_MS) };
  save(); return token;
}
function session(token) { const s = data.sessions[hash(token || '')]; if (!s || s.expires <= now()) return null; return s; }
function updateSession(token, patch) { const s = session(token); if (s) { Object.assign(s, patch); save(); } }
function endSession(token) { if (token && data.sessions[hash(token)]) { delete data.sessions[hash(token)]; save(); } }

module.exports = { init, check, view, forOwner, all, get, link, setStatus, rename, remove, recentAudit, counts, createSession, session, updateSession, endSession, cleanCode, APPS };
