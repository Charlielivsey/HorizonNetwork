'use strict';
// Which addresses are official HN Group websites, and their names (from the new tab directory), so the
// address bar can show that a page, or what you've typed, leads to HN Group.
const{GROUPS}=require('./homepage.cjs');
const NAMES=new Map();
for(const group of GROUPS)for(const[name,url]of group.sites){const host=new URL(url).hostname;if(host!=='mail.google.com'&&!NAMES.has(host))NAMES.set(host,name);}
NAMES.set('horizonetwork.com',NAMES.get('horizon-network.co.uk')||'Horizon Network');
// The HN Group website a URL belongs to (https only), or null.
function hnSite(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)return null;const host=u.hostname.replace(/^www\./,'');const name=NAMES.get(host);return name?{name,host}:null;}catch{return null;}}
module.exports={hnSite,NAMES};
