'use strict';
// Document refresh and cross-site arrivals ask for a profile; background/API calls and local links do not.
const fs=require('node:fs'),crypto=require('node:crypto');
const ARRIVAL='hn_profile_arrival',HEX=/^[a-f0-9]{64}$/;
function cookie(req,name){return(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';}
function arrivalCookie(secure=true,clear=false){return `${secure?'__Host-':''}${ARRIVAL}=${clear?'':'1'}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear?0:60}${secure?'; Secure':''}`;}
function shouldChoose(req,url){
 if(req.method!=='GET'||req.headers['sec-fetch-dest']!=='document'||/^\/(?:auth|api|assets)(?:\/|$)/.test(url.pathname)||['/healthz','/login','/signed-out','/robots.txt'].includes(url.pathname))return false;
 const source=req.headers['sec-fetch-site'];return source==='same-site'||source==='cross-site'||/(?:^|,)\s*(?:max-age=0|no-cache)(?:\s|,|$)/i.test(req.headers['cache-control']||'');
}
async function chooseOnArrival(req,res,url,{client,session,staffSession,backend,secretFile,authOrigin,secure=true,stateCookie,statePath='/',stateValue,safeNext=p=>p,eligible=()=>true}){
 if(req.method!=='GET'||req.headers['sec-fetch-dest']!=='document'||/^\/(?:auth|api|assets)(?:\/|$)/.test(url.pathname))return false;
 const arrival=(secure?'__Host-':'')+ARRIVAL;
 if(cookie(req,arrival)==='1'){
  const writeHead=res.writeHead;res.writeHead=function(status,headersOrText,headers){const h=typeof headersOrText==='object'?headersOrText:headers;const type=h?.['Content-Type']||h?.['content-type']||res.getHeader('Content-Type')||'';if(status===200&&String(type).startsWith('text/html')){const target=h||{};const previous=target['Set-Cookie']||target['set-cookie']||res.getHeader('Set-Cookie')||[];delete target['set-cookie'];target['Set-Cookie']=[...(Array.isArray(previous)?previous:[previous]),arrivalCookie(secure,true)];if(h)return typeof headersOrText==='object'?writeHead.call(this,status,target):writeHead.call(this,status,headersOrText,target);res.setHeader('Set-Cookie',target['Set-Cookie']);}return writeHead.apply(this,arguments);};return false;
 }

 if(!shouldChoose(req,url)||!eligible(url))return false;
 const active=typeof session==='function'?session():session,staff=typeof staffSession==='function'?staffSession():staffSession;
 if(!HEX.test(active||'')&&!HEX.test(staff||''))return false;
 const secret=fs.readFileSync(secretFile,'utf8').trim();if(!HEX.test(secret))throw Error('Profile selection is unavailable.');
 const state=crypto.randomBytes(32).toString('hex');const r=await fetch(backend+'/api/sso/reselect',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({client_id:client,state,...(staff?{staffSession:staff}:{session:active})}),signal:AbortSignal.timeout(8000),redirect:'error'});
 if(r.status===401||r.status===403)return false;
 const result=await r.json();if(!r.ok||!HEX.test(result.ticket||''))throw Object.assign(Error('Profile selection is temporarily unavailable. Please refresh to try again.'),{status:503});
 // Preserve the destination through the site's existing state-checked callback. No account/token reaches a URL.
 const next=safeNext(url.pathname+url.search),value=stateValue?stateValue(state,next):state+'.'+Buffer.from(next).toString('base64url');
 res.writeHead(302,{'Cache-Control':'no-store','Location':authOrigin+'/authorize?client_id='+encodeURIComponent(client)+'&state='+state+'&handoff='+result.ticket,'Set-Cookie':`${stateCookie}=${value}; Path=${statePath}; HttpOnly; SameSite=Lax; Max-Age=600${secure?'; Secure':''}`});res.end();return true;
}
module.exports={chooseOnArrival,arrivalCookie,shouldChoose};
