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
['docs','HN Group Docs','hn-docs',4500,['docs.hngroup.org.uk']],
...[['media','Horizon Media Group',3900],['holding','HN Group Management',4000],['development','Horizon Development',4100],['support','Support',4200],['clients','Client portal',4300],['careers','Careers',4400],['news','News',4600]].map(([id,name,port])=>[id,name,'hn-'+id,port,[id+'.hngroup.org.uk']])
].map(([id,name,process,port,hosts])=>({id,name,process,port,hosts}));
module.exports={sites,ROOT_ACCOUNT:'charlie.livsey@hngroup.org.uk',PERMISSIONS:['maintenance','power','audit','access']};
