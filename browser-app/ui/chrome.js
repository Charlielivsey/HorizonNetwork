'use strict';
// The toolbar page: tabs, navigation, the address bar and the toolbar buttons. Menus open in the overlay,
// anchored under the button that opened them; this page tells the browser where those buttons are.
const $=id=>document.getElementById(id),HOME='hn-browser://start/';
let current=null,editing=false,opener=null,lastPanel=null,suggestItems=[],suggestIndex=-1,suggestSeq=0,suggestTimer,avatar=null,icons=new Map(),freshFocus=false;
const motion=()=>!current?.preferences?.reduceMotion&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
const action=(kind,data)=>window.browser.action(kind,data);
const PANELS={account:'account',appearance:'appearance','browser-menu':'menu','downloads-button':'downloads','vpn-button':'vpn'};

function picture(source,identity){const image=$('toolbar-picture'),initials=$('initials');$('toolbar-person').toggleAttribute('hidden',!!identity);initials.textContent=(identity?.displayName||'HN').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();initials.hidden=!!source||!identity;image.hidden=!source;if(source){if(image.getAttribute('src')!==source)image.src=source;}else image.removeAttribute('src');image.onerror=()=>{image.hidden=true;initials.hidden=false;};}
function hnBadge(name,typed=false){const badge=$('hn-badge');badge.hidden=!name;if(name){const text='HN Group · '+name;if(badge.lastElementChild.textContent!==text)badge.lastElementChild.textContent=text;badge.title=(typed?'Goes to ':'')+name+', an official HN Group website';badge.classList.toggle('typed',typed);}}

function render(state){
 if(state.avatarSame)state.avatar=avatar;else avatar=state.avatar;for(const t of state.tabs)if(t.iconSame)t.icon=icons.get(t.id)||null;icons=new Map(state.tabs.map(t=>[t.id,t.icon]));current=state;
 window.HNTheme.schedule({theme:state.theme,at:state.themeAt,revision:state.themeRevision,reduceMotion:state.preferences.reduceMotion});
 document.body.dataset.platform=state.platform;$('version').textContent='v'+state.version;
 window.HNTabs.render(state,action,motion());
 const tab=state.tabs.find(t=>t.id===state.active);
 if(tab){if(!editing){const value=tab.url===HOME?'':tab.url;if($('address').value!==value)$('address').value=value;hnBadge(tab.hn);}
  $('back').disabled=!tab.back;$('forward').disabled=!tab.forward;$('reload-icon').setAttribute('href','icons.svg#'+(tab.loading?'close':'reload'));$('reload').setAttribute('aria-label',tab.loading?'Stop loading':'Reload');
  $('connection-icon').setAttribute('href','icons.svg#'+(tab.url.startsWith('https:')?'lock':tab.url.startsWith('http:')?'info':'search'));$('connection').setAttribute('aria-label',tab.url.startsWith('http:')?'Not secure — this page uses HTTP':'Connection');
  const web=/^https?:/.test(tab.url),starred=web&&state.bookmarks.some(x=>x.url===tab.url);$('star').hidden=!web;$('star').classList.toggle('starred',starred);$('star').setAttribute('aria-pressed',String(starred));$('star').setAttribute('aria-label',starred?'Remove bookmark':'Bookmark this page');
  $('zoom-pill').hidden=Math.abs(tab.zoom-state.preferences.defaultZoom)<.01;$('zoom-pill').textContent=Math.round(1.2**tab.zoom*100)+'%';
  document.body.classList.toggle('page-loading',!!tab.loading);}
 const identity=state.user||state.remembered;picture(identity&&state.avatar,identity);$('account-label').textContent=identity?.displayName||'Sign in';$('toolbar-lock').hidden=!state.locked;
 $('home').hidden=!state.preferences.homeButton;
 for(const[id,name]of Object.entries(PANELS))$(id).setAttribute('aria-expanded',String(state.panel===name));
 const count=state.downloads.filter(x=>['downloading','paused','interrupted'].includes(x.status)).length;$('download-badge').hidden=!count;$('download-badge').textContent=count;
 $('vpn-dot').hidden=!state.vpn?.connected;$('vpn-button').title=state.vpn?.connected?'HN VPN · Connected':'HN VPN';
 $('update-dot').hidden=!['available','downloading','ready'].includes(state.update?.status);
 if(state.panel)hideSuggestions();
 // When a menu closes, focus goes back to where it was (or the address bar after unlocking).
 if(lastPanel&&!state.panel&&!state.panelClosing){if(lastPanel==='account'&&!state.locked&&!opener)$('address').focus();else opener?.focus?.();opener=null;}
 if(!state.panelClosing)lastPanel=state.panel;
 if(state.platform!=='darwin')document.querySelector('.address-hint').textContent='Ctrl L';
}

// Where each menu button sits, so menus can open right under them.
let anchorKey='';function sendAnchors(){const anchors={};for(const[id,name]of Object.entries(PANELS)){const r=$(id).getBoundingClientRect();if(r.width)anchors[name]={x:Math.round(r.left),right:Math.round(r.right),bottom:Math.round(r.bottom)};}const key=JSON.stringify(anchors);if(key!==anchorKey){anchorKey=key;action('anchors',anchors);}}
new ResizeObserver(()=>requestAnimationFrame(sendAnchors)).observe(document.querySelector('.toolbar'));

function togglePanel(name){opener=document.activeElement;action('panel',current?.panel===name?null:name);}
for(const[id,name]of Object.entries(PANELS))$(id).onclick=()=>togglePanel(name);
for(const id of['back','forward','home','new-tab'])$(id).onclick=async()=>{await action('panel',null);action(id==='new-tab'?'new':id);};
$('reload').onclick=()=>action(current?.tabs.find(t=>t.id===current.active)?.loading?'stop':'reload');
$('star').onclick=()=>action('bookmark-toggle');$('zoom-pill').onclick=()=>action('zoom-reset');
$('address-form').onmousedown=e=>{if(e.target===$('address-form')||e.target.closest('.omni-lead')){e.preventDefault();$('address').focus();}};

// ---------- Address bar and suggestions ----------
function addressRect(){const rect=$('address-form').getBoundingClientRect();return{x:rect.left,y:rect.bottom+4,width:rect.width};}
function hideSuggestions(){if(suggestItems.length)action('suggest-close');suggestItems=[];suggestIndex=-1;$('address').setAttribute('aria-expanded','false');}
function revertAddress(){const tab=current?.tabs.find(t=>t.id===current.active);if(!tab)return;suggestSeq++;hideSuggestions();$('address').value=tab.url===HOME?'':tab.url;hnBadge(tab.hn);$('address').select();}
$('address').onfocus=()=>{editing=true;freshFocus=true;$('address').select();};
$('address').onmouseup=e=>{if(freshFocus){e.preventDefault();freshFocus=false;}};
$('address').onblur=()=>{editing=false;freshFocus=false;setTimeout(()=>{if(document.activeElement!==$('address')){suggestSeq++;hideSuggestions();if(current)render(current);}},150);};
$('address').oninput=()=>{freshFocus=false;clearTimeout(suggestTimer);const text=$('address').value,seq=++suggestSeq;suggestIndex=-1;if(!text.trim()){hideSuggestions();hnBadge(null);return;}
 suggestTimer=setTimeout(async()=>{const response=await action('suggest',{text,rect:addressRect()});if(seq!==suggestSeq)return;if(document.activeElement!==$('address')){action('suggest-close');return;}suggestItems=response.result||[];$('address').setAttribute('aria-expanded',String(!!suggestItems.length));hnBadge(suggestItems[0]?.hn,true);},40);};
$('address').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(suggestItems.length){suggestSeq++;hideSuggestions();}else revertAddress();return;}
 if(suggestItems.length&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();suggestIndex=(suggestIndex+(e.key==='ArrowDown'?1:-1)+suggestItems.length+1)%(suggestItems.length+1);if(suggestIndex===suggestItems.length)suggestIndex=-1;action('suggest-index',suggestIndex);hnBadge((suggestItems[suggestIndex]||suggestItems[0])?.hn,true);}};
$('address-form').onsubmit=async e=>{e.preventDefault();const chosen=suggestItems[suggestIndex],value=$('address').value;suggestSeq++;editing=false;hideSuggestions();if(current?.panel)await action('panel',null);if(chosen)action('open',{url:chosen.url});else action('navigate',value);$('address').blur();};

window.browser.focusAddress(()=>{$('address').focus();$('address').select();});
window.browser.suggestChosen(()=>{suggestSeq++;editing=false;suggestItems=[];suggestIndex=-1;$('address').blur();});
window.browser.subscribe(render);window.browser.state().then(state=>{if(!current)render(state);sendAnchors();requestAnimationFrame(sendAnchors);});
// Some input methods and automation deliver shortcuts as DOM keys instead of to the browser first.
document.addEventListener('keydown',event=>{const mod=current?.platform==='darwin'?event.metaKey:event.ctrlKey,key=event.key.toLowerCase();if(event.ctrlKey&&key==='tab'||mod&&!event.altKey&&(['t','w','r','f','d','p',',','j','h','y','+','=','-','0','[',']'].includes(key)||/^[1-9]$/.test(key)||event.shiftKey&&['o','v','s','l'].includes(key))){event.preventDefault();event.stopImmediatePropagation();action('key',{key:event.key,control:event.ctrlKey,meta:event.metaKey,shift:event.shiftKey,alt:event.altKey});}},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&current?.panel&&document.activeElement!==$('address'))action('panel',null);});
