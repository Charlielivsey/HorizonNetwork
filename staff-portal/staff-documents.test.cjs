'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
test('staff documents links live sources, preserves private storage permission and verifies file ownership', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hn-staff-documents-'));
  const key = 'b'.repeat(64); fs.writeFileSync(path.join(dir, 'secret'), key);
  const contractId = '11111111-1111-4111-8111-111111111111'; let available = true;
  const server = http.createServer((req,res) => {
    assert.equal(req.headers.authorization, 'Bearer ' + key);
    if (!available) { res.writeHead(503); return res.end(); }
    if (req.url.startsWith('/api/service/staff/person/' + contractId + '/file')) { res.writeHead(200, {'Content-Type':'application/pdf'}); return res.end('%PDF-signed'); }
    res.writeHead(200, {'Content-Type':'application/json'});res.end(JSON.stringify({contracts:[{id:contractId,title:'Agreement',status:'completed',createdAt:'2026-11-01T00:00:00Z',completedAt:'2026-11-09T00:00:00Z',sender:'HR'}]}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  process.env.CONTRACTS_BACKEND = 'http://127.0.0.1:' + server.address().port;
  process.env.STATUS_SSO_SECRET_FILE = path.join(dir,'secret');
  const storage = require('./lib/storage-access'), old = {canOpen:storage.canOpen,storageOf:storage.storageOf,fromDocs:storage.fromDocs};
  let reads = 0, grant = false;
  storage.canOpen = () => grant;
  storage.storageOf = async () => {reads++;return {documents:[{id:'doc',title:'Letter',status:'draft',updatedAt:Date.now(),owner:'Person'}],files:[]};};
  storage.fromDocs = async () => ({type:'application/pdf',body:Buffer.from('%PDF-doc')});
  const linked = require('./lib/staff-documents');
  try {
    let d = await linked.listing('person',{id:'person',displayName:'Person'});
    assert.deepEqual(d.files.map(x=>x.source).sort(),['Contracts','Docs']); assert.deepEqual(d.unavailable,[]);
    const baseline=reads;
    d=await linked.listing('person',{id:'hr'});assert.deepEqual(d.files.map(x=>x.source),['Contracts']);assert.equal(reads,baseline,'HR access alone never opens private Docs');
    await assert.rejects(linked.read('person','documents','doc',{id:'hr'},false),{status:403});
    grant=true;assert.equal((await linked.listing('person',{id:'hr'})).files.length,2);
    await assert.rejects(linked.read('person','documents','someone-elses-document',{id:'hr'},false),{status:404});
    assert.equal((await linked.read('person','documents','doc',{id:'hr'},false)).body.toString(),'%PDF-doc');
    assert.equal((await linked.read('person','contracts',contractId,{id:'person'},false)).body.toString(),'%PDF-signed');
    available=false;d=await linked.listing('person',{id:'person'});assert.deepEqual(d.unavailable,['Contracts']);assert.equal(d.files[0].source,'Docs','one offline service does not hide the other source');
    storage.storageOf=async()=>({documents:[],files:[]});available=true;d=await linked.listing('person',{id:'person'});assert.equal(d.files.length,1,'deleted Docs files disappear without a stale copy');
  } finally {Object.assign(storage,old);await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
