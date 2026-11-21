'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {server}=require('./server');
test('brand centre and approved downloads are public; retired Management branding is unavailable',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  const response=await fetch(base);assert.equal(response.status,200);const html=await response.text();assert.doesNotMatch(html,/HN Group Management|hn-group-management|Staff only|Sign out|auth\/login/);
  for(const name of ['HN Group','Horizon Network','Horizon Media Group','Horizon Advertising','Horizon Development'])assert.ok(html.includes('>'+name+'<'),name);
  const downloads=[...html.matchAll(/(?:href|src)="(\/assets\/[^"#?]+)(?:\?[^"#]*)?"/g)].map(m=>m[1]);
  for(const file of new Set(downloads)){const r=await fetch(base+file);assert.equal(r.status,200,file);assert.ok((await r.arrayBuffer()).byteLength>0,file);}
  for(const file of ['/assets/brand/svg/hn-group-management-logo.svg','/assets/brand/png/hn-group-management-email-logo.png'])assert.equal((await fetch(base+file)).status,404);
  const logo='/assets/brand/svg/horizon-network-wordmark.svg';const head=await fetch(base+logo,{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.text()).length,0);assert.match(head.headers.get('cache-control'),/public/);
  for(const file of ['/auth/login','/signed-out']){const r=await fetch(base+file,{redirect:'manual'});assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/');}
  for(const [source,served] of [['discord-servers/horizon-network-hq.png','discord-server-horizon-network-hq'],['discord-bot/hn-group-bot-avatar.png','discord-bot-avatar']])assert.deepEqual(Buffer.from(await(await fetch(base+'/assets/brand/png/'+served+'.png')).arrayBuffer()),fs.readFileSync(path.join(__dirname,'../brand',source)));
  for(const id of ['utilities','logs'])for(const kind of ['avatar','banner']){
   const file='hn-'+id+'-'+kind;assert.ok(html.includes(file));
   const png=Buffer.from(await(await fetch(base+'/assets/brand/png/'+file+'.png')).arrayBuffer());
   assert.equal(png.readUInt32BE(16),kind==='avatar'?1024:1360);assert.equal(png.readUInt32BE(20),kind==='avatar'?1024:480);assert.ok(png.length<10*1024*1024);
   assert.deepEqual(png,fs.readFileSync(path.join(__dirname,'../brand/discord-bot',file+'.png')));
   const svg=await fetch(base+'/assets/brand/svg/'+file+'.svg');assert.equal(svg.status,200);const artwork=await svg.text();assert.match(artwork,/Horizon Network/);assert.doesNotMatch(artwork,/HN Group/);assert.ok(html.includes(file+'.png?v=20261114-horizon-network'));
  }
  const sites=JSON.parse(fs.readFileSync(path.join(__dirname,'../links-site/sites.json')));const entry=(Array.isArray(sites)?sites:sites.sites).find(x=>x.id==='branding');assert.equal(entry.access,'public');
 }finally{await new Promise(r=>server.close(r));}
});
