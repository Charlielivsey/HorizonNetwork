'use strict';
const fs=require('node:fs');const [source,target]=process.argv.slice(2);const db=fs.existsSync(target)?JSON.parse(fs.readFileSync(target,'utf8')):{posts:[],tickets:[],customers:[],projects:[],audit:[]};
// Initial seed only. Deleting a seed article must not cause it to reappear.
if(!db.seeded){db.posts.push(...JSON.parse(fs.readFileSync(source,'utf8')).map(p=>({...p,updatedAt:new Date().toISOString()})));db.seeded=true;fs.writeFileSync(target+'.tmp',JSON.stringify(db),{mode:0o600});fs.renameSync(target+'.tmp',target);}
