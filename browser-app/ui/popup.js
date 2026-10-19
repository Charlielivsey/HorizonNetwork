'use strict';
// Address bar suggestions. Clicks choose on pointer-down, before the address bar loses focus.
const list=document.getElementById('list'),ICONS={search:'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM16 16l5 5',bookmark:'m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z',history:'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 7.5V12l3 2',go:'M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z'};
let shown=0;
function svg(kind){const s=document.createElementNS('http://www.w3.org/2000/svg','svg'),p=document.createElementNS(s.namespaceURI,'path');s.setAttribute('viewBox','0 0 24 24');p.setAttribute('d',ICONS[kind]||ICONS.go);s.append(p);return s;}
window.popup.onItems(({items,index,theme,reduceMotion})=>{
 window.HNTheme.schedule({theme,revision:0});document.body.dataset.motion=reduceMotion?'reduced':'';
 const fresh=!shown;shown=items.length;list.classList.toggle('fresh',fresh);list.replaceChildren();
 items.forEach((item,i)=>{const li=document.createElement('li');li.setAttribute('role','option');li.setAttribute('aria-selected',String(i===index));li.className=(item.hn?'hn ':'')+item.kind;
  const icon=document.createElement('span');icon.className='icon';if(item.hn){const img=document.createElement('img');img.src='assets/favicon.svg';img.alt='';icon.append(img);}else icon.append(svg(item.kind));
  const text=document.createElement('span');text.className='text';const title=document.createElement('strong');title.textContent=item.kind==='search'?item.title:(item.hn&&item.kind==='site'?item.hn:item.title||item.url);const sub=document.createElement('small');sub.textContent=item.kind==='search'?'Search '+item.engine:item.url.replace(/^https?:\/\/(www\.)?/,'').replace(/\/$/,'');text.append(title,sub);li.append(icon,text);
  const tag=item.hn?'HN Group':{bookmark:'Bookmark',history:'History',go:'Go to'}[item.kind];if(tag){const em=document.createElement('em');em.textContent=tag;li.append(em);}
  li.addEventListener('pointerdown',e=>{e.preventDefault();window.popup.choose(i);});list.append(li);});
});
