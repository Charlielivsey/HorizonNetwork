'use strict';
const {SITES}=require('./sites.cjs');
const HOSTS=new Set(SITES.map(([url])=>new URL(url).hostname).filter(host=>host!=='mail.google.com'));
HOSTS.add('horizonetwork.com');HOSTS.add('horizon-network.co.uk');
const PALETTES={
 'midnight-lavender':['#151222','#201b31','#302740','#f2edfc','#b2a6c5','#c3a2ff','#3c3150'],
 daylight:['#f5f3f9','#ffffff','#eae4f4','#251c35','#736781','#6731ad','#dcd3e8'],
 'deep-ocean':['#0c1c2b','#102738','#18394c','#e5f5fc','#8db6cc','#6acddd','#274657'],
 forest:['#111f1b','#1a2d26','#243e32','#eaf7ed','#a4c7b0','#98d5a5','#355444'],
 rose:['#291b27','#352332','#473042','#fff1f8','#d5acc5','#efaace','#604057']
};
function eligible(url){try{const u=new URL(url);return u.href==='hn-browser://start/'||u.protocol==='https:'&&HOSTS.has(u.hostname);}catch{return false;}}
function css(theme){const p=PALETTES[theme];if(!p)throw Error('Unknown theme');const[bg,surface,raised,ink,muted,accent,line]=p;return `:root,body{color-scheme:${theme==='daylight'?'light':'dark'}!important;--bg:${bg}!important;--panel:${surface}!important;--surface:${surface}!important;--surface-2:${raised}!important;--raised:${raised}!important;--tint:${raised}!important;--ink:${ink}!important;--text:${ink}!important;--muted:${muted}!important;--text-muted:${muted}!important;--accent:${accent}!important;--primary:${accent}!important;--accent-hover:${accent}!important;--primary-hover:${accent}!important;--accent-soft:${raised}!important;--primary-tint:${raised}!important;--input-bg:${surface}!important;--line:${line}!important;--border:${line}!important;--border-strong:${line}!important;--on-primary:${bg}!important;--on-accent:${bg}!important}body{background-color:${bg}!important;color:${ink}!important}input,textarea,select{color-scheme:${theme==='daylight'?'light':'dark'}}`;
}
module.exports={eligible,css,PALETTES};
