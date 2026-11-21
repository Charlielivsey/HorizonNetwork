'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.join(__dirname,'..');
const port=async()=>{const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const n=s.address().port;await new Promise(r=>s.close(r));return n;};
const ready=async url=>{for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,60));}throw Error('Service not ready');};
test('portal only accepts submissions; HR cases keep team/owner permissions, records and desktop access',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-hr-request-cases-'));process.env.DATA_DIR=dir;
 const store=require('./lib/store'),desk=require('./lib/helpdesk');store.init(dir);desk.init(dir);
 const make=(name,permissions=[])=>{const p=store.saveEmployee({firstName:name,lastName:'Fixture',displayName:name,company:'HN Group',jobTitle:'Member',discordId:'123456789012345678',emails:[{local:name.toLowerCase(),domain:'hngroup.org.uk',primary:true}]});store.issueTemporaryPassword(p);store.setPassword(p,'Fixture-password-582!');store.setCode(p,'582947');if(permissions.length){const role=store.saveRole({name:name+' role',permissions});store.setRoleMembers(role,[p.id]);}return p;};
 const requester=make('Requester'),hr=make('HrHandler',['requests.hr']),it=make('ItHandler',['helpdesk.manage']),other=make('Other'),recordManager=make('RecordManager',['cases.manage']);
 const legacy=desk.createTicket(requester,{subject:'Existing IT ticket',body:'Keep history',category:'hardware'});
 const [a,b,c]=await Promise.all([port(),port(),port()]);const backend='http://127.0.0.1:'+a,portal='http://127.0.0.1:'+b,hrBase='http://127.0.0.1:'+c;
 const env={...process.env,DATA_DIR:dir,STATUS_SSO_SECRET_FILE:path.join(dir,'absent-secret'),PRIVATE_STAFF_BACKEND:backend,HR_ORIGIN:hrBase};const children=[];
 for(const [file,n]of[['staff-portal/server.js',a],['staff-portal/public-proxy.js',b],['hr-site/server.js',c]])children.push(spawn(process.execPath,[file],{cwd:root,env:{...env,PORT:String(n)},stdio:['ignore','ignore','inherit']}));
 const get=(base,p,cookie='',headers={})=>fetch(base+p,{headers:{Cookie:cookie,...headers},redirect:'manual'});
 const post=(base,p,data,cookie='')=>fetch(base+p,{method:'POST',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(data),redirect:'manual'});
 const signIn=async person=>{const r=await post(portal,'/api/login',{username:person.emails[0].address,password:'Fixture-password-582!'});assert.equal(r.status,200);const flow=await r.json(),done=await post(portal,'/api/login/code',{challenge:flow.challenge,code:'582947'});assert.equal(done.status,200);return done.headers.getSetCookie().find(x=>x.startsWith('hn_staff_session=')).split(';')[0];};
 let browser;
 try{
  await Promise.all([ready(backend+'/healthz'),ready(portal+'/healthz'),ready(hrBase+'/healthz')]);const cookies={};for(const person of[requester,hr,it,other,recordManager])cookies[person.id]=await signIn(person);
  const mine=cookies[requester.id];const options=await(await get(portal,'/api/requests/options',mine)).json();assert.equal(Object.keys(options.teams).length,4);assert.equal(options.tickets,undefined);assert.equal(options.agents,undefined);
  const r=await post(portal,'/api/helpdesk',{team:'hr',company:'Horizon Network',subject:'Private HR case',body:'Sensitive details',category:'concern'},mine);assert.equal(r.status,201);const receipt=await r.json();assert.equal(receipt.receipt.team,'hr');assert.equal(receipt.ticket,undefined);assert.equal(receipt.receipt.id,undefined);
  const persisted=JSON.parse(fs.readFileSync(path.join(dir,'helpdesk.json')));const ticket=persisted.tickets.find(x=>x.team==='hr');assert.ok(ticket);assert.ok(persisted.tickets.some(x=>x.id===legacy.id));
  for(const cookie of Object.values(cookies))for(const endpoint of ['/api/helpdesk','/api/helpdesk/'+ticket.id,'/api/hr-requests','/api/cases']){
   assert.equal((await get(portal,endpoint,cookie,{'x-hn-hr-app':'1'})).status,410,'Staff refuses '+endpoint);
  }
  assert.equal((await get(backend,'/api/cases',mine)).status,410);assert.equal((await post(portal,'/api/helpdesk/'+ticket.id+'/reply',{body:'Forbidden'},mine)).status,410);
  assert.equal((await get(hrBase,'/api/hr-requests')).status,401);
  for(const person of[requester,hr]){const data=await(await get(hrBase,'/api/hr-requests',cookies[person.id])).json();assert.equal(data.tickets.length,1);assert.equal(data.tickets[0].id,ticket.id);}
  for(const person of[it,other,recordManager]){const data=await(await get(hrBase,'/api/hr-requests',cookies[person.id])).json();assert.equal(data.tickets.length,0);assert.equal((await get(hrBase,'/api/hr-requests/'+ticket.id,cookies[person.id])).status,404);}
  assert.equal((await get(hrBase,'/api/hr-requests/'+legacy.id,cookies[it.id])).status,404,'HR endpoint refuses other-team ticket');
  assert.equal((await get(hrBase,'/api/cases',cookies[hr.id])).status,403,'request handlers do not inherit private HR record permission');assert.equal((await get(hrBase,'/api/cases',cookies[recordManager.id])).status,200);
  assert.equal((await post(hrBase,'/api/hr-requests/'+ticket.id+'/reply',{body:'Internal HR note',internal:true},cookies[hr.id])).status,200);assert.doesNotMatch(JSON.stringify(await(await get(hrBase,'/api/hr-requests/'+ticket.id,mine)).json()),/Internal HR note/);
  assert.equal((await post(hrBase,'/api/hr-requests/'+ticket.id+'/reply',{body:'HR response'},cookies[hr.id])).status,200);assert.equal((await post(hrBase,'/api/hr-requests/'+ticket.id+'/update',{status:'resolved'},cookies[hr.id])).status,200);
  assert.match(JSON.stringify(await(await get(hrBase,'/api/notifications',mine)).json()),/https:\/\/hr.hngroup.org.uk\/cases/);
  const {chromium}=require('../browser-app/node_modules/playwright');browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'hn_staff_session',value:mine.split('=')[1],url:portal}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(portal+'/helpdesk');await page.locator('[data-request-team="hr"]').waitFor();assert.equal(await page.locator('#hd-tabs,#hd-list,.request-history-title').count(),0);assert.equal(await page.locator('.workspace-action-link[href="/helpdesk"]').count(),1);
  await page.locator('[data-request-team="hr"]').click();await page.locator('#request-company').selectOption('Horizon Network');await page.locator('#request-company-form [type=submit]').click();await page.locator('#tk-subject').fill('Browser HR request');await page.screenshot({path:path.join(os.tmpdir(),'hn-request-step-desktop.png')});await page.locator('#tk-body').fill('Desktop submission flow');await page.locator('#tk-form [type=submit]').click();await page.getByRole('heading',{name:'Request sent',exact:true}).waitFor();assert.equal(await page.locator('[data-ticket]').count(),0);await page.waitForTimeout(350);await page.screenshot({path:path.join(os.tmpdir(),'hn-request-sent-desktop.png')});
  await page.goto(hrBase+'/cases');await page.locator('#hd-tabs').waitFor();assert.equal(await page.locator('.workspace-action-link[href="/cases"]').count(),1);assert.equal(await page.locator('[data-cases-tab=records]').count(),0);await page.locator('[data-ticket]').first().click();await page.locator('.modal .tk-thread').waitFor();await page.locator('html[data-live-updates=connected]').waitFor();
  const casesNow=await(await get(hrBase,'/api/hr-requests',mine)).json();const browserTicket=casesNow.tickets.find(t=>t.subject==='Browser HR request');
  await page.locator('#tk-reply-text').fill('Unsaved reply must stay here');
  assert.equal((await post(hrBase,'/api/hr-requests/'+browserTicket.id+'/reply',{body:'Live incoming HR reply'},cookies[hr.id])).status,200);
  await page.locator('.tk-thread').getByText('Live incoming HR reply',{exact:true}).waitFor({timeout:10000});assert.equal(await page.locator('#tk-reply-text').inputValue(),'Unsaved reply must stay here');
  await page.screenshot({path:path.join(os.tmpdir(),'hn-hr-conversation-desktop.png')});
  await page.route('**/api/live',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary test outage'})}),{times:1});
  assert.equal((await post(hrBase,'/api/hr-requests/'+browserTicket.id+'/update',{priority:'urgent'},cookies[hr.id])).status,200);
  await page.locator('.tk-header').getByText('Urgent',{exact:true}).waitFor({timeout:14000});assert.equal(await page.locator('#tk-reply-text').inputValue(),'Unsaved reply must stay here');
  assert.equal(await page.locator('html').getAttribute('data-live-updates'),'connected');await page.keyboard.press('Escape');
  assert.equal((await post(portal,'/api/helpdesk',{team:'hr',company:'Horizon Network',subject:'Case arriving live',body:'Created while HR queue is open',category:'other'},mine)).status,201);
  await page.getByText('Case arriving live',{exact:true}).waitFor({timeout:10000});
  const staffPage=await context.newPage();await staffPage.goto(portal+'/directory');await staffPage.locator('html[data-live-updates=connected]').waitFor();
  assert.equal((await post(portal,'/api/me/profile',{displayName:'Live Updated Name',location:'London',timezone:'Europe/London'},mine)).status,200);
  await staffPage.getByText('Live Updated Name',{exact:true}).first().waitFor({timeout:10000});await staffPage.close();
  fs.mkdirSync(path.join(root,'.test-results'),{recursive:true});await page.waitForTimeout(700);await page.screenshot({path:path.join(root,'.test-results/hr-request-cases-desktop.png')});assert.deepEqual(errors,[]);await context.close();
 }finally{if(browser)await browser.close();for(const child of children)child.kill('SIGTERM');await Promise.all(children.map(child=>new Promise(r=>child.exitCode!==null?r():child.once('exit',r))));fs.rmSync(dir,{recursive:true,force:true});}
});
