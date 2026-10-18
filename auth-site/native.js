'use strict';
// Public desktop client: short-lived one-use codes + S256 PKCE, no shared secret in the app.
const crypto=require('node:crypto');
const HEX=/^[a-f0-9]{64}$/,PKCE=/^[A-Za-z0-9_-]{43}$/;
function nativeDestination(url){
 try{const redirect=new URL(url.searchParams.get('redirect_uri'));if(redirect.protocol!=='http:'||redirect.hostname!=='127.0.0.1'||!redirect.port||Number(redirect.port)<1||redirect.pathname!=='/callback'||redirect.username||redirect.password||redirect.search||redirect.hash)return null;
 if(url.searchParams.get('code_challenge_method')!=='S256'||!PKCE.test(url.searchParams.get('code_challenge')||''))return null;
 return{callback:redirect.href,challenge:url.searchParams.get('code_challenge')};}catch{return null;}
}
function createNative({codes,applications,profile,requireReady,send,body,serveAvatar}){
 const fail=(status,message)=>Object.assign(new Error(message),{status});
 return async function handle(req,res,route){
  if(!route.startsWith('/api/native/'))return false;
  if(req.method!=='POST')throw fail(405,'POST required.');
  if(req.headers.origin&&req.headers.origin!=='https://auth.hngroup.org.uk')throw fail(403,'Request origin not allowed.');
  const data=await body(req);
  if(route==='/api/native/exchange'){
   const grant=HEX.test(data.code||'')&&codes.get(data.code);codes.delete(data.code);
   if(!grant||grant.client!=='browser'||!grant.native||grant.expires<=Date.now()||grant.state!==data.state||grant.redirect!==data.redirect_uri||!PKCE.test(data.code_verifier||'')||crypto.createHash('sha256').update(data.code_verifier).digest('base64url')!==grant.challenge)throw fail(401,'Browser sign-in expired or could not be verified.');
   const user=await profile(grant.entry);requireReady(user);if(applications.size>=10000)throw fail(503,'Please try signing in again shortly.');
   const token=crypto.randomBytes(32).toString('hex'),key=crypto.createHash('sha256').update(token).digest('hex');applications.set(key,{client:'browser',entry:grant.entry,expires:grant.entry.expires});
   send(res,200,{token,expires:grant.entry.expires,user:{...user,avatarUrl:null}});return true;
  }
  const token=(req.headers.authorization||'').replace(/^Bearer /,''),key=HEX.test(token)?crypto.createHash('sha256').update(token).digest('hex'):'';
  const active=applications.get(key);if(!active||active.client!=='browser'||active.expires<=Date.now())throw fail(401,'Please sign in to HN Browser again.');
  if(route==='/api/native/logout'){applications.delete(key);send(res,200,{ok:true});return true;}
  const user=await profile(active.entry);requireReady(user);active.expires=Math.min(active.expires,active.entry.expires);
  if(route==='/api/native/avatar'){await serveAvatar(active.entry,res);return true;}
  if(route==='/api/native/session'){send(res,200,{expires:active.expires,user:{...user,avatarUrl:null}});return true;}
  throw fail(404,'Not found.');
 };
}
module.exports={nativeDestination,createNative};
