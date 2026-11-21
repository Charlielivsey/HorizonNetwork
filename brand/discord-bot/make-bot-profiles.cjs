// HN Utilities / HN Logs Discord artwork. Preserve the approved Horizon Network wordmarks verbatim.
const fs=require('node:fs'),path=require('node:path');
const {Resvg}=require('../../browser-app/node_modules/@resvg/resvg-js');
const root=path.resolve(__dirname,'../..'),served=path.join(root,'branding-site/public/assets/brand');
const wordmarks={avatar:fs.readFileSync(path.join(root,'brand/logos/horizon-network-wordmark-stacked-white.svg'),'utf8'),banner:fs.readFileSync(path.join(root,'brand/logos/horizon-network-wordmark-white.svg'),'utf8')};
const fonts=['Regular','Bold'].map(w=>path.join(root,'docs-site/lib/pdf-assets/PlusJakartaSans-'+w+'.ttf'));
const STRIPE=[['#E97DE8',14],['#5514B4',14],['#E3E65B',6],['#3E9BA3',20],['#7A1F6C',10],['#C2306B',10],['#5FAE7B',13],['#FFFFFF',13]];
function stripe(w,y,h){let x=0;return STRIPE.map(([c,p])=>{const v=`<rect x="${x}" y="${y}" width="${w*p/100+.2}" height="${h}" fill="${c}"/>`;x+=w*p/100;return v;}).join('');}
function logo(kind,x,y,w,h){return wordmarks[kind].replace(/<\?xml[^>]*\?>/,'').replace('<svg ',`<svg x="${x}" y="${y}" `).replace(/width="[^"]*" height="[^"]*"/,`width="${w}" height="${h}"`);}
const manifest=[];
for(const bot of [{id:'utilities',label:'HN Utilities',short:'UTILITIES',tag:'Server tools. Seamlessly connected.',glow:'#A43CCC'},{id:'logs',label:'HN Logs',short:'LOGS',tag:'Every event. A clear record.',glow:'#644BE0'}]){
 for(const kind of ['avatar','banner']){
  const avatar=kind==='avatar',w=avatar?1024:1360,h=avatar?1024:480;
  const defs=`<defs><linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1C2135"/><stop offset=".48" stop-color="#351075"/><stop offset="1" stop-color="#5514B4"/></linearGradient><radialGradient id="glow"><stop stop-color="${bot.glow}" stop-opacity=".95"/><stop offset="1" stop-color="${bot.glow}" stop-opacity="0"/></radialGradient><radialGradient id="teal"><stop stop-color="#3E9BA3" stop-opacity=".35"/><stop offset="1" stop-color="#3E9BA3" stop-opacity="0"/></radialGradient></defs>`;
  const bg=`<rect width="${w}" height="${h}" fill="url(#base)"/><ellipse cx="${w*.87}" cy="${h*.08}" rx="${w*.58}" ry="${h*.87}" fill="url(#glow)"/><ellipse cx="${w*.04}" cy="${h*.97}" rx="${w*.63}" ry="${h*.98}" fill="url(#teal)"/>`;
  let art;
  if(avatar){art=`<circle cx="512" cy="512" r="442" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2"/><circle cx="512" cy="512" r="403" fill="none" stroke="#fff" stroke-opacity=".045" stroke-width="2"/>${logo(kind,194,218,636,447)}<text x="512" y="747" text-anchor="middle" fill="white" font-family="Plus Jakarta Sans" font-size="46" font-weight="700" letter-spacing="7">${bot.short}</text>`;}
  else {art=`${logo(kind,400,103,560,117)}<text x="680" y="306" text-anchor="middle" fill="white" font-family="Plus Jakarta Sans" font-size="37" font-weight="700">${bot.label}</text><text x="680" y="353" text-anchor="middle" fill="#E9DDF9" font-family="Plus Jakarta Sans" font-size="24">${bot.tag}</text>${stripe(w,h-12,12)}`;}
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${bot.label} ${kind}"><title>${bot.label} Discord ${kind}</title>${defs}${bg}${art}</svg>`;
  const file='hn-'+bot.id+'-'+kind;
  fs.writeFileSync(path.join(__dirname,file+'.svg'),svg);
  const png=new Resvg(svg,{font:{fontFiles:fonts,loadSystemFonts:false}}).render().asPng();
  if(png.length>=10*1024*1024)throw Error('Artwork too large');
  fs.writeFileSync(path.join(__dirname,file+'.png'),png);
  fs.copyFileSync(path.join(__dirname,file+'.svg'),path.join(served,'svg',file+'.svg'));
  fs.copyFileSync(path.join(__dirname,file+'.png'),path.join(served,'png',file+'.png'));
  manifest.push({bot:bot.label,file,width:w,height:h,aspectRatio:avatar?'1:1':'17:6',format:'PNG',bytes:png.length,background:'Opaque',crop:avatar?'Circle-safe wordmark and label':'Centre-safe text; lower-left reserved for overlapping profile picture',svgSource:file+'.svg'});
 }
}
fs.writeFileSync(path.join(__dirname,'bot-profile-parameters.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(manifest);
