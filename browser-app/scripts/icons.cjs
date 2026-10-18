'use strict';
const fs=require('node:fs'),path=require('node:path'),{Resvg}=require('@resvg/resvg-js');
(async()=>{const out=path.join(__dirname,'../build');fs.mkdirSync(out,{recursive:true});const svg=fs.readFileSync(path.join(__dirname,'../ui/assets/favicon.svg'));const png=new Resvg(svg,{fitTo:{mode:'width',value:512}}).render().asPng();fs.writeFileSync(path.join(out,'icon.png'),png);const{default:ico}=await import('png-to-ico');fs.writeFileSync(path.join(out,'icon.ico'),await ico(Buffer.from(png)));})();
