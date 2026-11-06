'use strict';
// The HN Group mail directory (the user's request, 6 November 2026: a self-hosted mail system replacing Google
// Workspace). One JSON file holds every hosted domain, mailbox (people's and shared), alias/forwarder, distribution
// group, shared-mailbox membership, quota and app password hash; lib/render.js turns it into the files Postfix,
// Dovecot and Rspamd read, so the mail server itself enforces everything (who receives what, who may open a shared
// mailbox, who may send as which address, how much each mailbox may store). Administrative changes are recorded in an
// append-only audit log. Nothing here ever deletes stored mail: removing a mailbox from the directory is refused while
// it exists; disabling it stops sign-in and keeps both its mail and its incoming mail.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DOMAINS = ['hngroup.org.uk', 'horizon-network.co.uk', 'horizonadvertising.co.uk', 'media.hngroup.org.uk', 'network.hngroup.org.uk'];
const EMAIL = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const LOCAL = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
// Addresses the mail system needs for itself; they can be aliases but never a person's mailbox.
const RESERVED = ['postmaster', 'abuse', 'mailer-daemon', 'root', 'hostmaster', 'noreply', 'no-reply'];
const DEFAULT_QUOTA_MB = 1024;
const MAX_QUOTA_MB = 1024 * 1024;
const fail = (status, message) => Object.assign(new Error(message), { status });
const id = () => crypto.randomBytes(8).toString('hex');
const now = () => new Date().toISOString();
const clean = (s, max = 200) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

// The shared mailboxes and distribution groups the user asked for (6 November 2026). Their members weren't given and
// must not be invented: they start empty (shared mailboxes) or marked "membership not imported yet" (groups).
const SEED_SHARED = [
  ['Finance and Billing', 'billing@hngroup.org.uk'], ['General Enquiries', 'enquiries@hngroup.org.uk'], ['HA Enquiries', 'enquiries@horizonadvertising.co.uk'],
  ['HMG Enquiries', 'enquiries@media.hngroup.org.uk'], ['HN Enquiries', 'enquiries@horizon-network.co.uk'], ['HN Group Board', 'leadership@hngroup.org.uk'],
  ['HN Group Brand', 'brand@hngroup.org.uk'], ['HN Group Careers', 'careers@hngroup.org.uk'], ['HN Group Company Directors', 'directors@hngroup.org.uk'],
  ['HN Group Everyone', 'everyone@hngroup.org.uk'], ['HN Group IT', 'it@hngroup.org.uk'], ['HN Group Legal', 'legal@hngroup.org.uk'],
  ['HN Group Security', 'security@hngroup.org.uk'], ['HN Group Support', 'support@hngroup.org.uk'], ['HN Support', 'support@horizon-network.co.uk'],
  ['Horizon Development Team', 'development@horizon-network.co.uk'],
];
const SEED_GROUPS = [
  ['All Staff', 'all-staff@hngroup.org.uk'], ['HMG Staff', 'staff@media.hngroup.org.uk'], ['HN Group Staff', 'staff@hngroup.org.uk'], ['Horizon Advertising Staff', 'staff@horizonadvertising.co.uk'],
];
// System addresses: postmaster@ and abuse@ (required by the mail standards) go to the IT shared mailbox.
const SEED_ALIASES = [['postmaster@hngroup.org.uk', 'it@hngroup.org.uk'], ['abuse@hngroup.org.uk', 'it@hngroup.org.uk'], ['dmarc-reports@hngroup.org.uk', 'it@hngroup.org.uk']];

function domainOf(address) { return String(address).split('@')[1] || ''; }
function normalAddress(value, { hosted = true, label = 'address' } = {}) {
  const a = String(value || '').trim().toLowerCase();
  if (a.length > 254 || !EMAIL.test(a)) throw fail(400, 'Enter a valid email ' + label + '.');
  if (hosted && !DOMAINS.includes(domainOf(a))) throw fail(400, 'The ' + label + ' must end in one of: ' + DOMAINS.join(', ') + '.');
  if (hosted && !LOCAL.test(a.split('@')[0])) throw fail(400, 'The part before @ can only use letters, numbers, dots, dashes and underscores.');
  return a;
}
function quotaOf(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 10 || n > MAX_QUOTA_MB) throw fail(400, 'Storage limits are between 10 MB and 1 TB.');
  return n;
}

function createDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'directory.json'), auditFile = path.join(dir, 'audit.log');
  let data;
  function blank() {
    return { version: 1, domains: DOMAINS.slice(), mailboxes: {}, aliases: {}, groups: {}, provisioning: {},
      settings: { defaultQuotaMB: DEFAULT_QUOTA_MB, sendPerHour: 200, sendBurst: 60, spamReject: 15, spamJunk: 6 }, seeded: {}, createdAt: now() };
  }
  function load() {
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; data = blank(); }
    data = { ...blank(), ...data, settings: { ...blank().settings, ...(data.settings || {}) } };
    seed();
    save();
  }
  function save() {
    const tmp = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  // Append-only audit log (one JSON line per change, each with the hash of the line before it, so edits show).
  let lastHash = '';
  try { const lines = fs.readFileSync(auditFile, 'utf8').trim().split('\n'); const last = lines[lines.length - 1]; if (last) lastHash = JSON.parse(last).hash || ''; } catch {}
  function audit(actor, action, target, details) {
    const entry = { at: now(), actor: actor ? { id: actor.accountId || actor.id || '', name: actor.displayName || actor.username || 'system', username: actor.username || '' } : { id: 'system', name: 'HN Group mail (automatic)' },
      action, target: clean(target, 300), details: details || {}, prev: lastHash };
    entry.hash = crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex');
    lastHash = entry.hash;
    fs.appendFileSync(auditFile, JSON.stringify(entry) + '\n', { mode: 0o600 });
  }
  function readAudit(limit = 300) {
    try { return fs.readFileSync(auditFile, 'utf8').trim().split('\n').filter(Boolean).slice(-limit).map((l) => JSON.parse(l)).reverse(); } catch { return []; }
  }

  function seed() {
    data.seeded = data.seeded || {};
    if (!data.seeded.shared20261106) {
      for (const [name, address] of SEED_SHARED) if (!owner(address)) { const m = newMailbox({ kind: 'shared', address, name }); data.mailboxes[m.id] = m; }
      data.seeded.shared20261106 = now();
    }
    if (!data.seeded.groups20261106) {
      for (const [name, address] of SEED_GROUPS) if (!owner(address)) { const g = { id: id(), address, name, description: '', members: [], pendingImport: true, createdAt: now(), updatedAt: now() }; data.groups[g.id] = g; }
      data.seeded.groups20261106 = now();
    }
    if (!data.seeded.aliases20261106) {
      for (const [address, target] of SEED_ALIASES) if (!owner(address)) { const a = { id: id(), address, targets: [target], note: 'Required system address', createdAt: now(), updatedAt: now() }; data.aliases[a.id] = a; }
      data.seeded.aliases20261106 = now();
    }
  }
  function newMailbox({ kind, address, name, recordId = null, quotaMB, source = 'admin' }) {
    return { id: id(), kind, address, name: clean(name, 120) || address, aliases: [], recordId, quotaMB: quotaMB || data.settings.defaultQuotaMB || DEFAULT_QUOTA_MB,
      disabled: false, suspended: false, forwardTo: [], keepCopy: true, members: kind === 'shared' ? [] : undefined, appPasswords: kind === 'person' ? [] : undefined,
      source, createdAt: now(), updatedAt: now() };
  }

  // Who owns an address right now: {type, item} or null.
  function owner(address, except) {
    const a = String(address).toLowerCase();
    for (const m of Object.values(data.mailboxes)) { if (m.id === except) continue; if (m.address === a) return { type: 'mailbox', item: m }; if ((m.aliases || []).includes(a)) return { type: 'mailbox-alias', item: m }; }
    for (const x of Object.values(data.aliases)) if (x.id !== except && x.address === a) return { type: 'alias', item: x };
    for (const g of Object.values(data.groups)) if (g.id !== except && g.address === a) return { type: 'group', item: g };
    return null;
  }
  function free(address, except) {
    if (RESERVED.includes(address.split('@')[0]) && !except) { /* reserved names are allowed only as aliases (checked by callers) */ }
    const o = owner(address, except);
    if (o) throw fail(409, address + ' is already used by ' + describe(o) + '.');
  }
  function describe(o) { return o.type === 'group' ? 'the group ' + o.item.name : o.type === 'alias' ? 'an alias' : o.type === 'mailbox-alias' ? 'an alias of ' + o.item.address : (o.item.kind === 'shared' ? 'the shared mailbox ' : 'the mailbox of ') + o.item.name; }
  const mailbox = (mid) => { const m = data.mailboxes[mid]; if (!m) throw fail(404, 'That mailbox doesn’t exist.'); return m; };
  const byAddress = (address) => Object.values(data.mailboxes).find((m) => m.address === String(address).toLowerCase()) || null;
  const byRecord = (recordId) => Object.values(data.mailboxes).find((m) => m.kind === 'person' && m.recordId === recordId) || null;

  // ---- mailboxes ----
  function createMailbox(actor, v) {
    const kind = v.kind === 'shared' ? 'shared' : 'person';
    const address = normalAddress(v.address);
    if (kind === 'person' && RESERVED.includes(address.split('@')[0])) throw fail(400, address + ' is reserved for the mail system.');
    free(address);
    const m = newMailbox({ kind, address, name: v.name || address, quotaMB: quotaOf(v.quotaMB, data.settings.defaultQuotaMB) });
    data.mailboxes[m.id] = m; save(); audit(actor, 'mailbox.create', address, { kind, quotaMB: m.quotaMB });
    return m;
  }
  function updateMailbox(actor, mid, v) {
    const m = mailbox(mid), changes = {};
    if (v.name !== undefined) { const name = clean(v.name, 120); if (!name) throw fail(400, 'Give the mailbox a name.'); if (name !== m.name) { changes.name = [m.name, name]; m.name = name; } }
    if (v.address !== undefined) {
      const address = normalAddress(v.address);
      if (address !== m.address) {
        if (m.recordId && m.source === 'staff' && !v.fromStaff) throw fail(409, 'This mailbox follows its staff record: change the email address on the staff portal.');
        free(address, m.id); changes.address = [m.address, address]; m.address = address;
      }
    }
    if (v.aliases !== undefined) {
      const list = [...new Set((Array.isArray(v.aliases) ? v.aliases : String(v.aliases).split(/[\s,;]+/)).filter(Boolean).map((a) => normalAddress(a, { label: 'alias' })))].filter((a) => a !== m.address);
      if (list.length > 50) throw fail(400, 'A mailbox can have 50 aliases at most.');
      for (const a of list) if (!(m.aliases || []).includes(a)) free(a, m.id);
      if (JSON.stringify(list) !== JSON.stringify(m.aliases || [])) { changes.aliases = [m.aliases, list]; m.aliases = list; }
    }
    if (v.quotaMB !== undefined) { const q = quotaOf(v.quotaMB, m.quotaMB); if (q !== m.quotaMB) { changes.quotaMB = [m.quotaMB, q]; m.quotaMB = q; } }
    if (v.disabled !== undefined) { const d = !!v.disabled; if (d !== !!m.disabled) { changes.disabled = [!!m.disabled, d]; m.disabled = d; } }
    if (v.forwardTo !== undefined) {
      const list = [...new Set((Array.isArray(v.forwardTo) ? v.forwardTo : String(v.forwardTo).split(/[\s,;]+/)).filter(Boolean).map((a) => normalAddress(a, { hosted: false, label: 'forwarding address' })))].filter((a) => a !== m.address);
      if (list.length > 10) throw fail(400, 'Forward to 10 addresses at most.');
      if (JSON.stringify(list) !== JSON.stringify(m.forwardTo || [])) { changes.forwardTo = [m.forwardTo, list]; m.forwardTo = list; }
    }
    if (v.keepCopy !== undefined) { const k = v.keepCopy !== false; if (k !== (m.keepCopy !== false)) { changes.keepCopy = [m.keepCopy !== false, k]; m.keepCopy = k; } }
    if (!Object.keys(changes).length) return m;
    m.updatedAt = now(); save(); audit(actor, v.fromStaff ? 'mailbox.sync' : 'mailbox.update', m.address, changes);
    return m;
  }
  // Shared mailbox members: [{mailbox: id, access: 'full' | 'read', sendAs: bool}]. Members are individual mailboxes,
  // so access always follows the person who owns that mailbox (through their HN Group Auth account).
  function setMembers(actor, mid, list) {
    const m = mailbox(mid);
    if (m.kind !== 'shared') throw fail(400, 'Only shared mailboxes have members.');
    const out = [], seen = new Set();
    for (const x of (Array.isArray(list) ? list : []).slice(0, 500)) {
      const target = data.mailboxes[x && x.mailbox];
      if (!target || target.kind !== 'person') throw fail(400, 'Members must be people’s mailboxes.');
      if (seen.has(target.id)) continue; seen.add(target.id);
      out.push({ mailbox: target.id, access: x.access === 'read' ? 'read' : 'full', sendAs: !!x.sendAs });
    }
    const before = (m.members || []).map((x) => ({ ...x, address: (data.mailboxes[x.mailbox] || {}).address }));
    m.members = out; m.updatedAt = now(); save();
    audit(actor, 'shared.members', m.address, { before, after: out.map((x) => ({ ...x, address: data.mailboxes[x.mailbox].address })) });
    return m;
  }
  function removeMailbox(actor, mid, { usageKB }) {
    const m = mailbox(mid);
    // Stored mail is never deleted from here: a mailbox with mail can only be disabled.
    if (usageKB === null || usageKB === undefined) throw fail(409, 'This mailbox’s storage couldn’t be checked, so it wasn’t removed. Disable it instead.');
    if (usageKB > 0) throw fail(409, 'This mailbox still holds mail, so it can only be disabled (its mail is kept).');
    if (m.kind === 'person' && m.recordId && m.source === 'staff') throw fail(409, 'This mailbox belongs to a staff record. Disable it instead.');
    for (const s of Object.values(data.mailboxes)) if (s.members) s.members = s.members.filter((x) => x.mailbox !== mid);
    delete data.mailboxes[mid]; save(); audit(actor, 'mailbox.remove', m.address, { kind: m.kind });
  }

  // ---- app passwords (mail apps): created by the mailbox's owner in HN Mail ----
  function addAppPassword(actor, mid, label) {
    const m = mailbox(mid);
    if (m.kind !== 'person') throw fail(400, 'App passwords belong to people’s mailboxes.');
    if ((m.appPasswords || []).length >= 20) throw fail(400, 'You can have 20 app passwords at most. Remove one you no longer use.');
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789', bytes = crypto.randomBytes(20);
    const secret = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('').replace(/(.{5})(?=.)/g, '$1-');
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
    const entry = { id: id(), label: clean(label, 60) || 'Mail app', salt: salt.toString('hex'), hash, createdAt: now() };
    m.appPasswords = [...(m.appPasswords || []), entry]; save();
    audit(actor, 'app-password.create', m.address, { id: entry.id, label: entry.label });
    return { id: entry.id, label: entry.label, createdAt: entry.createdAt, password: secret };
  }
  function removeAppPassword(actor, mid, pid) {
    const m = mailbox(mid), before = (m.appPasswords || []).length;
    m.appPasswords = (m.appPasswords || []).filter((p) => p.id !== pid);
    if (m.appPasswords.length === before) throw fail(404, 'That app password doesn’t exist.');
    save(); audit(actor, 'app-password.revoke', m.address, { id: pid });
  }

  // ---- aliases / forwarders ----
  function cleanTargets(list) {
    const out = [...new Set((Array.isArray(list) ? list : String(list || '').split(/[\s,;]+/)).filter(Boolean).map((a) => normalAddress(a, { hosted: false, label: 'destination' })))];
    if (!out.length) throw fail(400, 'Add at least one destination.');
    if (out.length > 100) throw fail(400, '100 destinations at most.');
    for (const t of out) if (DOMAINS.includes(domainOf(t)) && !owner(t)) throw fail(400, t + ' isn’t a mailbox, alias or group here.');
    return out;
  }
  function saveAlias(actor, aid, v) {
    const address = normalAddress(v.address, { label: 'alias' });
    const targets = cleanTargets(v.targets);
    if (targets.includes(address)) throw fail(400, 'An alias can’t point to itself.');
    if (aid) {
      const a = data.aliases[aid]; if (!a) throw fail(404, 'That alias doesn’t exist.');
      if (address !== a.address) free(address, a.id);
      const before = { address: a.address, targets: a.targets };
      Object.assign(a, { address, targets, note: clean(v.note, 200), updatedAt: now() }); save(); audit(actor, 'alias.update', address, { before, after: { address, targets } }); return a;
    }
    free(address);
    const a = { id: id(), address, targets, note: clean(v.note, 200), createdAt: now(), updatedAt: now() };
    data.aliases[a.id] = a; save(); audit(actor, 'alias.create', address, { targets }); return a;
  }
  function removeAlias(actor, aid) { const a = data.aliases[aid]; if (!a) throw fail(404, 'That alias doesn’t exist.'); delete data.aliases[aid]; save(); audit(actor, 'alias.remove', a.address, { targets: a.targets }); }

  // ---- distribution groups (members: addresses of mailboxes, aliases, other groups, or outside addresses) ----
  function saveGroup(actor, gid, v) {
    const address = normalAddress(v.address, { label: 'group address' });
    const name = clean(v.name, 120) || address;
    const members = [...new Set((Array.isArray(v.members) ? v.members : String(v.members || '').split(/[\s,;]+/)).filter(Boolean).map((a) => normalAddress(a, { hosted: false, label: 'member address' })))];
    if (members.length > 2000) throw fail(400, '2,000 members at most.');
    for (const t of members) if (DOMAINS.includes(domainOf(t)) && !owner(t, undefined)) throw fail(400, t + ' isn’t a mailbox, alias or group here.');
    if (members.includes(address)) throw fail(400, 'A group can’t contain itself.');
    const g = gid ? data.groups[gid] : null;
    if (gid && !g) throw fail(404, 'That group doesn’t exist.');
    if (!g || address !== g.address) free(address, g ? g.id : undefined);
    const next = { ...(g || { id: id(), createdAt: now() }), address, name, description: clean(v.description, 300), members, pendingImport: g ? (g.pendingImport && !members.length) : false, updatedAt: now() };
    // Nested groups must not loop back to this one.
    const trial = { ...data.groups, [next.id]: next };
    if (loops(trial, next.id)) throw fail(400, 'That would make groups contain each other in a loop.');
    const before = g ? { address: g.address, members: g.members } : null;
    data.groups[next.id] = next; save(); audit(actor, g ? 'group.update' : 'group.create', address, { before, after: { address, members } });
    return next;
  }
  function loops(groups, start) {
    const byAddr = new Map(Object.values(groups).map((g) => [g.address, g]));
    const visit = (g, trail) => { for (const a of g.members) { const n = byAddr.get(a); if (!n) continue; if (n.id === start || trail.has(n.id)) return true; if (visit(n, new Set([...trail, n.id]))) return true; } return false; };
    return visit(groups[start], new Set([start]));
  }
  function removeGroup(actor, gid) { const g = data.groups[gid]; if (!g) throw fail(404, 'That group doesn’t exist.'); for (const o of Object.values(data.groups)) if (o.members.includes(g.address)) throw fail(409, g.address + ' is a member of ' + o.name + '. Remove it there first.'); delete data.groups[gid]; save(); audit(actor, 'group.remove', g.address, { members: g.members }); }

  function setSettings(actor, v) {
    const s = data.settings, changes = {};
    const num = (k, lo, hi, label) => { if (v[k] === undefined) return; const n = Math.round(Number(v[k])); if (!Number.isFinite(n) || n < lo || n > hi) throw fail(400, label + ' must be between ' + lo + ' and ' + hi + '.'); if (n !== s[k]) { changes[k] = [s[k], n]; s[k] = n; } };
    num('defaultQuotaMB', 10, MAX_QUOTA_MB, 'The default storage limit (MB)');
    num('sendPerHour', 10, 5000, 'Messages per hour');
    num('sendBurst', 5, 1000, 'The burst size');
    num('spamJunk', 3, 30, 'The Junk score');
    num('spamReject', 6, 50, 'The reject score');
    if (s.spamReject <= s.spamJunk) throw fail(400, 'The reject score must be higher than the Junk score.');
    if (Object.keys(changes).length) { save(); audit(actor, 'settings.update', 'settings', changes); }
    return s;
  }

  load();
  return {
    DOMAINS, data: () => data, save, audit, readAudit, mailbox, byAddress, byRecord, owner, free, newMailbox,
    createMailbox, updateMailbox, setMembers, removeMailbox, addAppPassword, removeAppPassword, saveAlias, removeAlias, saveGroup, removeGroup, setSettings,
    reload: load,
  };
}
module.exports = { createDirectory, DOMAINS, normalAddress, EMAIL, DEFAULT_QUOTA_MB };
