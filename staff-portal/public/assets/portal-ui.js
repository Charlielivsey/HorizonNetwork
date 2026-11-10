/* Staff Portal workspace. Shared service layouts deliberately keep their own UI. */
(function () {
    'use strict';
    if (document.documentElement.dataset.hnApp) return;
    document.documentElement.dataset.portalUi = '2';
    const portalPaths = new Set(['/home','/notifications','/directory','/team','/kudos','/chat','/questions','/wiki','/mentoring','/roles','/announcements','/calendar','/polls','/ideas','/pulse','/status','/reports','/about','/helpdesk','/on-call','/enquiries','/settings','/system']);
    const isPortalDestination = href => /^https?:/.test(href) || portalPaths.has(String(href).split(/[?#]/)[0]);
    let context;
    let returnFocus;
    const q = s => document.querySelector(s);
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const services = [
        { title: 'HN Group HR', desc: 'People, leave & development', href: 'https://hr.hngroup.org.uk/', icon: 'users', tone: 'pink' },
        { title: 'HN Group Finance', desc: 'Your pay & expenses', href: 'https://finance.hngroup.org.uk/', icon: 'pound', tone: 'teal' },
        { title: 'HN Group Docs', desc: 'Documents & policies', href: 'https://docs.hngroup.org.uk/', icon: 'file', tone: 'purple' },
        { title: 'HN Account', desc: 'Your profile & sign-in', href: 'https://accounts.hngroup.org.uk/', icon: 'user', tone: 'gold' }
    ];
    function mobile(open) {
        const side = q('#portal-sidebar');
        if (!side) return;
        const narrow = matchMedia('(max-width: 1100px)').matches;
        side.inert = narrow && !open;
        q('#portal-nav-shade').hidden = !narrow || !open;
        if (open && narrow) {
            returnFocus = document.activeElement;
            side.querySelector('a,button').focus();
        } else if (returnFocus && narrow) {
            returnFocus.focus(); returnFocus = null;
        }
    }
    function route(path) {
        document.querySelectorAll('.portal-nav-link').forEach(el => {
            const active = el.getAttribute('href') === path;
            el.classList.toggle('is-current', active);
            if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
        });
        const item = context && context.sections.flatMap(s => s.items).find(i => i.href === path);
        const title = path === '/home' ? 'Overview' : item ? item.title : ({'/settings':'Settings','/system':'System administration','/notifications':'Notifications'})[path] || 'Staff Portal';
        if (q('#portal-page-name')) q('#portal-page-name').textContent = title;
        document.title = title + ' · HN Group Staff Portal';
    }
    function chrome(ctx) {
        ctx.sections = ctx.sections.map(section => ({label: section.label, items: section.items.filter(item => isPortalDestination(item.href))}));
        context = ctx;
        let side = q('#portal-sidebar');
        const {icon, me} = ctx;
        const link = it => '<a class="portal-nav-link" href="' + esc(it.href) + '" data-link>' + icon(it.icon) + '<span>' + esc(it.title) + '</span>' + (it.badge && me[it.badge] ? '<span class="portal-nav-count">' + Number(me[it.badge]) + '</span>' : '') + '</a>';
        if (!side) {
            side = document.createElement('aside');
            side.id = 'portal-sidebar'; side.className = 'portal-sidebar'; side.setAttribute('aria-label', 'Staff Portal navigation');
            document.body.prepend(side);
            const shade = document.createElement('button'); shade.id = 'portal-nav-shade'; shade.className = 'portal-nav-shade'; shade.hidden = true; shade.setAttribute('aria-label','Close navigation'); document.body.append(shade);
            const skip = document.createElement('a'); skip.href = '#view'; skip.className = 'portal-skip'; skip.textContent = 'Skip to content'; document.body.prepend(skip);
            q('.topbar').insertAdjacentHTML('afterbegin', '<div class="portal-context"><span>Staff Portal</span><span aria-hidden="true">/</span><strong id="portal-page-name">Overview</strong></div>');
            shade.addEventListener('click', () => { document.body.classList.remove('nav-open'); q('#nav-toggle').setAttribute('aria-expanded','false'); mobile(false); });
            matchMedia('(max-width: 1100px)').addEventListener('change', () => mobile(document.body.classList.contains('nav-open')));
        }
        side.innerHTML = '<button class="portal-sidebar-close icon-btn" type="button" aria-label="Close navigation">' + icon('x') + '</button><a class="portal-brand" href="/home" data-link><img class="logo-light-theme" src="/assets/brand/hn-group-wordmark.svg" alt="HN Group"><img class="logo-dark-theme" src="/assets/brand/hn-group-wordmark-white.svg" alt="HN Group"><span>Staff Portal <span class="portal-brand-dot"></span></span></a>' +
            '<nav aria-label="Workspace"><div class="portal-nav-group"><span class="portal-nav-label">Your workspace</span>' + link({title:'Overview',href:'/home',icon:'grid'}) + link({title:'Notifications',href:'/notifications',icon:'bell',badge:'notificationsUnread'}) + '</div>' +
            ctx.sections.map(section => '<div class="portal-nav-group"><span class="portal-nav-label">' + esc(section.label === 'People' ? 'Connect' : section.label) + '</span>' + section.items.map(link).join('') + '</div>').join('') +
            '<div class="portal-nav-group"><span class="portal-nav-label">HN Group services</span>' + services.map(it => '<a class="portal-nav-link portal-service-link" href="' + it.href + '">' + icon(it.icon) + '<span>' + it.title + '</span><span class="portal-external" aria-hidden="true">↗</span></a>').join('') + '</div></nav>' +
            '<div class="portal-nav-bottom">' + link({title:'Settings',href:'/settings',icon:'settings'}) + (ctx.canAdmin ? link({title:'System administration',href:'/system',icon:'shield'}) : '') + '<a class="portal-sites-link" href="https://sites.hngroup.org.uk/">Explore all HN sites <span aria-hidden="true">↗</span></a></div>';
        side.querySelector('.portal-sidebar-close').addEventListener('click', () => {document.body.classList.remove('nav-open');q('#nav-toggle').setAttribute('aria-expanded','false');q('#nav-toggle').innerHTML=icon('menu');mobile(false);});
        q('#nav-toggle').setAttribute('aria-controls','portal-sidebar');
        const search = q('#search-btn'); search.setAttribute('aria-label','Search the workspace (Ctrl or Command K)');
        if (!q('#user-menu a[href="https://accounts.hngroup.org.uk/"]')) q('#user-menu .menu-sep').insertAdjacentHTML('beforebegin','<a class="menu-item compact" role="menuitem" href="https://accounts.hngroup.org.uk/">' + icon('user') + '<span>HN Account</span></a>');
        mobile(document.body.classList.contains('nav-open'));
        route(location.pathname);
    }
    const panelHead = (title, href, label) => '<div class="portal-section-head"><h2>' + title + '</h2>' + (href ? '<a href="' + href + '" data-link>' + (label || 'View all') + '<span aria-hidden="true"> ↗</span></a>' : '') + '</div>';
    async function home(root, current, ctx) {
        const {me, icon, api, avatar} = ctx;
        const timezone = me.timezone || 'Europe/London';
        const hour = Number(new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'numeric',hourCycle:'h23'}).format(new Date()));
        const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        const actions = [
            {count:me.unreadAnnouncements,href:'/announcements',icon:'bell',title:'New announcements',desc:'The latest from across the group'},
            {count:me.chatUnread,href:'/chat',icon:'message',title:'Unread messages',desc:'Continue the conversation'},
            {count:me.openPolls,href:'/polls',icon:'chart',title:'Open polls',desc:'Your opinion makes a difference'},
            {count:me.helpdeskBadge,href:'/helpdesk',icon:'lifebuoy',title:'Support updates',desc:'Your tickets and team requests'}
        ];
        root.innerHTML = '<section class="portal-welcome"><div><p class="portal-eyebrow">Your people. Your workplace.</p><h1>' + greeting + ', ' + esc(me.displayName || me.firstName) + '.</h1><p class="portal-welcome-sub">Stay connected with your colleagues and what’s happening across HN Group.</p><div class="portal-welcome-actions"><a class="btn btn-primary" href="/directory" data-link>' + icon('users') + 'Find a colleague</a><a class="btn btn-ghost" href="/helpdesk" data-link>' + icon('lifebuoy') + 'Get support</a></div></div><div class="portal-today"><span class="portal-eyebrow">' + esc(me.location || timezone.split('/').pop().replaceAll('_',' ')) + '</span><strong>' + ctx.clock(timezone,'time') + '</strong><span>' + ctx.clock(timezone,'date') + '</span><span class="portal-today-zone">' + ctx.clock(timezone,'zone') + '</span></div></section>' +
            '<section class="portal-metrics" aria-label="Workspace updates">' + actions.map(a => '<a class="portal-metric" href="' + a.href + '" data-link><span class="portal-metric-icon">' + icon(a.icon) + '</span><strong>' + Number(a.count || 0) + '</strong><span>' + a.title + '</span><small>' + a.desc + '</small>' + icon('chevronRight') + '</a>').join('') + '</section>' +
            (me.pendingAcks ? '<div class="portal-attention">' + icon('alert') + '<span><strong>You have items to acknowledge.</strong> Check announcements and policies for anything awaiting your response.</span><a class="btn btn-small btn-ghost" href="https://docs.hngroup.org.uk/policies">Read policies</a></div>' : '') +
            '<div class="portal-dashboard"><div class="portal-dashboard-main"><section class="panel portal-news">' + panelHead('From across the group','/announcements','All announcements') + '<div id="home-news" class="announcements wide"><div class="loading" role="status">Loading announcements…</div></div></section>' +
            '<section class="portal-services">' + panelHead('Your HN services','https://sites.hngroup.org.uk/','All sites') + '<div class="portal-service-grid">' + services.map(s => '<a class="portal-service-card tone-' + s.tone + '" href="' + s.href + '"><span class="portal-service-symbol">' + icon(s.icon) + '</span><span><strong>' + s.title + '</strong><small>' + s.desc + '</small></span><span aria-hidden="true">↗</span></a>').join('') + '</div></section>' +
            '<section class="panel portal-connect">' + panelHead('Make yourself part of it') + '<div class="portal-connect-grid">' + [
                ['/kudos','heart','Give someone kudos','A little recognition goes a long way.'],['/ideas','flag','Share an idea','Help shape how we work.'],['/questions','help','Ask the group','Find answers together.']
            ].map(a => '<a href="' + a[0] + '" data-link>' + icon(a[1]) + '<strong>' + a[2] + '</strong><span>' + a[3] + '</span>' + icon('chevronRight') + '</a>').join('') + '</div></section><section class="panel" id="home-colleagues" hidden></section></div>' +
            '<aside class="home-side portal-dashboard-side" id="home-side" aria-label="Your day"><section class="panel portal-profile" data-widget="me"><div class="portal-profile-head">' + avatar(me,'lg') + '<div><strong>' + esc(me.displayName) + '</strong><span>' + esc(me.jobTitle || 'HN Group') + '</span></div></div>' +
            '<button class="status-set" type="button" data-action="status">' + (me.status ? ctx.statusPill(me.status) : '<span>Set your availability</span>') + icon('edit') + '</button>' + ctx.rolesHtml(me) + '<a class="portal-profile-account" href="https://accounts.hngroup.org.uk/">Manage your HN Account ' + icon('chevronRight') + '</a></section>' +
            '<section class="panel" id="home-coming" data-widget="coming">' + panelHead('Coming up','/calendar','Calendar') + '<div class="loading">Loading your calendar…</div></section><section class="panel" id="home-around" data-widget="around" hidden></section><section class="panel" id="home-celebrate" data-widget="celebrate" hidden></section>' +
            '<section class="panel portal-help" data-widget="help">' + icon('lifebuoy') + '<h2>Here to help</h2><p>Something not working? The IT team can help with access, devices and technical problems.</p><a class="btn btn-ghost btn-block-sm" href="/helpdesk" data-link>Open the helpdesk ' + icon('chevronRight') + '</a><a class="small" href="/on-call" data-link>Find who’s on call</a></section><button class="btn btn-ghost btn-small home-customise" type="button" id="home-customise">' + icon('settings') + 'Customise your sidebar</button></aside></div>';
        ctx.applyHomeLayout(q('#home-side'));
        q('#home-customise').addEventListener('click',ctx.openHomeCustomiser);
        if (q('#home-coming')) ctx.loadComingUp(q('#home-coming'));
        ctx.loadWhosAround(q('#home-around'));
        ctx.loadCelebrations(q('#home-celebrate'));
        ctx.loadHomeColleagues(q('#home-colleagues'));
        async function news() {
            const box = root.querySelector('#home-news');
            try {
                const d = await api('/api/announcements');
                if (!current() || !box.isConnected) return;
                const items = d.announcements.filter(a => a.state === 'live').slice(0,3);
                if (items.length) ctx.mountAnnouncements(box,items,{clamp:true});
                else box.innerHTML = '<div class="portal-empty"><span class="portal-empty-icon">' + icon('bell') + '</span><h3>You’re up to date</h3><p>New group announcements will appear here. Drop into chat to see what your colleagues are talking about.</p><a class="btn btn-ghost btn-small" href="/chat" data-link>Go to chat ' + icon('chevronRight') + '</a></div>';
            } catch (e) {
                if (!current() || !box.isConnected) return;
                box.innerHTML = '<div class="portal-empty"><h3>Announcements couldn’t load</h3><p>' + esc(e.message) + '</p><button class="btn btn-ghost" type="button" id="portal-news-retry">Try again</button></div>';
                box.querySelector('button').addEventListener('click',news);
            }
        }
        news();
    }
    let dialogSequence = 0;
    function dialog(modal) {
        const previous = document.activeElement;
        const title = modal.el.querySelector('h1,h2,h3');
        if (title) { if (!title.id) title.id = 'portal-dialog-' + (++dialogSequence); modal.el.setAttribute('aria-labelledby',title.id); }
        const onClose = modal.onClose;
        modal.onClose = function () { if (previous && previous.isConnected) previous.focus(); if (onClose) onClose(); };
        modal.el.addEventListener('keydown', function (e) {
            if (e.key !== 'Tab') return;
            const fields = Array.from(modal.el.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')).filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
            const first = fields[0], last = fields[fields.length-1];
            if (e.shiftKey && document.activeElement === first) {e.preventDefault();last.focus();}
            else if (!e.shiftKey && document.activeElement === last) {e.preventDefault();first.focus();}
        });
    }
    function loading() { return '<div class="portal-loading" role="status"><div class="portal-skeleton portal-skeleton-title"></div><div class="portal-skeleton"></div><div class="portal-loading-grid"><div class="portal-skeleton"></div><div class="portal-skeleton"></div><div class="portal-skeleton"></div></div><span>Loading your workspace…</span></div>'; }
    function error(message) { return '<section class="portal-empty portal-page-error" role="alert"><h1>This page couldn’t load</h1><p>' + esc(message) + '</p><button class="btn btn-primary" data-portal-retry type="button">Try again</button><a class="btn btn-ghost" href="/home" data-link>Back to overview</a></section>'; }
    document.addEventListener('keydown',e => {
        if (e.key !== 'Tab' || !document.body.classList.contains('nav-open') || !matchMedia('(max-width:1100px)').matches) return;
        const controls = Array.from(q('#portal-sidebar').querySelectorAll('a,button')).filter(el => el.getClientRects().length);
        const first=controls[0],last=controls[controls.length-1];
        if (e.shiftKey && document.activeElement===first) {e.preventDefault();last.focus();}
        else if (!e.shiftKey && document.activeElement===last) {e.preventDefault();first.focus();}
    });
    window.HNPortal = {chrome,route,mobile,home,loading,error,dialog,isPortalDestination,widgetKeys:['celebrate','coming','around','me','help']};
})();
