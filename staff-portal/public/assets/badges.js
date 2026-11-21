/* Staff badge views. Issued artwork comes only from the authenticated snapshot API. */
(function(){
'use strict';
const date=s=>new Date(s).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
async function render(root,ctx,manage){
 const {api,esc,icon,toast,openModal,closeModal,current}=ctx;
 // Keep the portal's section tabs outside the area refreshed by live updates.
 const panel=document.createElement('div');root.replaceChildren(panel);root=panel;
 let rows=[],selected=new Set(),search='',filter='all';
 const button=(text,attr='',primary=false)=>'<button type="button" class="btn '+(primary?'btn-primary':'btn-ghost')+'" '+attr+'>'+text+'</button>';
 const preview=b=>'<img class="staff-badge-art" src="'+esc(b.artworkUrl)+'" alt="Issued staff badge for '+esc(b.fullName)+'">';
 function exports(el,b){
  el.querySelector('[data-png]')?.addEventListener('click',async e=>{
   const btn=e.currentTarget;btn.disabled=true;
   try{const image=new Image();image.src=b.artworkUrl;await image.decode();const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1712;canvas.getContext('2d').drawImage(image,0,0,1080,1712);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(!blob)throw Error('Unable to export this badge.');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=b.number+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){toast(error.message);}finally{btn.disabled=false;}
  });
  el.querySelector('[data-print]')?.addEventListener('click',()=>{
   const win=window.open('','_blank','width=520,height=840');if(!win){toast('Allow pop-ups to print your badge.');return;}
   win.document.write('<!doctype html><html><head><title>'+esc(b.number)+'</title><style>@page{size:54mm 85.6mm;margin:0}body{margin:0;background:white}img{display:block;width:54mm;height:85.6mm}</style></head><body><img alt="Staff badge" src="'+esc(new URL(b.artworkUrl,location.origin).href)+'"></body></html>');win.document.close();const img=win.document.querySelector('img');img.addEventListener('load',()=>{win.focus();win.print();},{once:true});
  });
 }
 function details(row){const b=row.badge;return '<div class="staff-badge-detail"><span class="staff-badge-eyebrow">ISSUED IDENTITY</span><h2>'+esc(b.fullName)+'</h2><p>'+esc(b.company)+'</p><dl><div><dt>Employee number</dt><dd>'+esc(b.number)+'</dd></div><div><dt>Issue</dt><dd>'+b.issue+'</dd></div></dl>'+(row.changed?'<p class="staff-badge-notice">Your staff details have changed since this badge was issued. Ask a badge administrator to reissue it.</p>':'')+'<p>The name and photo are saved at issue. Updating your profile won’t change this badge.</p><div class="staff-badge-actions">'+button('Download PNG','data-png',true)+button('Print badge','data-print')+'<a class="btn btn-ghost" href="'+esc(b.artworkUrl)+'?download=1">Download SVG</a></div></div>';}
 function show(row){if(!row.badge)return;const m=openModal('<h2>Staff badge</h2><div class="staff-badge-personal">'+preview(row.badge)+details(row)+'</div>',{wide:true,cls:'staff-badge-dialog'});exports(m.el,row.badge);}
 function confirmIssue(scope,ids){
  const targets=scope==='all'?rows:rows.filter(r=>ids.includes(r.personId)),ready=targets.filter(r=>r.hasPhoto);
  const m=openModal('<span class="staff-badge-eyebrow">REISSUE STAFF BADGES</span><h2>Issue '+ready.length+' new badge'+(ready.length===1?'':'s')+'?</h2><p>Each new badge will use the person’s current full name and profile picture. Previous issues will be marked superseded.</p><ul class="staff-badge-confirm-list">'+targets.map(r=>'<li>'+esc(r.recordName)+(r.hasPhoto?'':' <span>— waiting for a profile picture</span>')+'</li>').join('')+'</ul><p class="staff-badge-error" role="alert"></p><div class="staff-badge-actions">'+button('Cancel','data-cancel')+button('Reissue '+(scope==='all'?'all':'selected')+' badges','data-confirm',true)+'</div>',{cls:'staff-badge-dialog'});
  m.el.querySelector('[data-cancel]').onclick=closeModal;const submit=m.el.querySelector('[data-confirm]');submit.disabled=!ready.length;
  submit.onclick=async()=>{submit.disabled=true;submit.textContent='Issuing…';try{const result=await api('/api/badges/reissue',scope==='all'?{scope}:{scope,personIds:ids});closeModal();selected.clear();await load();toast(result.issued.length+' badge'+(result.issued.length===1?'':'s')+' issued.'+(result.skipped.length?' '+result.skipped.length+' waiting for a profile picture.':''));}catch(error){m.el.querySelector('[role=alert]').textContent=error.message;submit.disabled=false;submit.textContent='Try again';}};
 }
 function personal(row){root.innerHTML='<section class="staff-badges"><header><span class="staff-badge-eyebrow">STAFF BADGES</span><h1>My staff badge</h1><p>Your HN Group identity, ready to keep or print.</p></header>'+(row?.badge?'<div class="staff-badge-personal">'+preview(row.badge)+details(row)+'</div>':'<div class="staff-badge-empty">'+icon('card')+'<h2>Your badge is waiting for a photo</h2>'+(row?.employeeNumber?'<p>Employee number <strong>'+esc(row.employeeNumber)+'</strong></p>':'')+'<p>Add a profile picture to your HN Account. Your first badge will be issued automatically when the picture reaches your staff profile.</p><a class="btn btn-primary" href="https://accounts.hngroup.org.uk/">Open HN Account</a></div>')+'</section>';if(row?.badge)exports(root,row.badge);}
 function status(r){return !r.badge?'Waiting for photo':r.changed?'Details changed':'Issued';}
 function table(){
  const shown=rows.filter(r=>(r.recordName+' '+r.company+' '+(r.employeeNumber||r.badge?.number||'')).toLowerCase().includes(search.toLowerCase())&&(filter==='all'||(filter==='pending'?r.pending:filter==='changed'?r.changed:!!r.badge)));
  root.querySelector('[data-count]').textContent=shown.length+' of '+rows.length+' staff';
  root.querySelector('[data-selected]').textContent=selected.size+' selected';root.querySelector('[data-reissue-selected]').disabled=!selected.size;
  root.querySelector('[data-rows]').innerHTML=shown.length?shown.map(r=>'<tr><td><input type="checkbox" aria-label="Select '+esc(r.recordName)+'" data-select="'+esc(r.personId)+'" '+(selected.has(r.personId)?'checked ':'')+(!r.hasPhoto?'disabled':'')+'></td><td><strong>'+esc(r.recordName)+'</strong><span>'+esc(r.company)+'</span></td><td><span class="staff-badge-status '+(r.changed?'changed':'')+'">'+status(r)+'</span></td><td>'+(r.badge?esc(r.badge.number)+'<span>Issue '+r.badge.issue+'</span>':esc(r.employeeNumber||'—'))+'</td><td><div class="staff-badge-row-actions">'+(r.badge?button('View','data-view="'+r.personId+'"'):'')+button('Reissue','data-reissue="'+r.personId+'" '+(!r.hasPhoto?'disabled':''))+'</div></td></tr>').join(''):'<tr><td colspan="5"><p>No staff match your search.</p></td></tr>';
  const all=root.querySelector('[data-select-visible]'),eligible=shown.filter(r=>r.hasPhoto);all.checked=!!eligible.length&&eligible.every(r=>selected.has(r.personId));all.indeterminate=eligible.some(r=>selected.has(r.personId))&&!all.checked;all.disabled=!eligible.length;
  all.onchange=()=>{for(const r of eligible)if(all.checked)selected.add(r.personId);else selected.delete(r.personId);table();};
 }
 function management(){root.innerHTML='<section class="staff-badges"><header><span class="staff-badge-eyebrow">STAFF BADGES</span><h1>Manage staff badges</h1><p>View issued identities and keep your staff badges up to date.</p></header><div class="staff-badge-summary"><div><strong data-stat-issued>'+rows.filter(r=>r.badge).length+'</strong><span>Issued badges</span></div><div><strong data-stat-changed>'+rows.filter(r=>r.changed).length+'</strong><span>Details changed</span></div><div><strong data-stat-pending>'+rows.filter(r=>r.pending).length+'</strong><span>Waiting for a photo</span></div></div><div class="staff-badge-toolbar"><label>Find a member of staff<input data-search type="search" placeholder="Name, company or employee number" value="'+esc(search)+'"></label><label>Show<select data-filter><option value="all">All staff</option><option value="issued">Issued</option><option value="changed">Details changed</option><option value="pending">Waiting for photo</option></select></label>'+button('Reissue all badges','data-reissue-all')+'</div><div class="staff-badge-selection"><span data-count></span><span data-selected></span>'+button('Reissue selected','data-reissue-selected',true)+'</div><div class="staff-badge-table"><table><thead><tr><th><input type="checkbox" data-select-visible aria-label="Select visible staff"></th><th>Staff member</th><th>Status</th><th>Current badge</th><th>Actions</th></tr></thead><tbody data-rows></tbody></table></div><p class="staff-badge-footnote">New staff receive a badge automatically once a profile picture is available. Reissuing saves a new copy of their current name and photo.</p></section>';
  root.querySelector('[data-filter]').value=filter;root.querySelector('[data-search]').oninput=e=>{search=e.target.value;table();};root.querySelector('[data-filter]').onchange=e=>{filter=e.target.value;table();};root.querySelector('[data-reissue-all]').onclick=()=>confirmIssue('all');root.querySelector('[data-reissue-selected]').onclick=()=>confirmIssue('selected',[...selected]);
  root.querySelector('[data-rows]').onchange=e=>{const id=e.target.dataset.select;if(!id)return;if(e.target.checked)selected.add(id);else selected.delete(id);table();};
  root.querySelector('[data-rows]').onclick=e=>{const b=e.target.closest('[data-view],[data-reissue]');if(!b)return;const id=b.dataset.view||b.dataset.reissue;if(b.dataset.view)show(rows.find(r=>r.personId===id));else confirmIssue('selected',[id]);};table();
 }
 async function load(){
  const data=await api(manage?'/api/badges':'/api/badges/me');if(!current()||!root.isConnected)return;
  if(manage){
   if(JSON.stringify(rows)===JSON.stringify(data.badges)&&root.querySelector('[data-rows]')){table();return;}
   rows=data.badges;selected=new Set([...selected].filter(id=>rows.some(r=>r.personId===id&&r.hasPhoto)));
   if(root.querySelector('[data-rows]')){for(const [key,fn] of [['issued',r=>r.badge],['changed',r=>r.changed],['pending',r=>r.pending]])root.querySelector('[data-stat-'+key+']').textContent=rows.filter(fn).length;table();}else management();
  }else{if(root.dataset.snapshot!==JSON.stringify(data.staffBadge)){personal(data.staffBadge);root.dataset.snapshot=JSON.stringify(data.staffBadge);}}
 }
 await load();ctx.setLiveRefresh(load);
}
window.HNBadges={render};
})();
