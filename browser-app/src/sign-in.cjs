'use strict';
const http=require('node:http'),crypto=require('node:crypto');
const AUTH='https://auth.hngroup.org.uk';
class Account {
 constructor({open,changed,fetcher=fetch,origin=AUTH,vault}){this.vault=vault;this.locked=false;this.remembered=null;this.open=open;this.changed=changed;this.fetch=fetcher;this.origin=origin;this.token=null;this.user=null;this.pending=null;this.generation=0;this.avatar=null;this.avatarAt=0;}
 async call(route,data={},token=this.token){let response;try{response=await this.fetch(this.origin+'/api/native/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw Error('The authentication portal is unavailable. Please try again later.');}const value=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(Error(value.error||'HN sign-in is unavailable. Please try again later.'),{status:response.status,restart:!!value.restart});return value;}
 cancel(){this.generation++;if(this.pending){clearTimeout(this.pending.timer);this.pending.server.close();this.pending=null;}}
 async start(){
  this.cancel();const generation=this.generation;const state=crypto.randomBytes(32).toString('hex'),verifier=crypto.randomBytes(32).toString('base64url'),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
  const server=http.createServer(async(req,res)=>{
   res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");res.setHeader('Referrer-Policy','no-referrer');
   if(req.headers.host!=='127.0.0.1:'+server.address().port||req.method!=='GET'){res.writeHead(400);return res.end('Invalid sign-in request.');}
   const url=new URL(req.url,'http://'+req.headers.host);
   if(url.pathname!=='/callback'||url.searchParams.get('state')!==state){res.writeHead(400);return res.end('This sign-in request has expired.');}
   if(!this.pending||this.pending.used||generation!==this.generation){res.writeHead(400);return res.end('Sign-in already completed or cancelled.');}this.pending.used=true;
   let text='You are signed in. Return to HN Browser.',status=200;
   try{if(url.searchParams.has('error'))throw Error('HN account sign-in was cancelled.');const result=await this.call('exchange',{code:url.searchParams.get('code'),state,code_verifier:verifier,redirect_uri:this.pending.redirect});if(generation!==this.generation){await this.call('logout',{},result.token).catch(()=>{});throw Error('Sign-in cancelled.');}const previous=this.token;this.token=result.token;this.locked=false;this.remembered=result.user;this.user=result.user;this.avatar=null;this.avatarAt=0;try{this.vault?.save(this.token);}catch(e){this.changed({error:e.message});}if(previous&&previous!==this.token)await this.call('logout',{},previous).catch(()=>{});await this.refresh();}
   catch(e){text='Sign-in could not be completed. Return to HN Browser and try again.';status=400;this.changed({error:e.message});}
   res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});res.end(text);if(generation===this.generation)this.cancel();
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const redirect='http://127.0.0.1:'+server.address().port+'/callback';const timer=setTimeout(()=>{if(generation===this.generation){this.cancel();this.changed({error:'Sign-in timed out. Please try again.'});}},10*60000);timer.unref();this.pending={server,redirect,timer,used:false};
  const url=new URL('/authorize',this.origin);for(const[k,v]of Object.entries({client_id:'browser',state,redirect_uri:redirect,code_challenge:challenge,code_challenge_method:'S256'}))url.searchParams.set(k,v);
  try{await this.open(url.href);}catch(e){this.cancel();throw e;}
 }
 async restore(){const token=this.vault?.load();if(!token)return;this.token=token;this.locked=true;await this.refresh();}
 forget(){this.token=null;this.user=null;this.remembered=null;this.locked=false;this.avatar=null;this.avatarAt=0;this.vault?.clear();}
 async unlock(code){if(!this.token||!this.locked)throw Error('Choose your remembered account first.');const token=this.token;try{const result=await this.call('unlock',{code},token);if(this.token!==token)return;this.locked=false;this.user=result.user;this.remembered=result.user;this.changed({user:this.user});}catch(e){if(e.restart&&this.token===token){this.forget();this.changed({user:null});}throw e;}}
 async offer(url){if(!this.token||this.locked||!this.user)return null;const token=this.token;const value=await this.call('offer',{authorize_url:url},token);return this.token===token&&!this.locked&&/^[a-f0-9]{64}$/.test(value.offer||'')?value.offer:null;}
 async picture(token){
  try{const response=await this.fetch(this.origin+'/api/native/avatar',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}',signal:AbortSignal.timeout(10000),redirect:'error'});const type=response.headers.get('content-type')?.split(';')[0];if(!response.ok||!['image/png','image/jpeg','image/webp','image/gif'].includes(type))return null;let size=0;const parts=[];for await(const chunk of response.body){size+=chunk.length;if(size>2*1024*1024)throw Error('Image too large');parts.push(chunk);}return size?'data:'+type+';base64,'+Buffer.concat(parts).toString('base64'):null;}catch{return null;}
 }
 async refresh(){if(!this.token)return;const token=this.token;try{const result=await this.call('session',{},token);if(this.token!==token)return;this.remembered=result.user;this.user=this.locked?null:result.user;if(!this.avatarAt||Date.now()-this.avatarAt>300000){const avatar=await this.picture(token);if(this.token!==token)return;this.avatar=avatar;this.avatarAt=Date.now();}this.changed({user:this.user});}catch(e){if(this.token!==token)return;if([401,403].includes(e.status)){this.forget();this.changed({user:null,error:'Your HN session ended. Sign in again.'});}else this.changed({error:e.message});}}
 async signOut(){this.cancel();const token=this.token;this.forget();this.changed({user:null});if(token)await this.call('logout',{},token).catch(()=>{});}
}
module.exports={Account,AUTH};
