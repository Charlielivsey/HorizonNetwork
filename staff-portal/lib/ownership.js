'use strict';
const normalise=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/['’]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
// The owner explicitly identified Val as Vee; preserve that known name change without fuzzy guesses.
const ALIASES={'vee g':['val g']};
function matchOwnership(person,feed){
 const full=normalise([person.firstName,person.lastName].filter(Boolean).join(' '));
 const names=new Set([full,...(ALIASES[full]||[])] .filter(Boolean));
 const display=normalise(person.displayName);if(display.split(' ').length>=2)names.add(display);
 if(!names.size)return [];
 return (feed.companies||[]).filter(c=>/^[a-z0-9-]+$/.test(c.slug||'')).flatMap(c=>{
  const rows=(c.owners||[]).filter(o=>o.kind==='Individual'&&names.has(normalise(o.name))&&Number.isFinite(Number(o.share))&&Number(o.share)>0&&Number(o.share)<=100);
  if(!rows.length)return [];
  const ownership=rows.reduce((n,o)=>n+Number(o.share),0);if(ownership>100+1e-6)return [];
  const votes=rows.every(o=>o.votes!==null&&o.votes!==''&&Number.isFinite(Number(o.votes)))?rows.reduce((n,o)=>n+Number(o.votes),0):null;
  return [{company:c.legalName||c.name,slug:c.slug,url:'https://companies.hngroup.org.uk/company/'+c.slug,delegations:rows.flatMap(o=>o.delegations?.length?o.delegations.map(d=>({name:d.name,votingPercent:Number(d.votes)})):o.delegatedTo&&Number(o.delegatedVotes)>0?[{name:o.delegatedTo,votingPercent:Number(o.delegatedVotes)}]:[]),receivedFrom:rows.flatMap(o=>o.receivedFrom||[]),ownershipPercent:ownership,votingPercent:votes!==null&&votes>=0&&votes<=100+1e-6?votes:null}];
 }).sort((a,b)=>a.company.localeCompare(b.company));
}
function createOwnership({fetcher=fetch,backend='http://127.0.0.1:4900',now=Date.now,ttl=30000}={}){
 let cached,expires=0,inflight;
 async function load(){if(cached&&expires>now())return cached;if(inflight)return inflight;
  inflight=(async()=>{const r=await fetcher(backend+'/api/public/companies',{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error('Company register unavailable.');let size=0,chunks=[];for await(const part of r.body){size+=part.length;if(size>5*1024*1024)throw Error('Company register response too large.');chunks.push(Buffer.from(part));}const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!Array.isArray(data.companies))throw Error('Invalid company register response.');cached=data;expires=now()+ttl;return data;})();try{return await inflight;}finally{inflight=null;}
 }
 return{forPerson:async person=>({holdings:matchOwnership(person,await load()),source:'Companies register'})};
}
module.exports={normalise,matchOwnership,createOwnership};
