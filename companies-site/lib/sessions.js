'use strict';
// Sign-in sessions for customers and staff, saved with the register's data so people stay signed in
// across page loads, restarts and updates until their cookie is cleared or they sign out. Only a
// hash of each token is stored. A session lasts 30 days from the last visit (renewed at most once a
// day, so visits rarely cause a write).
const crypto = require('node:crypto');
const store = require('./store');

const LIFETIME = 30 * 24 * 3600 * 1000;
const COOKIE_AGE = 400 * 24 * 3600; // seconds; the server-side expiry is what limits a session
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

function all() {
  const d = store.db;
  if (!d.sessions || typeof d.sessions !== 'object') d.sessions = {};
  return d.sessions;
}

function prune() {
  const list = all(), nowMs = Date.now();
  for (const [k, v] of Object.entries(list)) if (!v || v.expires <= nowMs) delete list[k];
}

// The session for this raw cookie token, or null.
function get(kind, raw) {
  if (!/^[a-f0-9]{64}$/.test(raw || '')) return null;
  const key = hash(raw), entry = all()[key];
  if (!entry || entry.kind !== kind) return null;
  if (entry.expires <= Date.now()) { delete all()[key]; store.save(); return null; }
  if (entry.expires - Date.now() < LIFETIME - 24 * 3600 * 1000) { entry.expires = Date.now() + LIFETIME; store.save(); }
  return entry;
}

function create(kind, user) {
  prune();
  const raw = crypto.randomBytes(32).toString('hex');
  all()[hash(raw)] = { kind, user, csrf: crypto.randomBytes(24).toString('hex'), expires: Date.now() + LIFETIME, createdAt: new Date().toISOString() };
  store.save();
  return raw;
}

function remove(raw) {
  if (!/^[a-f0-9]{64}$/.test(raw || '')) return;
  if (all()[hash(raw)]) { delete all()[hash(raw)]; store.save(); }
}

function removeUser(kind, user) {
  let changed = false;
  for (const [k, v] of Object.entries(all())) if (v.kind === kind && v.user === user) { delete all()[k]; changed = true; }
  if (changed) store.save();
}

module.exports = { get, create, remove, removeUser, COOKIE_AGE };
