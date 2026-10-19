'use strict';
async function websiteHeaders(details,account){
 const headers={...details.requestHeaders};for(const key of Object.keys(headers))if(key.toLowerCase()==='x-hn-browser-offer')delete headers[key];
 let url;try{url=new URL(details.url);}catch{return headers;}
 if(details.resourceType!=='mainFrame'||url.origin!=='https://auth.hngroup.org.uk'||!['/','/authorize'].includes(url.pathname)||url.searchParams.get('switch')==='1'||url.searchParams.get('account')==='other')return headers;
 try{const offer=await account.offer(details.url);if(offer)headers['X-HN-Browser-Offer']=offer;}catch{}return headers;
}
module.exports={websiteHeaders};
