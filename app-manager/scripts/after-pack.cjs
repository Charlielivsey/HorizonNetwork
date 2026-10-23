'use strict';
const path=require('node:path'),{execFileSync}=require('node:child_process');
module.exports=async context=>{if(context.electronPlatformName==='darwin'){const app=path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app');execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-',app],{stdio:'inherit'});execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});}};
