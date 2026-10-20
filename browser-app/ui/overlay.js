'use strict';
// The overlay page: every menu and window, drawn over the live page. Small menus open as pop-overs under
// their toolbar button; settings, history, bookmarks and SSH open as floating windows; locking shows a
// centred PIN card.
const $=id=>document.getElementById(id);
let current=null,lastPanel=null,lastKind=null,returnFocus=null,unlocking=false,wasLocked=false,settingsSection='profile',lastMessage='';
const pictures={avatar:null,icons:new Map()};
const setText=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
const motion=()=>current?.preferences?.reduceMotion!==true&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
const themes=[['midnight-lavender','Midnight Lavender'],['daylight','Daylight'],['deep-ocean','Deep Ocean'],['forest','Forest'],['rose','Rose Quartz']];
const SECTIONS={account:'profile',appearance:'appearance-panel',menu:'menu-panel',updates:'updates-panel',downloads:'downloads-panel',settings:'settings-panel',vpn:'vpn-panel',history:'history-panel',bookmarks:'bookmarks-panel',ssh:'ssh-panel'};
const SHEETS=new Set(['settings','history','bookmarks','ssh']);
const WIDTHS={account:340,appearance:360,menu:308,vpn:392,downloads:430,updates:360};
const TITLES={account:['','Your account'],appearance:['','Appearance'],menu:['','HN Browser'],vpn:['','HN VPN'],downloads:['','Downloads'],updates:['','About HN Browser'],settings:['HN BROWSER','Settings'],history:['YOUR BROWSING','History'],bookmarks:['YOUR FAVOURITES','Bookmarks'],ssh:['HN GROUP SERVER','SSH terminal']};
function icon(id){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href','icons.svg#'+id);svg.append(use);return svg;}
async function action(kind,value){const r=await window.browser.action(kind,value);if(r.error&&kind!=='suggest')showNotice(r.error);return r;}
function showNotice(text){const n=$('notice');n.textContent=text;n.hidden=!text;if(text){n.classList.remove('pop');void n.offsetWidth;n.classList.add('pop');}}
function togglePanel(name){if(!current?.panel)returnFocus=document.activeElement;action('panel',current?.panel===name?null:name);}
function picture(id,initialsId,source,initials){const img=$(id);$(initialsId).textContent=initials;$(initialsId).hidden=!!source;if(source){if(img.getAttribute('src')!==source)img.src=source;img.hidden=false;}else{img.hidden=true;img.removeAttribute('src');}img.onerror=()=>{img.hidden=true;$(initialsId).hidden=false;};}
const restart=node=>{node.style.animation='none';void node.offsetWidth;node.style.animation='';};

// Theme cards: a little preview of each theme.
themes.forEach(([id,label],i)=>{const b=document.createElement('button');b.className='theme-card';b.dataset.theme=id;b.style.setProperty('--i',i);b.setAttribute('aria-pressed','false');const sample=document.createElement('span');sample.className='theme-sample';for(const c of['sample-tab','sample-bar','sample-search','sample-page']){const x=document.createElement('i');x.className=c;sample.append(x);}const text=document.createElement('strong');text.textContent=label;b.append(sample,text,icon('check'));b.onclick=()=>action('theme',id);$('theme').append(b);});
for(const list of document.querySelectorAll('.menu-list'))[...list.children].forEach((n,i)=>n.style.setProperty('--i',i));

// Where a pop-over sits: right under the toolbar button that opens it.
function place(panel,state){const node=$('panel');if(!SHEETS.has(panel)&&!(panel==='account'&&state.locked)){const a=state.anchors?.[panel]||state.anchors?.menu,width=WIDTHS[panel]||340,right=a?Math.max(8,innerWidth-a.right-2):10;node.style.setProperty('--width',width+'px');node.style.setProperty('--right',right+'px');node.style.setProperty('--origin',a?Math.max(10,width-(a.right-a.x)/2-2)+'px':'90%');}}

function renderUpdate(state){const u=state.update||{status:'idle'},busy=['checking','downloading'].includes(u.status),available=['available','ready','downloading'].includes(u.status);setText($('about-version'),'Version '+state.version+' · Build '+state.build);setText($('menu-version'),'Version '+state.version);$('menu-update-label').hidden=!available;
 $('check-update').hidden=available;$('check-update').disabled=busy;$('check-update').textContent=u.status==='checking'?'Checking…':u.status==='error'?'Try again':'Check for updates';$('download-update').hidden=u.status!=='available';$('install-update').hidden=u.status!=='ready';$('install-update').textContent=u.inPlace?'Restart to update':'Open installer & quit';$('download-update').textContent=u.inPlace?'Download and update':'Download update';$('update-progress').hidden=u.status!=='downloading';$('update-progress').value=u.progress||0;
 const copy={idle:['A fresh start, always.','Check for the latest HN Browser release.'],checking:['Checking for updates…','Looking for the latest release for your computer.'],current:['You’re up to date.','You have the latest HN Browser.'],available:['A new version is ready.','HN Browser '+String(u.latest||'').split('-')[0]+' is available for this computer.'],downloading:['Downloading the update…',(u.progress||0)+'% · keep HN Browser open.'],ready:['Ready to update.',u.inPlace?'Restart HN Browser to finish. It reopens with your tabs.':'Open the installer to finish updating.'],error:['We couldn’t finish that.',u.error||'Try again in a moment.']};const[title,description]=copy[u.status]||copy.idle;setText($('update-title'),title);setText($('update-description'),description);$('update-icon').setAttribute('href','icons.svg#'+(busy?'reload':u.status==='current'||u.status==='ready'?'check':available?'download':'shield'));$('update-icon').closest('div').classList.toggle('checking',busy);}

function renderAccount(state,lock){const user=state.user,identity=user||(state.locked?state.remembered:null),initials=identity?(identity.displayName||'HN').split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase():'HN';
 picture('profile-picture','profile-initials',identity&&state.avatar,initials);picture('settings-picture','settings-initials',identity&&state.avatar,initials);
 setText($('account-tag'),state.locked?'WELCOME BACK':user?'SIGNED IN':'WELCOME');setText($('profile-name'),identity?identity.displayName:'Make yourself at home.');setText($('profile-email'),state.locked?'Enter your PIN to unlock HN Browser.':user?user.email:'One account for every HN Group website.');
 $('profile-details').hidden=!user;setText($('profile-role'),user?.jobTitle||'Not set');setText($('profile-company'),user?.company||'HN Group');$('unlock-form').hidden=!state.locked;$('account-actions').hidden=!user;$('menu-lock').hidden=!user;
 if(!state.locked){$('account-pin').value='';syncBoxes();}
 $('sign-in').hidden=!!user;$('sign-in').textContent=state.locked?'Use another account':'Sign in to HN Group';$('sign-in').className=lock?'btn ghost wide':'btn primary wide';}

function render(state){const previous=current;if(state.avatarSame)state.avatar=pictures.avatar;else pictures.avatar=state.avatar;for(const t of state.tabs)if(t.iconSame)t.icon=pictures.icons.get(t.id)||null;pictures.icons=new Map(state.tabs.map(t=>[t.id,t.icon]));current=state;
 window.HNTheme.schedule({theme:state.theme,at:state.themeAt,revision:state.themeRevision,reduceMotion:state.preferences?.reduceMotion});document.body.dataset.platform=state.platform;setText($('version'),'v'+state.version);
 for(const b of $('theme').children)b.setAttribute('aria-pressed',String(b.dataset.theme===state.theme));
 const panel=state.panel,closing=!panel&&!!state.panelClosing&&!!lastPanel,shown=panel||(closing?lastPanel:null),kind=shown?(shown==='account'&&state.locked?'lock':SHEETS.has(shown)?'sheet':'popover'):null;
 const overlay=$('overlay'),node=$('panel');overlay.hidden=!shown;overlay.classList.toggle('closing',closing);node.classList.toggle('closing',closing);
 if(shown){overlay.dataset.kind=kind;node.dataset.kind=kind;node.dataset.panel=shown;
  if(!closing){for(const[name,id]of Object.entries(SECTIONS))$(id).hidden=name!==shown;const[eyebrow,title]=TITLES[shown]||['',''];setText($('panel-eyebrow'),eyebrow);setText($('panel-title'),title);place(shown,state);if(shown!==lastPanel&&lastPanel&&kind===lastKind)restart(node);}}
 renderAccount(state,kind==='lock');
 if(state.message!==lastMessage){lastMessage=state.message;showNotice(state.message);}
 if(panel==='updates'||panel==='menu')renderUpdate(state);
 const zoom=state.tabs.find(t=>t.id===state.active)?.zoom||0;setText($('zoom-level'),Math.round(Math.pow(1.2,zoom)*100)+'%');
 downloadsUI.render(state.downloads||[]);vpnUI.render(state);window.HNTerminal.render(state);
 if(panel==='settings')renderSettings(state);if(panel==='bookmarks')libraryUI.bookmarks();if(panel==='history'&&(lastPanel!=='history'||state.historyVersion!==libraryUI.version))libraryUI.history();if(panel==='settings'&&settingsSection==='profile'&&(lastPanel!=='settings'||!previous?.user))profileUI.load();
 renderFind(state);
 if(state.platform!=='darwin'){setText($('new-tab-shortcut'),'Ctrl T');setText($('find-shortcut'),'Ctrl F');setText($('print-shortcut'),'Ctrl P');setText($('history-shortcut'),'Ctrl H');setText($('lock-shortcut'),'Ctrl ⇧ L');setText($('settings-shortcut'),'Ctrl ,');}
 if(state.locked&&panel==='account'&&(!wasLocked||panel!==lastPanel))requestAnimationFrame(()=>$('account-pin').focus());wasLocked=state.locked;
 if(panel!==lastPanel&&!closing){if(panel)requestAnimationFrame(()=>{if(!(state.locked&&panel==='account'))$('panel').focus();});lastPanel=panel;lastKind=kind;}
 if(!panel&&!state.panelClosing){lastPanel=null;lastKind=null;}
}

$('backdrop').onmousedown=()=>action('panel',null);$('close-panel').onclick=()=>action('panel',null);
for(const b of document.querySelectorAll('[data-action]'))b.onclick=()=>action(b.dataset.action);
for(const b of document.querySelectorAll('[data-panel]'))b.onclick=()=>action('panel',b.dataset.panel);
for(const b of document.querySelectorAll('[data-settings-open]'))b.onclick=()=>openSettings(b.dataset.settingsOpen);
$('clear-downloads').onclick=()=>action('download-clear');

// ---------- PIN entry ----------
function syncBoxes(){const length=$('account-pin').value.length;[...document.querySelectorAll('.account-pin-boxes span')].forEach((box,i)=>{box.classList.toggle('filled',i<length);box.classList.toggle('next',i===Math.min(length,5));});}
function syncAccountPin(){const input=$('account-pin');input.value=input.value.replace(/[^0-9]/g,'').slice(0,6);syncBoxes();if(input.value.length===6&&!unlocking)$('unlock-form').requestSubmit();}
$('account-pin').addEventListener('input',syncAccountPin);$('account-pin').addEventListener('focus',syncBoxes);
$('unlock-form').onsubmit=async e=>{e.preventDefault();if(unlocking||$('account-pin').value.length!==6)return;unlocking=true;$('unlock-account').disabled=true;$('account-pin').readOnly=true;$('unlock-error').textContent='Checking…';
 try{const result=await action('unlock-account',$('account-pin').value);$('unlock-error').textContent=result.error||'';if(result.error){const entry=document.querySelector('.account-pin-entry');entry.classList.remove('shake');void entry.offsetWidth;entry.classList.add('shake');}}
 finally{$('account-pin').value='';unlocking=false;$('unlock-account').disabled=false;$('account-pin').readOnly=false;syncAccountPin();if(current?.locked)$('account-pin').focus();}};
$('forget-account').onclick=()=>action('sign-out');
$('sign-in').onclick=async()=>{const b=$('sign-in');b.disabled=true;try{await action('sign-in');}finally{b.disabled=false;}};$('sign-out').onclick=()=>action('sign-out');
for(const id of['check-update','download-update','install-update'])$(id).onclick=()=>action(id);

// ---------- Keyboard: shortcuts, Esc to close, Tab and arrows move around the open menu ----------
document.addEventListener('keydown',e=>{const mod=current?.platform==='darwin'?e.metaKey:e.ctrlKey,key=e.key.toLowerCase();if((e.ctrlKey&&key==='tab')||(mod&&!e.altKey&&(!e.shiftKey||key==='t')&&(['t','w','r','f','d','p'].includes(key)||/^[1-9]$/.test(key)))){e.preventDefault();e.stopImmediatePropagation();action('key',{key:e.key,control:e.ctrlKey,meta:e.metaKey,shift:e.shiftKey,alt:e.altKey});}},true);
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select')&&e.key!=='Tab'&&e.key!=='Escape')return;if(e.target.closest?.('.xterm')&&e.key!=='Escape')return;if(e.key==='Escape'&&current?.panel&&!(current.locked&&current.panel==='account')){action('panel',null);return;}
 if(current?.panel&&['Tab','ArrowDown','ArrowUp'].includes(e.key)){const items=[...$('panel').querySelectorAll('button:not(:disabled),select:not(:disabled),textarea:not(:disabled),input:not(:disabled):not([type=hidden])')].filter(n=>n.getClientRects().length),index=items.indexOf(document.activeElement);if(!items.length)return;if(e.key!=='Tab'||index<0||(e.shiftKey?index===0:index===items.length-1)){e.preventDefault();items[(index+(e.shiftKey||e.key==='ArrowUp'?-1:1)+items.length)%items.length].focus();}}});

const screenContext={action,$,icon,motion,togglePanel,ON_TOP:true,setText,state:()=>current};
const profileUI=window.HNProfile.create(screenContext),libraryUI=window.HNLibrary.create(screenContext),vpnUI=window.HNVpnScreen.create(screenContext),downloadsUI=window.HNDownloads.create(screenContext);
window.browser.subscribe(render);window.browser.state().then(state=>{if(!current)render(state);renderShortcuts(state.platform==='darwin');});
addEventListener('resize',()=>{if(current?.panel)place(current.panel,current);});

// ---------- Settings ----------
for(const[id,label]of themes){const option=document.createElement('option');option.value=id;option.textContent=label;$('settings-theme').append(option);}
function openSettings(section){settingsSection=section;$('settings-search').value='';filterSettings();if(current?.panel!=='settings')action('panel','settings');else if(section==='profile')profileUI.load();}
function filterSettings(){const query=$('settings-search').value.trim().toLowerCase();let count=0;for(const section of document.querySelectorAll('[data-section]')){section.hidden=query?!section.textContent.toLowerCase().includes(query):section.dataset.section!==settingsSection;if(!section.hidden)count++;}for(const b of document.querySelectorAll('[data-settings]'))b.setAttribute('aria-current',String(!query&&b.dataset.settings===settingsSection));$('settings-no-match').hidden=!!count;}
for(const b of document.querySelectorAll('[data-settings]'))b.onclick=()=>{if(settingsSection===b.dataset.settings&&!$('settings-search').value)return;settingsSection=b.dataset.settings;$('settings-search').value='';filterSettings();if(settingsSection==='profile')profileUI.load();document.querySelector('.settings-body').scrollTop=0;};
$('settings-search').oninput=filterSettings;
function renderSettings(state){const p=state.preferences||{};for(const input of document.querySelectorAll('[data-preference]'))input.checked=!!p[input.dataset.preference];$('settings-engine').value=p.searchEngine||'google';$('settings-theme').value=state.theme;for(const select of document.querySelectorAll('[data-zoom]'))select.value=String(p.defaultZoom||0);for(const select of document.querySelectorAll('[data-preference-select]'))select.value=String(p[select.dataset.preferenceSelect]??'');for(const radio of document.querySelectorAll('input[name=startup]'))radio.checked=radio.value===(p.startup||'newtab');
 setText($('settings-library-summary'),(state.bookmarks||[]).length+' bookmark'+((state.bookmarks||[]).length===1?'':'s')+' saved on this device.');profileUI.gate(state);setText($('settings-folder'),p.downloadPath||'');setText($('settings-account-name'),state.user?.displayName||state.remembered?.displayName||'Your HN account');setText($('settings-version'),'Version '+state.version+' · Build '+state.build);setText($('settings-engine-version'),'Chromium '+(state.chromium||'')+' · Electron '+(state.electron||''));filterSettings();}
for(const input of document.querySelectorAll('[data-preference]'))input.onchange=()=>action('preference',{key:input.dataset.preference,value:input.checked});
$('settings-engine').onchange=()=>action('preference',{key:'searchEngine',value:$('settings-engine').value});
for(const select of document.querySelectorAll('[data-zoom]'))select.onchange=()=>action('preference',{key:'defaultZoom',value:Number(select.value)});
for(const select of document.querySelectorAll('[data-preference-select]'))select.onchange=()=>action('preference',{key:select.dataset.preferenceSelect,value:Number(select.value)});
for(const radio of document.querySelectorAll('input[name=startup]'))radio.onchange=()=>{if(radio.checked)action('preference',{key:'startup',value:radio.value});};
$('settings-theme').onchange=()=>action('theme',$('settings-theme').value);$('clear-cache').onclick=()=>action('clear-data','cache');$('clear-cookies').onclick=()=>action('clear-data','cookies');
function renderShortcuts(mac){const m=mac?'⌘':'Ctrl',list=[['New tab',m+' T'],['Close tab',m+' W'],['Reopen closed tab',m+' ⇧ T'],['Next / previous tab','Ctrl Tab / Ctrl ⇧ Tab'],['Go to tab 1–8 / last tab',m+' 1–8 / '+m+' 9'],['Address bar',m+' L'],['Find in page',m+' F'],['Bookmark this page',m+' D'],['Bookmarks',m+' ⇧ O'],['History',mac?'⌘ Y':'Ctrl H'],['Downloads',m+' J'],['Settings',m+' ,'],['HN VPN',m+' ⇧ V'],['SSH terminal',m+' ⇧ S'],['Print',m+' P'],['Lock HN Browser',m+' ⇧ L'],['Reload',m+' R / F5'],['Back / forward',mac?'⌘ [ / ⌘ ]':'Alt ← / Alt →'],['Zoom in / out / reset',m+' + / '+m+' − / '+m+' 0'],['Close a menu','Esc']];$('shortcut-list').replaceChildren(...list.flatMap(([k,v])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;for(const part of v.split(' / ')){const kbd=document.createElement('kbd');kbd.textContent=part;dd.append(kbd);}return[dt,dd];}));}

// ---------- Find in page ----------
let findWasOpen=false,findTimer;
function renderFind(state){const f=state.find||{open:false};$('find-bar').hidden=!f.open;setText($('find-count'),f.open&&f.text?(f.matches?f.active+' of '+f.matches:'No matches'):'');if(f.open&&!findWasOpen)requestAnimationFrame(()=>{$('find-input').focus();$('find-input').select();});if(!f.open&&findWasOpen)$('find-input').value='';findWasOpen=!!f.open;}
$('find-input').oninput=()=>{clearTimeout(findTimer);findTimer=setTimeout(()=>action('find',{text:$('find-input').value}),120);};
$('find-bar').onsubmit=e=>e.preventDefault();
$('find-input').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();if($('find-input').value)action('find',{text:$('find-input').value,forward:!e.shiftKey,next:true});}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();action('find-close');}};
$('find-next').onclick=()=>{if($('find-input').value)action('find',{text:$('find-input').value,forward:true,next:true});};$('find-prev').onclick=()=>{if($('find-input').value)action('find',{text:$('find-input').value,forward:false,next:true});};$('find-close').onclick=()=>action('find-close');
window.browser.focusFind(()=>{$('find-input').focus();$('find-input').select();});
