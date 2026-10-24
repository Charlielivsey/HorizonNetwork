'use strict';
// A fixed allowlist: no request may choose an arbitrary process or hostname.
const sites=[
['downloads','Downloads','hn-downloads',5100,['downloads.hngroup.org.uk']],
['auth','HN Group Auth','hn-auth',3400,['auth.hngroup.org.uk']],
['website','HN Group','hn-website',3500,['hngroup.org.uk','www.hngroup.org.uk']],
['network','Horizon Network','hn-network',3600,['horizon-network.co.uk','www.horizon-network.co.uk','horizonetwork.com','www.horizonetwork.com']],
['staff','Staff portal','hn-staff-portal',3200,['staff.hngroup.org.uk']],
['status','Service status','hn-status',3300,['status.hngroup.org.uk']],
['links','HN Group Links','hn-links',3700,['links.hngroup.org.uk']],
['wiki','HN Group Wiki','hn-wiki',3800,['wiki.hngroup.org.uk']],
['advertising','Horizon Advertising','ha-website',3100,['horizonadvertising.co.uk']],
['branding','Brand centre','hn-branding',4800,['branding.hngroup.org.uk']],
['companies','Company register','hn-companies',4900,['companies.hngroup.org.uk']],
['vpn','HN Group VPN','hn-vpn',5000,['vpn.hngroup.org.uk']],
['investors','HN Group Investors','hn-investors',5200,['investors.hngroup.org.uk']],
['accounts','HN Account','hn-account-web',5300,['accounts.hngroup.org.uk']],
['devices','HN Group Devices','hn-devices',5400,['devices.hngroup.org.uk']],
...['media','holding','development','support','clients','careers','docs','news'].map((id,i)=>[id,{media:'Horizon Media Group',holding:'HN Group Management',development:'Horizon Development',support:'Support',clients:'Client portal',careers:'Careers',docs:'Documentation',news:'News'}[id],'hn-'+id,3900+i*100,[id+'.hngroup.org.uk']])
].map(([id,name,process,port,hosts])=>({id,name,process,port,hosts}));
module.exports={sites,ROOT_ACCOUNT:'charlie.livsey@hngroup.org.uk',PERMISSIONS:['maintenance','power','audit','access']};
