'use strict';
const crypto=require('node:crypto');
const aliases={'charlie livsey':['echo','catnap'],'jack vinckx':['jack'],'human h':['human'],'ash newton':['ash'],'evan strong':['evan'],'dion mckew':['dion'],'val g':['vee','val']};
const normal=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const round=n=>Math.round(n*1e8)/1e8;
const text=(s,n=160)=>String(s||'').slice(0,n);
const number=(v,nullable=false)=>{if(v===null||v===undefined||v===''){if(nullable)return null;return 0;}const n=Number(v);if(!Number.isFinite(n)||n<0||n>100.000001)throw Error('Invalid register percentage');return n;};
function project(publicPeople,register){
 if(!Array.isArray(publicPeople.people)||!Array.isArray(publicPeople.positions)||!Array.isArray(register.companies))throw Error('Invalid published data');
 const people=publicPeople.people.filter(p=>/^[a-f0-9]{16}$/.test(p.id)).map(p=>({id:p.id,name:text(p.name),photo:!!p.photo,roles:(p.roles||[]).map(r=>({company:text(r.company),jobTitle:text(r.jobTitle),temporary:!!r.temporary}))}));
 const ids=new Set(people.map(p=>p.id));
 const positions=publicPeople.positions.map(p=>({key:text(p.key,600),company:text(p.company),title:text(p.title),collective:!!p.collective,holders:(p.holders||[]).filter(id=>ids.has(id)),temporaryHolders:(p.temporaryHolders||[]).filter(id=>ids.has(id)),reportsTo:p.reportsTo?{company:text(p.reportsTo.company),title:text(p.reportsTo.title),kind:p.reportsTo.kind==='board'?'board':undefined}:null}));
 const companies=register.companies.filter(c=>/^[a-z0-9-]{1,60}$/.test(c.slug)).map(c=>{
  const owners=(c.owners||[]).map(o=>{const names=new Set([normal(o.name),...(aliases[normal(o.name)]||[])]),matches=o.kind==='Individual'?people.filter(p=>names.has(normal(p.name))):[];return{name:text(o.name),kind:text(o.kind),equity:number(o.share),votes:number(o.votes,true),classes:o.classes?Object.fromEntries(['A','B','C'].map(k=>[k,number(o.classes[k])])):null,delegations:(o.delegations||[]).map(d=>({name:text(d.name),votes:number(d.votes),percent:number(d.percent)})),receivedFrom:(o.receivedFrom||[]).map(d=>({name:text(d.name),votes:number(d.votes)})),personId:matches.length===1?matches[0].id:null};}).filter(o=>o.equity>0||(o.votes??0)>0||o.delegations.length);
  const model={shareModel:text(c.shareModel),minimum:number(c.founderVotingMinimum,true),owners};
  return{slug:c.slug,name:text(c.name),legalName:text(c.legalName),staffCompany:(publicPeople.companies||[]).find(n=>normal(n)===normal(c.name)||slug(n)===c.slug)||({'horizon-media':'Horizon Media Group'}[c.slug])||text(c.name),updatedAt:c.updatedAt,fingerprint:crypto.createHash('sha256').update(JSON.stringify({...model,owners:owners.map(({personId,...owner})=>owner)})).digest('hex'),...model,totals:{equity:round(owners.reduce((n,o)=>n+o.equity,0)),votes:owners.every(o=>o.votes!==null)?round(owners.reduce((n,o)=>n+o.votes,0)):null,owners:owners.filter(o=>o.equity>0).length,recipients:owners.filter(o=>o.equity===0&&(o.votes??0)>0).length}};
 });
 return{companies,people,positions};
}
async function readJson(url,fetcher){const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(6000),headers:{Accept:'application/json'}});if(!r.ok)throw Error('Published source unavailable');let size=0,chunks=[];for await(const chunk of r.body){size+=chunk.length;if(size>5*1024*1024)throw Error('Published source too large');chunks.push(Buffer.from(chunk));}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
function createData({peopleBase='http://127.0.0.1:5670',companiesBase='http://127.0.0.1:4900',fetcher=fetch,now=Date.now,ttl=10000}={}){let cache,pending;return{load:async()=>{if(cache&&now()-cache.at<ttl)return cache.value;if(pending)return pending;pending=(async()=>{try{const[p,c]=await Promise.all([readJson(peopleBase+'/api/people',fetcher),readJson(companiesBase+'/api/public/companies',fetcher)]);const value={...project(p,c),retrievedAt:new Date(now()).toISOString(),stale:false};cache={at:now(),value};return value;}catch(e){if(cache&&now()-cache.at<300000)return{...cache.value,stale:true};throw e;}finally{pending=null;}})();return pending;}};}
module.exports={project,createData};
