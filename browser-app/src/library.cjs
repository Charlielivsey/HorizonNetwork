'use strict';
// Browsing history, bookmarks and the last session's tabs, kept privately in this profile's folder
// (history.json, bookmarks.json, session.json; owner-only files). Nothing here leaves the computer.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{webURL,HOME}=require('./policy.cjs');
const MAX_HISTORY=5000,MAX_BOOKMARKS=500,MAX_TABS=40;
const clean=(value,max)=>String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file+'.tmp',JSON.stringify(value),{mode:0o600});fs.renameSync(file+'.tmp',file);}
// Search pages aren't useful history suggestions on their own; their query is.
function searchQuery(url){try{const u=new URL(url);if(/(^|\.)google\.[a-z.]+$/.test(u.hostname)&&u.pathname==='/search'||u.hostname==='www.bing.com'&&u.pathname==='/search'||u.hostname==='duckduckgo.com'&&u.pathname==='/')return u.searchParams.get('q');}catch{}return null;}
function host(url){try{return new URL(url).hostname.replace(/^www\./,'');}catch{return'';}}

class Library{
 constructor({dir,now=()=>Date.now()}){
  this.dir=dir;this.now=now;this.timer=null;
  const history=read(path.join(dir,'history.json'),[]),bookmarks=read(path.join(dir,'bookmarks.json'),[]);
  this.history=(Array.isArray(history)?history:[]).filter(e=>e&&webURL(e.url)&&Number.isFinite(e.time)).slice(-MAX_HISTORY).map(e=>({id:typeof e.id==='string'?e.id:crypto.randomUUID(),url:e.url,title:clean(e.title,200),time:e.time}));
  this.bookmarks=(Array.isArray(bookmarks)?bookmarks:[]).filter(b=>b&&webURL(b.url)).slice(0,MAX_BOOKMARKS).map(b=>({id:typeof b.id==='string'?b.id:crypto.randomUUID(),url:b.url,title:clean(b.title,120)||host(b.url),created:Number(b.created)||this.now()}));
 }
 // Saves are batched a second apart; flush() writes straight away (on quit).
 save(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),1000);this.timer.unref?.();}
 flush(){clearTimeout(this.timer);this.timer=null;try{write(path.join(this.dir,'history.json'),this.history);write(path.join(this.dir,'bookmarks.json'),this.bookmarks);}catch{}}
 // ---------- History ----------
 visit(url,title=''){
  if(!webURL(url))return null;const last=this.history.at(-1),time=this.now();
  if(last&&last.url===url&&time-last.time<30*60000){last.time=time;if(title)last.title=clean(title,200);this.save();return last;}
  const entry={id:crypto.randomUUID(),url,title:clean(title,200),time};this.history.push(entry);if(this.history.length>MAX_HISTORY)this.history.splice(0,this.history.length-MAX_HISTORY);this.save();return entry;
 }
 title(url,title){for(let i=this.history.length-1;i>=Math.max(0,this.history.length-20);i--)if(this.history[i].url===url){this.history[i].title=clean(title,200);this.save();return;}}
 searchHistory(query='',limit=300){const q=clean(query,200).toLowerCase(),out=[];for(let i=this.history.length-1;i>=0&&out.length<limit;i--){const e=this.history[i];if(!q||e.url.toLowerCase().includes(q)||e.title.toLowerCase().includes(q))out.push({...e});}return out;}
 removeHistory(id){const before=this.history.length;this.history=this.history.filter(e=>e.id!==id);if(before===this.history.length)throw Error('That page is no longer in your history.');this.save();}
 clearHistory(since=0){this.history=since?this.history.filter(e=>e.time<since):[];this.save();}
 // Most visited pages from the last 30 days, for the new tab page.
 topSites(limit=6){const cutoff=this.now()-30*86400000,counts=new Map();for(const e of this.history){if(e.time<cutoff||searchQuery(e.url)!==null)continue;const key=e.url.replace(/[#?].*$/,'');const c=counts.get(key)||{url:e.url,title:e.title,count:0,time:0};c.count++;if(e.time>=c.time){c.time=e.time;c.url=e.url;c.title=e.title||c.title;}counts.set(key,c);}return[...counts.values()].sort((a,b)=>b.count-a.count||b.time-a.time).slice(0,limit).map(({url,title})=>({url,title:title||host(url)}));}
 // ---------- Bookmarks ----------
 bookmarked(url){return this.bookmarks.find(b=>b.url===url)||null;}
 addBookmark(url,title=''){if(!webURL(url))throw Error('Only websites can be bookmarked.');const found=this.bookmarked(url);if(found)return found;if(this.bookmarks.length>=MAX_BOOKMARKS)throw Error('You have '+MAX_BOOKMARKS+' bookmarks. Remove one first.');const b={id:crypto.randomUUID(),url,title:clean(title,120)||host(url),created:this.now()};this.bookmarks.push(b);this.save();return b;}
 renameBookmark(id,title){const b=this.bookmarks.find(b=>b.id===id);if(!b)throw Error('That bookmark no longer exists.');const value=clean(title,120);if(!value)throw Error('Give the bookmark a name.');b.title=value;this.save();return b;}
 moveBookmark(id,step){const i=this.bookmarks.findIndex(b=>b.id===id),j=i+step;if(i<0)throw Error('That bookmark no longer exists.');if(j<0||j>=this.bookmarks.length)return;[this.bookmarks[i],this.bookmarks[j]]=[this.bookmarks[j],this.bookmarks[i]];this.save();}
 removeBookmark(id){const before=this.bookmarks.length;this.bookmarks=this.bookmarks.filter(b=>b.id!==id);if(before===this.bookmarks.length)throw Error('That bookmark no longer exists.');this.save();}
 toggleBookmark(url,title){const found=this.bookmarked(url);if(found){this.removeBookmark(found.id);return null;}return this.addBookmark(url,title);}
 // ---------- Address bar suggestions: bookmarks first, then history ranked by visits and recency ----------
 suggest(text,limit=6){
  const q=clean(text,200).toLowerCase();if(!q)return[];const words=q.split(/\s+/).filter(Boolean);
  const matches=(url,title)=>{const hay=(title+' '+url.replace(/^https?:\/\/(www\.)?/,'')).toLowerCase();return words.every(w=>hay.includes(w));};
  const prefix=url=>url.replace(/^https?:\/\/(www\.)?/,'').toLowerCase().startsWith(q);
  const out=[],seen=new Set();
  for(const b of this.bookmarks)if(matches(b.url,b.title)&&!seen.has(b.url)){seen.add(b.url);out.push({kind:'bookmark',url:b.url,title:b.title,score:1000+(prefix(b.url)?500:0)});}
  const ranked=new Map(),now=this.now();
  for(const e of this.history){if(searchQuery(e.url)!==null||!matches(e.url,e.title))continue;const r=ranked.get(e.url)||{kind:'history',url:e.url,title:e.title,score:0};r.score+=1+Math.max(0,30-(now-e.time)/86400000)/10;if(e.title)r.title=e.title;if(prefix(e.url))r.score+=50;ranked.set(e.url,r);}
  for(const r of[...ranked.values()].sort((a,b)=>b.score-a.score))if(!seen.has(r.url)){seen.add(r.url);out.push(r);}
  return out.sort((a,b)=>b.score-a.score).slice(0,limit).map(({kind,url,title})=>({kind,url,title:title||host(url)}));
 }
 // ---------- The last session's tabs ("continue where you left off") ----------
 saveSession(tabs,activeIndex){try{write(path.join(this.dir,'session.json'),{tabs:tabs.filter(t=>webURL(t.url)||t.url===HOME).slice(0,MAX_TABS).map(t=>({url:t.url,pinned:!!t.pinned})),active:Math.max(0,activeIndex|0)});}catch{}}
 session(){const value=read(path.join(this.dir,'session.json'),null);if(!value||!Array.isArray(value.tabs))return null;const tabs=value.tabs.filter(t=>t&&(webURL(t.url)||t.url===HOME)).slice(0,MAX_TABS).map(t=>({url:t.url,pinned:!!t.pinned}));return tabs.length?{tabs,active:Math.min(Math.max(0,value.active|0),tabs.length-1)}:null;}
}
module.exports={Library,searchQuery,host};
