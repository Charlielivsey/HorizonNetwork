'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),dest=path.join(root,'ui/vendor');fs.mkdirSync(dest,{recursive:true});
for(const [pkg,file,target]of [['@xterm/xterm','lib/xterm.js','xterm.js'],['@xterm/xterm','css/xterm.css','xterm.css'],['@xterm/addon-fit','lib/addon-fit.js','addon-fit.js'],['@xterm/addon-web-links','lib/addon-web-links.js','addon-web-links.js']]){const dir=path.join(root,'node_modules',pkg);fs.copyFileSync(path.join(dir,file),path.join(dest,target));fs.copyFileSync(path.join(dir,'LICENSE'),path.join(dest,pkg.split('/').at(-1)+'-LICENSE'));}
