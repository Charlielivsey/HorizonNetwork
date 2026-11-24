'use strict';
// Run against an isolated copy first; production requires hn-docs stopped (sole writer).
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dir=process.env.HN_POLICY_DATA_DIR,expected=process.env.HN_POLICY_EXPECTED_SHA,root=process.env.HN_POLICY_SOURCE||path.resolve(__dirname,'..');
if(!dir||!/^[a-f0-9]{64}$/.test(expected||''))throw Error('Provide the exact data directory and baseline SHA-256. Stop hn-docs before production execution.');
const file=path.join(dir,'documents.json'),bytes=fs.readFileSync(file);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),expected,'Live data changed; take a fresh snapshot and rehearse again.');
const baseline=JSON.parse(bytes),id='8664a53c-3167-45bc-bc2d-8d688866ddb9',old=baseline.documents[id],person=baseline.people[old?.ownerId];
assert.equal(old?.template,'policy');assert.equal(old.company,'horizon-network');assert.equal(old.status,'draft');assert.equal(person?.email,'charlie.livsey@hngroup.org.uk');assert.equal(old.fields.version,'0.1','This revision has already been applied or the policy changed.');
const store=require(path.join(root,'docs-site/lib/store')),policy=require(path.join(root,'docs-site/lib/hn-operations-policy.json')),catalog=require(path.join(root,'docs-site/lib/catalog'));
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const body='<p><strong>Working draft — not yet approved or effective.</strong> Revised from the supplied Word document. Review notes requiring confirmation are listed at the end.</p>'+policy.articles.map(([title,clauses],i)=>'<h2>Article '+(i+1)+' — '+esc(title)+'</h2>'+clauses.map(([n,t])=>'<p><strong>'+n+'</strong> — '+esc(t)+'</p>').join('')).join('')+'<h2>Drafting decisions to confirm</h2><p><em>Review notes only; these are not operative policy provisions.</em></p><ul>'+policy.notes.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>';
try{
 store.init(dir);const user={id:old.ownerId,...person,admin:true};const revised=store.update(id,user,{version:old.version,body,fields:{...old.fields,version:policy.version}});
 const after=JSON.parse(fs.readFileSync(file));
 for(const[key,value]of Object.entries(baseline.documents))if(key!==id)assert.deepEqual(after.documents[key],value);
 assert.equal(Object.keys(after.documents).length,Object.keys(baseline.documents).length);
 for(const key of ['files','people','avatars','seeds','removals'])assert.deepEqual(after[key],baseline[key]);
 for(const[key,value]of Object.entries(baseline.sessions))if(value.expires>Date.now())assert.deepEqual(after.sessions[key],value);
 const d=after.documents[id];for(const key of ['owner','ownerId','ownerEmail','company','sharing','createdAt','status','protected','confidential'])assert.deepEqual(d[key],old[key]);
 assert.deepEqual(d.policy.history,old.policy.history);assert.deepEqual(d.policy.drafts.slice(0,-1),old.policy.drafts);assert.equal(d.policy.drafts.length,old.policy.drafts.length+1);
 for(const[,clauses]of policy.articles)for(const[n,t]of clauses)assert.ok(d.body.includes(esc(t)),'Missing clause '+n);
 const out=process.env.HN_POLICY_OUTPUT;if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'policy.json'),JSON.stringify(revised,null,2));fs.writeFileSync(path.join(out,'Horizon-Network-Operations-Policy-Current.docx'),require(path.join(root,'docs-site/lib/docx')).renderDocx(revised,catalog.company(d.company),catalog.template(d.template)));fs.writeFileSync(path.join(out,'Horizon-Network-Operations-Policy-Current.pdf'),require(path.join(root,'docs-site/lib/pdf')).renderDocument(revised,catalog.company(d.company),catalog.template(d.template)));}
 console.log(JSON.stringify({id,url:'https://docs.hngroup.org.uk/doc/'+id,version:revised.fields.version,status:revised.status,articles:policy.articles.length,draftSaves:revised.draftHistory.length,priorDraftPreserved:true,otherDocumentsPreserved:true}));
}catch(e){fs.writeFileSync(file,bytes);throw e;}
