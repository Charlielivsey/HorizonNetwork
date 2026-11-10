'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.join(__dirname,'..');
const port=async()=>{const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const cookie=(r,n)=>(r.headers.getSetCookie().find(c=>c.startsWith(n+'='))||'').split(';')[0];
const ready=async u=>{for(let i=0;i<100;i++){try{if((await fetch(u)).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Not ready: '+u);};
test('HR migration preserves tool permissions, records, session refresh and old routes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-hr-migration-'));
 process.env.DATA_DIR=dir;
 const store=require('../staff-portal/lib/store');store.init(dir);
 const make=(first,local)=>{const p=store.saveEmployee({firstName:first,lastName:'Fixture',displayName:first,company:'HN Group',jobTitle:'Analyst',discordId:first==='Manager'?'123456789012345678':'223456789012345678',emails:[{local,domain:'hngroup.org.uk',primary:true}]});store.issueTemporaryPassword(p);store.setPassword(p,'Fixture-password-582!');store.setCode(p,'582947');return p;};
 const manager=make('Manager','hr.manager'),employee=make('Employee','hr.employee');
 store.setRoleMembers(store.listRoles().find(r=>r.name==='Super Admin'),[manager.id]);
 const secret=path.join(dir,'secret');fs.writeFileSync(secret,'f'.repeat(64));
 const [staffPort,authPort,hrPort,proxyPort,accountsPort]=await Promise.all([port(),port(),port(),port(),port()]);
 const staff='http://127.0.0.1:'+staffPort,auth='http://127.0.0.1:'+authPort,hr='http://127.0.0.1:'+hrPort,proxy='http://127.0.0.1:'+proxyPort,accounts='http://127.0.0.1:'+accountsPort;
 const sources=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({documents:[],files:[],contracts:[]}));});await new Promise(r=>sources.listen(0,'127.0.0.1',r));
 const sourcesUrl='http://127.0.0.1:'+sources.address().port;
 const common={...process.env,DATA_DIR:dir,STATUS_SSO_SECRET_FILE:secret,AUTH_BACKEND:auth,STAFF_PORTAL_BACKEND:staff,PRIVATE_STAFF_BACKEND:staff,HR_ORIGIN:hr,ACCOUNTS_ORIGIN:accounts,STAFF_BACKEND:staff,DOCS_BACKEND:sourcesUrl,CONTRACTS_BACKEND:sourcesUrl};
 const children=[];const launch=(file,p)=>{const child=spawn(process.execPath,[file],{cwd:root,env:{...common,PORT:String(p)},stdio:['ignore','ignore','inherit']});children.push(child);return child;};
 launch('staff-portal/server.js',staffPort);launch('auth-site/server.js',authPort);launch('hr-site/server.js',hrPort);launch('staff-portal/public-proxy.js',proxyPort);launch('accounts-site/server.js',accountsPort);
 const post=(base,p,body,c='',origin=base)=>fetch(base+p,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:c},body:JSON.stringify(body),redirect:'manual'});
 async function signIn(local,next="/home"){
  const start=await fetch(hr+'/auth/start?next='+encodeURIComponent(next),{redirect:'manual'}),to=new URL(start.headers.get('location')),state=to.searchParams.get('state');assert.equal(to.searchParams.get('client_id'),'hr');
  const login=await post(auth,'/api/login',{username:local+'@hngroup.org.uk',password:'Fixture-password-582!'},'','https://auth.hngroup.org.uk');assert.equal(login.status,200,await login.clone().text());
  const verified=await post(auth,'/api/login/code',{code:'582947'},cookie(login,'__Host-hn_auth_flow'),'https://auth.hngroup.org.uk');assert.equal(verified.status,200,await verified.clone().text());
  const grant=await post(auth,'/api/continue',{client_id:'hr',state},cookie(verified,'__Host-hn_auth_session'),'https://auth.hngroup.org.uk');assert.equal(grant.status,200,await grant.clone().text());
  const back=new URL((await grant.json()).redirect),done=await fetch(hr+back.pathname+back.search,{headers:{Cookie:cookie(start,'hn_staff_auth_state')},redirect:'manual'});assert.equal(done.status,302);assert.equal(done.headers.get('location'),next);
  const c=cookie(done,'hn_staff_session');assert.ok(c);assert.ok(done.headers.getSetCookie().every(x=>!x.includes('Domain=')));return c;
 }
 const get=(base,p,c='')=>fetch(base+p,{headers:{Cookie:c},redirect:'manual'});
 try{
  await Promise.all([ready(staff+'/healthz'),ready(auth+'/healthz'),ready(hr+'/healthz'),ready(proxy+'/healthz'),ready(accounts+'/healthz')]);
  assert.equal((await get(hr,'/api/me')).status,401);
  assert.equal((await get(hr,'/reviews?person=test')).headers.get('location'),'/login?next=%2Freviews%3Fperson%3Dtest');
  const managerCookie=await signIn('hr.manager','/employees?source=link'),employeeCookie=await signIn('hr.employee','/jobs');

  const paths=['/leave','/rotas','/reviews','/objectives','/feedback','/flexible','/exit-interview','/exit-interviews','/staff-files','/training','/cases','/employees','/onboarding','/jobs','/job-descriptions'];
  for(const p of paths){
   const old=await get(proxy,p+'?person='+employee.id+'&year=2026');assert.equal(old.status,302);assert.equal(old.headers.get('location'),'https://hr.hngroup.org.uk'+p+'?person='+employee.id+'&year=2026');
   assert.equal((await get(proxy,'/api'+p,managerCookie)).status,410);
   const response=await get(hr,'/api'+p,managerCookie);assert.equal(response.status,200,p+': '+await response.clone().text());
   const html=await(await get(hr,p,managerCookie)).text();assert.match(html,/data-hn-app="hr"/);assert.doesNotMatch(html,/<aside class="deprecation-banner"/);
  }
  for(const p of ['/cases','/exit-interviews','/employees','/onboarding'])assert.equal((await get(hr,'/api'+p,employeeCookie)).status,403,p);
  for(const p of ['/api/system','/api/roles','/api/logins','/api/payroll','/api/directory','/api/leavesecrets'])assert.equal((await get(hr,p,managerCookie)).status,404,p);
  assert.equal((await get(hr,'/api/timesheets/mine',employeeCookie)).status,200);
  const forbidden=await post(hr,'/api/rotas/copy-week',{from:'2026-11-02',to:'2026-11-09'},employeeCookie);assert.equal(forbidden.status,403);
  const privateReview=await get(hr,'/api/reviews/person/'+manager.id,employeeCookie);assert.equal(privateReview.status,404);
  const goal=await post(hr,'/api/objectives',{personId:employee.id,title:'Migration fixture goal',quarter:'2026-Q4'},employeeCookie);assert.equal(goal.status,201,await goal.clone().text());
  const goalId=(await(await get(hr,'/api/objectives?quarter=2026-Q4',employeeCookie)).json()).objectives[0].id;
  assert.equal((await post(hr,'/api/objectives/'+goalId+'/progress',{progress:35,status:'on-track',note:'Fixture update'},employeeCookie)).status,200);
  const badOrigin=await post(hr,'/api/objectives',{title:'Must not be written'},employeeCookie,'https://evil.test');assert.equal(badOrigin.status,403);
  assert.equal((await post(hr,'/api/me/theme',{theme:'light'},employeeCookie)).status,200);
  const upload=await fetch(hr+'/api/staff-files/upload',{method:'POST',headers:{Origin:hr,Cookie:managerCookie,'Content-Type':'application/octet-stream','X-Document':encodeURIComponent(JSON.stringify({personId:employee.id,title:'Migration letter',category:'Other',shared:true,fileName:'letter.txt'}))},body:'Fixture HR letter'});assert.equal(upload.status,201,await upload.clone().text());
  const files=await(await get(hr,'/api/staff-files',employeeCookie)).json();const letter=files.files.find(f=>f.title==='Migration letter');assert.ok(letter,'employee can see shared letter');assert.equal((await get(hr,'/api/staff-files/'+letter.id+'/file',employeeCookie)).status,200);
  // People management, Positions and descriptions use their original handlers and permissions.
  assert.equal((await post(hr,'/api/positions',{company:'HN Group',title:'Fixture Recruit'},employeeCookie)).status,403);
  assert.equal((await post(hr,'/api/positions',{company:'HN Group',title:'Fixture Recruit'},managerCookie)).status,200);
  const description=await post(hr,'/api/job-descriptions',{role:'Fixture Recruit',company:'HN Group',reportsTo:'Board Chairman',description:'Fixture duties',authority:'Fixture authority'},managerCookie);assert.equal(description.status,200,await description.clone().text());
  assert.equal((await post(hr,'/api/job-descriptions',{role:'Fixture Recruit'},employeeCookie)).status,403);
  const personInput={firstName:'New',lastName:'Person',displayName:'New Person',company:'HN Group',jobTitle:'Fixture Recruit',discordId:'323456789012345678',temporary:true,emails:[{local:'hr.new.person',domain:'hngroup.org.uk',primary:true}]};
  assert.equal((await post(hr,'/api/employees',personInput,employeeCookie)).status,403);
  const created=await post(hr,'/api/employees',personInput,managerCookie);assert.equal(created.status,201,await created.clone().text());const personId=(await created.json()).employee.id;
  assert.equal((await post(hr,'/api/employees/'+personId,{...personInput,displayName:'Updated Person'},managerCookie)).status,200);
  assert.equal((await post(hr,'/api/employees/'+personId+'/permanent',{},managerCookie)).status,200);
  const handoff=await post(hr,'/api/accounts-handoff',{next:'/#staff/create/'+personId},managerCookie);assert.equal(handoff.status,200);const accountUrl=new URL((await handoff.json()).url);assert.equal(accountUrl.searchParams.get('return'),'/#staff/create/'+personId);
  const accountSession=await get(accounts,accountUrl.pathname+accountUrl.search);assert.equal(accountSession.status,302);assert.equal(accountSession.headers.get('location'),'/#staff/create/'+personId);
  const accountCookie=cookie(accountSession,'hn_account');assert.ok(accountCookie);assert.equal((await get(accounts,'/api/me',accountCookie)).status,200,'HN Account handoff signs in without another password');
  const usedTicket=await get(accounts,accountUrl.pathname+accountUrl.search);assert.match(usedTicket.headers.get('location'),/^\/auth\/login\?return=/,'ticket is single use');
  assert.equal((await post(hr,'/api/accounts-handoff',{next:'/#staff/create/'+personId},managerCookie,'https://evil.test')).status,403);
  // Recruitment receives staff applications, referrals and the existing public Careers applications.
  assert.equal((await post(hr,'/api/jobs',{title:'Forbidden'},employeeCookie)).status,403);
  const vacancy=await post(hr,'/api/jobs',{title:'Migration vacancy',company:'HN Group',description:'Fixture role',publicListing:true},managerCookie);assert.equal(vacancy.status,201);
  const vacancies=(await(await get(hr,'/api/jobs',managerCookie)).json()).vacancies;const vacancyId=vacancies.find(v=>v.title==='Migration vacancy').id;
  const uploadMeta=(base,p,header,meta,c='')=>fetch(base+p,{method:'POST',headers:{Origin:base,Cookie:c,'Content-Type':'application/octet-stream',[header]:encodeURIComponent(JSON.stringify(meta))},body:''});
  assert.equal((await uploadMeta(hr,'/api/jobs/'+vacancyId+'/apply','X-Applicant',{self:true},employeeCookie)).status,201);
  assert.equal((await uploadMeta(hr,'/api/jobs/'+vacancyId+'/apply','X-Applicant',{name:'Referral Candidate',email:'referral@example.test'},employeeCookie)).status,201);
  const publicJobs=await(await get(proxy,'/api/public/jobs')).json();assert.ok(publicJobs.jobs.some(v=>v.id===vacancyId));
  const publicApply=await uploadMeta(proxy,'/api/public/jobs/'+vacancyId+'/apply','X-Application',{name:'Public Candidate',email:'public@example.test'});assert.equal(publicApply.status,201,await publicApply.clone().text());const reference=(await publicApply.json()).reference;assert.ok(reference);
  assert.equal((await post(proxy,'/api/public/jobs/application',{reference})).status,200);
  const applicants=(await(await get(hr,'/api/jobs',managerCookie)).json()).vacancies.find(v=>v.id===vacancyId).applicants;assert.deepEqual(applicants.map(a=>a.source).sort(),['internal','referral','website']);
  const referral=applicants.find(a=>a.source==='referral');assert.equal((await post(hr,'/api/jobs/applicants/'+referral.id+'/stage',{stage:'interview'},employeeCookie)).status,403);
  assert.equal((await post(hr,'/api/jobs/applicants/'+referral.id+'/stage',{stage:'interview'},managerCookie)).status,200);
  const hired=await post(hr,'/api/jobs/applicants/'+referral.id+'/hire',{firstName:'Referral',lastName:'Candidate',company:'HN Group',jobTitle:'Fixture Recruit',closeVacancy:false},managerCookie);assert.equal(hired.status,200,await hired.clone().text());const hiredId=(await hired.json()).personId;
  assert.equal((await post(hr,'/api/employees/'+hiredId+'/discord',{discordId:'423456789012345678'},managerCookie)).status,200);
  // Staff can complete only their own assigned checklist tasks; HR retains templates and leaver actions.
  const template=await post(hr,'/api/onboarding/templates',{name:'Migration starter',kind:'starter',tasks:[{title:'Personal fixture task',owner:'employee'},{title:'HR fixture task',owner:'hr'}]},managerCookie);assert.equal(template.status,200,await template.clone().text());
  const templateId=(await(await get(hr,'/api/onboarding',managerCookie)).json()).templates.find(t=>t.name==='Migration starter').id;
  assert.equal((await post(hr,'/api/onboarding/start',{personId:employee.id,templateId},employeeCookie)).status,403);
  assert.equal((await post(hr,'/api/onboarding/start',{personId:employee.id,templateId},managerCookie)).status,201);
  const ownChecklist=(await(await get(hr,'/api/onboarding/mine',employeeCookie)).json()).checklists.find(c=>c.name==='Migration starter');assert.ok(ownChecklist);
  const ownTask=ownChecklist.tasks.find(t=>t.owner==='employee'),hrTask=ownChecklist.tasks.find(t=>t.owner==='hr');
  assert.equal((await post(hr,'/api/onboarding/'+ownChecklist.id+'/task',{taskId:ownTask.id,done:true},employeeCookie)).status,200);
  assert.equal((await post(hr,'/api/onboarding/'+ownChecklist.id+'/task',{taskId:hrTask.id,done:true},employeeCookie)).status,400);
  assert.equal((await get(proxy,'/api/onboarding/mine',employeeCookie)).status,410);
  const leaverTemplate=(await(await get(hr,'/api/onboarding',managerCookie)).json()).templates.find(t=>t.kind==='leaver');
  assert.equal((await post(hr,'/api/onboarding/start',{personId,templateId:leaverTemplate.id,lastDay:'2026-12-31'},managerCookie)).status,201);
  assert.ok((await(await get(hr,'/api/onboarding',managerCookie)).json()).checklists.some(c=>c.person.id===personId&&c.kind==='leaver'&&c.lastDay==='2026-12-31'));
  assert.equal((await get(proxy,'/api/roles',managerCookie)).status,200,'roles remain available on the portal');
  assert.equal((await get(proxy,'/roles',managerCookie)).status,200);
  const oldBackend=children[0];await new Promise(r=>{oldBackend.once('exit',r);oldBackend.kill();});launch('staff-portal/server.js',staffPort);await ready(staff+'/healthz');
  assert.equal((await get(hr,'/api/me',employeeCookie)).status,200,'HR sign-in survives backend restart');
  assert.equal((await get(hr,'/home',employeeCookie)).status,200,'refresh retains sign-in');
  assert.equal((await(await get(hr,'/api/objectives?quarter=2026-Q4',employeeCookie)).json()).objectives[0].progress,35,'same data survives restart');
  assert.equal((await(await get(hr,'/api/employees',managerCookie)).json()).employees.find(p=>p.id===personId).displayName,'Updated Person');
  assert.ok((await(await get(hr,'/api/jobs',managerCookie)).json()).vacancies.find(v=>v.id===vacancyId).applicants.some(a=>a.stage==='hired'));
  assert.ok((await(await get(hr,'/api/onboarding/mine',employeeCookie)).json()).checklists.find(c=>c.id===ownChecklist.id).tasks.find(t=>t.id===ownTask.id).doneAt);
  if(process.env.HN_HR_BROWSER==='1'){
   const {chromium}=require('../browser-app/node_modules/playwright');const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
   try{
    for(const [role,c] of [['manager',managerCookie],['employee',employeeCookie]]){
     const context=await browser.newContext({viewport:{width:1365,height:1000}});await context.addCookies([{name:'hn_staff_session',value:c.split('=')[1],url:hr}]);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
     await page.goto(hr+'/home');await page.waitForSelector('#view h1');assert.match(await page.locator('#view').innerText(),/HN Group HR/);
     assert.equal(await page.locator('#view a[href="/employees"]').count(),role==='manager'?1:0);if(role==='employee'){await page.locator('#hr-onboarding').filter({hasText:'Your joiner'}).waitFor();const task=page.locator('#hr-onboarding [data-task="'+ownTask.id+'"]');assert.equal(await task.isChecked(),true);const [updated]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/onboarding/'+ownChecklist.id+'/task')&&r.request().method()==='POST'),task.locator('..').locator('.cl-box').click()]);assert.equal(updated.status(),200);await page.waitForFunction(()=>document.querySelector('#hr-onboarding input[data-task]').checked===false);}
     assert.equal(await page.locator('#view a[href="/cases"]').count(),role==='manager'?1:0);
     assert.equal(await page.locator('#view a[href="https://finance.hngroup.org.uk/"]').count(),1);
     for(const route of role==='manager'?paths:paths.filter(p=>!['/cases','/exit-interviews','/employees','/onboarding'].includes(p))){await page.goto(hr+route);await page.waitForSelector('#view h1, #view .empty-page h2');assert.doesNotMatch(await page.locator('#view').innerText(),/Not found|Server error|undefined|Something went wrong/);}
     await page.goto(hr+'/home');await page.waitForSelector('#view h1');await page.locator('#search-btn').click();await page.locator('#sp-q').fill('goals');await page.getByRole('button',{name:'Goals Page'}).click();await page.waitForSelector('#ob-new');assert.equal(new URL(page.url()).pathname,'/objectives');
     await page.goto(hr+'/leave?tab=extra&year=2026');await page.waitForSelector('#lv-tabs [data-tab="extra"].active');
     await page.goto(hr+'/rotas?tab=timesheet&week=2026-11-02');await page.waitForSelector('#rt-tabs [data-tab="timesheet"].active');
     await page.goto(hr+'/home');await page.waitForSelector('#view h1');await page.reload();await page.waitForSelector('#view h1');
     fs.mkdirSync(path.join(__dirname,'.test-results'),{recursive:true});await page.screenshot({path:path.join(__dirname,'.test-results/hr-'+role+'.png'),fullPage:true});
     await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(__dirname,'.test-results/hr-'+role+'-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await context.close();
    }
    // The existing portal session remains valid; the HR tab disappears while search links remain usable.
    const context=await browser.newContext();await context.addCookies([{name:'hn_staff_session',value:managerCookie.split('=')[1],url:proxy}]);const page=await context.newPage();await page.goto(proxy+'/home');await page.waitForSelector('#view h1');assert.equal(await page.locator('#mainnav button').filter({hasText:/^HR$/}).count(),0);assert.equal(await page.locator('.deprecation-banner').count(),fs.readFileSync(path.join(root,'staff-portal/public/app.html'),'utf8').includes('<aside class="deprecation-banner"')?1:0);assert.equal(await page.locator('#home-onboarding').count(),0);
    for(const p of ['/employees','/jobs','/onboarding','/job-descriptions'])assert.equal(await page.locator('#mainnav a[href="'+p+'"]').count(),0,p);
    assert.equal(await page.locator('#mainnav a[href="/roles"]').count(),1);
    await page.locator('#search-btn').click();await page.locator('#sp-q').fill('Goals');await page.waitForSelector('.sp-item');await page.getByRole('button',{name:'Goals Page'}).waitFor();await context.close();
   }finally{await browser.close();}
  }
  assert.equal((await post(hr,'/api/logout',{},employeeCookie)).status,200);assert.equal((await get(hr,'/api/me',employeeCookie)).status,401);assert.equal((await get(hr,'/api/me',managerCookie)).status,200);
 }finally{await Promise.all(children.filter(c=>c.exitCode===null).map(c=>new Promise(r=>{c.once('exit',r);c.kill();})));await new Promise(r=>sources.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
