'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.join(__dirname,'..');
const port=async()=>{const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const cookie=(r,n)=>(r.headers.getSetCookie().find(c=>c.startsWith(n+'='))||'').split(';')[0];
const ready=async u=>{for(let i=0;i<100;i++){try{if((await fetch(u)).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Not ready: '+u);};
test('Finance Auth exchange, persistent separate sessions, original data and payroll permissions',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-finance-'));
 process.env.DATA_DIR=dir;
 const store=require('../staff-portal/lib/store');store.init(dir);
 const make=(first,local)=>{const p=store.saveEmployee({firstName:first,lastName:'Fixture',displayName:first,company:'HN Group',jobTitle:'Analyst',emails:[{local,domain:'hngroup.org.uk',primary:true}]});store.issueTemporaryPassword(p);store.setPassword(p,'Fixture-password-582!');store.setCode(p,'582947');return p;};
 const manager=make('Manager','finance.manager'),employee=make('Employee','finance.employee');
 const {login:guest}=store.createLogin({displayName:'Finance guest',username:'finance.guest@hngroup.org.uk',guest:{sites:['finance']},profiles:[{personId:employee.id,company:'HN Group'}]});
 const guestProfile=store.viewOf(guest,store.loginProfiles(guest)[0]);store.setPassword(guestProfile,'Fixture-password-582!');store.setCode(guestProfile,'582947');
 store.setRoleMembers(store.listRoles().find(r=>r.name==='Super Admin'),[manager.id]);
 const secret=path.join(dir,'secret');fs.writeFileSync(secret,'f'.repeat(64));
 const [staffPort,authPort,financePort,proxyPort]=await Promise.all([port(),port(),port(),port()]);
 const staff='http://127.0.0.1:'+staffPort,auth='http://127.0.0.1:'+authPort,finance='http://127.0.0.1:'+financePort,proxy='http://127.0.0.1:'+proxyPort;
 const common={...process.env,DATA_DIR:dir,STATUS_SSO_SECRET_FILE:secret,AUTH_BACKEND:auth,STAFF_PORTAL_BACKEND:staff,PRIVATE_STAFF_BACKEND:staff,FINANCE_ORIGIN:finance};
 const itPort=await port(),it='http://127.0.0.1:'+itPort;common.IT_ORIGIN=it;
 const children=[];const launch=(file,p)=>{const child=spawn(process.execPath,[file],{cwd:root,env:{...common,PORT:String(p)},stdio:['ignore','ignore','inherit']});children.push(child);return child;};
 launch('staff-portal/server.js',staffPort);launch('auth-site/server.js',authPort);launch('finance-site/server.js',financePort);launch('staff-portal/public-proxy.js',proxyPort);launch('it-site/server.js',itPort);
 const post=(base,p,body,c='',origin=base)=>fetch(base+p,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:c},body:JSON.stringify(body),redirect:'manual'});
 async function signIn(local,base=finance,client='finance'){
  const start=await fetch(base+'/auth/start?next=/home',{redirect:'manual'}),to=new URL(start.headers.get('location')),state=to.searchParams.get('state');assert.equal(to.searchParams.get('client_id'),client);
  const login=await post(auth,'/api/login',{username:local+'@hngroup.org.uk',password:'Fixture-password-582!'},'','https://auth.hngroup.org.uk');assert.equal(login.status,200,await login.clone().text());
  const verified=await post(auth,'/api/login/code',{code:'582947'},cookie(login,'__Host-hn_auth_flow'),'https://auth.hngroup.org.uk');assert.equal(verified.status,200,await verified.clone().text());
  const grant=await post(auth,'/api/continue',{client_id:client,state},cookie(verified,'__Host-hn_auth_session'),'https://auth.hngroup.org.uk');assert.equal(grant.status,200,await grant.clone().text());
  const back=new URL((await grant.json()).redirect),done=await fetch(base+back.pathname+back.search,{headers:{Cookie:cookie(start,'hn_staff_auth_state')},redirect:'manual'});assert.equal(done.status,302);assert.equal(done.headers.get('location'),'/home');
  const c=cookie(done,client==='it'?'hn_it_session':'hn_finance_session');assert.ok(c);assert.ok(done.headers.getSetCookie().every(x=>!x.includes('Domain=')));return c;
 }
 const get=(base,p,c='')=>fetch(base+p,{headers:{Cookie:c},redirect:'manual'});
 try{
  await Promise.all([ready(staff+'/healthz'),ready(auth+'/healthz'),ready(finance+'/healthz'),ready(proxy+'/healthz'),ready(it+'/healthz')]);
  assert.equal((await get(finance,'/api/me')).status,401);
  assert.equal((await get(finance,'/invoices?period=2026-11')).headers.get('location'),'/login?next=%2Finvoices%3Fperiod%3D2026-11');
  const managerCookie=await signIn('finance.manager'),employeeCookie=await signIn('finance.employee'),guestCookie=await signIn('finance.guest');
  const guestMe=await get(finance,'/api/me',guestCookie);assert.equal(guestMe.status,200);assert.equal((await guestMe.json()).user.username,'finance.guest@hngroup.org.uk','Finance keeps the chosen sign-in account and permissions');
  for(const p of ['/payslips','/expenses','/payroll','/funds','/invoices','/bills']){
   const old=await get(proxy,p+'?period=2026-11');assert.equal(old.status,302);assert.equal(old.headers.get('location'),'https://finance.hngroup.org.uk'+p+'?period=2026-11');
   const api=await get(finance,'/api'+p,managerCookie);assert.equal(api.status,200,p+': '+await api.clone().text());
   assert.equal((await get(proxy,'/api'+p,managerCookie)).status,410);
  }
  for(const p of ['/payroll','/funds','/invoices','/bills'])assert.equal((await get(finance,'/api'+p,employeeCookie)).status,403,p);
  assert.deepEqual((await(await get(finance,'/api/payslips',employeeCookie)).json()).payslips,[]);
  assert.equal((await get(finance,'/api/expenses',employeeCookie)).status,200);
  assert.equal((await get(staff,'/api/me',managerCookie.replace('hn_finance_session=','hn_staff_session='))).status,401,'Finance token cannot be reused in the portal');
  assert.equal((await get(finance,'/api/me',managerCookie.replace('hn_finance_session=','hn_staff_session='))).status,401,'Portal cookie cannot authenticate Finance');
  // Existing finance workflows still write to the original service and preserve ownership checks.
  const deposit=await post(finance,'/api/funds/add',{amount:100000,source:'bank',note:'Fixture funding'},managerCookie);assert.equal(deposit.status,200);
  assert.equal((await(await get(finance,'/api/funds',managerCookie)).json()).balances.main,100000);
  const draft=await post(finance,'/api/payroll/payslips',{personId:employee.id,period:'2026-11',payDate:'2026-11-30',payments:[{label:'Salary',amount:1000}]},managerCookie);assert.equal(draft.status,201,await draft.clone().text());const slip=(await draft.json()).payslip;
  assert.equal((await get(finance,'/api/payslips/'+slip.id,employeeCookie)).status,404,'own draft is not published');
  assert.equal((await post(finance,'/api/payroll/settings',{requireApproval:false},managerCookie)).status,200);
  assert.equal((await post(finance,'/api/payroll/payslips/'+slip.id+'/issue',{},managerCookie)).status,200);
  assert.equal((await get(finance,'/api/payslips/'+slip.id,employeeCookie)).status,200,'issued payslip belongs to this employee');
  // Account management remains on the separately scoped IT service.
  const adminCookie=await signIn('finance.manager',it,'it');
  const revoke=await post(it,'/api/logins/'+guest.id,{guest:{sites:['docs']}},adminCookie,it);assert.equal(revoke.status,200,await revoke.clone().text());
  assert.equal((await get(finance,'/api/me',guestCookie)).status,401,'removing the Finance guest grant revokes the live Finance session');
  const oldBackend=children[0];await new Promise(r=>{oldBackend.once('exit',r);oldBackend.kill();});launch('staff-portal/server.js',staffPort);await ready(staff+'/healthz');
  assert.equal((await get(finance,'/api/me',employeeCookie)).status,200,'Finance session survives backend restart');
  assert.equal((await get(finance,'/api/payslips/'+slip.id,employeeCookie)).status,200,'original financial records survive restart');
  const html=await(await get(finance,'/home',employeeCookie)).text();assert.match(html,/HN Group Finance/);assert.match(html,/data-hn-app="finance"/);
  assert.equal((await get(finance,'/home',employeeCookie)).status,200,'refresh keeps the session');
  assert.equal((await get(finance,'/api/system',managerCookie)).status,404);
  const live=await get(finance,'/api/live',employeeCookie);assert.equal(live.status,200);assert.match((await live.json()).revision,/^[a-f0-9]{64}$/);
  assert.equal((await get(finance,'/api/live')).status,401);
  assert.equal((await post(finance,'/api/funds/add',{amount:25,source:'other',description:'Fixture income'},managerCookie,'https://evil.test')).status,403);
  const theme=await post(finance,'/api/me/theme',{theme:'light'},employeeCookie);assert.equal(theme.status,200);assert.match(theme.headers.get('set-cookie'),/hn_theme=light/);
  if(process.env.HN_FINANCE_BROWSER==='1'){
   const {chromium}=require('../browser-app/node_modules/playwright');const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
   try{
    for(const [role,c] of [['manager',managerCookie],['employee',employeeCookie]]){
     const context=await browser.newContext({viewport:{width:1365,height:1000}});await context.addCookies([{name:'hn_finance_session',value:c.split('=')[1],url:finance}]);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
     page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(25000);
     await page.goto(finance+'/');await page.getByRole('heading',{name:'HN Group Finance',exact:true}).waitFor();await page.locator('.finance-summary[aria-busy=false]').waitFor();assert.equal(new URL(page.url()).pathname,'/home');assert.equal(new URL(page.url()).origin,finance);
     assert.equal(await page.locator('#finance-sidebar').count(),1);assert.equal(await page.locator('#finance-account-menu').isVisible(),false);assert.equal(await page.locator('#finance-sidebar a[href="/home?section=company"]').count(),role==='manager'?1:0);
     await page.locator('#finance-account-button').click();assert.equal(await page.locator('#finance-account-menu').isVisible(),true);await page.locator('#finance-account-button').click();await page.waitForTimeout(200);assert.equal(await page.locator('#finance-account-menu').isVisible(),false);
     await page.locator('#workspace-sidebar-toggle').click();assert.equal(await page.locator('html[data-workspace-collapsed]').count(),1);await page.locator('#workspace-sidebar-toggle').click();
     await page.locator('#finance-sidebar a[href="/home?section=personal"]').click();await page.getByRole('heading',{name:'Your money',level:1,exact:true}).waitFor();await page.locator('.workspace-overview-card[href="/payslips"]').click();await page.getByRole('heading',{name:'Payslips',exact:true}).waitFor();assert.equal(new URL(page.url()).origin,finance);
     await page.locator('#search-btn').click();await page.locator('#sp-q').fill('expenses');await page.locator('.sp-item').filter({hasText:'Expenses'}).click();await page.getByRole('heading',{name:'Expenses',exact:true}).waitFor();
     fs.mkdirSync(path.join(__dirname,'.test-results'),{recursive:true});
     for(const route of role==='manager'?['home','payslips','expenses','payroll','funds','invoices','bills','notifications']:['home','payslips','expenses']){await page.goto(finance+'/'+route);await page.waitForSelector('#view h1');if(route==='home')await page.locator('.finance-summary[aria-busy=false]').waitFor();assert.doesNotMatch(await page.locator('#view').innerText(),/Not found|Server error|undefined|This page couldn’t load/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'desktop overflow: '+route);await page.waitForTimeout(300);await page.screenshot({path:path.join(__dirname,'.test-results/finance-'+role+'-'+route+'.png'),fullPage:true});}
     if(role==='manager'){
      await page.goto(finance+'/bills');await page.locator('#bl-new').click();await page.locator('#bf-sup').fill('Draft supplier fixture');const dialog=page.locator('.modal');let box=await dialog.boundingBox();assert.ok(Math.abs(box.x+box.width/2-1365/2)<3&&Math.abs(box.y+box.height/2-500)<3,'centred bill dialog');await page.screenshot({path:path.join(__dirname,'.test-results/finance-bill-dialog.png')});
      await post(finance,'/api/funds/add',{amount:15,source:'bank',note:'Remote fixture update'},managerCookie);await page.waitForTimeout(4000);assert.equal(await page.locator('#bf-sup').inputValue(),'Draft supplier fixture','remote refresh keeps the draft');await page.getByRole('button',{name:'Cancel',exact:true}).click();
      const starting=(await(await get(finance,'/api/funds',managerCookie)).json()).balances.main;const pounds=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n);await page.goto(finance+'/funds');await page.locator('.fc-value').getByText(pounds(starting),{exact:true}).waitFor();await post(finance,'/api/funds/add',{amount:20,source:'bank',note:'Live balance fixture'},managerCookie);await page.locator('.fc-value').getByText(pounds(starting+20),{exact:true}).waitFor({timeout:12000});
      await page.goto(finance+'/bills');await page.locator('#bl-new').click();await page.locator('#bf-sup').fill('Website hosting fixture');await page.locator('#bf-amt').fill('12.50');await page.locator('#bf-form').getByRole('button',{name:'Save',exact:true}).click();await page.locator('#bl-body').getByText('Website hosting fixture',{exact:true}).waitFor();await page.getByRole('searchbox',{name:'Search finance records'}).fill('Website');await post(finance,'/api/bills',{supplier:'Remote live supplier',amount:22,dueDate:'2026-11-30',category:'Other',repeat:'none'},managerCookie);await page.waitForTimeout(4000);assert.equal(await page.getByRole('searchbox',{name:'Search finance records'}).inputValue(),'Website');await page.getByRole('searchbox',{name:'Search finance records'}).fill('Remote live supplier');await page.locator('#bl-body tr:not([hidden])').getByText('Remote live supplier',{exact:true}).waitFor();
     }else{
      await page.goto(finance+'/expenses');await page.locator('#ex-new').click();await page.waitForTimeout(200);await page.screenshot({path:path.join(__dirname,'.test-results/finance-expense-dialog.png')});await page.keyboard.press('Escape');
      await page.goto(finance+'/funds');await page.getByRole('heading',{name:'No access',level:1,exact:true}).waitFor();assert.equal(await page.locator('[data-fund=add]').count(),0);
     }
     for(const theme of ['midnight','light','dusk']){await post(finance,'/api/me/theme',{theme},c);await page.goto(finance+'/home');await page.locator('.finance-summary[aria-busy=false]').waitFor();await page.screenshot({path:path.join(__dirname,'.test-results/finance-'+role+'-'+theme+'.png'),fullPage:true});}
     await page.setViewportSize({width:1280,height:800});await page.goto(finance+'/expenses');await page.locator('#ex-new').click();let box=await page.locator('.modal').boundingBox();assert.ok(box.x>=20&&box.y>=20&&box.x+box.width<=1260&&box.y+box.height<=780,'bounded desktop form');await page.keyboard.press('Escape');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await context.close();
    }
   }finally{await browser.close();}
  }
  assert.equal((await post(finance,'/api/logout',{},employeeCookie)).status,200);assert.equal((await get(finance,'/api/me',employeeCookie)).status,401);assert.equal((await get(finance,'/api/me',managerCookie)).status,200);
 }finally{await Promise.all(children.filter(c=>c.exitCode===null).map(c=>new Promise(r=>{c.once('exit',r);c.kill();})));fs.rmSync(dir,{recursive:true,force:true});}
});
