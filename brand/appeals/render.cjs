'use strict';
// Outlined service wordmark using the approved local Plus Jakarta Sans font.
const fs=require('node:fs'),path=require('node:path');
(async()=>{
const fontkit=await import(process.env.HN_FONTKIT || 'fontkit');
const font=fontkit.openSync(path.join(__dirname,'../../staff-portal/public/assets/fonts/plus-jakarta-sans.woff2')).getVariation({wght:750});
const run=font.layout('HN Appeals'),size=78,scale=size/font.unitsPerEm;let x=122,paths='';
for(let i=0;i<run.glyphs.length;i++){const g=run.glyphs[i],p=run.positions[i];paths+='<path transform="translate('+(x+p.xOffset*scale).toFixed(3)+' '+(105-p.yOffset*scale).toFixed(3)+') scale('+scale+' '+(-scale)+')" d="'+g.path.toSVG()+'"/>';x+=p.xAdvance*scale;}
const width=Math.ceil(x+20),colours=['#E97DE8','#5514B4','#E3E65B','#3E9BA3','#7B1D68','#C2306B','#5FAE7B','#1C2138'];
const steps=colours.map((c,i)=>'<rect x="'+(124+i*(width-154)/8).toFixed(2)+'" y="'+(123+(i%3)*5)+'" width="'+((width-154)/8+1).toFixed(2)+'" height="6" fill="'+c+'"/>').join('');
const mark=colour=>'<g fill="none" stroke="'+colour+'" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M25 25h43l18 18v45a9 9 0 0 1-9 9H25a9 9 0 0 1-9-9V34a9 9 0 0 1 9-9z"/><path d="M68 25v20h18M32 51h20M32 65h15"/><path d="M68 77a23 23 0 1 0 20 38M68 77h14V63"/></g>';
const out=path.join(__dirname,'../../branding-site/public/assets/brand');
for(const [suffix,colour]of[['','#1A1A1A'],['-white','#FFFFFF']]){
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' 156" role="img" aria-label="HN Appeals"><title>HN Appeals</title>'+mark(colour)+'<g fill="'+colour+'">'+paths+'</g>'+steps+'</svg>';
 fs.writeFileSync(path.join(__dirname,'hn-appeals-logo'+suffix+'.svg'),svg);fs.writeFileSync(path.join(out,'svg/hn-appeals-logo'+suffix+'.svg'),svg);
}
const icon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="HN Appeals"><title>HN Appeals</title><rect width="128" height="128" rx="28" fill="#5514B4"/><g transform="translate(9 -6)">'+mark('#fff')+'</g>'+colours.slice(0,7).map((c,i)=>'<rect x="'+(15+i*14)+'" y="115" width="14" height="5" fill="'+c+'"/>').join('')+'</svg>';
fs.writeFileSync(path.join(__dirname,'hn-appeals-app-icon.svg'),icon);fs.writeFileSync(path.join(out,'svg/hn-appeals-app-icon.svg'),icon);console.log('Outlined HN Appeals logo and icon created.');

})().catch(e=>{console.error(e.message);process.exitCode=1;});
