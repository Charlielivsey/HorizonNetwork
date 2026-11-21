'use strict';
const crypto=require('node:crypto');
const round=n=>Math.round(n*1e8)/1e8,fail=text=>Object.assign(Error(text),{status:400}),key=s=>String(s||'').trim().toLowerCase();
const active=c=>(c.psc||[]).filter(p=>!p.ceased);
const policy=c=>c?.shareModel==='founder75';
const minimum=c=>Number.isFinite(c?.founderVotingMinimum)&&c.founderVotingMinimum>=0&&c.founderVotingMinimum<=100?c.founderVotingMinimum:75;
function calculation(c){
 const people=active(c),a=people.reduce((n,p)=>n+Number(p.classA||0),0),b=people.reduce((n,p)=>n+Number(p.classB||0),0),total=a+b;
 const founder=a?b?Math.max(minimum(c),a/total*100):100:0,multiplier=a&&b&&founder<100?Math.max(1,(founder/(100-founder))*b/a):1,holders={},controllers=new Map();
 for(const p of people){const votes=total?Number(p.classA||0)/(a||1)*founder+Number(p.classB||0)/(b||1)*(100-founder):0;holders[p.id]={votes,beneficialVotes:votes,control:votes>=50,founder:Number(p.classA||0)>0};controllers.set('holder:'+p.id,{id:'holder:'+p.id,name:p.name,kind:p.kind,votes});}
 for(const d of c.votingDelegations||[]){const from=holders[d.holder],person=people.find(p=>p.id===d.holder);if(!from||!person||!Number.isFinite(d.percent)||d.percent<=0||d.percent>100)continue;
  const same=people.find(p=>key(p.name)===key(d.name)&&(d.kind==='Individual'?p.kind==='Individual':p.kind!=='Individual')),target=same?'holder:'+same.id:'delegate:'+d.id;if(target==='holder:'+d.holder)continue;
  const amount=from.beneficialVotes*d.percent/100;from.votes-=amount;from.delegatedVotes=(from.delegatedVotes||0)+amount;from.delegationPercent=(from.delegationPercent||0)+d.percent;(from.delegations||=[]).push({name:d.name,kind:d.kind,votes:round(amount),percent:d.percent});from.delegatedTo=from.delegations.map(x=>x.name).join('; ');
  controllers.get('holder:'+d.holder).votes-=amount;
  if(!controllers.has(target))controllers.set(target,{id:target,name:d.name,kind:d.kind,votes:0});controllers.get(target).votes+=amount;
  if(same){holders[same.id].receivedVotes=(holders[same.id].receivedVotes||0)+amount;(holders[same.id].receivedFrom||=[]).push({name:person.name,votes:round(amount)});}
 }
 for(const v of Object.values(holders)){v.votes=round(v.votes+(v.receivedVotes||0));v.beneficialVotes=round(v.beneficialVotes);v.control=v.votes>=50;}
 return{holders,controllers:[...controllers.values()].map(x=>({...x,votes:round(x.votes)})).filter(x=>x.votes>0).sort((x,y)=>y.votes-x.votes),founderVotes:round(founder),votesPerFounderShare:founder===100&&b>0?null:multiplier};
}
function ensure(c){if(!policy(c))throw fail('This company uses the existing share rules.');}
function consent(input){const ref=String(input.consent||input.founderConsent||'').trim();if(ref.length<3||ref.length>300)throw fail('Record the written founder consent reference before reducing or transferring founder rights.');return ref;}
function amount(value,label='Amount'){const n=Number(value);if(!Number.isFinite(n)||n<=0||n>100)throw fail(label+' must be greater than 0 and at most 100.');return n;}
function sync(p){p.classA=round(Number(p.classA||0))||'';p.classB=round(Number(p.classB||0))||'';p.classC='';p.classCIssuedBy='';p.share=String(round(Number(p.classA||0)+Number(p.classB||0)));}
function transaction(company,input){
 ensure(company);const c=structuredClone(company),people=active(c),action=input.action;let consentReference='';
 const from=people.find(p=>p.id===input.from),to=people.find(p=>p.id===input.to),n=amount(input.amount),classKey=input.class==='A'?'classA':'classB';
 if(action!=='issue'&&!['A','B'].includes(input.class))throw fail('Choose Class A or Class B.');
 if(action==='issue'&&n>=100)throw fail('New ordinary shares must leave some existing ownership in place.');
 if(action==='transfer'){
  if(!from||!to||from===to)throw fail('Choose two different current holders.');if(Number(from[classKey]||0)+1e-9<n)throw fail('The sender does not hold that amount of this class.');if(classKey==='classA')consentReference=consent(input);
  if(input.transferTreatment&&!['convert','retain'].includes(input.transferTreatment))throw fail('Choose whether to retain founder Class A or convert to ordinary Class B.');const targetClass=classKey==='classA'&&input.transferTreatment==='retain'?'classA':'classB';from[classKey]=Number(from[classKey]||0)-n;to[targetClass]=Number(to[targetClass]||0)+n;
 }else if(action==='issue'){
  if(!to)throw fail('Choose a current holder (add a zero-share holder first if needed).');const total=people.reduce((s,p)=>s+Number(p.share||0),0);if(total<=0)throw fail('Existing capital must be recorded first.');const factor=(100-n)/total;
  for(const p of people){p.classA=Number(p.classA||0)*factor;p.classB=Number(p.classB||0)*factor;}to.classB=Number(to.classB||0)+n;
 }else if(action==='cancel'){
  if(!from||Number(from[classKey]||0)+1e-9<n)throw fail('The holder does not hold that amount of this class.');if(classKey==='classA')consentReference=consent(input);from[classKey]=Number(from[classKey]||0)-n;
  const total=people.reduce((s,p)=>s+Number(p.classA||0)+Number(p.classB||0),0);if(total<=0)throw fail('Cancellation cannot leave the register without issued shares.');for(const p of people){p.classA=Number(p.classA||0)*100/total;p.classB=Number(p.classB||0)*100/total;}
 }else throw fail('Choose issue, transfer or cancel.');
 for(const p of people)sync(p);
 c.capitalHistory=[...(c.capitalHistory||[]),{id:crypto.randomBytes(12).toString('hex'),at:new Date().toISOString(),action,amount:n,class:action==='issue'?'B':input.class==='A'?'A':'B',from:from?.id||null,to:to?.id||null,receivedClass:action==='transfer'&&input.class==='A'&&input.transferTreatment==='retain'?'A':'B',consent:consentReference}];
 return c;
}
function delegate(company,input,actor){
 ensure(company);if(!['delegate','revoke'].includes(input.action))throw fail('Choose delegate or revoke.');const c=structuredClone(company),holder=active(c).find(p=>p.id===input.holder);if(!holder)throw fail('Choose a current holder.');const previous=(c.votingDelegations||[]).filter(d=>d.holder===holder.id);if(input.action==='revoke'&&!previous.length)throw fail('This holder has no delegation to revoke.');
 const append=input.append===true||input.append==='on';c.votingDelegations=(c.votingDelegations||[]).filter(d=>d.holder!==holder.id||input.action==='delegate'&&append);
 if(input.action!=='revoke'){
  const name=String(input.name||'').trim(),kind=input.kind==='Company'?'Company':input.kind==='Individual'?'Individual':null,percent=Number(input.percent||100);if(!name||name.length>160||!kind||!Number.isFinite(percent)||percent<=0||percent>100)throw fail('Enter the delegate’s name, type and a voting percentage from greater than 0 up to 100.');if(key(name)===key(holder.name))throw fail('A holder cannot delegate voting rights to themselves.');if(Number(holder.classA||0)>0)consent(input);
  const kept=c.votingDelegations.filter(d=>d.holder===holder.id);if(kept.some(d=>key(d.name)===key(name)&&d.kind===kind))throw fail('This recipient already has a delegation from this holder. Replace the instructions to change it.');if(kept.reduce((n,d)=>n+d.percent,0)+percent>100+1e-8)throw fail('Total delegations cannot exceed 100% of this holder’s voting rights.');
  c.votingDelegations.push({id:crypto.randomBytes(12).toString('hex'),holder:holder.id,name,kind,percent,at:new Date().toISOString(),by:actor,consent:Number(holder.classA||0)>0?consent(input):''});
 }
 c.delegationHistory=[...(c.delegationHistory||[]),{action:input.action,holder:holder.id,previous,entry:input.action==='revoke'?null:c.votingDelegations.at(-1),at:new Date().toISOString(),by:actor}];return c;
}
function setMinimum(company,input,actor){ensure(company);const value=Number(input.minimum);if(input.minimum===undefined||String(input.minimum).trim()===''||!Number.isFinite(value)||value<0||value>100)throw fail('Enter a voting minimum from 0 to 100.');const c=structuredClone(company);if(value===minimum(c))return c;const ref=consent(input);c.founderVotingMinimum=value;c.votingPolicyHistory=[...(c.votingPolicyHistory||[]),{at:new Date().toISOString(),by:actor,previous:minimum(company),minimum:value,consent:ref}];return c;}
module.exports={policy,minimum,calculation,transaction,delegate,consent,setMinimum};
