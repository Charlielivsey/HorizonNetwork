/* Approved company branding for authenticated staff workspaces. No permission or document changes. */
(function(root){
 'use strict';
 const brands={
  'hn group':{name:'HN Group',legal:'HN Group Limited',logo:'hn-group-wordmark',host:'hngroup.org.uk'},
  'horizon network':{name:'Horizon Network',legal:'Horizon Network Limited',parent:'HN Group',logo:'horizon-network-wordmark',host:'network.hngroup.org.uk'},
  'horizon media':{name:'Horizon Media',legal:'Horizon Media Group Limited',parent:'HN Group',logo:'horizon-media-group-logo',host:'media.hngroup.org.uk'},
  'horizon advertising':{name:'Horizon Advertising',legal:'Horizon Advertising Limited',parent:'Horizon Media Group',logo:'horizon-advertising-logo',host:'horizonadvertising.co.uk'},
  'horizon development':{name:'Horizon Development',legal:'Horizon Development Limited',parent:'Horizon Network',logo:'horizon-development-logo',host:'development.network.hngroup.org.uk'}
 };
 // Auth exposes the selected company as company; Portal also supplies profileCompany.
 // mainCompany is only a fallback for older identities without a selected-company field.
 function resolve(user){
  const company=String(user && (user.profileCompany || user.company || user.mainCompany) || '').trim().toLowerCase().replace(/\s+limited$/,'');
  return brands[company==='horizon media group'?'horizon media':company] || brands['hn group'];
 }
 function caption(b){return b.legal+(b.parent?', a subsidiary of '+b.parent:'');}
 function apply(user){
  if(!root.document)return;
  const doc=root.document,b=resolve(user),name=caption(b);
  doc.documentElement.dataset.staffBrand=b.logo;
  // Restrict replacement to application chrome: never touch document artwork, signatures or company records.
  doc.querySelectorAll('.portal-brand img,.topbar > .brand img,.topbar .brand img,header.top .brand img,header .brand img,.pf-brand img,.footer-brand img').forEach(img=>{
   const dark=img.matches('.logo-dark-theme,.on-dark') || (img.closest('.footer-brand') && !img.matches('.on-light,.logo-light-theme'));
   const src=(doc.documentElement.dataset.accountBase||'')+'/assets/staff-brand/'+b.logo+(dark?'-white':'')+'.svg?v=20261120-company-logos';
   if(img.getAttribute('src')!==src)img.setAttribute('src',src);
   img.alt=b.name;img.style.objectFit='contain';
   if(img.closest('a'))img.closest('a').title=name;
  });
  const footer=doc.querySelector('.pf-bottom p,.footer-legal');
  if(footer)footer.textContent='© '+new Date().getFullYear()+' '+name+'. Internal use only.';
  const bottomLink=doc.querySelector('.pf-bottom > a');
  if(bottomLink){bottomLink.href='https://'+b.host+'/';bottomLink.textContent=b.host;}
  doc.querySelectorAll('.pf-tag').forEach(el=>{el.textContent=name+'. Your staff workspace.';});
  const standardFooter=doc.querySelector('.site-footer .footer-inner,.footer-inner');
  if(standardFooter && !footer){let text=standardFooter.querySelector('[data-staff-brand-legal]');if(!text){text=doc.createElement('p');text.dataset.staffBrandLegal='';text.style.cssText='flex-basis:100%;font-size:12px;color:var(--muted,var(--text-muted));margin:12px 0 0';standardFooter.append(text);}text.textContent=name+'. Internal use only.';}
 }
 const api={resolve,caption,apply};
 if(typeof module!=='undefined')module.exports=api;
 root.HNStaffBrand=api;
})(typeof window!=='undefined'?window:globalThis);
