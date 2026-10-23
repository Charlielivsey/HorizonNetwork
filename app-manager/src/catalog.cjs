'use strict';
const path=require('node:path');
const CATALOG=Object.freeze({
 browser:{id:'browser',name:'HN Browser',bundle:'uk.org.hngroup.browser',profile:'hn-group-browser',app:'HN Browser.app',exe:'HN Browser.exe',description:'Your tabs, your HN account, your corner of the internet.'},
 network:{id:'network',name:'HN Secure Network',bundle:'uk.org.hngroup.vpn',profile:'hn-secure-network-windows',app:'HN Secure Network.app',exe:'HN Secure Network.exe',description:'The HN Group VPN and a secure connection to your server.'}
});
function entry(id){if(!Object.hasOwn(CATALOG,id))throw Error('Choose an HN Group app.');return CATALOG[id];}
function profileFile(id,platform,home,roaming){const a=entry(id);if(platform==='darwin'&&id==='network')return null;return path.join(platform==='darwin'?path.join(home,'Library','Application Support'):roaming,a.profile,'preferences.json');}
module.exports={CATALOG,entry,profileFile};
