'use strict';
const crypto = require('node:crypto');
const { embed } = require('./server-setup');
const ID = /^\d{15,22}$/;
const VIEW = 1024n, SEND = 2048n, HISTORY = 65536n;
// Also disable threads, voice messages and polls while a ticket is read-only.
const THREADS = (1n << 35n) | (1n << 36n) | (1n << 38n);
const WRITE = SEND | (1n << 35n) | (1n << 36n) | (1n << 38n) | (1n << 46n) | (1n << 49n);
const opt = (name, description, type = 3, required = true, extra = {}) => ({ name, description, type, required, ...extra });
const sub = (name, description, options = []) => ({ name, description, type: 1, ...(options.length ? { options } : {}) });
const panel = () => opt('panel', 'Panel key, for example support.', 3, true, { max_length: 32 });
const createButtons = Array.from({length:4},(_,i)=>[
 opt('button-'+(i+1), 'Label for ticket button '+(i+1)+'.', 3, i===0, {max_length:80}),
 opt('category-'+(i+1), 'Open ticket category for button '+(i+1)+'.', 7, i===0, {channel_types:[4]}),
 opt('roles-'+(i+1), 'Ping/access role mentions or IDs for button '+(i+1)+', separated by spaces.', 3, i===0, {max_length:1000})
]).flat();
const COMMAND = { name: 'ticket', description: 'Configure ticket panels and manage support tickets.', type: 1, contexts: [0], integration_types: [0], options: [
 sub('create', 'Create a panel with up to four buttons and their own ticket categories.', [panel(), opt('title','Panel title.',3,true,{max_length:256}), opt('description','Panel description.',3,true,{max_length:3000}), opt('closed-category','Shared category for all closed tickets from this panel.',7,true,{channel_types:[4]}), opt('log-channel','Private channel for full ticket transcripts.',7,true,{channel_types:[0]}), ...createButtons]),
 sub('edit', 'Edit a panel draft; use send to update its published message.', [panel(), opt('title', 'Panel title.', 3, false, { max_length: 256 }), opt('description', 'Panel description.', 3, false, { max_length: 3000 }), opt('closed-category', 'Closed ticket category.', 7, false, { channel_types: [4] }), opt('log-channel', 'Private transcript channel.', 7, false, { channel_types: [0] })]),
 sub('button', 'Add or replace a ticket type and its ping/access roles.', [panel(), opt('key', 'Unique button key, for example hr.', 3, true, { max_length: 32 }), opt('label', 'Button label and ticket type.', 3, true, { max_length: 80 }), opt('roles', 'One or more role mentions or IDs, separated by spaces (not @everyone).', 3, true, { max_length: 1000 }), opt('category', 'Open ticket category for this button.', 7, true, {channel_types:[4]}), opt('department', 'Optional Staff Portal department: use /ticket departments.', 3, false, { max_length: 180 })]),
 sub('remove-button', 'Remove a ticket type from a panel draft.', [panel(), opt('key', 'Button key.')]),
 sub('send', 'Choose from your saved panels and publish one.', [opt('channel', 'Where to send the panel (defaults to this channel).', 7, false, { channel_types: [0, 5] })]),
 sub('show', 'Show panel configuration (Manage Server required).', [panel(), opt('page', 'Page of button settings.', 4, false, {min_value: 1})]),
 sub('departments', 'List current Staff Portal departments and transfer role mappings.', [opt('page', 'Page of departments.', 4, false, {min_value:1})]),
 sub('department', 'Map a Staff Portal department to server roles (Manage Server required).', [opt('name', 'Exact department from /ticket departments.', 3, true, { max_length: 180 }), opt('roles', 'One or more role mentions or IDs.', 3, true, { max_length: 1000 })]),
 ...['claim', 'close', 'reopen', 'transfer', 'log', 'delete'].map(name => sub(name, name[0].toUpperCase() + name.slice(1) + ' this ticket.'))
] };
const safe = value => String(value || '').replace(/[\\`*_{}\[\]()<>#|~]/g, '\\$&');
const key = value => { if (!/^[a-z0-9_-]{1,32}$/.test(value || '')) throw Error('Use a key of 1–32 lowercase letters, numbers, underscores or hyphens.'); return value; };
const card = (title, description) => ({ ...embed({ title, description }), footer: { text: 'HN Utilities' } });
const rows = buttons => Array.from({ length: Math.ceil(buttons.length / 5) }, (_, i) => ({ type: 1, components: buttons.slice(i * 5, i * 5 + 5) }));
function channelName(t) {
 const prefix=String(t.label||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'')||'ticket';
 const suffix='-'+String(t.number).padStart(4,'0');
 return prefix.slice(0,100-suffix.length).replace(/-+$/,'')+suffix;
}
function controls(t) {
 return rows(['claim', 'close', 'reopen', 'transfer', 'log', 'delete'].map(action => ({ type: 2, style: action === 'delete' ? 4 : action === 'claim' ? 1 : 2, label: action[0].toUpperCase() + action.slice(1), custom_id: 'ticket:' + action, disabled: action === 'delete' ? !t.logged || !t.closed : action === 'reopen' ? !t.closed : action === 'claim' ? !!t.claimant || t.closed : action === 'close' ? t.closed : action === 'transfer' ? t.closed : false })));
}
function opening(t) {
 const e = card('Ticket ' + t.number + ': ' + t.label, 'A member of our team will be with you shortly.');
 e.fields = [{ name: 'Opened by', value: '<@' + t.opener + '>', inline: true }, { name: 'Claimed by', value: t.claimant ? '<@' + t.claimant + '>' : 'Awaiting a team member', inline: true }, { name: 'Status', value: t.logged ? 'Logged and closed' : t.closed ? 'Closed' : 'Open', inline: true }];
 if (t.department) e.fields.push({ name: 'Department', value: safe(t.department).slice(0, 1024) });
 return { embeds: [e], components: controls(t), allowed_mentions: { parse: [] } };
}
function overwrites(t, bot) {
 const entries = new Map();
 const put = (id, type, allow, deny) => entries.set(id, { id, type, allow: String(allow), deny: String(deny) });
 put(t.guild, 0, 0n, VIEW | WRITE);
 for (const role of t.roles) put(role, 0, VIEW | HISTORY | (!t.closed && !t.claimant ? SEND : 0n), t.closed || t.claimant ? WRITE : THREADS);
 for (const member of t.members || []) put(member, 1, VIEW | HISTORY | (!t.closed && !t.claimant ? SEND : 0n), t.closed || t.claimant ? WRITE : THREADS);
 put(t.opener, 1, VIEW | HISTORY | (!t.closed ? SEND : 0n), t.closed ? WRITE : THREADS);
 if (t.claimant) put(t.claimant, 1, VIEW | HISTORY | (!t.closed ? SEND : 0n), t.closed ? WRITE : THREADS);
 put(bot, 1, VIEW | HISTORY | SEND | 16384n | 32768n, 0n);
 if (entries.size > 100) throw Error('This department exceeds Discord’s 100 permission-overwrite limit. Configure a department role with /ticket department.');
 return [...entries.values()];
}
function transcript(messages, context = {}) {
 const users=new Map();
 for(const m of messages){if(m.author)users.set(m.author.id,m.member?.nick||m.author.global_name||m.author.username);for(const u of m.mentions||[])users.set(u.id,u.member?.nick||u.global_name||u.username);}
 const roles=new Map((context.roles||[]).map(r=>[r.id,r.name]));
 const text=value=>safe(String(value||'').replace(/<@!?(\d+)>/g,(_,id)=>'@'+(users.get(id)||'User '+id)).replace(/<@&(\d+)>/g,(_,id)=>'@'+(roles.get(id)||'Role '+id)).replace(/<#(\d+)>/g,(_,id)=>'#'+(id===context.channel?context.channelName:'Channel '+id)));
 const stamp=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'Time unavailable':new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date)+' London';};
 const chunks=[];let chunk='';
 const append=block=>{if(chunk&&chunk.length+block.length+2>3500){chunks.push(chunk);chunk='';}chunk+=(chunk?'\n\n':'')+block;};
 for(const m of messages){
  const author=text(users.get(m.author?.id)||'Unknown sender'),username=m.author?.username;
  const header='**'+author+'**'+(username&&username!==(users.get(m.author?.id))?' (@'+text(username)+')':'')+' · '+stamp(m.timestamp)+(m.author?.bot?' · Bot':'');
  const parts=[];
  if(m.message_reference){const ref=messages.find(other=>other.id===m.message_reference.message_id);parts.push('*Reply to '+(ref?text(users.get(ref.author?.id)||'another message'):'an earlier message')+'*');}
  if(m.content)parts.push(text(m.content));
  for(const e of m.embeds||[]){if(e.title)parts.push('**'+text(e.title)+'**');if(e.description)parts.push(text(e.description));for(const f of e.fields||[])parts.push('**'+text(f.name)+':** '+text(f.value));if(e.image?.url)parts.push('[Embedded image]('+e.image.url+')');if(e.url)parts.push('[Linked page]('+e.url+')');}
  for(const attachment of m.attachments||[])parts.push('📎 **Attachment:** ['+text(attachment.filename||'Download file')+']('+attachment.url+')');
  for(const sticker of m.sticker_items||[])parts.push('Sticker: '+text(sticker.name));
  if(m.poll){parts.push('**Poll:** '+text(m.poll.question?.text));for(const answer of m.poll.answers||[]){const count=m.poll.results?.answer_counts?.find(a=>a.id===answer.answer_id)?.count;parts.push('• '+text(answer.poll_media?.text)+(count===undefined?'':' — '+count+' votes'));}}
  if(m.edited_timestamp)parts.push('*Edited '+stamp(m.edited_timestamp)+'*');
  let body=parts.join('\n')||'*No text content.*',continued=false;
  const link=context.guild&&context.channel?' · [View message](https://discord.com/channels/'+context.guild+'/'+context.channel+'/'+m.id+')':'';
  while(body.length){
   const heading=header+(continued?' · continued':'')+link+'\n',limit=3500-heading.length;
   let cut=Math.min(limit,body.length);if(cut<body.length){const boundary=Math.max(body.lastIndexOf('\n',cut),body.lastIndexOf(' ',cut));if(boundary>limit/2)cut=boundary+1;if(/[\uD800-\uDBFF]/.test(body[cut-1]))cut--;}
   append(heading+body.slice(0,cut));body=body.slice(cut);continued=true;
  }
 }
 if(chunk)chunks.push(chunk);
 return chunks.length?chunks:['No messages.'];
}

function digest(messages, initial) {
 const stable = messages.map(m => ({id:m.id, content:m.content||'', attachments:m.attachments||[], embeds:m.id===initial?[]:m.embeds||[], components:m.id===initial?[]:m.components||[], stickers:m.sticker_items||[], poll:m.poll||null, reference:m.message_reference||null})).sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
 return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
function createTickets({ state, commit, api, respond, defer, dismiss = async () => {}, schedule = (fn,ms) => {const timer=setTimeout(fn,ms);timer.unref?.();}, staff, botId, record = () => {} }) {
 let busy = null;
 const transport=respond;
 const actionOf=event=>event.data?.custom_id?.split(':')[1]||event.data?.options?.[0]?.name||'ticket';
 const labels={claim:'Claiming',close:'Closing',reopen:'Reopening',transfer:'Transferring',choose:'Transferring',log:'Logging',delete:'Deleting',create:'Creating a ticket panel',edit:'Editing a ticket panel',send:'Selecting a ticket panel',publish:'Publishing a ticket panel',button:'Editing a ticket button',panels:'Listing ticket panels',show:'Showing a ticket panel',departments:'Listing departments',department:'Configuring a department',open:'Opening a ticket'};
 respond=async(event,payload)=>{
  if(payload.content){const action=actionOf(event);payload={...payload,content:'',embeds:[card('Ticket · '+(action==='choose'?'Transfer':action.charAt(0).toUpperCase()+action.slice(1)),payload.content),...(payload.embeds||[])]};}
  return transport(event,payload);
 };
 const seen = new Set();
 const read = () => structuredClone(state() || { guilds: {} });
 const guildState = (db, guild) => (db.guilds ||= {}, db.guilds[guild] ||= { panels: {}, tickets: {}, next: 1, departments: {} });
 async function channel(id, guild, types) { if (!ID.test(String(id))) throw Error('Choose a channel in this server.'); const c = await api('GET', '/channels/' + id); if (c.guild_id !== guild || !types.includes(c.type)) throw Error('Choose the correct channel type in this server.'); return c; }
 // Discord's deferred reply is itself a channel message. It and subsequent command
 // replies must not be mistaken for changes to the underlying conversation.
 const commandReply=m=>m.author?.id===botId()&&!!(m.interaction||m.interaction_metadata||m.type===20||(BigInt(m.flags||0)&128n));
 async function history(t){
  let before,messages=[];
  for(;;){const page=await api('GET','/channels/'+t.channel+'/messages?limit=100'+(before?'&before='+before:''));if(!Array.isArray(page))throw Error('Could not read the full ticket history.');messages.push(...page.filter(m=>!commandReply(m)));if(page.length<100)break;const next=page.at(-1).id;if(next===before)throw Error('Ticket history pagination stalled. Try Log again.');before=next;}
  return messages.sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
 }
 async function logExists(t){
  if(!t.log?.sent?.length)return false;
  for(const id of t.log.sent){try{await api('GET','/channels/'+t.logChannel+'/messages/'+id);}catch(e){if(e.status===404||e.code===10008||/Unknown Message/i.test(e.message))return false;throw e;}}
  return true;
 }
 async function invalidateLog(t,gs,db){t.logged=false;delete t.log;gs.tickets[t.channel]=t;commit(db);await update(t,gs,db);}
 async function identity(event) {
  const user = event.member?.user?.id;
  if (!ID.test(String(event.guild_id)) || !ID.test(String(user))) throw Error('Use /ticket in a server.');
  const [member, roles, guild] = await Promise.all([api('GET', '/guilds/' + event.guild_id + '/members/' + user), api('GET', '/guilds/' + event.guild_id + '/roles'), api('GET', '/guilds/' + event.guild_id)]);
  const bits = roles.filter(r => r.id === event.guild_id || member.roles.includes(r.id)).reduce((n, r) => n | BigInt(r.permissions || 0), 0n);
  return { user, member, roles, admin: guild.owner_id === user || !!(bits & (8n | 32n)) };
 }
 async function parseRoles(value, who, guild) {
  const tokens = String(value || '').replace(/<@&(\d+)>/g, '$1').split(/[\s,]+/).filter(Boolean), ids = [...new Set(tokens)];
  if (!ids.length || ids.length > 20 || ids.some(id => !ID.test(id) || id === guild || !who.roles.some(r => r.id === id && !r.managed))) throw Error('Choose 1–20 existing, non-managed roles; @everyone is not allowed.');
  return ids;
 }
 async function departments() {
  const result = await staff?.('/api/auth/discord-staff-list', {});
  if (!Array.isArray(result?.value?.people)) throw Error('Staff Portal departments are unavailable. Try again shortly.');
  const map = new Map();
  for (const person of result.value.people) for (const role of person.roles || []) if (role.department?.trim()) {
   const name = role.company + ' / ' + role.department;
   if (!map.has(name)) map.set(name, { name, department: role.department, titles: new Set(), members: new Set() });
   const d = map.get(name); d.titles.add(role.title); if (ID.test(person.discordId || '')) d.members.add(person.discordId);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
 }
 async function target(name, gs, who) {
  const all = await departments(), d = all.find(d => d.name === name);
  if (!d) throw Error('Choose a current department from /ticket departments.');
  const mapped = gs.departments[name];
  const roles = mapped || who.roles.filter(r => !r.managed && (r.name.toLowerCase() === d.department.toLowerCase() || d.titles.has(r.name) && !all.some(other => other.name !== name && other.titles.has(r.name)))).map(r => r.id);
  if (!roles.length || roles.some(id => id === gs.guild || !who.roles.some(r => r.id === id))) throw Error('Map this department’s ping/access roles first using /ticket department.');
  return { department: name, roles, members: [...d.members] };
 }
 async function update(t, gs, db) {
  await api('PATCH', '/channels/' + t.channel, { parent_id: t.closed ? t.closedCategory : t.openCategory, permission_overwrites: overwrites(t, botId()), lock_permissions: false });
  gs.tickets[t.channel] = t; commit(db);
  if (t.message) await api('PATCH', '/channels/' + t.channel + '/messages/' + t.message, opening(t));
 }
 async function notice(t, title, text, ping = false, nonce = '') {
  return api('POST', '/channels/' + t.channel + '/messages', { content: ping ? t.roles.map(r => '<@&' + r + '>').join(' ') : '', embeds: [card(title, text)], allowed_mentions: { parse: [], ...(ping ? { roles: t.roles } : {}) }, ...(nonce ? { nonce, enforce_nonce: true } : {}) });
 }
 async function transferMenu(event, t, page = 0) {
  const all = await departments(), slice = all.slice(page * 25, page * 25 + 25);
  if (!slice.length) throw Error('No departments are recorded in the Staff Portal.');
  // Keep full department names server-side, never trust a name submitted by a client.
  const db = read(), gs = guildState(db, t.guild); gs.tickets[t.channel].menu = { user: event.member.user.id, expires: Date.now() + 300000, names: slice.map(d => d.name) }; commit(db);
  const components = [{ type: 1, components: [{ type: 3, custom_id: 'ticket:choose', placeholder: 'Choose the destination department', options: slice.map((d, i) => ({ label: d.name.slice(0, 100), value: String(i) })) }] }];
  const nav = []; if (page) nav.push({ type: 2, style: 2, label: 'Previous', custom_id: 'ticket:page:' + (page - 1) }); if ((page + 1) * 25 < all.length) nav.push({ type: 2, style: 2, label: 'Next', custom_id: 'ticket:page:' + (page + 1) }); if (nav.length) components.push({ type: 1, components: nav });
  await respond(event, { content: 'Choose a Staff Portal department for ticket ' + t.number + '.', components, allowed_mentions: { parse: [] } });
 }
 async function run(event) {
  const who = await identity(event), db = read(), gs = guildState(db, event.guild_id); gs.guild = event.guild_id;
  const custom = event.data.custom_id?.split(':') || [], command = event.data.options?.[0];
  let action = custom[1] || command?.name;
  const fields = Object.fromEntries((command?.options || []).map(o => [o.name, o.value]));
  const reply = text => respond(event, { content: text, components: [], allowed_mentions: { parse: [] } });
  if (['create', 'edit', 'button', 'remove-button', 'send', 'show', 'department', 'departments', 'publish', 'panels'].includes(action)) {
   if (!who.admin) throw Error('Manage Server permission is required to configure tickets.');
   if (action === 'departments') {
    const all=await departments(),page=fields.page||1,pages=Math.max(1,Math.ceil(all.length/4));if(page>pages)throw Error('Choose a page from 1 to '+pages+'.');
    const text=all.slice((page-1)*4,page*4).map(d => safe(d.name) + ' — ' + (gs.departments[d.name]?.map(r => '<@&' + r + '>').join(', ') || 'Automatic matching; /ticket department sets explicit roles.')).join('\n\n') || 'No departments are recorded in the Staff Portal.';
    return respond(event,{embeds:[card('Staff Portal departments · '+page+'/'+pages,text)],allowed_mentions:{parse:[]}});
   }
   if (action === 'department') { if (!(await departments()).some(d => d.name === fields.name)) throw Error('Use the exact name from /ticket departments.'); gs.departments[fields.name] = await parseRoles(fields.roles, who, event.guild_id); commit(db); return reply('Department roles saved.'); }
   if (action==='panels' || action==='send' && !fields.panel) {
    const destination=custom[2]||fields.channel||event.channel_id,page=action==='panels'?Number(custom[3]):0;
    await channel(destination,event.guild_id,[0,5]);
    const all=Object.values(gs.panels).sort((a,b)=>a.key.localeCompare(b.key));
    if(!all.length)throw Error('No panels have been created in this server. Use /ticket create first.');
    if(!Number.isInteger(page)||page<0||page*25>=all.length)throw Error('That panel list page is unavailable. Run /ticket send again.');
    const components=[{type:1,components:[{type:3,custom_id:'ticket:publish:'+destination,placeholder:'Choose a saved ticket panel',options:all.slice(page*25,page*25+25).map(p=>({label:p.key.slice(0,100),description:(p.title+' · '+Object.keys(p.types).length+' buttons').slice(0,100),value:p.key}))}]}];
    const nav=[];if(page)nav.push({type:2,style:2,label:'Previous',custom_id:'ticket:panels:'+destination+':'+(page-1)});if((page+1)*25<all.length)nav.push({type:2,style:2,label:'Next',custom_id:'ticket:panels:'+destination+':'+(page+1)});if(nav.length)components.push({type:1,components:nav});
    return respond(event,{content:'Choose a panel to publish in <#'+destination+'> · Page '+(page+1)+'/'+Math.ceil(all.length/25)+'.',components,allowed_mentions:{parse:[]}});
   }
   if(action==='publish'){fields.panel=event.data.values?.[0];fields.channel=custom[2];action='send';}
   const name = key(fields.panel); let p = gs.panels[name];
   if(action==='create'&&Object.keys(gs.panels).length>=100)throw Error('This server already has 100 panels. Edit an existing panel.');
   if (action === 'create' && p) throw Error('That panel key already exists. Use /ticket edit.');
   if (action !== 'create' && !p) throw Error('Create this panel with /ticket create first.');
   if (action === 'create' || action === 'edit') {
    p = structuredClone(p || { key: name, types: {} });
    for (const field of ['title', 'description']) if (fields[field] !== undefined) { if (!fields[field].trim()) throw Error('Title and description cannot be blank.'); p[field] = fields[field]; }
    for (const [field, dest, types] of [['open-category', 'openCategory', [4]], ['closed-category', 'closedCategory', [4]], ['log-channel', 'logChannel', [0]]]) if (fields[field]) { await channel(fields[field], event.guild_id, types); p[dest] = fields[field]; }
    if(action==='create') {
     for(let i=1;i<=4;i++){
      const label=fields['button-'+i],category=fields['category-'+i],roles=fields['roles-'+i];
      if(label===undefined&&category===undefined&&roles===undefined){if(i===1)throw Error('Configure button-1, category-1 and roles-1.');continue;}
      if(!label?.trim()||!category||!roles)throw Error('Button '+i+' needs its label, category and roles together.');
      await channel(category,event.guild_id,[4]);p.types['button-'+i]={label,openCategory:category,roles:await parseRoles(roles,who,event.guild_id),department:''};
     }
    }
    gs.panels[name] = p; commit(db); return reply('Panel `' + name + '` saved. Use /ticket send to choose and publish it. Existing tickets retain their saved settings.');
   }
   if (action === 'button') { const k = key(fields.key); if (!p.types[k] && Object.keys(p.types).length >= 4) throw Error('A panel supports a maximum of 4 buttons.'); if (!fields.label.trim()) throw Error('Choose a button label.'); if (fields.department && !(await departments()).some(d => d.name === fields.department)) throw Error('Use a department from /ticket departments.'); await channel(fields.category,event.guild_id,[4]); p.types[k] = { label: fields.label, openCategory: fields.category, roles: await parseRoles(fields.roles, who, event.guild_id), department: fields.department || '' }; commit(db); return reply('Button saved. Use /ticket send to publish the updated panel.'); }
   if (action === 'remove-button') { delete p.types[key(fields.key)]; commit(db); return reply('Button removed from the draft. Use /ticket send to update the panel.'); }
   if (action === 'show') {
    const types=Object.entries(p.types), page=fields.page||1, pages=Math.max(1,Math.ceil(types.length/2));
    if(page>pages)throw Error('Choose a page from 1 to '+pages+'.');
    return respond(event, { embeds: [card('Panel: ' + name + ' · '+page+'/'+pages, '**' + safe(p.title) + '**\n' + (page===1?p.description+'\n\n':'') + 'Closed: <#' + p.closedCategory + '>\nLogs: <#' + p.logChannel + '>'), ...types.slice((page-1)*2,page*2).map(([k, t]) => card(k + ': ' + t.label, 'Open category: <#'+(t.openCategory||p.openCategory)+'>\nRoles: ' + t.roles.map(r => '<@&' + r + '>').join(' ') + '\nDepartment: ' + safe(t.department || 'Not linked')))], allowed_mentions: { parse: [] } });
   }
   if (!Object.keys(p.types).length) throw Error('Add at least one /ticket button first.');
   if(Object.keys(p.types).length>4)throw Error('A panel supports a maximum of 4 buttons. Remove extra buttons before publishing.');
   for(const t of Object.values(p.types))await channel(t.openCategory||p.openCategory,event.guild_id,[4]);
   await channel(fields.channel, event.guild_id, [0, 5]);
   const payload = { embeds: [card(p.title, p.description)], components: rows(Object.entries(p.types).map(([k, t]) => ({ type: 2, style: 2, label: t.label, custom_id: 'ticket:open:' + name + ':' + k }))), allowed_mentions: { parse: [] } };
   const message = await api(p.published?.channel === fields.channel ? 'PATCH' : 'POST', '/channels/' + fields.channel + '/messages' + (p.published?.channel === fields.channel ? '/' + p.published.message : ''), payload);
   p.published = { channel: fields.channel, message: message.id, types: Object.fromEntries(Object.entries(p.types).map(([k,t])=>[k,{...structuredClone(t),openCategory:t.openCategory||p.openCategory}])), config: { openCategory: p.openCategory, closedCategory: p.closedCategory, logChannel: p.logChannel } }; commit(db); return reply('Ticket panel published in <#' + fields.channel + '>.');
  }
  if (action === 'open') {
   const p = gs.panels[custom[2]], type = p?.published?.types[custom[3]];
   if (!type || event.channel_id !== p.published.channel || event.message?.id !== p.published.message) throw Error('This panel is no longer active. Use the latest panel.');
   const existing = Object.values(gs.tickets).find(t => t.opener === who.user && t.panel === custom[2] && t.type === custom[3] && !t.closed && !t.deleted && t.channel);
   if (existing && !existing.message) { const msg=await api('POST','/channels/'+existing.channel+'/messages',{...opening(existing),content:(existing.pingRoles||existing.roles).map(r=>'<@&'+r+'>').join(' '),allowed_mentions:{parse:[],roles:existing.pingRoles||existing.roles},nonce:'ticket-open-'+existing.number,enforce_nonce:true});existing.message=msg.id;commit(db); }
   if (existing) return reply('You already have an open ticket: <#' + existing.channel + '>.');
   for (const [id, types] of [[type.openCategory||p.published.config.openCategory, [4]], [p.published.config.closedCategory, [4]], [p.published.config.logChannel, [0]]]) await channel(id, event.guild_id, types);
   if (type.roles.some(id => !who.roles.some(r => r.id === id))) throw Error('A configured support role was removed. Ask a server administrator to update this panel.');
   const pendingKey = 'pending:' + who.user + ':' + custom[2] + ':' + custom[3];
   let t = gs.tickets[pendingKey];
   if (!t) { t = { guild: event.guild_id, number: gs.next++, opener: who.user, panel: custom[2], type: custom[3], ...p.published.config, ...structuredClone(type), openCategory:type.openCategory||p.published.config.openCategory, closed: false, logged: false, createdAt: new Date().toISOString() }; gs.tickets[pendingKey] = t; commit(db); }
   const topic = 'HN Utilities ticket ' + t.number + ' | opener ' + t.opener;
   const channels = await api('GET', '/guilds/' + t.guild + '/channels');
   const c = channels.find(c => c.topic === topic) || await api('POST', '/guilds/' + t.guild + '/channels', { name: channelName(t), type: 0, topic, parent_id: t.openCategory, permission_overwrites: overwrites(t, botId()) });
   t.channel = c.id; gs.tickets[c.id] = t; delete gs.tickets[pendingKey]; commit(db);
   const payload = { ...opening(t), content: (t.pingRoles||t.roles).map(r => '<@&' + r + '>').join(' '), allowed_mentions: { parse: [], roles: t.pingRoles||t.roles }, nonce: 'ticket-open-' + t.number, enforce_nonce: true };
   const msg = await api('POST', '/channels/' + c.id + '/messages', payload); t.message = msg.id; commit(db);
   record(null, 'ticket.open', { guild: t.guild, channel: c.id, number: t.number });
   await reply('Your ticket is ready: <#' + c.id + '>.');
   schedule(()=>Promise.resolve(dismiss(event)).catch(()=>{}),5000);return;
  }
  const t = gs.tickets[event.channel_id];
  if (!t || t.deleted || t.guild !== event.guild_id) throw Error('Use these controls inside an active ticket channel.');
  const allowed = who.admin || t.roles.some(r => who.member.roles.includes(r)) || (t.members || []).includes(who.user) || t.claimant === who.user;
  if (!allowed) throw Error('Only the assigned support team or a server manager can manage this ticket.');
  if (t.claimant && t.claimant !== who.user && !who.admin) throw Error('This ticket is claimed. Only its claimant or a server manager can change it.');
  if (custom.length && !['choose', 'page'].includes(action) && event.message?.id !== t.message) throw Error('Use the controls under the initial ticket embed.');
  if (action === 'transfer' || action === 'page') { if (t.closed) throw Error('Reopen the ticket before transferring it.'); return transferMenu(event, t, action === 'page' ? Number(custom[2]) : 0); }
  if (action === 'choose') {
   const menu = t.menu, index = Number(event.data.values?.[0]);
   if (!menu || menu.user !== who.user || menu.expires < Date.now() || !Number.isInteger(index) || !menu.names[index]) throw Error('This transfer menu expired. Press Transfer again.');
   if (t.closed) throw Error('Reopen the ticket before transferring it.');
   Object.assign(t, await target(menu.names[index], gs, who), { claimant: null, logged: false }); delete t.menu; delete t.log;
   await update(t, gs, db); await notice(t, 'Ticket transferred', '<@' + who.user + '> transferred this ticket to **' + safe(t.department) + '**. A member of the team will be with you shortly.', true, event.id); return dismiss(event);
  }
  if (action === 'claim') { if (t.closed) throw Error('Reopen the ticket first.'); if (t.claimant) throw Error('This ticket is already claimed.'); if (who.user === t.opener) throw Error('You cannot claim your own ticket.'); t.claimant = who.user; await update(t, gs, db); await notice(t, 'Ticket claimed', 'This ticket has been claimed by <@' + who.user + '>.', false, event.id); }
  else if (action === 'close') { if (t.closed) throw Error('This ticket is already closed.'); t.closed = true; await update(t, gs, db); await notice(t, 'Ticket closed', '<@' + who.user + '> closed this ticket.', false, event.id); }
  else if (action === 'reopen') { if (!t.closed) throw Error('This ticket is already open.'); t.closed = false; t.logged = false; delete t.log; await update(t, gs, db); await notice(t, 'Ticket reopened', '<@' + who.user + '> reopened this ticket.', false, event.id); }
  else if (action === 'log') {
   if(t.logged){const current=await history(t);if(digest(current,t.message)===t.log?.digest&&await logExists(t))return dismiss(event);await invalidateLog(t,gs,db);}
   const app = await api('GET', '/applications/@me');
   if (!(BigInt(app.flags || app.flags_new || 0) & ((1n << 18n) | (1n << 19n)))) throw Error('Enable Message Content Intent for HN Utilities in the Discord Developer Portal before logging. An incomplete transcript will not permit deletion.');
   await channel(t.logChannel, t.guild, [0]);
   if (t.logChannel === t.channel) throw Error('The log channel must be separate from the ticket.');
   t.closed = true;
   // Freeze conversation before taking a snapshot. Move only once every log part is delivered.
   await api('PATCH', '/channels/' + t.channel, { permission_overwrites: overwrites(t, botId()) }); gs.tickets[t.channel] = t; commit(db);
   if (!t.log) {
    if(busy)busy.stage='Reading the conversation';
    const messages=await history(t);
    t.log = { parts: transcript(messages,{guild:t.guild,channel:t.channel,channelName:channelName(t),roles:who.roles}), sent: [], count: messages.length, digest: digest(messages, t.message), lastMessage: messages.at(-1)?.id || null, id: crypto.randomBytes(8).toString('hex') }; commit(db);
   }
   for (let i = t.log.sent.length; i < t.log.parts.length; i++) {
    if(busy)busy.stage='Sending transcript part '+(i+1)+' of '+t.log.parts.length;
    const msg = await api('POST', '/channels/' + t.logChannel + '/messages', { embeds: [card('Ticket ' + t.number + ' · Transcript ' + (i + 1) + '/' + t.log.parts.length, '**Opened by:** <@' + t.opener + '>\n**Type:** ' + safe(t.label) + '\n**Messages:** ' + t.log.count + '\n\n' + t.log.parts[i])], allowed_mentions: { parse: [] }, nonce: t.log.id + '-' + i, enforce_nonce: true });
    t.log.sent.push(msg.id); commit(db);
   }
   const current=await history(t);
   if(digest(current,t.message)!==t.log.digest){await invalidateLog(t,gs,db);throw Error('The conversation changed during logging. The ticket is still closed. Press Log again to capture the latest messages, then Delete.');}
   t.logged = true; await update(t, gs, db); delete t.log.parts; commit(db);
  }
  else if (action === 'delete') {
   if (!t.closed || !t.logged || !t.log?.sent?.length) throw Error('Log the entire ticket successfully before deleting it.');
   if(busy)busy.stage='Checking the saved transcript and conversation';
   const current=await history(t);
   if(digest(current,t.message)!==t.log.digest){await invalidateLog(t,gs,db);throw Error('The conversation changed after logging. The ticket is still closed. Press Log again, then Delete.');}
   if(!await logExists(t)){await invalidateLog(t,gs,db);throw Error('A saved transcript message is missing. The ticket is still closed. Press Log again, then Delete.');}
   await api('DELETE', '/channels/' + t.channel); t.deleted = true; t.deletedAt = new Date().toISOString(); commit(db);
  } else throw Error('Unknown ticket action.');
  record(null, 'ticket.' + action, { guild: t.guild, channel: t.channel, actor: who.user, number: t.number });
  return dismiss(event);
 }
 async function interaction(event) {
  if (!ID.test(String(event.id)) || seen.has(event.id)) return;
  await defer(event); seen.add(event.id); if (seen.size > 3000) seen.delete(seen.values().next().value);
  if(busy){
   const sameGuild=busy.guild===event.guild_id;
   return respond(event,{content:(sameGuild?busy.label:busy.operation+' in another server')+' is in progress.'+(sameGuild&&busy.stage?'\n'+busy.stage+'.':'')+'\nStarted <t:'+Math.floor(busy.started/1000)+':R>. Please wait for it to finish before trying again.',allowed_mentions:{parse:[]}});
  }
  const action=actionOf(event),ticket=read().guilds?.[event.guild_id]?.tickets?.[event.channel_id],operation=labels[action]||'Processing '+action;
  busy={guild:event.guild_id,operation,label:operation+(ticket&&!operation.includes('panel')?' ticket '+ticket.number:''),started:Date.now(),stage:''};
  try { await run(event); } catch (error) { await respond(event, { content: String(error.message || 'Ticket operation failed. Try again.').slice(0, 1800), components: [], allowed_mentions: { parse: [] } }); } finally { busy = null; }

 }
 return { interaction };
}
module.exports = { COMMAND, createTickets, channelName, controls, opening, overwrites, transcript, WRITE };
