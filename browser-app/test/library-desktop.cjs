'use strict';
// HN Browser 0.7 through the real shell: your profile in Settings (with a stand-in HN Auth that checks the
// unlock key), status, locking, history, bookmarks, address suggestions, restoring tabs and the new tab page.
const{_electron:electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto'),{Vault}=require('../src/vault.cjs');
// Settings are saved just after they change, so wait for the file to catch up.
const savedPrefs=async(file,ok)=>{for(let i=0;i<100;i++){try{const p=JSON.parse(fs.readFileSync(file,'utf8'));if(ok(p))return p;}catch{}await new Promise(r=>setTimeout(r,50));}return JSON.parse(fs.readFileSync(file,'utf8'));};
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-library-desktop-')),profile=path.join(dir,'profile'),fixture=path.join(dir,'fixture'),log=path.join(dir,'auth-log.json'),key=crypto.randomBytes(32).toString('hex'),token='a'.repeat(64);let app,server;
 const storageCode=`const crypto=require('node:crypto'),key=Buffer.from('${key}','hex');const storage={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'gnome_libsecret',encryptString:value=>{const iv=crypto.randomBytes(16),c=crypto.createCipheriv('aes-256-cbc',key,iv);return Buffer.concat([iv,c.update(value),c.final()]);},decryptString:value=>{const c=crypto.createDecipheriv('aes-256-cbc',key,value.subarray(0,16));return Buffer.concat([c.update(value.subarray(16)),c.final()]).toString();}};`;
 new Vault(path.join(profile,'account.enc'),Function('require',storageCode+'return storage;')(require)).save(token);
 fs.mkdirSync(fixture);fs.writeFileSync(path.join(fixture,'package.json'),JSON.stringify({name:'hn-browser-library-fixture',version:'0.8.0',main:'main.cjs'}));
 // Stand-in HN Auth: the profile can only be read or changed with the unlock key given for the PIN.
 fs.writeFileSync(path.join(fixture,'main.cjs'),storageCode+`Object.assign(require('electron').safeStorage,storage);const fs=require('node:fs'),originalFetch=global.fetch,UNLOCK='${'u'.repeat(0)}'+'f'.repeat(64);let unlocked=null;
 const person={displayName:'Sam Fixture',firstName:'Samantha',lastName:'Fixture',email:'sam@hngroup.org.uk',jobTitle:'Designer',company:'HN Group',department:'Design',phone:'',location:'',timezone:'Europe/London',skills:[],languages:[],bio:'',bioPublic:true,birthday:null,status:null,photo:false,supervisor:'Alex Manager',roles:['Staff'],lastLogin:null};
 const user=()=>({displayName:person.displayName,email:person.email,company:person.company,jobTitle:person.jobTitle});const record=(route,body)=>{const list=JSON.parse(fs.existsSync(${JSON.stringify(log)})?fs.readFileSync(${JSON.stringify(log)},'utf8'):'[]');list.push({route,body});fs.writeFileSync(${JSON.stringify(log)},JSON.stringify(list));};
 global.fetch=async(url,options={})=>{if(!String(url).startsWith('https://auth.hngroup.org.uk/api/native/'))return originalFetch(url,options);const route=String(url).slice('https://auth.hngroup.org.uk/api/native/'.length),body=JSON.parse(options.body||'{}');record(route,body);
  if(route==='avatar')return new Response('',{status:404});
  if(route==='unlock'){if(body.code!=='582947')return Response.json({error:'Wrong PIN'},{status:401});unlocked=UNLOCK;return Response.json({user:user(),unlock:UNLOCK});}
  if(route==='lock'){unlocked=null;return Response.json({ok:true});}
  if(route.startsWith('account')){if(!unlocked||body.unlock!==unlocked)return Response.json({error:'Unlock HN Browser with your PIN to change your profile.',locked:true},{status:423});
   if(route==='account/update'){if(!String(body.profile.displayName||'').trim())return Response.json({error:"Display name can't be blank."},{status:400});Object.assign(person,{displayName:body.profile.displayName,phone:body.profile.phone,location:body.profile.location,timezone:body.profile.timezone,skills:body.profile.skills,languages:body.profile.languages,bio:body.profile.bio,bioPublic:body.profile.bioPublic,birthday:body.profile.birthdayMonth?{day:Number(body.profile.birthdayDay),month:Number(body.profile.birthdayMonth),show:body.profile.showBirthday}:null});}
   if(route==='account/status')person.status=body.status;
   return Response.json({user:user(),profile:{...person}});}
  return Response.json({user:user(),ok:true});};
 require(${JSON.stringify(path.resolve(__dirname,'../src/main.cjs'))});`);
 server=http.createServer((req,res)=>{const page=req.url.replace(/^\//,'')||'home';res.writeHead(200,{'Content-Type':'text/html'});res.end('<title>Fixture '+page+' page</title><h1>'+page+'</h1>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const site='http://127.0.0.1:'+server.address().port+'/';
 const launch=()=>electron.launch({executablePath:require('electron'),args:[...((process.getuid?.()===0||process.env.CI)?['--no-sandbox']:[]),fixture],env:{...process.env,HN_BROWSER_TEST_PROFILE:profile}});
 const authLog=()=>JSON.parse(fs.existsSync(log)?fs.readFileSync(log,'utf8'):'[]');
 const unlock=async page=>{page=await require('./layers.cjs').overlayOf(app);await page.locator('#account-pin').waitFor({state:'visible'});await page.waitForFunction(()=>document.activeElement.id==='account-pin');await page.keyboard.type('582947');await page.locator('#overlay').waitFor({state:'hidden'});};
 const go=async(page,url)=>{await page.locator('#address').fill(url);await page.keyboard.press('Enter');await page.waitForFunction(u=>window.browser.state().then(s=>s.tabs.find(t=>t.id===s.active).url===u&&!s.tabs.find(t=>t.id===s.active).loading),url);};
 const mod=process.platform==='darwin'?'Meta':'Control',shots=path.resolve(__dirname,'../.test-results');fs.mkdirSync(shots,{recursive:true});
 try{
  app=await launch();let page=await app.firstWindow();let top=await require('./layers.cjs').overlayOf(app);await unlock(page);
  // ---- Your profile in Settings ----
  await page.locator('#browser-menu').click();await top.locator('#menu-panel [data-panel=settings]').click();await top.locator('#settings-panel').waitFor({state:'visible'});
  await top.locator('#profile-editor').waitFor({state:'visible'});const form=top.locator('#profile-form');
  assert.equal(await form.locator('[name=displayName]').inputValue(),'Sam Fixture');assert.match(await top.locator('#pf-details').textContent(),/Samantha Fixture.*Designer.*Alex Manager/s);
  assert.ok(authLog().filter(x=>x.route==='account').every(x=>x.body.unlock==='f'.repeat(64)));
  await form.locator('[name=displayName]').fill('Sam F');await form.locator('[name=location]').fill('Leeds');await form.locator('[name=skills]').fill('Design, Research ,  Support');await form.locator('[name=bio]').fill('Hello from HN Browser.');await form.locator('[name=bioPublic]').uncheck();await form.locator('[name=birthdayDay]').selectOption('14');await form.locator('[name=birthdayMonth]').selectOption('3');
  assert.ok(await form.evaluate(f=>f.classList.contains('dirty')));await top.screenshot({path:path.join(shots,'settings-profile.png')});
  await form.locator('[type=submit]').click();await top.waitForFunction(()=>document.querySelector('#pf-saved').textContent.includes('Saved'));
  const saved=authLog().filter(x=>x.route==='account/update').at(-1).body;assert.equal(saved.profile.displayName,'Sam F');assert.deepEqual(saved.profile.skills,['Design','Research','Support']);assert.equal(saved.profile.bioPublic,false);assert.equal(saved.profile.birthdayMonth,'3');
  await page.waitForFunction(()=>document.querySelector('#account-label').textContent==='Sam F');
  await form.locator('[name=displayName]').fill('');await form.locator('[type=submit]').click();await top.waitForFunction(()=>document.querySelector('#pf-saved').textContent==='Add a display name.');await top.locator('#pf-reset').click();assert.equal(await form.locator('[name=displayName]').inputValue(),'Sam F');
  await top.locator('[data-status=busy]').click();await top.locator('#st-message').fill('In a workshop');await top.locator('#status-form [type=submit]').click();await top.waitForFunction(()=>document.querySelector('#st-saved').textContent.includes('Updated'));assert.deepEqual(authLog().filter(x=>x.route==='account/status').at(-1).body.status,{type:'busy',message:'In a workshop',until:null});
  // More settings, saved straight away.
  await top.locator('[data-settings=security]').click();await top.locator('[data-preference-select=autoLock]').selectOption('15');
  await top.locator('[data-settings=startup]').click();await top.locator('input[name=startup][value=restore]').check();
  await top.locator('[data-settings=accessibility]').click();await top.locator('[data-section=accessibility] [data-preference=reduceMotion]').check();await top.waitForFunction(()=>document.body.dataset.motion==='reduced');await top.locator('[data-section=accessibility] [data-preference=reduceMotion]').uncheck();
  await top.locator('[data-settings=shortcuts]').click();assert.match(await top.locator('#shortcut-list').textContent(),/Lock HN Browser/);
  await top.waitForFunction(()=>window.browser.state().then(s=>s.preferences.autoLock===15&&s.preferences.startup==='restore'));const prefs=await savedPrefs(path.join(profile,'preferences.json'),p=>p.autoLock===15);assert.equal(prefs.autoLock,15);assert.equal(prefs.reduceMotion,false);
  await top.keyboard.press('Escape');await top.locator('#overlay').waitFor({state:'hidden'});
  // ---- History, bookmarks and suggestions ----
  await go(page,site+'alpha');await go(page,site+'beta');
  await page.locator('#star').click();await page.waitForFunction(()=>document.querySelector('#star').getAttribute('aria-pressed')==='true');await page.waitForFunction(()=>window.browser.state().then(s=>s.bookmarks.some(b=>b.title.includes('Fixture beta page'))));
  await page.locator('#browser-menu').click();await top.locator('#menu-panel [data-panel=history]').click();await top.locator('#history-panel').waitFor({state:'visible'});await top.waitForFunction(()=>document.querySelectorAll('#history-list .library-row').length>=2);
  assert.equal(await top.locator('#history-list .library-day').first().textContent(),'Today');await top.screenshot({path:path.join(shots,'history.png')});
  await top.locator('#history-search').fill('alpha');await top.waitForFunction(()=>document.querySelectorAll('#history-list .library-row').length===1);
  await top.locator('#history-list .library-row').hover();await top.locator('#history-list .row-tools button[title="Remove from history"]').click();await top.waitForFunction(()=>!document.querySelector('#history-empty').hidden);
  await top.keyboard.press('Escape');await top.locator('#overlay').waitFor({state:'hidden'});
  // Suggestions are a separate layer above the page (popup.html); the page itself is never swapped out.
  const popupItems=()=>app.evaluate(({webContents})=>{const w=webContents.getAllWebContents().find(x=>x.getURL().endsWith('popup.html'));return w?w.executeJavaScript('[...document.querySelectorAll("li")].map(li=>({cls:li.className,text:li.textContent,sel:li.getAttribute("aria-selected")}))'):[];});
  const popupShown=()=>app.evaluate(({BrowserWindow,webContents})=>{const w=webContents.getAllWebContents().find(x=>x.getURL().endsWith('popup.html'));return !!w&&BrowserWindow.getAllWindows()[0].contentView.children.some(v=>v.webContents===w);});
  await page.locator('#address').click();await page.keyboard.type('fixture be');
  for(let i=0;i<50&&!(await popupItems()).some(x=>x.cls.includes('bookmark')&&x.text.includes('Fixture beta page'));i++)await page.waitForTimeout(100);
  assert.ok((await popupItems()).some(x=>x.cls.includes('search')));assert.ok(await popupShown());assert.ok(await top.locator('#overlay').isHidden(),'the page stays live while typing');
  await page.keyboard.press('Escape');for(let i=0;i<30&&await popupShown();i++)await page.waitForTimeout(100);assert.equal(await popupShown(),false);
  // An HN Group destination is marked in the address bar while typing.
  await page.locator('#address').fill('');await page.keyboard.type('staff portak');await page.waitForFunction(()=>!document.querySelector('#hn-badge').hidden&&document.querySelector('#hn-badge').textContent.includes('Staff portal'));await page.keyboard.press('Escape');
  await go(page,site+'gamma');await page.locator('#address').click();await page.keyboard.type('fixture be');
  for(let i=0;i<50&&!((await popupShown())&&(await popupItems()).some(x=>x.cls.includes('bookmark')));i++)await page.waitForTimeout(100);
  const index=(await popupItems()).findIndex(x=>x.cls.includes('bookmark'));assert.ok(index>=0);for(let i=0;i<=index;i++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await page.waitForFunction(u=>window.browser.state().then(s=>s.tabs.find(t=>t.id===s.active).url===u),site+'beta');await top.locator('#overlay').waitFor({state:'hidden'});
  await page.keyboard.press(mod+'+t');await page.waitForFunction(()=>document.querySelectorAll('.tab').length===2);
  await page.locator('#browser-menu').click();await top.locator('#menu-panel [data-panel=bookmarks]').click();await top.locator('#bookmarks-panel').waitFor({state:'visible'});
  await top.locator('#bookmarks-list .library-row').hover();await top.locator('#bookmarks-list button[title=Rename]').click();await top.locator('#bookmarks-list input.rename').fill('Beta bookmark');await top.keyboard.press('Enter');await top.waitForFunction(()=>window.browser.state().then(s=>s.bookmarks[0]?.title==='Beta bookmark'));
  await top.keyboard.press('Escape');await top.locator('#overlay').waitFor({state:'hidden'});
  // ---- New tab page: greeting and most visited ----
  const home=await app.evaluate(async({webContents})=>{const tab=webContents.getAllWebContents().find(w=>w.getURL()==='hn-browser://start/');return tab.executeJavaScript('({greeting:document.querySelector(".greeting").textContent,recent:[...document.querySelectorAll(".recent a")].map(a=>a.href)})');});
  assert.match(home.greeting,/^Good (morning|afternoon|evening), Sam$/);assert.ok(home.recent.includes(site+'beta'));
  // ---- Locking ----
  await page.locator('#browser-menu').click();await top.locator('#menu-lock').click();await top.locator('#account-pin').waitFor({state:'visible'});
  const locked=await top.evaluate(()=>window.browser.state());assert.ok(locked.locked);assert.equal(locked.user,null);assert.equal(locked.profileEditable,false);assert.ok(authLog().some(x=>x.route==='lock'));await page.locator('#toolbar-lock').waitFor({state:'visible'});
  assert.ok(!JSON.stringify(locked).includes('f'.repeat(64)));
  await top.keyboard.type('582947');await top.locator('#overlay').waitFor({state:'hidden'});
  await app.close();app=null;
  // ---- Continue where you left off ----
  app=await launch();page=await app.firstWindow();top=await require('./layers.cjs').overlayOf(app);await unlock(page);
  const restored=await page.evaluate(()=>window.browser.state());assert.deepEqual(restored.tabs.map(t=>t.url),[site+'beta','hn-browser://start/']);assert.equal(restored.bookmarks[0].title,'Beta bookmark');
  console.log('Library desktop passed: profile editing with the unlock key, status, more settings, locking, history, bookmarks, address suggestions, new tab greeting and most visited, and restoring tabs.');
 }finally{if(app)await app.close();server?.close();fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1;});
