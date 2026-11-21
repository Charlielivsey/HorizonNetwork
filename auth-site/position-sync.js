'use strict';
// Discord roles that follow Horizon Network positions on the staff portal (the user's request, 6 November 2026: "the
// auth bot should automatically add and change roles as and when someones positon in Horizon Network gets updated on
// the Staff Portal").
//
// HR supplies position titles/order; current networks supply servers; hn-roles.json supplies technical grants (not a /server-setup layout: the user's correction, 6 November 2026,
// "dont use setup role list. the bot will do it automatically accross the servers i gave the IDs for").
//
// Setting a server's roles up is a command (the user's request, 6 November 2026: "bot seems to get stuck removing
// roles, make it so a setup server command has to be ran but with no additonal arguments. also add a force sync
// command"): /setup-server, run inside one of those servers, deletes every other role and creates the list in order
// (reporting its progress), then syncs everyone's roles; /force-sync syncs staff roles with the staff portal now in
// every listed server. Automatic sync never creates or reorders server roles: a server whose roles aren't set up is
// skipped until /setup-server has been run there. Every minute the bot asks the staff backend for each staff record's
// Discord ID and job titles at each company; when anything has changed (or at least every 10 minutes), in every listed
// server:
//   • each member linked to a staff record gets the roles of their position(s) at the layout's company (for example
//     President → President, Network Permission Level 5, NA | Network Administration) and loses the position, level and
//     NA roles they no longer hold;
//   • they also get every separator role, Network Permission Level 1 and M | Member (everyone else gets these from
//     /setup-server; the background sync only checks members linked to a staff record).
// Roles outside `positions` (Network Permission Level 2 for Trial Staff, given by hand, and B | Bots) are never touched,
// bots are never changed, and members who aren't linked to a staff record are never touched by the background sync.
const fs = require('node:fs');
const path = require('node:path');
const { ALWAYS_GIVE, isSeparator, roleName, parseLayout } = require('./server-setup');
const ROLES_FILE = path.join(__dirname, 'hn-roles.json');

// hn-roles.json → one layout per server (same roles everywhere).
function loadRoles(file = ROLES_FILE, networks = null, catalog = null) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const servers = networks ? networks.flatMap(n=>(n.guilds||[]).filter(g=>/^\d{15,22}$/.test(String(g))).map(g=>[n.name+' · HN administration',String(g)])) : raw.servers && typeof raw.servers === 'object' ? Object.entries(raw.servers) : [];
  const { _note, servers: _s, ...body } = raw;
  if(catalog){
    const company=raw.positions.company,titles=catalog[company];if(!Array.isArray(titles))throw Object.assign(new Error('HR position catalogue unavailable for '+company),{layout:true});
    const oldTitles=new Set(Object.keys(raw.positions.roles).map(roleName)),specs=new Map(raw.roles.map(r=>[roleName(r.name),r]));
    const roles=titles.map(title=>({...specs.get(roleName(title)),name:title,permissions:specs.get(roleName(title))?.permissions||[],color:/^Board (Chairman|Director|Member)$/i.test(title)?'#000000':(specs.get(roleName(title))?.color||'#72B8AD')}));
    const separators=raw.roles.filter(r=>isSeparator(r.name));body.roles=[...(separators.length?[separators[0]]:[]),...roles,...raw.roles.filter(r=>!oldTitles.has(roleName(r.name))&&roleName(r.name)!==roleName('Vice President')&&r!==separators[0])];
    const known=new Set(body.roles.map(r=>roleName(r.name)));
    body.positions={company,roles:Object.fromEntries(titles.map(title=>[title,[title,...(raw.positions.roles[title]||[]).filter(n=>roleName(n)!==roleName(title)&&known.has(roleName(n)))]]))};
    body.roleGrants=Object.fromEntries(Object.entries(raw.roleGrants||{}).filter(([name])=>name==='@everyone'||titles.includes(name)).map(([name,grants])=>[name,grants.filter(n=>known.has(roleName(n)))]).filter(([,grants])=>grants.length));
  }
  return servers.map(([name, guildId]) => parseLayout({ ...body, server: name, guildId: String(guildId), removeUnlisted: { roles: true, channels: false } }, 'hn-roles'));
}

const ID = /^\d{15,22}$/;
const REASON = 'HN Group positions (staff portal)';
const API = 'https://discord.com/api/v10';
// Who may run /setup-server and /force-sync: the same Discord accounts as /server-setup.
const { ALLOWED_USERS, embed } = require('./server-setup');
const COMMANDS = [
  { name: 'setup-server', description: 'Set this server’s HN Group roles up: deletes every other role, then creates the list in order', type: 1, contexts: [0], integration_types: [0], options:[{name:'roles',description:'Choose the role set to configure.',type:3,required:true,choices:[{name:'HN administration roles',value:'hn-administration'}]}] },
  { name: 'force-sync', description: 'Sync everyone’s roles with their positions on the staff portal now, in every HN server', type: 1, contexts: [0], integration_types: [0] },
];

function createPositionSync({ setup, staff, networks=null, rolesFile = ROLES_FILE, record = () => {}, enabled = () => true, now = () => Date.now(), fullEvery = 10 * 60000, fetcher = fetch, appId = () => null, requireCatalog = false, branding = null, overrides = () => ({}) }) {
  let lastDigest = null, lastFull = 0, running = false, stopping = false, lastLayouts = [];
  // The background sync can take a long time in a big server (every member gets the separators, Level 1 and Member, one
  // request at a time, at Discord's pace), so the commands stop it rather than waiting (the user's report, 6 November
  // 2026: /setup-server said "A setup or sync is already running" because of it). It checks between requests and picks up
  // where it left off next time (it only ever adds what's missing).
  const STOP = Symbol('stop');
  const check = () => { if (stopping) throw STOP; };
  async function stopSync() {
    if (!running) return;
    stopping = true;
    for (let i = 0; running && i < 600; i++) await new Promise((r) => setTimeout(r, 200));
    stopping = false;
  }
  const state = { lastAt: null, changed: 0, errors: [] };

  // What a member should have and what the bot looks after, for one server's layout and live roles.
  function rolesFor(layout, liveRoles) {
    const ids = new Map(liveRoles.map((r) => [roleName(r.name), r.id]));
    const always = layout.roles.filter((r) => isSeparator(r.name) || ALWAYS_GIVE.has(roleName(r.name))).map((r) => ids.get(roleName(r.name))).filter(Boolean);
    const byTitle = new Map((layout.positions?.titles || []).map((t) => [roleName(t.title), t.roles.map((n) => ids.get(roleName(n))).filter(Boolean)]));
    const managed = new Set([...byTitle.values()].flat().filter((id) => !always.includes(id)));
    return { always, byTitle, managed,npl:new Map(liveRoles.filter(r=>/^Network Permission Level [1-5]$/.test(r.name)).map(r=>[Number(r.name.at(-1)),r.id])) };
  }
  // The changes for one member: roles to add and roles to remove.
  function changesFor(member, linked, layout, sets) {
    if (member.user?.bot) return { add: [], remove: [] };
    const override=overrides()[layout.guildId]?.[member.user?.id];
    const has = new Set(member.roles || []), want = new Set(!linked&&override?(member.roles||[]):sets.always);
    if (linked) for (const t of linked.titles || []) if (roleName(t.company) === roleName(layout.positions?.company || '')) for (const id of sets.byTitle.get(roleName(t.title)) || []) want.add(id);
    if(override){for(const id of sets.npl.values())want.delete(id);if(sets.npl.get(1))want.add(sets.npl.get(1));if(sets.npl.get(override.level))want.add(sets.npl.get(override.level));}
    const add = [...want].filter((id) => !has.has(id));
    const remove = linked || override ? [...has].filter((id) => ((linked&&sets.managed.has(id))||(override&&[...sets.npl.values()].includes(id))) && !want.has(id)) : [];
    return { add, remove };
  }

  // The members linked to a staff record, looked up one by one (people who aren't in this server are skipped). The
  // background sync only checks these (the user's request, 6 November 2026: "dont do the making roles automatically jus
  // the checking roles please"): it never goes through every member; /setup-server gives everyone the basic roles.
  async function members(guildId, people) {
    const found = [];
    for (const p of people) {
      check();
      try { found.push(await setup.request('GET', '/guilds/' + guildId + '/members/' + p.id)); }
      catch (e) { if (e.status !== 404 && e.code !== 10007 && e.code !== 10013) throw e; }
    }
    return found;
  }

  async function syncGuild(layout, people, authoritative) {
    const guildId = layout.guildId;
    let live = await setup.request('GET', '/guilds/' + guildId + '/roles');
    const have = new Set(live.map((r) => roleName(r.name)));
    const missing = layout.roles.filter((r) => !have.has(roleName(r.name))).map((r) => r.name);
    if (missing.length) throw Object.assign(new Error('roles aren’t set up yet (missing ' + missing.slice(0, 3).join(', ') + (missing.length > 3 ? ' and ' + (missing.length - 3) + ' more' : '') + '); run /setup-server there'), { layout: true });
    const sets = rolesFor(layout, live);
    const linked = new Map(people.map((p) => [p.id, p]));
    let changed = 0;
    for (const m of await members(guildId, [...new Map([...Object.keys(overrides()[guildId]||{}).map(id=>({id,titles:[]})),...people].map(p=>[p.id,p])).values()])) {
      const id = String(m.user?.id || '');
      if (!ID.test(id)) continue;
      const { add, remove } = changesFor(m, linked.get(id), layout, sets);
      check();
      if (!add.length && !remove.length) continue;
      if (add.length + remove.length === 1) {
        if (add.length) await setup.request('PUT', '/guilds/' + guildId + '/members/' + id + '/roles/' + add[0], undefined, REASON);
        else await setup.request('DELETE', '/guilds/' + guildId + '/members/' + id + '/roles/' + remove[0], undefined, REASON);
      } else {
        // Several changes for one member: one request with their whole new role list.
        const roles = [...new Set([...(m.roles || []).filter((r) => !remove.includes(r)), ...add])];
        await setup.request('PATCH', '/guilds/' + guildId + '/members/' + id, { roles }, REASON);
      }
      changed += add.length + remove.length;
    }
    changed += await require('./hq-staff-access').syncHqStaffAccess({guild:guildId,roles:live,people,request:setup.request,check});
    return changed;
  }

  async function sync(force = false) {
    if (running || !enabled() || setup.busy()) return null;
    running = true;
    try {
      const { value } = await staff('/api/auth/discord-positions', {});
      const people = (Array.isArray(value?.people) ? value.people : []).filter((p) => p && ID.test(String(p.id))).map((p) => ({ id: String(p.id), titles: Array.isArray(p.titles) ? p.titles : [] }));
      if(requireCatalog&&!value?.positions)throw Object.assign(new Error('HR position catalogue could not be loaded.'),{layout:true});
      const digest = JSON.stringify([overrides(),people,value?.positions,networks?.()]);
      if (!force && digest === lastDigest && now() - lastFull < fullEvery) return null;
      let changed = 0;
      const errors = [];
      lastLayouts=loadRoles(rolesFile,networks?networks():null,value?.positions);
      for (const layout of lastLayouts) {
        try { changed += await syncGuild(layout, people,!!value?.positions); }
        catch (e) { if (e === STOP) { record(null, 'positions.sync.stopped', { changed }); return { changed, errors, stopped: true }; } errors.push(layout.server + ' (' + layout.guildId + '): ' + (e.layout ? e.message : 'failed')); }
      }
      let logos=0;if(branding){try{logos=await branding();}catch(e){errors.push('Server branding: '+e.message);}}
      lastDigest = errors.length?null:digest; lastFull = now();
      Object.assign(state, { lastAt: new Date(now()).toISOString(), changed, logos, errors });
      if (changed || errors.length) record(null, errors.length ? 'positions.sync.partial' : 'positions.sync', { changed, errors: errors.slice(0, 10) });
      return { changed, logos, errors };
    } finally { running = false; }
  }
  // ----- /setup-server and /force-sync -----
  async function reply(event, method, url, data) {
    const r = await fetcher(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!r.ok) throw Error('Discord refused the reply.');
  }
  const edit = (event, card) => reply(event, 'PATCH', API + '/webhooks/' + (event.application_id || appId()) + '/' + encodeURIComponent(event.token) + '/messages/@original', { content: '', embeds: [embed(card)], allowed_mentions: { parse: [] } });
  async function interaction(event) {
    await reply(event, 'POST', API + '/interactions/' + event.id + '/' + encodeURIComponent(event.token) + '/callback', { type: 5, data: {} });
    const user = event.member?.user || event.user || {};
    const who = (user.username || 'unknown') + ' (' + user.id + ')';
    const name = event.data?.name;
    let card;
    try {
      if (!ALLOWED_USERS.has(String(user.id))) { record({ email: 'Discord @' + (user.username || 'unknown') + ' (' + user.id + ')' }, name + '.refused', { guild: event.guild_id }); card = { tone: 'error', title: '/' + name, description: 'You aren’t allowed to run /' + name + '.' }; }
      else if (name === 'setup-server') card = await setupServer(event, who);
      else card = await forceSync(who);
    } catch (e) { card = { tone: 'error', title: '/' + name, description: (e.layout ? e.message : 'Something went wrong. Try again.').slice(0, 500) }; }
    await edit(event, card);
  }
  async function setupServer(event, who) {
    const {value}=await staff('/api/auth/discord-positions',{});if(requireCatalog&&!value?.positions)throw Object.assign(new Error('HR position catalogue unavailable.'),{layout:true});
    const layout = event.guild_id && loadRoles(rolesFile,networks?networks():null,value?.positions).find((l) => l.guildId === event.guild_id);
    if (!layout) return { tone: 'error', title: 'Set up server', description: 'This server is not in a registered network. Join it with /network join before running /setup-server.' };
    const roleSet=event.data?.options?.find(o=>o.name==='roles')?.value||'hn-administration';
    if(roleSet!=='hn-administration')return {tone:'error',title:'Set up server',description:'Choose HN administration roles.'};
    if (setup.busy()) {const job=setup.status?.(),p=job?.progress;return {tone:'info',title:'Server setup is working',description:'A setup is running'+(p?' — '+p.stage+(p.total>1?': '+p.n+' of '+p.total:''):'')+'.'+(job?.waitingUntil>now()?' Discord asked us to wait '+Math.ceil((job.waitingUntil-now())/1000)+' seconds.':'')+(job?.lastActivity?' Last activity '+Math.max(0,Math.floor((now()-job.lastActivity)/1000))+' seconds ago.':'')+' Stalled work is checked and resumed automatically.'};}
    await stopSync();
    if (running) return { tone: 'warn', title: 'Set up server', description: 'The staff role sync didn’t stop in time. Try again in a minute.' };
    // Progress in the reply, at most every 3 seconds, so it's clear the bot is still working.
    let lastEdit = 0;
    const progress = (stage, n, total, item) => { if (now() - lastEdit < 3000 && n !== total) return; lastEdit = now(); edit(event, { tone: 'info', title: 'Setting up ' + layout.server + '…', description: stage + ': ' + n + ' of ' + total + (item ? ' (' + item + ')' : '') }).catch(() => {}); };
    const r = await setup.autoApply(layout.guildId, layout, { force: true, who: 'HN Group Auth bot /setup-server by ' + who, progress });
    if (r.busy) return { tone: 'warn', title: 'Set up server', description: 'A setup is already running. Try again when it has finished.' };
    if (r.problems) return { tone: 'error', title: 'Can’t set up ' + layout.server + ' yet', description: 'Nothing was changed:\n• ' + r.problems.join('\n• ') };
    const synced = await sync(true).catch(() => null);
    const errors = r.errors || [];
    return { tone: errors.length ? 'warn' : 'ok', title: (errors.length ? '⚠️ ' : '✅ ') + layout.server + ' is set up',
      description: (r.done || []).filter((d) => d.startsWith('Deleted')).length + ' role(s) deleted, ' + (r.done || []).filter((d) => d.startsWith('Created')).length + ' created' + (synced ? '; ' + synced.changed + ' role change(s) for members from the staff portal.' : '.') + (errors.length ? '\n❌ ' + errors.slice(0, 10).join('\n❌ ') : '') };
  }
  async function forceSync(who) {
    if (setup.busy()) return { tone: 'warn', title: 'Force sync', description: 'A server setup is running. Try again when it has finished.' };
    await stopSync();
    record({ email: 'Discord @' + who }, 'positions.force-sync', {});
    const r = await sync(true);
    if (!r) return { tone: 'warn', title: 'Force sync', description: 'The bot is switched off or busy. Try again shortly.' };
    if (r.stopped) return { tone: 'warn', title: 'Force sync', description: 'The sync was stopped by another command after ' + r.changed + ' change(s).' };
    return { tone: r.errors.length ? 'warn' : 'ok', title: (r.errors.length ? '⚠️ ' : '✅ ') + 'Staff roles synced', description: r.changed + ' role change(s) made across ' + lastLayouts.length + ' servers; '+(r.logos||0)+' server logo(s) updated.' + (r.errors.length ? '\n❌ ' + r.errors.join('\n❌ ') : '') };
  }
  return { sync, stopSync, busy: () => running, state, rolesFor, changesFor, interaction, commands: COMMANDS, names: new Set(COMMANDS.map((c) => c.name)) };
}

module.exports = { createPositionSync, loadRoles, ROLES_FILE, COMMANDS };
