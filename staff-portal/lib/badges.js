'use strict';
// Issued identities are immutable snapshots. Only this staff-data process writes the register.
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
let dir, file, photos, options, state;
const MANAGE='badges.manage';
const fail=(status,message)=>{const e=new Error(message);e.status=status;throw e;};
const id=()=>crypto.randomBytes(12).toString('hex');
const fullName=p=>[p.firstName,p.lastName].filter(Boolean).join(' ').trim();
const version=p=>p.avatar ? String(p.avatar.ext)+':'+String(p.avatar.version||'') : '';
function save(next){const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(next,null,2),{mode:0o600});fs.renameSync(tmp,file);state=next;}
function reset(){state=null;options=null;}
function init(dataDir,config){
 dir=dataDir;file=path.join(dir,'staff-badges.json');photos=path.join(dir,'badge-photos');options=config;
 fs.mkdirSync(photos,{recursive:true,mode:0o700});
 state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,issues:[],pending:[]};
 if(state.version!==1||!Array.isArray(state.issues)||!Array.isArray(state.pending))throw Error('Invalid staff badge register; existing data has been preserved.');
 sync();
}
function current(personId){return state.issues.find(x=>x.personId===personId&&x.status==='current')||null;}
function photoOf(p){
 let source;try{source=options.avatarFile(p);}catch{return null;}
 if(!source||!/^image\/(png|jpeg|gif|webp)$/.test(source.mime))return null;
 try{const stat=fs.statSync(source.file);if(!stat.isFile()||stat.size===0||stat.size>2*1024*1024)return null;}catch{return null;}
 return source;
}
function issue(p,next,actor,createdFiles){
 const source=photoOf(p);if(!source)return null;
 const badgeId=id(), ext=source.mime==='image/jpeg'?'jpg':source.mime.split('/')[1];
 const target=path.join(photos,badgeId+'.'+ext);
 fs.writeFileSync(target,fs.readFileSync(source.file),{mode:0o600,flag:'wx'});createdFiles.push(target);
 const older=next.issues.filter(x=>x.personId===p.id);
 for(const old of older)if(old.status==='current')old.status='superseded';
 const record={id:badgeId,personId:p.id,number:p.employeeNumber,issue:older.reduce((n,x)=>Math.max(n,x.issue),0)+1,status:'current',firstName:p.firstName,lastName:p.lastName,fullName:fullName(p),company:p.company||'HN Group',issuedAt:new Date().toISOString(),issuedBy:actor||'System',photo:{ext,mime:source.mime},sourcePhotoVersion:version(p)};
 next.issues.push(record);next.pending=next.pending.filter(x=>x.personId!==p.id);return record;
}
function transaction(fn){
 const next=structuredClone(state), created=[];
 try{const result=fn(next,created);save(next);return result;}catch(error){for(const name of created)fs.rmSync(name,{force:true});throw error;}
}
function sync(){
 if(!state||!options)return;
 const people=options.employees().filter(p=>!p.system);
 const missing=people.filter(p=>!current(p.id));
 if(!missing.some(p=>photoOf(p)||!state.pending.some(x=>x.personId===p.id)))return;
 transaction((next,created)=>{
  for(const p of missing){
   const made=issue(p,next,'System',created);
   if(!made&&!next.pending.some(x=>x.personId===p.id))next.pending.push({personId:p.id,requestedAt:new Date().toISOString()});
  }
 });
}
function metadata(p){
 const badge=current(p.id), hasPhoto=!!photoOf(p);
 return {personId:p.id,recordName:fullName(p),company:p.company,employeeNumber:p.employeeNumber,hasPhoto,pending:!badge,changed:!!badge&&(badge.fullName!==fullName(p)||badge.company!==p.company||badge.sourcePhotoVersion!==version(p)),badge:badge?{id:badge.id,number:badge.number,issue:badge.issue,status:badge.status,fullName:badge.fullName,company:badge.company,issuedAt:badge.issuedAt,artworkUrl:'/api/badges/'+badge.id+'/artwork.svg'}:null};
}
function mine(personId){sync();const p=options.employees().find(p=>p.id===personId&&!p.system);return p?metadata(p):null;}
function list(){sync();return options.employees().filter(p=>!p.system).map(metadata).sort((a,b)=>a.recordName.localeCompare(b.recordName));}
function reissue(input,actor){
 if(!input||!['all','selected'].includes(input.scope))fail(400,'Choose all staff or selected staff.');
 const people=options.employees().filter(p=>!p.system);
 let selected;
 if(input.scope==='all'){
  if(input.personIds!==undefined)fail(400,'An all-staff request must not contain a selection.');
  selected=people;
 }else{
  if(!Array.isArray(input.personIds)||!input.personIds.length||input.personIds.length>5000)fail(400,'Select at least one member of staff.');
  const ids=[...new Set(input.personIds)];
  if(ids.some(x=>typeof x!=='string'||!people.some(p=>p.id===x)))fail(400,'The selection contains a staff record that is no longer available. Refresh and try again.');
  selected=ids.map(x=>people.find(p=>p.id===x));
 }
 const skipped=selected.filter(p=>!photoOf(p)).map(p=>({personId:p.id,name:fullName(p),reason:'No profile picture is available.'}));
 const ready=selected.filter(p=>photoOf(p));
 if(!ready.length)fail(400,'A profile picture is needed before these badges can be issued.');
 const issued=transaction((next,created)=>ready.map(p=>issue(p,next,actor,created)));
 return {issued:issued.map(x=>({personId:x.personId,badgeId:x.id,issue:x.issue})),skipped};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function nameLines(name){
 const chars=s=>Array.from(new Intl.Segmenter('en',{granularity:'grapheme'}).segment(s),x=>x.segment);
 const width=s=>chars(s).reduce((n,c)=>n+(/[^\u0000-\u024f]/u.test(c)?1.1:/[MW@]/.test(c)?.95:/[ilI .,']/ .test(c)?.32:.65),0);
 for(const size of [60,56,52,48,43,39,35,31,27,23,19,15]){
  let lines=[],line='';
  for(const paragraph of String(name).split('\n')){
   for(const word of paragraph.split(/\s+/)){
    if(line&&width(line+' '+word)*size>444){lines.push(line);line='';}
    for(const c of chars(word)){if(width(line+c)*size>444){lines.push(line);line='';}line+=c;}
    line+=' ';
   }
   if(line.trim())lines.push(line.trim());line='';
  }
  if(lines.length*size*1.22<=190)return {size,lines:lines.map(x=>x.trim())};
 }
 return {size:15,lines:[String(name).slice(0,45),'…']};
}
function getIssue(badgeId){return state.issues.find(x=>x.id===badgeId)||null;}
let logo, font;
function artwork(badgeId){
 const badge=state.issues.find(x=>x.id===badgeId);if(!badge)return null;
 if(!logo)logo=fs.readFileSync(path.join(__dirname,'../public/assets/brand/hn-group-wordmark.svg')).toString('base64');
 if(!font)font=fs.readFileSync(path.join(__dirname,'../public/assets/fonts/plus-jakarta-sans.woff2')).toString('base64');
 const photo=fs.readFileSync(path.join(photos,badge.id+'.'+badge.photo.ext)).toString('base64');
 const name=nameLines(badge.firstName+'\n'+badge.lastName);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="54mm" height="85.6mm" viewBox="0 0 540 856" role="img" aria-label="${esc(badge.fullName)} staff badge"><title>${esc(badge.fullName)} — HN Group staff badge</title><defs><style>@font-face{font-family:BadgeJakarta;src:url(data:font/woff2;base64,${font}) format('woff2')}text{font-family:BadgeJakarta,Arial,sans-serif}</style><pattern id="shield-weave" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M0 9Q9 -5 18 9Q9 23 0 9M9 0Q-5 9 9 18Q23 9 9 0" fill="none" stroke="#b8b6bc" stroke-width=".65"/></pattern><clipPath id="card"><rect width="540" height="856" rx="20"/></clipPath><clipPath id="photo"><rect x="48" y="330" width="180" height="222" rx="5"/></clipPath></defs><g clip-path="url(#card)"><rect width="540" height="856" fill="#fff"/><g fill="#f5f3f7"><path d="M0 252h24v125H0zM510 340h30v145h-30zM0 640h25v145H0zM470 656h70v22h-70z"/><path d="M330 465h80v80h-80zM375 510h95v22h-95z" opacity=".7"/></g><rect x="126" y="0" width="106" height="17" fill="#E3E65B"/><text x="48" y="118" font-size="${name.size}" font-weight="700" fill="#1a1a1a">${name.lines.map((line,i)=>`<tspan x="48" dy="${i?name.size*1.22:0}">${esc(line)}</tspan>`).join('')}</text><image x="48" y="330" width="180" height="222" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)" xlink:href="data:${badge.photo.mime};base64,${photo}"/><rect x="324" y="334" width="108" height="24" fill="#5514B4"/><rect x="412" y="394" width="128" height="24" fill="#E97DE8"/><rect x="286" y="581" width="196" height="24" fill="#3E9BA3"/><text x="48" y="610" font-size="21" font-weight="600" letter-spacing="1" fill="#1a1a1a">${esc(badge.number)}</text><text x="48" y="640" font-size="14" fill="#706579">${esc(badge.company)}</text><g id="badge-shield" aria-label="Decorative shield"><rect x="338" y="604" width="140" height="128" rx="10" fill="#f0eef1"/><rect x="338" y="604" width="140" height="128" rx="10" fill="url(#shield-weave)"/><path d="M408 622l43 16v32c0 26-20 42-43 51-23-9-43-25-43-51v-32z" fill="#d1cfd6" stroke="#aaa6b2" stroke-width="3"/><path d="M408 634l31 12v24c0 18-13 31-31 39-18-8-31-21-31-39v-24z" fill="none" stroke="#e9e7ec" stroke-width="3"/></g><rect x="0" y="790" width="176" height="24" fill="#C2306B"/><image x="238" y="752" width="258" height="91" xlink:href="data:image/svg+xml;base64,${logo}"/>${badge.status!=='current'?'<g transform="translate(270 430) rotate(-25)"><rect x="-270" y="-35" width="540" height="70" fill="#ffffff" fill-opacity=".95"/><text text-anchor="middle" y="12" font-size="33" font-weight="700" fill="#a2344b">SUPERSEDED</text></g>':''}</g></svg>`;
 return {badge,body:Buffer.from(svg)};
}
module.exports={MANAGE,init,reset,getIssue,sync,mine,list,reissue,artwork,nameLines};
