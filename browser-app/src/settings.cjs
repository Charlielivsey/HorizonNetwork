'use strict';
// HN Browser settings: defaults, and the only values each one accepts. Saved in preferences.json.
const{theme}=require('./policy.cjs');
const DEFAULTS=Object.freeze({
 theme:'midnight-lavender',hnThemes:true,homeButton:true,reduceMotion:false,defaultZoom:0,
 greeting:true,recentSites:true,startup:'newtab',confirmClose:true,newTabNextToCurrent:false,popups:true,
 searchEngine:'google',suggestions:true,saveHistory:true,
 askDownload:true,downloadPath:'',downloadNotify:true,openDownloadsOnStart:false,
 autoLock:0,lockOnSleep:false,
});
const BOOLEAN=['hnThemes','homeButton','reduceMotion','greeting','recentSites','confirmClose','newTabNextToCurrent','popups','suggestions','saveHistory','askDownload','downloadNotify','openDownloadsOnStart','lockOnSleep'];
const CHOICES={searchEngine:['google','bing','duckduckgo'],startup:['newtab','restore'],autoLock:[0,5,15,30,60],defaultZoom:[-1,0,1,2]};
// Returns the accepted value for a setting, or throws when it isn't allowed.
function validate(key,value){
 if(key==='theme')return theme(value);
 if(BOOLEAN.includes(key)){if(typeof value!=='boolean')throw Error('Invalid setting.');return value;}
 if(key==='defaultZoom'){if(!Number.isFinite(value)||value<-3||value>5)throw Error('Invalid setting.');return value;}
 if(CHOICES[key]){if(!CHOICES[key].includes(value))throw Error('Invalid setting.');return value;}
 throw Error('Invalid setting.');
}
// Saved settings from any earlier version: unknown keys are dropped and bad values fall back.
function load(saved){
 const out={...DEFAULTS};if(!saved||typeof saved!=='object')return out;
 for(const key of Object.keys(DEFAULTS)){if(!(key in saved))continue;if(key==='downloadPath'){if(typeof saved.downloadPath==='string')out.downloadPath=saved.downloadPath.slice(0,4096);continue;}try{out[key]=validate(key,saved[key]);}catch{}}
 out.defaultZoom=Math.max(-3,Math.min(5,Number(out.defaultZoom)||0));return out;
}
module.exports={DEFAULTS,BOOLEAN,CHOICES,validate,load};
