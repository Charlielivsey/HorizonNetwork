'use strict';
const {embed}=require('./server-setup');
const COMMAND={name:'bot-invite',description:'Get invite links for HN Utilities and HN Logs.',type:1,contexts:[0,1,2],integration_types:[0]};
const link=(id,permissions)=>'https://discord.com/oauth2/authorize?client_id='+encodeURIComponent(id)+'&scope=bot%20applications.commands&permissions='+permissions;
function message(utilities,logs){
 if(!/^\d{15,22}$/.test(String(utilities))||!/^\d{15,22}$/.test(String(logs)))throw Error('Bot application IDs are not configured.');
 const utilityPermissions=[0,1,4,10,11,14,16,28,40].reduce((n,b)=>n|(1n<<BigInt(b)),0n).toString(),logsPermissions=(1024n|2048n|16384n).toString();
 return{embeds:[embed({title:'Invite the HN bots',description:'Add HN Utilities and HN Logs to your server. Choose the server in Discord and review the requested permissions.'})],components:[{type:1,components:[{type:2,style:5,label:'Invite HN Utilities',url:link(utilities,utilityPermissions)},{type:2,style:5,label:'Invite HN Logs',url:link(logs,logsPermissions)}]}],allowed_mentions:{parse:[]}};
}
module.exports={COMMAND,message};
