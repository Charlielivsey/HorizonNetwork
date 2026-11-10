'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.join(__dirname,'..');
const port=async()=>{const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const cookie=(r,n)=>(r.headers.getSetCookie().find(c=>c.startsWith(n+'='))||'').split(';')[0];
const ready=async u=>{for(let i=0;i<100;i++){try{if((await fetch(u)).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Not ready: '+u);};
test('Docs administration migrates policies and storage with separate permissions and existing data',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-docs-administration-'));process.env.DATA_DIR=dir;
 const store=require('../staff-portal/lib/store');store.init(dir);
 const users={};for(const [index,name] of ['policy','storage','hr','ordinary'].entries()){
  const p=store.saveEmployee({firstName:name,lastName:'Fixture',displayName:name,company:'HN Group',jobTitle:'Analyst',discordId:String(index+1)+'23456789012345678',emails:[{local:'docs.'+name,domain:'hngroup.org.uk',primary:true}]});
  store.issueTemporaryPassword(p);store.setPassword(p,'Fixture-password-582!');store.setCode(p,'582947');users[name]=p;
 }
 for(const [name,permissions] of [['policy',['documents.manage']],['storage',['storage.access']],['hr',['hr.manage']]]){const role=store.saveRole({name:'Docs fixture '+name,permissions});store.setRoleMembers(role,[users[name].id]);}
 const secret=path.join(dir,'secret');fs.writeFileSync(secret,'f'.repeat(64));
 const [staffPort,authPort,docsPort,proxyPort]=await Promise.all([port(),port(),port(),port()]);
 const staff='http://127.0.0.1:'+staffPort,auth='http://127.0.0.1:'+authPort,docs='http://127.0.0.1:'+docsPort,proxy='http://127.0.0.1:'+proxyPort;
 const common={...process.env,DATA_DIR:dir,DOCS_DATA_DIR:path.join(dir,'docs'),DOCS_SEED_DIR:path.join(dir,'no-seed'),STATUS_SSO_SECRET_FILE:secret,AUTH_BACKEND:auth,STAFF_PORTAL_BACKEND:staff,PRIVATE_STAFF_BACKEND:staff,STAFF_BACKEND:staff,DOCS_ORIGIN:docs,DOCS_BACKEND:docs};
 const children=[];for(const [file,p] of [['staff-portal/server.js',staffPort],['auth-site/server.js',authPort],['docs-site/server.js',docsPort],['staff-portal/public-proxy.js',proxyPort]])children.push(spawn(process.execPath,[file],{cwd:root,env:{...common,PORT:String(p)},stdio:['ignore','ignore','inherit']}));
 const get=(base,p,c='')=>fetch(base+p,{headers:{Cookie:c},redirect:'manual'});
 const post=(base,p,body,c='',origin=base)=>fetch(base+p,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:c},body:JSON.stringify(body),redirect:'manual'});
 const upload=(p,c,text,meta)=>fetch(docs+p,{method:'POST',headers:{Cookie:c,Origin:docs,'Content-Type':'application/octet-stream','X-Document':encodeURIComponent(JSON.stringify({fileName:'policy.txt',...meta}))},body:text});
 async function signIn(name){
  const start=await get(docs,'/auth/login?next=/administration'),to=new URL(start.headers.get('location')),state=to.searchParams.get('state');assert.equal(to.searchParams.get('client_id'),'docs');
  const login=await post(auth,'/api/login',{username:'docs.'+name+'@hngroup.org.uk',password:'Fixture-password-582!'},'','https://auth.hngroup.org.uk');assert.equal(login.status,200,await login.clone().text());
  const verified=await post(auth,'/api/login/code',{code:'582947'},cookie(login,'__Host-hn_auth_flow'),'https://auth.hngroup.org.uk');assert.equal(verified.status,200,await verified.clone().text());
  const grant=await post(auth,'/api/continue',{client_id:'docs',state},cookie(verified,'__Host-hn_auth_session'),'https://auth.hngroup.org.uk');assert.equal(grant.status,200,await grant.clone().text());
  const back=new URL((await grant.json()).redirect),done=await fetch(docs+back.pathname+back.search,{headers:{Cookie:cookie(start,'hn_docs_state')},redirect:'manual'});assert.equal(done.status,302,await done.clone().text());
  const c=cookie(done,'hn_docs_session');assert.ok(c);return c;
 }
 try{
  await Promise.all([ready(staff+'/healthz'),ready(auth+'/healthz'),ready(docs+'/healthz'),ready(proxy+'/healthz')]);
  const cookies={};for(const name of Object.keys(users))cookies[name]=await signIn(name);
  for(const [name,c] of Object.entries(cookies)){
   const flags=(await(await get(docs,'/api/me',c)).json()).user.administration;assert.deepEqual(flags,{storage:name==='storage',documents:name==='policy'});
   assert.equal((await get(docs,'/administration',c)).status,['hr','ordinary'].includes(name)?403:200);
   assert.equal((await get(docs,'/administration/storage',c)).status,name==='storage'?200:403);
   assert.equal((await get(docs,'/administration/documents',c)).status,name==='policy'?200:403);
   assert.equal((await get(docs,'/api/administration/document-storage',c)).status,name==='storage'?200:403);
   assert.equal((await get(docs,'/api/administration/documents',c)).status,name==='policy'?200:403);
   assert.equal((await get(docs,'/api/administration/policies',c)).status,200);
   assert.equal((await get(docs,'/api/storage/'+users.ordinary.id,c)).status,name==='ordinary'||name==='storage'?200:403);
  }
  assert.equal((await get(docs,'/api/administration/tools')).status,401);
  assert.equal((await get(staff,'/api/docs-administration/tools')).status,404);
  const forged=await fetch(proxy+'/api/docs-administration/tools',{headers:{Authorization:'Bearer '+'f'.repeat(64),'X-HN-Docs-Identity':Buffer.from(JSON.stringify({id:users.storage.id,accountId:users.storage.id})).toString('base64url')}});assert.equal(forged.status,410);
  const r=await upload('/api/administration/documents/upload',cookies.policy,'Version one',{title:'Fixture policy',category:'Policies',companies:[],requiresAck:true});assert.equal(r.status,201,await r.clone().text());const d=(await r.json()).document;
  assert.equal((await upload('/api/administration/documents/upload',cookies.ordinary,'Must fail',{title:'Bad'})).status,403);
  assert.equal((await post(docs,'/api/administration/documents/'+d.id,{title:'Changed title',category:'Policies',companies:[],requiresAck:true},cookies.policy)).status,200);
  assert.equal((await get(docs,'/api/administration/policies/'+d.id+'/file',cookies.ordinary)).status,200);
  assert.equal((await post(docs,'/api/administration/policies/'+d.id+'/acknowledge',{},cookies.ordinary)).status,200);
  assert.ok((await(await get(docs,'/api/administration/documents/'+d.id+'/acknowledgements',cookies.policy)).json()).people.some(p=>p.id===users.ordinary.id&&p.acknowledgedAt));
  assert.equal((await upload('/api/administration/documents/'+d.id+'/file',cookies.policy,'Version two',{note:'Updated text'})).status,200);
  const versions=await(await get(docs,'/api/administration/documents/'+d.id+'/versions',cookies.policy)).json();assert.equal(versions.versions.length,2);
  assert.equal(await(await get(docs,'/api/administration/policies/'+d.id+'/versions/1/file',cookies.ordinary)).text(),'Version one');
  assert.equal((await post(docs,'/api/administration/policies/'+d.id+'/delete',{},cookies.policy)).status,403);
  const grant=await post(docs,'/api/administration/document-storage/grants',{granteeId:users.hr.id,ownerId:users.ordinary.id,until:new Date(Date.now()+86400000).toISOString(),reason:'Cover'},cookies.storage);assert.equal(grant.status,201,await grant.clone().text());const g=(await grant.json()).grant;
  const grantedHrCookie=await signIn('hr');
  assert.equal((await get(docs,'/api/storage/'+users.ordinary.id,grantedHrCookie)).status,200,'individual grant opens storage without HR granting access by itself');
  assert.equal((await get(docs,'/administration',grantedHrCookie)).status,403,'individual grant never unlocks administration');
  const privateFile=await fetch(docs+'/api/files',{method:'POST',headers:{Cookie:cookies.ordinary,Origin:docs,'Content-Type':'application/octet-stream','X-File-Name':'private.txt'},body:'Private storage text'});assert.equal(privateFile.status,201);const f=(await privateFile.json()).file;
  const listing=await(await get(docs,'/api/administration/document-storage/people/'+users.ordinary.id,cookies.storage)).json();assert.ok(listing.files.some(x=>x.id===f.id));
  assert.equal(await(await get(docs,'/api/administration/document-storage/people/'+users.ordinary.id+'/files/'+f.id,cookies.storage)).text(),'Private storage text');
  assert.equal((await post(docs,'/api/administration/document-storage/grants/'+g.id+'/delete',{},cookies.storage)).status,200);
  const revokedHrCookie=await signIn('hr');
  assert.equal((await get(docs,'/api/storage/'+users.ordinary.id,revokedHrCookie)).status,403,'revoked grant closes private storage');
  assert.equal((await get(docs,'/api/administration/document-storage/people/'+users.ordinary.id+'/files/11111111-1111-4111-8111-111111111111',cookies.storage)).status,404,'file must belong to the requested storage');
  assert.equal((await post(docs,'/api/administration/document-storage/grants',{},cookies.policy)).status,403);
  assert.equal((await post(docs,'/api/administration/documents/'+d.id,{},cookies.policy,'https://evil.test')).status,403);
  for(const [old,next] of [['/documents','/administration/documents'],['/document-storage','/administration/storage']]){const r=await get(proxy,old+'?view=example');assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://docs.hngroup.org.uk'+next+'?view=example');}
  if(process.env.HN_DOCS_BROWSER==='1'){
   const {chromium}=require('../browser-app/node_modules/playwright');const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
   try{for(const [name,c] of Object.entries(cookies)){
    const context=await browser.newContext({viewport:{width:1365,height:950}});await context.addCookies([{name:'hn_docs_session',value:c.split('=')[1],url:docs}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(docs);await page.waitForSelector('#who:not([hidden])');await page.locator('#profile-menu summary').click();assert.equal(await page.locator('#administration-link').isVisible(),['policy','storage'].includes(name));
    if(['policy','storage'].includes(name)){
     await page.locator('#administration-link').click();await page.waitForSelector('.admin-tools');assert.equal(await page.locator('.admin-tools a').count(),1);
     await page.locator('.admin-tools a').click();await page.waitForSelector(name==='policy'?'#admin-doc-search':'#admin-ds-search');
     if(name==='policy'){await page.locator('#upload-doc').click();await page.locator('#admin-doc-title').fill('Browser policy');await page.locator('#admin-doc-file').setInputFiles({name:'browser.txt',mimeType:'text/plain',buffer:Buffer.from('Browser upload')});await page.locator('#admin-doc-save').click();await page.waitForSelector('.admin-doc-title:has-text("Browser policy")');await page.locator('.admin-doc-row').filter({hasText:'Browser policy'}).locator('[data-menu]').click();await page.getByRole('button',{name:'Edit details',exact:true}).click();await page.waitForSelector('#admin-doc-form');await page.locator('#modal-root [data-close]').first().click();}
     await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no mobile overflow: '+name);
     fs.mkdirSync(path.join(root,'.test-results'),{recursive:true});await page.screenshot({path:path.join(root,'.test-results','docs-administration-'+name+'.png'),fullPage:true});
    }
    await page.goto(docs+'/policies');await page.waitForSelector('#admin-doc-search');assert.equal(await page.locator('#upload-doc').count(),0,'policy read view has no management controls');assert.deepEqual(errors,[]);await context.close();
   }}finally{await browser.close();}
  }
  assert.equal((await post(docs,'/api/administration/documents/'+d.id+'/delete',{},cookies.policy)).status,200);
 }finally{for(const c of children)c.kill('SIGTERM');await Promise.all(children.map(c=>new Promise(r=>c.once('exit',r))));fs.rmSync(dir,{recursive:true,force:true});}
});
