/* HN Group IT workspace. Data and actions stay in the existing private staff service. */
(function () {
    'use strict';
    if (document.documentElement.dataset.hnApp !== 'it') return;
    document.documentElement.dataset.itUi = '1';
    const q = (s, r = document) => r.querySelector(s);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const groups = [
        {id:'accounts',title:'Account administration',icon:'lock',description:'Sign-in accounts, guest access and account locks.',paths:['/accounts','/staff-accounts']},
        {id:'operations',title:'Operations',icon:'shield',description:'Service status and on-call cover.',paths:['/status','/on-call']}
    ];
    const services = [
        {title:'Devices',href:'https://devices.hngroup.org.uk/',icon:'shield',desc:'Manage your approved devices'},
        {title:'Secure Access Terminal',href:'https://vpn.hngroup.org.uk/',icon:'shield',desc:'Secure connections and access'},
        {title:'Downloads',href:'https://downloads.hngroup.org.uk/',icon:'download',desc:'HN Browser and desktop apps'},
        {title:'Bots',href:'https://bots.hngroup.org.uk/',icon:'settings',desc:'Discord bot management'},
        {title:'Staff Portal',href:'https://staff.hngroup.org.uk/',icon:'building',desc:'Your colleagues and workplace'}
    ];
    let context, previousPath, drawerFocus, dialogSequence = 0;
    const narrow = () => matchMedia('(max-width: 1100px)').matches;
    let accountController;
    function account(open) {
        if (!accountController) return;
        if (open) return accountController.open(); else return accountController.close({restoreFocus:false});
    }
    function sectionsFor(ctx) {
        const sections=groups.map(group=>({...group,items:group.paths.map(path=>ctx.items.find(it=>it.href===path)).filter(Boolean)})).filter(section=>section.items.length);
        sections.push({id:'services',title:'HN Group services',icon:'building',description:'The other HN Group services connected to your work.',items:services});
        return sections;
    }
    function renderAccountMenu() {
        if (!context) return;
        const {me,icon,avatar}=context;
        const labels={available:'Available',busy:'Busy',away:'Away',ooo:'Out of office'};
        const status=me.status||{},label=labels[status.type]||'Set availability';
        const availability=me.system?'':'<button type="button" class="it-account-availability" data-action="status"><span><strong><i class="it-status-dot st-'+esc(status.type||'none')+'"></i>'+esc(label)+'</strong>'+(status.message?'<small>'+esc(status.message)+'</small>':'')+'</span>'+icon('edit')+'</button>';
        q('#it-account-menu').innerHTML='<div class="it-account-heading"><strong>Your account</strong><span>'+esc(me.username||me.email||'')+'</span></div>'+availability+'<a href="https://accounts.hngroup.org.uk/"'+(!me.impersonatedBy?' data-hn-account="/#overview"':'')+'>'+icon('user')+'<span>HN Account</span><span class="it-account-external">↗</span></a><a href="https://staff.hngroup.org.uk/settings">'+icon('settings')+'<span>Settings</span></a>'+((me.permissions||[]).includes('system.admin')&&!me.impersonatedBy?'<a href="https://staff.hngroup.org.uk/system">'+icon('shield')+'<span>System Admin</span></a>':'')+'<button type="button" data-action="logout">'+icon('logout')+'<span>Sign out</span></button><a class="it-account-sites" href="https://sites.hngroup.org.uk/"><span>Explore all HN sites</span><span class="it-account-external">↗</span></a>';
    }
    function positionAccount() {
        renderAccountMenu();
        const menu=q('#it-account-menu'),box=q('#it-account-button').getBoundingClientRect();
        menu.style.left=Math.max(12,Math.min(box.left,innerWidth-Math.min(320,innerWidth-24)-12))+'px';
        menu.style.bottom=Math.max(12,innerHeight-box.top+8)+'px';
        // This account popover is a dialog; retain its existing first-control focus.
        const first=q('a,button',menu);if(first)first.focus({preventScroll:true});
    }
    function drawer(open, restore = true) {
        const side = q('#it-sidebar');
        if (!side) return;
        document.body.classList.toggle('nav-open', !!open && narrow());
        side.inert = (narrow() && !open) || (!narrow() && document.documentElement.hasAttribute('data-workspace-collapsed'));
        q('#it-nav-shade').hidden = !narrow() || !open;
        q('#nav-toggle').setAttribute('aria-expanded', String(!!open && narrow()));
        if (open && narrow()) { drawerFocus = document.activeElement; q('a,button', side).focus(); }
        else if (restore && drawerFocus && drawerFocus.isConnected) { drawerFocus.focus(); drawerFocus = null; }
    }
    function route(path) {
        if (!context) return;
        const item = context.items.find(it => it.href === path);
        const section=sectionsFor(context).find(it=>it.id===new URLSearchParams(location.search).get('section'));
        const title = path === '/home' ? (section?section.title:'Overview') : path === '/notifications' ? 'Notifications' : path === '/exit-interview' ? 'Your exit interview' : item ? item.title : 'IT';
        q('#it-page-name').textContent = title;
        document.title = title + ' · HN Group IT';
        const routeKey=path+location.search;
        if (previousPath && previousPath !== routeKey) { account(false); drawer(false, false); }
        previousPath=routeKey;
        if(window.HNWorkspaceNavigation) window.HNWorkspaceNavigation.route(path);
    }
    function chrome(ctx) {
        context = ctx;
        const {me, icon, avatar} = ctx;
        let side = q('#it-sidebar');
        if (!side) {
            side = document.createElement('aside'); side.id = 'it-sidebar'; side.className = 'portal-sidebar'; side.setAttribute('aria-label','IT navigation');
            document.body.prepend(side);
            document.body.insertAdjacentHTML('beforeend','<button id="it-nav-shade" class="portal-nav-shade" type="button" aria-label="Close navigation" hidden></button>');
            document.body.insertAdjacentHTML('afterbegin','<a class="portal-skip" href="#view">Skip to content</a>');
            q('.topbar').insertAdjacentHTML('afterbegin','<div class="portal-context"><span>HN Group IT</span><span aria-hidden="true">/</span><strong id="it-page-name">Overview</strong></div>');
            q('#it-nav-shade').addEventListener('click', () => drawer(false));
        }
        if(!q('#it-account-button')) {
            side.innerHTML='<button type="button" class="portal-sidebar-close icon-btn" aria-label="Close navigation">'+icon('x')+'</button><a class="portal-brand" href="/home" data-link><img class="logo-light-theme" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group"><img class="logo-dark-theme" src="/assets/brand/hn-group-wordmark-white.svg" alt="HN Group"><span>IT workspace <span class="portal-brand-dot"></span></span></a><nav aria-label="IT workspace"></nav><div class="it-account"><button type="button" id="it-account-button" aria-haspopup="dialog" aria-controls="it-account-menu" aria-expanded="false"></button><div id="it-account-menu" popover="auto" role="dialog" aria-label="Your account"></div></div>';
            q('.portal-sidebar-close',side).addEventListener('click',()=>drawer(false));
            if(window.HNWorkspaceNavigation) accountController=window.HNWorkspaceNavigation.bindPopover({button:q('#it-account-button'),menu:q('#it-account-menu'),onOpen:positionAccount});
        }
        q('#it-account-button').innerHTML=avatar(me,'sm')+'<span><strong>'+esc(me.displayName)+'</strong><small>Your account</small></span>'+icon('chevron');
        if(!q('#it-account-menu').matches(':popover-open'))renderAccountMenu();
        q('#nav-toggle').setAttribute('aria-controls','it-sidebar');
        q('#search-btn').setAttribute('aria-label','Search IT tools (Ctrl or Command K)');
        drawer(document.body.classList.contains('nav-open'),false);
        if(window.HNWorkspaceNavigation)window.HNWorkspaceNavigation.configure({app:'it',sidebar:side,actions:[{title:'Cases',href:'/cases',icon:'shield'}],sections:sectionsFor(ctx),icon:icon,closeAccount:()=>account(false)});
        route(location.pathname);
    }
    function home(root,ctx){
        if(window.HNWorkspaceNavigation && window.HNWorkspaceNavigation.renderSection(root))return;
        const {me,icon}=ctx;
        const tile=it=>'<a class="it-tool" href="'+esc(it.href)+'"'+(it.href.startsWith('/')?' data-link':'')+'><span class="it-tool-icon">'+icon(it.icon)+'</span><span><strong>'+esc(it.title)+'</strong><small>'+esc(it.desc)+'</small></span>'+icon('chevronRight')+'</a>';
        root.innerHTML='<section class="it-welcome"><div><p class="portal-eyebrow">Your IT workspace</p><h1>Technology, connected.</h1><p>Welcome, '+esc(me.displayName)+'. Follow your IT requests, check services and find the tools you need.</p></div><div class="it-welcome-actions"><a class="btn btn-primary" href="https://staff.hngroup.org.uk/helpdesk?team=technology">'+icon('plus')+'Raise an IT issue</a><a class="btn btn-ghost" href="/cases" data-link>'+icon('message')+'Your cases</a></div></section><div class="it-dashboard"><div class="it-tool-sections"><section class="panel it-tool-panel"><div class="portal-section-head"><h2>Support &amp; operations</h2></div><div class="it-tool-grid">'+ctx.items.map(tile).join('')+'</div></section><section class="panel it-tool-panel"><div class="portal-section-head"><h2>Your IT services</h2></div><div class="it-tool-grid">'+services.map(tile).join('')+'</div></section></div><aside class="it-day"><section class="panel it-help"><span class="it-tool-icon">'+icon('shield')+'</span><h2>One connected workspace.</h2><p>Your account, devices and requests stay connected across HN Group. Cases update automatically as your IT team replies.</p><a href="https://accounts.hngroup.org.uk/">HN Account '+icon('chevronRight')+'</a><a href="https://status.hngroup.org.uk/">Public service status '+icon('chevronRight')+'</a></section></aside></div>';
    }
    function dialog(modal) {
        const previous = document.activeElement, title = q('h1,h2,h3',modal.el);
        if (title) {if(!title.id)title.id='it-dialog-'+(++dialogSequence);modal.el.setAttribute('aria-labelledby',title.id);}
        const close=modal.onClose;
        modal.onClose=()=>{if(previous&&previous.isConnected)previous.focus();if(close)close();};
        modal.el.addEventListener('keydown',e=>trap(e,modal.el));
    }
    function trap(e, container) {
        if(e.key!=='Tab')return;
        const fields=Array.from(container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')).filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
        const first=fields[0],last=fields[fields.length-1];
        if(!first){e.preventDefault();return;}
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
    document.addEventListener('click',e=>{
        if(e.target.closest('#nav-toggle')){e.preventDefault();e.stopImmediatePropagation();drawer(!document.body.classList.contains('nav-open'));}
        const link=e.target.closest('#it-sidebar a[data-link]');
        if(link){drawer(false,false);requestAnimationFrame(()=>q('#view').focus({preventScroll:true}));}
    },true);
    document.addEventListener('keydown',e=>{
        const menu=q('#it-account-menu:popover-open');
        if(menu){trap(e,menu);return;}
        if(narrow()&&document.body.classList.contains('nav-open')){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();drawer(false);}else trap(e,q('#it-sidebar'));}
    },true);
    addEventListener('resize',()=>{if(context){account(false);drawer(false,false);}});
    window.HNIT={chrome,route,home,dialog};
})();
