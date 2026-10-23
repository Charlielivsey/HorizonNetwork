'use strict';
// App Manager's own preferences and its activity history, kept in its data folder so they survive restarts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PREFERENCES=Object.freeze({
 theme:{values:['system','light','dark'],default:'system'},
 autoCheck:{type:'boolean',default:true},
 notify:{type:'boolean',default:true},
 autoUpdate:{type:'boolean',default:false},
 background:{type:'boolean',default:true},
 openAtLogin:{type:'boolean',default:false},
});
const KINDS=['install','update','reinstall','remove','settings','check','manager','error'];
const MAX_ACTIVITY=200;
function clean(saved){const out={};for(const[k,spec]of Object.entries(PREFERENCES)){const v=saved?.[k];out[k]=spec.type==='boolean'?(typeof v==='boolean'?v:spec.default):(spec.values.includes(v)?v:spec.default);}return out;}
class Store{
 constructor(dir){this.file=path.join(dir,'app-manager.json');let saved={};try{saved=JSON.parse(fs.readFileSync(this.file,'utf8'));}catch{}
  this.preferences=clean(saved.preferences);
  this.activity=(Array.isArray(saved.activity)?saved.activity:[]).filter(a=>a&&typeof a.message==='string'&&Number.isFinite(a.at)&&KINDS.includes(a.kind)).slice(0,MAX_ACTIVITY);}
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});const tmp=this.file+'.'+crypto.randomUUID();fs.writeFileSync(tmp,JSON.stringify({preferences:this.preferences,activity:this.activity}),{mode:0o600});fs.renameSync(tmp,this.file);}
 set(key,value){const spec=Object.hasOwn(PREFERENCES,key)?PREFERENCES[key]:null;if(!spec||(spec.type==='boolean'?typeof value!=='boolean':!spec.values.includes(value)))throw Error('That setting can’t be changed.');this.preferences={...this.preferences,[key]:value};this.save();}
 log(kind,message,app=null){if(!KINDS.includes(kind))kind='manager';this.activity.unshift({at:Date.now(),kind,app,message:String(message).slice(0,300)});this.activity.length=Math.min(this.activity.length,MAX_ACTIVITY);this.save();}
 clearActivity(){this.activity=[];this.save();}
}
module.exports={Store,PREFERENCES,clean};
