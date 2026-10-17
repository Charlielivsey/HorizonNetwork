'use strict';
const crypto=require('node:crypto');
const{PERMISSIONS}=require('./catalog'),{createLogin,cookie,setCookie,fail,hash}=require('./login');
const HEX=/^[a-f0-9]{64}$/,random=()=>crypto.randomBytes(32).toString('hex');
function createIdentity(store,options={}){
 const login=createLogin(options),flows=new Map(),handoffs=new Map(),bypasses=new Map();
 function prune(){for(const map of [flows,handoffs,bypasses])for(const[k,v]of map)if(v.expires<=Date.now())map.delete(k);}
 function granted(user){return user.ownerAccess===true?[...PERMISSIONS]:store.permissions(user.email);}
 async function current(req,permission){const user=await login.profile(login.entry(req));login.ready(user);const email=String(user.email||'').toLowerCase(),permissions=granted({...user,email});if(!permissions.length||permission&&!permissions.includes(permission))throw fail(403,'You do not have permission to use this control.');return{...user,email,permissions};}
 function redirect(res,location,cookies=[]){res.writeHead(302,{Location:location,'Cache-Control':'no-store','Set-Cookie':cookies});res.end();}
 async function begin(res,bypass){prune();if(flows.size>=2000)throw fail(503,'Please try again shortly.');const state=random();if(bypass)flows.set(hash(state),{bypass,expires:Date.now()+600000});redirect(res,'/login',[setCookie('__Host-hn_control_state',bypass?state:'',bypass?600:0)]);}
 async function complete(req,res){prune();const active=login.entry(req),user=await login.profile(active);login.ready(user);const state=cookie(req,'__Host-hn_control_state'),flow=flows.get(hash(state));const clear=setCookie('__Host-hn_control_state','',0);
  if(state){flows.delete(hash(state));if(!flow)throw fail(400,'Maintenance sign-in expired. Start again from the website.');if(!user.statusAdminAllowed)throw fail(403,'Only the system owner and Super Admin members can bypass maintenance.');if(handoffs.size>=2000)throw fail(503,'Please try again shortly.');const raw=random();handoffs.set(hash(raw),{...flow.bypass,staffSession:active.staffSession,expires:Date.now()+60000});store.audit(user.email,'maintenance.bypass.authorised',{site:flow.bypass.site,host:flow.bypass.host});login.send(res,200,{redirect:'https://'+flow.bypass.host+'/__hn_control/accept?code='+raw},[clear]);return;}
  const email=String(user.email||'').toLowerCase();if(!granted({...user,email}).length){store.audit(email,'access.denied');login.send(res,200,{redirect:'/denied'},[...login.clear(req),clear]);return;}store.audit(email,'access.sign-in');login.send(res,200,{redirect:'/'},[clear]);
 }
 async function accept(req,res,site,host,url){prune();const raw=url.searchParams.get('code')||'',entry=HEX.test(raw)&&handoffs.get(hash(raw));if(!entry||entry.site!==site||entry.host!==host)throw fail(400,'Maintenance sign-in expired. Start again.');handoffs.delete(hash(raw));const user=await login.profile(entry);login.ready(user);if(!user.statusAdminAllowed)throw fail(403,'Maintenance bypass permission is required.');if(bypasses.size>=10000)throw fail(503,'Please try again shortly.');const key=random();bypasses.set(hash(key),{staffSession:entry.staffSession,site,host,expires:Date.now()+12*3600000,checked:0});redirect(res,entry.back||'/',[setCookie('__Host-hn_site_bypass',key)]);}
 async function canBypass(req,site,host){prune();const key=hash(cookie(req,'__Host-hn_site_bypass')),entry=bypasses.get(key);if(!entry||entry.site!==site||entry.host!==host)return false;try{if(Date.now()-entry.checked>10000){const user=await login.profile(entry);login.ready(user);if(!user.statusAdminAllowed)throw fail(403,'Not allowed.');entry.checked=Date.now();}return true;}catch{bypasses.delete(key);return false;}}
 async function logout(req,res){let user;try{user=await current(req);}catch{}if(user)store.audit(user.email,'access.sign-out');login.send(res,200,{ok:true},login.clear(req));}
 return{current,begin,complete,accept,canBypass,logout,login};
}
module.exports={createIdentity,cookie,setCookie,fail,hash};
