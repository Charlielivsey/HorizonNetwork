'use strict';
const http=require('node:http');
function proxyAccount(req,res,{backend='http://127.0.0.1:5300'}={}){
 const upstream=http.request(backend+req.url,{method:req.method,headers:req.headers,timeout:25000},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
 upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Account options are temporarily unavailable. Please try again.'}));}else res.destroy();});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
}
module.exports={proxyAccount};
