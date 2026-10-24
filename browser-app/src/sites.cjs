'use strict';
// Public destinations only. Shortcuts never grant sign-in or website permissions.
const SITES=[
 ['https://mail.google.com/',['mail','gmail','email']],
 ['https://hngroup.org.uk/',['hn','hn group','hn group website','hn group home']],
 ['https://horizon-network.co.uk/',['horizon network','network','hn network']],
 ['https://horizonadvertising.co.uk/',['horizon advertising','advertising']],
 ['https://staff.hngroup.org.uk/',['staff','staff portal','hn staff','hn group staff portal','staff portal login']],
 ['https://auth.hngroup.org.uk/',['auth','hn auth','hn group auth','authentication portal','auth portal']],
 ['https://admin.hngroup.org.uk/',['admin','website control','website admin','admin portal','hn group admin']],
 ['https://status.hngroup.org.uk/',['status','service status','hn status','hn group status']],
 ['https://links.hngroup.org.uk/',['links','group links','hn group links']],
 ['https://wiki.hngroup.org.uk/',['wiki','hn wiki','hn group wiki']],
 ['https://branding.hngroup.org.uk/',['branding','brand centre','brand center','hn group branding']],
 ['https://companies.hngroup.org.uk/',['companies','company register','companies register','hn group company register']],
 ['https://vpn.hngroup.org.uk/',['vpn','hn vpn','hn group vpn','secure terminal','hn group secure terminal']],
 ['https://media.hngroup.org.uk/',['media','media group','horizon media','horizon media group']],
 ['https://holding.hngroup.org.uk/',['hn group management','hngroup management','group management','horizon assets management','assets management','horizon holding','holding']],
 ['https://development.hngroup.org.uk/',['development','horizon development']],
 ['https://support.hngroup.org.uk/',['support','hn support','hn group support']],
 ['https://clients.hngroup.org.uk/',['clients','client portal','clients portal','hn group clients']],
 ['https://careers.hngroup.org.uk/',['careers','hn careers','hn group careers']],
 ['https://docs.hngroup.org.uk/',['docs','documentation','hn docs','hn group docs']],
 ['https://news.hngroup.org.uk/',['news','hn news','hn group news']],
 ['https://accounts.hngroup.org.uk/',['hn account','my account','hn group account','account settings','accounts']],
 ['https://devices.hngroup.org.uk/',['hn group devices','hn devices','my devices','device approval','devices']],
 ['https://investors.hngroup.org.uk/',['investors','hn investors','hn group investors','investor relations','investor portal']],
 ['https://downloads.hngroup.org.uk/',['downloads','hn downloads','hn group downloads','hn browser','browser download']]
];
const normalize=value=>value.toLowerCase().trim().replace(/^(?:open|visit|go to|take me to)\s+/,'').replace(/[^a-z0-9]/g,'');
function oneEdit(a,b){if(Math.abs(a.length-b.length)>1)return false;if(a.length===b.length){const positions=[];for(let i=0;i<a.length;i++)if(a[i]!==b[i])positions.push(i);return positions.length===1||(positions.length===2&&positions[1]===positions[0]+1&&a[positions[0]]===b[positions[1]]&&a[positions[1]]===b[positions[0]]);}if(a.length>b.length)[a,b]=[b,a];let i=0;while(i<a.length&&a[i]===b[i])i++;return a.slice(i)===b.slice(i+1);}
function siteShortcut(value){const input=normalize(value);if(!input||input.length>80)return null;const exact=SITES.find(([,aliases])=>aliases.some(a=>normalize(a)===input));if(exact)return exact[0];if(input.length<5)return null;const matches=new Set(SITES.filter(([,aliases])=>aliases.some(a=>{const alias=normalize(a);return alias.length>=5&&oneEdit(input,alias);})).map(([url])=>url));return matches.size===1?[...matches][0]:null;}
function homeSearch(value){try{const u=new URL(value);return u.protocol==='hn-browser:'&&u.hostname==='start'&&u.pathname==='/search'&&!u.username&&!u.password?u.searchParams.get('q')||'':null;}catch{return null;}}
module.exports={SITES,siteShortcut,homeSearch};
