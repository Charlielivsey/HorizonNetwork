'use strict';
const ROOT='https://staff.hngroup.org.uk';
module.exports=function redirectWorkspace(req,res,workspace){
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/healthz'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,workspace:'staff',redirect:ROOT}));return true;}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(410,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'This workspace is now part of the Staff Portal. Open '+ROOT+' and try again.'}));return true;}
 let target=url.pathname;
 if(target==='/'||target==='/home'||target.startsWith('/auth/')||target==='/login')target='/home?section='+workspace;
 else if(workspace==='it'&&target==='/cases')target='/it-cases';
 const query=target.includes('?')?(url.search?'&'+url.search.slice(1):''):url.search;
 res.writeHead(308,{Location:ROOT+target+query,'Cache-Control':'no-store'});res.end();return true;
};
