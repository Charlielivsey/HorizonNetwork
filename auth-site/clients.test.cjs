'use strict';
// The sign-in page (public/app.js) keeps its own list of applications: a client the server knows but the page
// doesn't leaves people stuck after signing in, so the two lists must always match.
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const keys=(file,start,end)=>{const text=fs.readFileSync(path.join(__dirname,file),'utf8'),from=text.indexOf(start),block=text.slice(from,text.indexOf(end,from));return[...block.matchAll(/^\s+'?([a-z][a-z-]*)'?\s*:\s*\{/gm)].map(m=>m[1]).sort();};
test('every application registered in server.js is known to the sign-in page',()=>{
 const server=keys('server.js','const CLIENTS','\n};'),page=keys('public/app.js','const APPS','\n};');
 assert.ok(server.includes('devices')&&server.includes('app-manager'));
 assert.deepEqual(page,server);
});
