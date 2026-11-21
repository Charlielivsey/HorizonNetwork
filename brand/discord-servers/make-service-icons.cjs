'use strict';
const fs=require('fs'),path=require('path');
const marks={
 'horizon-network-hq':'<path d="M29 91V45l35-19 35 19v46H29zM43 91V56h42v35M57 91V73h14v18M44 43h1m18 0h1m18 0h1"/>',
 'horizon-network-staff':'<circle cx="64" cy="43" r="12"/><path d="M42 88v-8c0-12 10-22 22-22s22 10 22 22v8M32 48a10 10 0 0 0 0 20m-4 22v-5c0-8 4-14 11-17M96 48a10 10 0 0 1 0 20m4 22v-5c0-8-4-14-11-17"/>',
 'horizon-advertising':'<path d="M30 51h21l42-20v58L51 70H30V51zM51 52v18m-9 1 8 24H37l-6-24M100 46l8-4m-8 20h10m-10 16 8 4"/>',
 'horizon-development':'<path d="m46 39-23 23 23 23m36-46 23 23-23 23M73 29 55 95"/>'
};
const colours=['#E97DE8','#5514B4','#E3E65B','#3E9BA3','#7B1D68','#C2306B','#5FAE7B'];
(async()=>{const{chromium}=require('../../browser-app/node_modules/playwright'),browser=await chromium.launch({args:['--no-sandbox']});try{for(const[name,mark]of Object.entries(marks)){
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>'+name.replaceAll('-',' ')+'</title><rect width="128" height="128" rx="28" fill="#5514B4"/><g fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">'+mark+'</g>'+colours.map((c,i)=>'<rect x="'+(20+i*12.6)+'" y="'+(106+(i%3)*2)+'" width="12.7" height="4" fill="'+c+'"/>').join('')+'</svg>';
 fs.writeFileSync(path.join(__dirname,name+'.svg'),svg);fs.writeFileSync(path.join(__dirname,'../../branding-site/public/assets/brand/svg/discord-server-'+name+'.svg'),svg);
 const page=await browser.newPage({viewport:{width:1024,height:1024}});await page.setContent('<style>html,body{margin:0;background:transparent}svg{width:1024px;height:1024px}</style>'+svg);const png=await page.screenshot({omitBackground:true});fs.writeFileSync(path.join(__dirname,name+'.png'),png);fs.writeFileSync(path.join(__dirname,'../../branding-site/public/assets/brand/png/discord-server-'+name+'.png'),png);await page.close();
}console.log('Four matching server service icons exported as SVG and 1024px PNG.');}finally{await browser.close();}})();
