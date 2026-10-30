'use strict';
const fs=require('node:fs'),path=require('node:path');
// Copy the central catalogue at installation; the running status site is independent.
function readCatalog(){const bundled=path.join(__dirname,'catalog.json');return JSON.parse(fs.readFileSync(fs.existsSync(bundled)?bundled:path.join(__dirname,'../admin-site/catalog.json'),'utf8'));}
function websites(catalog=readCatalog()){
 const rows=[...catalog,{id:'admin',name:'Website control',hosts:['admin.hngroup.org.uk']}],seen=new Set(),result=[];
 for(const row of rows){for(const host of row.hosts||[]){if(host.startsWith('www.')||seen.has(host))continue;if(!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host))throw Error('Invalid website catalogue host.');seen.add(host);result.push({key:row.id+':'+host,name:row.name+(host===row.hosts[0]?'':' ('+host+')'),url:'https://'+host});}}
 return result;
}
function normalURL(value){try{const u=new URL(value);return u.origin+u.pathname.replace(/\/$/,'');}catch{return null;}}
const RETIRED=new Set(['holding','clients','support']);
function reconcile(db,catalog){const offered=new Set(db.cataloguedWebsites||[]);let changed=false;
 for(const site of websites(catalog)){if(offered.has(site.key))continue;let service=db.services.find(s=>normalURL(s.url)===normalURL(site.url));if(!service){if(db.services.length>=50)continue;service={id:'website:'+site.key,name:site.name,url:site.url,override:'auto',checks:[],days:{}};db.services.push(service);}offered.add(site.key);changed=true;}
 // Monitors the catalogue made follow its names, and go when their website is removed (the user's request, 30 October 2026:
 // HN Group Management, Client portal and Support removed). Monitors staff added themselves are never touched.
 const current=new Map(websites(catalog).map(site=>[site.key,site]));
 db.services=db.services.filter(service=>{if(!String(service.id).startsWith('website:'))return true;const key=service.id.slice(8),site=current.get(key);
  if(!site){if(RETIRED.has(key.split(':')[0])){changed=true;return false;}return true;}
  if(service.name!==site.name){service.name=site.name;changed=true;}return true;});
 if(changed)db.cataloguedWebsites=[...offered];return changed;
}
function fresh(catalog){const db={services:[],incidents:[]};reconcile(db,catalog);return db;}
module.exports={websites,reconcile,fresh};
