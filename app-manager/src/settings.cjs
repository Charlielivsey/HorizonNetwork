'use strict';
// The settings App Manager can change for each app, written to that app's own preferences file only while the
// app is closed (the app reads them when it next opens). Unknown keys already in the file are always kept, and
// only the fields below, with their exact allowed values, can ever be written.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const choice=(group,label,values,value,hint='')=>({group,label,hint,values,default:value,type:'choice'});
const bool=(group,label,value,hint='')=>({group,label,hint,type:'boolean',default:value});
const BROWSER={
 theme:choice('Appearance','Browser theme',['midnight-lavender','daylight','deep-ocean','forest','rose'],'midnight-lavender'),
 hnThemes:bool('Appearance','Theme HN Group websites to match',true,'HN websites take on your browser theme.'),
 reduceMotion:bool('Appearance','Reduce animations',false),
 homeButton:bool('Appearance','Show the Home button',true),
 startup:choice('Tabs','When HN Browser opens',['newtab','restore'],'newtab'),
 confirmClose:bool('Tabs','Ask before closing several tabs',true),
 newTabNextToCurrent:bool('Tabs','Open new tabs beside the current one',false),
 greeting:bool('New tab page','Show a greeting',true),
 recentSites:bool('New tab page','Show your most visited sites',true),
 searchEngine:choice('Search and privacy','Search engine',['google','bing','duckduckgo'],'google'),
 suggestions:bool('Search and privacy','Suggestions as you type',true),
 saveHistory:bool('Search and privacy','Keep browsing history',true),
 popups:bool('Search and privacy','Allow pop-up windows',true),
 askDownload:bool('Downloads','Ask where to save each download',true),
 downloadNotify:bool('Downloads','Notify me when a download finishes',true),
 openDownloadsOnStart:bool('Downloads','Show downloads when one starts',false),
 autoLock:choice('Account and VPN','Lock after I’m away for',[0,5,15,30,60],0,'You unlock with your six-digit PIN.'),
 lockOnSleep:bool('Account and VPN','Lock when this computer sleeps',false),
};
const NETWORK_WINDOWS={
 theme:choice('Appearance','Appearance',['system','light','dark'],'system'),
 launchAtLogin:bool('Startup','Open when I sign in to Windows',true,'It waits in the system tray.'),
 connectOnLaunch:bool('Startup','Ask to connect when it opens',false,'It opens on your PIN, so connecting takes one step.'),
};
const NETWORK_MAC={
 launchAtLogin:bool('Startup','Open when I log in',false,'Needs HN Secure Network 2.4.1 or later.'),
 sshUser:{group:'SSH',label:'Server username',hint:'Filled in on the SSH page. You still type the password each time.',type:'text',default:'root'},
};
function schema(id,platform){if(id==='browser')return BROWSER;if(id==='network')return platform==='darwin'?NETWORK_MAC:NETWORK_WINDOWS;throw Error('Unknown app settings.');}
function validate(id,platform,patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('Invalid settings.');
 const spec=schema(id,platform),result={};
 for(const[k,v]of Object.entries(patch)){
  const field=Object.hasOwn(spec,k)?spec[k]:null;if(!field)throw Error('Unsupported setting: '+k);
  if(field.type==='boolean'&&typeof v!=='boolean'||field.type==='choice'&&!field.values.includes(v)||field.type==='text'&&(typeof v!=='string'||!/^[a-z_][a-z0-9_.-]{0,31}$/.test(v)))throw Error('Invalid value for '+field.label.toLowerCase()+'.');
  result[k]=v;}
 return result;}
async function readJSON(file){
 try{const s=await fs.promises.lstat(file);if(s.isSymbolicLink()||!s.isFile()||s.size>1048576)throw Error('Unsafe preferences file.');const value=JSON.parse(await fs.promises.readFile(file,'utf8'));if(!value||Array.isArray(value)||typeof value!=='object')throw Error('Invalid preferences file.');return value;}
 catch(e){if(e.code==='ENOENT')return{};throw e;}}
async function writeJSON(file,id,platform,patch){
 const checked=validate(id,platform,patch),previous=await readJSON(file);
 await fs.promises.mkdir(path.dirname(file),{recursive:true,mode:0o700});
 const tmp=file+'.manager-'+crypto.randomUUID();
 try{await fs.promises.writeFile(tmp,JSON.stringify({...previous,...checked},null,2),{flag:'wx',mode:0o600});await fs.promises.rename(tmp,file);}finally{await fs.promises.rm(tmp,{force:true});}}
function values(id,platform,saved){return Object.fromEntries(Object.entries(schema(id,platform)).map(([k,s])=>{let value=s.default;try{value=validate(id,platform,{[k]:saved[k]})[k];}catch{}return[k,value];}));}
module.exports={schema,validate,values,readJSON,writeJSON};
