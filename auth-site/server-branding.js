'use strict';
const crypto=require('node:crypto');
const ORIGIN='https://branding.hngroup.org.uk';
function assetKey(guild,network){
 if(guild.id===network.hq)return 'horizon-network-hq';
 if(guild.id===network.staff)return 'horizon-network-staff';
 if(/appeals/i.test(guild.name))return 'appeals';
 if(/horizon advertising/i.test(guild.name))return 'horizon-advertising';
 if(/horizon development/i.test(guild.name))return 'horizon-development';
 return null;
}
function createServerBranding({request,networks,state,commit,fetcher=fetch}){
 return async function sync(){
  const response=await fetcher(ORIGIN+'/api/discord-server-branding',{signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)throw Error('Brand centre catalogue is unavailable.');
  const manifest=await response.json();if(!Array.isArray(manifest.assets))throw Error('Brand centre returned an invalid catalogue.');let changed=0;const failures=[];
  for(const network of networks())for(const id of network.guilds||[]){
   try{
    const guild=await request('GET','/guilds/'+id),key=assetKey(guild,network);if(!key){failures.push(guild.name+': no matching Brand centre server icon');continue;}
    const asset=manifest.assets.find(a=>a.key===key);if(!asset||!new URL(asset.url).href.startsWith(ORIGIN+'/assets/brand/png/')||!/^[a-f0-9]{64}$/.test(asset.sha256))throw Error('Approved icon is missing.');
    const saved=state()[id];if(saved?.sha256===asset.sha256&&saved.icon===guild.icon)continue;
    const r=await fetcher(asset.url,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok)throw Error('Icon download failed.');
    const data=Buffer.from(await r.arrayBuffer());if(data.length>2000000||data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||crypto.createHash('sha256').update(data).digest('hex')!==asset.sha256)throw Error('Icon failed validation.');
    const updated=await request('PATCH','/guilds/'+id,{icon:'data:image/png;base64,'+data.toString('base64')},'Sync approved Brand centre server icon');
    commit({...state(),[id]:{sha256:asset.sha256,icon:updated.icon,key,updatedAt:new Date().toISOString()}});changed++;
   }catch(e){failures.push(id+': '+e.message);}
  }
  if(failures.length)throw Error(failures.join('; '));return changed;
 };
}
module.exports={assetKey,createServerBranding};
