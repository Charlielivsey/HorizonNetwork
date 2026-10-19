'use strict';
function keyboard(input,{platform=process.platform,tab,cycle,shortcut,history,reopen,panel,lock,zoom}){
 if(input.type!=='keyDown')return false;const key=input.key.toLowerCase(),mod=platform==='darwin'?input.meta:input.control;
 if(input.control&&key==='tab'){cycle(input.shift?-1:1);return true;}if(key==='f5'){shortcut('r');return true;}
 if(platform!=='darwin'&&input.alt&&!input.control&&['arrowleft','arrowright'].includes(key)){history(key==='arrowleft'?-1:1);return true;}
 if(!mod||input.alt)return false;if(input.shift){if(key==='t'){reopen();return true;}if(key==='l'){lock();return true;}const screens={o:'bookmarks',v:'vpn',s:'ssh'};if(screens[key]){panel(screens[key]);return true;}if(key==='+'||key==='='){zoom(.5);return true;}return false;}
 if(['l','t','w','r','f','d','p'].includes(key)){shortcut(key);return true;}if(/^[1-9]$/.test(key)){tab(Number(key));return true;}
 if(['[',']'].includes(key)){history(key==='['?-1:1);return true;}if(['+','=','-','0'].includes(key)){zoom(key==='0'?null:key==='-'?-.5:.5);return true;}
 const screens={',':'settings',j:'downloads',h:'history',y:'history'};if(screens[key]){panel(screens[key]);return true;}return false;
}
module.exports={keyboard};
