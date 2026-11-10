/* Common navigation for the Staff Portal and HR. Authorization stays in each adapter/API. */
(function () {
    'use strict';
    let config, previousUrl;
    const controllers = new Set(), bindings = new WeakMap();
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const narrow = () => matchMedia('(max-width:1100px)').matches;
    const reduced = () => matchMedia('(prefers-reduced-motion:reduce)').matches;
    const overviewHref = section => '/home?section='+encodeURIComponent(section.id);
    const pathOf = href => { try { return new URL(href,location.origin).pathname; } catch { return ''; } };
    const sectionAt = path => {
        if(!config)return null;
        if(path==='/home')return config.sections.find(s=>s.id===new URLSearchParams(location.search).get('section')) || null;
        return config.sections.find(s=>s.items.some(it=>!/^https?:/.test(it.href)&&pathOf(it.href)===path)) || null;
    };
    function link(item, cls) {
        const external=/^https?:/.test(item.href);
        return '<a class="'+cls+'" href="'+esc(item.href)+'"'+(external?'':' data-link')+'>'+config.icon(item.icon || 'grid')+'<span>'+esc(item.title)+'</span>'+(external?'<span aria-hidden="true">↗</span>':'')+'</a>';
    }
    function collapse(value, persist=true) {
        if(!config)return;
        if(value)document.documentElement.dataset.workspaceCollapsed='true';else delete document.documentElement.dataset.workspaceCollapsed;
        if(persist)try{localStorage.setItem('hn.workspace.sidebar.'+config.app,value?'collapsed':'expanded');}catch{}
        if(config.closeAccount)config.closeAccount();
        for(const controller of controllers)controller.close({restoreFocus:false});
        if(!narrow()){
            config.sidebar.inert=!!value;
            if(value)config.sidebar.setAttribute('aria-hidden','true');else config.sidebar.removeAttribute('aria-hidden');
        }
        const toggle=document.querySelector('#workspace-sidebar-toggle');
        if(toggle){toggle.setAttribute('aria-expanded',String(!value));toggle.setAttribute('aria-label',value?'Show sidebar':'Hide sidebar');toggle.title=value?'Show sidebar':'Hide sidebar';}
    }
    function configure(value) {
        config={...value,sections:value.sections.filter(s=>s.items&&s.items.length)};
        document.documentElement.dataset.workspaceApp=config.app;
        const nav=config.sidebar.querySelector(':scope > nav');
        if(nav)nav.innerHTML='<div class="portal-nav-group"><span class="portal-nav-label">Your workspace</span>'+link({title:'Overview',href:'/home',icon:'grid'},'portal-nav-link')+link({title:'Notifications',href:'/notifications',icon:'bell'},'portal-nav-link')+'</div><div class="portal-nav-group workspace-main-sections"><span class="portal-nav-label">Sections</span>'+config.sections.map(s=>link({title:s.title,href:overviewHref(s),icon:s.icon},'portal-nav-link workspace-section-link')).join('')+'</div>';
        let toggle=document.querySelector('#workspace-sidebar-toggle');
        if(!toggle){toggle=document.createElement('button');toggle.id='workspace-sidebar-toggle';toggle.type='button';toggle.className='icon-btn workspace-sidebar-toggle';toggle.innerHTML=config.icon('menu');document.querySelector('.topbar').prepend(toggle);toggle.onclick=()=>collapse(!document.documentElement.hasAttribute('data-workspace-collapsed'));}
        toggle.setAttribute('aria-controls',config.sidebar.id);
        for(const controller of controllers)if(!controller.button.isConnected){controller.destroy();controllers.delete(controller);}
        let saved=false;try{saved=localStorage.getItem('hn.workspace.sidebar.'+config.app)==='collapsed';}catch{}
        collapse(saved,false);route(location.pathname);
    }
    function route(path) {
        if(!config)return;
        const section=sectionAt(path),sectionOverview=path==='/home'&&section;
        config.sidebar.querySelectorAll(':scope > nav a').forEach(a=>{
            const active=section ? a.getAttribute('href')===overviewHref(section) : a.getAttribute('href')===path;
            a.classList.toggle('is-current',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
        });
        const item=section&&section.items.find(it=>pathOf(it.href)===path);
        const title=sectionOverview?section.title:item?item.title:path==='/home'?'Overview':null;
        if(title){const name=document.querySelector('#portal-page-name,#hr-page-name');if(name)name.textContent=section&&!sectionOverview?section.title+' / '+title:title;document.title=title+' · '+(config.app==='hr'?'HN Group HR':'HN Group Staff Portal');}
        const url=location.pathname+location.search;
        if(previousUrl&&previousUrl!==url){if(config.closeAccount)config.closeAccount();for(const controller of controllers)controller.close({restoreFocus:false});}
        previousUrl=url;
    }
    function renderSection(root) {
        const section=sectionAt(location.pathname);if(!section || location.pathname!=='/home')return false;
        root.innerHTML='<div class="page-head"><span class="page-icon">'+config.icon(section.icon || 'grid')+'</span><div><h1>'+esc(section.title)+'</h1><p class="muted">'+esc(section.description || 'Choose a tool to get started.')+'</p></div></div><div class="workspace-overview-grid">'+section.items.map(item=>'<a class="workspace-overview-card" href="'+esc(item.href)+'"'+(/^https?:/.test(item.href)?'':' data-link')+'><span class="workspace-card-icon">'+config.icon(item.icon || 'grid')+'</span><strong>'+esc(item.title)+'</strong><span>'+esc(item.desc || '')+'</span>'+config.icon('chevronRight')+'</a>').join('')+'</div>';return true;
    }
    function decorate(root,path) {
        if(!config)return;
        root.querySelectorAll('.workspace-section-nav').forEach(el=>el.remove());
        const section=sectionAt(path);if(!section)return;
        const nav=document.createElement('nav');nav.className='workspace-section-nav';nav.setAttribute('aria-label',section.title+' pages');
        nav.innerHTML=link({title:section.title+' overview',href:overviewHref(section),icon:section.icon},'workspace-page-link workspace-overview-link')+section.items.map(it=>link(it,'workspace-page-link')).join('');
        for(const a of nav.querySelectorAll('a')){
            const active=path==='/home'?a.getAttribute('href')===overviewHref(section):!/^https?:/.test(a.getAttribute('href'))&&pathOf(a.getAttribute('href'))===path;
            if(active){a.setAttribute('aria-current','page');a.classList.add('is-current');}
        }
        root.prepend(nav);route(path);
    }
    function animate(menu, opening) {
        if(reduced())return Promise.resolve();
        return menu.animate(opening?[{opacity:0,transform:'translateY(7px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}]:[{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(5px) scale(.98)'}],{duration:opening?160:120,easing:'ease-out'}).finished.catch(()=>{});
    }
    function bind(options, details) {
        const button=options.button,menu=options.menu;
        if(bindings.has(button))return bindings.get(button);
        const abort=new AbortController(),signal=abort.signal;
        let desired=details?details.open:menu.matches(':popover-open'),sequence=0;
        if(details)details.dataset.workspaceAccount='true';else menu.setAttribute('popover','manual');
        button.setAttribute('aria-controls',menu.id);button.setAttribute('aria-expanded',String(desired));
        const visible=()=>details?details.open:menu.matches(':popover-open');
        async function set(open, restoreFocus=false){
            if(open===desired&&visible()===open)return;
            desired=open;const run=++sequence;menu.getAnimations().forEach(a=>a.cancel());
            button.setAttribute('aria-expanded',String(open));
            if(open){if(details)details.open=true;else if(!visible())menu.showPopover();if(options.onOpen)options.onOpen();await animate(menu,true);}
            else if(visible()){await animate(menu,false);if(run!==sequence)return;if(details)details.open=false;else if(visible())menu.hidePopover();}
            if(run===sequence&&!open&&restoreFocus&&button.isConnected)button.focus({preventScroll:true});
        }
        const controller={button,open:()=>set(true),close:({restoreFocus=false}={})=>set(false,restoreFocus),toggle:()=>set(!desired),destroy:()=>{abort.abort();menu.getAnimations().forEach(a=>a.cancel());}};
        button.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();controller.toggle();},{signal});
        document.addEventListener('pointerdown',e=>{if(button.isConnected&&desired&&!button.contains(e.target)&&!menu.contains(e.target)&&!document.querySelector('.modal-backdrop'))controller.close();},{capture:true,signal});
        document.addEventListener('keydown',e=>{if(button.isConnected&&desired&&e.key==='Escape'&&!document.querySelector('.modal-backdrop,.search-overlay')){e.preventDefault();e.stopImmediatePropagation();controller.close({restoreFocus:true});}},{capture:true,signal});
        bindings.set(button,controller);controllers.add(controller);return controller;
    }
    addEventListener('resize',()=>{if(config)collapse(document.documentElement.hasAttribute('data-workspace-collapsed'),false);});
    window.HNWorkspaceNavigation={configure,collapse,route,decorate,renderSection,hasView:path=>path==='/home'&&!!sectionAt(path),overview:(root)=>renderSection(root),bindPopover:options=>bind(options,null),bindDetails:options=>bind(options,options.details)};
})();
