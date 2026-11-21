'use strict';
// Run only with hn-docs stopped, or against an isolated copy. Never signs in or finalises a policy.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=process.env.HN_POLICY_DATA_DIR;if(!dir)throw Error('HN_POLICY_DATA_DIR is required. Stop the sole writer before using production data.');
const runtime=process.env.HN_POLICY_RUNTIME||'/opt/hn-docs';const store=require(path.join(runtime,'lib/store')),policy=require(path.join(runtime,'lib/hn-operations-policy.json'));
const before=JSON.parse(fs.readFileSync(path.join(dir,'documents.json'),'utf8'));if(Object.values(before.documents).some(d=>d.template==='policy'&&d.company==='horizon-network'&&/operations\s*policy/i.test(d.title)))throw Error('An HN Operations Policy already exists; refusing to duplicate or overwrite it.');
const person=Object.entries(before.people).find(([id,p])=>p.email==='charlie.livsey@hngroup.org.uk'&&p.jobTitle==='Board Chairman');if(!person)throw Error('Expected existing Charlie Docs identity not found.');const user={id:person[0],...person[1],admin:true};
const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const body='<p><strong>Working draft — not yet approved or effective.</strong> Prepared from the supplied notes. Drafting decisions requiring confirmation are listed at the end.</p>'+policy.articles.map(([title,clauses],i)=>'<h2>Article '+(i+1)+' — '+esc(title)+'</h2>'+clauses.map(([n,t])=>'<p>'+n+' — '+esc(t)+'</p>').join('')).join('')+'<h2>Drafting decisions to confirm</h2><p><em>Review notes only; these are not operative policy provisions.</em></p><ul>'+policy.notes.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>';
store.init(dir);
const numbered=[];
for(const d of Object.values(before.documents))if(d.template==='executive-directive'&&(!String(d.fields.reference||'').trim()||/^\[[^\]]*\]$/.test(String(d.fields.reference).trim()))&&(d.ownerId===user.id||d.sharing==='staff')){const saved=store.update(d.id,user,{version:d.version});store.audit(null,'automatic ED number assigned',store.get(d.id,user),{reference:saved.fields.reference});numbered.push({id:d.id,reference:saved.fields.reference});}
const created=store.create(user,{company:'horizon-network',template:'policy',title:policy.title,sharing:'staff',body,fields:{owner:policy.owner,version:'0.1',effective:'Pending approval',review:'To be agreed'}});
assert.equal(created.status,'draft');assert.equal(created.history.length,0);assert.equal(created.draftHistory.length,1);assert.equal(created.fields.version,'0.1');
const after=JSON.parse(fs.readFileSync(path.join(dir,'documents.json'),'utf8'));
assert.equal(Object.keys(after.documents).length,Object.keys(before.documents).length+1);
for(const[id,old]of Object.entries(before.documents)){const d=after.documents[id];if(numbered.some(n=>n.id===id)){assert.equal(d.body,old.body);assert.equal(d.company,old.company);assert.equal(d.status,old.status);const fields={...d.fields};delete fields.reference;const original={...old.fields};delete original.reference;assert.deepEqual(fields,original);}else assert.deepEqual(d,old);}
for(const key of ['files','people','avatars','seeds'])assert.deepEqual(after[key],before[key]);
const report={id:created.id,url:'https://docs.hngroup.org.uk/doc/'+created.id,title:created.title,status:created.status,version:created.fields.version,draftHistory:created.draftHistory,numbered,existingDocumentsPreserved:Object.keys(before.documents).length};
const reportPath=process.env.HN_POLICY_REPORT;if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
