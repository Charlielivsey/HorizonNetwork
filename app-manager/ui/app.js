'use strict';
// HN Group App Manager's window. The page is built once (index.html) and kept up to date from the state the
// main process sends; parts are only redrawn when what they show changes, so nothing flickers or replays.
const api=window.manager;
const $=id=>document.getElementById(id),$$=(selector,root=document)=>[...root.querySelectorAll(selector)];
let state=null,page='overview',filter='all',toastTimer=null;
const forms={};// per app: {schema, values, draft, loading, error, key}

// ---------- Icons ----------
const ICONS={
 grid:'<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
 history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
 download:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
 refresh:'<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
 alert:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16.5h.01"/>',
 shield:'<path d="M12 3 20 6v6c0 4.6-3.4 8.2-8 9-4.6-.8-8-4.4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
 key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 sliders:'<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
 sparkle:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
 trash:'<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
 external:'<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
 check:'<path d="m5 12 4.5 4.5L19 7"/>',
 play:'<path d="M7 4v16l13-8z"/>',
 wrench:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
 x:'<path d="M6 6l12 12M18 6 6 18"/>',
 folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
};
function paint(svg,name){svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','2');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.innerHTML=ICONS[name]||'';}
const icon=name=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');paint(svg,name);return svg;};
for(const svg of $$('svg[data-icon]'))paint(svg,svg.dataset.icon);

// ---------- Helpers ----------
function el(tag,attrs,...children){const node=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{})){if(v==null||v===false)continue;if(k.startsWith('on'))node.addEventListener(k.slice(2),v);else node.setAttribute(k,v===true?'':v);}for(const c of children.flat(9)){if(c==null||c===false)continue;node.append(c instanceof Node?c:document.createTextNode(String(c)));}return node;}
const setText=(node,value)=>{if(typeof node==='string')node=$(node);value=String(value??'');if(node&&node.textContent!==value)node.textContent=value;};
const showIf=(node,on)=>{if(typeof node==='string')node=$(node);if(node&&node.hidden===!!on)node.hidden=!on;};
const short=v=>String(v||'').split('-')[0];
const mb=bytes=>(bytes/1048576).toFixed(bytes>=104857600?0:1)+' MB';
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const when=at=>{const d=new Date(at);if(isNaN(d))return'';const s=(Date.now()-d)/1000;if(s<60)return'Just now';if(s<3600)return Math.round(s/60)+' min ago';const today=new Date().toDateString()===d.toDateString();return(today?'Today':d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}))+' at '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});};
const day=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});};
function toast(message,bad=false){const t=$('toast');t.textContent=message;t.className='toast'+(bad?' bad':'');t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},6000);}
async function call(method,...args){const r=await api.call(method,...args);if(!r?.ok)throw Error(r?.error||'Something went wrong.');return r.value;}
async function act(method,...args){try{return await call(method,...args);}catch(e){toast(e.message,true);return undefined;}}
async function busy(button,fn){if(!button||button.disabled)return;button.disabled=true;button.classList.add('working');try{return await fn();}finally{button.classList.remove('working');button.disabled=false;render();}}
const appOf=id=>state?.apps.find(a=>a.id===id);
const platformName=()=>state?.platform==='darwin'?'Mac':'PC';

// ---------- Questions, asked in the HN design ----------
const questions=[];let asking=null;
function ask(spec){return new Promise(resolve=>{questions.push({...spec,resolve});if(!asking)nextQuestion();});}
function nextQuestion(){asking=questions.shift()||null;const layer=$('layer');
 if(!asking){layer.classList.remove('open');setTimeout(()=>{if(!asking)layer.hidden=true;},reduced()?0:180);return;}
 const d=$('dialog');d.dataset.tone=asking.tone||'accent';paint($('dialog-icon').firstElementChild,asking.icon||'alert');
 setText('dialog-title',asking.title);setText('dialog-text',asking.text||'');setText('dialog-note',asking.note||'');showIf('dialog-note',!!asking.note);
 $('dialog-buttons').replaceChildren(...asking.buttons.map(b=>el('button',{class:'btn '+(b.tone==='danger'?'danger-fill':b.tone==='primary'?'primary':''),'data-choice':b.id,onclick:()=>answer(b.id)},b.label)));
 layer.hidden=false;layer.classList.remove('open');void layer.offsetWidth;layer.classList.add('open');
 // The safe choice has focus, so Enter never installs or removes anything by accident.
 const safe=$('dialog-buttons').querySelector('[data-choice=cancel]');safe?.focus();requestAnimationFrame(()=>safe?.focus());}
function answer(choice){const q=asking;if(!q)return;nextQuestion();q.resolve(choice);}
const confirmed=async spec=>await ask({...spec,buttons:[{id:'cancel',label:spec.cancel||'Cancel'},{id:'ok',label:spec.confirm,tone:spec.tone==='danger'?'danger':'primary'}]})==='ok';
api.onDialog(spec=>ask({...spec,fromApp:spec.id}).then(choice=>api.call('dialog-answer',spec.id,choice)),id=>{if(asking?.fromApp===id)answer('cancel');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&asking){e.preventDefault();answer('cancel');}});
$('layer').querySelector('.scrim').addEventListener('click',()=>answer('cancel'));

// ---------- What each app can do right now ----------
// The main thing to do, and the other actions, for an app (used on its card and its page).
function actionsFor(a){
 const queued=state.queue.some(j=>j.id===a.id),working=state.operation?.id===a.id;
 if(working||queued)return{main:{kind:'cancel',label:working?'Cancel':'Remove from queue',icon:'x'},more:[]};
 if(!a.installed){
  if(!a.canInstall)return{main:null,more:[],note:a.id==='browser'&&state.platform==='darwin'?'HN Browser needs a Mac with Apple silicon.':'Not available for this computer.'};
  return{main:{kind:'install',label:'Install',icon:'download',disabled:!a.latest},more:[],note:a.latest?'':'There’s no download for this computer yet.'};}
 const more=[{kind:'open',label:'Open',icon:'play'}];
 if(a.latest&&!a.update)more.push({kind:'reinstall',label:'Reinstall',icon:'wrench'});
 return{main:a.update?{kind:'update',label:'Update to '+short(a.latest.version),icon:'download'}:{kind:'open',label:'Open',icon:'play'},more:a.update?more:more.slice(1)};}
async function perform(id,kind,button){
 const a=appOf(id);if(!a)return;
 const run=async()=>{await busy(button,async()=>{await call('enqueue',id,kind);});};
 try{
  if(kind==='open')return await busy(button,()=>call('open',id));
  if(kind==='cancel')return await call('cancel',id);
  if(kind==='install'){if(!await confirmed({title:'Install '+a.name+' '+short(a.latest.version)+'?',text:state.platform==='darwin'?'It’s installed in your Applications folder after its download is checked.':'Its installer runs quietly after the download is checked. Windows may ask for permission.',icon:'download',confirm:'Install'}))return;return await run();}
  if(kind==='reinstall'){if(!await confirmed({title:'Reinstall '+a.name+'?',text:'A fresh, checked copy of version '+short(a.latest.version)+' replaces the one on this '+platformName()+'. Your account, settings and data are kept.',icon:'wrench',confirm:'Reinstall'}))return;return await run();}
  if(kind==='update'){await run();if(a.running)toast(a.name+' updates as soon as you quit it.');return;}
  if(kind==='uninstall'){if(!await confirmed({title:'Remove '+a.name+'?',text:(state.platform==='darwin'?'The app moves to the Bin.':'Its Windows uninstaller runs.')+' Your account, settings and data stay on this '+platformName()+', so reinstalling picks up where you left off.',note:a.id==='network'?'Disconnect the VPN first. WireGuard and this computer’s VPN set-up are kept.':'',icon:'trash',tone:'danger',confirm:'Remove'}))return;await run();if(a.running)toast(a.name+' is removed as soon as you quit it.');}
 }catch(e){toast(e.message,true);}}
function actionButtons(a,{large=false}={}){const{main,more,note}=actionsFor(a),buttons=[];
 if(main)buttons.push(el('button',{class:'btn '+(main.kind==='cancel'?'':'primary')+(large?' large':''),disabled:main.disabled||null,'data-action':main.kind,onclick:e=>perform(a.id,main.kind,e.currentTarget)},icon(main.icon),el('span',{},main.label)));
 for(const m of more)buttons.push(el('button',{class:'btn'+(large?' large':''),'data-action':m.kind,onclick:e=>perform(a.id,m.kind,e.currentTarget)},icon(m.icon),el('span',{},m.label)));
 if(note)buttons.push(el('span',{class:'muted small'},note));return buttons;}
function status(a){const op=state.operation?.id===a.id?state.operation:null;
 if(op)return{text:{preparing:'Getting ready',waiting:'Waiting for you to quit it',downloading:'Downloading',installing:op.kind==='uninstall'?'Removing':'Installing',removing:'Removing'}[op.phase]||'Working',tone:'busy'};
 if(state.queue.some(j=>j.id===a.id))return{text:'Queued',tone:'busy'};
 if(a.error)return{text:'Couldn’t check',tone:'bad'};
 if(!a.installed)return{text:a.canInstall?'Not installed':'Not available',tone:''};
 if(a.update)return{text:'Update available',tone:'accent'};
 return{text:a.running?'Up to date · open':'Up to date',tone:'good'};}

// ---------- Overview ----------
const cards={};
function card(a){if(cards[a.id])return cards[a.id];
 const pill=el('span',{class:'pill'}),version=el('p',{class:'card-version'}),actions=el('div',{class:'row card-actions'}),progress=el('div',{class:'bar mini',hidden:true},el('i'));
 const node=el('article',{class:'app-card','data-app':a.id},
  el('div',{class:'card-top'},el('img',{class:'app-icon',src:'assets/'+a.icon,alt:''}),pill),
  el('h2',{},a.name),el('p',{class:'muted'},a.tagline),version,progress,actions,
  el('button',{class:'link details',onclick:()=>go(a.id)},'Details and settings',icon('external')));
 $('cards').append(node);return cards[a.id]={node,pill,version,actions,progress,key:''};}
function renderOverview(){
 const updates=state.apps.filter(a=>a.update),installed=state.apps.filter(a=>a.installed),op=state.operation;
 setText('hero-title',state.checking&&!state.checkedAt?'Checking your apps…':op?'Working on it…':updates.length?(updates.length===1?updates[0].name+' has an update':updates.length+' updates are ready'):installed.length?'Everything’s up to date':'Let’s get you set up');
 setText('hero-text',updates.length?'Updates install in place. Your account, settings and data are kept.':installed.length?installed.map(a=>a.name+' '+a.installed.version).join(' · '):'Install HN Browser and HN Secure Network with one click. Every download is checked before it runs.');
 showIf('update-all',updates.length>1||(updates.length===1&&!op));setText($('update-all').querySelector('span'),updates.length>1?'Update all ('+updates.length+')':'Update');
 $('update-all').disabled=updates.every(a=>state.queue.some(j=>j.id===a.id)||op?.id===a.id);
 const c=$('check');c.disabled=state.checking;c.classList.toggle('working',state.checking);
 setText('checked',state.checking?'Checking downloads.hngroup.org.uk…':state.checkedAt?'Last checked '+when(state.checkedAt).toLowerCase():'');
 const e=$('error');showIf(e,!!state.error);setText(e.querySelector('p'),state.error||'');
 for(const a of state.apps){const c=card(a),s=status(a);
  c.pill.className='pill '+s.tone;setText(c.pill,s.text);
  setText(c.version,a.installed?'Version '+a.installed.version+(a.update?' → '+short(a.latest.version):''):a.latest?'Latest version '+short(a.latest.version):'');
  const o=state.operation?.id===a.id?state.operation:null;showIf(c.progress,!!o);if(o)c.progress.firstElementChild.style.transform='scaleX('+(o.phase==='downloading'&&o.total?o.received/o.total:o.phase==='installing'||o.phase==='removing'?1:0)+')';c.progress.classList.toggle('indeterminate',!!o&&o.phase!=='downloading');
  const key=JSON.stringify(actionsFor(a));if(key!==c.key){c.key=key;c.actions.replaceChildren(...actionButtons(a));}}}

// ---------- One app's page ----------
let shownApp=null,appKey='';
function renderApp(id){const a=appOf(id);if(!a)return;
 if(shownApp!==id){shownApp=id;appKey='';$('app-icon').src='assets/'+a.icon;setText('app-name',a.name);setText('app-tagline',a.tagline);setText('app-eyebrow',a.id==='browser'?'Web browser':'VPN and SSH');
  $('app-features').replaceChildren(...a.features.map(f=>el('li',{},icon('check'),el('span',{},f))));}
 const s=status(a);$('app-pill').className='pill '+s.tone;setText('app-pill',s.text);
 const key=JSON.stringify(actionsFor(a));if(key!==appKey){appKey=key;$('app-actions').replaceChildren(...actionButtons(a,{large:true}));}
 setText('fact-installed',a.installed?a.installed.version:'Not installed');setText('fact-installed-note',a.installed?.build?'Build '+a.installed.build:'');
 setText('fact-latest',a.latest?short(a.latest.version):'—');setText('fact-latest-note',a.latest?(a.latest.publishedAt?'Released '+day(a.latest.publishedAt):'Build '+(a.latest.version.split('-')[1]||'—'))+' · '+mb(a.latest.size):'No download yet');
 setText('fact-status',a.running?'Open':a.installed?'Closed':'—');setText('fact-status-note',a.running?'Quit it to update, remove or change settings':a.installed?'Ready for changes':'');
 setText('fact-location',a.installed?.path||'—');showIf('reveal',!!a.installed);
 const op=state.operation?.id===id?state.operation:null,p=$('app-progress');showIf(p,!!op);if(op)p.replaceChildren(...progressContent(a,op));
 showIf('danger',!!a.installed);setText('remove-text',state.platform==='darwin'?'Moves '+a.name+' to the Bin. Your account, settings and data are kept.':'Runs '+a.name+'’s uninstaller. Your account, settings and data are kept.');
 renderSettings(a);}
function progressContent(a,op){const title={preparing:'Getting ready…',waiting:'Waiting for you to quit '+a.name,downloading:'Downloading '+a.name+' '+short(op.version),installing:(op.kind==='uninstall'?'Removing ':'Installing ')+a.name+'…',removing:'Removing '+a.name+'…'}[op.phase]||'Working…';
 const text=op.phase==='waiting'?'It starts by itself as soon as you quit it, including its menu bar or tray icon.':op.phase==='downloading'?mb(op.received)+' of '+mb(op.total)+(op.speed?' · '+mb(op.speed)+'/s':''):op.phase==='installing'?'Checking the download again and installing. This can take a minute.':'';
 const bar=el('div',{class:'bar'+(op.phase==='downloading'?'':' indeterminate')},el('i'));if(op.phase==='downloading'&&op.total)bar.firstElementChild.style.transform='scaleX('+op.received/op.total+')';
 return[el('div',{class:'grow'},el('strong',{},title),el('span',{class:'muted small'},text),bar)];}
// Settings for one app, read from its preferences while it's closed.
async function loadSettings(id,force=false){const f=forms[id]||(forms[id]={});if(f.loading||(f.schema&&!force))return;f.loading=true;f.error='';renderSettings(appOf(id));
 try{const data=await call('settings',id);Object.assign(f,{schema:data.schema,values:data.values,draft:{...data.values},key:''});}catch(e){f.error=e.message;}finally{f.loading=false;render();}}
const LABELS={'midnight-lavender':'Midnight Lavender',daylight:'Daylight','deep-ocean':'Deep Ocean',forest:'Forest',rose:'Rose Quartz',newtab:'A new tab',restore:'My tabs from last time',system:'Match the computer',light:'Light',dark:'Dark',google:'Google',bing:'Bing',duckduckgo:'DuckDuckGo'};
const label=v=>typeof v==='number'?(v===0?'Never':v+' minutes'):LABELS[v]||String(v);
function renderSettings(a){if(!a)return;const f=forms[a.id]||{},body=$('settings-body'),locked=a.running||state.operation?.id===a.id;
 setText('settings-note',!a.installed?'Install '+a.name+' to change its settings here.':a.running?'Quit '+a.name+' to change its settings here. You can also change them inside the app.':'Saved to '+a.name+' while it’s closed. They apply the next time it opens.');
 const dirty=!!f.draft&&Object.keys(f.draft).some(k=>f.draft[k]!==f.values[k]);showIf('save-bar',dirty&&!locked);
 const key=JSON.stringify([a.id,!!a.installed,locked,f.loading,f.error,f.schema&&Object.keys(f.schema),f.values]);
 if(key===f.key&&body.dataset.app===a.id){for(const input of $$('[data-setting]',body))syncField(input,f);return;}
 f.key=key;body.dataset.app=a.id;
 if(!a.installed){body.replaceChildren();return;}
 if(f.loading||!f.schema){body.replaceChildren(el('p',{class:'muted small'},f.error||'Loading settings…'));return;}
 const groups={};for(const[k,field]of Object.entries(f.schema))(groups[field.group]||(groups[field.group]=[])).push([k,field]);
 body.replaceChildren(...Object.entries(groups).map(([group,fields])=>el('div',{class:'setting-group'},el('h3',{},group),...fields.map(([k,field])=>settingRow(a,k,field,f,locked)))));}
function settingRow(a,k,field,f,locked){const id='setting-'+k;let control;
 if(field.type==='boolean')control=el('button',{class:'switch',role:'switch',id,'data-setting':k,'aria-label':field.label,'aria-checked':String(!!f.draft[k]),disabled:locked||null,onclick:()=>{f.draft[k]=!f.draft[k];renderSettings(a);}});
 else if(field.type==='choice'&&field.values.length<=3)control=el('div',{class:'segmented small',role:'group','aria-label':field.label,id,'data-setting':k},...field.values.map(v=>el('button',{'aria-pressed':String(f.draft[k]===v),disabled:locked||null,'data-value':String(v),onclick:()=>{f.draft[k]=v;renderSettings(a);}},label(v))));
 else if(field.type==='choice'){control=el('select',{id,'data-setting':k,disabled:locked||null,onchange:e=>{const v=field.values.find(x=>String(x)===e.target.value);f.draft[k]=v;renderSettings(a);}},...field.values.map(v=>el('option',{value:String(v)},label(v))));control.value=String(f.draft[k]);}
 else control=el('input',{id,'data-setting':k,value:f.draft[k],spellcheck:'false',autocomplete:'off',disabled:locked||null,oninput:e=>{f.draft[k]=e.target.value;renderSettings(a);}});
 return el('div',{class:'setting'},el('label',{for:id},el('strong',{},field.label),field.hint?el('small',{},field.hint):null),control);}
function syncField(input,f){const k=input.dataset.setting,v=f.draft[k];
 if(input.classList.contains('switch'))input.setAttribute('aria-checked',String(!!v));
 else if(input.classList.contains('segmented'))for(const b of input.children)b.setAttribute('aria-pressed',String(b.dataset.value===String(v)));
 else if(input.tagName==='SELECT'){if(input.value!==String(v))input.value=String(v);}
 else if(document.activeElement!==input&&input.value!==v)input.value=v;}
$('settings-discard').addEventListener('click',()=>{const f=forms[page];if(f?.values){f.draft={...f.values};renderSettings(appOf(page));}});
$('settings-save').addEventListener('click',e=>{const id=page,f=forms[id];if(!f?.draft)return;const patch={};for(const k of Object.keys(f.draft))if(f.draft[k]!==f.values[k])patch[k]=f.draft[k];
 busy(e.currentTarget,async()=>{try{await call('save',id,patch);f.values={...f.draft};f.key='';toast('Saved. '+appOf(id).name+' uses them when it next opens.');}catch(err){toast(err.message,true);}});});
$('reveal').addEventListener('click',()=>act('reveal',page));
$('remove').addEventListener('click',e=>perform(page,'uninstall',e.currentTarget));

// ---------- Activity ----------
const KIND_ICON={install:'download',update:'refresh',reinstall:'wrench',remove:'trash',settings:'sliders',check:'check',manager:'grid',error:'alert'};
const FILTERS={all:()=>true,updates:a=>['install','update','reinstall','remove','manager'].includes(a.kind),settings:a=>a.kind==='settings',problems:a=>a.kind==='error'};
let activityKey='';
function renderActivity(){const items=state.activity.filter(FILTERS[filter]),key=filter+JSON.stringify(items.map(a=>a.at+a.message))+Math.floor(Date.now()/60000);if(key===activityKey)return;activityKey=key;
 $('clear-activity').disabled=!state.activity.length;
 $('activity').replaceChildren(...(items.length?items.map(a=>el('div',{class:'event '+a.kind},el('span',{class:'event-icon'},icon(KIND_ICON[a.kind]||'grid')),el('div',{class:'grow'},el('p',{},a.message),el('small',{class:'muted'},when(a.at))),a.app?el('img',{class:'event-app',src:'assets/'+(appOf(a.app)?.icon||'app-manager.svg'),alt:''}):null)):[el('div',{class:'empty'},icon('history'),el('p',{},filter==='all'?'Nothing yet. Installs, updates and settings changes will show up here.':'Nothing to show here.'))]));}
for(const b of $$('#activity-filter button'))b.addEventListener('click',()=>{filter=b.dataset.filter;for(const x of $$('#activity-filter button'))x.setAttribute('aria-pressed',String(x===b));renderActivity();});
$('clear-activity').addEventListener('click',async()=>{if(await confirmed({title:'Clear the activity history?',text:'This only clears the list. Nothing is installed or removed.',icon:'history',confirm:'Clear history'}))act('clear-activity');});

// ---------- App Manager's settings ----------
function renderPreferences(){const p=state.preferences,m=state.manager;
 for(const sw of $$('[data-pref]'))sw.setAttribute('aria-checked',String(!!p[sw.dataset.pref]));
 for(const b of $$('[data-theme]'))b.setAttribute('aria-pressed',String(p.theme===b.dataset.theme));
 setText('background-label',state.platform==='darwin'?'Keep running in the menu bar':'Keep running in the system tray');
 setText('about-version','Version '+state.version+(state.build?' (build '+state.build+')':'')+' for '+(state.platform==='darwin'?'macOS':'Windows'));
 setText('self-text',m.status==='downloading'?'Downloading the update… '+m.progress+'%':m.status==='installing'?'Installing. App Manager reopens by itself.':m.status==='error'?m.error:m.update?'Version '+short(m.latest.version)+' is ready. It installs in place and reopens App Manager.':state.checkedAt?'App Manager is up to date.':'');
 $('self-text').classList.toggle('bad',m.status==='error');
 showIf('self-update',m.update&&m.status!=='installing');const b=$('self-update');if(!b.classList.contains('working'))b.disabled=m.status==='downloading';
 showIf('self-progress',m.status==='downloading');$('self-progress').firstElementChild.style.transform='scaleX('+(m.progress||0)/100+')';}
for(const sw of $$('[data-pref]'))sw.addEventListener('click',()=>act('preference',sw.dataset.pref,!state.preferences[sw.dataset.pref]));
for(const b of $$('[data-theme]'))b.addEventListener('click',()=>act('preference','theme',b.dataset.theme));
$('self-update').addEventListener('click',async e=>{const b=e.currentTarget;if(await confirmed({title:'Update App Manager to '+short(state.manager.latest.version)+'?',text:'It downloads and checks the update, then closes and reopens by itself. Your apps aren’t touched.',icon:'download',confirm:'Update and reopen'}))busy(b,()=>act('manager-update'));});
$('open-downloads').addEventListener('click',()=>act('website','downloads'));

// ---------- The dock: what's happening now ----------
function renderDock(){const op=state.operation,dock=$('dock');showIf(dock,!!op);if(!op)return;const a=appOf(op.id);
 $('dock-icon').src='assets/'+a.icon;
 setText('dock-title',{preparing:'Getting ready…',waiting:'Waiting for you to quit '+a.name,downloading:(op.kind==='install'?'Installing ':op.kind==='reinstall'?'Reinstalling ':'Updating ')+a.name,installing:op.kind==='uninstall'?'Removing '+a.name:'Installing '+a.name,removing:'Removing '+a.name}[op.phase]||a.name);
 setText('dock-text',op.phase==='waiting'?'It starts as soon as you quit it.':op.phase==='downloading'?mb(op.received)+' of '+mb(op.total)+(op.speed?' · '+mb(op.speed)+'/s':''):op.phase==='installing'?'Checking and installing…':'');
 const bar=$('dock-bar');bar.classList.toggle('indeterminate',op.phase!=='downloading');bar.firstElementChild.style.transform=op.phase==='downloading'&&op.total?'scaleX('+op.received/op.total+')':'';
 setText('dock-queue',state.queue.length?'Then: '+state.queue.map(j=>appOf(j.id)?.name).join(', '):'');
 showIf('dock-cancel',!!op.cancellable);}
$('dock-cancel').addEventListener('click',()=>act('cancel',state.operation?.id));

// ---------- Pages ----------
function go(id){const pages=['overview','browser','network','activity','settings'];if(!pages.includes(id))return;if(page!==id){page=id;$('main').scrollTo(0,0);}if(['browser','network'].includes(id))loadSettings(id);render();}
for(const b of $$('[data-page]'))b.addEventListener('click',()=>go(b.dataset.page));
for(const b of $$('[data-go]'))b.addEventListener('click',()=>go(b.dataset.go));
api.onNavigate(go);
$('check').addEventListener('click',()=>{act('check');});
$('update-all').addEventListener('click',e=>busy(e.currentTarget,()=>act('update-all')));
$('error-dismiss').addEventListener('click',()=>showIf('error',false));

// ---------- Keeping the page up to date ----------
function render(){if(!state)return;
 document.body.dataset.platform=state.platform;
 const pageId=['browser','network'].includes(page)?'app':page;
 for(const p of $$('[data-page-id]'))showIf(p,p.dataset.pageId===pageId);
 for(const b of $$('.nav')){if(b.dataset.page===page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
 const updates=state.apps.filter(a=>a.update).length;showIf('nav-updates',updates>0);setText('nav-updates',updates);
 for(const a of state.apps){const dot=document.querySelector('[data-dot="'+a.id+'"]');dot.className='state-dot '+status(a).tone+(a.installed?'':' absent');}
 const ts=$('title-status');showIf(ts,state.checking||!!state.operation);setText(ts.lastElementChild,state.operation?'Working…':'Checking for updates…');
 showIf('self-card',state.manager.update);setText('self-card-text',state.manager.update?'Version '+short(state.manager.latest.version)+' is ready':'');
 setText('side-version','App Manager '+state.version);
 if(page==='overview')renderOverview();else if(pageId==='app')renderApp(page);else if(page==='activity')renderActivity();else if(page==='settings')renderPreferences();
 renderDock();}
function receive(incoming){const before=state;state=incoming;
 // Reload an app's settings after it closes, installs or updates.
 for(const a of state.apps){const was=before?.apps.find(x=>x.id===a.id);if(forms[a.id]&&was&&(was.running!==a.running||was.installed?.version!==a.installed?.version))forms[a.id].schema=null;}
 if(['browser','network'].includes(page)&&!forms[page]?.schema)loadSettings(page);
 render();}
setInterval(()=>{if(page==='activity')renderActivity();else if(page==='overview'&&state?.checkedAt)setText('checked',state.checking?'Checking downloads.hngroup.org.uk…':'Last checked '+when(state.checkedAt).toLowerCase());},30000);
api.onState(receive);
call('state').then(s=>{if(!state)receive(s);}).catch(e=>toast(e.message,true));
