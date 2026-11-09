'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('../browser-app/node_modules/playwright');
test('linked documents have source-aware downloads and no portal delete/share controls; changes refresh automatically',async()=>{
 const source=fs.readFileSync(__dirname+'/public/assets/app.js','utf8');
 const code=source.slice(source.indexOf('    async function viewStaffFiles('),source.indexOf('    function openStaffUpload('));
 const files=[{id:'local',title:'HR upload',ext:'pdf',inline:true,shared:true,uploadedAt:'2026-11-09'},
 {id:'docs-1',title:'Letter',ext:'pdf',inline:true,linked:'documents',source:'Docs',sourceId:'document-id',uploadedAt:'2026-11-09'},
 {id:'contract-1',title:'Agreement',ext:'pdf',inline:true,linked:'contracts',source:'Contracts',sourceId:'contract-id',status:'completed',uploadedAt:'2026-11-09'}];
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
 try{const p=await b.newPage();await p.clock.install();await p.setContent('<main id="root" style="max-width:1100px;margin:32px auto;padding:0 16px"></main>');await p.addStyleTag({path:__dirname+'/public/assets/style.css'});await p.addScriptTag({path:__dirname+'/public/assets/hn-theme.js'});
 await p.addScriptTag({content:`const state={me:{id:'person'}},d=${JSON.stringify({person:{id:'person',displayName:'Person'},files,canManage:true,people:[],unavailable:[]})};const api=async()=>d,$=s=>document.querySelector(s),icon=()=>'',fileBadge=()=>'',esc=s=>String(s||''),fileSize=()=>'',fmtDate=x=>x;window.redraws=0;const render=()=>window.redraws++;${code};viewStaffFiles(document.getElementById('root'),()=>true);`});
 await p.locator('.sf-row').first().waitFor();assert.equal(await p.locator('[data-sf-del]').count(),1,'only the portal upload can be removed here');
 assert.equal(await p.locator('[data-file="docs-1"] a').first().getAttribute('href'),'/api/staff-files/linked/documents/document-id/file?person=person');
 assert.equal(await p.locator('[data-file="contract-1"] a').last().getAttribute('href'),'/api/staff-files/linked/contracts/contract-id/file?person=person&download');
 assert.equal(await p.locator('.sf-source').count(),3);
 assert.equal(await p.locator('.sf-source-contracts [data-file="contract-1"]').count(),1);
 assert.equal(await p.locator('.sf-source-docs [data-file="docs-1"]').count(),1);
 assert.equal(await p.locator('.sf-source-uploads [data-sf-del]').count(),1);
 assert.equal(await p.locator('.sf-status-completed').textContent(),'Signed');
 await p.setViewportSize({width:1440,height:1100});
 await p.screenshot({path:'/tmp/hn-document-sections.png'});
 for(const width of [1440,390]) {await p.setViewportSize({width,height:1100});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false,'document sections fit at '+width);}
 await p.evaluate(()=>d.files.pop());await p.clock.runFor(20000);assert.equal(await p.evaluate(()=>window.redraws),1,'a source deletion triggers an automatic redraw');
 }finally{await b.close();}
});
