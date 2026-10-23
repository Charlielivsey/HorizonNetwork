'use strict';
// Builds the SSH window (src/ssh-console.cjs) into its own console program, "HN Secure Network SSH.exe"
// in build/ssh, which the installer ships next to the app: Node's single executable application format,
// with ssh2 bundled in (its optional native add-ons are left out; ssh2 uses its built-in JavaScript instead).
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),work=path.join(root,'build','sea'),out=path.join(root,'build','ssh');
const exe=path.join(out,process.platform==='win32'?'HN Secure Network SSH.exe':'hn-secure-network-ssh');
fs.rmSync(work,{recursive:true,force:true});fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(work,{recursive:true});fs.mkdirSync(out,{recursive:true});
require('esbuild').buildSync({entryPoints:[path.join(root,'src','ssh-console.cjs')],bundle:true,platform:'node',format:'cjs',target:'node22',outfile:path.join(work,'main.cjs'),external:['*.node','cpu-features'],logLevel:'warning',legalComments:'none'});
fs.writeFileSync(path.join(work,'sea.json'),JSON.stringify({main:path.join(work,'main.cjs'),output:path.join(work,'sea.blob'),disableExperimentalSEAWarning:true,useSnapshot:false,useCodeCache:false}));
execFileSync(process.execPath,['--experimental-sea-config',path.join(work,'sea.json')],{stdio:'inherit'});
fs.copyFileSync(process.execPath,exe);fs.chmodSync(exe,0o755);
if(process.platform==='win32'){
 // The copied node.exe's signature no longer matches once the session code is added; remove it if signtool is present.
 try{execFileSync('signtool',['remove','/s',exe],{stdio:'ignore'});}catch{}
}
execFileSync(process.execPath,[require.resolve('postject/dist/cli.js'),exe,'NODE_SEA_BLOB',path.join(work,'sea.blob'),'--sentinel-fuse','NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',...(process.platform==='darwin'?['--macho-segment-name','NODE_SEA']:[])],{stdio:'inherit'});
console.log('Built '+path.relative(root,exe)+' ('+(fs.statSync(exe).size/1048576).toFixed(1)+' MB)');
