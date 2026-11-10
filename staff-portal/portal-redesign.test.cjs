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
test('portal workspace uses real Auth, preserves service boundaries and permissions, and works across screens, themes and mobile',async()=>{
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
  const output=path.join(__dirname,'.test-results','portal-redesign');fs.mkdirSync(output,{recursive:true});
  for(const [role,c] of [['manager',managerCookie],['employee',employeeCookie]].filter(([role])=>!process.env.HN_PORTAL_QA_ROLE||process.env.HN_PORTAL_QA_ROLE===role)){
   const context=await browser.newContext({viewport:{width:1440,height:1100}});await context.addCookies([{name:'hn_staff_session',value:c.split('=')[1],url:proxy}]);const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
   if(process.env.HN_PORTAL_QA_STAGED==='1'){
    page.screenshot=async()=>Buffer.alloc(0); // The normal browser pass records the visual review; this pass verifies the isolated index snapshot.
    const staged=name=>require('node:child_process').execFileSync('git',['show',':staff-portal/public/'+name],{cwd:root});
    for(const name of ['app.js','style.css','portal-ui.js','portal-ui.css'])await page.route('**/assets/'+name+'?*',r=>r.fulfill({contentType:name.endsWith('.css')?'text/css':'text/javascript',body:staged('assets/'+name)}));
    await page.route(url=>url.origin===proxy&&!url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/assets/'),async r=>{const response=await r.fetch();await r.fulfill({response,...(response.ok()&&(response.headers()['content-type']||'').startsWith('text/html')?{body:staged('app.html')}: {})});});
   }
   const loaded=new Set();page.on('response',r=>{if(r.ok())loaded.add(new URL(r.url()).pathname)});
   await page.goto(proxy+'/home');await page.locator('.portal-welcome h1').waitFor();await page.getByText('Welcome to your workspace',{exact:true}).waitFor();
   assert.equal(await page.locator('.portal-sidebar a[href="/employees"]').count(),0);assert.equal(await page.locator('.portal-sidebar a[href="https://hr.hngroup.org.uk/"]').count(),1);assert.equal(await page.locator('.portal-sidebar a[href="/roles"]').count(),role==='manager'?1:0);
   assert.equal(await page.locator('.deprecation-banner button').count(),0);assert.ok(await page.locator('.deprecation-banner').isVisible());
   await page.screenshot({path:path.join(output,role+'-home.png'),fullPage:true});await page.reload();await page.locator('.portal-welcome h1').waitFor();
   const routes=role==='employee'?['directory','announcements','helpdesk','settings','chat']:['directory','announcements','calendar','polls','ideas','kudos','questions','wiki','chat','team','mentoring','helpdesk','on-call','status','settings','notifications','about'];
   if(role==='manager')routes.push('roles','reports','enquiries');
   for(const route of routes){console.log(role+' screen: '+route);await page.goto(proxy+'/'+route);await page.waitForFunction(()=>document.querySelector('#view h1')||document.querySelector('#view .chat-layout'));assert.doesNotMatch(await page.locator('#view').innerText(),/This page couldn’t load|undefined|Server error/,'route '+route);
    if(['directory','announcements','helpdesk','settings','chat','calendar','kudos'].includes(route))await page.screenshot({path:path.join(output,role+'-'+route+'.png'),fullPage:true});
   }
   await page.goto(proxy+'/helpdesk');await page.locator('#hd-new').click();await page.locator('.modal').waitFor();assert.ok(await page.getByRole('dialog').isVisible());await page.screenshot({path:path.join(output,role+'-dialog.png')});assert.ok((await page.locator('.modal').boundingBox()).width<=641);
   if(role==='employee'){
    await page.locator('#tk-subject').fill('Portal redesign browser fixture');await page.locator('#tk-body').fill('Checking the live form and original support workflow.');await page.getByRole('button',{name:'Raise ticket',exact:true}).click();await page.getByRole('heading',{name:'Portal redesign browser fixture',exact:true}).waitFor();
    const tickets=await(await get(proxy,'/api/helpdesk',c)).json();assert.ok(tickets.tickets.some(t=>t.subject==='Portal redesign browser fixture'));
   }
   await page.keyboard.press('Escape');assert.equal(await page.locator('.modal').count(),0);
   await page.goto(proxy+'/home');await page.locator('.portal-welcome h1').waitFor();await page.locator('#search-btn').click();await page.locator('#sp-q').fill('calendar');await page.locator('.sp-item').first().waitFor();await page.screenshot({path:path.join(output,role+'-search.png')});await page.keyboard.press('Escape');assert.equal(await page.locator('.search-overlay').count(),0);
   for(const theme of ['light','dusk','midnight']){await post(proxy,'/api/me/theme',{theme},c);await page.reload();await page.locator('.portal-welcome h1').waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),theme==='dusk'?'lavender-dusk':theme);await page.screenshot({path:path.join(output,role+'-'+theme+'.png'),fullPage:true});}
   await page.setViewportSize({width:390,height:844});await page.goto(proxy+'/home');await page.locator('.portal-welcome h1').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,role+'-mobile-home.png'),fullPage:true});
   await page.locator('#nav-toggle').click();assert.ok(await page.locator('#portal-sidebar').isVisible());assert.equal(await page.locator('#portal-sidebar').evaluate(el=>el.inert),false);await page.screenshot({path:path.join(output,role+'-mobile-nav.png')});await page.keyboard.press('Escape');assert.equal(await page.locator('#portal-sidebar').evaluate(el=>el.inert),true);
   for(const route of ['directory','calendar','helpdesk','kudos','settings']){await page.goto(proxy+'/'+route);await page.locator('#view h1').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile '+route);await page.screenshot({path:path.join(output,role+'-mobile-'+route+'.png'),fullPage:true});}
   await page.goto(proxy+'/helpdesk');await page.locator('#hd-new').click();await page.locator('.modal').waitFor();assert.ok((await page.locator('.modal').boundingBox()).width<=390);await page.screenshot({path:path.join(output,role+'-mobile-dialog.png')});await page.keyboard.press('Escape');
   if(role==='employee'){await page.goto(proxy+'/roles');await page.locator('#view h1').waitFor();assert.match(await page.locator('#view').innerText(),/access|permission/i);}
   // A transient startup failure must offer recovery and must not leave a blank shell.
   console.log(role+' startup recovery');await page.route('**/api/me',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"Fixture service unavailable"}'}));await page.goto(proxy+'/home');await page.getByText('This page couldn’t load',{exact:true}).waitFor();await page.unroute('**/api/me');await page.getByRole('button',{name:'Try again',exact:true}).click();await page.locator('.portal-welcome h1').waitFor();
   assert.ok(loaded.has('/assets/portal-ui.css'));assert.ok(loaded.has('/assets/portal-ui.js'));assert.deepEqual(errors,[],role+' browser errors');await context.close();
  }
  console.log('Portal workspace verified for two real Auth identities, retained screens, role checks, sign-in persistence, service boundaries, themes, dialogs/search, mobile navigation and error recovery.');
 }finally{if(browser)await browser.close();await Promise.all(children.filter(c=>c.exitCode===null).map(c=>new Promise(r=>{c.once('exit',r);c.kill();})));fs.rmSync(dir,{recursive:true,force:true});}
});
