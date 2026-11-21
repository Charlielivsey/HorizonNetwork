'use strict';
// One paced lane for setup and its background role sync. Interaction acknowledgements stay separate.
function createSetupRequests({config,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),context=()=>null,initialWait=()=>0,onRateLimit=()=>{},writeSpacing=1500,readSpacing=350,requestTimeout=20000}){
 let tail=Promise.resolve(),nextAt=0;
 async function cancellable(promise,signal){
  if(!signal)return promise;if(signal.aborted)throw signal.reason;
  let abort;const stopped=new Promise((_,reject)=>{abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});});
  try{return await Promise.race([promise,stopped]);}finally{signal.removeEventListener('abort',abort);}
 }
 return function request(method,endpoint,body,reason){
  const worker=context(),signal=worker?.controller.signal;
  const touch=()=>{if(worker){worker.lastActivity=now();worker.waitingUntil=0;}};
  const wait=async(ms,label)=>{if(ms<=0)return;if(worker){worker.waitingUntil=now()+ms;if(ms>5000)worker.progress?.(label,0,1,Math.ceil(ms/1000)+' seconds');}await cancellable(sleep(ms),signal);touch();};
  const execute=async()=>{
   const c=config();if(!c?.bot)throw Error('The bot token has not been configured.');
   nextAt=Math.max(nextAt,Number(initialWait())||0);
   for(let attempt=0;attempt<8;attempt++){
    if(signal?.aborted)throw signal.reason;
    await wait(Math.max(0,nextAt-now()),'Waiting for Discord');touch();
    let response,value;
    try{
     const timeout=AbortSignal.timeout(requestTimeout),combined=signal?AbortSignal.any([timeout,signal]):timeout;
     response=await cancellable(fetcher('https://discord.com/api/v10'+endpoint,{method,headers:{Authorization:'Bot '+c.bot,'Content-Type':'application/json','User-Agent':'HN-Group-Auth/1.0',...(reason?{'X-Audit-Log-Reason':encodeURIComponent(reason).slice(0,500)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:combined,redirect:'error'}),combined);
     value=response.status===204?null:await cancellable(response.json().catch(()=>({})),combined);
    }catch(error){if(signal?.aborted)throw signal.reason;throw Object.assign(new Error('Discord setup request stopped responding; checking current server state before retrying.'),{stalled:true,cause:error});}
    touch();nextAt=Math.max(nextAt,now()+(['GET','HEAD'].includes(method)?readSpacing:writeSpacing));
    const reset=Number(response.headers?.get('x-ratelimit-reset-after'));
    if(response.headers?.get('x-ratelimit-remaining')==='0'&&Number.isFinite(reset))nextAt=Math.max(nextAt,now()+reset*1000+250);
    if(response.status===429){
     const retry=response.headers?.get('retry-after'),seconds=Number(retry),header=Number.isFinite(seconds)?seconds*1000:Math.max(0,Date.parse(retry)-now())||0;
     const delay=Math.max(500,Number(value?.retry_after)*1000||0,header,Number.isFinite(reset)?reset*1000:0)+250;
     nextAt=Math.max(nextAt,now()+delay);onRateLimit(nextAt);await wait(Math.max(0,nextAt-now()),'Discord rate limit — setup will continue');continue;
    }
    if(!response.ok)throw Object.assign(new Error('Discord: '+String(value?.message||'request refused ('+response.status+')').slice(0,200)),{layout:true,status:response.status,code:value?.code});
    return value;
   }
   throw Object.assign(new Error('Discord is still rate limiting setup. Progress is saved; retry /setup-server later to continue.'),{layout:true,status:429});
  };
  const result=tail.then(execute);tail=result.catch(()=>{});return result;
 };
}
module.exports={createSetupRequests};
