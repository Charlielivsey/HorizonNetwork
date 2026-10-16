'use strict';
// When central website control is installed, the one staff-account writer lives inside Auth.
// The public staff website is a separate stoppable proxy; Auth never depends on that process.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const options=JSON.parse(fs.readFileSync(process.env.AUTH_ACCOUNTS_CONFIG||'/var/lib/hn-auth/accounts-env.json','utf8'));
const children=[];let stopping=false;
function launch(script,env){const child=spawn(process.execPath,[script],{cwd:path.dirname(script),env:{...process.env,...env},stdio:'inherit'});children.push(child);child.on('error',()=>stop(1));child.on('exit',()=>{if(!stopping)stop(1);});}
function stop(code){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');const timer=setTimeout(()=>{for(const child of children)child.kill('SIGKILL');process.exit(code);},7000);timer.unref();Promise.all(children.map(c=>(c.exitCode!==null||c.signalCode!==null)?Promise.resolve():new Promise(r=>c.once('exit',r)))).then(()=>process.exit(code));}
process.on('SIGTERM',()=>stop(0));process.on('SIGINT',()=>stop(0));
launch(process.env.AUTH_STAFF_SERVER||'/opt/hn-staff-portal/server.js',{...options,HOST:'127.0.0.1',PORT:String(process.env.AUTH_PRIVATE_PORT||3250),HN_CONTROL_MANAGED:'1'});
launch(process.env.AUTH_BROKER_SERVER||path.join(__dirname,'server.js'),{HOST:'127.0.0.1',PORT:String(process.env.AUTH_PUBLIC_PORT||3400),STAFF_PORTAL_BACKEND:'http://127.0.0.1:'+String(process.env.AUTH_PRIVATE_PORT||3250)});
