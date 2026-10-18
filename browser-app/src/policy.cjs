'use strict';
const THEMES=['midnight-lavender','daylight','deep-ocean','forest','rose'];
const HOME='hn-browser://start/';
function address(value){
 if(typeof value!=='string'||value.length>8192)throw Error('Enter a website address or search.');
 const input=value.trim();if(!input||input===HOME)return HOME;
 if(/^[a-z][a-z\d+.-]*:/i.test(input)&&!/^https?:\/\//i.test(input)&&!/^([a-z0-9.-]+|\[[a-f0-9:]+\]):[0-9]+(?:\/|$)/i.test(input))throw Error('Only HTTP and HTTPS websites can be opened.');
 let url;try{url=new URL(/^https?:\/\//i.test(input)?input:'https://'+input);}catch{}
 if(url&&/^https?:$/.test(url.protocol)&&!url.username&&!url.password&&(!/\s/.test(input))&&(url.hostname.includes('.')||url.hostname==='localhost'||url.hostname.includes(':')))return url.href;
 if(/^https?:\/\//i.test(input))throw Error('That website address is not valid.');
 return 'https://www.google.com/search?q='+encodeURIComponent(input);
}
function webURL(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}}
function navigationAllowed(value){return value===HOME||webURL(value);}
function theme(value){if(!THEMES.includes(value))throw Error('Choose an available theme.');return value;}
module.exports={HOME,THEMES,address,webURL,navigationAllowed,theme};
