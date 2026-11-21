/* The Status site is the source of truth; IT never creates a second monitor store. */
(function(){'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={operational:'Operational',degraded:'Running slowly',outage:'Offline',maintenance:'Under maintenance',unknown:'Awaiting a check'};
const date=v=>v?new Date(v).toLocaleString('en-GB'):'Awaiting a check';
async function mount(root,{api,current,icon}){
 root.innerHTML='<div class="page-head"><div><h1>Service status</h1><p class="muted">Every website, incident and maintenance update from HN Group Status. Updates automatically every 15 seconds.</p></div><a class="btn btn-ghost" href="https://status.hngroup.org.uk/">Open Status '+icon('external')+'</a></div><p id="it-status-error" class="notice" hidden role="status"></p><div id="it-status-summary"></div><label class="hr-request-search">'+icon('search')+'<input id="it-status-search" type="search" placeholder="Find a website or service" aria-label="Find a website or service"></label><div id="it-status-services" class="monitor-list"></div><section class="panel" id="it-status-incidents"></section>';
 let data;
 const draw=()=>{
  const services=data.services,issues=services.filter(x=>x.status!=='operational'),outages=issues.filter(x=>x.status==='outage');
  root.querySelector('#it-status-summary').innerHTML='<section class="status-hero '+(outages.length?'sh-down':issues.length?'sh-empty':'sh-up')+'"><span class="sh-icon">'+icon(issues.length?'alert':'check')+'</span><div><h2>'+(!services.length?'No services reported':issues.length?issues.length+' services need attention':'All systems operational')+'</h2><p>'+services.length+' services · Updated '+esc(date(data.updatedAt))+'</p></div></section>';
  const q=root.querySelector('#it-status-search').value.trim().toLowerCase();
  root.querySelector('#it-status-services').innerHTML=services.filter(s=>!q||(s.name+' '+s.host).toLowerCase().includes(q)).map(s=>{
   const state=Object.hasOwn(labels,s.status)?s.status:'unknown';const days=Object.entries(s.days||{}).sort(([a],[b])=>a.localeCompare(b)).slice(-30);
   return '<article class="monitor m-'+(state==='operational'?'up':state==='outage'?'down':'unknown')+'"><div class="mon-head"><span class="mon-dot"></span><div class="mon-name"><strong>'+esc(s.name)+'</strong><span class="muted small">'+esc(s.host||'')+'</span></div><span class="badge">'+labels[state]+'</span></div>'+(s.reason==='switched-off'?'<p class="muted">Switched off using website control.</p>':'')+'<div class="it-status-history" aria-label="Recent daily availability">'+days.map(([day,v])=>'<span class="'+(v.total&&v.ok===v.total?'ok':v.total?'issue':'unknown')+'" title="'+esc(day+': '+(v.total?(v.ok/v.total*100).toFixed(2)+'%':'No checks'))+'"></span>').join('')+'</div><div class="it-status-metrics"><span><small>Recorded uptime</small><strong>'+(Number.isFinite(s.uptime)?s.uptime.toFixed(2)+'%':'—')+'</strong></span><span><small>Response time</small><strong>'+(Number.isFinite(s.latency)?s.latency+' ms':'—')+'</strong></span><span><small>Last checked</small><strong>'+esc(date(s.lastChecked))+'</strong></span></div></article>';
  }).join('') || '<section class="panel"><p>No matching services.</p></section>';
  root.querySelector('#it-status-incidents').innerHTML='<h2>Incidents &amp; maintenance</h2>'+(data.incidents.length?data.incidents.map(i=>'<article class="it-status-incident"><h3>'+esc(i.title)+'</h3><span class="badge">'+esc(i.status)+'</span><p class="muted">'+esc(services.filter(s=>(i.serviceIds||[]).includes(s.id)).map(s=>s.name).join(', '))+'</p>'+(i.updates||[]).map(u=>'<div><small>'+esc(date(u.at))+'</small><p>'+esc(u.message)+'</p></div>').join('')+'</article>').join(''):'<p class="muted">No incidents have been reported.</p>');
 };
 root.querySelector('#it-status-search').oninput=()=>{if(data)draw();};
 async function refresh(){if(!current()||!root.isConnected)return;try{const next=await api('/api/status');if(!current())return;data=next;root.querySelector('#it-status-error').hidden=true;draw();}catch(e){if(!current())return;const error=root.querySelector('#it-status-error');error.textContent=e.message+(data?' Showing the last received information.':'');error.hidden=false;}if(current()&&root.isConnected)setTimeout(refresh,15000);}
 await refresh();
}
window.HNITStatus={mount};
})();
