'use strict';
// /server-setup against a pretend Discord server: allowlist, preview, apply, every role deleted and made again,
// server-name and server-ID checks, removals only when asked, and the command surviving dashboard republishing.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createBotManager } = require('./bot-manager');
const { parseLayout, bits } = require('./server-setup');

const APP = '1564969421800472698', BOT = APP, GUILD = '222222222222222222', OTHER = '777777777777777777';
const ALLOWED = '1449876557035475085', STRANGER = '888888888888888888';

// A small in-memory Discord: one or two servers, roles, channels and the interaction endpoints.
function fakeDiscord(servers) {
  let next = 900000000000000000n;
  const newId = () => String(next++);
  const writes = [], replies = [];
  const s = (g) => servers[g];
  async function fetcher(url, opts = {}) {
    const p = url.replace('https://discord.com/api/v10', ''), method = opts.method || 'GET', body = opts.body ? JSON.parse(opts.body) : undefined;
    const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
    if (p.startsWith('/interactions/')) { replies.push({ kind: 'defer', body }); return new Response(null, { status: 204 }); }
    if (p.startsWith('/webhooks/')) { replies.push({ kind: 'edit', body }); return json({}); }
    if (p === '/users/@me') return json({ id: BOT, username: 'HN Group Auth' });
    if (p.startsWith('/applications/')) { if (method !== 'GET') writes.push({ method, p, body }); return json(method === 'PUT' ? body : method === 'POST' ? body : []); }
    let m;
    if (method !== 'GET') writes.push({ method, p, body });
    if ((m = /^\/guilds\/(\d+)$/.exec(p))) return json(s(m[1]).guild);
    if ((m = /^\/guilds\/(\d+)\/members\?limit=1000&after=(\d+)$/.exec(p))) { const g = s(m[1]); if (!g.members) return json({ message: 'Missing Access' }, 403); return json(g.members.filter((x) => BigInt(x.user.id) > BigInt(m[2]))); }
    if ((m = /^\/guilds\/(\d+)\/members\/(\d+)\/roles\/(\d+)$/.exec(p)) && method === 'PUT') { s(m[1]).members.find((x) => x.user.id === m[2]).roles.push(m[3]); return new Response(null, { status: 204 }); }
    if ((m = /^\/guilds\/(\d+)\/members\/(\d+)$/.exec(p))) return json({ roles: [s(m[1]).botRole] });
    if ((m = /^\/guilds\/(\d+)\/roles$/.exec(p))) {
      const g = s(m[1]);
      if (method === 'GET') return json(g.roles);
      if (method === 'POST') { for (const r of g.roles) if (r.position >= 1) r.position++; const r = { id: newId(), name: body.name, permissions: body.permissions || '0', color: body.color || 0, hoist: !!body.hoist, mentionable: !!body.mentionable, managed: false, position: 1 }; g.roles.push(r); return json(r); }
      if (method === 'PATCH') { for (const x of body) g.roles.find((r) => r.id === x.id).position = x.position; return json(g.roles); }
    }
    if ((m = /^\/guilds\/(\d+)\/roles\/(\d+)$/.exec(p))) {
      const g = s(m[1]), r = g.roles.find((x) => x.id === m[2]);
      if (method === 'PATCH') { Object.assign(r, body); return json(r); }
      if (method === 'DELETE') { g.roles.splice(g.roles.indexOf(r), 1); return new Response(null, { status: 204 }); }
    }
    if ((m = /^\/guilds\/(\d+)\/channels$/.exec(p))) {
      const g = s(m[1]);
      if (method === 'GET') return json(g.channels);
      if (method === 'POST') {
        const c = { id: newId(), type: body.type, name: [0, 5, 15].includes(body.type) ? body.name.toLowerCase().replace(/\s+/g, '-') : body.name, parent_id: body.parent_id || null, topic: body.topic ?? null, nsfw: !!body.nsfw,
          rate_limit_per_user: body.rate_limit_per_user || 0, user_limit: body.user_limit || 0, bitrate: body.bitrate || 64000, position: g.channels.length,
          permission_overwrites: (body.permission_overwrites || []).map((o) => ({ ...o, type: Number(o.type) })) };
        g.channels.push(c); return json(c);
      }
      if (method === 'PATCH') { for (const x of body) g.channels.find((c) => c.id === x.id).position = x.position; return new Response(null, { status: 204 }); }
    }
    if ((m = /^\/channels\/(\d+)$/.exec(p))) {
      const g = Object.values(servers).find((x) => x.channels.some((c) => c.id === m[1])), c = g.channels.find((x) => x.id === m[1]);
      if (method === 'PATCH') { Object.assign(c, body, body.name && [0, 5, 15].includes(c.type) ? { name: body.name.toLowerCase().replace(/\s+/g, '-') } : {}); return json(c); }
      if (method === 'DELETE') { g.channels.splice(g.channels.indexOf(c), 1); return json(c); }
    }
    return json({ message: 'Unknown ' + method + ' ' + p }, 404);
  }
  return { fetcher, writes, replies };
}
function server(id, name) {
  return {
    guild: { id, name, owner_id: '111111111111111111', rules_channel_id: null },
    botRole: id.slice(0, -1) + '5',
    roles: [{ id, name: '@everyone', permissions: bits(['ViewChannel', 'SendMessages']), position: 0, managed: false, color: 0, hoist: false, mentionable: false },
      { id: id.slice(0, -1) + '5', name: 'HN Group Auth', permissions: bits(['Administrator']), position: 2, managed: true, color: 0, hoist: false, mentionable: false },
      { id: id.slice(0, -1) + '6', name: 'Old role', permissions: '0', position: 1, managed: false, color: 0, hoist: false, mentionable: false }],
    channels: [{ id: id + '1', type: 0, name: 'general', parent_id: null, topic: null, nsfw: false, rate_limit_per_user: 0, position: 0, permission_overwrites: [] }],
  };
}
const LAYOUT = {
  server: 'HN Group Test', description: 'Test server',
  everyone: ['ViewChannel', 'ReadMessageHistory'],
  roles: [{ name: 'Owner', color: '#5514B4', hoist: true, permissions: ['Administrator'] }, { name: 'Staff', color: '#3E9BA3', permissions: ['View Channel', 'send messages'] }],
  channels: [{ name: 'Welcome Here', topic: 'Start here', permissions: { '@everyone': { deny: ['SendMessages'] } } }],
  categories: [{ name: 'Staff Area', permissions: { '@everyone': { deny: ['ViewChannel'] }, Staff: { allow: ['ViewChannel'] } },
    channels: [{ name: 'staff-chat', slowmode: 5 }, { name: 'Staff Voice', type: 'voice', userLimit: 5 }, { name: 'general', permissions: { Staff: { allow: ['ViewChannel'] } } }] }],
};
function setup(layouts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-server-setup-')), layoutsDir = path.join(dir, 'layouts');
  fs.mkdirSync(layoutsDir);
  for (const [name, l] of Object.entries(layouts)) fs.writeFileSync(path.join(layoutsDir, name + '.json'), JSON.stringify(l));
  const servers = { [GUILD]: server(GUILD, 'HN Group Test'), [OTHER]: server(OTHER, 'Someone else') };
  const discord = fakeDiscord(servers);
  const manager = createBotManager({ file: path.join(dir, 'bot.json'), configFile: path.join(dir, 'discord.json'), config: () => ({ id: APP, bot: 'bot-token-' + 'x'.repeat(60) }), fetcher: discord.fetcher, layouts: layoutsDir, sleep: async () => {}, staff: async () => ({ value: {} }) });
  let n = 600000000000000000n;
  const run = async (sub, { user = ALLOWED, guild = GUILD, layout } = {}) => {
    const before = discord.replies.length;
    await manager.interaction({ id: String(n++), token: 'ticket', type: 2, application_id: APP, guild_id: guild || undefined, member: { user: { id: user, username: 'catnap' } },
      data: { name: 'server-setup', options: [{ type: 1, name: sub, options: layout ? [{ name: 'layout', value: layout }] : [] }] } });
    const mine = discord.replies.slice(before);
    assert.equal(mine[0].kind, 'defer'); assert.equal(mine[0].body.data.flags, undefined, 'everyone in the channel sees the reply');
    const card = mine[1].body.embeds[0];
    assert.equal(mine[1].body.content, ''); assert.equal(card.footer.text, 'HN Group'); assert.equal(typeof card.color, 'number');
    return (card.title || '') + '\n' + (card.description || '');
  };
  return { dir, servers, discord, manager, run, close: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('layouts are checked: unknown permissions, fields and duplicate names are refused', () => {
  assert.throws(() => parseLayout({ server: 'X', roles: [{ name: 'A', permissions: ['FlyPlanes'] }] }, 'x'), /unknown permission "FlyPlanes"/);
  assert.throws(() => parseLayout({ server: 'X', roles: [{ name: 'A' }, { name: 'a' }] }, 'x'), /two roles/);
  assert.throws(() => parseLayout({ server: 'X', colour: 1 }, 'x'), /unknown field "colour"/);
  assert.throws(() => parseLayout({ roles: [] }, 'x'), /server/);
  assert.equal(bits(['Administrator', 'manage server', 'View Channel']), String((1n << 3n) | (1n << 5n) | (1n << 10n)));
});

test('only allowed Discord accounts can run it, and only inside a server', async () => {
  const t = setup({ test: LAYOUT });
  try {
    assert.match(await t.run('apply', { user: STRANGER }), /aren’t allowed/);
    assert.match(await t.run('preview', { user: '1256504335110635531' }), /Preview of `test`/, 'the second allowed account can run it too');
    assert.match(await t.run('apply', { guild: null }), /inside the server/);
    assert.equal(t.discord.writes.filter((w) => !w.p.startsWith('/applications/')).length, 0, 'nothing changed');
  } finally { t.close(); }
});

test('preview changes nothing; apply sets the server up exactly; a second apply makes every role again', async () => {
  const t = setup({ test: LAYOUT });
  try {
    const preview = await t.run('preview');
    assert.match(preview, /Preview of `test`.*server ID 222222222222222222/is);
    assert.match(preview, /Create role "Owner"/); assert.match(preview, /Create category "Staff Area"/);
    assert.equal(t.discord.writes.length, 0, 'preview writes nothing');

    const result = await t.run('apply');
    assert.match(result, /✅ "HN Group Test" is set up with `test`/, result);
    const g = t.servers[GUILD], role = (n) => g.roles.find((r) => r.name === n), chan = (n) => g.channels.find((c) => c.name === n);
    assert.equal(role('@everyone').permissions, bits(['ViewChannel', 'ReadMessageHistory']));
    assert.equal(role('Owner').color, 0x5514B4); assert.equal(role('Owner').hoist, true); assert.equal(role('Staff').permissions, bits(['ViewChannel', 'SendMessages']));
    assert.ok(role('Owner').position > role('Staff').position && role('Owner').position < role('HN Group Auth').position, 'roles in order under the bot');
    assert.ok(!role('Old role'), 'every other role is deleted');
    const cat = chan('Staff Area');
    assert.equal(cat.type, 4);
    assert.deepEqual(cat.permission_overwrites.map((o) => [o.id, o.allow, o.deny]).sort(), [[GUILD, '0', bits(['ViewChannel'])], [role('Staff').id, bits(['ViewChannel']), '0']].sort());
    assert.equal(chan('staff-chat').parent_id, cat.id); assert.equal(chan('staff-chat').rate_limit_per_user, 5);
    assert.deepEqual(chan('staff-chat').permission_overwrites, cat.permission_overwrites, 'channels without permissions copy the category');
    assert.equal(chan('Staff Voice').type, 2); assert.equal(chan('Staff Voice').user_limit, 5);
    assert.equal(chan('welcome-here').topic, 'Start here');
    assert.equal(chan('general').id, GUILD + '1', 'the existing #general is moved, not duplicated');
    assert.equal(chan('general').parent_id, cat.id);
    assert.deepEqual(chan('general').permission_overwrites, [{ id: role('Staff').id, type: 0, allow: bits(['ViewChannel']), deny: '0' }]);
    assert.ok(chan('welcome-here').position < cat.position);
    assert.ok(t.discord.writes.every((w) => !w.p.includes(OTHER)), 'the other server is untouched');

    // A second run deletes every role again and makes them again; channels stay, pointing at the new roles.
    const oldIds = ['Owner', 'Staff'].map((n) => role(n).id), channelCount = g.channels.length;
    const again = await t.run('apply');
    assert.match(again, /Deleted role "Owner"[\s\S]*Deleted role "Staff"[\s\S]*Created role "Owner"/, again);
    assert.deepEqual(g.roles.map((r) => r.name).sort(), ['@everyone', 'HN Group Auth', 'Owner', 'Staff'].sort(), 'no duplicates');
    assert.ok(['Owner', 'Staff'].every((n, i) => role(n).id !== oldIds[i]), 'made again');
    assert.equal(g.channels.length, channelCount, 'no channels duplicated');
    assert.equal(chan('general').permission_overwrites[0].id, role('Staff').id);
    assert.equal(chan('Staff Area').permission_overwrites.find((o) => o.id !== GUILD).id, role('Staff').id);
  } finally { t.close(); }
});

test('the server name is checked the first time, then the server ID is remembered', async () => {
  const t = setup({ test: LAYOUT });
  try {
    assert.match(await t.run('apply', { guild: OTHER, layout: 'test' }), /is for the server "HN Group Test", but this server is called "Someone else"/);
    assert.match(await t.run('apply', { guild: OTHER }), /No layout is set up for "Someone else"/);
    await t.run('apply');
    t.servers[GUILD].guild.name = 'Renamed';
    assert.match(await t.run('preview'), /Preview of `test` for "Renamed"/, 'still found after a rename');
    t.servers[OTHER].guild.name = 'HN Group Test';
    assert.match(await t.run('apply', { guild: OTHER, layout: 'test' }), /belongs to another server \(222222222222222222\)/);
    assert.match(await t.run('layouts'), /\*\*HN Group Test\*\* \(layout `test`, server ID 222222222222222222\)/);
  } finally { t.close(); }
});

test('removals happen only when the layout asks, and never to managed roles or the bot', async () => {
  const t = setup({ test: { ...LAYOUT, removeUnlisted: { roles: true, channels: true }, categories: [] } });
  try {
    t.servers[GUILD].channels.push({ id: GUILD + '9', type: 0, name: 'random', parent_id: null, position: 1, permission_overwrites: [] });
    assert.match(await t.run('preview'), /Delete channel "random"[\s\S]*Delete role "Old role"/);
    await t.run('apply');
    const g = t.servers[GUILD];
    assert.ok(!g.channels.some((c) => c.name === 'random')); assert.ok(!g.roles.some((r) => r.name === 'Old role'));
    assert.ok(g.roles.some((r) => r.name === 'HN Group Auth') && g.roles.some((r) => r.name === '@everyone'));
  } finally { t.close(); }
});

test('problems are reported before anything changes', async () => {
  const t = setup({ test: { ...LAYOUT, roles: [{ name: 'HN Group Auth' }], channels: [{ name: 'x', permissions: { Ghosts: { allow: ['ViewChannel'] } } }], categories: [] } });
  try {
    const r = await t.run('apply');
    assert.match(r, /Nothing was changed/); assert.match(r, /managed by an integration/); assert.match(r, /"Ghosts", which isn’t one of the layout’s roles/);
    assert.equal(t.discord.writes.length, 0);
  } finally { t.close(); }
});

test('the command is registered on connect and kept when the dashboard republishes commands', async () => {
  const t = setup({ test: LAYOUT });
  try {
    await t.manager.registerBuiltins();
    const reg = t.discord.writes.find((w) => w.method === 'POST' && w.p === '/applications/' + APP + '/commands');
    assert.equal(reg.body.name, 'server-setup'); assert.deepEqual(reg.body.contexts, [0]);
    assert.equal(reg.body.options[0].options[0].autocomplete, true, 'the layout option searches as you type');
    await t.manager.handle('save-commands', { commands: [{ name: 'hello', description: 'Hi', response: 'Hello', ephemeral: false }, { name: 'server-setup', description: 'old copy' }] });
    const put = t.discord.writes.find((w) => w.method === 'PUT');
    assert.deepEqual(put.body.map((c) => c.name), ['hello', 'server-setup']);
    assert.equal(put.body[1].options.length, 3, 'the built-in definition, not the dashboard copy');
  } finally { t.close(); }
});

test('the layout option searches by server name, and a server name can be typed instead of the layout name', async () => {
  const t = setup({ test: LAYOUT, other: { ...LAYOUT, server: 'Someone else', description: 'Other' } });
  try {
    const suggest = async (typed, user = ALLOWED) => {
      const before = t.discord.replies.length;
      await t.manager.interaction({ id: '600000000000000999', token: 'ticket', type: 4, application_id: APP, guild_id: GUILD, member: { user: { id: user } },
        data: { name: 'server-setup', options: [{ type: 1, name: 'apply', options: [{ name: 'layout', value: typed, focused: true }] }] } });
      const reply = t.discord.replies[before].body; assert.equal(reply.type, 8); return reply.data.choices;
    };
    assert.deepEqual(await suggest('some'), [{ name: 'Someone else — Other', value: 'other' }]);
    assert.deepEqual((await suggest('')).map((c) => c.value), ['test', 'other'], 'nothing typed: every layout, by server name');
    assert.deepEqual(await suggest('hn', STRANGER), [], 'nobody else sees the layouts');
    assert.match(await t.run('preview', { layout: 'hn group test' }), /Preview of `test` for "HN Group Test"/, 'typing the server name works');
    assert.match(await t.run('layouts'), /\*\*HN Group Test\*\* \(layout `test`\)/);
  } finally { t.close(); }
});

test('roleGrants give members their roles again after every role is made again', async () => {
  const t = setup({ test: { ...LAYOUT, categories: [], channels: [], roleGrants: { '@everyone': ['Staff'] } } });
  try {
    const g = t.servers[GUILD];
    g.members = [{ user: { id: '300000000000000001', username: 'boss' }, roles: [] }, { user: { id: '300000000000000002', username: 'helper', bot: true }, roles: [] }];
    assert.match(await t.run('preview'), /Give "Staff" to every member \(not bots\)/);
    await t.run('apply');
    const staff = () => g.roles.find((r) => r.name === 'Staff').id;
    assert.deepEqual(g.members[0].roles, [staff()]);
    assert.deepEqual(g.members[1].roles, [], 'bots are not given @everyone grants');
    const r = await t.run('apply');
    assert.match(r, /Gave 1 role to members/, r);
    assert.ok(g.members[0].roles.includes(staff()), 'the new Staff role is given again');
    delete g.members;
    assert.match(await t.run('apply'), /Server Members Intent/, 'explains the missing intent');
  } finally { t.close(); }
});

test('the HN HQ layout is valid and fits a fresh server', async () => {
  const dir = path.join(__dirname, 'discord-layouts');
  const { loadLayouts, plan: makePlan } = require('./server-setup');
  const { layouts, errors } = loadLayouts(dir);
  assert.deepEqual(errors, []);
  const hq = layouts.find((l) => l.id === 'hn-hq');
  assert.equal(hq.server, 'HN HQ'); assert.equal(hq.guildId, '1360208008755413227');
  const role = (n) => hq.roles.find((r) => r.name === n), has = (n, flag) => (BigInt(role(n).permissions) & (1n << BigInt(flag))) !== 0n;
  assert.equal(role('Network Permission Level 5').permissions, bits(['Administrator']));
  for (const flag of [3, 1, 2, 28]) assert.ok(!has('Network Permission Level 4', flag), 'Level 4 has no Administrator, Kick, Ban or Manage Roles');
  for (const n of ['Network Permission Level 3', 'Network Permission Level 2', 'Network Permission Level 1', 'B | Bots', 'M | Member', 'NA | Network Administration', 'President'])
    for (const flag of [3, 1, 2, 4, 5, 28]) assert.ok(!has(n, flag), n + ' has no administrative or server-management powers');
  assert.equal(role('B | Bots').permissions, '0'); assert.equal(hq.everyone, role('Network Permission Level 1').permissions);
  assert.deepEqual(hq.roles.filter((r) => r.hoist).map((r) => r.name), ['President', 'NA | Network Administration', 'B | Bots', 'M | Member']);
  const g = server('1360208008755413227', 'HN HQ');
  g.roles[1].position = 99;
  const p = makePlan(hq, g.guild, g.roles, g.channels, BOT, [g.botRole]);
  assert.deepEqual(p.problems, []);
  assert.equal(p.steps.filter((x) => x.kind === 'role' && x.op === 'create').length, 20);
});

test('every role is deleted and made again, apart from @everyone, managed roles and roles above the bot', async () => {
  const t = setup({ test: { ...LAYOUT, categories: [], channels: [] }, keep: { ...LAYOUT, server: 'Someone else', categories: [], channels: [], removeUnlisted: { roles: false } } });
  try {
    const g = t.servers[GUILD];
    g.roles.push({ id: '222222222222222227', name: 'Staff', permissions: '0', position: 1, managed: false, color: 0, hoist: false, mentionable: false },
      { id: '222222222222222228', name: 'Way up', permissions: '0', position: 5, managed: false, color: 0, hoist: false, mentionable: false },
      { id: '222222222222222229', name: 'Server Booster', permissions: '0', position: 1, managed: true, color: 0, hoist: false, mentionable: false });
    const preview = await t.run('preview');
    assert.match(preview, /Delete role "Old role"/); assert.match(preview, /Delete role "Staff"/); assert.match(preview, /Can’t delete role "Way up"/);
    assert.doesNotMatch(preview, /Delete role "(Server Booster|HN Group Auth|@everyone)"/);
    const result = await t.run('apply');
    assert.match(result, /Couldn’t delete role "Way up"/, result);
    assert.deepEqual(g.roles.map((r) => r.name).sort(), ['@everyone', 'HN Group Auth', 'Owner', 'Server Booster', 'Staff', 'Way up'].sort());
    assert.notEqual(g.roles.find((r) => r.name === 'Staff').id, '222222222222222227', 'the old Staff role is deleted and made again');
    assert.ok(t.discord.writes.findIndex((w) => w.method === 'DELETE') < t.discord.writes.findIndex((w) => w.method === 'POST' && w.p.endsWith('/roles')), 'old roles go first');
    // A layout can opt out: then nothing else is deleted and same-named roles are updated in place.
    t.servers[OTHER].roles.push({ id: '777777777777777770', name: 'Keep me', permissions: '0', position: 1, managed: false, color: 0, hoist: false, mentionable: false });
    await t.run('apply', { guild: OTHER, layout: 'keep' });
    assert.ok(t.servers[OTHER].roles.some((r) => r.name === 'Keep me'));
  } finally { t.close(); }
});
