'use strict';
// Offline, single-writer correction authorised by the owner's 18 November request.
// Run only while hn-companies is stopped. Data path and exact pre-change hash are mandatory.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const CHARLIE='3ff9d29693db3ad015bf6aa6',HN='180668e4dc0463a182aa2e38';
const OTHERS=['ad30b9b74ff0d2919dff5400','5c57844f2bbf21e716d8be82','6e294677d8bcff5c19987a49','5236162d076f5b12d308cab4','a842f7f290485451559b00ae','8ce903dcf33d5724497fc39b'];
const FOOTER="Generated automatically by the Company Register run by HN Group Limited from the details recorded at the time. This is a group register document, not a filing with the UK government's Companies House.";
function apply({dataDir,expectedHash,reference}){
 assert.ok(path.isAbsolute(dataDir),'Absolute data directory required');assert.match(expectedHash,/^[a-f0-9]{64}$/);assert.ok(reference,'Written instruction reference required');
 const file=path.join(dataDir,'register.json'),raw=fs.readFileSync(file);assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),expectedHash,'Register changed after preparation; inspect before applying');
 const before=JSON.parse(raw),old=before.companies.find(c=>c.slug==='horizon-network');assert.equal(old.shareModel,'founder75');assert.ok(!old.allocationCorrections?.includes(reference),'This instruction was already applied');assert.equal((old.votingDelegations||[]).length,0,'Review existing delegations before changing voting control');
 const active=old.psc.filter(p=>!p.ceased);assert.deepEqual(active.map(p=>p.id).sort(),[CHARLIE,HN,...OTHERS].sort(),'Unexpected holder changes require review');assert.ok(Number(active.find(p=>p.id===CHARLIE).classA)>=45,'Insufficient retained founder shares');assert.equal(active.reduce((n,p)=>n+Number(p.share||0),0),100);
 const filesDir=path.join(dataDir,'files'),priorFiles=new Set(fs.readdirSync(filesDir));
 process.env.COMPANIES_GROUP_UPDATES='off';process.env.COMPANIES_SEED='off';const store=require('../companies-site/lib/store'),pdf=require('../companies-site/lib/pdf');
 try{
  store.init(dataDir);const c=store.company(old.slug),date=new Date().toISOString().slice(0,10),actor='owner-request:'+reference;
  for(const p of c.psc.filter(p=>!p.ceased)){
   const n=p.id===CHARLIE?45:p.id===HN?0:5;p.share=String(n);p.classA=p.id===CHARLIE?45:'';p.classB=OTHERS.includes(p.id)?5:'';p.classC='';p.classCIssuedBy='';if(p.id===HN)p.ceased=date;
  }
  const co={id:crypto.randomBytes(12).toString('hex'),name:'Community Organisation',kind:'Relevant legal entity',share:'25',classA:'',classB:25,classC:'',classCIssuedBy:'',control:[],notified:date,ceased:''};c.psc.push(co);
  const v=store.votingCalculation(c);assert.equal(v.holders[CHARLIE].votes,75);assert.equal(v.founderVotes,75);
  const bands=(value,label)=>value>=75?[label+' – 75% or more']:value>50?[label+' – more than 50% but less than 75%']:value>25?[label+' – more than 25% but not more than 50%']:[];
  for(const p of c.psc){p.control=p.ceased?[]:[...bands(Number(p.share),'Ownership of shares'),...bands(v.holders[p.id]?.votes||0,'Ownership of voting rights')];}
  c.capitalHistory=[...(c.capitalHistory||[]),{id:crypto.randomBytes(12).toString('hex'),at:new Date().toISOString(),action:'owner-allocation-correction',reference,consent:reference,before:active.map(p=>({id:p.id,name:p.name,share:p.share,classA:p.classA,classB:p.classB})),after:c.psc.filter(p=>!p.ceased).map(p=>({id:p.id,name:p.name,share:p.share,classA:p.classA,classB:p.classB}))}];c.allocationCorrections=[...(c.allocationCorrections||[]),reference];c.updatedAt=new Date().toISOString();
  const newFilings=[];
  function filing(code,category,description,rows){const spec={code,heading:description,company:c.legalName,number:c.number||'',date,rows:[['Company',c.legalName],['Effective date',date],['Owner instruction reference',reference],...rows],footer:FOOTER};const f=store.addFiling(c.slug,{date,category,description,source:'generated'},pdf.build(spec),actor);f.doc={code:spec.code,heading:spec.heading,company:spec.company,number:spec.number,rows:spec.rows};newFilings.push(f);return f;}
  for(const p of c.psc.filter(p=>OTHERS.includes(p.id)||p.id===CHARLIE)){
   const previous=active.find(x=>x.id===p.id);filing('REG-PSC2','Persons with significant control','Change of shareholding and control details of '+p.name,[['Holder',p.name],['Previous ownership',previous.share+'%'],['New ownership',p.share+'%'],['New share classes','Class A '+(p.classA||0)+'%; Class B '+(p.classB||0)+'%'],['Effective voting rights',String(v.holders[p.id].votes)+'%'],['Nature of control',p.control.join('; ')||'No control band recorded']]);
  }
  filing('REG-PSC3','Persons with significant control','Cessation of HN Group as a shareholder and person with significant control',[['Name',old.psc.find(p=>p.id===HN).name],['Previous ownership',old.psc.find(p=>p.id===HN).share+'%'],['New ownership','0%'],['Ceased on',date]]);
  co.notificationFiling=filing('REG-PSC1','Persons with significant control','Notification of Community Organisation as a shareholder',[['Name',co.name],['Type',co.kind],['Ownership','25%'],['Share class','Ordinary Class B'],['Effective voting rights',String(v.holders[co.id].votes)+'%'],['Notified on',date]]).id;
  filing('REG-CAP','Capital','Statement of capital following owner-authorised shareholding changes',[['Total ownership','100%'],['Founder Class A','45% equity; 75% of votes'],['Ordinary Class B','55% equity; 25% of votes'],['Founder transfer rule','Transferred founder holdings convert to ordinary Class B; founder voting minimum preserved'],['Economic rights','Dividends and capital distributions remain proportionate to ownership'],...c.psc.filter(p=>!p.ceased).map(p=>[p.name,p.share+'% ownership; '+v.holders[p.id].votes+'% voting power'])]);
  store.audit(actor,'capital.owner-allocation',c.slug+' '+reference);store.save();
  const after=JSON.parse(fs.readFileSync(file)),updated=after.companies.find(x=>x.slug===old.slug);assert.deepEqual(after.companies.filter(x=>x.slug!==old.slug),before.companies.filter(x=>x.slug!==old.slug));for(const k of ['customers','requests','submissions'])assert.deepEqual(after[k],before[k]);assert.ok(before.filings.every(f=>after.filings.some(g=>JSON.stringify(f)===JSON.stringify(g))));assert.equal(updated.psc.filter(p=>!p.ceased).reduce((n,p)=>n+Number(p.share),0),100);assert.equal(newFilings.length,10);for(const f of newFilings)assert.ok(fs.readFileSync(store.filePath(f.file)).subarray(0,5).equals(Buffer.from('%PDF-')));
  return {company:updated.legalName,reference,holders:updated.psc.filter(p=>!p.ceased).map(p=>({name:p.name,ownership:Number(p.share),classA:Number(p.classA||0),classB:Number(p.classB||0),votes:v.holders[p.id].votes})),filings:newFilings.map(f=>({id:f.id,category:f.category,description:f.description,file:f.file}))};
 }catch(e){fs.writeFileSync(file,raw);for(const f of fs.readdirSync(filesDir))if(!priorFiles.has(f))fs.rmSync(path.join(filesDir,f));throw e;}
}
module.exports={apply};
if(require.main===module){const[dataDir,expectedHash,reference]=process.argv.slice(2);try{console.log(JSON.stringify(apply({dataDir,expectedHash,reference}),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
