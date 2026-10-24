'use strict';
// "This device is not authorised": explains why, shows the code to add this computer with, and opens the app
// by itself once devices.hngroup.org.uk approves it.
const $=id=>document.getElementById(id),api=window.hnDevice;
const COPY={
 unknown:['Checking this computer…','Checking with HN Group whether this computer may use HN Group apps.'],
 unlinked:['This device is not authorised','HN Group apps only work on computers HN Group has approved. Add this one to your account with this code.'],
 pending:['Waiting for approval','This computer has been added{owner}. It opens by itself as soon as an HN Group administrator approves it.'],
 revoked:['This device is not authorised','This computer’s access to HN Group apps was revoked. If you think that’s a mistake, contact HN Group.'],
 mismatch:['This device is not authorised','This computer is using an identity copied from another computer. An HN Group administrator needs to approve this computer before HN Group apps can be used.'],
 authorised:['This computer is approved','Opening…'],
};
function render(s){if(!s)return;const[title,text]=COPY[s.status]||COPY.unknown;
 $('app-name').textContent=s.appName||'HN Group';document.title=s.appName?s.appName+' · '+title:title;
 $('title').textContent=s.offline&&s.status==='unknown'?'Can’t check this computer':title;
 $('text').textContent=s.offline&&s.status==='unknown'?'HN Group Devices can’t be reached, and this computer hasn’t been approved before. Check your internet connection, then try again.':text.replace('{owner}',s.owner?' by '+s.owner.displayName:'');
 $('code-box').hidden=!(s.status==='unlinked'&&s.code);$('code').textContent=s.code||'';$('steps').hidden=s.status!=='unlinked';
 $('open').hidden=!['unlinked','pending','unknown'].includes(s.status)&&!s.offline;
 document.body.dataset.status=s.status;
 $('status').textContent=s.offline&&s.status!=='unknown'?'Couldn’t reach HN Group Devices just now. It keeps trying.':s.checkedAt?'Checked '+new Date(s.checkedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})+'. It checks again by itself.':'';}
$('check').addEventListener('click',async()=>{const b=$('check');b.disabled=true;b.classList.add('working');try{render(await api.check());}finally{b.disabled=false;b.classList.remove('working');}});
$('open').addEventListener('click',()=>api.open());
$('quit').addEventListener('click',()=>api.quit());
api.onChange(render);
api.state().then(render);
