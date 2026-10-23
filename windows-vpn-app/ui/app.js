'use strict';
// HN Secure Network for Windows: the page is built once (index.html) and kept up to date from the state the
// main process sends, so nothing is redrawn while you type and animations only play when something changes.
const api=window.secureNetwork;
const $=id=>document.getElementById(id),$$=(selector,root=document)=>[...root.querySelectorAll(selector)];
let state=null,view='',page='connection',profile=null,profileLoading=false,avatarTag=null,avatarData=null,lastError='',toastTimer=null,usernameDraft=null;

// ---------- Icons ----------
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
 lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
 devices:'<rect x="2" y="5" width="14" height="10" rx="2"/><rect x="17" y="8" width="5" height="11" rx="1.5"/><path d="M6 19h6"/>',
 history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
 refresh:'<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
 arrow:'<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
 download:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
 phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
 web:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/>',
 alert:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16.5h.01"/>',
 signout:'<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>',
 trash:'<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
};
function paint(svg,name){svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','2');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.innerHTML=ICONS[name]||'';}
const icon=name=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');paint(svg,name);return svg;};
for(const svg of $$('svg[data-icon]'))paint(svg,svg.dataset.icon);

// ---------- Small helpers ----------
function el(tag,attrs,...children){const node=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{})){if(v==null||v===false)continue;if(k.startsWith('on'))node.addEventListener(k.slice(2),v);else node.setAttribute(k,v===true?'':v);}for(const c of children.flat(9)){if(c==null||c===false)continue;node.append(c instanceof Node?c:document.createTextNode(String(c)));}return node;}
const setText=(node,value)=>{if(typeof node==='string')node=$(node);value=String(value??'');if(node&&node.textContent!==value)node.textContent=value;};
const showIf=(node,on)=>{if(typeof node==='string')node=$(node);if(node&&node.hidden===!!on)node.hidden=!on;};
const first=name=>String(name||'').trim().split(/\s+/)[0]||'there';
const initials=name=>String(name||'HN').trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
const greeting=()=>{const h=new Date().getHours();return h<12?'Good morning':h<18?'Good afternoon':'Good evening';};
const when=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});};
const ago=iso=>{const d=new Date(iso);if(!iso||isNaN(d))return'Never connected';const s=(Date.now()-d)/1000;return s<90?'Just now':s<3600?Math.round(s/60)+' min ago':s<86400?Math.round(s/3600)+' h ago':when(iso);};
const duration=ms=>{const s=Math.max(0,Math.floor(ms/1000)),hh=Math.floor(s/3600),mm=Math.floor(s%3600/60),ss=s%60;return(hh?hh+':'+String(mm).padStart(2,'0'):mm)+':'+String(ss).padStart(2,'0');};
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function toast(message,bad=true){const t=$('toast');t.textContent=message;t.className='toast'+(bad?' bad':'');t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},7000);}
async function act(name,data,{quiet=false}={}){const r=await api.action(name,data);if(r?.error){if(!quiet)toast(r.error);return null;}return r?.result??true;}
// Buttons show a spinner while their action runs.
async function busy(button,fn){if(!button||button.disabled)return;button.disabled=true;button.classList.add('working');try{return await fn();}finally{button.classList.remove('working');button.disabled=false;render();}}

// ---------- Questions in the window (never a plain Windows box) ----------
// One card at a time over a dimmed window; the PIN uses the same layer.
const queue=[];let current=null;
function openLayer(item){queue.push(item);if(!current)next();}
function next(){current=queue.shift()||null;const layer=$('layer');
 if(!current){layer.classList.remove('open');setTimeout(()=>{if(!current){layer.hidden=true;$('dialog').hidden=true;$('pin').hidden=true;}},reduced()?0:180);return;}
 $('dialog').hidden=current.kind==='pin';$('pin').hidden=current.kind!=='pin';layer.hidden=false;
 layer.classList.remove('open');void layer.offsetWidth;layer.classList.add('open');
 if(current.kind==='pin')showPin(current);else showDialog(current);}
function showDialog(spec){
 $('dialog').dataset.tone=spec.tone||'accent';paint($('dialog-icon').firstElementChild,spec.icon||(spec.kind==='trust'?'shield':'alert'));
 setText('dialog-title',spec.title);setText('dialog-text',spec.text);
 setText('dialog-detail',spec.detail||'');showIf('dialog-detail',!!spec.detail);setText('dialog-note',spec.note||'');showIf('dialog-note',!!spec.note);
 const buttons=$('dialog-buttons');buttons.replaceChildren(...spec.buttons.map(b=>el('button',{class:'btn'+(b.primary?' primary':'')+(b.danger?' danger-fill':''),'data-choice':b.id,onclick:()=>answer(b.id)},b.label)));
 // The safe choice has focus, so Enter never removes or trusts anything by accident.
 const safe=buttons.querySelector('[data-choice=cancel]');safe?.focus();requestAnimationFrame(()=>{if(current===spec)safe?.focus();});}
function answer(choice){const item=current;if(!item||item.kind==='pin')return;next();item.resolve(choice);}
// Asks in the window and resolves with the chosen button id.
const confirmDialog=spec=>new Promise(resolve=>openLayer({kind:'confirm',...spec,resolve}));
async function confirmThen(spec,fn){if(await confirmDialog({...spec,buttons:[{id:'cancel',label:'Cancel'},{id:'ok',label:spec.confirm,primary:!spec.danger,danger:!!spec.danger}]})==='ok')return fn();}
api.onDialog(spec=>openLayer({...spec,kind:spec.kind||'confirm',fromApp:spec.id,resolve:choice=>api.action('dialog-answer',{id:spec.id,choice})}),
 id=>{if(current?.fromApp===id)next();else{const i=queue.findIndex(q=>q.fromApp===id);if(i>=0)queue.splice(i,1);}});
document.addEventListener('keydown',e=>{if(e.key!=='Escape'||!current)return;e.preventDefault();if(current.kind==='pin')cancelPin();else answer('cancel');});
$('layer').querySelector('.scrim').addEventListener('click',()=>{if(current?.kind==='pin')cancelPin();});

// ---------- The PIN: asked before every connection ----------
const pinInput=$('pin-input');
// purpose.ssh = {username,password} when connecting to open SSH.
function askPin(purpose={}){if(current?.kind==='pin'||queue.some(q=>q.kind==='pin'))return;openLayer({kind:'pin',...purpose});}
function showPin(item){pinInput.value='';pinInput.disabled=false;item.checking=false;setText('pin-title',item.ssh?'Enter your PIN to connect and open SSH':'Enter your PIN to connect');pinMessage('You’re asked every time you connect.');drawPin();focusPin();}
function focusPin(){pinInput.focus();requestAnimationFrame(()=>pinInput.focus());}
function pinMessage(text,bad=false){const m=$('pin-message');setText(m,text);m.classList.toggle('bad',bad);}
function drawPin(){const n=pinInput.value.length,checking=!!current?.checking;$$('#pin-boxes i').forEach((box,i)=>{box.classList.toggle('filled',i<n);box.classList.toggle('current',i===Math.min(n,5)&&!checking&&document.activeElement===pinInput);});$('pin-boxes').classList.toggle('checking',checking);}
pinInput.addEventListener('input',()=>{const digits=pinInput.value.replace(/\D/g,'').slice(0,6);if(digits!==pinInput.value)pinInput.value=digits;drawPin();if(digits.length===6)submitPin(digits);});
pinInput.addEventListener('focus',drawPin);pinInput.addEventListener('blur',drawPin);
$('pin-boxes').addEventListener('mousedown',e=>{e.preventDefault();focusPin();});
$('pin-cancel').addEventListener('click',cancelPin);
function cancelPin(){if(current?.kind!=='pin'||current.checking)return;current.ssh=null;next();}
async function submitPin(pin){
 const item=current;if(!item||item.kind!=='pin'||item.checking)return;
 item.checking=true;pinInput.disabled=true;$('pin-cancel').disabled=true;pinMessage(item.ssh?'Checking your PIN and connecting…':'Checking your PIN and connecting…');drawPin();
 const r=await api.action(item.ssh?'ssh-open':'connect',item.ssh?{...item.ssh,pin}:{pin});
 item.checking=false;pinInput.disabled=false;$('pin-cancel').disabled=false;
 if(current!==item)return;
 if(r?.error&&r.pin){
  // Wrong PIN: shake, clear and try again (the server locks after five wrong tries).
  pinInput.value='';pinMessage(r.error,true);drawPin();const boxes=$('pin-boxes');boxes.classList.remove('shake');void boxes.offsetWidth;boxes.classList.add('shake');focusPin();return;}
 const ssh=item.ssh;item.ssh=null;next();
 if(r?.error)toast(r.error);else if(ssh)sshOpened();
 render();}

// ---------- Actions ----------
function connectClicked(){if(!state?.vpn.ready||state.vpn.busy)return;if(state.vpn.connected)busy($('toggle'),()=>act('disconnect'));else askPin();}
$('power').addEventListener('click',connectClicked);$('toggle').addEventListener('click',connectClicked);
$('sign-in').addEventListener('click',e=>busy(e.currentTarget,()=>act('sign-in')));
$('sign-in-again').addEventListener('click',e=>busy(e.currentTarget,()=>act('sign-in')));
$('cancel-sign-in').addEventListener('click',()=>act('cancel-sign-in'));
$('install-tools').addEventListener('click',()=>act('install-tools'));
$('set-up').addEventListener('click',()=>act('set-up'));
for(const b of $$('[data-action=set-up]'))b.addEventListener('click',e=>busy(e.currentTarget,()=>act('set-up')));
for(const b of $$('[data-open]'))b.addEventListener('click',()=>act('open',b.dataset.open));
for(const b of $$('[data-go]'))b.addEventListener('click',()=>go(b.dataset.go));
for(const b of $$('.nav'))b.addEventListener('click',()=>go(b.dataset.page));
$('side-status').addEventListener('click',()=>go('connection'));$('side-user').addEventListener('click',()=>go('profile'));$('side-update').addEventListener('click',()=>go('settings'));
const signOut=()=>confirmThen({title:'Sign out of HN Secure Network?',text:'Signing out disconnects and removes this PC from the VPN. You can sign in and set it up again at any time.',confirm:'Sign out',danger:true,icon:'signout',tone:'danger'},()=>act('sign-out'));
$('sign-out').addEventListener('click',signOut);$('setup-sign-out').addEventListener('click',signOut);
$('remove').addEventListener('click',e=>{const b=e.currentTarget;confirmThen({title:'Remove this PC from the HN VPN?',text:'It disconnects and this PC’s VPN key is deleted. You can set it up again at any time.',confirm:'Remove this PC',danger:true,icon:'trash',tone:'danger'},()=>busy(b,()=>act('remove')));});
for(const b of $$('[data-pref]'))b.addEventListener('click',()=>act('preference',{key:b.dataset.pref,value:!state.prefs[b.dataset.pref]}));
for(const b of $$('[data-theme]'))b.addEventListener('click',()=>act('preference',{key:'theme',value:b.dataset.theme}));
$('update-button').addEventListener('click',e=>{const u=state.update||{};busy(e.currentTarget,()=>act(u.status==='available'?'download-update':u.status==='ready'?'install-update':'check-update'));});

// SSH: the username is remembered (root by default); the password is only ever in this field until it's
// handed to the SSH window, and the field is cleared straight away.
const sshUser=$('ssh-user'),sshPassword=$('ssh-password');
const sizeUser=()=>{sshUser.size=Math.max(4,sshUser.value.length);};
sshUser.addEventListener('input',()=>{usernameDraft=sshUser.value;sizeUser();for(const s of $$('.ssh-as'))setText(s,sshUser.value.trim()||'root');});
for(const input of[sshUser,sshPassword])input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();openSSH();}});
$('ssh-open').addEventListener('click',openSSH);
async function openSSH(){
 const v=state?.vpn;if(!v?.ready)return toast('Set up the VPN on this PC first.');
 const username=sshUser.value.trim()||'root',password=sshPassword.value;
 if(!/^[a-z_][a-z0-9_.-]{0,31}$/i.test(username)){toast('Enter a valid server username.');sshUser.focus();return;}
 if(!password){toast('Enter your server password.');sshPassword.focus();return;}
 sshPassword.value='';
 if(!v.connected)return askPin({ssh:{username,password}});
 await busy($('ssh-open'),async()=>{const r=await api.action('ssh-open',{username,password});if(r?.error){if(r.needPin)askPin({ssh:{username,password}});else{toast(r.error);sshPassword.focus();}}else sshOpened();});}
function sshOpened(){toast('The SSH session is opening in its own window.',false);usernameDraft=null;}

// ---------- Pages ----------
function go(id){if(!['connection','ssh','profile','settings'].includes(id))return;if(page!==id){page=id;if(id==='profile')loadProfile();$('main').scrollTo(0,0);}render();if(id==='ssh'&&!current)requestAnimationFrame(()=>{if(!current)sshPassword.focus();});}
api.onGo(target=>{go(target.page);if(target.connect&&state?.vpn.ready&&!state.vpn.connected)askPin();});

async function loadProfile(){if(profileLoading)return;profileLoading=true;drawProfile();const r=await act('profile');profileLoading=false;if(r)profile=r;drawProfile();render();}
function drawProfile(){
 const p=profile;showIf('profile-loading',!p);setText('profile-loading',profileLoading?'Loading your profile…':'Your profile couldn’t be loaded.');
 for(const id of['card-sessions','card-devices','card-activity'])showIf(id,!!p);if(!p)return;
 $('sessions').replaceChildren(...(p.sessions.length?p.sessions.map(s=>el('div',{class:'item'},el('span',{class:'icon'},icon(s.kind==='web'?'web':'laptop')),
  el('div',{class:'grow'},el('strong',{},(s.client||'Website')+(s.appVersion?' '+s.appVersion:'')+(s.current?' · this PC':'')),el('small',{},'Signed in '+when(s.createdAt)+(s.lastUsedAt?' · last used '+when(s.lastUsedAt):''))),
  s.current?el('span',{class:'tag good'},'Current'):el('button',{class:'btn small',onclick:e=>{const b=e.currentTarget;confirmThen({title:'Sign out of that device?',text:(s.client||'The website')+' will need to sign in again.',confirm:'Sign out',danger:true,icon:'signout',tone:'danger'},()=>busy(b,async()=>{if(await act('end-session',s.id)){toast('Signed out of that device.',false);loadProfile();}}));}},'Sign out'))):[el('p',{class:'empty'},'No sign-ins.')]));
 $('devices').replaceChildren(...(p.devices.length?p.devices.map(d=>el('div',{class:'item'},el('span',{class:'icon'},icon(/phone|iphone|android/i.test(d.name)?'phone':'laptop')),el('div',{class:'grow'},el('strong',{},d.name),el('small',{},d.address+(d.lastHandshake?' · '+ago(d.lastHandshake):''))),
  el('span',{class:'tag'+(d.connected?' good':'')},d.connected?'Connected':d.lastHandshake?'Not connected':'Never connected'))):[el('p',{class:'empty'},'No devices yet.')]));
 $('activity').replaceChildren(...(p.activity.length?p.activity.map(a=>el('div',{class:'event'},el('span',{},a.detail?a.action+' · '+a.detail:a.action),el('small',{class:'muted'},when(a.at)))):[el('p',{class:'empty'},'Nothing yet.')]));}

// ---------- Keeping the page up to date ----------
function stage(){const v=state.vpn;return!v.signedIn?'welcome':(!v.ready||v.removed)?'setup':'app';}
function render(){if(!state)return;const v=state.vpn,s=stage();
 if(s!==view){view=s;document.body.dataset.view=s;for(const id of['welcome','setup','app'])showIf('view-'+id,id===s);if(s!=='app'){profile=null;drawProfile();}}
 const ts=$('title-status');showIf(ts,s==='app');ts.classList.toggle('on',v.connected);setText(ts.lastElementChild,v.connected?'Protected':'Not connected');
 // The person's name and picture, wherever they appear.
 for(const a of $$('[data-avatar]')){setText(a,avatarData?'':initials(v.user?.displayName));const image=avatarData?'url("'+avatarData+'")':'';if(a.style.backgroundImage!==image)a.style.backgroundImage=image;}
 for(const n of $$('[data-name]'))setText(n,v.user?.displayName||'');for(const n of $$('[data-email]'))setText(n,v.user?.email||'');for(const n of $$('[data-first]'))setText(n,first(v.user?.displayName));
 if(s==='welcome')renderWelcome(v);else if(s==='setup')renderSetup(v);else renderApp(v);}

function renderWelcome(v){
 const waiting=!!v.signingIn;for(const m of $$('#view-welcome [data-mode]'))showIf(m,(m.dataset.mode==='waiting')===waiting);
 setText($('welcome-error').querySelector('p'),v.error);showIf('welcome-error',!!v.error&&!waiting);}

function renderSetup(v){
 const tools=v.tools,ready=v.ready&&!v.removed,full=!ready&&v.devices>=v.limit,setting=v.busy==='setting-up';
 setText('setup-who','Signed in as '+(v.user?.displayName||''));
 setText('setup-lede',v.removed?'This PC was removed from the VPN on the website. Set it up again to connect.':'Three quick steps. Windows will ask for permission once while setting up.');
 $('step-tools').className='step'+(tools?' done':' active');$('step-setup').className='step'+(ready?' done':tools?' active':'');
 const install=$('install-tools');showIf(install,!tools);install.disabled=state.toolsBusy;install.classList.toggle('working',state.toolsBusy);setText(install,state.toolsBusy?'Installing…':'Install');
 const setUp=$('set-up');showIf(setUp,tools);setUp.disabled=setting||full;setUp.classList.toggle('working',setting);setText(setUp,setting?'Setting up…':'Set up');
 setText('setup-devices','Registers this PC with a key made here; it never leaves this PC. '+v.devices+' of '+v.limit+' devices used.');
 showIf('tools-hint',state.toolsBusy);showIf('setup-limit',full);
 setText($('setup-error').querySelector('p'),v.error);showIf('setup-error',!!v.error);}

function renderApp(v){
 for(const b of $$('.nav')){if(b.dataset.page===page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
 for(const p of $$('[data-page-id]'))showIf(p,p.dataset.pageId===page);
 const u=state.update||{},on=v.connected,working=v.busy==='connecting'||v.busy==='disconnecting';
 showIf('side-update',['available','downloading','ready'].includes(u.status));setText($('side-update').querySelector('span'),u.status==='ready'?'Update ready to install':u.status==='downloading'?'Downloading update…':'Update available');
 const st=$('side-status');st.querySelector('.dot').classList.toggle('on',on);setText(st.querySelector('strong'),on?'Protected':'Not connected');setText(st.querySelector('small'),on?(v.publicIp||'Connected'):'Your own connection');
 if(page==='connection'){
  setText('today',new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}));setText('greeting',greeting()+', '+first(v.user?.displayName));
  showIf('banner-outdated',v.outdated);showIf('banner-shared',v.shared);showIf('banner-unreachable',on&&v.reachable===false);
  $('hero').classList.toggle('on',on);$('power').classList.toggle('busy',working);$('power').disabled=working;$('power').setAttribute('aria-label',on?'Disconnect':'Connect');
  $('hero').querySelector('.pill .dot').classList.toggle('on',on);setText('hero-pill',on?'Protected':'Not protected');
  setText('hero-title',v.busy==='connecting'?'Connecting…':v.busy==='disconnecting'?'Disconnecting…':on?'You’re protected':'You’re not connected');
  setText('hero-text',on?'All of this PC’s internet traffic is encrypted and going through HN Group’s UK server.':'Connect to send this PC’s internet traffic through HN Group’s private VPN. You’ll be asked for your PIN.');
  showIf('hero-meta',on&&!!state.connectedAt);tick();
  const t=$('toggle');if(!t.classList.contains('working')){setText(t,on?'Disconnect':'Connect');t.disabled=working;}
  setText('tile-ip',v.publicIp||(on?'Checking…':'—'));note('tile-ip-note',on?(v.viaVpn?'HN Group VPN address':'Checking the route…'):'Connect to use the VPN address',on&&v.viaVpn?'good':'');
  setText('tile-place',on?'United Kingdom':'Your own connection');note('tile-place-note',on?'HN Group’s UK server':'Not through the VPN',on?'good':'');
  setText('tile-server',v.server);note('tile-server-note',on?(v.reachable?'Reachable for SSH':v.reachable===false?'Not answering':'Checking…'):'Connect to reach it',on?(v.reachable?'good':v.reachable===false?'bad':''):'');
  setText('tile-pc',v.device?.name||state.hostname);note('tile-pc-note',v.device?.address?v.device.address+' · its key never leaves this PC':'Its key never leaves this PC','');}
 if(page==='ssh'){
  const ssh=state.ssh;if(usernameDraft===null&&document.activeElement!==sshUser&&sshUser.value!==ssh.username){sshUser.value=ssh.username;sizeUser();}
  for(const n of $$('.ssh-as'))setText(n,sshUser.value.trim()||'root');for(const n of $$('.ssh-host'))setText(n,ssh.host);
  const pill=$('ssh-pill');pill.querySelector('.dot').classList.toggle('on',!!(on&&v.reachable));setText(pill.lastElementChild,!on?'VPN off':v.reachable?'Online':v.reachable===false?'Not answering':'Checking');
  setText($('ssh-open').querySelector('span'),on?'Open in a terminal window':'Connect and open');setText('ssh-note',on?'Opens in its own terminal window':'You’ll be asked for your PIN to connect first');
  const last=ssh.last,status=$('ssh-status');showIf(status,!!last&&Date.now()-last.at<10*60000);
  if(last){status.className='console-status '+last.status;setText(status,last.status==='connecting'?'Signing in to the server in the SSH window…':last.status==='open'?'Signed in. The session is open in its own window.':last.error);}
  setText('ssh-fingerprint',ssh.fingerprint?'Server identity confirmed on this PC: '+ssh.fingerprint:'The server’s identity hasn’t been confirmed on this PC yet. You’ll be asked to check it the first time.');}
 if(page==='profile'){setText('profile-devices',(profile?profile.devices.length:v.devices)+' of '+v.limit+' devices');showIf('profile-admin',!!v.user?.admin);}
 if(page==='settings'){
  setText('version','Version '+state.version+(state.build?' (build '+state.build+')':'')+' for Windows');
  const b=$('update-button');if(!b.classList.contains('working')){setText(b,u.status==='available'?'Download update':u.status==='ready'?'Install and restart':u.status==='checking'?'Checking…':u.status==='downloading'?'Downloading…':'Check for updates');b.classList.toggle('primary',['available','ready'].includes(u.status));b.disabled=['checking','downloading'].includes(u.status);}
  const text={checking:'Checking for updates…',current:'You have the latest version.',available:'Version '+(u.latest||'')+' is available.',downloading:'Downloading the update… '+(u.progress||0)+'%',ready:'The update is ready. Installing restarts HN Secure Network.',error:u.error||'Couldn’t check for updates.'}[u.status]||'';
  setText('update-text',text);showIf('update-text',!!text);$('update-text').classList.toggle('bad',u.status==='error');
  showIf('update-progress',u.status==='downloading');$('update-progress').firstElementChild.style.transform='scaleX('+((u.progress||0)/100)+')';
  for(const sw of $$('[data-pref]'))sw.setAttribute('aria-checked',String(!!state.prefs[sw.dataset.pref]));
  for(const t of $$('[data-theme]'))t.setAttribute('aria-pressed',String(state.prefs.theme===t.dataset.theme));
  setText('pc-text',(v.device?v.device.name+' · '+v.device.address:state.hostname)+'. WireGuard for Windows carries the connection; its configuration can only be read by administrators.');
  setText('account-text','Signed in as '+(v.user?.email||'')+'. Signing out disconnects and removes this PC from the VPN.');
  for(const btn of $$('[data-action=set-up],#remove'))if(!btn.classList.contains('working'))btn.disabled=!!v.busy;}}
function note(id,text,cls){const n=$(id);setText(n,text);n.className='note'+(cls?' '+cls:'');}
function tick(){if(state?.connectedAt)setText('elapsed',duration(Date.now()-state.connectedAt));}
setInterval(tick,1000);

async function receive(incoming){state=incoming;const v=state.vpn;
 if(v.error&&v.error!==lastError&&stage()==='app')toast(v.error);lastError=v.error||'';
 if(state.avatarTag!==avatarTag){avatarTag=state.avatarTag;avatarData=null;if(avatarTag){const data=await act('avatar',undefined,{quiet:true});if(typeof data==='string'&&data.startsWith('data:image/'))avatarData=data;}}
 // A PIN left open is put away if the VPN came on another way or this PC can no longer connect.
 if(current?.kind==='pin'&&!current.checking&&!current.ssh&&(v.connected||!v.ready))next();
 render();}
api.subscribe(receive);
api.state().then(s=>{if(!state)receive(s);});
