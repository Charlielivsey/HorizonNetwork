'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
test('real staff directory returns legal names and each enabled company profile for the Contracts signer picker',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hn-directory-')),secret='a'.repeat(64),previous=process.env.STATUS_SSO_SECRET_FILE;
 fs.writeFileSync(path.join(dir,'secret'),secret);process.env.STATUS_SSO_SECRET_FILE=path.join(dir,'secret');
 const store=require('./lib/store');store.init(dir);
 const [company,otherCompany]=store.COMPANIES,domain=store.COMPANY_DOMAINS[company];
 const make=(first,discordId)=>store.saveEmployee({firstName:first,lastName:'Tester',jobTitle:'Designer',company,emails:[{domain,auto:true,primary:true}],discordId},null);
 const jo=make('Jo','123456789012345678');jo.displayName='Artist';jo.otherRoles=[{company:otherCompany,jobTitle:'Producer'}];store.savePeople();store.issueTemporaryPassword(jo);
 const disabled=make('Disabled','223456789012345678');store.issueTemporaryPassword(disabled);store.setAccountEnabled(disabled,false);
 const unlinked=make('Unlinked','323456789012345678');
 const {createStatusSso}=require('./lib/status-sso');
 const handle=createStatusSso({store,sessions:{},sendJson(res,status,value){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));},async readJsonBody(req){let text='';for await(const c of req)text+=c;return JSON.parse(text||'{}');}});
 const server=http.createServer(async(req,res)=>{try{if(!await handle(req,res,req.url,null)){res.writeHead(404);res.end();}}catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/api/auth/staff-directory';
 try{
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,401,'service secret required');
  const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,200);const {people}=await response.json();
  const profiles=people.filter(p=>p.accountIds.length&&p.legalName==='Jo Tester');assert.equal(profiles.length,2);assert.deepEqual(profiles.map(p=>p.company).sort(),[company,otherCompany].sort());assert.ok(profiles.every(p=>p.displayName==='Artist'));assert.ok(profiles.every(p=>p.accountIds.length===1));assert.ok(profiles.some(p=>p.jobTitle==='Producer'));
  assert.ok(!people.some(p=>p.id===disabled.id||p.id===unlinked.id));assert.ok(people.every(p=>!('account' in p)&&!('password' in p)));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});if(previous===undefined)delete process.env.STATUS_SSO_SECRET_FILE;else process.env.STATUS_SSO_SECRET_FILE=previous;}
});
