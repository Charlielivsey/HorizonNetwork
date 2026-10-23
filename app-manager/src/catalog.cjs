'use strict';
// The HN Group desktop apps App Manager looks after: how to find them on this computer, where they keep their
// preferences, and how they're described. Nothing here is read from the network.
const path=require('node:path');
const CATALOG=Object.freeze({
 browser:Object.freeze({id:'browser',name:'HN Browser',bundle:'uk.org.hngroup.browser',profile:'hn-group-browser',app:'HN Browser.app',exe:'HN Browser.exe',icon:'browser.svg',
  tagline:'Your tabs, your HN account, your corner of the internet.',
  features:['Signs in with your HN Group account and unlocks with your PIN','Every HN website one click away on the new tab page','Controls the HN Group VPN and opens SSH to the server','Five themes, find in page, downloads and history kept on this computer']}),
 network:Object.freeze({id:'network',name:'HN Secure Network',bundle:'uk.org.hngroup.vpn',profile:'hn-secure-network-windows',app:'HN Secure Network.app',exe:'HN Secure Network.exe',icon:'secure-network.svg',
  tagline:'The HN Group VPN and a secure connection to the server.',
  features:['Sends all of this computer’s traffic through HN Group’s UK server','Asks for your six-digit PIN every time it connects','Opens SSH to the server in a terminal window, with your password only','Lives in the menu bar or system tray and keeps itself up to date']}),
});
function entry(id){if(typeof id!=='string'||!Object.hasOwn(CATALOG,id))throw Error('Choose an HN Group app.');return CATALOG[id];}
// HN Secure Network for Mac keeps its settings in macOS user defaults instead of a file.
function profileFile(id,platform,home,roaming){const a=entry(id);if(platform==='darwin'&&id==='network')return null;return path.join(platform==='darwin'?path.join(home,'Library','Application Support'):roaming,a.profile,'preferences.json');}
module.exports={CATALOG,entry,profileFile};
