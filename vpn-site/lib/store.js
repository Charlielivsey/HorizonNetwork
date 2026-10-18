'use strict';
// VPN devices and sign-ins, kept in DATA_DIR/vpn.json. Only a hash of each sign-in token is stored.
// Devices get fixed addresses in 10.88.0.0/24 (and fd88:88::/64, which keeps IPv6 inside the tunnel).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_DEVICES = 5;
const SESSION_DAYS = 30;
let file, db, avatarDir;
const id = () => crypto.randomBytes(12).toString('hex');
const now = () => new Date().toISOString();
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

function init(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  file = path.join(dir, 'vpn.json');
  avatarDir = path.join(dir, 'avatars');
  fs.mkdirSync(avatarDir, { recursive: true, mode: 0o700 });
  db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  db.devices = db.devices || []; db.sessions = db.sessions || {}; db.audit = db.audit || []; db.avatars = db.avatars || {};
  prune();
}
function save() {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function audit(who, action, detail) {
  db.audit.push({ at: now(), who, action, detail: detail || '' });
  if (db.audit.length > 3000) db.audit.splice(0, db.audit.length - 3000);
}
function prune() { for (const [k, v] of Object.entries(db.sessions)) if (!v || v.expires <= Date.now()) delete db.sessions[k]; }

// ---------- Sign-ins ----------
// The Mac app's sign-in lasts 30 days; the website's lasts as long as its HN Group Auth sign-in
// (at most 12 hours) and is rechecked with Auth while it's used.
function createSession(user, opts) {
  const o = opts || {};
  prune();
  const token = crypto.randomBytes(32).toString('hex');
  const expires = o.app ? Date.now() + SESSION_DAYS * 86400000 : Math.min(o.expires || Infinity, Date.now() + 12 * 3600000);
  db.sessions[hash(token)] = { user, expires, createdAt: now(), kind: o.app ? 'app' : 'web', ...(o.authSession ? { authSession: o.authSession, checked: Date.now(), avatarChecked: Date.now() } : {}) };
  audit(user.email, o.app ? 'sign-in.app' : 'sign-in.web');
  save();
  return token;
}
function session(token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
  const s = db.sessions[hash(token)];
  if (!s || s.expires <= Date.now()) return null;
  s.lastUsedAt = now();
  return s;
}
// A person's current sign-ins, for their profile. Each is identified by part of its stored hash.
function sessionsFor(personId, currentToken) {
  prune();
  const mine = currentToken && /^[a-f0-9]{64}$/.test(currentToken) ? hash(currentToken) : '';
  return Object.entries(db.sessions).filter(([, v]) => v.user.id === personId)
    .map(([k, v]) => ({ id: k.slice(0, 16), kind: v.kind || 'web', createdAt: v.createdAt, lastUsedAt: v.lastUsedAt || v.createdAt, appVersion: v.appVersion || null, current: k === mine }))
    .sort((a, b) => String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)));
}
function endSessionById(personId, id) {
  const key = /^[a-f0-9]{16}$/.test(id || '') && Object.keys(db.sessions).find((k) => k.startsWith(id) && db.sessions[k].user.id === personId);
  if (!key) return false;
  audit(db.sessions[key].user.email, 'sign-out.other', db.sessions[key].kind);
  delete db.sessions[key]; save();
  return true;
}
// Recent VPN activity for one person (newest first).
const activityFor = (email, limit) => db.audit.filter((a) => a.who === email).slice(-(limit || 20)).reverse();
function endSession(token) { if (/^[a-f0-9]{64}$/.test(token || '') && db.sessions[hash(token)]) { delete db.sessions[hash(token)]; save(); } }
function endSessionsFor(personId) {
  for (const [k, v] of Object.entries(db.sessions)) if (v.user.id === personId) delete db.sessions[k];
}

// ---------- Profile pictures ----------
// A copy of each person's staff profile picture, taken from HN Group Auth when they sign in (and
// refreshed while the website is used), so the website and the Mac app can show it.
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const avatarPath = (personId) => path.join(avatarDir, hash('avatar:' + personId));
function setAvatar(personId, image, type) {
  if (!personId) return;
  const mime = String(type || '').split(';')[0].trim().toLowerCase();
  if (!image || !image.length || image.length > 3 * 1024 * 1024 || !AVATAR_TYPES.includes(mime)) {
    if (db.avatars[personId]) { delete db.avatars[personId]; fs.rmSync(avatarPath(personId), { force: true }); save(); }
    return;
  }
  const tag = hash(image).slice(0, 16);
  if (db.avatars[personId] && db.avatars[personId].tag === tag) return;
  const tmp = avatarPath(personId) + '.tmp';
  fs.writeFileSync(tmp, image, { mode: 0o600 }); fs.renameSync(tmp, avatarPath(personId));
  db.avatars[personId] = { mime, tag, updatedAt: now() };
  save();
}
function avatar(personId) {
  const a = db.avatars[personId];
  if (!a) return null;
  try { return { ...a, image: fs.readFileSync(avatarPath(personId)) }; } catch { return null; }
}
const avatarTag = (personId) => (db.avatars[personId] || {}).tag || null;

// ---------- Devices ----------
const devices = () => db.devices;
const devicesFor = (personId) => db.devices.filter((d) => d.personId === personId);
const device = (deviceId) => db.devices.find((d) => d.id === deviceId) || null;

function nextAddress() {
  const used = new Set(db.devices.map((d) => d.ipv4));
  for (let n = 2; n < 255; n++) if (!used.has('10.88.0.' + n)) return n;
  throw Object.assign(new Error('The VPN has no free addresses left. Ask an administrator to remove old devices.'), { status: 409 });
}

function addDevice(user, name, publicKey, presharedKey) {
  name = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!name) throw Object.assign(new Error('Give this device a name, for example "Charlie’s MacBook".'), { status: 400 });
  if (devicesFor(user.id).length >= MAX_DEVICES) throw Object.assign(new Error('You can have up to ' + MAX_DEVICES + ' devices. Remove one you no longer use first.'), { status: 409 });
  if (db.devices.some((d) => d.publicKey === publicKey)) throw Object.assign(new Error('This device is already registered.'), { status: 409 });
  const n = nextAddress();
  const d = { id: id(), personId: user.id, email: user.email, displayName: user.displayName, name, publicKey, presharedKey, ipv4: '10.88.0.' + n, ipv6: 'fd88:88::' + n.toString(16), createdAt: now() };
  db.devices.push(d);
  audit(user.email, 'device.add', name + ' ' + d.ipv4);
  save();
  return d;
}
function removeDevice(deviceId, who) {
  const d = device(deviceId);
  if (!d) return null;
  db.devices = db.devices.filter((x) => x.id !== deviceId);
  audit(who, 'device.remove', d.email + ' ' + d.name);
  save();
  return d;
}
// Staff accounts that have been disabled or deleted lose their devices and sign-ins.
function removePeople(personIds, who) {
  const gone = db.devices.filter((d) => personIds.includes(d.personId));
  if (!gone.length && !Object.values(db.sessions).some((s) => personIds.includes(s.user.id)) && !personIds.some((p) => db.avatars[p])) return [];
  db.devices = db.devices.filter((d) => !personIds.includes(d.personId));
  for (const p of personIds) { endSessionsFor(p); if (db.avatars[p]) { delete db.avatars[p]; fs.rmSync(avatarPath(p), { force: true }); } }
  for (const d of gone) audit(who, 'device.remove', d.email + ' ' + d.name + ' (account no longer enabled)');
  save();
  return gone;
}

module.exports = { init, sessionsFor, endSessionById, activityFor, setAvatar, avatar, avatarTag, save, audit, MAX_DEVICES, createSession, session, endSession, devices, devicesFor, device, addDevice, removeDevice, removePeople, get db() { return db; } };
