/* HN Group Finance workspace. Data and actions stay in the existing private staff service. */
(function () {
    'use strict';
    if (document.documentElement.dataset.hnApp !== 'finance') return;
    document.documentElement.dataset.financeUi = '1';
    const q = (s, r = document) => r.querySelector(s);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const groups = [
        {id:'personal',title:'Your money',icon:'wallet',description:'Your payslips and expense claims, in one place.',paths:['/payslips','/expenses']},
        {id:'company',title:'Company finance',icon:'building',description:'Payroll, company balances, customer invoices and supplier bills.',paths:['/payroll','/funds','/invoices','/bills']}
    ];
    const services = [
        {title:'Staff Portal',href:'https://staff.hngroup.org.uk/',icon:'building',desc:'Your colleagues and workplace'},
        {title:'HN Group HR',href:'https://hr.hngroup.org.uk/',icon:'users',desc:'Your employment and leave'},
        {title:'HN Group Docs',href:'https://docs.hngroup.org.uk/',icon:'file',desc:'Policies and documents'},
        {title:'HN Group IT',href:'https://it.hngroup.org.uk/',icon:'shield',desc:'Account access and technology'}
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
        const availability=me.system?'':'<button type="button" class="finance-account-availability" data-action="status"><span><strong><i class="finance-status-dot st-'+esc(status.type||'none')+'"></i>'+esc(label)+'</strong>'+(status.message?'<small>'+esc(status.message)+'</small>':'')+'</span>'+icon('edit')+'</button>';
        q('#finance-account-menu').innerHTML='<div class="finance-account-heading"><strong>Your account</strong><span>'+esc(me.username||me.email||'')+'</span></div>'+availability+'<a href="https://accounts.hngroup.org.uk/"'+(!me.impersonatedBy?' data-hn-account="/#overview"':'')+'>'+icon('user')+'<span>HN Account</span><span class="finance-account-external">↗</span></a><a href="https://staff.hngroup.org.uk/settings">'+icon('settings')+'<span>Settings</span></a>'+((me.permissions||[]).includes('system.admin')&&!me.impersonatedBy?'<a href="https://staff.hngroup.org.uk/system">'+icon('shield')+'<span>System Admin</span></a>':'')+'<button type="button" data-action="logout">'+icon('logout')+'<span>Sign out</span></button><a class="finance-account-sites" href="https://sites.hngroup.org.uk/"><span>Explore all HN sites</span><span class="finance-account-external">↗</span></a>';
    }
    function positionAccount() {
        renderAccountMenu();
        const menu=q('#finance-account-menu'),box=q('#finance-account-button').getBoundingClientRect();
        menu.style.left=Math.max(12,Math.min(box.left,innerWidth-Math.min(320,innerWidth-24)-12))+'px';
        menu.style.bottom=Math.max(12,innerHeight-box.top+8)+'px';
        // This account popover is a dialog; retain its existing first-control focus.
        const first=q('a,button',menu);if(first)first.focus({preventScroll:true});
    }
    function drawer(open, restore = true) {
        const side = q('#finance-sidebar');
        if (!side) return;
        document.body.classList.toggle('nav-open', !!open && narrow());
        side.inert = (narrow() && !open) || (!narrow() && document.documentElement.hasAttribute('data-workspace-collapsed'));
        q('#finance-nav-shade').hidden = !narrow() || !open;
        q('#nav-toggle').setAttribute('aria-expanded', String(!!open && narrow()));
        if (open && narrow()) { drawerFocus = document.activeElement; q('a,button', side).focus(); }
        else if (restore && drawerFocus && drawerFocus.isConnected) { drawerFocus.focus(); drawerFocus = null; }
    }
    function route(path) {
        if (!context) return;
        const item = context.items.find(it => it.href === path);
        const section=sectionsFor(context).find(it=>it.id===new URLSearchParams(location.search).get('section'));
        const title = path === '/home' ? (section?section.title:'Overview') : path === '/notifications' ? 'Notifications' : item ? item.title : 'Finance';
        q('#finance-page-name').textContent = title;
        document.title = title + ' · HN Group Finance';
        const routeKey=path+location.search;
        if (previousPath && previousPath !== routeKey) { account(false); drawer(false, false); }
        previousPath=routeKey;
        if(window.HNWorkspaceNavigation) window.HNWorkspaceNavigation.route(path);
    }
    function chrome(ctx) {
        context = ctx;
        const {me, icon, avatar} = ctx;
        let side = q('#finance-sidebar');
        if (!side) {
            side = document.createElement('aside'); side.id = 'finance-sidebar'; side.className = 'portal-sidebar'; side.setAttribute('aria-label','Finance navigation');
            document.body.prepend(side);
            document.body.insertAdjacentHTML('beforeend','<button id="finance-nav-shade" class="portal-nav-shade" type="button" aria-label="Close navigation" hidden></button>');
            document.body.insertAdjacentHTML('afterbegin','<a class="portal-skip" href="#view">Skip to content</a>');
            q('.topbar').insertAdjacentHTML('afterbegin','<div class="portal-context"><span>HN Group Finance</span><span aria-hidden="true">/</span><strong id="finance-page-name">Overview</strong></div>');
            q('#finance-nav-shade').addEventListener('click', () => drawer(false));
        }
        if(!q('#finance-account-button')) {
            side.innerHTML='<button type="button" class="portal-sidebar-close icon-btn" aria-label="Close navigation">'+icon('x')+'</button><a class="portal-brand" href="/home" data-link><img class="logo-light-theme" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group"><img class="logo-dark-theme" src="/assets/brand/hn-group-wordmark-white.svg" alt="HN Group"><span>Finance workspace <span class="portal-brand-dot"></span></span></a><nav aria-label="Finance workspace"></nav><div class="finance-account"><button type="button" id="finance-account-button" aria-haspopup="dialog" aria-controls="finance-account-menu" aria-expanded="false"></button><div id="finance-account-menu" popover="auto" role="dialog" aria-label="Your account"></div></div>';
            q('.portal-sidebar-close',side).addEventListener('click',()=>drawer(false));
            if(window.HNWorkspaceNavigation) accountController=window.HNWorkspaceNavigation.bindPopover({button:q('#finance-account-button'),menu:q('#finance-account-menu'),onOpen:positionAccount});
        }
        q('#finance-account-button').innerHTML=avatar(me,'sm')+'<span><strong>'+esc(me.displayName)+'</strong><small>Your account</small></span>'+icon('chevron');
        if(!q('#finance-account-menu').matches(':popover-open'))renderAccountMenu();
        q('#nav-toggle').setAttribute('aria-controls','finance-sidebar');
        q('#search-btn').hidden=false;
        q('#search-btn').setAttribute('aria-label','Search finance tools (Ctrl or Command K)');
        drawer(document.body.classList.contains('nav-open'),false);
        if(window.HNWorkspaceNavigation)window.HNWorkspaceNavigation.configure({app:'finance',sidebar:side,actions:[],sections:sectionsFor(ctx),icon:icon,closeAccount:()=>account(false)});
        route(location.pathname);
    }
    const money = value => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(value)||0);
    const tile = item => '<a class="finance-tool" href="'+esc(item.href)+'"'+(item.href.startsWith('/')?' data-link':'')+'><span class="finance-tool-icon">'+context.icon(item.icon)+'</span><span><strong>'+esc(item.title)+'</strong><small>'+esc(item.desc)+'</small></span>'+context.icon('chevronRight')+'</a>';
    async function home(root,ctx){
        if(window.HNWorkspaceNavigation && window.HNWorkspaceNavigation.renderSection(root))return;
        const {me,icon,api,current}=ctx, manager=ctx.items.some(item=>item.href==='/funds');
        root.innerHTML='<section class="finance-welcome"><div><p class="portal-eyebrow">Your finance workspace</p><h1>HN Group Finance</h1><p>Your pay, your claims and a clear view of company finances.</p></div><div class="finance-welcome-actions"><a class="btn btn-primary" href="/expenses" data-link>'+icon('plus')+'Manage expenses</a><a class="btn btn-ghost" href="/payslips" data-link>'+icon('card')+'Your payslips</a></div></section><div id="finance-overview-summary" class="finance-summary" aria-label="Finance summary" aria-busy="true"><p class="muted">Loading your finance summary…</p></div><div class="finance-dashboard"><section class="panel finance-tools"><div class="portal-section-head"><h2>Your money</h2><span class="finance-live">Live updates</span></div><div class="finance-tool-grid">'+ctx.items.filter(i=>!i.requires).map(tile).join('')+'</div></section>'+ (manager?'<section class="panel finance-tools"><div class="portal-section-head"><h2>Company finance</h2><a href="/home?section=company" data-link>View tools '+icon('chevronRight')+'</a></div><div class="finance-tool-grid">'+ctx.items.filter(i=>i.requires).map(tile).join('')+'</div></section>':'')+'<section class="panel finance-recent"><div class="portal-section-head"><h2>Latest payslips</h2><a href="/payslips" data-link>View all '+icon('chevronRight')+'</a></div><div id="finance-recent-slips"><p class="muted">Loading payslips…</p></div></section><aside class="panel finance-help"><span class="finance-tool-icon">'+icon('shield')+'</span><h2>Everything stays connected.</h2><p>Your finance records use your HN account and your current permissions. Need help with your pay or a claim?</p><a href="https://staff.hngroup.org.uk/helpdesk?team=hr">Raise an issue '+icon('chevronRight')+'</a><a href="https://accounts.hngroup.org.uk/">Manage your HN Account '+icon('chevronRight')+'</a></aside></div>';
        const results=await Promise.allSettled([api('/api/payslips'),api('/api/expenses'),...(manager?[api('/api/funds'),api('/api/invoices'),api('/api/bills')]:[])]);
        if(!current()||!root.isConnected)return;
        const value=i=>results[i]?.status==='fulfilled'?results[i].value:null,slips=value(0),claims=value(1),funds=value(2),invoices=value(3),bills=value(4);
        const metric=(label,amount,href,symbol,caption)=>'<a class="finance-metric" href="'+href+'" data-link><span class="finance-metric-icon">'+icon(symbol)+'</span><span class="finance-metric-label">'+label+'</span><strong>'+amount+'</strong><small>'+caption+'</small>'+icon('chevronRight')+'</a>';
        const waiting=claims?claims.mine.filter(c=>c.status==='submitted').reduce((n,c)=>n+c.amount,0):null;
        const cards=[metric('Latest take-home pay',slips?(slips.payslips[0]?money(slips.payslips[0].net):'—'):'Unavailable','/payslips','card',slips?.payslips[0]?.periodLabel||'Your issued payslips'),metric('Your pending claims',waiting===null?'Unavailable':money(waiting),'/expenses','pound','Awaiting approval')];
        if(manager)cards.push(metric('Company balance',funds?money(funds.balances.main):'Unavailable','/funds','wallet','Main account'),metric('Supplier bills due',bills?money(bills.summary.unpaid):'Unavailable','/bills','file','Unpaid supplier bills'));
        const summary=q('#finance-overview-summary',root);summary.innerHTML=cards.join('');summary.setAttribute('aria-busy','false');
        const recent=q('#finance-recent-slips',root);recent.innerHTML=slips?(slips.payslips.length?slips.payslips.slice(0,3).map(s=>'<a class="finance-recent-row" href="/payslips" data-link><span class="finance-tool-icon">'+icon('card')+'</span><span><strong>'+esc(s.periodLabel)+'</strong><small>Paid '+esc(s.payDate)+'</small></span><b>'+money(s.net)+'</b>'+icon('chevronRight')+'</a>').join(''):'<div class="finance-inline-empty">'+icon('card')+'<div><strong>No payslips yet</strong><p>Your issued payslips will appear here.</p></div></div>'):'<p class="finance-source-error">Payslips could not be loaded. Open Payslips to try again.</p>';
        if(manager){const issues=[];if(funds?.warning)issues.push('<a href="/funds" data-link>'+icon('alert')+'<span>'+esc(funds.warning.message)+'</span>'+icon('chevronRight')+'</a>');if(invoices?.summary?.overdue)issues.push('<a href="/invoices" data-link>'+icon('clock')+'<span>'+money(invoices.summary.overdue)+' in overdue customer invoices</span>'+icon('chevronRight')+'</a>');if(claims?.toApprove?.length)issues.push('<a href="/expenses" data-link>'+icon('tick')+'<span>'+claims.toApprove.length+' expense claims awaiting approval</span>'+icon('chevronRight')+'</a>');if(issues.length){const box=document.createElement('section');box.className='finance-attention';box.setAttribute('aria-label','Needs attention');box.innerHTML=issues.join('');summary.after(box);}}
    }
    const searches=new Map();let listObserver;
    function decorate(root,path){
        if(listObserver)listObserver.disconnect();
        root.classList.add('finance-view');
        // The original actions and handlers remain on the same elements.
        const headings={'/funds':'Company balances','/payroll':'Payroll workspace','/invoices':'Customer invoices','/bills':'Supplier bills'};
        if(headings[path]){const head=q('.page-head h1',root);if(head)head.textContent=headings[path];}
        const descriptions={'/payslips':'Your issued payslips and year-end statements. Only you and authorised finance staff can access them.','/funds':'Manage company balances, payroll funding, budgets and transaction history.','/payroll':'Prepare, review and issue payslips, and manage pay details.'};
        if(descriptions[path]){const p=q('.page-head p',root);if(p)p.textContent=descriptions[path];}
        if(!['/payslips','/expenses','/invoices','/bills'].includes(path))return;
        const toolbar=document.createElement('div');toolbar.className='finance-list-toolbar';toolbar.innerHTML='<label class="finance-list-search">'+context.icon('search')+'<input type="search" aria-label="Search finance records" placeholder="Search '+({'/payslips':'payslips','/expenses':'claims','/invoices':'invoices','/bills':'bills'})[path]+'…"></label><span class="finance-list-count" aria-live="polite"></span>';
        const tabs=q('#ex-tabs,#iv-tabs,#bl-tabs',root),head=q('.payslip-hero',root)||q('.page-head',root);(tabs||head).after(toolbar);
        const input=q('input',toolbar);input.value=searches.get(path)||'';
        const filter=()=>{const term=input.value.trim().toLowerCase(),rows=Array.from(root.querySelectorAll('.slip-row,.claim-row,#iv-body tbody tr,#bl-body tbody tr'));let count=0;for(const row of rows){row.hidden=!!term&&!row.textContent.toLowerCase().includes(term);if(!row.hidden)count++;}q('.finance-list-count',toolbar).textContent=count+' '+(count===1?'record':'records')+(term?' found':'');};
        input.addEventListener('input',()=>{searches.set(path,input.value);filter();});filter();
        const list=q('#ex-body,#iv-body,#bl-body,.slip-list',root);if(list){listObserver=new MutationObserver(filter);listObserver.observe(list,{childList:true,subtree:true});}
    }
    function dialog(modal) {
        const previous = document.activeElement, title = q('h1,h2,h3',modal.el);
        if (title) {if(!title.id)title.id='finance-dialog-'+(++dialogSequence);modal.el.setAttribute('aria-labelledby',title.id);}
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
        const link=e.target.closest('#finance-sidebar a[data-link]');
        if(link){drawer(false,false);requestAnimationFrame(()=>q('#view').focus({preventScroll:true}));}
    },true);
    document.addEventListener('keydown',e=>{
        const menu=q('#finance-account-menu:popover-open');
        if(menu){trap(e,menu);return;}
        if(narrow()&&document.body.classList.contains('nav-open')){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();drawer(false);}else trap(e,q('#finance-sidebar'));}
    },true);
    addEventListener('resize',()=>{if(context){account(false);drawer(false,false);}});
    window.HNFinance={chrome,route,home,dialog,decorate};
})();
