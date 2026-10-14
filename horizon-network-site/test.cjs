'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{spawn}=require('node:child_process');
test('live public leadership matches Network company and department on the same role and exposes only public fields (About me only when allowed)',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-network-test-'));
 const store=require('../staff-portal/lib/store');store.init(dir);
 function person(first,company,department,otherRoles=[]){return store.saveEmployee({firstName:first,lastName:'Example',company,department,jobTitle:'Primary title',otherRoles,emails:[{local:first.toLowerCase(),domain:'hngroup.org.uk',primary:true}]});}
 const leader=person('Network','Horizon Network','Network Leadership');
 const shared=person('Shared','HN Group','Group Leadership',[{company:'Horizon Network',department:'Network Leadership',jobTitle:'Network director'}]);
 const wrongCompany=person('Media','Horizon Media Group','Network Leadership');
 person('Engineer','Horizon Network','Engineering');
 person('Split','Horizon Network','Engineering',[{company:'Horizon Advertising',department:'Network Leadership',jobTitle:'Ads lead'}]);
 store.updateOwnProfile(leader,{displayName:'Network Example',bio:'Leads the network.\n\nLoves cycling.',phone:'+44 20 7946 0958',location:'Doncaster, United Kingdom',timezone:'Europe/London',skills:'Software, Leadership',languages:'English, BSL'});
 store.updateOwnProfile(shared,{displayName:'Shared Example',bio:'Private intro.',bioPublic:false});
 const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zSsAAAAASUVORK5CYII=';
 store.saveAvatar(leader,'data:image/png;base64,'+image);store.saveAvatar(wrongCompany,'data:image/png;base64,'+image);
 const secret=path.join(dir,'secret');fs.writeFileSync(secret,'e'.repeat(64));process.env.STATUS_SSO_SECRET_FILE=secret;process.env.NETWORK_DATA_DIR=path.join(dir,'network');
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const child=spawn(process.execPath,[path.resolve(__dirname,'../staff-portal/server.js')],{env:{...process.env,PORT:String(port),DATA_DIR:dir},stdio:'ignore'});
 const backend='http://127.0.0.1:'+port;process.env.STAFF_PORTAL_BACKEND=backend;
 const {server}=require('./server');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(backend+'/healthz')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,50));}assert.ok(ready);
  assert.equal((await fetch(backend+'/api/auth/network-leadership',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  const data=await (await fetch(base+'/api/leadership')).json();assert.equal(data.leaders.length,2);
  assert.deepEqual(data.leaders.map(p=>p.name),['Network Example','Shared Example']);
  assert.equal(data.leaders[1].jobTitle,'Network director');
  assert.deepEqual(Object.keys(data.leaders[0]).sort(),['avatarUrl','bio','jobTitle','languages','location','name','phone','skills','timezone']);
  assert.equal(data.leaders[0].bio,'Leads the network.\n\nLoves cycling.');
  assert.equal(data.leaders[0].phone,'+44 20 7946 0958');
  assert.equal(data.leaders[0].location,'Doncaster, United Kingdom');
  assert.equal(data.leaders[0].timezone,'Europe/London');
  assert.deepEqual(data.leaders[0].skills,['Software','Leadership']);
  assert.deepEqual(data.leaders[0].languages,['English','BSL']);
  assert.equal(data.leaders[1].phone,'');
  assert.equal(data.leaders[1].bio,'','About me stays off the website when the person unticks it');
  assert.ok(!JSON.stringify(data).includes('@'));
  const avatar=await fetch(base+data.leaders[0].avatarUrl);assert.equal(avatar.status,200);assert.deepEqual(Buffer.from(await avatar.arrayBuffer()),Buffer.from(image,'base64'));
  assert.equal((await fetch(base+'/api/leadership/avatar/'+wrongCompany.id)).status,404);
  for(const route of ['/','/about','/services','/contact','/privacy','/assets/site.css','/assets/favicon.svg'])assert.equal((await fetch(base+route)).status,200,route);
  assert.equal((await fetch(base+'/server.js')).status,404);
  assert.equal((await fetch(base+'/api/auth/network-leadership')).status,404);
  assert.equal((await fetch(base+'/api/leadership',{method:'POST'})).status,405);
 }finally{await new Promise(r=>server.close(r));if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}fs.rmSync(dir,{recursive:true,force:true});}
});
