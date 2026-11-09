'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('../browser-app/node_modules/playwright');
test('Jobs search filters existing cards without losing applications or recruiter controls',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'public/assets/app.js'),'utf8');
 const code=source.slice(source.indexOf('    async function viewJobs('),source.indexOf('    function openVacancyForm('));
 const vacancies=[['1','Developer','Horizon Development','Build software'],['2','Support Manager','Horizon Advertising','Client enquiries'],['3','Technical Support Representative','Horizon Development','Troubleshoot software']].map(([id,title,company,description])=>({id,title,company,description,open:true,status:'open',applicants:[]}));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.setContent('<main id="root"></main><style>[hidden]{display:none!important}</style>');
 await page.addScriptTag({content:`const state={me:{system:false}},data=${JSON.stringify({vacancies,canManage:true,companies:['Horizon Development','Horizon Advertising'],stages:{applied:'Applied',screening:'Screening',interview:'Interview',offer:'Offer',hired:'Hired'}})};const api=async()=>data,$=(q,r=document)=>r.querySelector(q),icon=()=>'',esc=s=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),richText=esc;function openApplyForm(v,self){window.applied={title:v.title,self};} ${code}; window.renderJobs=()=>viewJobs(document.querySelector('#root'),()=>true); renderJobs();`});
 const visible=()=>page.locator('.job-card:visible').count();await page.locator('#jb-search').waitFor();assert.equal(await visible(),3);
 await page.locator('#jb-search').fill('support');assert.equal(await visible(),2);
 await page.locator('#jb-company').selectOption('Horizon Development');assert.equal(await visible(),1);assert.match(await page.locator('#jb-count').textContent(),/^1 of 3/);
 await page.getByRole('button',{name:'Apply',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.applied),{title:'Technical Support Representative',self:true});
 await page.locator('#jb-search').fill('development software');assert.equal(await visible(),2,'matches words across title, company and description');
 await page.locator('#jb-search').fill('<script>');assert.equal(await visible(),0);assert(await page.locator('#jb-no-results').isVisible());
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();assert.equal(await visible(),3);assert.equal(await page.getByRole('button',{name:'Edit',exact:true}).count(),3);
 await page.locator('#jb-search').fill('developer');await page.evaluate(()=>window.renderJobs());assert.equal(await page.locator('#jb-search').inputValue(),'developer');assert.equal(await visible(),1,'search survives a jobs redraw');
 }finally{await browser.close();}
});
