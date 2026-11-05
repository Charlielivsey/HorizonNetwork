'use strict';
const fs=require('node:fs'),path=require('node:path');
// Copy the central catalogue at installation; the running status site is independent.
function readCatalog(){const bundled=path.join(__dirname,'catalog.json');return JSON.parse(fs.readFileSync(fs.existsSync(bundled)?bundled:path.join(__dirname,'../admin-site/catalog.json'),'utf8'));}
const rowsOf=catalog=>[...catalog,{id:'admin',name:'Website control',hosts:['admin.hngroup.org.uk']}];
// One monitor per website, on its own address only (the user's request, 5 November 2026: "remove old domains that are no
// longer in use"). Alternate names that only redirect (www, horizon-network.co.uk, horizonetwork.com, links.) aren't monitored.
function websites(catalog=readCatalog()){
 const seen=new Set(),result=[];
 for(const row of rowsOf(catalog)){const host=(row.hosts||[])[0];if(!host||seen.has(host))continue;if(!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host))throw Error('Invalid website catalogue host.');seen.add(host);result.push({key:row.id+':'+host,name:row.name,url:'https://'+host});}
 return result;
}
// Addresses no longer in use: catalogue alternates (they redirect) and removed websites' domains.
const OLD_HOSTS=['holding.hngroup.org.uk','clients.hngroup.org.uk','support.hngroup.org.uk','contracts.hngroup.org.uk','documents.hngroup.org.uk','horizonadvertising.co.uk','www.horizonadvertising.co.uk','fuckevan.hngroup.org.uk'];
function oldHosts(catalog=readCatalog()){const live=new Set(websites(catalog).map(s=>new URL(s.url).hostname)),old=new Set(OLD_HOSTS);for(const row of rowsOf(catalog))for(const host of (row.hosts||[]).slice(1))old.add(host);for(const h of live)old.delete(h);return old;}
function hostOf(value){try{return new URL(value).hostname.toLowerCase();}catch{return null;}}
function normalURL(value){try{const u=new URL(value);return u.origin+u.pathname.replace(/\/$/,'');}catch{return null;}}
function reconcile(db,catalog=readCatalog()){const offered=new Set(db.cataloguedWebsites||[]);let changed=false;
 for(const site of websites(catalog)){if(offered.has(site.key))continue;let service=db.services.find(s=>normalURL(s.url)===normalURL(site.url));if(!service){if(db.services.length>=50)continue;service={id:'website:'+site.key,name:site.name,url:site.url,override:'auto',checks:[],days:{}};db.services.push(service);}offered.add(site.key);changed=true;}
 // Monitors the catalogue made follow its names and go when their website or address is no longer in the catalogue; any
 // monitor (staff-added ones too) of an address no longer in use goes. Staff monitors of other live addresses are kept.
 const current=new Map(websites(catalog).map(site=>[site.key,site])),old=oldHosts(catalog);
 db.services=db.services.filter(service=>{if(old.has(hostOf(service.url))){changed=true;return false;}
  if(!String(service.id).startsWith('website:'))return true;const site=current.get(service.id.slice(8));
  if(!site){changed=true;return false;}
  if(service.name!==site.name){service.name=site.name;changed=true;}return true;});
 if(changed){const live=new Set(current.keys());for(const key of offered)if(!live.has(key))offered.delete(key);}
 if(changed)db.cataloguedWebsites=[...offered];return changed;
}
function fresh(catalog){const db={services:[],incidents:[]};reconcile(db,catalog);return db;}
module.exports={websites,reconcile,fresh,oldHosts};
