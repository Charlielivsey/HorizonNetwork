'use strict';
const fs=require('fs'),path=require('path'),{Resvg}=require('../../browser-app/node_modules/@resvg/resvg-js');
const root=path.join(__dirname,'../..'),font=path.join(root,'docs-site/lib/pdf-assets/PlusJakartaSans-Bold.ttf');
const render=(svg,size)=>new Resvg(svg,{fitTo:{mode:'width',value:size},font:{fontFiles:[font],loadSystemFonts:false}}).render().asPng();
const icon=fs.readFileSync(path.join(__dirname,'app-icon.svg'),'utf8'),tray=fs.readFileSync(path.join(__dirname,'tray.svg'),'utf8');
const nested=icon.replace(/<svg[^>]*>/,'<svg x="20" y="20" width="360" height="360" viewBox="0 0 1024 1024">');
const fontData=fs.readFileSync(path.join(root,'auth-site/public/assets/fonts/plus-jakarta-sans.woff2')).toString('base64');
for(const white of [false,true]){
 const colour=white?'#F5EFFF':'#21162E',name='hn-secure-access-terminal-logo'+(white?'-white':'');
 const hn=fs.readFileSync(path.join(root,'brand/logos/hn-group-wordmark'+(white?'-white':'')+'.svg'),'utf8').replace(/<svg[^>]*>/,'<svg x="414" y="40" width="204" height="72" viewBox="0 0 456.4 159.4">');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400" role="img" aria-label="HN Secure Access Terminal"><title>HN Secure Access Terminal</title><style>@font-face{font-family:Plus Jakarta Sans;src:url(data:font/woff2;base64,'+fontData+')}</style>'+nested+hn+'<g fill="'+colour+'" font-family="Plus Jakarta Sans" font-weight="700" font-size="65"><text x="410" y="211">HN Secure</text><text x="410" y="297">Access Terminal</text></g></svg>';
 fs.writeFileSync(path.join(__dirname,name+'.svg'),svg);fs.writeFileSync(path.join(__dirname,name+'.png'),render(svg,1800));
}
fs.writeFileSync(path.join(__dirname,'app-icon.png'),render(icon,1024));
for(const file of ['mac-vpn-app/Resources/AppIcon.svg','windows-vpn-app/assets/app-icon.svg','app-manager/ui/assets/secure-network.svg','vpn-site/public/assets/secure-access-terminal.svg','downloads-site/public/assets/secure-access-terminal.svg'])fs.writeFileSync(path.join(root,file),icon);
for(const file of ['mac-vpn-app/Resources/AppIcon.png','vpn-site/public/assets/vpn-app.png'])fs.copyFileSync(path.join(__dirname,'app-icon.png'),path.join(root,file));
fs.writeFileSync(path.join(root,'windows-vpn-app/assets/tray.svg'),tray);
fs.writeFileSync(path.join(root,'windows-vpn-app/ui/assets/app-icon.png'),render(icon,256));
fs.writeFileSync(path.join(root,'windows-vpn-app/ui/assets/tray.png'),render(tray,32));
fs.writeFileSync(path.join(root,'windows-vpn-app/ui/assets/tray-on.png'),render(tray.replace('<!--DOT-->','<circle cx="52" cy="52" r="10" fill="#3FBF7F" stroke="white" stroke-width="3"/>'),32));
for(const [kind,files]of Object.entries({svg:['app-icon.svg','hn-secure-access-terminal-logo.svg','hn-secure-access-terminal-logo-white.svg'],png:['app-icon.png','hn-secure-access-terminal-logo.png','hn-secure-access-terminal-logo-white.png']}))for(const file of files)fs.copyFileSync(path.join(__dirname,file),path.join(root,'branding-site/public/assets/brand',kind,file.startsWith('app-icon')?'hn-secure-access-terminal-'+file:file));
