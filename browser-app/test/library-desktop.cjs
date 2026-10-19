'use strict';
// HN Browser 0.7 through the real shell: your profile in Settings (with a stand-in HN Auth that checks the
// unlock key), status, locking, history, bookmarks, address suggestions, restoring tabs and the new tab page.
const{_electron:electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto'),{Vault}=require('../src/vault.cjs');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-library-desktop-')),profile=path.join(dir,'profile'),fixture=path.join(dir,'fixture'),log=path.join(dir,'auth-log.json'),key=crypto.randomBytes(32).toString('hex'),token='a'.repeat(64);let app,server;
 const storageCode=`const crypto=require('node:crypto'),key=Buffer.from('${key}','hex');const storage={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'gnome_libsecret',encryptString:value=>{const iv=crypto.randomBytes(16),c=crypto.createCipheriv('aes-256-cbc',key,iv);return Buffer.concat([iv,c.update(value),c.final()]);},decryptString:value=>{const c=crypto.createDecipheriv('aes-256-cbc',key,value.subarray(0,16));return Buffer.concat([c.update(value.subarray(16)),c.final()]).toString();}};`;
 new Vault(path.join(profile,'account.enc'),Function('require',storageCode+'return storage;')(require)).save(token);
 fs.mkdirSync(fixture);fs.writeFileSync(path.join(fixture,'package.json'),JSON.stringify({name:'hn-browser-library-fixture',version:'0.7.1',main:'main.cjs'}));
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
 const unlock=async page=>{await page.locator('#account-pin').waitFor({state:'visible'});await page.waitForFunction(()=>document.activeElement.id==='account-pin');await page.keyboard.type('582947');await page.locator('#overlay').waitFor({state:'hidden'});};
 const go=async(page,url)=>{await page.locator('#address').fill(url);await page.keyboard.press('Enter');await page.waitForFunction(u=>window.browser.state().then(s=>s.tabs.find(t=>t.id===s.active).url===u&&!s.tabs.find(t=>t.id===s.active).loading),url);};
 const mod=process.platform==='darwin'?'Meta':'Control',shots=path.resolve(__dirname,'../.test-results');fs.mkdirSync(shots,{recursive:true});
 try{
  app=await launch();let page=await app.firstWindow();await unlock(page);
  // ---- Your profile in Settings ----
  await page.locator('#browser-menu').click();await page.locator('#menu-panel [data-panel=settings]').click();await page.locator('#settings-panel').waitFor({state:'visible'});
  await page.locator('#profile-editor').waitFor({state:'visible'});const form=page.locator('#profile-form');
  assert.equal(await form.locator('[name=displayName]').inputValue(),'Sam Fixture');assert.match(await page.locator('#pf-details').textContent(),/Samantha Fixture.*Designer.*Alex Manager/s);
  assert.ok(authLog().filter(x=>x.route==='account').every(x=>x.body.unlock==='f'.repeat(64)));
  await form.locator('[name=displayName]').fill('Sam F');await form.locator('[name=location]').fill('Leeds');await form.locator('[name=skills]').fill('Design, Research ,  Support');await form.locator('[name=bio]').fill('Hello from HN Browser.');await form.locator('[name=bioPublic]').uncheck();await form.locator('[name=birthdayDay]').selectOption('14');await form.locator('[name=birthdayMonth]').selectOption('3');
  assert.ok(await form.evaluate(f=>f.classList.contains('dirty')));await page.screenshot({path:path.join(shots,'settings-profile.png')});
  await form.locator('[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#pf-saved').textContent.includes('Saved'));
  const saved=authLog().filter(x=>x.route==='account/update').at(-1).body;assert.equal(saved.profile.displayName,'Sam F');assert.deepEqual(saved.profile.skills,['Design','Research','Support']);assert.equal(saved.profile.bioPublic,false);assert.equal(saved.profile.birthdayMonth,'3');
  await page.waitForFunction(()=>document.querySelector('#account-label').textContent==='Sam F');
  await form.locator('[name=displayName]').fill('');await form.locator('[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#pf-saved').textContent==='Add a display name.');await page.locator('#pf-reset').click();assert.equal(await form.locator('[name=displayName]').inputValue(),'Sam F');
  await page.locator('[data-status=busy]').click();await page.locator('#st-message').fill('In a workshop');await page.locator('#status-form [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#st-saved').textContent.includes('Updated'));assert.deepEqual(authLog().filter(x=>x.route==='account/status').at(-1).body.status,{type:'busy',message:'In a workshop',until:null});
  // More settings, saved straight away.
  await page.locator('[data-settings=security]').click();await page.locator('[data-preference-select=autoLock]').selectOption('15');
  await page.locator('[data-settings=startup]').click();await page.locator('input[name=startup][value=restore]').check();
  await page.locator('[data-settings=accessibility]').click();await page.locator('[data-section=accessibility] [data-preference=reduceMotion]').check();await page.waitForFunction(()=>document.body.dataset.motion==='reduced');await page.locator('[data-section=accessibility] [data-preference=reduceMotion]').uncheck();
  await page.locator('[data-settings=shortcuts]').click();assert.match(await page.locator('#shortcut-list').textContent(),/Lock HN Browser/);
  await page.waitForFunction(()=>window.browser.state().then(s=>s.preferences.autoLock===15&&s.preferences.startup==='restore'));const prefs=JSON.parse(fs.readFileSync(path.join(profile,'preferences.json')));assert.equal(prefs.autoLock,15);assert.equal(prefs.reduceMotion,false);
  await page.keyboard.press('Escape');await page.locator('#overlay').waitFor({state:'hidden'});
  // ---- History, bookmarks and suggestions ----
  await go(page,site+'alpha');await go(page,site+'beta');
  await page.locator('#star').click();await page.waitForFunction(()=>document.querySelector('#star').getAttribute('aria-pressed')==='true');await page.waitForFunction(()=>[...document.querySelectorAll('.user-bookmark')].some(b=>b.textContent.includes('Fixture beta page')));
  await page.locator('#browser-menu').click();await page.locator('#menu-panel [data-panel=history]').click();await page.locator('#history-panel').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelectorAll('#history-list .library-row').length>=2);
  assert.equal(await page.locator('#history-list .library-day').first().textContent(),'Today');await page.screenshot({path:path.join(shots,'history.png')});
  await page.locator('#history-search').fill('alpha');await page.waitForFunction(()=>document.querySelectorAll('#history-list .library-row').length===1);
  await page.locator('#history-list .library-row').hover();await page.locator('#history-list .row-tools button[title="Remove from history"]').click();await page.waitForFunction(()=>!document.querySelector('#history-empty').hidden);
  await page.keyboard.press('Escape');await page.locator('#overlay').waitFor({state:'hidden'});
  await page.locator('#address').click();await page.keyboard.type('fixture be');await page.locator('#suggestions').waitFor({state:'visible'});await page.waitForFunction(()=>[...document.querySelectorAll('.suggestion')].some(s=>s.classList.contains('bookmark')&&s.textContent.includes('Fixture beta page')));
  assert.ok(await page.locator('.suggestion.search').count());await page.screenshot({path:path.join(shots,'suggestions.png')});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('#suggestions').hidden);await page.locator('#overlay').waitFor({state:'hidden'});
  await go(page,site+'gamma');await page.locator('#address').click();await page.keyboard.type('fixture be');await page.waitForFunction(()=>document.querySelectorAll('.suggestion').length>0&&!document.querySelector('#suggestions').hidden);
  const index=await page.evaluate(()=>[...document.querySelectorAll('.suggestion')].findIndex(s=>s.classList.contains('bookmark')));for(let i=0;i<=index;i++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await page.waitForFunction(u=>window.browser.state().then(s=>s.tabs.find(t=>t.id===s.active).url===u),site+'beta');await page.locator('#overlay').waitFor({state:'hidden'});
  await page.keyboard.press(mod+'+t');await page.waitForFunction(()=>document.querySelectorAll('.tab').length===2);
  await page.locator('#browser-menu').click();await page.locator('#menu-panel [data-panel=bookmarks]').click();await page.locator('#bookmarks-panel').waitFor({state:'visible'});
  await page.locator('#bookmarks-list .library-row').hover();await page.locator('#bookmarks-list button[title=Rename]').click();await page.locator('#bookmarks-list input.rename').fill('Beta bookmark');await page.keyboard.press('Enter');await page.waitForFunction(()=>window.browser.state().then(s=>s.bookmarks[0]?.title==='Beta bookmark'));
  await page.keyboard.press('Escape');await page.locator('#overlay').waitFor({state:'hidden'});
  // ---- New tab page: greeting and most visited ----
  const home=await app.evaluate(async({webContents})=>{const tab=webContents.getAllWebContents().find(w=>w.getURL()==='hn-browser://start/');return tab.executeJavaScript('({greeting:document.querySelector(".greeting").textContent,recent:[...document.querySelectorAll(".recent a")].map(a=>a.href)})');});
  assert.match(home.greeting,/^GOOD (MORNING|AFTERNOON|EVENING), SAM$/);assert.ok(home.recent.includes(site+'beta'));
  // ---- Locking ----
  await page.locator('#browser-menu').click();await page.locator('#menu-lock').click();await page.locator('#account-pin').waitFor({state:'visible'});
  const locked=await page.evaluate(()=>window.browser.state());assert.ok(locked.locked);assert.equal(locked.user,null);assert.equal(locked.profileEditable,false);assert.ok(authLog().some(x=>x.route==='lock'));await page.locator('#toolbar-lock').waitFor({state:'visible'});
  assert.ok(!JSON.stringify(locked).includes('f'.repeat(64)));
  await page.keyboard.type('582947');await page.locator('#overlay').waitFor({state:'hidden'});
  await app.close();app=null;
  // ---- Continue where you left off ----
  app=await launch();page=await app.firstWindow();await unlock(page);
  const restored=await page.evaluate(()=>window.browser.state());assert.deepEqual(restored.tabs.map(t=>t.url),[site+'beta','hn-browser://start/']);assert.equal(restored.bookmarks[0].title,'Beta bookmark');
  console.log('Library desktop passed: profile editing with the unlock key, status, more settings, locking, history, bookmarks and the bookmarks bar, address suggestions, new tab greeting and most visited, and restoring tabs.');
 }finally{if(app)await app.close();server?.close();fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
})().catch(e=>{console.error(e);process.exitCode=1;});
