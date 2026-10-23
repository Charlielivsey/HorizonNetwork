'use strict';
// HN Group App Manager, end to end in the real app on a pretend Windows PC (src/fake-system.cjs) with a local
// release feed: overview, an update that waits for the app to be quit, installing, settings written to the app's
// own preferences, reinstalling, cancelling, removing, activity, App Manager's settings and its own update.
//   xvfb-run -a node test/desktop.cjs      (screenshots: app-manager/screenshots/)
const{_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const pkg=require('../package.json'),shots=path.join(__dirname,'..','screenshots');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-manager-desktop-')),profile=path.join(dir,'profile'),fixtures=path.join(dir,'fixtures');fs.mkdirSync(fixtures);fs.mkdirSync(shots,{recursive:true});
 // The feed and installers the downloads site would serve.
 const file=(route,name,version,build)=>{const data=Buffer.from('installer '+name+' '.repeat(2048));fs.writeFileSync(path.join(fixtures,route),data);return{version,build,publishedAt:'2026-10-23T20:00:00Z',asset:{name,size:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex'),url:'/download/'+route}};};
 const browser=file('windows-x64','HN-Browser-1.1.4-win-x64.exe','1.1.4',39);
 fs.writeFileSync(path.join(fixtures,'feed.json'),JSON.stringify({release:{version:'1.1.4-39',publishedAt:'2026-10-23T20:00:00Z',assets:{'windows-x64':browser.asset}},apps:{'secure-network-windows':file('secure-network-windows','HN-Secure-Network-2.0.0-windows-x64.exe','2.0.0',3),'app-manager-windows':file('app-manager-windows','HN-Group-App-Manager-9.9.9-win-x64.exe','9.9.9',1)}}));
 // HN Browser's existing preferences, with a setting App Manager doesn't know about.
 fs.mkdirSync(path.join(profile,'hn-group-browser'),{recursive:true});fs.writeFileSync(path.join(profile,'hn-group-browser','preferences.json'),JSON.stringify({theme:'daylight',futureFeature:42}));
 let app;
 try{
  app=await electron.launch({args:[path.join(__dirname,'..'),...((process.getuid?.()===0||process.env.CI)?['--no-sandbox']:[])],env:{...process.env,HN_MANAGER_TEST:'1',HN_MANAGER_TEST_PROFILE:profile,HN_MANAGER_TEST_FIXTURES:fixtures}});
  const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const test=(fn,arg)=>app.evaluate(fn,arg);
  const running=(id,on)=>test(({},[id,on])=>{const s=global.__managerTest.system;if(on)s.open.add(id);else s.open.delete(id);},[id,on]);
  const events=()=>test(()=>global.__managerTest.system.events);
  const shot=async name=>{await page.evaluate(()=>{document.getElementById('toast').hidden=true;});for(const scheme of['light','dark']){await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(450);await page.screenshot({path:path.join(shots,name+'-'+scheme+'.png')});}await page.emulateMedia({colorScheme:'light'});};
  const confirmDialog=async(text,choice='ok')=>{await page.locator('#dialog',{hasText:text}).waitFor();assert.equal(await page.evaluate(()=>document.activeElement?.dataset.choice),'cancel','the safe choice has focus');await page.locator('#dialog [data-choice='+choice+']').click();await page.locator('#layer').waitFor({state:'hidden'});};
  const step=name=>console.log('· '+name);

  step('overview');
  await page.locator('#hero-title',{hasText:'HN Browser has an update'}).waitFor();
  assert.equal(await page.locator('.app-card').count(),2);
  await page.locator('[data-app=browser] .pill',{hasText:'Update available'}).waitFor();await page.locator('[data-app=network] .pill',{hasText:'Not installed'}).waitFor();
  await page.locator('#nav-updates',{hasText:'1'}).waitFor();await page.locator('#self-card').waitFor();
  await page.waitForTimeout(500);await shot('overview');

  step('an update waits for the app to be quit');
  await running('browser',true);await page.waitForTimeout(100);
  await page.locator('[data-app=browser] [data-action=update]').click();
  await page.locator('#dock-title',{hasText:'Waiting for you to quit HN Browser'}).waitFor();await page.locator('[data-app=browser] .pill',{hasText:'Waiting'}).waitFor();
  assert.deepEqual(await events(),[],'nothing is installed while the app is open');
  await page.waitForTimeout(300);await shot('waiting');
  await running('browser',false);
  await page.locator('[data-app=browser] .pill',{hasText:'Up to date'}).waitFor({timeout:20000});
  assert.deepEqual(await events(),[{install:'browser',version:'1.1.4-39'}]);
  await page.locator('#hero-title',{hasText:'Everything’s up to date'}).waitFor();

  step('install with a question in the HN design');
  await page.locator('[data-app=network] [data-action=install]').click();
  await page.locator('#dialog',{hasText:'Install HN Secure Network 2.0.0?'}).waitFor();await page.waitForTimeout(450);await shot('install-question');
  await confirmDialog('Install HN Secure Network 2.0.0?');
  await page.locator('#dock-title',{hasText:/Installing HN Secure Network/}).waitFor();await page.waitForTimeout(100);await shot('installing');
  await page.locator('[data-app=network] .pill',{hasText:'Up to date'}).waitFor({timeout:20000});

  step('app page and settings');
  await page.locator('.nav[data-page=browser]').click();await page.locator('#app-name',{hasText:'HN Browser'}).waitFor();
  await page.locator('#fact-installed',{hasText:'1.1.4'}).waitFor();await page.locator('#setting-theme').waitFor();
  assert.equal(await page.locator('#setting-theme').inputValue(),'daylight','current settings are read from the app');
  await page.locator('#setting-theme').selectOption('forest');await page.locator('#setting-reduceMotion').click();await page.locator('#setting-startup [data-value=restore]').click();
  await page.locator('#save-bar').waitFor();await page.waitForTimeout(400);await shot('app');
  await page.locator('#settings-save').click();await page.locator('#save-bar').waitFor({state:'hidden'});
  const prefs=JSON.parse(fs.readFileSync(path.join(profile,'hn-group-browser','preferences.json'),'utf8'));
  assert.deepEqual(prefs,{theme:'forest',futureFeature:42,reduceMotion:true,startup:'restore'},'only the changed settings are written and unknown ones kept');
  // While the app is open, its settings can't be changed here.
  await running('browser',true);await page.locator('#fact-status',{hasText:'Open'}).waitFor({timeout:20000});
  assert.equal(await page.locator('#setting-theme').isDisabled(),true);await page.locator('#settings-note',{hasText:'Quit HN Browser'}).waitFor();
  await running('browser',false);await page.locator('#fact-status',{hasText:'Closed'}).waitFor({timeout:20000});

  step('reinstall, and cancelling while it waits');
  await running('browser',true);await page.locator('#fact-status',{hasText:'Open'}).waitFor({timeout:20000});
  await page.locator('#app-actions [data-action=reinstall]').click();await confirmDialog('Reinstall HN Browser?');
  await page.locator('#app-progress',{hasText:'Waiting for you to quit HN Browser'}).waitFor();
  await page.locator('#dock-cancel').click();await page.locator('#dock').waitFor({state:'hidden'});
  assert.equal((await events()).length,2,'a cancelled job changes nothing');
  await running('browser',false);await page.locator('#fact-status',{hasText:'Closed'}).waitFor({timeout:20000});
  await page.locator('#app-actions [data-action=reinstall]').click();await confirmDialog('Reinstall HN Browser?');
  for(let i=0;i<100&&(await events()).length<3;i++)await page.waitForTimeout(100);
  assert.deepEqual((await events()).at(-1),{install:'browser',version:'1.1.4-39'});
  await page.locator('.event',{hasText:'HN Browser 1.1.4 was reinstalled.'}).count();

  step('remove');
  await page.locator('.nav[data-page=network]').click();await page.locator('#app-name',{hasText:'HN Secure Network'}).waitFor();
  await page.locator('#setting-connectOnLaunch').waitFor();
  await page.locator('#remove').click();await page.locator('#dialog',{hasText:'Remove HN Secure Network?'}).waitFor();await page.locator('#dialog',{hasText:'Disconnect the VPN first'}).waitFor();
  await page.waitForTimeout(450);await shot('remove-question');await confirmDialog('Remove HN Secure Network?');
  await page.locator('#app-pill',{hasText:'Not installed'}).waitFor({timeout:20000});assert.deepEqual((await events()).at(-1),{uninstall:'network'});

  step('activity');
  await page.locator('.nav[data-page=activity]').click();await page.locator('.event',{hasText:'HN Browser was updated to 1.1.4.'}).waitFor();
  await page.locator('.event',{hasText:'HN Secure Network 2.0.0 was installed.'}).waitFor();await page.locator('.event',{hasText:'HN Browser settings were changed.'}).waitFor();await page.locator('.event',{hasText:'HN Secure Network was removed.'}).waitFor();
  await page.waitForTimeout(300);await shot('activity');
  await page.locator('[data-filter=settings]').click();assert.equal(await page.locator('.event').count(),1);await page.locator('[data-filter=all]').click();

  step('App Manager settings and its own update');
  await page.locator('.nav[data-page=settings]').click();await page.locator('#self-update').waitFor();
  await page.locator('[data-pref=autoUpdate]').click();await page.locator('[data-theme=dark]').click();
  await page.waitForFunction(()=>window.manager.call('state').then(r=>r.value.preferences.autoUpdate===true&&r.value.preferences.theme==='dark'));
  const saved=JSON.parse(fs.readFileSync(path.join(profile,'app-manager.json'),'utf8'));assert.equal(saved.preferences.autoUpdate,true);assert.ok(saved.activity.length>=4,'activity is kept between runs');
  await page.locator('[data-theme=system]').click();await page.waitForTimeout(400);await shot('settings');
  await page.locator('#self-update').click();await confirmDialog('Update App Manager to 9.9.9?');
  await page.waitForFunction(()=>window.manager.call('state').then(r=>r.value.activity.some(a=>a.message.includes('App Manager 9.9.9 is installing'))));
  assert.ok(await test(()=>global.__managerTest.log.some(x=>x.selfUpdate==='9.9.9-1')),'the verified App Manager update would install');

  step('isolation');
  assert.equal(await page.evaluate(()=>typeof require),'undefined');
  assert.deepEqual(await page.evaluate(()=>Object.keys(window.manager).sort()),['call','onDialog','onNavigate','onState']);
  assert.match((await page.evaluate(()=>window.manager.call('enqueue','../../evil','install'))).error,/Choose an HN Group app/);
  await page.evaluate(()=>{try{window.manager.call('shell','rm');}catch(e){window.__refused=e.message;}});assert.equal(await page.evaluate(()=>window.__refused),'Unknown request.');
  await page.locator('.nav[data-page=overview]').click();await page.setViewportSize({width:900,height:680});await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no sideways scrolling at the smallest size');
  assert.deepEqual(errors,[]);
  console.log('App Manager desktop passed: overview, waiting for an app to be quit, install, settings, reinstall, cancel, remove, activity, preferences, self-update and isolation. Screenshots in app-manager/screenshots.');
 }finally{await app?.evaluate(({app})=>{setTimeout(()=>app.exit(0),50);}).catch(()=>{});await app?.close().catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
