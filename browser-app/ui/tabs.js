'use strict';
// The tab strip. Tabs glide into place whenever they open, close or move (FLIP: measure, change, then
// animate the difference with transforms only).
(()=>{const nodes=new Map();let drag=null;
const svg=id=>{const s=document.createElementNS('http://www.w3.org/2000/svg','svg'),u=document.createElementNS(s.namespaceURI,'use');u.setAttribute('href','icons.svg#'+id);s.append(u);return s;};
function make(t,action){const node=document.createElement('div');node.className='tab entering';node.dataset.id=t.id;node.draggable=true;node.setAttribute('role','presentation');
 const bg=document.createElement('span');bg.className='tab-bg';
 const indicator=document.createElement('span');indicator.className='tab-indicator';indicator.append(svg('globe'));
 const image=document.createElement('img');image.className='tab-icon';image.alt='';image.hidden=true;image.onerror=()=>{image.hidden=true;indicator.hidden=false;};
 const label=document.createElement('button');label.className='tab-title';label.setAttribute('role','tab');
 const close=document.createElement('button');close.className='close';close.append(svg('close'));close.onclick=e=>{e.stopPropagation();action('close',t.id);};
 node.append(bg,indicator,image,label,close);
 node.onmousedown=e=>{if(e.button===0&&!e.target.closest('.close'))action('select',t.id);};
 node.oncontextmenu=e=>{e.preventDefault();action('tab-menu',t.id);};
 node.onauxclick=e=>{if(e.button===1){e.preventDefault();action('close',t.id);}};
 node.ondragstart=e=>{drag=t.id;node.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',t.id);};
 node.ondragover=e=>{if(drag&&drag!==t.id){e.preventDefault();e.dataTransfer.dropEffect='move';}};
 node.ondrop=e=>{e.preventDefault();if(drag&&drag!==t.id)action('tab-reorder',{id:drag,before:t.id});};
 node.ondragend=()=>{node.classList.remove('dragging');drag=null;};
 node.addEventListener('animationend',()=>node.classList.remove('entering'),{once:true});
 return node;}
function render(state,action,motion){const list=document.getElementById('tabs'),before=new Map(),ids=new Set(state.tabs.map(t=>t.id));
 if(motion)for(const[id,node]of nodes)before.set(id,node.getBoundingClientRect().left);
 for(const[id,node]of nodes)if(!ids.has(id)){nodes.delete(id);if(motion){node.classList.add('closing');node.style.position='absolute';node.style.left=(before.get(id)-list.getBoundingClientRect().left)+'px';node.style.width=node.offsetWidth+'px';setTimeout(()=>node.remove(),170);}else node.remove();}
 state.tabs.forEach((t,index)=>{let node=nodes.get(t.id);if(!node){node=make(t,action);nodes.set(t.id,node);if(!motion)node.classList.remove('entering');}
  const live=[...list.children].filter(n=>!n.classList.contains('closing'));if(live[index]!==node)list.insertBefore(node,live[index]||null);
  node.classList.toggle('active',t.id===state.active);node.classList.toggle('pinned',!!t.pinned);node.classList.toggle('loading',!!t.loading);
  const image=node.querySelector('.tab-icon'),show=!!t.icon&&!t.loading;if(show&&image.getAttribute('src')!==t.icon)image.src=t.icon;image.hidden=!show;node.querySelector('.tab-indicator').hidden=show;
  const label=node.querySelector('.tab-title'),text=(t.muted?'🔇 ':'')+(t.title||'New tab');label.setAttribute('aria-selected',String(t.id===state.active));if(label.textContent!==text)label.textContent=text;if(node.title!==t.title)node.title=t.title;
  node.querySelector('.close').setAttribute('aria-label','Close '+t.title);});
 if(motion)for(const[id,node]of nodes){const was=before.get(id);if(was===undefined)continue;const dx=was-node.getBoundingClientRect().left;if(Math.abs(dx)>1)node.animate([{transform:'translateX('+dx+'px)'},{transform:'none'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});}
}
window.HNTabs=Object.freeze({render});})();
