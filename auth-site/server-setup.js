'use strict';
// /server-setup: the Auth bot sets a Discord server up from a layout (the user's request, 2 November 2026: "a
// function to the auth bot … SLASH COMMANDS ONLY where i can get it to set the server channels roles and permissions
// and channel permissions how i want … when i run the command in the server it should set it up … you should get
// the server ID").
//
// Layouts are JSON files in discord-layouts/ (shipped with Auth). Each names the Discord server it is for; the
// command reads the server ID from where it is run, checks the name the first time and remembers the ID after that.
// Only the Discord accounts in ALLOWED_USERS may run it. /server-setup preview shows every change without making
// it; /server-setup apply makes them. Nothing outside the layout is removed unless the layout asks for it.
const fs = require('node:fs');
const path = require('node:path');

const API = 'https://discord.com/api/v10';
const ID = /^\d{15,22}$/;
const COMMAND = 'server-setup';
// Discord user IDs allowed to run /server-setup (the user's requests, 2 November 2026).
const ALLOWED_USERS = new Set(['1449876557035475085', '1256504335110635531']);
const fail = (message) => Object.assign(new Error(message), { layout: true });

// Discord permission flags (https://discord.com/developers/docs/topics/permissions).
const FLAGS = {
  CreateInstantInvite: 0, KickMembers: 1, BanMembers: 2, Administrator: 3, ManageChannels: 4, ManageGuild: 5, AddReactions: 6,
  ViewAuditLog: 7, PrioritySpeaker: 8, Stream: 9, ViewChannel: 10, SendMessages: 11, SendTTSMessages: 12, ManageMessages: 13,
  EmbedLinks: 14, AttachFiles: 15, ReadMessageHistory: 16, MentionEveryone: 17, UseExternalEmojis: 18, ViewGuildInsights: 19,
  Connect: 20, Speak: 21, MuteMembers: 22, DeafenMembers: 23, MoveMembers: 24, UseVAD: 25, ChangeNickname: 26, ManageNicknames: 27,
  ManageRoles: 28, ManageWebhooks: 29, ManageGuildExpressions: 30, UseApplicationCommands: 31, RequestToSpeak: 32, ManageEvents: 33,
  ManageThreads: 34, CreatePublicThreads: 35, CreatePrivateThreads: 36, UseExternalStickers: 37, SendMessagesInThreads: 38,
  UseEmbeddedActivities: 39, ModerateMembers: 40, ViewCreatorMonetizationAnalytics: 41, UseSoundboard: 42, CreateGuildExpressions: 43,
  CreateEvents: 44, UseExternalSounds: 45, SendVoiceMessages: 46, SendPolls: 49, UseExternalApps: 50,
};
const ALIASES = { ManageServer: 'ManageGuild', ManageEmojisAndStickers: 'ManageGuildExpressions', ReadMessages: 'ViewChannel', ViewChannels: 'ViewChannel',
  UseVoiceActivity: 'UseVAD', UseSlashCommands: 'UseApplicationCommands', TimeoutMembers: 'ModerateMembers', UseActivities: 'UseEmbeddedActivities' };
const key = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');
const BY_KEY = new Map([...Object.keys(FLAGS).map((n) => [key(n), n]), ...Object.entries(ALIASES).map(([a, n]) => [key(a), n])]);
function bits(list, where) {
  if (list === undefined) return undefined;
  if (!Array.isArray(list)) throw fail(where + ': permissions must be a list of permission names.');
  let value = 0n;
  for (const name of list) {
    const flag = BY_KEY.get(key(name));
    if (!flag) throw fail(where + ': unknown permission "' + name + '".');
    value |= 1n << BigInt(FLAGS[flag]);
  }
  return value.toString();
}
const ADMINISTRATOR = 1n << 3n, MANAGE_CHANNELS = 1n << 4n, MANAGE_ROLES = 1n << 28n;

const TYPES = { text: 0, voice: 2, category: 4, announcement: 5, stage: 13, forum: 15 };
const TEXTLIKE = new Set([0, 5, 15]);
// Discord stores text-style channel names in lower case with dashes for spaces, so compare them that way.
const channelName = (name, type) => TEXTLIKE.has(type) ? String(name).trim().toLowerCase().replace(/\s+/g, '-') : String(name).trim().toLowerCase();
const roleName = (name) => String(name).trim().toLowerCase();
const EVERYONE = '@everyone';

// ----- Layouts -----
function overwrites(spec, where) {
  if (spec === undefined) return undefined;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw fail(where + ': permissions must be an object of role name → { allow, deny }.');
  return Object.entries(spec).map(([role, v]) => {
    if (!v || typeof v !== 'object') throw fail(where + ': permissions for "' + role + '" need allow and/or deny lists.');
    for (const k of Object.keys(v)) if (!['allow', 'deny'].includes(k)) throw fail(where + ': "' + role + '" has an unknown field "' + k + '".');
    return { role, allow: bits(v.allow || [], where + ' (' + role + ')'), deny: bits(v.deny || [], where + ' (' + role + ')') };
  });
}
function channelSpec(c, where, category) {
  if (!c || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 100) throw fail(where + ': every channel needs a name (up to 100 characters).');
  const type = TYPES[c.type || 'text'];
  if (type === undefined || type === 4) throw fail(where + ' "' + c.name + '": type must be text, voice, announcement, stage or forum.');
  const at = where + ' "' + c.name + '"';
  for (const k of Object.keys(c)) if (!['name', 'type', 'topic', 'nsfw', 'slowmode', 'userLimit', 'bitrate', 'permissions'].includes(k)) throw fail(at + ': unknown field "' + k + '".');
  if (c.topic !== undefined && (typeof c.topic !== 'string' || c.topic.length > 1024)) throw fail(at + ': topic must be text up to 1,024 characters.');
  if (c.slowmode !== undefined && !(Number.isInteger(c.slowmode) && c.slowmode >= 0 && c.slowmode <= 21600)) throw fail(at + ': slowmode is 0–21600 seconds.');
  if (c.userLimit !== undefined && !(Number.isInteger(c.userLimit) && c.userLimit >= 0 && c.userLimit <= 99)) throw fail(at + ': userLimit is 0–99.');
  if (c.bitrate !== undefined && !(Number.isInteger(c.bitrate) && c.bitrate >= 8000 && c.bitrate <= 384000)) throw fail(at + ': bitrate is 8000–384000.');
  return { name: c.name.trim(), type, topic: c.topic, nsfw: c.nsfw === undefined ? undefined : !!c.nsfw, slowmode: c.slowmode, userLimit: c.userLimit, bitrate: c.bitrate,
    overwrites: overwrites(c.permissions, at), category };
}
function parseLayout(raw, id) {
  const at = 'Layout "' + id + '"';
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw fail(at + ' is not a JSON object.');
  for (const k of Object.keys(raw)) if (!['server', 'guildId', 'description', 'removeUnlisted', 'everyone', 'roles', 'categories', 'channels', 'roleGrants'].includes(k)) throw fail(at + ': unknown field "' + k + '".');
  if (typeof raw.server !== 'string' || !raw.server.trim()) throw fail(at + ': "server" must be the Discord server’s name.');
  if (raw.guildId !== undefined && !ID.test(String(raw.guildId))) throw fail(at + ': guildId must be a Discord server ID.');
  const roles = (raw.roles || []).map((r, i) => {
    if (!r || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 100 || roleName(r.name) === EVERYONE) throw fail(at + ': role ' + (i + 1) + ' needs a name (not @everyone).');
    for (const k of Object.keys(r)) if (!['name', 'color', 'hoist', 'mentionable', 'permissions'].includes(k)) throw fail(at + ' role "' + r.name + '": unknown field "' + k + '".');
    if (r.color !== undefined && !/^#?[0-9a-fA-F]{6}$/.test(String(r.color))) throw fail(at + ' role "' + r.name + '": color must be like #5514B4.');
    return { name: r.name.trim(), color: r.color === undefined ? undefined : parseInt(String(r.color).replace('#', ''), 16), hoist: r.hoist === undefined ? undefined : !!r.hoist,
      mentionable: r.mentionable === undefined ? undefined : !!r.mentionable, permissions: bits(r.permissions, at + ' role "' + r.name + '"') };
  });
  const categories = (raw.categories || []).map((c) => {
    if (!c || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 100) throw fail(at + ': every category needs a name.');
    for (const k of Object.keys(c)) if (!['name', 'permissions', 'channels'].includes(k)) throw fail(at + ' category "' + c.name + '": unknown field "' + k + '".');
    const name = c.name.trim();
    return { name, overwrites: overwrites(c.permissions, at + ' category "' + name + '"'), channels: (c.channels || []).map((ch) => channelSpec(ch, at + ' category "' + name + '" channel', name)) };
  });
  const channels = (raw.channels || []).map((ch) => channelSpec(ch, at + ' channel', null));
  const unique = (list, label, norm) => { const seen = new Set(); for (const x of list) { const k = norm(x); if (seen.has(k)) throw fail(at + ': two ' + label + ' are called "' + x.name + '".'); seen.add(k); } };
  unique(roles, 'roles', (r) => roleName(r.name));
  unique(categories, 'categories', (c) => roleName(c.name));
  for (const group of [channels, ...categories.map((c) => c.channels)]) unique(group, 'channels in the same place', (c) => channelName(c.name, c.type) + '/' + (c.type === 2 || c.type === 13 ? 'v' : 't'));
  // roleGrants: { "Role they have" (or "@everyone" for every member who isn't a bot): ["Role they also get", …] }.
  const roleGrants = [];
  if (raw.roleGrants !== undefined) {
    if (!raw.roleGrants || typeof raw.roleGrants !== 'object' || Array.isArray(raw.roleGrants)) throw fail(at + ': roleGrants must be an object of role name → list of role names.');
    for (const [from, to] of Object.entries(raw.roleGrants)) {
      if (!Array.isArray(to) || !to.length || to.some((x) => typeof x !== 'string' || !x.trim() || roleName(x) === EVERYONE)) throw fail(at + ': roleGrants "' + from + '" must list the roles to give.');
      roleGrants.push({ from: from.trim(), to: to.map((x) => x.trim()) });
    }
  }
  const rm = raw.removeUnlisted || {};
  return { id, server: raw.server.trim(), guildId: raw.guildId ? String(raw.guildId) : '', description: typeof raw.description === 'string' ? raw.description.slice(0, 100) : '',
    removeRoles: rm.roles === true, removeChannels: rm.channels === true, everyone: bits(raw.everyone, at + ' @everyone'), roles, categories, channels, roleGrants };
}
function loadLayouts(dir) {
  const out = [], errors = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^[a-z0-9-]{1,40}\.json$/.test(f)).sort(); } catch {}
  for (const f of files) {
    const id = f.slice(0, -5);
    try { out.push(parseLayout(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), id)); }
    catch (e) { errors.push(e.layout ? e.message : 'Layout "' + id + '" is not valid JSON.'); }
  }
  return { layouts: out, errors };
}

// ----- Plan: what has to change, worked out before anything is changed -----
function plan(layout, guild, roles, channels, botUserId, botRoleIds) {
  const problems = [], steps = [], everyoneRole = roles.find((r) => r.id === guild.id);
  const byRole = new Map(roles.map((r) => [roleName(r.name), r]));
  const botTop = Math.max(0, ...roles.filter((r) => botRoleIds.includes(r.id)).map((r) => r.position));
  let botPerms = BigInt(everyoneRole?.permissions || 0);
  for (const r of roles) if (botRoleIds.includes(r.id)) botPerms |= BigInt(r.permissions);
  if (guild.owner_id === botUserId) botPerms |= ADMINISTRATOR;
  if (!(botPerms & ADMINISTRATOR) && ((botPerms & (MANAGE_ROLES | MANAGE_CHANNELS)) !== (MANAGE_ROLES | MANAGE_CHANNELS)))
    problems.push('The bot needs Administrator (or at least Manage Roles and Manage Channels) in this server.');

  // @everyone
  if (layout.everyone !== undefined && everyoneRole && String(everyoneRole.permissions) !== layout.everyone)
    steps.push({ kind: 'role', op: 'update', id: guild.id, name: EVERYONE, body: { permissions: layout.everyone }, why: 'permissions' });
  // Roles
  const roleIds = new Map([...roles.filter((r) => r.id !== guild.id).map((r) => [roleName(r.name), r.id]), [EVERYONE, guild.id]]);
  for (const r of layout.roles) {
    const have = byRole.get(roleName(r.name));
    if (have && have.managed) { problems.push('"' + have.name + '" is managed by an integration and can’t be changed.'); continue; }
    if (have && have.position >= botTop) { problems.push('"' + have.name + '" is above (or level with) the bot’s own role; move the bot’s role higher in Server Settings → Roles.'); continue; }
    const body = {};
    if (r.permissions !== undefined && (!have || String(have.permissions) !== r.permissions)) body.permissions = r.permissions;
    if (r.color !== undefined && (!have || have.color !== r.color)) body.color = r.color;
    if (r.hoist !== undefined && (!have || have.hoist !== r.hoist)) body.hoist = r.hoist;
    if (r.mentionable !== undefined && (!have || have.mentionable !== r.mentionable)) body.mentionable = r.mentionable;
    if (have) { roleIds.set(roleName(r.name), have.id); if (Object.keys(body).length) steps.push({ kind: 'role', op: 'update', id: have.id, name: have.name, body, why: Object.keys(body).join(', ') }); }
    else steps.push({ kind: 'role', op: 'create', name: r.name, body: { name: r.name, permissions: r.permissions || '0', ...body } });
  }
  // Role order: the layout's roles, top first, directly under the bot's own role.
  const listed = layout.roles.map((r) => byRole.get(roleName(r.name))).filter(Boolean);
  const inOrder = listed.every((r, i) => i === 0 || listed[i - 1].position > r.position);
  if (layout.roles.length > 1 && (!inOrder || listed.length < layout.roles.length)) steps.push({ kind: 'role-order', names: layout.roles.map((r) => r.name), top: botTop });

  // Overwrites: role names → role ids (roles the layout creates are resolved when they exist).
  const knownRole = (name) => roleName(name) === EVERYONE || byRole.has(roleName(name)) || layout.roles.some((r) => roleName(r.name) === roleName(name));
  const check = (list, where) => { for (const o of list || []) if (!knownRole(o.role)) problems.push(where + ' gives permissions to "' + o.role + '", which isn’t a role in the layout or the server.'); };

  // Categories and channels, matched by name (and type) so a second run changes only what differs.
  const claimed = new Set();
  const find = (name, type, parentId) => {
    const want = channelName(name, type), ok = (c) => !claimed.has(c.id) && channelName(c.name, c.type) === want && (c.type === type || (TEXTLIKE.has(c.type) && TEXTLIKE.has(type) && type !== 15 && c.type !== 15));
    return channels.find((c) => ok(c) && (parentId === undefined || (c.parent_id || null) === parentId)) || channels.find(ok) || null;
  };
  const items = [];
  for (const c of layout.categories) {
    check(c.overwrites, 'Category "' + c.name + '"');
    const have = find(c.name, 4); if (have) claimed.add(have.id);
    items.push({ spec: { ...c, type: 4 }, have, parent: null });
  }
  for (const ch of layout.channels) { check(ch.overwrites, 'Channel "' + ch.name + '"'); const have = find(ch.name, ch.type, null); if (have) claimed.add(have.id); items.push({ spec: ch, have, parent: null }); }
  for (const c of layout.categories) for (const ch of c.channels) {
    check(ch.overwrites, 'Channel "' + ch.name + '"');
    const cat = items.find((x) => x.spec.type === 4 && x.spec.name === c.name);
    const have = find(ch.name, ch.type, cat.have ? cat.have.id : undefined); if (have) claimed.add(have.id);
    items.push({ spec: ch, have, parent: c.name, categoryOverwrites: c.overwrites });
  }
  for (const it of items) steps.push({ kind: 'channel', ...it, op: it.have ? 'update' : 'create' });
  for (const g of layout.roleGrants) for (const n of [g.from, ...g.to]) if (!knownRole(n)) problems.push('roleGrants uses "' + n + '", which isn’t a role in the layout or the server.');
  if (layout.roleGrants.length) steps.push({ kind: 'grants', grants: layout.roleGrants });
  steps.push({ kind: 'channel-order', categories: layout.categories.map((c) => c.name), top: layout.channels.map((c) => c.name) });

  // Removals, only when the layout asks for them.
  if (layout.removeChannels) {
    const keep = new Set([guild.rules_channel_id, guild.public_updates_channel_id, guild.safety_alerts_channel_id].filter(Boolean));
    for (const c of channels) if (!claimed.has(c.id) && !keep.has(c.id)) steps.push({ kind: 'remove-channel', id: c.id, name: c.name, type: c.type });
  }
  if (layout.removeRoles) {
    const wanted = new Set(layout.roles.map((r) => roleName(r.name)));
    for (const r of roles) if (r.id !== guild.id && !r.managed && r.position < botTop && !wanted.has(roleName(r.name))) steps.push({ kind: 'remove-role', id: r.id, name: r.name });
  }
  return { problems, steps, roleIds, botTop };
}

const label = (s) => s.kind === 'channel' ? (s.spec.type === 4 ? 'category' : Object.keys(TYPES).find((k) => TYPES[k] === s.spec.type) + ' channel') + ' "' + s.spec.name + '"' : '';
function describe(steps) {
  const lines = [];
  for (const s of steps) {
    if (s.kind === 'role') lines.push((s.op === 'create' ? '➕ Create role ' : '✏️ Update role ') + '"' + s.name + '"' + (s.why ? ' (' + s.why + ')' : ''));
    else if (s.kind === 'role-order') lines.push('↕️ Order roles: ' + s.names.join(' › '));
    else if (s.kind === 'channel') lines.push((s.op === 'create' ? '➕ Create ' : '🔧 Check ') + label(s) + (s.parent ? ' in "' + s.parent + '"' : ''));
    else if (s.kind === 'remove-channel') lines.push('🗑️ Delete channel "' + s.name + '"');
    else if (s.kind === 'remove-role') lines.push('🗑️ Delete role "' + s.name + '"');
    else if (s.kind === 'grants') for (const g of s.grants) lines.push('👥 Give ' + g.to.map((n) => '"' + n + '"').join(', ') + ' to ' + (roleName(g.from) === EVERYONE ? 'every member (not bots)' : 'everyone with "' + g.from + '"') + ' who doesn’t have it');
  }
  return lines;
}

// ----- Doing it -----
function createServerSetup({ config, fetcher = fetch, dir = path.join(__dirname, 'discord-layouts'), bound = () => ({}), bind = () => {}, record = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let running = false;
  async function request(method, endpoint, body, reason) {
    const c = config(); if (!c?.bot) throw fail('The bot token has not been configured.');
    for (let attempt = 0; ; attempt++) {
      const r = await fetcher(API + endpoint, { method, headers: { Authorization: 'Bot ' + c.bot, 'Content-Type': 'application/json', 'User-Agent': 'HN-Group-Auth/1.0', ...(reason ? { 'X-Audit-Log-Reason': encodeURIComponent(reason).slice(0, 500) } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000), redirect: 'error' });
      if (r.status === 204) return null;
      const value = await r.json().catch(() => ({}));
      if (r.status === 429 && attempt < 6) { await sleep(Math.min(60, Math.max(0.5, Number(value.retry_after) || 1)) * 1000); continue; }
      if (!r.ok) throw fail('Discord: ' + String(value.message || 'request refused (' + r.status + ')').slice(0, 200));
      return value;
    }
  }
  const layoutsNow = () => loadLayouts(dir);
  // The layout for this server: the one named, or the one bound to / named after this server.
  function choose(name, guild) {
    const { layouts, errors } = layoutsNow(), boundIds = bound();
    const guildOf = (l) => l.guildId || boundIds[l.id] || '';
    if (name) {
      const l = layouts.find((x) => x.id === name) || layouts.find((x) => roleName(x.server) === roleName(name));
      if (!l) throw fail(errors.find((e) => e.includes('"' + name + '"')) || 'There is no layout called "' + name + '".');
      if (guildOf(l) && guildOf(l) !== guild.id) throw fail('Layout "' + l.id + '" belongs to another server (' + guildOf(l) + ').');
      if (!guildOf(l) && roleName(l.server) !== roleName(guild.name)) throw fail('Layout "' + l.id + '" is for the server "' + l.server + '", but this server is called "' + guild.name + '".');
      return l;
    }
    const mine = layouts.filter((l) => guildOf(l) === guild.id);
    const named = mine.length ? mine : layouts.filter((l) => !guildOf(l) && roleName(l.server) === roleName(guild.name));
    if (named.length === 1) return named[0];
    if (!named.length) throw fail('No layout is set up for "' + guild.name + '" yet.' + (errors.length ? ' ' + errors.join(' ') : ''));
    throw fail('More than one layout matches this server; choose one with the layout option: ' + named.map((l) => l.id).join(', ') + '.');
  }
  async function snapshot(guildId) {
    const [guild, roles, channels, me] = await Promise.all([request('GET', '/guilds/' + guildId), request('GET', '/guilds/' + guildId + '/roles'), request('GET', '/guilds/' + guildId + '/channels'), request('GET', '/users/@me')]);
    const member = await request('GET', '/guilds/' + guildId + '/members/' + me.id);
    return { guild, roles, channels, me, botRoles: member.roles || [] };
  }
  async function execute(layout, s, p, who) {
    const g = s.guild.id, reason = 'HN Group server setup (' + layout.id + ') by ' + who, done = [], errors = [];
    const roleIds = new Map(p.roleIds);
    const FAILED = Symbol('failed');
    const attempt = async (what, fn) => { try { return await fn(); } catch (e) { errors.push(what + ': ' + (e.layout ? e.message : 'failed')); return FAILED; } };
    const resolve = (list) => (list || []).filter((o) => roleIds.has(roleName(o.role))).map((o) => ({ id: roleIds.get(roleName(o.role)), type: 0, allow: o.allow, deny: o.deny }));
    for (const step of p.steps.filter((x) => x.kind === 'role')) {
      if (step.op === 'create') { const r = await attempt('Create role "' + step.name + '"', () => request('POST', '/guilds/' + g + '/roles', step.body, reason)); if (r !== FAILED) { roleIds.set(roleName(step.name), r.id); done.push('Created role "' + step.name + '"'); } }
      else if (await attempt('Update role "' + step.name + '"', () => request('PATCH', '/guilds/' + g + '/roles/' + step.id, step.body, reason)) !== FAILED) done.push('Updated role "' + step.name + '"');
    }
    const order = p.steps.find((x) => x.kind === 'role-order');
    if (order) {
      // New roles arrive at the bottom and push the others (the bot's included) up, so read the positions again.
      const now = await attempt('Read roles', () => request('GET', '/guilds/' + g + '/roles'));
      if (now !== FAILED) {
        const top = Math.max(0, ...now.filter((r) => s.botRoles.includes(r.id)).map((r) => r.position));
        const ids = order.names.map((n) => roleIds.get(roleName(n))).filter(Boolean);
        const positions = ids.map((id, i) => ({ id, position: Math.max(1, top - 1 - i) }));
        if (await attempt('Order roles', () => request('PATCH', '/guilds/' + g + '/roles', positions, reason)) !== FAILED) done.push('Ordered ' + ids.length + ' roles');
      }
    }
    // Give members the roles that go with the roles they have (only ever adds roles).
    const grants = p.steps.find((x) => x.kind === 'grants');
    if (grants) {
      const members = [];
      let after = '0', ok = true;
      for (let page = 0; page < 50; page++) {
        const rows = await attempt('List members (turn on Server Members Intent: Discord Developer Portal → Bot → Privileged Gateway Intents)', () => request('GET', '/guilds/' + g + '/members?limit=1000&after=' + after));
        if (rows === FAILED) { ok = false; break; }
        members.push(...rows);
        if (rows.length < 1000) break;
        after = rows.at(-1).user.id;
      }
      if (ok) {
        let given = 0;
        for (const m of members) {
          const has = new Set(m.roles || []);
          const want = new Set();
          for (const gr of grants.grants) {
            const from = roleName(gr.from) === EVERYONE ? (m.user?.bot ? null : true) : has.has(roleIds.get(roleName(gr.from)));
            if (from) for (const n of gr.to) { const rid = roleIds.get(roleName(n)); if (rid && !has.has(rid)) want.add(rid); }
          }
          for (const rid of want) if (await attempt('Give a role to ' + (m.user?.username || m.user?.id), () => request('PUT', '/guilds/' + g + '/members/' + m.user.id + '/roles/' + rid, undefined, reason)) !== FAILED) given++;
        }
        if (given) done.push('Gave ' + given + ' role' + (given === 1 ? '' : 's') + ' to members');
      }
    }
    // Categories first (channels need their ids), then channels.
    const categoryIds = new Map();
    const channelSteps = p.steps.filter((x) => x.kind === 'channel');
    for (const step of [...channelSteps.filter((x) => x.spec.type === 4), ...channelSteps.filter((x) => x.spec.type !== 4)]) {
      const sp = step.spec, parentId = sp.type === 4 || !step.parent ? null : categoryIds.get(step.parent) || null;
      const own = sp.overwrites !== undefined ? resolve(sp.overwrites) : step.parent ? resolve(step.categoryOverwrites) : undefined;
      const members = (step.have?.permission_overwrites || []).filter((o) => o.type === 1);
      const body = { name: sp.name };
      if (sp.type !== 4) body.parent_id = parentId;
      if (own !== undefined) body.permission_overwrites = [...own, ...members];
      if (sp.topic !== undefined && TEXTLIKE.has(sp.type)) body.topic = sp.topic;
      if (sp.nsfw !== undefined && sp.type !== 4) body.nsfw = sp.nsfw;
      if (sp.slowmode !== undefined && TEXTLIKE.has(sp.type)) body.rate_limit_per_user = sp.slowmode;
      if (sp.userLimit !== undefined && (sp.type === 2 || sp.type === 13)) body.user_limit = sp.userLimit;
      if (sp.bitrate !== undefined && (sp.type === 2 || sp.type === 13)) body.bitrate = sp.bitrate;
      if (step.have) {
        if (step.have.type !== sp.type) body.type = sp.type;
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        const norm = (list) => (list || []).map((o) => ({ id: o.id, type: Number(o.type), allow: String(o.allow), deny: String(o.deny) })).sort((a, b) => a.id.localeCompare(b.id));
        const changes = Object.keys(body).filter((k) => k === 'permission_overwrites' ? !same(norm(body[k]), norm(step.have.permission_overwrites)) : k === 'name' ? channelName(step.have.name, sp.type) !== channelName(sp.name, sp.type) || (sp.type === 4 || sp.type === 2 || sp.type === 13) && step.have.name !== sp.name : k === 'parent_id' ? (step.have.parent_id || null) !== body[k] : step.have[k] !== body[k] && !(k === 'topic' && !step.have.topic && !body.topic));
        if (sp.type === 4) categoryIds.set(sp.name, step.have.id);
        if (!changes.length) continue;
        const patch = Object.fromEntries(changes.map((k) => [k, body[k]]));
        const r = await attempt('Update ' + label(step), () => request('PATCH', '/channels/' + step.have.id, patch, reason));
        if (r !== FAILED) done.push('Updated ' + label(step) + ' (' + changes.map((k) => k === 'permission_overwrites' ? 'permissions' : k === 'parent_id' ? 'category' : k === 'rate_limit_per_user' ? 'slowmode' : k).join(', ') + ')');
      } else {
        const r = await attempt('Create ' + label(step), () => request('POST', '/guilds/' + g + '/channels', { ...body, type: sp.type, ...(body.permission_overwrites ? {} : { permission_overwrites: [] }) }, reason));
        if (r !== FAILED) { if (sp.type === 4) categoryIds.set(sp.name, r.id); done.push('Created ' + label(step)); }
      }
    }
    // Order: channels outside categories first, then each category with its channels, as listed.
    const fresh = await attempt('Read channels', () => request('GET', '/guilds/' + g + '/channels'));
    if (fresh !== FAILED) {
      const pick = (name, type, parent) => fresh.find((c) => channelName(c.name, c.type) === channelName(name, type) && (c.parent_id || null) === parent && (c.type === type || TEXTLIKE.has(c.type) && TEXTLIKE.has(type)));
      const positions = [];
      layout.categories.forEach((c, i) => { const cat = fresh.find((x) => x.type === 4 && x.id === categoryIds.get(c.name)); if (cat && cat.position !== i + layout.channels.length) positions.push({ id: cat.id, position: i + layout.channels.length });
        c.channels.forEach((ch, j) => { const x = cat && pick(ch.name, ch.type, cat.id); if (x && x.position !== j) positions.push({ id: x.id, position: j }); }); });
      layout.channels.forEach((ch, i) => { const x = pick(ch.name, ch.type, null); if (x && x.position !== i) positions.push({ id: x.id, position: i }); });
      if (positions.length && await attempt('Order channels', () => request('PATCH', '/guilds/' + g + '/channels', positions, reason)) !== FAILED) done.push('Ordered channels');
    }
    for (const step of p.steps.filter((x) => x.kind === 'remove-channel')) if (await attempt('Delete channel "' + step.name + '"', () => request('DELETE', '/channels/' + step.id, undefined, reason)) !== FAILED) done.push('Deleted channel "' + step.name + '"');
    for (const step of p.steps.filter((x) => x.kind === 'remove-role')) if (await attempt('Delete role "' + step.name + '"', () => request('DELETE', '/guilds/' + g + '/roles/' + step.id, undefined, reason)) !== FAILED) done.push('Deleted role "' + step.name + '"');
    return { done, errors };
  }
  const text = (head, lines, max = 1900) => { let out = head; for (let i = 0; i < lines.length; i++) { const l = '\n• ' + lines[i]; if ((out + l).length > max) { out += '\n…and ' + (lines.length - i) + ' more.'; break; } out += l; } return out.slice(0, 2000); };

  // Runs a /server-setup interaction (already answered with "thinking…"); returns the message to show.
  async function run(event) {
    const user = event.member?.user || event.user || {};
    if (!event.guild_id) return 'Run /server-setup inside the server you want to set up.';
    if (!ALLOWED_USERS.has(String(user.id))) { record(user, 'server-setup.refused', { guild: event.guild_id }); return 'You aren’t allowed to run /server-setup.'; }
    const sub = event.data?.options?.[0], name = sub?.options?.find((o) => o.name === 'layout')?.value;
    if (sub?.name === 'layouts') {
      const { layouts, errors } = layoutsNow(), b = bound();
      return text('**Server layouts** (' + layouts.length + ')', [...layouts.map((l) => '**' + l.server + '** (layout `' + l.id + '`' + ((l.guildId || b[l.id]) ? ', server ID ' + (l.guildId || b[l.id]) : '') + ')' + (l.description ? ' — ' + l.description : '')), ...errors.map((e) => '⚠️ ' + e)]);
    }
    if (running) return 'A server setup is already running. Try again when it has finished.';
    running = true;
    try {
      const s = await snapshot(event.guild_id);
      const layout = choose(name, s.guild);
      const p = plan(layout, s.guild, s.roles, s.channels, s.me.id, s.botRoles);
      if (p.problems.length) return text('**Can’t set up "' + s.guild.name + '" with `' + layout.id + '` yet.** Nothing was changed:', p.problems);
      if (sub?.name === 'preview') return text('**Preview of `' + layout.id + '` for "' + s.guild.name + '"** (server ID ' + s.guild.id + '). Nothing has been changed; run `/server-setup apply` to do it.', describe(p.steps));
      const who = (user.username || 'unknown') + ' (' + user.id + ')';
      record(user, 'server-setup.start', { guild: s.guild.id, layout: layout.id });
      const r = await execute(layout, s, p, who);
      if (!layout.guildId) bind(layout.id, s.guild.id);
      record(user, r.errors.length ? 'server-setup.partial' : 'server-setup.done', { guild: s.guild.id, layout: layout.id, changes: r.done.length, errors: r.errors.slice(0, 20) });
      const head = (r.errors.length ? '**⚠️ Set up "' + s.guild.name + '" with `' + layout.id + '`, with ' + r.errors.length + ' problem(s).**' : '**✅ "' + s.guild.name + '" is set up with `' + layout.id + '`.**') + ' Server ID ' + s.guild.id + '; ' + (r.done.length ? r.done.length + ' change(s).' : 'everything already matched.');
      return text(head, [...r.errors.map((e) => '❌ ' + e), ...r.done]);
    } catch (e) {
      return e.layout ? e.message : 'Server setup failed. Check the bot is in this server and try again.';
    } finally { running = false; }
  }
  // Answers the interaction at once (only the person running it sees the reply), then edits it with the result.
  async function interaction(event) {
    const reply = async (url, method, data) => { const r = await fetcher(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(10000), redirect: 'error' }); if (!r.ok) throw Error('Discord refused the reply.'); };
    await reply(API + '/interactions/' + event.id + '/' + encodeURIComponent(event.token) + '/callback', 'POST', { type: 5, data: { flags: 64 } });
    const content = await run(event);
    await reply(API + '/webhooks/' + (event.application_id || config()?.id) + '/' + encodeURIComponent(event.token) + '/messages/@original', 'PATCH', { content, allowed_mentions: { parse: [] } });
  }
  // Suggestions while typing the layout option: matches the server name or the layout name (only for allowed users).
  async function autocomplete(event) {
    const user = event.member?.user || event.user || {};
    const typed = String(event.data?.options?.[0]?.options?.find((o) => o.focused)?.value || '').trim().toLowerCase();
    const { layouts } = ALLOWED_USERS.has(String(user.id)) ? layoutsNow() : { layouts: [] };
    const hit = (l) => !typed || l.server.toLowerCase().includes(typed) || l.id.includes(typed);
    const here = (l) => (l.guildId || bound()[l.id]) === event.guild_id ? 0 : 1;
    const choices = layouts.filter(hit).sort((a, b) => here(a) - here(b) || a.server.localeCompare(b.server)).slice(0, 25)
      .map((l) => ({ name: (l.server + (l.description ? ' — ' + l.description : '')).slice(0, 100), value: l.id }));
    const r = await fetcher(API + '/interactions/' + event.id + '/' + encodeURIComponent(event.token) + '/callback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 8, data: { choices } }), signal: AbortSignal.timeout(2500), redirect: 'error' });
    if (!r.ok) throw Error('Discord refused the suggestions.');
  }
  // The command as registered with Discord: server-only, with the layouts as choices for the layout option.
  function definition() {
    const layout = { type: 3, name: 'layout', description: 'Search by server name (leave empty to use the one for this server)', required: false, autocomplete: true };
    return { name: COMMAND, description: 'Set this server’s roles, channels and permissions from an HN Group layout', type: 1, contexts: [0], integration_types: [0],
      options: [
        { type: 1, name: 'preview', description: 'Show what would change, without changing anything', options: [layout] },
        { type: 1, name: 'apply', description: 'Set this server up now', options: [layout] },
        { type: 1, name: 'layouts', description: 'List the server layouts' },
      ] };
  }
  return { interaction, autocomplete, run, definition, name: COMMAND };
}

module.exports = { createServerSetup, parseLayout, loadLayouts, plan, bits, ALLOWED_USERS, COMMAND };
