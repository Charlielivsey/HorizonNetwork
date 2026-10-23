'use strict';
// Makes the installer icons (build/icon.png, build/icon.ico) from the App Manager icon, and the menu bar and
// system tray icons (ui/assets/trayTemplate.png for macOS, ui/assets/tray.png for Windows).
const fs=require('node:fs'),path=require('node:path'),{Resvg}=require('@resvg/resvg-js');
const root=path.join(__dirname,'..'),png=(svg,size)=>new Resvg(svg,{fitTo:{mode:'width',value:size}}).render().asPng();
(async()=>{
 const out=path.join(root,'build');fs.mkdirSync(out,{recursive:true});
 const icon=fs.readFileSync(path.join(root,'ui','assets','app-manager.svg'));fs.writeFileSync(path.join(out,'icon.png'),png(icon,1024));
 const{default:toIco}=await import('png-to-ico');fs.writeFileSync(path.join(out,'icon.ico'),await toIco([16,24,32,48,64,128,256].map(s=>png(icon,s))));
 const tray=fs.readFileSync(path.join(root,'assets','tray.svg'),'utf8');
 // macOS: a black template image (the system colours it). Windows: HN purple.
 for(const[name,size]of[['trayTemplate.png',16],['trayTemplate@2x.png',32]])fs.writeFileSync(path.join(root,'ui','assets',name),png(tray.replaceAll('COLOR','#000'),size));
 fs.writeFileSync(path.join(root,'ui','assets','tray.png'),png(tray.replaceAll('COLOR','#7B3FF2'),32));
})().catch(e=>{console.error(e);process.exit(1);});
