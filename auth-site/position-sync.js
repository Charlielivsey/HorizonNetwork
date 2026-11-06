'use strict';
// Discord roles that follow Horizon Network positions on the staff portal (the user's request, 6 November 2026: "the
// auth bot should automatically add and change roles as and when someones positon in Horizon Network gets updated on
// the Staff Portal").
//
// The role list and the servers are in hn-roles.json (not a /server-setup layout: the user's correction, 6 November 2026,
// "dont use setup role list. the bot will do it automatically accross the servers i gave the IDs for"). Every minute
// the bot asks the staff backend for each staff record's Discord ID and job titles at each company. When anything has
// changed (or at least every 10 minutes), in every server listed there:
//   • if any of the roles are missing, every other role is deleted and the list is created in order (autoApply);
//   • each member linked to a staff record gets the roles of their position(s) at the layout's company (for example
//     President → President, Network Permission Level 5, NA | Network Administration) and loses the position, level and
//     NA roles they no longer hold;
//   • every human member gets every separator role, Network Permission Level 1 and M | Member.
// Roles outside `positions` (Network Permission Level 2 for Trial Staff, given by hand, and B | Bots) are never touched,
// bots are never changed, and members who aren't linked to a staff record never lose roles. Listing every member needs
// the Server Members Intent (Discord Developer Portal → Bot); without it only linked staff members are checked.
const fs = require('node:fs');
const path = require('node:path');
const { ALWAYS_GIVE, isSeparator, roleName, parseLayout } = require('./server-setup');
const ROLES_FILE = path.join(__dirname, 'hn-roles.json');

// hn-roles.json → one layout per server (same roles everywhere).
function loadRoles(file = ROLES_FILE) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const servers = raw.servers && typeof raw.servers === 'object' ? Object.entries(raw.servers) : [];
  const { _note, servers: _s, ...body } = raw;
  return servers.map(([name, guildId]) => parseLayout({ ...body, server: name, guildId: String(guildId), removeUnlisted: { roles: true, channels: false } }, 'hn-roles'));
}

const ID = /^\d{15,22}$/;
const REASON = 'HN Group positions (staff portal)';

function createPositionSync({ setup, staff, rolesFile = ROLES_FILE, record = () => {}, enabled = () => true, now = () => Date.now(), fullEvery = 10 * 60000, retryApply = 60 * 60000 }) {
  let lastDigest = null, lastFull = 0, running = false;
  const applyTried = new Map();
  const state = { lastAt: null, changed: 0, errors: [] };

  // What a member should have and what the bot looks after, for one server's layout and live roles.
  function rolesFor(layout, liveRoles) {
    const ids = new Map(liveRoles.map((r) => [roleName(r.name), r.id]));
    const always = layout.roles.filter((r) => isSeparator(r.name) || ALWAYS_GIVE.has(roleName(r.name))).map((r) => ids.get(roleName(r.name))).filter(Boolean);
    const byTitle = new Map((layout.positions?.titles || []).map((t) => [roleName(t.title), t.roles.map((n) => ids.get(roleName(n))).filter(Boolean)]));
    const managed = new Set([...byTitle.values()].flat().filter((id) => !always.includes(id)));
    return { always, byTitle, managed };
  }
  // The changes for one member: roles to add and roles to remove.
  function changesFor(member, linked, layout, sets) {
    if (member.user?.bot) return { add: [], remove: [] };
    const has = new Set(member.roles || []), want = new Set(sets.always);
    if (linked) for (const t of linked.titles || []) if (roleName(t.company) === roleName(layout.positions?.company || '')) for (const id of sets.byTitle.get(roleName(t.title)) || []) want.add(id);
    const add = [...want].filter((id) => !has.has(id));
    const remove = linked ? [...has].filter((id) => sets.managed.has(id) && !want.has(id)) : [];
    return { add, remove };
  }

  async function members(guildId, people) {
    const out = [];
    let after = '0';
    try {
      for (let page = 0; page < 50; page++) {
        const rows = await setup.request('GET', '/guilds/' + guildId + '/members?limit=1000&after=' + after);
        out.push(...rows);
        if (rows.length < 1000) return out;
        after = rows.at(-1).user.id;
      }
      return out;
    } catch (e) {
      if (e.status !== 403) throw e;
    }
    // No Server Members Intent: look up the linked staff members one by one.
    const found = [];
    for (const p of people) {
      try { found.push(await setup.request('GET', '/guilds/' + guildId + '/members/' + p.id)); }
      catch (e) { if (e.status !== 404 && e.code !== 10007 && e.code !== 10013) throw e; }
    }
    return found;
  }

  async function syncGuild(layout, people) {
    const guildId = layout.guildId;
    // Missing layout roles: set the server up first (retried at most hourly if Discord or the bot's role stops it).
    if (now() - (applyTried.get(guildId) || 0) >= retryApply) {
      const a = await setup.autoApply(guildId, layout);
      if (a.applied || a.problems) applyTried.set(guildId, now());
    }
    const sets = rolesFor(layout, await setup.request('GET', '/guilds/' + guildId + '/roles'));
    const linked = new Map(people.map((p) => [p.id, p]));
    let changed = 0;
    for (const m of await members(guildId, people)) {
      const id = String(m.user?.id || '');
      if (!ID.test(id)) continue;
      const { add, remove } = changesFor(m, linked.get(id), layout, sets);
      for (const rid of add) { await setup.request('PUT', '/guilds/' + guildId + '/members/' + id + '/roles/' + rid, undefined, REASON); changed++; }
      for (const rid of remove) { await setup.request('DELETE', '/guilds/' + guildId + '/members/' + id + '/roles/' + rid, undefined, REASON); changed++; }
    }
    return changed;
  }

  async function sync(force = false) {
    if (running || !enabled()) return null;
    running = true;
    try {
      const { value } = await staff('/api/auth/discord-positions', {});
      const people = (Array.isArray(value?.people) ? value.people : []).filter((p) => p && ID.test(String(p.id))).map((p) => ({ id: String(p.id), titles: Array.isArray(p.titles) ? p.titles : [] }));
      const digest = JSON.stringify(people);
      if (!force && digest === lastDigest && now() - lastFull < fullEvery) return null;
      let changed = 0;
      const errors = [];
      for (const layout of loadRoles(rolesFile)) {
        try { changed += await syncGuild(layout, people); }
        catch (e) { errors.push(layout.server + ' (' + layout.guildId + '): ' + (e.layout ? e.message : 'failed')); }
      }
      lastDigest = digest; lastFull = now();
      Object.assign(state, { lastAt: new Date(now()).toISOString(), changed, errors });
      if (changed || errors.length) record(null, errors.length ? 'positions.sync.partial' : 'positions.sync', { changed, errors: errors.slice(0, 10) });
      return { changed, errors };
    } finally { running = false; }
  }
  return { sync, state, rolesFor, changesFor };
}

module.exports = { createPositionSync, loadRoles, ROLES_FILE };
