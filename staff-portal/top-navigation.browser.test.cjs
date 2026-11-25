'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.join(__dirname,'..');
const port=async()=>{const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const cookie=(r,n)=>(r.headers.getSetCookie().find(c=>c.startsWith(n+'='))||'').split(';')[0];
const ready=async u=>{for(let i=0;i<150;i++){try{if((await fetch(u)).ok)return;}catch{}await new Promise(r=>setTimeout(r,60));}throw Error('Not ready: '+u);};
test('portal workspace does not initialise on HR or Finance',()=>{
 const vm=require('node:vm'),script=fs.readFileSync(path.join(__dirname,'public/assets/portal-ui.js'),'utf8');
 for(const mode of ['hr','finance']){const dataset={hnApp:mode};vm.runInNewContext(script,{document:{documentElement:{dataset}}});assert.deepEqual(dataset,{hnApp:mode});}
});
test('top navigation retains permission-filtered menus, keyboard controls and mobile expansion',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-portal-redesign-'));process.env.DATA_DIR=dir;
 const store=require('./lib/store');store.init(dir);
 const make=(name,local,title,id)=>{const p=store.saveEmployee({firstName:name,lastName:'Fixture',displayName:name,company:'HN Group',jobTitle:title,discordId:id,emails:[{local,domain:'hngroup.org.uk',primary:true}]});store.issueTemporaryPassword(p);store.setPassword(p,'Fixture-password-582!');store.setCode(p,'582947');return p;};
 const manager=make('Jordan','portal.manager','Operations Manager','123456789012345678'),employee=make('Alex','portal.employee','Team Member','223456789012345678');
 store.setRoleMembers(store.listRoles().find(r=>r.name==='Super Admin'),[manager.id]);
 const workplace=require('./lib/workplace');workplace.init(dir);workplace.saveAnnouncement({title:'Welcome to your workspace',body:'A place to connect with colleagues, share ideas and keep up with the latest from HN Group.',pinned:true},manager);
 const secret=path.join(dir,'secret');fs.writeFileSync(secret,'f'.repeat(64));
 const [staffPort,authPort,proxyPort]=await Promise.all([port(),port(),port()]),staff='http://127.0.0.1:'+staffPort,auth='http://127.0.0.1:'+authPort,proxy='http://127.0.0.1:'+proxyPort;
 const env={...process.env,DATA_DIR:dir,STATUS_SSO_SECRET_FILE:secret,AUTH_BACKEND:auth,STAFF_PORTAL_BACKEND:staff,PRIVATE_STAFF_BACKEND:staff};
 const children=[];for(const [file,p] of [['staff-portal/server.js',staffPort],['auth-site/server.js',authPort],['staff-portal/public-proxy.js',proxyPort]])children.push(spawn(process.execPath,[file],{cwd:root,env:{...env,PORT:String(p)},stdio:['ignore','ignore','inherit']}));
 const post=(base,p,body,c='',origin=base)=>fetch(base+p,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:c},body:JSON.stringify(body),redirect:'manual'});
 const get=(base,p,c='')=>fetch(base+p,{headers:{Cookie:c},redirect:'manual'});
 async function signIn(local){const start=await get(proxy,'/auth/start?next=/home'),state=new URL(start.headers.get('location')).searchParams.get('state');
  const login=await post(auth,'/api/login',{username:local+'@hngroup.org.uk',password:'Fixture-password-582!'},'','https://auth.hngroup.org.uk');assert.equal(login.status,200,await login.clone().text());
  const verified=await post(auth,'/api/login/code',{code:'582947'},cookie(login,'__Host-hn_auth_flow'),'https://auth.hngroup.org.uk');assert.equal(verified.status,200,await verified.clone().text());
  const grant=await post(auth,'/api/continue',{client_id:'portal',state},cookie(verified,'__Host-hn_auth_session'),'https://auth.hngroup.org.uk');assert.equal(grant.status,200,await grant.clone().text());
  const back=new URL((await grant.json()).redirect),done=await get(proxy,back.pathname+back.search,cookie(start,'hn_staff_auth_state'));assert.equal(done.status,302);const c=cookie(done,'hn_staff_session');assert.ok(c);return c;
 }
 let browser;
 try{await Promise.all([ready(staff+'/healthz'),ready(auth+'/healthz'),ready(proxy+'/healthz')]);
  const managerCookie=await signIn('portal.manager'),employeeCookie=await signIn('portal.employee');
  assert.equal((await get(proxy,'/api/roles',employeeCookie)).status,403);
  for(const c of [managerCookie,employeeCookie]){assert.equal((await get(proxy,'/home',c)).status,200);assert.equal((await get(proxy,'/home',c)).status,200);assert.equal((await get(proxy,'/api/me',c)).status,200);}
  const {chromium}=require('../browser-app/node_modules/playwright');browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
  const output='/tmp/hn-topnav-preview';fs.mkdirSync(output,{recursive:true});
  for(const [role,c] of [['manager',managerCookie],['employee',employeeCookie]]){
   const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'hn_staff_session',value:c.split('=')[1],url:proxy}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(proxy+'/home');await page.locator('.portal-welcome h1').waitFor();
   assert.equal(await page.locator('#portal-sidebar').isVisible(),false);assert.equal(await page.locator('#mainnav').isVisible(),true);assert.equal(await page.locator('#user-menu .user-btn').isVisible(),true);assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).paddingLeft),'0px');
   const menu=page.locator('#mainnav [data-menu]').first();await menu.focus();await page.keyboard.press('Enter');assert.equal(await menu.getAttribute('aria-expanded'),'true');await page.screenshot({path:path.join(output,role+'-desktop.png'),fullPage:true});await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');
   await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#mainnav').isVisible(),false);await page.locator('#nav-toggle').click();assert.equal(await page.locator('#mainnav').isVisible(),true);assert.equal(await page.locator('#mainnav').evaluate(e=>e.inert),false);await page.screenshot({path:path.join(output,role+'-mobile-nav.png'),fullPage:true});await page.keyboard.press('Escape');assert.equal(await page.locator('#mainnav').isVisible(),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(output,role+'-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);await context.close();
  }
 }finally{if(browser)await browser.close();await Promise.all(children.filter(c=>c.exitCode===null).map(c=>new Promise(r=>{c.once('exit',r);c.kill();})));fs.rmSync(dir,{recursive:true,force:true});}
});
