'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const store=require('./lib/store'),badges=require('./lib/badges');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT+8AAAAASUVORK5CYII=';
function make(name){return store.saveEmployee({firstName:name,lastName:'Fixture',displayName:'Alias',company:'HN Group',jobTitle:'Member',discordId:'123456789012345678',emails:[{local:name.toLowerCase().replace(/[^a-z]/g,''),domain:'hngroup.org.uk',primary:true}]});}
test('automatic issuance, immutable name/photo snapshots, selections, pending staff and historical superseding',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-badge-unit-'));
 try{
  store.init(dir);const a=make('Alpha'),b=make('Beta'),c=make('Charlie');assert.equal(badges.mine(a.id).pending,true);
  store.saveAvatar(a,png);store.saveAvatar(b,png);const old=badges.mine(a.id).badge,original=badges.artwork(old.id).body.toString();assert.match(original,/Alpha Fixture/);assert.doesNotMatch(original,/>Alias</);assert.match(original,/data:image\/png;base64/);
  store.saveEmployee({...a,firstName:'Renamed',emails:[{local:'alpha',domain:'hngroup.org.uk',primary:true}]},a);store.removeAvatar(a);assert.equal(badges.mine(a.id).badge.id,old.id);assert.equal(badges.mine(a.id).changed,true);assert.equal(badges.artwork(old.id).body.toString(),original);
  store.saveAvatar(a,'data:image/png;base64,'+Buffer.concat([Buffer.from(png.split(',')[1],'base64'),Buffer.from('new-photo-version')]).toString('base64'));assert.equal(badges.artwork(old.id).body.toString(),original);let before=fs.readFileSync(path.join(dir,'staff-badges.json'),'utf8');for(const input of [{scope:'selected',personIds:[]},{scope:'selected',personIds:[a.id,'missing']},{scope:'all',personIds:[]},{scope:'bogus'}])assert.throws(()=>badges.reissue(input,'admin'));assert.equal(fs.readFileSync(path.join(dir,'staff-badges.json'),'utf8'),before);
  const result=badges.reissue({scope:'selected',personIds:[a.id,a.id,c.id]},'admin');assert.equal(result.issued.length,1);assert.equal(result.skipped.length,1);assert.equal(badges.mine(a.id).badge.issue,2);assert.equal(badges.mine(b.id).badge.issue,1);assert.match(badges.artwork(old.id).body.toString(),/SUPERSEDED/);assert.match(badges.artwork(badges.mine(a.id).badge.id).body.toString(),/Renamed Fixture/);
  const all=badges.reissue({scope:'all'},'admin');assert.equal(all.issued.length,2);assert.equal(all.skipped.length,1);store.saveAvatar(c,png);assert.equal(badges.mine(c.id).badge.issue,1);
  store.init(dir);assert.equal(badges.mine(a.id).badge.issue,3);assert.equal(fs.statSync(path.join(dir,'staff-badges.json')).mode&0o777,0o600);assert.equal(badges.list().length,3);
  const other=fs.mkdtempSync(path.join(os.tmpdir(),'hn-badge-reinit-'));try{store.init(other);assert.deepEqual(badges.list(),[]);}finally{fs.rmSync(other,{recursive:true,force:true});}
 }finally{badges.reset();fs.rmSync(dir,{recursive:true,force:true});}
});
test('transaction failure preserves current register and cleans staged photos',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-badge-atomic-'));try{store.init(dir);const a=make('Atomic');store.saveAvatar(a,png);const original=fs.readFileSync(path.join(dir,'staff-badges.json'),'utf8'),files=fs.readdirSync(path.join(dir,'badge-photos'));fs.mkdirSync(path.join(dir,'staff-badges.json.tmp'));assert.throws(()=>badges.reissue({scope:'all'},'admin'));assert.equal(fs.readFileSync(path.join(dir,'staff-badges.json'),'utf8'),original);assert.deepEqual(fs.readdirSync(path.join(dir,'badge-photos')),files);}finally{badges.reset();fs.rmSync(dir,{recursive:true,force:true});}
});
test('long multilingual names fit badge area and XML markup is escaped',()=>{
 for(const name of ['A very long name with several extraordinarilylongparts beyond ordinary widths','王'.repeat(100),'<script>alert("x")</script>']){const layout=badges.nameLines(name);assert.ok(layout.lines.length*layout.size*1.22<=210);assert.ok(layout.lines.every(line=>line.length<80));}
});
