'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.join(__dirname,'..');
const port=async()=>{const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const ready=async url=>{for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,70));}throw Error('Service not ready');};
test('HR editor saves and reopens multiple same-company appointments with independent temporary status',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-appointment-browser-'));process.env.DATA_DIR=dir;const store=require('./lib/store');store.init(dir);
 const make=(name,title,manager)=>{const p=store.saveEmployee({firstName:name,lastName:'Fixture',company:'HN Group',jobTitle:title,discordId:'123456789012345678',emails:[{local:name.toLowerCase(),domain:'hngroup.org.uk',primary:true}]});store.issueTemporaryPassword(p);store.setPassword(p,'Fixture-password-582!');store.setCode(p,'582947');if(manager){const role=store.saveRole({name:'Appointment manager',permissions:['staff.manage']});store.setRoleMembers(role,[p.id]);}return p;};
 const manager=make('Manager','Board Director',true),person=make('Jamie','Board Member');
 const [a,b,c]=await Promise.all([port(),port(),port()]),backend='http://127.0.0.1:'+a,base='http://127.0.0.1:'+b,hr='http://127.0.0.1:'+c,env={...process.env,DATA_DIR:dir,STATUS_SSO_SECRET_FILE:path.join(dir,'absent-secret'),PRIVATE_STAFF_BACKEND:backend,HR_ORIGIN:hr};
 const children=[['staff-portal/server.js',a],['staff-portal/public-proxy.js',b],['hr-site/server.js',c]].map(([file,n])=>spawn(process.execPath,[file],{cwd:root,env:{...env,PORT:String(n)},stdio:['ignore','ignore','inherit']}));let browser;
 const post=(p,data,cookie='')=>fetch(base+p,{method:'POST',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(data)});
 try{
  await Promise.all([ready(backend+'/healthz'),ready(base+'/healthz'),ready(hr+'/healthz')]);const flow=await(await post('/api/login',{username:manager.emails[0].address,password:'Fixture-password-582!'})).json(),done=await post('/api/login/code',{challenge:flow.challenge,code:'582947'});assert.equal(done.status,200);const cookie=done.headers.getSetCookie().find(x=>x.startsWith('hn_staff_session=')).split(';')[0];
  const {chromium}=require('../browser-app/node_modules/playwright');browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});const ctx=await browser.newContext({viewport:{width:1440,height:1000}});await ctx.addCookies([{name:'hn_staff_session',value:cookie.split('=')[1],url:base}]);const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(hr+'/employees');await page.locator('[data-id="'+person.id+'"] [data-act=edit]').last().click();await page.locator('#f-title').waitFor();assert.equal(await page.getByText(person.employeeNumber,{exact:true}).count()>0,true);
  await page.locator('#f-other').click();await page.locator('.role-title').selectOption('Chief Operating Officer');await page.locator('.role-temporary').check();await page.locator('#f-other').click();await page.locator('.role-title').nth(1).selectOption('Chief Executive Officer');assert.equal(await page.locator('.role-temporary').nth(1).isChecked(),false);
  fs.mkdirSync(path.join(root,'.test-results'),{recursive:true});await page.screenshot({path:path.join(root,'.test-results/staff-appointments-editor.png'),fullPage:true});
  await page.locator('#f-submit').click();await page.locator('.modal-backdrop').waitFor({state:'detached'});
  const getRecords=async()=>{const r=await fetch(hr+'/api/employees',{headers:{Cookie:cookie}});assert.equal(r.status,200);return r.json();};const response=await getRecords();const records=response.employees||response.people;assert.ok(records,JSON.stringify(Object.keys(response)));const saved=records.find(x=>x.id===person.id);assert.equal(saved.otherRoles.length,2);assert.equal(saved.otherRoles[0].company,'HN Group');assert.equal(saved.otherRoles[0].temporary,true);assert.equal(saved.otherRoles[1].temporary,false);assert.equal(saved.temporary,false);assert.equal(saved.employeeNumber,person.employeeNumber);
  await page.locator('[data-id="'+person.id+'"] [data-act=edit]').last().click();await page.locator('.role-title').first().waitFor();assert.equal(await page.locator('.role-title').count(),2);assert.equal(await page.locator('.role-temporary').first().isChecked(),true);assert.equal(await page.locator('.role-title').nth(1).inputValue(),'Chief Executive Officer');await page.keyboard.press('Escape');
  await page.goto(base+'/directory');await page.getByText('Chief Operating Officer',{exact:true}).first().waitFor();await page.getByText('Chief Executive Officer',{exact:true}).first().waitFor();await page.goto(hr+'/job-descriptions');await page.locator('#jd-positions').click();
  const networkPositions=page.locator('.pos-company[data-company="Horizon Network"]');
  await networkPositions.locator('[data-pos="Board Chairman"] [data-move="1"]').click();
  await page.waitForFunction(()=>document.querySelector('.pos-company[data-company="Horizon Network"] li')?.dataset.pos==='Board Director');
  const overflow=await networkPositions.evaluate(el=>el.scrollWidth>el.clientWidth+1);assert.equal(overflow,false,'Position controls fit the manager');
  await page.screenshot({path:path.join(root,'.test-results/staff-positions-manager.png'),fullPage:true});await page.keyboard.press('Escape');
  const hrPost=(url,body)=>fetch(hr+url,{method:'POST',headers:{Cookie:cookie,Origin:hr,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const pos=await(await fetch(hr+'/api/positions',{headers:{Cookie:cookie}})).json(),order=pos.positions['Horizon Network'].slice().reverse();
  const reordered=await hrPost('/api/positions/reorder',{company:'Horizon Network',titles:order});assert.equal(reordered.status,200);assert.deepEqual((await reordered.json()).positions['Horizon Network'],order);
  const report=await hrPost('/api/positions/reports',{company:'Horizon Network',title:'President',reportsTo:{company:'Horizon Network',title:'Board of Horizon Network',kind:'board'}});assert.equal(report.status,200);
  const off=await hrPost('/api/employees/'+person.id+'/offboard',{});assert.equal(off.status,200);
  assert.ok(!(await getRecords()).employees.some(p=>p.id===person.id));
  const archive=await(await fetch(hr+'/api/employees?view=offboarded',{headers:{Cookie:cookie}})).json();assert.equal(archive.employees[0].employeeNumber,person.employeeNumber);assert.equal(archive.employees[0].account.enabled,false);
  await page.goto(hr+'/employees?view=offboarded');await page.getByRole('heading',{name:'Offboarded employees',exact:true}).waitFor();assert.match(await page.locator('#view').innerText(),/Jamie Fixture/);
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{if(browser)await browser.close();for(const c of children)c.kill('SIGTERM');await Promise.all(children.map(c=>new Promise(r=>c.exitCode!==null?r():c.once('exit',r))));require('./lib/badges').reset();fs.rmSync(dir,{recursive:true,force:true});}
});
