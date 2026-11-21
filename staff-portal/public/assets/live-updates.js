/* Automatic workspace updates. Failed requests retry; no draft is overwritten. */
(function(){'use strict';let generation=0;
 window.HNLive={start(options){const token=++generation;let revision=null,busy=false;async function tick(){
  if(token!==generation||busy||document.hidden)return;busy=true;
  try{const data=await options.api('/api/live');if(token!==generation)return;
   document.documentElement.dataset.liveUpdates='connected';
   if(revision===null)revision=data.revision;
   else if(data.revision!==revision){const applied=await options.update();if(applied!==false){revision=data.revision;document.dispatchEvent(new CustomEvent('hn:live-update'));}}
  }catch{document.documentElement.dataset.liveUpdates='reconnecting';}finally{busy=false;}
 }
 tick();const timer=setInterval(()=>{if(token!==generation)return clearInterval(timer);tick();},3000);
 document.addEventListener('visibilitychange',tick);window.addEventListener('focus',tick);
 return()=>{if(token===generation)generation++;clearInterval(timer);document.removeEventListener('visibilitychange',tick);window.removeEventListener('focus',tick);};
 }};
})();
