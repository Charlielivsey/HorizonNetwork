'use strict';
// Explicit, non-destructive HQ layout requested 18 November 2026.
// Uses HN Utilities' existing paced Discord transport. Never deletes channels or roles.
const fs=require('node:fs'),path=require('node:path');
const {bits}=require('/opt/hn-auth/server-setup');
const {createSetupRequests}=require('/opt/hn-auth/discord-setup-requests');
const G='1360208008755413227',prefix='・┊',reason='HN Utilities: approved HQ layout and NPL permissions, requested by server owner';
const backup=fs.readFileSync('/tmp/hn-hq-backup-path','utf8').trim();
const credentials=JSON.parse(fs.readFileSync('/var/lib/hn-auth/discord.json'));
const request=createSetupRequests({config:()=>({bot:credentials.bot_token})});
const journal=[];
async function api(method,url,body){const value=await request(method,url,body,method==='GET'?undefined:reason);if(method!=='GET'){journal.push({at:new Date().toISOString(),method,url,body,result:value?.id});fs.writeFileSync(path.join(backup,'changes.json'),JSON.stringify(journal,null,2),{mode:0o600});}return value;}
const b=names=>bits(names,'HQ layout');
const write=['SendMessages','SendMessagesInThreads','CreatePublicThreads','CreatePrivateThreads','SendVoiceMessages','SendPolls'];
const contentManage=['ManageMessages','ManageThreads'];
const change=['ManageChannels','ManageRoles','ManageWebhooks'];
const basic=['ViewChannel','ReadMessageHistory','SendMessages','SendMessagesInThreads','AddReactions','EmbedLinks','AttachFiles','UseExternalEmojis','UseExternalStickers','UseApplicationCommands','Connect','Speak','Stream','UseVAD','ChangeNickname','UseEmbeddedActivities','SendVoiceMessages'];
const definitions=[
 ['HN | Important',['welcome','appeals-server'],'info'],
 ['HN | Horizon Network',['HN-announcements','HN-coc','HN-servers','CO-servers','CO-announcements','CO-coc'],'info'],
 ['HN | Community',['lobby','media','suggestions','bot-commands'],'community'],
 ['HN | Public Voice',['Public 1','Public 2','Public 3','AFK'],'voice'],
 ['HN | NA Contact',['contact-na'],'info'],
 ['HN | Open Tickets',[],'ticket'],['HN | Closed Tickets',[],'closed'],
 ['──── Staff Area ────',[],'staffInfo'],
 ['HN | Staff Information',['HN-coc','information'],'staffInfo'],
 ['HN | Staff General',['lobby','media','bot-commands'],'staff'],
 ['HN | Logs',['message-logs','member-logs','moderation-logs','role-logs','channel-logs','voice-logs','invite-logs','bot-logs','ticket-transcripts'],'logs']
];
(async()=>{
 const guild=await api('GET','/guilds/'+G);if(guild.id!==G||guild.owner_id!=='1256504335110635531')throw Error('HQ identity mismatch');
 const me=await api('GET','/users/@me');if(me.id!==credentials.client_id||me.username!=='HN Utilities')throw Error('Utilities identity mismatch');
 let roles=await api('GET','/guilds/'+G+'/roles'),channels=await api('GET','/guilds/'+G+'/channels');
 const role=name=>{const r=roles.find(r=>r.name===name);if(!r)throw Error('Missing role '+name);return r.id;};
 for(let n=1;n<=5;n++)role('Network Permission Level '+n);
 let staffRole=roles.find(r=>r.name==='Network Staff');
 if(!staffRole){staffRole=await api('POST','/guilds/'+G+'/roles',{name:'Network Staff',permissions:'0',color:0,hoist:false,mentionable:false});roles.push(staffRole);}
 const npl=n=>role('Network Permission Level '+n);
 const entry=(id,allow=[],deny=[],type=0)=>({id,type,allow:b(allow),deny:b(deny)});
 const overwrites=kind=>{
  const privateArea=['staff','staffInfo','logs','ticket','closed'].includes(kind);
  const deny=[...change,'MentionEveryone',...contentManage];
  if(privateArea)deny.push('ViewChannel');
  if(['info','staffInfo','logs','closed','ticket'].includes(kind))deny.push(...write);
  const out=[entry(G,privateArea?[]:['ViewChannel','ReadMessageHistory'],deny),entry(me.id,['ViewChannel','ReadMessageHistory',...write,...contentManage,...change],[],1)];
  if(['staff','staffInfo'].includes(kind))out.push(entry(staffRole.id,['ViewChannel','ReadMessageHistory',...(kind==='staff'?write:[])]));
  if(kind==='community')out.push(entry(npl(2),['ManageMessages']));
  for(const n of [3,4]){
   let allow=[];
   if(['community','staff'].includes(kind))allow.push('ViewChannel','ReadMessageHistory',...contentManage);
   if(kind==='voice')allow.push('MuteMembers','DeafenMembers','MoveMembers');
   if(['staffInfo','logs','ticket','closed'].includes(kind))allow.push('ViewChannel','ReadMessageHistory');
   if(n===4&&['info','staffInfo'].includes(kind))allow.push(...write,...contentManage,'ManageChannels');
   if(n===4&&['community','staff','voice'].includes(kind))allow.push('ManageChannels');
   if(kind==='logs')out.push(entry(npl(n),allow,[...write,...contentManage,...change]));
   else if(allow.length)out.push(entry(npl(n),allow));
  }
  return out;
 };
 const rolePermissions={1:basic,2:basic,3:[...basic,'ModerateMembers','ManageNicknames'],4:[...basic,'ModerateMembers','ManageNicknames','ViewAuditLog','ManageGuild','ManageEvents','CreateInstantInvite'],5:['Administrator']};
 for(let n=1;n<=5;n++){const r=roles.find(r=>r.id===npl(n)),permissions=b(rolePermissions[n]);if(r.permissions!==permissions)await api('PATCH','/guilds/'+G+'/roles/'+r.id,{permissions});}
 if(roles.find(r=>r.id===G).permissions!==b(basic))await api('PATCH','/guilds/'+G+'/roles/'+G,{permissions:b(basic)});
 const result={guild:G,categories:{},channels:{},staffRole:staffRole.id,logFeeds:'Channels prepared; automatic event feeds are not configured by this layout script.'};
 const used=new Set();
 for(let ci=0;ci<definitions.length;ci++){
  const [name,names,kind]=definitions[ci];
  let cat=channels.find(c=>c.type===4&&c.name===name);
  // Preserve the original lobby and its category instead of replacing their history.
  if(!cat&&name==='HN | Community')cat=channels.find(c=>c.id==='1450120326984765471');
  const permission_overwrites=overwrites(kind);
  if(cat)cat=await api('PATCH','/channels/'+cat.id,{name,permission_overwrites});
  else{cat=await api('POST','/guilds/'+G+'/channels',{name,type:4,permission_overwrites});channels.push(cat);}
  used.add(cat.id);result.categories[name]=cat.id;
  for(let i=0;i<names.length;i++){
   const label=names[i],type=kind==='voice'?2:0,desired=prefix+label;
   let ch=channels.find(c=>c.type===type&&c.parent_id===cat.id&&c.name.toLowerCase()===desired.toLowerCase());
   if(!ch&&name==='HN | Community'&&label==='lobby')ch=channels.find(c=>c.id==='1450120367656931370');
   let ow=permission_overwrites;
   if(label==='ticket-transcripts')ow=[entry(G,[],['ViewChannel',...write,...contentManage,...change]),entry(npl(4),['ViewChannel','ReadMessageHistory'],[...write,...contentManage,...change]),entry(me.id,['ViewChannel','ReadMessageHistory',...write],[],1)];
   const body={name:desired,parent_id:cat.id,permission_overwrites:ow,...(type===2?{bitrate:64000,user_limit:0}:{rate_limit_per_user:0})};
   if(ch)ch=await api('PATCH','/channels/'+ch.id,body);else{ch=await api('POST','/guilds/'+G+'/channels',{type,...body});channels.push(ch);}
   used.add(ch.id);result.channels[name+'/'+label]=ch.id;
   console.log('Configured '+name+' / '+ch.name);
  }
 }
 const ordering=[];let categoryPosition=0,textPosition=0,voicePosition=0;
 for(const [name,names,kind]of definitions){const id=result.categories[name];ordering.push({id,position:categoryPosition++});for(const label of names)ordering.push({id:result.channels[name+'/'+label],position:kind==='voice'?voicePosition++:textPosition++});}
 await api('PATCH','/guilds/'+G+'/channels',ordering);
 await api('PATCH','/guilds/'+G,{afk_channel_id:result.channels['HN | Public Voice/AFK'],afk_timeout:300,system_channel_id:result.channels['HN | Important/welcome']});
 const secret=fs.readFileSync('/var/lib/hn-status-sso/secret','utf8').trim();
 const response=await fetch('http://127.0.0.1:3250/api/auth/discord-positions',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw Error('Staff directory unavailable');const staff=await response.json();
 const members=JSON.parse(fs.readFileSync(path.join(backup,'before.json'))).members;
 const isNetwork=p=>(p.titles||[]).some(t=>['Horizon Network','Horizon Advertising','Horizon Development'].includes(t.company));
 result.staffAssigned=[];
 for(const p of staff.people.filter(isNetwork)){const m=members.find(m=>m.user.id===p.id&&!m.user.bot);if(!m)continue;if(!m.roles.includes(staffRole.id))await api('PUT','/guilds/'+G+'/members/'+p.id+'/roles/'+staffRole.id);result.staffAssigned.push(p.id);}
 fs.writeFileSync(path.join(backup,'result.json'),JSON.stringify(result,null,2),{mode:0o600});
 console.log(JSON.stringify({configured:true,categories:definitions.length,channels:Object.keys(result.channels).length,staffAssigned:result.staffAssigned.length,backup}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
