/* HN Group HR workspace. Data and actions stay in the existing private staff service. */
(function () {
    'use strict';
    if (document.documentElement.dataset.hnApp !== 'hr') return;
    document.documentElement.dataset.hrUi = '1';
    const q = (s, r = document) => r.querySelector(s);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const groups = [
        {id:'work', title:'Your work', icon:'clock', description:'Leave, working hours, flexible arrangements and your documents.', paths:['/leave','/rotas','/flexible','/staff-files']},
        {id:'development', title:'Development', icon:'star', description:'Reviews, goals, feedback and training for your development.', paths:['/reviews','/objectives','/feedback','/training']},
        {id:'people', title:'People & recruitment', icon:'users', description:'Staff records, recruitment and the people tools you can use.', paths:['/employees','/onboarding','/jobs','/job-descriptions','/exit-interviews','/cases']}
    ];
    const services = [
        {title:'Staff Portal', href:'https://staff.hngroup.org.uk/', icon:'building', desc:'Your colleagues and workplace'},
        {title:'HN Group Finance', href:'https://finance.hngroup.org.uk/', icon:'pound', desc:'Pay, expenses and company finances'},
        {title:'HN Group Docs', href:'https://docs.hngroup.org.uk/', icon:'file', desc:'Documents, policies and storage'}
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
        if (ctx.me.exitInterviewDue || location.pathname === '/exit-interview') sections[0].items.push({title:'Your exit interview',href:'/exit-interview',icon:'logout',desc:'Your own leaving interview and response.'});
        sections.push({id:'services',title:'HN Group services',icon:'building',description:'The other HN Group services connected to your work.',items:services});
        return sections;
    }
    function renderAccountMenu() {
        if (!context) return;
        const {me,icon,avatar}=context;
        q('#hr-account-menu').innerHTML='<div class="hr-account-heading">'+avatar(me,'md')+'<div><strong>'+esc(me.displayName)+'</strong><span>'+esc(me.jobTitle || me.company || 'HN Group')+'</span></div></div><a href="https://accounts.hngroup.org.uk/"'+(!me.impersonatedBy?' data-hn-account="/#overview"':'')+'>'+icon('user')+'HN Account</a><a href="https://staff.hngroup.org.uk/settings">'+icon('settings')+'Settings</a>'+((me.permissions||[]).includes('system.admin')&&!me.impersonatedBy?'<a href="https://staff.hngroup.org.uk/system">'+icon('shield')+'System administration</a>':'')+'<button type="button" data-action="logout">'+icon('logout')+'Sign out</button>';
    }
    function positionAccount() {
        renderAccountMenu();
        const menu=q('#hr-account-menu'),box=q('#hr-account-button').getBoundingClientRect();
        menu.style.left=Math.max(12,Math.min(box.left,innerWidth-Math.min(300,innerWidth-24)-12))+'px';
        menu.style.bottom=Math.max(12,innerHeight-box.top+8)+'px';
        // This account popover is a dialog; retain its existing first-control focus.
        const first=q('a,button',menu);if(first)first.focus({preventScroll:true});
    }
    function drawer(open, restore = true) {
        const side = q('#hr-sidebar');
        if (!side) return;
        document.body.classList.toggle('nav-open', !!open && narrow());
        side.inert = (narrow() && !open) || (!narrow() && document.documentElement.hasAttribute('data-workspace-collapsed'));
        q('#hr-nav-shade').hidden = !narrow() || !open;
        q('#nav-toggle').setAttribute('aria-expanded', String(!!open && narrow()));
        if (open && narrow()) { drawerFocus = document.activeElement; q('a,button', side).focus(); }
        else if (restore && drawerFocus && drawerFocus.isConnected) { drawerFocus.focus(); drawerFocus = null; }
    }
    function route(path) {
        if (!context) return;
        const item = context.items.find(it => it.href === path);
        const section=sectionsFor(context).find(it=>it.id===new URLSearchParams(location.search).get('section'));
        const title = path === '/home' ? (section?section.title:'Overview') : path === '/notifications' ? 'Notifications' : path === '/exit-interview' ? 'Your exit interview' : item ? item.title : 'HR';
        q('#hr-page-name').textContent = title;
        document.title = title + ' · HN Group HR';
        const routeKey=path+location.search;
        if (previousPath && previousPath !== routeKey) { account(false); drawer(false, false); }
        previousPath=routeKey;
        if(window.HNWorkspaceNavigation) window.HNWorkspaceNavigation.route(path);
    }
    function chrome(ctx) {
        context = ctx;
        const {me, icon, avatar} = ctx;
        let side = q('#hr-sidebar');
        if (!side) {
            side = document.createElement('aside'); side.id = 'hr-sidebar'; side.className = 'portal-sidebar'; side.setAttribute('aria-label','HR navigation');
            document.body.prepend(side);
            document.body.insertAdjacentHTML('beforeend','<button id="hr-nav-shade" class="portal-nav-shade" type="button" aria-label="Close navigation" hidden></button>');
            document.body.insertAdjacentHTML('afterbegin','<a class="portal-skip" href="#view">Skip to content</a>');
            q('.topbar').insertAdjacentHTML('afterbegin','<div class="portal-context"><span>HN Group HR</span><span aria-hidden="true">/</span><strong id="hr-page-name">Overview</strong></div>');
            q('#hr-nav-shade').addEventListener('click', () => drawer(false));
        }
        if(!q('#hr-account-button')) {
            side.innerHTML='<button type="button" class="portal-sidebar-close icon-btn" aria-label="Close navigation">'+icon('x')+'</button><a class="portal-brand" href="/home" data-link><img class="logo-light-theme" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group"><img class="logo-dark-theme" src="/assets/brand/hn-group-wordmark-white.svg" alt="HN Group"><span>HR workspace <span class="portal-brand-dot"></span></span></a><nav aria-label="HR workspace"></nav><div class="hr-account"><button type="button" id="hr-account-button" aria-haspopup="dialog" aria-controls="hr-account-menu" aria-expanded="false"></button><div id="hr-account-menu" popover="auto" role="dialog" aria-label="Your account"></div></div>';
            q('.portal-sidebar-close',side).addEventListener('click',()=>drawer(false));
            if(window.HNWorkspaceNavigation) accountController=window.HNWorkspaceNavigation.bindPopover({button:q('#hr-account-button'),menu:q('#hr-account-menu'),onOpen:positionAccount});
        }
        q('#hr-account-button').innerHTML=avatar(me,'sm')+'<span><strong>'+esc(me.displayName)+'</strong><small>Your account</small></span>'+icon('chevron');
        if(!q('#hr-account-menu').matches(':popover-open'))renderAccountMenu();
        q('#nav-toggle').setAttribute('aria-controls','hr-sidebar');
        q('#search-btn').setAttribute('aria-label','Search HR tools (Ctrl or Command K)');
        drawer(document.body.classList.contains('nav-open'),false);
        if(window.HNWorkspaceNavigation)window.HNWorkspaceNavigation.configure({app:'hr',sidebar:side,sections:sectionsFor(ctx),icon:icon,closeAccount:()=>account(false)});
        route(location.pathname);
    }
    function home(root, ctx) {
        if(window.HNWorkspaceNavigation && window.HNWorkspaceNavigation.renderSection(root))return;
        const {me,items,icon} = ctx;
        const tile = it => '<a class="hr-tool" href="'+esc(it.href)+'" data-link><span class="hr-tool-icon">'+icon(it.icon)+'</span><span><strong>'+esc(it.title)+(it.badge&&me[it.badge]?' <span class="count-badge">'+Number(me[it.badge])+'</span>':'')+'</strong><small>'+esc(it.desc)+'</small></span>'+icon('chevronRight')+'</a>';
        const pending = [
            {count:me.leaveApprovals,href:'/leave?tab=approvals',icon:'sun',title:'Leave to approve'},
            {count:me.timesheetApprovals,href:'/rotas?tab=approvals',icon:'clock',title:'Timesheets to approve'},
            {count:me.feedbackDue,href:'/feedback',icon:'message',title:'Feedback requests'},
            {count:me.trainingDue,href:'/training',icon:'star',title:'Training reminders'}
        ].filter(it=>it.count);
        root.innerHTML = '<section class="hr-welcome"><div><p class="portal-eyebrow">Your HR workspace</p><h1>HN Group HR</h1><p>Welcome, '+esc(me.displayName)+'. Manage your time, grow your skills and find the people tools you need.</p></div><div class="hr-welcome-actions"><a class="btn btn-primary" href="/leave" data-link>'+icon('plus')+'Request leave</a><a class="btn btn-ghost" href="/staff-files" data-link>'+icon('file')+'Your documents</a></div></section>'+
            (pending.length?'<section class="hr-attention" aria-label="Needs your attention">'+pending.map(it=>'<a href="'+it.href+'" data-link>'+icon(it.icon)+'<strong>'+Number(it.count)+'</strong><span>'+it.title+'</span>'+icon('chevronRight')+'</a>').join('')+'</section>':'')+
            '<div class="hr-dashboard"><div class="hr-tool-sections">'+groups.map(group=>{const list=group.paths.map(path=>items.find(it=>it.href===path)).filter(Boolean);return list.length?'<section class="panel hr-tool-panel"><div class="portal-section-head"><h2><a href="/home?section='+group.id+'" data-link>'+group.title+'</a></h2></div><div class="hr-tool-grid">'+list.map(tile).join('')+'</div></section>':'';}).join('')+'</div><aside class="hr-day"><section class="panel hr-tasks" id="hr-onboarding" hidden></section><section class="panel hr-help"><span class="hr-tool-icon">'+icon('users')+'</span><h2>Everything stays connected.</h2><p>Your staff records, leave and development stay together. Your pay and personal account have their own HN services.</p><a href="https://finance.hngroup.org.uk/">HN Group Finance '+icon('chevronRight')+'</a><a href="https://docs.hngroup.org.uk/policies">Read policies '+icon('chevronRight')+'</a></section></aside></div>';
    }
    function dialog(modal) {
        const previous = document.activeElement, title = q('h1,h2,h3',modal.el);
        if (title) {if(!title.id)title.id='hr-dialog-'+(++dialogSequence);modal.el.setAttribute('aria-labelledby',title.id);}
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
        const link=e.target.closest('#hr-sidebar a[data-link]');
        if(link){drawer(false,false);requestAnimationFrame(()=>q('#view').focus({preventScroll:true}));}
    },true);
    document.addEventListener('keydown',e=>{
        const menu=q('#hr-account-menu:popover-open');
        if(menu){trap(e,menu);return;}
        if(narrow()&&document.body.classList.contains('nav-open')){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();drawer(false);}else trap(e,q('#hr-sidebar'));}
    },true);
    addEventListener('resize',()=>{if(context){account(false);drawer(false,false);}});
    window.HNHR={chrome,route,home,dialog};
})();
