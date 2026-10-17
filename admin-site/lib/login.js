'use strict';
// Independent control-panel sessions. Credentials are checked by the sole private staff backend.
const fs=require('node:fs'),crypto=require('node:crypto');
const HEX=/^[a-f0-9]{64}$/,COOKIE='__Host-hn_control_session',FLOW='__Host-hn_control_flow',REMEMBER='__Host-hn_control_resume';
const random=()=>crypto.randomBytes(32).toString('hex'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const cookie=(req,name)=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';
const setCookie=(name,value,age=43200)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
function createLogin({backend=process.env.CONTROL_ACCOUNTS_BACKEND||'http://127.0.0.1:3250',secretFile=process.env.STATUS_SSO_SECRET_FILE||'/var/lib/hn-status-sso/secret'}={}){
 const sessions=new Map(),challenges=new Map();
 const prune=()=>{for(const map of [sessions,challenges])for(const[k,v]of map)if(v.expires<=Date.now())map.delete(k);};
 function entry(req){prune();return sessions.get(hash(cookie(req,COOKIE)));}
 function clear(req){sessions.delete(hash(cookie(req,COOKIE)));challenges.delete(hash(cookie(req,FLOW)));return[setCookie(COOKIE,'',0),setCookie(FLOW,'',0)];}
 async function staff(endpoint,data,req,remember=false,method='POST'){
  let secret;try{secret=fs.readFileSync(secretFile,'utf8').trim();}catch{throw fail(503,'Staff sign-in is not configured.');}if(!HEX.test(secret))throw fail(503,'Staff sign-in is not configured.');
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+secret};
  if(req){const saved=cookie(req,REMEMBER);if(HEX.test(saved))headers.Cookie='hn_staff_resume='+saved;if(remember)headers['X-Auth-Remember']='1';const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);headers['X-Real-IP']=local?(req.headers['x-real-ip']||req.socket.remoteAddress):req.socket.remoteAddress;headers['User-Agent']=String(req.headers['user-agent']||'HN Group website control').slice(0,300);headers['X-Forwarded-Proto']='https';}
  let response;try{response=await fetch(backend+endpoint,{method,headers,body:method==='GET'?undefined:JSON.stringify(data),signal:AbortSignal.timeout(8000),redirect:'error'});}catch{throw fail(503,'The staff account service is temporarily unavailable.');}
  if(endpoint.endsWith('/avatar'))return{response};
  const value=await response.json();if(!response.ok)throw Object.assign(fail(response.status,value.error||'Sign-in could not be verified.'),{restart:!!value.restart});return{response,value};
 }
 async function profile(active){if(!active||active.expires<=Date.now())throw fail(401,'Sign in to website control.');const{value}=await staff('/api/auth/profile',{session:active.staffSession});active.expires=Math.min(active.expires,value.expires);return value.user;}
 function ready(user){if(user.passwordChangeRequired||user.codeSetupRequired)throw fail(403,'Complete your password and PIN setup before continuing.');}
 const publicUser=user=>({...user,avatarUrl:user.avatarUrl?'/api/sign-in/avatar':null});
 function send(res,status,value,cookies=[]){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookies});res.end(JSON.stringify(value));}
 function rememberCookie(response){const token=(response.headers.get('set-cookie')||'').match(/(?:^|,\s*)hn_staff_resume=([a-f0-9]{64})(?:;|$)/)?.[1];return token?[setCookie(REMEMBER,token,30*86400)]:[];}
 async function finish(req,res,response){
  const raw=(response.headers.get('set-cookie')||'').match(/(?:^|,\s*)hn_staff_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!raw)throw fail(503,'The staff service did not create a session.');
  const active={staffSession:hash(raw),expires:Date.now()+12*3600000};const user=await profile(active);prune();if(sessions.size>=10000)throw fail(503,'Please try again shortly.');clear(req);const token=random();sessions.set(hash(token),active);send(res,200,{user:publicUser(user)},[setCookie(COOKIE,token),setCookie(FLOW,'',0),...rememberCookie(response)]);
 }
 async function avatar(req,res,remembered){let response;if(remembered){({response}=await staff('/api/resume/avatar',null,req,false,'GET'));}else{const active=entry(req);await profile(active);({response}=await staff('/api/auth/avatar',{session:active.staffSession}));}
  if(!response.ok)throw fail(response.status,'Profile picture unavailable.');const type=response.headers.get('content-type');if(!['image/png','image/jpeg','image/gif','image/webp'].includes(type))throw fail(503,'Invalid profile picture.');res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(Buffer.from(await response.arrayBuffer()));
 }
 async function handle(req,res,route,data){
  prune();
  if(req.method==='GET'){
   if(route==='me'){send(res,200,{user:publicUser(await profile(entry(req)))});return;}
   if(route==='resume'){const{value}=await staff('/api/resume',null,req,false,'GET');if(value.avatarUrl)value.avatarUrl='/api/sign-in/resume/avatar';send(res,200,value,value.available?[]:[setCookie(REMEMBER,'',0)]);return;}
   if(route==='avatar'||route==='resume/avatar')return avatar(req,res,route==='resume/avatar');
   throw fail(404,'Not found.');
  }
  if(req.method!=='POST')throw fail(405,'POST required.');
  if(route==='logout'){send(res,200,{ok:true},clear(req));return;}
  if(route==='resume/forget'){await staff('/api/resume/forget',{},req);send(res,200,{ok:true},[...clear(req),setCookie(REMEMBER,'',0)]);return;}
  if(route==='login'){
   clear(req);const{value,response}=await staff('/api/login',{username:data.username,password:data.password},req,true);
   if(value.codeRequired){if(challenges.size>=10000)throw fail(503,'Please try again shortly.');const token=random();challenges.set(hash(token),{challenge:value.challenge,expires:Date.now()+300000});send(res,200,{codeRequired:true},[setCookie(FLOW,token,300),setCookie(COOKIE,'',0)]);return;}return finish(req,res,response);
  }
  if(route==='login/code'){
   const key=hash(cookie(req,FLOW)),flow=challenges.get(key);if(!flow)throw Object.assign(fail(401,'Sign-in expired. Start again.'),{restart:true});
   try{const{response}=await staff('/api/login/code',{challenge:flow.challenge,code:data.code},req,true);challenges.delete(key);return finish(req,res,response);}catch(e){if(e.restart)challenges.delete(key);throw e;}
  }
  if(route==='resume'){const{response}=await staff('/api/resume',{code:data.code},req,true);return finish(req,res,response);}
  const active=entry(req),user=await profile(active);
  if(route==='password'){if(!user.passwordChangeRequired)throw fail(403,'A temporary password change is not required.');await staff('/api/auth/password',{session:active.staffSession,newPassword:data.newPassword},req);send(res,200,{user:publicUser(await profile(active))},[setCookie(REMEMBER,'',0)]);return;}
  if(route==='setup-code'){if(user.passwordChangeRequired)throw fail(403,'Create a new password first.');if(!user.codeSetupRequired)throw fail(403,'A PIN is already configured.');const{response}=await staff('/api/auth/code',{session:active.staffSession,code:data.code},req,true);send(res,200,{user:publicUser(await profile(active))},rememberCookie(response));return;}
  throw fail(404,'Not found.');
 }
 return{entry,clear,profile,ready,handle,send};
}
module.exports={createLogin,cookie,setCookie,fail,hash};
