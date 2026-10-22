'use strict';
// Makes the installer icon (build/icon.png, build/icon.ico) from the HN Secure Network app icon and the
// two system tray icons (ui/assets/tray.png, and tray-on.png with a green dot while connected).
const fs=require('node:fs'),path=require('node:path'),{Resvg}=require('@resvg/resvg-js');
const root=path.join(__dirname,'..'),png=(svg,size)=>new Resvg(svg,{fitTo:{mode:'width',value:size}}).render().asPng();
(async()=>{
 const out=path.join(root,'build');fs.mkdirSync(out,{recursive:true});
 const icon=fs.readFileSync(path.join(root,'assets','app-icon.svg'));fs.writeFileSync(path.join(out,'icon.png'),png(icon,512));
 const{default:toIco}=await import('png-to-ico');fs.writeFileSync(path.join(out,'icon.ico'),await toIco([16,24,32,48,64,128,256].map(s=>png(icon,s))));
 const tray=fs.readFileSync(path.join(root,'assets','tray.svg'),'utf8');
 fs.writeFileSync(path.join(root,'ui','assets','tray.png'),png(tray,32));
 fs.writeFileSync(path.join(root,'ui','assets','tray-on.png'),png(tray.replace('<!--DOT-->','<circle cx="50" cy="50" r="12" fill="#3FBF7F" stroke="#fff" stroke-width="4"/>'),32));
})().catch(e=>{console.error(e);process.exit(1);});
