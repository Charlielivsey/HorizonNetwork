'use strict';
const {nativeTheme}=require('electron'),{eligible,css,PALETTES}=require('../site-theme.cjs');
class Themes{
 constructor({window,pages,emit}){Object.assign(this,{window,pages,emit});this.revision=0;this.at=0;this.timer=null;this.applied=new WeakMap();}
 native(value){const win=this.window();nativeTheme.themeSource=value==='daylight'?'light':'dark';if(!win||win.isDestroyed())return;const[bg,,,ink]=PALETTES[value];win.setBackgroundColor(bg);if(process.platform!=='darwin')win.setTitleBarOverlay({color:bg,symbolColor:ink,height:42});}
 change(value,reduceMotion){this.revision++;this.at=Date.now()+48;const detail={theme:value,at:this.at,revision:this.revision,reduceMotion};this.emit(detail);clearTimeout(this.timer);this.timer=setTimeout(()=>this.native(value),Math.max(0,this.at-Date.now()));return detail;}
 async page(wc,value,enabled){if(wc.isDestroyed())return;let slot=this.applied.get(wc);if(!slot){slot={revision:0,key:null};this.applied.set(wc,slot);}const revision=++slot.revision,url=wc.getURL(),home=url==='hn-browser://start/';try{
  if(eligible(url)&&(enabled||home)){const key=await wc.insertCSS(css(value),{cssOrigin:'user'});if(revision!==slot.revision||wc.isDestroyed()||wc.getURL()!==url){if(!wc.isDestroyed())await wc.removeInsertedCSS(key);return;}const old=slot.key;slot.key=key;if(old)await wc.removeInsertedCSS(old);if(home)await wc.executeJavaScript('document.body.dataset.theme='+JSON.stringify(value));}
  else{const old=slot.key;slot.key=null;if(old)await wc.removeInsertedCSS(old);}
 }catch{}}
}
module.exports={Themes};
