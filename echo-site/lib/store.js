'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const CATEGORIES = { references: 'Reference Sheets', profiles: 'Profile Pictures', banners: 'Banners', stickers: 'Stickers', general: 'General Art' };
const MAX_FILE = 40 * 1024 * 1024;
const fail = (status, message) => Object.assign(new Error(message), { status });
function text(value, max, label) { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw fail(400, label + ' is required (up to ' + max + ' characters).'); return value.trim(); }
// Only passive raster formats. Inspect file content rather than trusting its name or MIME header.
function imageType(b) {
 if (b.length >= 24 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.subarray(12,16).toString() === 'IHDR' && b.readUInt32BE(16) && b.readUInt32BE(20)) return ['image/png','png'];
 if (b.length >= 10 && /^GIF8[79]a$/.test(b.subarray(0,6).toString()) && b.readUInt16LE(6) && b.readUInt16LE(8)) return ['image/gif','gif'];
 if (b.length >= 12 && b[0] === 255 && b[1] === 216 && b[2] === 255 && b.lastIndexOf(Buffer.from([255,217])) >= 3) return ['image/jpeg','jpg'];
 if (b.length >= 20 && b.subarray(0,4).toString() === 'RIFF' && b.subarray(8,12).toString() === 'WEBP' && ['VP8 ','VP8L','VP8X'].includes(b.subarray(12,16).toString())) return ['image/webp','webp'];
 throw fail(400, 'Use a PNG, JPEG, GIF or WebP image. SVG and other file types are not accepted.');
}
function createStore(dir) {
 fs.mkdirSync(dir, {recursive:true,mode:0o700}); const file = path.join(dir,'library.json'), files = path.join(dir,'art'); fs.mkdirSync(files,{recursive:true,mode:0o700});
 let db = { characters:[], art:[] };
 if (fs.existsSync(file)) { db=JSON.parse(fs.readFileSync(file,'utf8')); if (!Array.isArray(db.characters)||!Array.isArray(db.art)) throw Error('Echo library is invalid; restore from backup.'); }
 const save=()=>{ fs.writeFileSync(file+'.tmp',JSON.stringify(db),{mode:0o600}); fs.renameSync(file+'.tmp',file); };
 const character=id=>{const c=db.characters.find(c=>c.id===id); if(!c)throw fail(404,'Character not found.');return c;};
 const piece=id=>{const a=db.art.find(a=>a.id===id);if(!a)throw fail(404,'Artwork not found.');return a;};
 const view=c=>{const art=db.art.filter(a=>a.characterId===c.id);return {...c,count:art.length,coverId:art.some(a=>a.id===c.coverId)?c.coverId:art[0]?.id||null,counts:Object.fromEntries(Object.keys(CATEGORIES).map(k=>[k,art.filter(a=>a.category===k).length]))};};
 const touch=c=>{c.updatedAt=new Date().toISOString();};
 return {
  library(){return {characters:db.characters.map(view).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),categories:CATEGORIES,total:db.art.length};},
  detail(id){const c=character(id);return {character:view(c),art:db.art.filter(a=>a.characterId===id).slice().reverse()};},
  create(input){const c={id:crypto.randomBytes(16).toString('hex'),name:text(input.name,100,'Character name'),species:text(input.species,100,'Species'),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),coverId:null};db.characters.push(c);save();return view(c);},
  update(id,input){const c=character(id);const name=text(input.name??c.name,100,'Character name'),species=text(input.species??c.species,100,'Species');if(input.coverId!==undefined&&input.coverId!==null&&piece(input.coverId).characterId!==id)throw fail(400,'Choose artwork from this character.');Object.assign(c,{name,species,...(input.coverId!==undefined?{coverId:input.coverId}:{})});touch(c);save();return view(c);},
  remove(id){const c=character(id),removed=db.art.filter(a=>a.characterId===id);db.characters=db.characters.filter(x=>x!==c);db.art=db.art.filter(a=>a.characterId!==id);save();for(const a of removed)fs.rmSync(path.join(files,a.id),{force:true});return {ok:true,deleted:removed.length};},
  upload(id,input,buffer){const c=character(id);if(!Object.hasOwn(CATEGORIES,input.category))throw fail(400,'Choose an artwork category.');if(!buffer.length||buffer.length>MAX_FILE)throw fail(413,'Each image must be between 1 byte and 40 MB.');const [type,extension]=imageType(buffer);const a={id:crypto.randomBytes(16).toString('hex'),characterId:id,category:input.category,title:text(input.title||input.name||'Untitled artwork',180,'Artwork title'),originalName:String(input.name||'artwork.'+extension).slice(0,240),type,extension,size:buffer.length,createdAt:new Date().toISOString()};fs.writeFileSync(path.join(files,a.id),buffer,{flag:'wx',mode:0o600});db.art.push(a);touch(c);save();return a;},
  editArt(id,input){const a=piece(id),category=input.category??a.category;if(!Object.hasOwn(CATEGORIES,category))throw fail(400,'Choose an artwork category.');const title=text(input.title??a.title,180,'Artwork title');Object.assign(a,{title,category});touch(character(a.characterId));save();return a;},
  removeArt(id){const a=piece(id);db.art=db.art.filter(x=>x!==a);const c=character(a.characterId);if(c.coverId===id)c.coverId=null;touch(c);save();fs.rmSync(path.join(files,a.id),{force:true});return {ok:true};},
  file(id){const a=piece(id);return {art:a,path:path.join(files,a.id)};}
 };
}
module.exports={createStore,CATEGORIES,MAX_FILE,fail,imageType};
