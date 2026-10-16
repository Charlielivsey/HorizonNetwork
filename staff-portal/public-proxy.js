'use strict';
// Public staff website only. The private account backend is supervised by HN Group Auth.
const http=require('node:http');
const server=http.createServer((req,res)=>{const upstream=http.request((process.env.PRIVATE_STAFF_BACKEND||'http://127.0.0.1:3250')+req.url,{method:req.method,headers:req.headers,timeout:35000},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"The staff account service is temporarily unavailable."}');}else res.destroy();});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);});
server.listen(Number(process.env.PORT||3200),'127.0.0.1');
