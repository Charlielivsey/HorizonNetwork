'use strict';
const fs=require('node:fs'),path=require('node:path');
const {sites}=require('../admin-site/lib/catalog');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function build(output){
 const assets=path.join(output,'assets');fs.mkdirSync(assets,{recursive:true});
 const base=fs.readFileSync(path.join(__dirname,'../auth-site/offline/index.html'),'utf8');
 for(const logo of ['hn-group-wordmark-white','horizon-network-wordmark-white','horizon-media-group-logo-white','horizon-development-logo-white'])fs.copyFileSync(path.join(__dirname,'../brand/logos',logo+'.svg'),path.join(assets,logo+'.svg'));
 fs.copyFileSync(path.join(__dirname,'../auth-site/public/assets/fonts/plus-jakarta-sans.woff2'),path.join(assets,'plus-jakarta-sans.woff2'));
 const entries=[...sites,{id:'admin',name:'HN Group Administration',hosts:['admin.hngroup.org.uk']},{id:'old-staff',name:'Old Staff Portal',hosts:['oldstaffportal.hngroup.org.uk']}];
 for(const site of entries){
  const logo=({'network':'horizon-network-wordmark-white','media':'horizon-media-group-logo-white','development':'horizon-development-logo-white'})[site.id]||'hn-group-wordmark-white';
  let html=base.replaceAll('/_hn-auth-offline/','/__hn_offline/assets/').replaceAll('hn-group-wordmark-white.svg',logo+'.svg');
  if(site.id!=='auth')html=html.replace('<title>Sign-in temporarily offline · HN Group</title>','<title>'+escape(site.name)+' is temporarily offline</title>').replace('HN Group Auth · Offline',escape(site.name)+' · Offline').replace('Sign-in is temporarily offline.','We’re temporarily offline.').replace('HN Group Auth is currently unavailable, so we can’t sign you in right now. Please try again shortly.',escape(site.name)+' is currently unavailable. Please try again shortly.');
  if(logo!=='hn-group-wordmark-white')html=html.replace('alt="HN Group"','alt="'+escape(site.name)+'"');
  if(site.id==='status')html=html.replace('<a class="secondary" href="https://status.hngroup.org.uk">View service status</a>','');
  for(const host of site.hosts){if(!/^[a-z0-9.-]+$/.test(host))throw Error('Invalid host');fs.mkdirSync(path.join(output,host),{recursive:true});fs.writeFileSync(path.join(output,host,'index.html'),html);}
 }
 return entries;
}
module.exports={build};
if(require.main===module)build(process.argv[2]||'/var/www/hn-offline');
