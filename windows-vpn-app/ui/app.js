'use strict';
// HN Secure Network for Windows: draws the app from the state the main process sends.
const api=window.secureNetwork,root=document.getElementById('app');
let sshForm=false,sshBusy=false,sshSelect=null;
let state=null,page='connection',viewKey='',profile=null,profileLoading=false,avatarData=null,avatarTag=null,sshDraft=null,toastTimer=null,lastError='';

// Small helpers: h('div',{class:'x',onclick:fn},child, 'text', …)
function h(tag,attrs,...children){const el=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{})){if(v==null||v===false)continue;if(k.startsWith('on'))el.addEventListener(k.slice(2),v);else if(k==='html')el.innerHTML=v;else el.setAttribute(k,v===true?'':v);}for(const c of children.flat(9)){if(c==null||c===false)continue;el.append(c instanceof Node?c:document.createTextNode(String(c)));}return el;}
const ICONS={
 power:'<path d="M12 3v8"/><path d="M6.6 6.6a8 8 0 1 0 10.8 0"/>',
 terminal:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3"/><path d="M12.5 15H17"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/>',
 pin:'<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
 server:'<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
 laptop:'<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 19h20"/>',
 shield:'<path d="M12 3 20 6v6c0 4.6-3.4 8.2-8 9-4.6-.8-8-4.4-8-9V6z"/>',
 check:'<path d="m5 12 4.5 4.5L19 7"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
 devices:'<rect x="2" y="5" width="14" height="10" rx="2"/><rect x="17" y="8" width="5" height="11" rx="1.5"/><path d="M6 19h6"/>',
 history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
 refresh:'<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
 arrow:'<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
 download:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
 phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
 web:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/>',
};
const icon=name=>h('span',{html:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+ICONS[name]+'</svg>'}).firstChild;
const spinner=()=>{const s=icon('refresh');s.classList.add('spin');return s;};
const first=name=>String(name||'').trim().split(/\s+/)[0]||'there';
const initials=name=>String(name||'HN').trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
const greeting=()=>{const hr=new Date().getHours();return hr<12?'Good morning':hr<18?'Good afternoon':'Good evening';};
const when=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});};
const ago=iso=>{const d=new Date(iso);if(!iso||isNaN(d))return'Never connected';const s=(Date.now()-d)/1000;return s<90?'Just now':s<3600?Math.round(s/60)+' min ago':s<86400?Math.round(s/3600)+' h ago':when(iso);};
const duration=ms=>{const s=Math.max(0,Math.floor(ms/1000)),hh=Math.floor(s/3600),mm=Math.floor(s%3600/60),ss=s%60;return(hh?hh+':'+String(mm).padStart(2,'0'):mm)+':'+String(ss).padStart(2,'0');};

function toast(message,bad=true){const t=document.getElementById('toast');t.textContent=message;t.className='toast'+(bad?' bad':'');t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},7000);}
async function act(name,data){const r=await api.action(name,data);if(r?.error){toast(r.error);return null;}return r?.result??true;}
function avatarEl(cls){const v=state.vpn,el=h('span',{class:'avatar'+(cls?' '+cls:''),'aria-hidden':'true'},avatarData?'':initials(v.user?.displayName));if(avatarData)el.style.backgroundImage='url("'+avatarData+'")';return el;}

// ---------- Welcome and sign-in ----------
function brandPane(){return h('aside',{class:'brand-pane'},h('img',{class:'wordmark',src:'assets/hn-group-wordmark-white.svg',alt:'HN Group'}),
 h('div',{class:'art'},h('div',{class:'shield'},icon('shield')),h('h2',{},'Private by default.'),h('p',{class:'sub'},'Encrypted. Fast. Yours.')),
 h('div',{class:'staff'},icon('check'),'For HN Group staff'));}
function welcome(){const v=state.vpn;
 if(v.signingIn)return h('div',{class:'split'},brandPane(),h('main',{class:'content-pane'},h('p',{class:'eyebrow'},'Almost there'),h('h1',{},'Finish signing in in your browser'),
  h('p',{class:'lede'},'Your browser has opened HN Group Auth. Sign in with your password and six-digit PIN, and you’ll come straight back here.'),
  h('div',{class:'row'},h('button',{class:'btn',onclick:()=>act('sign-in')},icon('refresh'),'Open the sign-in page again'),h('button',{class:'btn ghost',onclick:()=>act('cancel-sign-in')},'Cancel'))));
 return h('div',{class:'split'},brandPane(),h('main',{class:'content-pane'},h('p',{class:'eyebrow'},'HN Secure Network'),h('h1',{},'Welcome back.'),
  h('p',{class:'lede'},'Send all of this PC’s internet traffic through HN Group’s private VPN, and open SSH sessions to the HN Group server with just your password.'),
  h('div',{class:'row'},h('button',{class:'btn primary',id:'sign-in',onclick:()=>act('sign-in')},'Sign in with HN Group Auth',icon('arrow'))),
  h('p',{class:'hint'},'Your browser opens HN Group Auth. You’ll need your password and six-digit PIN.'),
  v.error?h('div',{class:'banner bad'},h('div',{class:'grow'},h('strong',{},'That didn’t work'),h('p',{},v.error))):null));}

// ---------- Setting up this PC ----------
function setup(){const v=state.vpn,busy=v.busy==='setting-up',tools=v.tools;
 const step=(n,done,active,title,text,action)=>h('div',{class:'step'+(done?' done':active?' active':'')},h('span',{class:'num'},done?icon('check'):n),h('div',{},h('h3',{},title),h('p',{},text)),action||'');
 return h('div',{class:'split'},brandPane(),h('main',{class:'content-pane'},h('p',{class:'eyebrow'},'Signed in as '+(v.user?.displayName||'')),h('h1',{},'Let’s get this PC ready'),
  h('p',{class:'lede'},v.removed?'This PC was removed from the VPN on the website. Set it up again to connect.':'Three quick steps. Windows will ask for permission once while setting up.'),
  h('div',{class:'steps'},
   step(1,tools,!tools,'Install WireGuard for Windows','HN Secure Network uses WireGuard, the open-source VPN, to carry the connection.',!tools?h('button',{class:'btn primary small',id:'install-tools',disabled:state.toolsBusy,onclick:()=>act('install-tools')},state.toolsBusy?[spinner(),'Installing…']:'Install'):null),
   step(2,v.ready&&!v.removed,tools&&!v.ready,'Set up this PC','Registers this PC with a key made here (it never leaves this PC). '+v.devices+' of '+v.limit+' devices used.',tools?h('button',{class:'btn primary small',id:'set-up',disabled:busy||v.devices>=v.limit,onclick:()=>act('set-up')},busy?[spinner(),'Setting up…']:'Set up'):null),
   step(3,false,false,'Connect','Turn the VPN on with one click. You can also use the tray icon.')),
  state.toolsBusy?h('p',{class:'hint'},'Approve the Windows prompt to let WireGuard install. This can take a minute.'):null,
  v.devices>=v.limit&&!v.ready?h('div',{class:'banner warn'},h('div',{class:'grow'},h('strong',{},'You’ve used all '+v.limit+' devices'),h('p',{},'Remove one on the VPN website first.')),h('button',{class:'btn small',onclick:()=>act('open','devices')},'Open the website')):null,
  v.error?h('div',{class:'banner bad'},h('div',{class:'grow'},h('strong',{},'That didn’t work'),h('p',{},v.error))):null,
  h('div',{class:'row'},h('button',{class:'btn ghost small',onclick:()=>act('sign-out')},'Sign out'))));}

// ---------- Signed in ----------
function shell(){const v=state.vpn;
 const nav=(id,label,ic)=>h('button',{class:'nav','data-page':id,'aria-current':page===id?'page':null,onclick:()=>go(id)},icon(ic),label);
 const update=state.update||{};
 return h('div',{class:'shell'},
  h('nav',{class:'side','aria-label':'HN Secure Network'},h('img',{class:'wordmark',src:'assets/hn-group-wordmark.svg',alt:'HN Group','data-light':''}),
   h('p',{class:'menu-label'},'MENU'),nav('connection','Connection','power'),nav('ssh','SSH','terminal'),nav('profile','Profile','user'),nav('settings','Settings','settings'),
   h('div',{class:'spacer'}),
   ['available','downloading','ready'].includes(update.status)?h('button',{class:'update-card',onclick:()=>go('settings')},icon('download'),update.status==='ready'?'Update ready to install':'Update available'):null,
   h('button',{class:'status-card',onclick:()=>go('connection')},h('span',{class:'dot'+(v.connected?' on':'')}),h('span',{},h('strong',{},v.connected?'Protected':'Not connected'),h('small',{},v.connected?(v.publicIp||'Connected'):'Your own connection'))),
   h('button',{class:'user-card',onclick:()=>go('profile')},avatarEl(),h('span',{},h('strong',{},v.user?.displayName||'HN Group'),h('small',{},v.user?.email||'')))),
  h('main',{class:'main',id:'main'},({connection,ssh,profile:profilePage,settings})[page]()));}
function go(id){page=id;viewKey='';if(id==='profile')loadProfile();draw();document.getElementById('main')?.scrollTo(0,0);}

function connection(){const v=state.vpn,busy=v.busy==='connecting'||v.busy==='disconnecting',on=v.connected;
 const title=v.busy==='connecting'?'Connecting…':v.busy==='disconnecting'?'Disconnecting…':on?'You’re protected':'You’re not connected';
 const tile=(ic,label,value,note,cls)=>h('div',{class:'tile'},h('span',{class:'icon'},icon(ic)),h('div',{},h('small',{},label),h('strong',{},value),h('span',{class:'note'+(cls?' '+cls:'')},note)));
 const date=new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
 return h('section',{class:'page'},
  h('header',{},h('p',{class:'eyebrow'},date),h('h1',{},greeting()+', '+first(v.user?.displayName))),
  v.outdated?h('div',{class:'banner warn'},h('div',{class:'grow'},h('strong',{},'Finish updating this PC’s VPN'),h('p',{},'HN Group changed how the VPN works. Update this PC’s connection to keep using it (Windows asks once).')),h('button',{class:'btn small',disabled:!!v.busy,onclick:()=>act('set-up')},'Update')):null,
  v.shared?h('div',{class:'banner warn'},h('div',{class:'grow'},h('strong',{},'This PC is set up for another HN account'),h('p',{},'Set it up for your account to see its details here.')),h('button',{class:'btn small',disabled:!!v.busy,onclick:()=>act('set-up')},'Set up')):null,
  h('div',{class:'hero'+(on?' on':'')},
   h('button',{class:'power'+(busy?' busy':''),id:'power','aria-label':on?'Disconnect':'Connect',disabled:busy||!v.ready,onclick:()=>act(on?'disconnect':'connect')},h('span',{class:'halo'}),h('span',{class:'ring'}),h('span',{class:'core'},icon('power'))),
   h('div',{},h('span',{class:'pill'},h('span',{class:'dot'+(on?' on':'')}),on?'Protected':'Not protected'),h('h2',{id:'hero-title'},title),
    h('p',{},on?'All of this PC’s internet traffic is encrypted and going through HN Group’s UK server.':'Connect to send this PC’s internet traffic through HN Group’s private VPN.'),
    on&&state.connectedAt?h('p',{class:'meta'},icon('clock'),'Connected for ',h('span',{id:'elapsed'},duration(Date.now()-state.connectedAt))):null,
    h('div',{class:'row'},h('button',{class:'btn glass',id:'toggle',disabled:busy||!v.ready,onclick:()=>act(on?'disconnect':'connect')},on?'Disconnect':'Connect'),h('button',{class:'btn glass',onclick:()=>go('ssh')},icon('terminal'),'Open SSH')))),
  on&&v.reachable===false?h('div',{class:'banner bad'},h('div',{class:'grow'},h('strong',{},'The HN Group server isn’t answering'),h('p',{},'The VPN is on, but no traffic is getting through. Your network may block UDP port 51820.'))):null,
  h('div',{class:'tiles'},
   tile('globe','Your traffic appears as',v.publicIp||(on?'Checking…':'—'),on?(v.viaVpn?'HN Group VPN address':'Checking the route…'):'Connect to use the VPN address',on&&v.viaVpn?'good':''),
   tile('pin','Location',on?'United Kingdom':'Your own connection',on?'HN Group’s UK server':'Not through the VPN',on?'good':''),
   tile('server','HN Group server',v.server,on?(v.reachable?'Reachable for SSH':v.reachable===false?'Not answering':'Checking…'):'Connect to reach it',on?(v.reachable?'good':v.reachable===false?'bad':''):''),
   tile('laptop','This PC',v.device?.name||state.hostname,v.device?.address?v.device.address+' · its key never leaves this PC':'Its key never leaves this PC')));}

// SSH inside the app: the username (remembered) and the password (typed here, used once, never saved;
// SSH keys on this PC are never used) sign in to the HN Group server through the VPN.
function ssh(){const v=state.vpn,s=state.ssh,sessions=s.sessions,showForm=!sessions.length||sshForm,user=sshDraft??s.username??'root';
 window.SNTerminal.sync(s);const current=sessions.find(x=>x.id===window.SNTerminal.active);
 const connect=async()=>{const pw=document.getElementById('ssh-password'),button=document.getElementById('ssh-connect');if(!pw.value){toast('Enter your server password.');pw.focus();return;}
  button.disabled=true;sshBusy=true;for(const x of sessions)if(['error','closed'].includes(x.status))api.action('ssh-close',x.id);const r=await api.action('ssh-connect',{username:document.getElementById('ssh-user').value,password:pw.value,cols:110,rows:30});pw.value='';sshBusy=false;
  if(r?.error){toast(r.error);button.disabled=false;document.getElementById('ssh-password')?.focus();return;}sshForm=false;sshSelect=r.result;viewKey='';draw();};
 const enter=e=>{if(e.key==='Enter'){e.preventDefault();connect();}};
 const form=h('div',{class:'term-card login'},h('div',{class:'bar'},h('i'),h('i'),h('i'),h('span',{},h('span',{class:'ssh-as'},user),'@'+state.server+' — ssh')),
  h('div',{class:'login-body'},h('p',{class:'dim'},'HN Secure Network · encrypted session through the HN Group VPN'),
   h('label',{class:'prompt',for:'ssh-user'},h('span',{class:'ok'},'➜ '),'ssh ',h('input',{id:'ssh-user',class:'inline',value:user,'data-keep':'',spellcheck:'false',autocomplete:'off','aria-label':'Server username',size:Math.max(4,user.length),oninput:e=>{sshDraft=e.target.value;e.target.size=Math.max(4,e.target.value.length);for(const el of document.querySelectorAll('.ssh-as'))el.textContent=sshDraft.trim()||'root';},onkeydown:enter}),h('span',{class:'host'},'@'+state.server)),
   h('label',{class:'prompt',for:'ssh-password'},h('span',{class:'dim'},h('span',{class:'ssh-as'},user),'@'+state.server+'’s password: '),h('input',{id:'ssh-password',class:'inline secret',type:'password','data-keep':'',autocomplete:'off','aria-label':'Server password',onkeydown:enter})),
   h('div',{class:'row'},h('button',{class:'btn primary',id:'ssh-connect',disabled:!!v.busy||sshBusy,onclick:connect},icon('terminal'),v.connected?'Connect':'Connect the VPN and sign in'),sessions.length?h('button',{class:'btn glass',onclick:()=>{sshForm=false;viewKey='';draw();}},'Back to the terminal'):null)));
 const panel=sessions.length&&!showForm?h('div',{class:'term-card live'},h('div',{class:'bar tabs',role:'tablist'},sessions.map(x=>h('span',{class:'tab'+(x.id===window.SNTerminal.active?' on':''),role:'tab','aria-selected':String(x.id===window.SNTerminal.active)},
   h('button',{class:'tab-name',onclick:()=>{window.SNTerminal.select(x.id);viewKey='';draw();}},h('span',{class:'dot'+(x.status==='connected'?' on':'')}),x.username+'@'+state.server),h('button',{class:'tab-close','aria-label':'Close this session',onclick:()=>act('ssh-close',x.id)},'×'))),
   h('span',{class:'grow'}),h('button',{class:'btn glass small',onclick:()=>window.SNTerminal.copy()},'Copy'),h('button',{class:'btn glass small',onclick:()=>window.SNTerminal.paste()},'Paste'),h('button',{class:'btn glass small',id:'ssh-new',onclick:()=>{sshForm=true;viewKey='';draw();requestAnimationFrame(()=>document.getElementById('ssh-password')?.focus());}},'New session')),
  current&&current.status!=='connected'?h('p',{class:'term-status'},current.status==='connecting'?'Connecting securely…':current.error||'This session has ended.'):null,window.SNTerminal.dock):null;
 return h('section',{class:'page wide'},
  h('header',{},h('p',{class:'eyebrow'},'Secure shell'),h('h1',{},'SSH to the HN Group server'),h('p',{},'Sign in with your server password. It’s typed here, used once and never saved, and SSH keys on this PC are never used.')),
  showForm?form:panel,
  showForm?h('p',{class:'muted small'},'The first time, HN Secure Network shows the server’s fingerprint for you to check. After that it refuses to connect if the server’s key ever changes.'):h('p',{class:'muted small'},'Ctrl+Shift+C copies and Ctrl+Shift+V pastes. Sessions end when the VPN disconnects.'));}

async function loadProfile(){if(profileLoading)return;profileLoading=true;const r=await act('profile');profileLoading=false;if(r){profile=r;viewKey='';draw();}}
function profilePage(){const v=state.vpn,p=profile;
 return h('section',{class:'page'},
  h('div',{class:'profile-top'},h('div',{class:'cover'}),h('div',{class:'who'},avatarEl(),h('div',{},h('h1',{},v.user?.displayName||''),h('p',{class:'muted'},v.user?.email||''),
   h('div',{class:'row'},v.user?.admin?h('span',{class:'tag accent'},'VPN administrator'):null,h('span',{class:'tag good'},(p?p.devices.length:v.devices)+' of '+v.limit+' devices'))))),
  h('p',{class:'muted small'},'Your name and photo come from your HN Group staff profile. Change them in the staff portal, HN Account or HN Browser.'),
  !p?h('div',{class:'card'},h('p',{class:'empty'},profileLoading?'Loading your profile…':'Your profile couldn’t be loaded.')):[
   h('div',{class:'card'},h('h2',{},icon('key'),'Where you’re signed in'),h('div',{class:'list'},p.sessions.length?p.sessions.map(s=>h('div',{class:'item'},h('span',{class:'icon'},icon(s.kind==='web'?'web':'laptop')),
    h('div',{class:'grow'},h('strong',{},(s.client||'Website')+(s.appVersion?' '+s.appVersion:'')+(s.current?' · this PC':'')),h('small',{},'Signed in '+when(s.createdAt)+(s.lastUsedAt?' · last used '+when(s.lastUsedAt):''))),
    s.current?h('span',{class:'tag good'},'Current'):h('button',{class:'btn small',onclick:async()=>{if(await act('end-session',s.id)){toast('Signed out of that device.',false);loadProfile();}}},'Sign out'))):h('p',{class:'empty'},'No sign-ins.'))),
   h('div',{class:'card'},h('div',{class:'head'},h('h2',{},icon('devices'),'Your devices'),h('button',{class:'btn ghost small',onclick:()=>act('open','devices')},'Manage on the web')),
    h('div',{class:'list'},p.devices.length?p.devices.map(d=>h('div',{class:'item'},h('span',{class:'icon'},icon(/phone|iphone|android/i.test(d.name)?'phone':'laptop')),h('div',{class:'grow'},h('strong',{},d.name),h('small',{},d.address+(d.lastHandshake?' · '+ago(d.lastHandshake):''))),
     h('span',{class:'tag'+(d.connected?' good':'')},d.connected?'Connected':d.lastHandshake?'Not connected':'Never connected'))):h('p',{class:'empty'},'No devices yet.'))),
   h('div',{class:'card'},h('h2',{},icon('history'),'Recent activity'),p.activity.length?h('div',{class:'timeline'},p.activity.map(a=>h('div',{class:'event'},h('span',{},a.detail?a.action+' · '+a.detail:a.action),h('small',{class:'muted'},when(a.at))))):h('p',{class:'empty'},'Nothing yet.'))]);}

function settings(){const v=state.vpn,u=state.update||{},p=state.prefs;
 const toggle=(key,title,text)=>h('div',{class:'toggle'},h('div',{},h('strong',{},title),h('small',{},text)),h('button',{class:'switch',role:'switch','aria-checked':String(!!p[key]),'aria-label':title,onclick:()=>act('preference',{key,value:!p[key]})}));
 const updateText={idle:'',checking:'Checking…',current:'You have the latest version.',available:'Version '+(u.latest||'')+' is available.',downloading:'Downloading the update…',ready:'The update is ready. Installing restarts HN Secure Network.',error:u.error||'Couldn’t check for updates.'}[u.status]||'';
 return h('section',{class:'page'},
  h('header',{},h('p',{class:'eyebrow'},'Settings'),h('h1',{},'Settings')),
  h('div',{class:'card'},h('div',{class:'head'},h('div',{},h('h2',{},'HN Secure Network'),h('p',{class:'muted small'},'Version '+state.version+(state.build?' (build '+state.build+')':'')+' for Windows')),
   u.status==='available'?h('button',{class:'btn primary small',onclick:()=>act('download-update')},icon('download'),'Download update'):u.status==='ready'?h('button',{class:'btn primary small',onclick:()=>act('install-update')},'Install and restart'):h('button',{class:'btn small',id:'check-update',disabled:u.status==='checking'||u.status==='downloading',onclick:()=>act('check-update')},u.status==='checking'?[spinner(),'Checking…']:'Check for updates')),
   updateText?h('p',{class:'small'+(u.status==='error'?'':' muted')},updateText):null,
   u.status==='downloading'?h('div',{class:'progress'},h('i',{style:'transform:scaleX('+((u.progress||0)/100)+')'})):null,
   h('p',{class:'muted small'},'Updates come from downloads.hngroup.org.uk and are checked before they install.')),
  h('div',{class:'card'},h('h2',{},'Startup'),toggle('launchAtLogin','Open when I sign in to Windows','HN Secure Network waits in the system tray.'),toggle('connectOnLaunch','Connect automatically','Turn the VPN on whenever HN Secure Network opens.')),
  h('div',{class:'card'},h('h2',{},'Appearance'),h('div',{class:'segmented',role:'group','aria-label':'Appearance'},['system','light','dark'].map(t=>h('button',{'aria-pressed':String(p.theme===t),onclick:()=>act('preference',{key:'theme',value:t})},t==='system'?'Match Windows':t[0].toUpperCase()+t.slice(1))))),
  h('div',{class:'card'},h('h2',{},'This PC'),h('p',{class:'muted small'},(v.device?v.device.name+' · '+v.device.address:state.hostname)+'. WireGuard for Windows carries the connection; its configuration is only readable by administrators.'),
   h('div',{class:'row'},h('button',{class:'btn small',disabled:!!v.busy,onclick:()=>act('set-up')},icon('refresh'),'Reinstall the VPN configuration'),h('button',{class:'btn small danger',disabled:!!v.busy,onclick:()=>act('remove')},'Remove this PC from the VPN'))),
  h('div',{class:'card'},h('h2',{},'Account'),h('p',{class:'muted small'},'Signed in as '+(v.user?.email||'')+'. Signing out disconnects and removes this PC from the VPN.'),h('div',{class:'row'},h('button',{class:'btn small',onclick:()=>act('open','vpn')},'Open the VPN website'),h('button',{class:'btn small danger',id:'sign-out',onclick:()=>act('sign-out')},'Sign out'))));}

// ---------- Drawing ----------
// Redraws only when something on screen changes, so typing and focus are never interrupted.
function stage(){const v=state.vpn;return!v.signedIn?'welcome':(!v.ready||v.removed)?'setup':'app';}
function draw(){if(!state)return;const v=state.vpn,s=stage();
 const key=JSON.stringify([s,page,v,state.prefs,state.update,state.toolsBusy,state.ssh,!!state.connectedAt,avatarData?.length,profile?1:0,profileLoading]);if(key===viewKey)return;viewKey=key;
 const focused=document.activeElement?.id,sel=document.activeElement?.selectionStart,kept=[...document.querySelectorAll('[data-keep]')].map(el=>[el.id,el.value]);
 root.replaceChildren(s==='welcome'?welcome():s==='setup'?setup():shell());
 for(const[id,value]of kept){const el=document.getElementById(id);if(el)el.value=value;}
 if(page==='ssh')requestAnimationFrame(()=>window.SNTerminal.fit());
 if(focused){const el=document.getElementById(focused);if(el){el.focus();if(sel!=null&&el.setSelectionRange)try{el.setSelectionRange(sel,sel);}catch{}}}
 document.body.dataset.stage=s;wordmarks();}
async function receive(next){state=next;const v=state.vpn;
 if(v.error&&v.error!==lastError)toast(v.error);lastError=v.error||'';
 if(state.avatarTag!==avatarTag){avatarTag=state.avatarTag;avatarData=null;if(avatarTag){const data=await act('avatar');if(typeof data==='string'&&data.startsWith('data:image/'))avatarData=data;}}
 if(stage()!=='app')profile=null;
 if(sshSelect&&state.ssh.sessions.some(x=>x.id===sshSelect)){window.SNTerminal.sync(state.ssh);window.SNTerminal.select(sshSelect);sshSelect=null;viewKey='';}
 draw();}
setInterval(()=>{const el=document.getElementById('elapsed');if(el&&state?.connectedAt)el.textContent=duration(Date.now()-state.connectedAt);},1000);
const wordmarks=()=>{for(const img of document.querySelectorAll('[data-light]'))img.src=matchMedia('(prefers-color-scheme: dark)').matches?'assets/hn-group-wordmark-white.svg':'assets/hn-group-wordmark.svg';};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',wordmarks);
api.subscribe(receive);api.onGo(id=>{if(['connection','ssh','profile','settings'].includes(id))go(id);});
api.state().then(s=>{if(!state)receive(s);});
