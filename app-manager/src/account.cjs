'use strict';
// Your HN Group account in App Manager, through HN Group Auth like HN Browser: the sign-in opens in the default
// web browser (Auth's public `app-manager` client, S256 PKCE and a one-use loopback callback, no shared secret),
// and the account is then remembered with a revocable token kept encrypted by the operating system. Every time
// App Manager opens it starts locked, and the person's six-digit HN Group PIN unlocks it (checked by Auth).
// Passwords and PINs are never stored, and the token never reaches the window.
const http=require('node:http'),crypto=require('node:crypto');
const AUTH='https://auth.hngroup.org.uk',CLIENT='app-manager';
const page=(title,text)=>'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title>'+
 '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F6F4FA;color:#1B1A21;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}@media(prefers-color-scheme:dark){body{background:#0E1020;color:#ECEBF4}}'+
 'main{max-width:420px;padding:32px;text-align:center}i{display:block;height:4px;border-radius:4px;margin:0 auto 22px;width:120px;background:linear-gradient(90deg,#e97de8 0 14%,#5514b4 14% 28%,#e3e65b 28% 34%,#3e9ba3 34% 54%,#7a1f6c 54% 64%,#c2306b 64% 74%,#5fae7b 74% 87%,#1c2135 87%)}h1{font-size:22px;margin:0 0 8px}p{margin:0;opacity:.75}</style>'+
 '<main><i></i><h1>'+title+'</h1><p>'+text+'</p></main>';
class Account{
 constructor({open,changed=()=>{},fetcher=fetch,origin=AUTH,vault}){Object.assign(this,{open,changed,fetch:fetcher,origin,vault});this.token=null;this.user=null;this.remembered=null;this.locked=false;this.pending=null;this.generation=0;this.avatar=null;this.avatarAt=0;this.cached=null;}
 // signed-out, waiting (finishing in the browser), locked (needs the PIN) or unlocked.
 get status(){return this.pending?'waiting':!this.token?'signed-out':this.locked?'locked':'unlocked';}
 get unlocked(){return!!this.token&&!this.locked&&!!this.user;}
 snapshot(){const u=this.user||this.remembered;return{status:this.status,user:u?{displayName:String(u.displayName||u.email||''),email:String(u.email||''),jobTitle:u.jobTitle?String(u.jobTitle):null}:null,avatar:this.avatar};}
 async call(route,data={},token=this.token){let response;try{response=await this.fetch(this.origin+'/api/native/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw Error('HN Group Auth can’t be reached. Check your internet connection and try again.');}
  const value=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(Error(value.error||'HN Group sign-in is unavailable. Please try again later.'),{status:response.status,restart:!!value.restart});return value;}
 cancel(){this.generation++;if(this.pending){clearTimeout(this.pending.timer);this.pending.server.close();this.pending=null;this.changed({});}}
 async start(){
  this.cancel();const generation=this.generation,state=crypto.randomBytes(32).toString('hex'),verifier=crypto.randomBytes(32).toString('base64url'),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
  const server=http.createServer(async(req,res)=>{
   res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");res.setHeader('Referrer-Policy','no-referrer');
   const reply=(status,title,text)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(page(title,text));};
   if(req.headers.host!=='127.0.0.1:'+server.address().port||req.method!=='GET')return reply(400,'That didn’t work','This sign-in request isn’t valid.');
   const url=new URL(req.url,'http://'+req.headers.host);
   if(url.pathname!=='/callback'||url.searchParams.get('state')!==state)return reply(400,'This sign-in has expired','Go back to HN Group App Manager and sign in again.');
   if(!this.pending||this.pending.used||generation!==this.generation)return reply(400,'Already signed in','This sign-in was already completed or cancelled.');
   this.pending.used=true;
   try{if(url.searchParams.has('error'))throw Error('The sign-in was cancelled.');
    const result=await this.call('exchange',{code:url.searchParams.get('code'),state,code_verifier:verifier,redirect_uri:this.pending.redirect});
    if(generation!==this.generation||!/^[a-f0-9]{64}$/.test(result.token||'')){await this.call('logout',{},result.token).catch(()=>{});throw Error('Sign-in cancelled.');}
    const previous=this.token;this.token=result.token;this.locked=false;this.user=result.user;this.remembered=result.user;this.avatar=null;this.avatarAt=0;
    try{this.vault?.save(this.token);}catch(e){this.changed({error:e.message});}
    if(previous&&previous!==this.token)await this.call('logout',{},previous).catch(()=>{});
    reply(200,'You’re signed in','You can close this tab and go back to HN Group App Manager.');
    this.finish();await this.refresh();this.changed({user:this.user,signedIn:true});}
   catch(e){reply(400,'Sign-in couldn’t be completed','Go back to HN Group App Manager and try again.');this.finish();this.changed({error:e.message});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const redirect='http://127.0.0.1:'+server.address().port+'/callback',timer=setTimeout(()=>{if(generation===this.generation){this.cancel();this.changed({error:'Sign-in timed out. Please try again.'});}},10*60000);timer.unref();
  this.pending={server,redirect,timer,used:false};this.changed({});
  const url=new URL('/authorize',this.origin);for(const[k,v]of Object.entries({client_id:CLIENT,state,redirect_uri:redirect,code_challenge:challenge,code_challenge_method:'S256'}))url.searchParams.set(k,v);
  try{await this.open(url.href);}catch(e){this.cancel();throw e;}}
 finish(){if(this.pending){clearTimeout(this.pending.timer);const s=this.pending.server;setTimeout(()=>s.close(),1000).unref?.();this.pending=null;}}
 // Opening App Manager: the remembered account is ready (and locked) at once, so the PIN can be asked straight away.
 load(){if(this.token)return true;const token=this.vault?.load();if(!token)return false;this.token=token;this.locked=true;const saved=this.vault?.loadProfile?.();if(saved){this.remembered=saved.user;this.avatar=saved.avatar;this.cached=JSON.stringify(saved);}return true;}
 async restore(){if(!this.load())return;await this.refresh();}
 keep(){if(!this.remembered||!this.vault?.saveProfile)return;const value=JSON.stringify({user:this.remembered,avatar:this.avatar});if(value===this.cached)return;this.cached=value;try{this.vault.saveProfile({user:this.remembered,avatar:this.avatar});}catch{}}
 forget(){this.cached=null;this.token=null;this.user=null;this.remembered=null;this.locked=false;this.avatar=null;this.avatarAt=0;this.vault?.clear();}
 async unlock(code){if(!/^\d{6}$/.test(String(code||'')))throw Error('Enter your six-digit PIN.');if(!this.token||!this.locked)throw Error('Sign in first.');const token=this.token;
  try{const result=await this.call('unlock',{code:String(code)},token);if(this.token!==token)return;this.locked=false;this.user=result.user;this.remembered=result.user;this.keep();this.changed({user:this.user});}
  catch(e){if(e.restart&&this.token===token){this.forget();this.changed({user:null});}throw e;}}
 async picture(token){try{const response=await this.fetch(this.origin+'/api/native/avatar',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}',signal:AbortSignal.timeout(10000),redirect:'error'});const type=response.headers.get('content-type')?.split(';')[0];if(!response.ok||!['image/png','image/jpeg','image/webp','image/gif'].includes(type))return null;const data=Buffer.from(await response.arrayBuffer());return data.length&&data.length<=2*1024*1024?'data:'+type+';base64,'+data.toString('base64'):null;}catch{return null;}}
 // Checks the account with Auth: a revoked or disabled account is signed out here too.
 async refresh(){if(!this.token)return;const token=this.token;
  try{const result=await this.call('session',{},token);if(this.token!==token)return;this.remembered=result.user;if(!this.locked)this.user=result.user;
   if(!this.avatarAt||Date.now()-this.avatarAt>300000){const avatar=await this.picture(token);if(this.token!==token)return;this.avatar=avatar;this.avatarAt=Date.now();}this.keep();this.changed({user:this.user});}
  catch(e){if(this.token!==token)return;if([401,403].includes(e.status)){this.forget();this.changed({user:null,error:'Your HN Group session ended. Sign in again.'});}}}
 async lock(){if(!this.token||this.locked)return;const token=this.token;this.locked=true;this.user=null;this.changed({user:null});await this.call('lock',{},token).catch(()=>{});}
 async signOut(){this.cancel();const token=this.token;this.forget();this.changed({user:null});if(token)await this.call('logout',{},token).catch(()=>{});}
}
module.exports={Account,AUTH,CLIENT};
