'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{webURL}=require('./policy.cjs');
const ACTIVE=new Set(['downloading','paused','interrupted']);
class Downloads{
 constructor({file,changed=()=>{}}){this.file=file;this.changed=changed;this.items=new Map();this.live=new Map();this.pending=null;try{const records=JSON.parse(fs.readFileSync(file));if(Array.isArray(records))for(const r of records.slice(0,200)){if(!r||typeof r.id!=='string'||!webURL(r.url)||typeof r.name!=='string')continue;this.items.set(r.id,{id:r.id,url:r.url,name:r.name.slice(0,512),path:typeof r.path==='string'&&path.isAbsolute(r.path)?r.path:'',received:Math.max(0,Number(r.received)||0),total:Math.max(0,Number(r.total)||0),started:Number(r.started)||Date.now(),status:r.status==='completed'?'completed':r.status==='cancelled'?'cancelled':'failed',speed:0,canResume:false});}}catch{}}
 snapshot(){return[...this.items.values()].reverse().map(r=>({...r}));}
 persist(){try{fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});const records=[...this.items.values()];const keep=records.filter(r=>this.live.has(r.id));const finished=records.filter(r=>!this.live.has(r.id)).slice(-200);const ids=new Set([...keep,...finished].map(r=>r.id));for(const id of this.items.keys())if(!ids.has(id))this.items.delete(id);fs.writeFileSync(this.file+'.tmp',JSON.stringify([...this.items.values()]),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}catch{}}
 emit(immediate=false){if(immediate){clearTimeout(this.pending);this.pending=null;this.changed();}else if(!this.pending){this.pending=setTimeout(()=>{this.pending=null;this.changed();},200);this.pending.unref();}}
 track(item){const id=crypto.randomUUID(),record={id,url:item.getURL(),name:item.getFilename(),path:'',received:0,total:item.getTotalBytes(),started:Date.now(),status:'downloading',speed:0,canResume:false};this.items.set(id,record);this.live.set(id,item);let sampleAt=Date.now(),sampleBytes=0;
 const update=()=>{record.path=item.getSavePath();if(record.path)record.name=path.basename(record.path);record.received=item.getReceivedBytes();record.total=item.getTotalBytes();record.canResume=item.canResume();record.status=item.isPaused()?'paused':item.getState()==='interrupted'?'interrupted':'downloading';const now=Date.now();if(now-sampleAt>=500){record.speed=Math.max(0,(record.received-sampleBytes)/((now-sampleAt)/1000));sampleAt=now;sampleBytes=record.received;}this.emit();};
 item.on('updated',update);item.once('done',(_event,state)=>{update();item.removeListener('updated',update);record.status=state==='completed'?'completed':state==='cancelled'?'cancelled':'failed';record.canResume=false;record.speed=0;this.live.delete(id);this.persist();this.emit(true);});this.persist();this.emit(true);return id;
 }
 entry(id){const value=this.items.get(id);if(!value)throw Error('That download is no longer in the list.');return value;}
 pause(id){const item=this.live.get(id);if(!item||this.entry(id).status!=='downloading')throw Error('This download cannot be paused.');item.pause();this.entry(id).status='paused';this.entry(id).speed=0;this.persist();this.emit(true);}
 resume(id){const item=this.live.get(id);if(!item||!['paused','interrupted'].includes(this.entry(id).status)||(!item.isPaused()&&!item.canResume()))throw Error('This download cannot be resumed. Retry it instead.');item.resume();this.entry(id).status='downloading';this.persist();this.emit(true);}
 cancel(id){const item=this.live.get(id);if(!item)throw Error('This download has already finished.');item.cancel();}
 retry(id){const r=this.entry(id);if(this.live.has(id)||!['failed','cancelled'].includes(r.status)||!webURL(r.url))throw Error('This download cannot be retried.');return r.url;}
 reveal(id){const r=this.entry(id);if(r.status!=='completed'||!r.path||!fs.existsSync(r.path))throw Error('This file has moved or is no longer available.');return r.path;}
 remove(id){this.entry(id);if(this.live.has(id))throw Error('Cancel the download before removing it.');this.items.delete(id);this.persist();this.emit(true);}
 clear(){for(const[id]of this.items)if(!this.live.has(id))this.items.delete(id);this.persist();this.emit(true);}
}
module.exports={Downloads,ACTIVE};
