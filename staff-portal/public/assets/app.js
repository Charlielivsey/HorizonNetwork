(function () {
    "use strict";

    // ================= Helpers =================

    const ICONS = {
        home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
        users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
        bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
        calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
        clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        card: '<rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/>',
        lifebuoy: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.93 4.93 4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24"/>',
        user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
        chevron: '<path d="m6 9 6 6 6-6"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
        more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
        mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="m22 6-10 7L2 6"/>',
        pin: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
        phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
        x: '<path d="M18 6 6 18M6 6l12 12"/>',
        copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
        menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
        monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
        camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
        edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
        trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
        key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
        ban: '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/>',
        check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
        upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
        download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
        pinned: '<path d="M12 17v5M9 10.76V4h6v6.76l3 4.24H6z"/><path d="M7 2h10"/>',
        eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
        alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>',
        palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.75 1.5-1.6 0-.42-.16-.8-.42-1.08-.26-.28-.41-.65-.41-1.07 0-.88.71-1.6 1.6-1.6H16c3.31 0 6-2.69 6-6 0-4.96-4.48-9-10-9z"/>',
        tick: '<path d="M20 6 9 17l-5-5"/>',
        grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
        list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
        tree: '<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-2.5a1.5 1.5 0 0 1 1.5-1.5h11a1.5 1.5 0 0 1 1.5 1.5V17"/>',
        login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5M15 12H3"/>',
        power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><path d="M12 2v10"/>',
        activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
        building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    };

    function icon(name, cls) {
        return '<svg class="icon ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + "</svg>";
    }

    function esc(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    const $ = function (sel, root) { return (root || document).querySelector(sel); };
    const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

    const state = { me: null, meta: null };

    // Themes on offer. Preview colours: page background, card, accent, and a text line.
    const THEMES = [
        { key: "system", name: "Match my device", preview: ["#f5f6f9", "#ffffff", "#5514b4", "#1a1a1a"], dark: ["#0f1117", "#171a22", "#9a6cf0", "#eceef4"] },
        { key: "light", name: "HN Light", preview: ["#f5f6f9", "#ffffff", "#5514b4", "#1a1a1a"] },
        { key: "dark", name: "HN Dark", preview: ["#0f1117", "#171a22", "#9a6cf0", "#eceef4"] },
        { key: "lavender", name: "Lavender", preview: ["#f5f1fc", "#ffffff", "#7c5cc4", "#241b35"] },
        { key: "lavender-dusk", name: "Lavender Dusk", preview: ["#17121f", "#201a2b", "#b79cf2", "#efe9fb"] },
        { key: "ocean", name: "Ocean", preview: ["#f0f6f8", "#ffffff", "#1f7a8c", "#12262c"] },
        { key: "forest", name: "Forest", preview: ["#f2f6f1", "#ffffff", "#2f7d4f", "#17261c"] },
        { key: "midnight", name: "Midnight", preview: ["#0a0f1c", "#111a2c", "#5ea8ff", "#e7eefb"] },
    ];

    function applyTheme(theme) {
        if (window.hnApplyTheme) window.hnApplyTheme(theme);
    }

    async function api(path, body) {
        const res = await fetch(path, body === undefined ? { headers: { Accept: "application/json" } } : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(function () { return {}; });
        if (res.status === 401 && path !== "/api/login") {
            window.location.href = "/login";
            throw new Error("Signed out");
        }
        if (res.status === 403 && data.code === "PASSWORD_CHANGE_REQUIRED") {
            state.me.passwordTemporary = true;
            render();
        }
        if (res.status === 403 && data.code === "CODE_SETUP_REQUIRED") {
            state.me.codeSetupRequired = true;
            render();
        }
        if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
        return data;
    }

    function initials(name) {
        const parts = String(name || "?").trim().split(/\s+/);
        return ((parts[0] || "?").charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "")).toUpperCase();
    }

    function avatar(person, size) {
        const cls = "avatar avatar-" + (size || "md");
        if (person.avatarUrl) return '<img class="' + cls + '" src="' + esc(person.avatarUrl) + '" alt="">';
        let hash = 0;
        for (const ch of String(person.id || person.displayName)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
        return '<span class="' + cls + " avatar-c" + (hash % 6) + '" aria-hidden="true">' + esc(initials(person.displayName)) + "</span>";
    }

    function primaryEmail(person) {
        const e = (person.emails || []).find(function (x) { return x.primary; }) || (person.emails || [])[0];
        return e ? e.address : "";
    }

    let toastTimer;
    function toast(message) {
        const el = $("#toast");
        el.textContent = message;
        el.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.hidden = true; }, 3000);
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            const ta = document.createElement("textarea");
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
        }
        toast("Copied to clipboard.");
    }

    // ================= Time =================

    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    function fmt(tz, opts) {
        try {
            return new Intl.DateTimeFormat("en-GB", Object.assign({ timeZone: tz }, opts)).format(new Date());
        } catch (e) {
            return "";
        }
    }

    const CLOCK_FORMATS = {
        time: { hour: "2-digit", minute: "2-digit", second: "2-digit" },
        short: { hour: "2-digit", minute: "2-digit" },
        date: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
        zone: { timeZoneName: "short" },
    };

    function clockText(tz, kind) {
        if (kind === "zone") {
            const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date());
            const p = parts.find(function (x) { return x.type === "timeZoneName"; });
            return p ? p.value : "";
        }
        return fmt(tz, CLOCK_FORMATS[kind]);
    }

    function clock(tz, kind) {
        return '<span data-clock="' + kind + '" data-tz="' + esc(tz) + '">' + esc(clockText(tz, kind)) + "</span>";
    }

    function tzOffsetMinutes(tz) {
        const now = new Date();
        const parts = {};
        new Intl.DateTimeFormat("en-US", {
            timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
        }).formatToParts(now).forEach(function (p) { parts[p.type] = p.value; });
        const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
        return Math.round((asUtc - now.getTime()) / 60000);
    }

    function tzDifference(tz) {
        const diff = tzOffsetMinutes(tz) - tzOffsetMinutes(deviceTz);
        if (diff === 0) return "Same time as your device";
        const abs = Math.abs(diff);
        const h = Math.floor(abs / 60);
        const m = abs % 60;
        const amount = (h ? h + (h === 1 ? " hour" : " hours") : "") + (h && m ? " " : "") + (m ? m + " min" : "");
        return amount + (diff > 0 ? " ahead of" : " behind") + " your device";
    }

    function tzCity(tz) {
        return String(tz || "").split("/").pop().replace(/_/g, " ");
    }

    function timezoneOptions(selected) {
        let zones = [];
        try { zones = Intl.supportedValuesOf("timeZone"); } catch (e) { zones = [state.meta.defaultTimezone]; }
        if (zones.indexOf("UTC") === -1) zones = zones.concat("UTC");
        if (selected && zones.indexOf(selected) === -1) zones = zones.concat(selected);
        const popular = ["Europe/London", "Europe/Dublin", "Europe/Paris", "America/New_York", "UTC"];
        const opt = function (z) {
            return '<option value="' + esc(z) + '"' + (z === selected ? " selected" : "") + ">" + esc(z.replace(/_/g, " ")) + "</option>";
        };
        return '<optgroup label="Common">' + popular.map(opt).join("") + "</optgroup>" +
            '<optgroup label="All time zones">' + zones.filter(function (z) { return popular.indexOf(z) === -1; }).map(opt).join("") + "</optgroup>";
    }

    setInterval(function () {
        $$("[data-clock]").forEach(function (el) { el.textContent = clockText(el.dataset.tz, el.dataset.clock); });
    }, 1000);

    // ================= Navigation & menus =================

    const NAV = [
        {
            label: "People", items: [
                { title: "Staff Directory", desc: "Find colleagues across the group", href: "/directory", icon: "users" },
                { title: "Employee Management", desc: "Add and manage staff records", href: "/employees", icon: "briefcase", requires: "manage" },
            ],
        },
        {
            label: "Workplace", items: [
                { title: "Announcements", desc: "Group-wide news and updates", href: "/announcements", icon: "bell", badge: "unreadAnnouncements" },
                { title: "Documents & Policies", desc: "Handbooks, policies, forms and templates", href: "/documents", icon: "file", badge: "pendingAcks" },
            ],
        },
        {
            label: "HR", items: [
                { title: "Leave & Absence", desc: "Book holidays and report absence", icon: "calendar", soon: true },
                { title: "Rotas & Timesheets", desc: "Shifts, hours and approvals", icon: "clock", soon: true },
                { title: "Payslips", desc: "View and download your payslips", icon: "card", soon: true },
            ],
        },
        {
            label: "Support", items: [
                { title: "IT Helpdesk", desc: "Raise and track support tickets", icon: "lifebuoy", soon: true },
            ],
        },
    ];

    function visibleItems(section) {
        return section.items.filter(function (it) { return it.requires !== "manage" || state.me.canManage; });
    }

    function menuItemHtml(it) {
        const count = it.badge ? state.me[it.badge] || 0 : 0;
        const inner = '<span class="mi-icon">' + icon(it.icon) + '</span><span class="mi-text"><span class="mi-title">' + esc(it.title) +
            (it.soon ? ' <span class="soon">Soon</span>' : "") + (count ? ' <span class="count-badge">' + count + "</span>" : "") + '</span><span class="mi-desc">' + esc(it.desc) + "</span></span>";
        return it.soon
            ? '<button type="button" class="menu-item" role="menuitem" data-soon="' + esc(it.title) + '">' + inner + "</button>"
            : '<a class="menu-item" role="menuitem" href="' + it.href + '" data-link>' + inner + "</a>";
    }

    function renderChrome() {
        const me = state.me;
        $("#mainnav").innerHTML =
            '<a href="/home" data-link class="nav-link" data-section="/home">' + icon("home") + "<span>Home</span></a>" +
            NAV.map(function (section) {
                const items = visibleItems(section);
                const paths = items.map(function (it) { return it.href; }).filter(Boolean).join(" ");
                return '<div class="nav-item">' +
                    '<button type="button" class="nav-link" data-menu aria-haspopup="true" aria-expanded="false" data-section="' + paths + '">' +
                    "<span>" + esc(section.label) + "</span>" +
                    (items.some(function (it) { return it.badge && state.me[it.badge]; }) ? '<span class="nav-dot" aria-label="New items"></span>' : "") +
                    icon("chevron", "chev") + "</button>" +
                    '<div class="menu" role="menu" hidden>' + items.map(menuItemHtml).join("") + "</div></div>";
            }).join("");

        $("#user-menu").innerHTML =
            '<button type="button" class="user-btn" data-menu aria-haspopup="true" aria-expanded="false">' +
            avatar(me, "sm") +
            '<span class="user-meta"><span class="user-name">' + esc(me.displayName) + '</span><span class="user-role">' + esc(me.jobTitle) + "</span></span>" +
            icon("chevron", "chev") + "</button>" +
            '<div class="menu menu-right menu-user" role="menu" hidden>' +
            '<div class="menu-header">' + avatar(me, "md") + '<div class="menu-header-text"><div class="mh-name">' + esc(me.displayName) +
            '</div><div class="mh-email">' + esc(me.username) + "</div></div></div>" +
            '<div class="menu-sep"></div>' +
            '<a class="menu-item compact" role="menuitem" href="/settings" data-link>' + icon("settings") + "<span>Settings</span></a>" +
            (me.isOwner && !me.impersonatedBy ? '<a class="menu-item compact" role="menuitem" href="/system" data-link>' + icon("shield") + "<span>System Admin</span></a>" : "") +
            '<div class="menu-sep"></div>' +
            '<button type="button" class="menu-item compact danger" role="menuitem" data-action="logout">' + icon("logout") + "<span>Sign out</span></button>" +
            "</div>";

        $("#nav-toggle").innerHTML = icon("menu");
        highlightNav();

        const banner = $("#imp-banner");
        banner.hidden = !me.impersonatedBy;
        if (me.impersonatedBy) {
            banner.innerHTML = '<div class="imp-inner">' + icon("login") + "<span>You're logged in as <strong>" + esc(me.displayName) + "</strong> (" + esc(me.username) +
                "). Everything you do is recorded as them.</span>" +
                '<button type="button" class="btn btn-small btn-light" data-action="stop-impersonating">Return to my account</button></div>';
        }
    }

    function highlightNav() {
        const path = window.location.pathname;
        $$("#mainnav [data-section]").forEach(function (el) {
            el.classList.toggle("active", el.dataset.section.split(" ").indexOf(path) !== -1);
        });
    }

    function closeMenus(except) {
        $$("[data-menu]").forEach(function (btn) {
            if (btn === except) return;
            btn.setAttribute("aria-expanded", "false");
            const menu = btn.nextElementSibling;
            if (menu) menu.hidden = true;
        });
    }

    function toggleMenu(btn) {
        const menu = btn.nextElementSibling;
        const open = menu.hidden;
        closeMenus(btn);
        menu.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
        if (open) {
            // Keep row menus inside the viewport.
            menu.classList.remove("flip-up");
            const rect = menu.getBoundingClientRect();
            if (menu.classList.contains("menu-row") && rect.bottom > window.innerHeight - 8) menu.classList.add("flip-up");
        }
    }

    function setMobileNav(open) {
        document.body.classList.toggle("nav-open", open);
        $("#nav-toggle").setAttribute("aria-expanded", String(open));
        $("#nav-toggle").innerHTML = icon(open ? "x" : "menu");
    }

    document.addEventListener("click", function (e) {
        const menuBtn = e.target.closest("[data-menu]");
        if (menuBtn) {
            e.preventDefault();
            toggleMenu(menuBtn);
            return;
        }

        const link = e.target.closest("a[data-link]");
        if (link && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
            e.preventDefault();
            closeMenus();
            setMobileNav(false);
            navigate(link.getAttribute("href"));
            return;
        }

        const soon = e.target.closest("[data-soon]");
        if (soon) {
            closeMenus();
            toast(soon.dataset.soon + " is coming soon.");
            return;
        }

        if (e.target.closest("[data-action='stop-impersonating']")) {
            api("/api/stop-impersonating", {}).then(function (r) { window.location.href = r.redirect || "/home"; })
                .catch(function (err) { toast(err.message); });
            return;
        }

        if (e.target.closest("[data-action='logout']")) {
            api("/api/logout", {}).catch(function () {}).then(function () { window.location.href = "/login"; });
            return;
        }

        if (e.target.closest("#nav-toggle")) {
            setMobileNav(!document.body.classList.contains("nav-open"));
            return;
        }

        if (!e.target.closest(".menu")) closeMenus();
    });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            if ($(".modal-backdrop")) return; // handled by the modal
            closeMenus();
            setMobileNav(false);
        }
    });

    // ================= Router =================

    const ROUTES = {
        "/home": viewHome,
        "/directory": viewDirectory,
        "/employees": viewEmployees,
        "/settings": viewSettings,
        "/system": viewSystem,
        "/announcements": viewAnnouncements,
        "/documents": viewDocuments,
    };

    function navigate(href, replace) {
        history[replace ? "replaceState" : "pushState"]({}, "", href);
        render();
    }

    window.addEventListener("popstate", render);

    // Each page's header gets its own icon.
    const PAGE_ICONS = {
        "/directory": "users",
        "/employees": "briefcase",
        "/announcements": "bell",
        "/documents": "file",
        "/settings": "settings",
        "/system": "shield",
    };

    function decoratePageHead(root, path) {
        const head = $(".page-head", root);
        if (!head || !PAGE_ICONS[path] || $(".page-icon", head)) return;
        head.insertAdjacentHTML("afterbegin", '<span class="page-icon">' + icon(PAGE_ICONS[path]) + "</span>");
    }

    let renderSeq = 0;
    async function render() {
        const seq = ++renderSeq;
        closeMenus();
        closeModal();
        // A fresh container each time, so listeners from the previous page don't pile up.
        const old = $("#view");
        const root = old.cloneNode(false);
        old.replaceWith(root);

        if (state.me.passwordTemporary) {
            document.body.classList.add("locked");
            return viewForcePassword(root);
        }
        if (state.me.codeSetupRequired) {
            document.body.classList.add("locked");
            return viewSetCode(root);
        }
        document.body.classList.remove("locked");

        const path = window.location.pathname;
        let view = ROUTES[path];
        if (!view) return navigate("/home", true);
        if (path === "/employees" && !state.me.canManage) view = viewNoAccess;
        if (path === "/system" && (!state.me.isOwner || state.me.impersonatedBy)) view = viewNoSystemAccess;

        highlightNav();
        root.innerHTML = '<div class="loading">Loading…</div>';
        root.classList.add("view-enter");
        try {
            await view(root, function () { return seq === renderSeq; });
        } catch (err) {
            if (seq === renderSeq) root.innerHTML = '<div class="empty">' + esc(err.message) + "</div>";
        }
        if (seq !== renderSeq) return;
        decoratePageHead(root, path);
        if (window.location.hash) {
            const target = document.getElementById(window.location.hash.slice(1));
            if (target) target.scrollIntoView({ block: "start" });
        } else {
            window.scrollTo(0, 0);
        }
    }

    // ================= Modals =================

    let activeModal = null;

    function openModal(html, opts) {
        closeModal();
        opts = opts || {};
        const backdrop = document.createElement("div");
        backdrop.className = "modal-backdrop";
        backdrop.innerHTML = '<div class="modal' + (opts.wide ? " modal-wide" : "") + (opts.cls ? " " + opts.cls : "") + '" role="dialog" aria-modal="true">' +
            '<button type="button" class="icon-btn modal-close" aria-label="Close" data-close>' + icon("x") + "</button>" + html + "</div>";
        $("#modal-root").appendChild(backdrop);
        document.body.classList.add("modal-open");

        const modal = { el: backdrop.firstChild, onClose: opts.onClose };
        backdrop.addEventListener("mousedown", function (e) { if (e.target === backdrop) closeModal(); });
        backdrop.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) closeModal(); });
        activeModal = modal;
        const focusable = modal.el.querySelector("input:not([type=hidden]):not([readonly]), select, textarea, .btn-primary");
        if (focusable) focusable.focus();
        return modal;
    }

    function closeModal() {
        if (!activeModal) return;
        const m = activeModal;
        activeModal = null;
        m.el.parentNode.remove();
        document.body.classList.remove("modal-open");
        if (m.onClose) m.onClose();
    }

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && activeModal) {
            if ($(".menu:not([hidden])", activeModal.el)) return closeMenus();
            closeModal();
        }
    });

    function confirmDialog(opts) {
        return new Promise(function (resolve) {
            let answered = false;
            const m = openModal(
                '<h2 class="modal-title">' + esc(opts.title) + '</h2><p class="muted">' + esc(opts.message) + "</p>" +
                '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
                '<button type="button" class="btn ' + (opts.danger ? "btn-danger" : "btn-primary") + '" data-ok>' + esc(opts.confirmLabel || "Confirm") + "</button></div>",
                { onClose: function () { if (!answered) resolve(false); } }
            );
            $("[data-ok]", m.el).addEventListener("click", function () {
                answered = true;
                closeModal();
                resolve(true);
            });
        });
    }

    function formError(el, message) {
        el.textContent = message || "";
        el.hidden = !message;
    }

    // ================= Home =================

    // The user's main role, shown quietly under the greeting.
    function mainRoleHtml(me) {
        const main = (me.roles || []).find(function (r) { return r.main; });
        if (!main || me.system) return '<p class="muted hero-sub">Everything you need across HN Group, in one place.</p>';
        return '<p class="muted hero-sub">' + esc(main.jobTitle) + " \u00b7 " + esc(main.company) + "</p>";
    }

    async function viewHome(root) {
        const me = state.me;
        const hour = Number(fmt(deviceTz, { hour: "2-digit", hourCycle: "h23" }));
        const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
        const firstName = me.firstName || me.displayName.split(" ")[0];
        const profileTz = me.timezone || state.meta.defaultTimezone;
        const placeName = me.location || tzCity(profileTz);


        root.innerHTML =
            (me.mustChangePassword
                ? '<div class="banner banner-warn"><div><strong>You\'re using the default password.</strong> Please change it now to keep the portal secure.</div>' +
                  '<a class="btn btn-small btn-dark" href="/settings#password" data-link>Change password</a></div>'
                : "") +
            '<section class="home-hero">' +
            '<div class="hero-glow g1"></div><div class="hero-glow g2"></div>' +
            '<div class="hero-main">' +
            '<p class="hero-date">' + clock(deviceTz, "date") + "</p>" +
            "<h1>" + esc(greeting) + ", " + esc(firstName) + "</h1>" +
            mainRoleHtml(me) +
            '<div class="hero-chips">' +
            (me.unreadAnnouncements ? '<a class="hero-chip" href="/announcements" data-link>' + icon("bell") + me.unreadAnnouncements + " new announcement" + (me.unreadAnnouncements === 1 ? "" : "s") + "</a>" : "") +
            (me.pendingAcks ? '<a class="hero-chip warn" href="/documents" data-link>' + icon("file") + me.pendingAcks + " document" + (me.pendingAcks === 1 ? "" : "s") + " to acknowledge</a>" : "") +
            (!me.unreadAnnouncements && !me.pendingAcks ? '<span class="hero-chip calm">' + icon("tick") + "You\u2019re all caught up</span>" : "") +
            "</div></div>" +
            '<div class="hero-clocks">' +
            '<div class="glass-clock"><div class="gc-label">' + icon("monitor") + "Your time \u00b7 " + esc(tzCity(deviceTz)) + "</div>" +
            '<div class="gc-time">' + clock(deviceTz, "time") + "</div>" +
            '<div class="gc-sub">' + clock(deviceTz, "zone") + "</div></div>" +
            '<div class="glass-clock"><div class="gc-label">' + icon("pin") + esc(placeName) + "</div>" +
            '<div class="gc-time">' + clock(profileTz, "time") + "</div>" +
            '<div class="gc-sub">' + clock(profileTz, "zone") + " \u00b7 " + esc(tzDifference(profileTz)) +
            (me.location ? "" : ' \u00b7 <a href="/settings" data-link>Set location</a>') + "</div></div>" +
            "</div></section>" +

            '<div class="home-layout">' +
            '<section class="home-announcements"><div class="panel-head tight"><h2 class="section-title">' + icon("bell") + "Announcements</h2>" +
            '<a class="small link-arrow" href="/announcements" data-link>View all</a></div>' +
            '<div id="home-news" class="announcements wide"><p class="muted small">Loading\u2026</p></div></section>' +

            '<aside class="home-side">' +
            '<section class="panel" id="home-todo" hidden></section>' +
            '<section class="panel me-panel"><div class="me-card">' + avatar(me, "lg") + '<div><div class="me-name">' + esc(me.displayName) + "</div>" +
            '<div class="muted small">' + esc(me.jobTitle) + "</div>" + (me.isOwner ? '<span class="badge badge-owner">System owner</span>' : "") + "</div></div>" +
            rolesHtml(me) +
            (primaryEmail(me) ? '<div class="me-email">' + icon("mail") + esc(primaryEmail(me)) + "</div>" : "") +
            '<a class="btn btn-ghost btn-block-sm" href="/settings" data-link>' + icon("settings") + "Settings</a></section>" +
            '<section class="panel help-panel">' + icon("lifebuoy") + '<div><h2 class="section-title">Need help?</h2>' +
            '<p class="muted small">For access problems or anything IT related, contact the IT team.</p></div></section>' +
            "</aside></div>";

        // Live panels: the latest announcements, and anything waiting for the user to acknowledge.
        api("/api/announcements").then(function (d) {
            const box = $("#home-news");
            if (!box) return;
            const latest = d.announcements.slice(0, 5);
            box.innerHTML = latest.length
                ? latest.map(function (a) { return announcementHtml(a, { clamp: true }); }).join("") +
                  (d.announcements.length > latest.length ? '<a class="btn btn-ghost more-link" href="/announcements" data-link>See all ' + d.announcements.length + " announcements</a>" : "")
                : '<div class="panel muted small">No announcements yet.</div>';
            // Show anything new as soon as you land on the home page.
            const unread = d.announcements.filter(function (a) { return a.unread; });
            if (unread.length && !$(".modal-backdrop")) showNewAnnouncements(unread);
        }).catch(function () {});

        if (me.pendingAcks) {
            api("/api/documents").then(function (d) {
                const box = $("#home-todo");
                if (!box) return;
                const todo = d.documents.filter(function (x) { return x.needsAck; });
                if (!todo.length) return;
                box.hidden = false;
                box.classList.add("todo-panel");
                box.innerHTML = '<h2 class="section-title">' + icon("alert") + "Needs your attention</h2>" +
                    '<p class="muted small">Please read and acknowledge:</p>' +
                    '<ul class="todo-list">' + todo.map(function (x) {
                        return '<li>' + fileBadge(x.file.ext) + '<span>' + esc(x.title) + "</span></li>";
                    }).join("") + "</ul>" +
                    '<a class="btn btn-primary btn-block-sm" href="/documents" data-link>Go to Documents &amp; Policies</a>';
            }).catch(function () {});
        }
    }

    // ================= Staff directory =================

    // The job title and supervisor someone has at a given company. Anything not set for that
    // company comes from their main company.
    function roleFor(p, company) {
        if (company && company !== p.company) {
            const r = (p.otherRoles || []).find(function (x) { return x.company === company; });
            if (r) return { company: company, jobTitle: r.jobTitle || p.jobTitle, supervisorId: r.supervisorId || p.supervisorId, main: false };
        }
        return { company: p.company, jobTitle: p.jobTitle, supervisorId: p.supervisorId, main: true };
    }

    function worksAt(p, company) {
        return p.company === company || (p.otherRoles || []).some(function (r) { return r.company === company; });
    }

    function companiesOf(p) {
        return [p.company].concat((p.otherRoles || []).map(function (r) { return r.company; }));
    }

    function ownerBadge(p) {
        return p.isOwner ? ' <span class="badge badge-owner">System owner</span>' : "";
    }

    // Every role is its own profile: one entry per person per company they work at.
    function roleEntries(people) {
        const out = [];
        people.forEach(function (p) {
            companiesOf(p).forEach(function (c) {
                const r = roleFor(p, c);
                out.push({ key: p.id + "|" + c, person: p, company: c, jobTitle: r.jobTitle, supervisorId: r.supervisorId, main: r.main });
            });
        });
        return out;
    }

    // The profile an entry reports to: the supervisor's role at the same company, or their main
    // role if they don't work there. E.g. Jack (Horizon Network) reports to Charlie's Horizon Network role.
    function supervisorKey(entry, byId) {
        const s = byId[entry.supervisorId];
        if (!s || s.id === entry.person.id) return null;
        return s.id + "|" + (worksAt(s, entry.company) ? entry.company : s.company);
    }

    // The signed-in user's roles: job title and supervisor at each company they work for.
    function rolesHtml(me) {
        return '<div class="role-list compact">' + (me.roles || []).map(function (r) {
            return '<div class="role-item"><div><div class="role-company">' + esc(r.company) + (r.main && me.roles.length > 1 ? ' <span class="badge">Main</span>' : "") + "</div>" +
                '<div class="small">' + esc(r.jobTitle) + '</div></div><div class="small muted">' +
                (r.supervisor ? "Reports to " + esc(r.supervisor.displayName) + " (" + esc(r.supervisor.jobTitle) + ")" : "No supervisor") + "</div></div>";
        }).join("") + "</div>";
    }

    const DIR_VIEWS = [
        { key: "grid", label: "Cards", icon: "grid" },
        { key: "list", label: "List", icon: "list" },
        { key: "tree", label: "Org chart", icon: "tree" },
    ];

    function savedPref(key, fallback) {
        try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
    }
    function savePref(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
    }

    // Everything the directory and profile pop-ups need to look people and roles up.
    function directoryContext(people) {
        const byId = {};
        people.forEach(function (p) { byId[p.id] = p; });
        const entries = roleEntries(people).sort(function (a, b) {
            return a.person.displayName.localeCompare(b.person.displayName) || (b.main - a.main) || a.company.localeCompare(b.company);
        });
        const byKey = {};
        entries.forEach(function (e) { byKey[e.key] = e; });
        return { people: people, byId: byId, entries: entries, byKey: byKey };
    }

    async function viewDirectory(root, current) {
        const data = await api("/api/directory");
        if (!current()) return;
        const ctx = directoryContext(data.people);
        const people = ctx.people;
        let view = savedPref("hn-dir-view", "grid");
        if (!DIR_VIEWS.some(function (v) { return v.key === view; })) view = "grid";
        const collapsed = {};

        root.innerHTML =
            '<div class="page-head"><div><h1>Staff Directory</h1><p class="muted">Find colleagues and see how teams fit together across HN Group. Someone with roles at several companies has a profile for each.</p></div>' +
            '<div class="segmented" role="tablist" aria-label="Directory view">' +
            DIR_VIEWS.map(function (v) {
                return '<button type="button" role="tab" data-view="' + v.key + '">' + icon(v.icon) + "<span>" + v.label + "</span></button>";
            }).join("") + "</div></div>" +
            '<div class="company-tabs" id="dir-companies" role="tablist" aria-label="Company">' +
            '<button type="button" data-company="">All companies <span class="tab-count">' + people.length + "</span></button>" +
            state.meta.companies.map(function (c) {
                const n = ctx.entries.filter(function (e) { return e.company === c; }).length;
                return '<button type="button" data-company="' + esc(c) + '">' + esc(c) + ' <span class="tab-count">' + n + "</span></button>";
            }).join("") + "</div>" +
            '<div class="toolbar">' +
            '<label class="search">' + icon("search") + '<input type="search" id="dir-search" placeholder="Search by name, job title, email or location" aria-label="Search"></label>' +
            "</div>" +
            '<p class="muted small" id="dir-count"></p>' +
            '<div id="dir-body"></div>';

        let company = "";

        function matches(e) {
            if (company && e.company !== company) return false;
            const q = $("#dir-search").value.trim().toLowerCase();
            if (!q) return true;
            const p = e.person;
            return [p.displayName, p.firstName, p.lastName, e.jobTitle, e.company, p.location]
                .concat(p.emails.map(function (x) { return x.address; }))
                .join(" ").toLowerCase().indexOf(q) !== -1;
        }

        function supLabel(e) {
            const s = ctx.byKey[supervisorKey(e, ctx.byId)];
            return s ? esc(s.person.displayName) + ' <span class="muted">· ' + esc(s.jobTitle) + "</span>" : "";
        }

        function roleTag(e) {
            return companiesOf(e.person).length > 1 ? (e.main ? '<span class="badge">Main role</span>' : '<span class="badge badge-soft">Additional role</span>') : "";
        }

        function card(e) {
            const p = e.person;
            const sup = supLabel(e);
            return '<button type="button" class="person-card" data-entry="' + esc(e.key) + '"><span class="pc-band"></span>' + avatar(p, "lg") +
                '<span class="pc-name">' + esc(p.displayName) + "</span>" +
                '<span class="pc-title">' + esc(e.jobTitle) + "</span>" +
                '<span class="pc-company">' + esc(e.company) + "</span>" +
                roleTag(e) +
                (sup ? '<span class="pc-reports">Reports to ' + sup + "</span>" : "") +
                '<span class="pc-meta">' + icon("clock") + clock(p.timezone, "short") + " · " + esc(p.location || tzCity(p.timezone)) + "</span>" +
                "</button>";
        }

        function row(e) {
            const p = e.person;
            const sup = supLabel(e);
            const email = primaryEmail(p);
            return '<tr data-entry="' + esc(e.key) + '" tabindex="0">' +
                '<td><div class="emp-cell">' + avatar(p, "sm") + '<div><div class="emp-name">' + esc(p.displayName) + ownerBadge(p) + '</div><div class="muted small">' + esc(e.jobTitle) + "</div></div></div></td>" +
                '<td data-label="Company">' + esc(e.company) + " " + roleTag(e) + "</td>" +
                '<td data-label="Reports to">' + (sup || '<span class="muted">—</span>') + "</td>" +
                '<td data-label="Email">' + (email ? '<a href="mailto:' + esc(email) + '" data-stop>' + esc(email) + "</a>" : "") + "</td>" +
                '<td data-label="Local time" class="nowrap">' + clock(p.timezone, "short") + ' <span class="muted small">' + esc(p.location || tzCity(p.timezone)) + "</span></td>" +
                "</tr>";
        }

        // Org chart of role profiles: each one sits under the supervisor's role at the same company.
        function drawTree(list) {
            const inSet = {};
            list.forEach(function (e) { inSet[e.key] = true; });
            const kids = {};
            const roots = [];
            list.forEach(function (e) {
                const parent = supervisorKey(e, ctx.byId);
                if (parent && inSet[parent]) (kids[parent] = kids[parent] || []).push(e);
                else roots.push(e);
            });
            // Anyone caught in a reporting loop can't be reached from the top, so show them as a root.
            const reached = {};
            function reach(e) {
                if (reached[e.key]) return;
                reached[e.key] = true;
                (kids[e.key] || []).forEach(reach);
            }
            roots.forEach(reach);
            list.forEach(function (e) { if (!reached[e.key]) { roots.push(e); reach(e); } });

            const placed = {};
            function node(e, depth) {
                if (placed[e.key] || depth > 50) return "";
                placed[e.key] = true;
                const p = e.person;
                const children = (kids[e.key] || []).filter(function (c) { return !placed[c.key]; });
                const isCollapsed = collapsed[e.key];
                const childHtml = children.length && !isCollapsed ? "<ul>" + children.map(function (c) { return node(c, depth + 1); }).join("") + "</ul>" : "";
                return "<li>" +
                    '<div class="org-node' + (p.isOwner ? " is-owner" : "") + '">' +
                    '<button type="button" class="org-card" data-entry="' + esc(e.key) + '">' + avatar(p, "md") +
                    '<span class="org-text"><span class="org-name">' + esc(p.displayName) + '</span><span class="org-title">' + esc(e.jobTitle) + "</span>" +
                    (company ? "" : '<span class="org-company">' + esc(e.company) + "</span>") + "</span></button>" +
                    (children.length ? '<button type="button" class="org-toggle" data-toggle="' + esc(e.key) + '" aria-label="' + (isCollapsed ? "Show" : "Hide") + " reports of " + esc(p.displayName) + '">' +
                        (isCollapsed ? "+" + children.length : "−") + "</button>" : "") +
                    "</div>" + childHtml + "</li>";
            }
            const html = roots.map(function (r) { return node(r, 0); }).join("");
            return '<div class="org-hint muted small">' + icon("tree") + "Showing reporting lines" + (company ? " within " + esc(company) : " for every role across HN Group") +
                ". Someone with several roles appears once per role. Click a person for details, or −/+ to collapse a team.</div>" +
                '<div class="org-scroll"><div class="org"><ul class="org-roots">' + html + "</ul></div></div>";
        }

        function draw() {
            $$("[data-view]", root).forEach(function (b) {
                b.classList.toggle("active", b.dataset.view === view);
                b.setAttribute("aria-selected", String(b.dataset.view === view));
            });
            $$("#dir-companies [data-company]").forEach(function (b) { b.classList.toggle("active", b.dataset.company === company); });

            const list = ctx.entries.filter(matches);
            const nPeople = new Set(list.map(function (e) { return e.person.id; })).size;
            $("#dir-count").textContent = nPeople + (nPeople === 1 ? " person" : " people") +
                (list.length !== nPeople ? " · " + list.length + " roles" : "") + (company ? " at " + company : "");
            const body = $("#dir-body");
            if (!list.length) {
                body.innerHTML = '<div class="empty">' + (people.length ? "No one matches your search." : "No staff have been added yet.") + "</div>";
                return;
            }
            if (view === "list") {
                body.innerHTML = '<div class="table-card"><table class="table table-click"><thead><tr><th>Name</th><th>Company</th><th>Reports to</th><th>Email</th><th>Local time</th></tr></thead><tbody>' +
                    list.map(row).join("") + "</tbody></table></div>";
            } else if (view === "tree") {
                body.innerHTML = drawTree(list);
                const scroller = $(".org-scroll", body);
                scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
            } else {
                body.innerHTML = '<div class="people-grid">' + list.map(card).join("") + "</div>";
            }
        }

        root.addEventListener("click", function (e) {
            const v = e.target.closest("[data-view]");
            if (v) { view = v.dataset.view; savePref("hn-dir-view", view); return draw(); }
            const c = e.target.closest("[data-company]");
            if (c) { company = c.dataset.company; return draw(); }
            const t = e.target.closest("[data-toggle]");
            if (t) { collapsed[t.dataset.toggle] = !collapsed[t.dataset.toggle]; return draw(); }
            if (e.target.closest("[data-stop]")) return;
            const p = e.target.closest("[data-entry]");
            if (p) openPersonModal(p.dataset.entry, ctx);
        });
        root.addEventListener("keydown", function (e) {
            const tr = e.target.closest("tr[data-entry]");
            if (tr && e.key === "Enter") openPersonModal(tr.dataset.entry, ctx);
        });
        $("#dir-search").addEventListener("input", draw);
        draw();
    }

    // Shows one role profile (a person at one company): their title there, who they report to
    // there (in that supervisor's matching role), their team there, and tabs for their other roles.
    function openPersonModal(key, ctx) {
        const e = ctx.byKey[key];
        if (!e) return;
        const p = e.person;
        const supervisor = ctx.byKey[supervisorKey(e, ctx.byId)];
        const reports = ctx.entries.filter(function (x) { return supervisorKey(x, ctx.byId) === key; });
        const roles = ctx.entries.filter(function (x) { return x.person.id === p.id; });
        const email = primaryEmail(p);
        const personRow = function (x) {
            return '<button type="button" class="person-row" data-entry="' + esc(x.key) + '">' + avatar(x.person, "sm") +
                '<span class="pr-text"><span class="pr-name">' + esc(x.person.displayName) + '</span><span class="pr-title">' + esc(x.jobTitle) +
                (x.company !== e.company ? " \u00b7 " + esc(x.company) : "") + "</span></span>" + icon("chevron", "pr-chev") + "</button>";
        };

        const m = openModal(
            '<div class="profile-cover"></div>' +
            '<div class="profile-top">' +
            '<div class="profile-avatar">' + avatar(p, "xl") + "</div>" +
            '<div class="profile-id"><h2 class="modal-title">' + esc(p.displayName) + "</h2>" +
            '<div class="profile-role">' + esc(e.jobTitle) + "</div>" +
            '<div class="profile-company">' + icon("building") + esc(e.company) + "</div></div>" +
            '<div class="profile-badges">' + (roles.length > 1 ? (e.main ? '<span class="badge">Main role</span>' : '<span class="badge badge-soft">Additional role</span>') : "") +
            (p.isOwner ? '<span class="badge badge-owner">System owner</span>' : "") + "</div>" +
            "</div>" +

            (roles.length > 1
                ? '<div class="role-tabs" role="tablist" aria-label="Roles">' + roles.map(function (r) {
                    return '<button type="button" role="tab" class="role-tab' + (r.key === key ? " active" : "") + '" aria-selected="' + (r.key === key) + '" data-entry="' + esc(r.key) + '">' +
                        '<span class="rt-company">' + esc(r.company) + '</span><span class="rt-title">' + esc(r.jobTitle) + "</span></button>";
                }).join("") + "</div>"
                : "") +

            '<div class="profile-content">' +
            '<div class="profile-grid">' +
            '<div class="info-card"><div class="info-label">' + icon("mail") + "Email</div>" +
            p.emails.map(function (x) {
                return '<div class="email-line"><a href="mailto:' + esc(x.address) + '">' + esc(x.address) + "</a>" +
                    '<button type="button" class="icon-btn icon-btn-sm" data-copy="' + esc(x.address) + '" aria-label="Copy ' + esc(x.address) + '">' + icon("copy") + "</button></div>";
            }).join("") +
            (p.phone ? '<div class="info-sub">' + icon("phone") + '<a href="tel:' + esc(p.phone.replace(/\s+/g, "")) + '">' + esc(p.phone) + "</a></div>" : "") +
            "</div>" +
            '<div class="info-card"><div class="info-label">' + icon("clock") + "Local time</div>" +
            '<div class="info-time">' + clock(p.timezone, "short") + "</div>" +
            '<div class="info-sub">' + icon("pin") + esc(p.location || tzCity(p.timezone)) + "</div>" +
            '<div class="muted small">' + esc(tzDifference(p.timezone)) + "</div></div>" +
            "</div>" +

            '<div class="profile-section"><h3 class="detail-head">Reports to</h3>' +
            (supervisor ? personRow(supervisor) : '<div class="top-of-org">' + icon("tree") + "Top of " + esc(e.company) + "</div>") + "</div>" +
            (reports.length
                ? '<div class="profile-section"><h3 class="detail-head">Team <span class="tab-count">' + reports.length + "</span></h3>" +
                  '<div class="team-grid">' + reports.map(personRow).join("") + "</div></div>"
                : "") +
            "</div>" +

            (email ? '<div class="profile-actions"><a class="btn btn-primary" href="mailto:' + esc(email) + '">' + icon("mail") + "Email " + esc(p.firstName || p.displayName) + "</a></div>" : ""),
            { cls: "modal-profile" }
        );
        m.el.addEventListener("click", function (ev) {
            const copy = ev.target.closest("[data-copy]");
            if (copy) return copyText(copy.dataset.copy);
            const target = ev.target.closest("[data-entry]");
            if (target && target.dataset.entry !== key) openPersonModal(target.dataset.entry, ctx);
        });
    }

    // ================= Employee management =================

    function accountBadge(emp) {
        if (!emp.account) return '<span class="badge badge-grey">No account</span>';
        if (!emp.account.enabled) return '<span class="badge badge-red">Disabled</span>';
        if (emp.account.passwordTemporary) return '<span class="badge badge-yellow">Awaiting first sign-in</span>';
        if (!emp.account.hasCode) return '<span class="badge badge-yellow">Code not set</span>';
        return '<span class="badge badge-green">Active</span>';
    }

    async function viewEmployees(root, current) {
        const data = await api("/api/employees");
        if (!current()) return;
        const employees = data.employees.sort(function (a, b) { return a.displayName.localeCompare(b.displayName); });
        const byId = {};
        employees.forEach(function (e) { byId[e.id] = e; });

        root.innerHTML =
            '<div class="page-head"><div><h1>Employee Management</h1><p class="muted">Add staff, manage their details and set up their login accounts.</p></div>' +
            '<div class="page-actions">' +
            (state.me.isAdmin ? '<button type="button" class="btn btn-ghost" id="access-rules">' + icon("shield") + "Access rules</button>" : "") +
            '<button type="button" class="btn btn-primary" id="add-employee">' + icon("plus") + "Add employee</button></div></div>" +
            '<div class="toolbar"><label class="search">' + icon("search") +
            '<input type="search" id="emp-search" placeholder="Search employees" aria-label="Search employees"></label></div>' +
            '<div class="table-card"><table class="table"><thead><tr><th>Employee</th><th>Job title</th><th>Company</th><th>Reports to</th><th>Login</th><th class="col-actions"><span class="sr-only">Actions</span></th></tr></thead>' +
            '<tbody id="emp-body"></tbody></table></div>';

        function draw() {
            const q = $("#emp-search").value.trim().toLowerCase();
            const list = employees.filter(function (e) {
                return !q || [e.displayName, e.jobTitle, e.company, e.loginUsername].join(" ").toLowerCase().indexOf(q) !== -1;
            });
            $("#emp-body").innerHTML = list.length ? list.map(function (e) {
                const sup = byId[e.supervisorId];
                const isMe = e.id === state.me.id;
                const locked = e.isOwner && !state.me.isOwner;
                const actions = [
                    '<button type="button" class="menu-item compact" data-act="edit">' + icon("edit") + "<span>Edit details</span></button>",
                ];
                if (locked && !e.account) {
                    actions.length = 0;
                    actions.push('<button type="button" class="menu-item compact" data-act="account">' + icon("key") + "<span>Create login account</span></button>");
                }
                if (!isMe && !locked) {
                    actions.push(e.account
                        ? '<button type="button" class="menu-item compact" data-act="reset">' + icon("key") + "<span>Reset password</span></button>"
                        : '<button type="button" class="menu-item compact" data-act="account">' + icon("key") + "<span>Create login account</span></button>");
                    if (e.account && e.account.hasCode) {
                        actions.push('<button type="button" class="menu-item compact" data-act="code-reset">' + icon("shield") + "<span>Reset sign-in code</span></button>");
                    }
                    if (e.account) {
                        actions.push(e.account.enabled
                            ? '<button type="button" class="menu-item compact" data-act="disable">' + icon("ban") + "<span>Disable login</span></button>"
                            : '<button type="button" class="menu-item compact" data-act="enable">' + icon("check") + "<span>Enable login</span></button>");
                    }
                    actions.push('<div class="menu-sep"></div><button type="button" class="menu-item compact danger" data-act="delete">' + icon("trash") + "<span>Delete employee</span></button>");
                }
                return '<tr data-id="' + e.id + '">' +
                    '<td><div class="emp-cell">' + avatar(e, "sm") + '<div><div class="emp-name">' + esc(e.displayName) + ownerBadge(e) + (isMe ? ' <span class="muted small">(you)</span>' : "") +
                    '</div><div class="muted small">' + esc(e.loginUsername) + (e.emails.length > 1 ? ' <span class="count-pill">+' + (e.emails.length - 1) + "</span>" : "") + "</div></div></div></td>" +
                    '<td data-label="Job title">' + esc(e.jobTitle) + "</td>" +
                    '<td data-label="Company">' + esc(e.company) + (e.otherRoles.length ? ' <span class="count-pill" title="' + esc(e.otherRoles.map(function (r) { return r.company + (r.jobTitle ? " — " + r.jobTitle : ""); }).join(", ")) + '">+' + e.otherRoles.length + "</span>" : "") + "</td>" +
                    '<td data-label="Reports to">' + (sup ? esc(sup.displayName) : '<span class="muted">—</span>') + "</td>" +
                    '<td data-label="Login">' + accountBadge(e) + "</td>" +
                    (locked && e.account ? '<td class="col-actions"><span class="icon-btn" title="Only the system owner can change this record">' + icon("lock") + "</span></td></tr>" :
                    '<td class="col-actions"><div class="nav-item row-menu"><button type="button" class="icon-btn" data-menu aria-haspopup="true" aria-expanded="false" aria-label="Actions for ' + esc(e.displayName) + '">' + icon("more") + "</button>" +
                    '<div class="menu menu-right menu-row" role="menu" hidden>' + actions.join("") + "</div></div></td></tr>");
            }).join("") : '<tr><td colspan="6"><div class="empty">' +
                (employees.length ? "No employees match your search." : 'No employees yet. Click <strong>Add employee</strong> to add the first one.') + "</div></td></tr>";
        }

        const reload = function () { navigate("/employees", true); };

        $("#emp-search").addEventListener("input", draw);
        $("#add-employee").addEventListener("click", function () { openEmployeeForm(null, employees, reload); });
        if ($("#access-rules")) $("#access-rules").addEventListener("click", openAccessRules);

        $("#emp-body").addEventListener("click", async function (ev) {
            const btn = ev.target.closest("[data-act]");
            if (!btn) return;
            closeMenus();
            const emp = byId[btn.closest("tr").dataset.id];
            const act = btn.dataset.act;
            try {
                if (act === "edit") return openEmployeeForm(emp, employees, reload);
                if (act === "account") return createAccountFlow(emp, reload);
                if (act === "reset") {
                    const ok = await confirmDialog({
                        title: "Reset password?",
                        message: emp.displayName + " will be signed out and given a new temporary password. They'll have to create a new password when they next sign in.",
                        confirmLabel: "Reset password",
                    });
                    if (!ok) return;
                    const res = await api("/api/employees/" + emp.id + "/account", {});
                    showCredentials(emp, res, reload);
                }
                if (act === "code-reset") {
                    if (!(await confirmDialog({
                        title: "Reset " + emp.displayName + "\u2019s sign-in code?",
                        message: "They\u2019ll be signed out and asked to choose a new code the next time they sign in with their password.",
                        confirmLabel: "Reset code",
                    }))) return;
                    await api("/api/employees/" + emp.id + "/code/reset", {});
                    toast("Sign-in code reset.");
                    reload();
                }
                if (act === "disable" || act === "enable") {
                    if (act === "disable" && !(await confirmDialog({
                        title: "Disable login?",
                        message: emp.displayName + " won't be able to sign in until their login is enabled again. Their staff record stays in the directory.",
                        confirmLabel: "Disable login", danger: true,
                    }))) return;
                    await api("/api/employees/" + emp.id + "/account/" + act, {});
                    toast(act === "disable" ? "Login disabled." : "Login enabled.");
                    reload();
                }
                if (act === "delete") {
                    if (!(await confirmDialog({
                        title: "Delete " + emp.displayName + "?",
                        message: "This permanently removes their staff record and login. This can't be undone.",
                        confirmLabel: "Delete employee", danger: true,
                    }))) return;
                    await api("/api/employees/" + emp.id + "/delete", {});
                    toast(emp.displayName + " has been deleted.");
                    reload();
                }
            } catch (err) {
                toast(err.message);
            }
        });
        draw();
    }

    function viewNoAccess(root) {
        root.innerHTML = '<div class="empty-page">' + icon("lock", "big") + "<h1>No access</h1>" +
            '<p class="muted">Employee Management is only available to the leadership and HR teams.</p>' +
            '<a class="btn btn-primary" href="/home" data-link>Back to home</a></div>';
    }

    function openEmployeeForm(emp, employees, onDone) {
        const meta = state.meta;
        const isEdit = !!emp;
        let displayTouched = isEdit && emp.displayName !== (emp.firstName + " " + emp.lastName).trim();
        let rows = isEdit
            ? emp.emails.map(function (e) {
                const at = e.address.lastIndexOf("@");
                return { local: e.address.slice(0, at), domain: e.address.slice(at + 1), auto: false, primary: e.primary, domainTouched: true };
            })
            : [{ local: "", domain: meta.companyDomains[meta.companies[0]], auto: true, primary: true, domainTouched: false }];

        const v = emp || {};
        const supervisors = employees.filter(function (p) { return !emp || p.id !== emp.id; });
        // Job title and supervisor for each extra company; blank means "same as main company".
        const roleState = {};
        (v.otherRoles || []).forEach(function (r) { roleState[r.company] = { jobTitle: r.jobTitle || "", supervisorId: r.supervisorId || "" }; });
        const supervisorOptions = function (selected, emptyLabel) {
            return '<option value="">' + esc(emptyLabel) + "</option>" + supervisors.map(function (p) {
                return '<option value="' + p.id + '"' + (p.id === selected ? " selected" : "") + ">" + esc(p.displayName) + " — " + esc(p.jobTitle) + "</option>";
            }).join("");
        };
        const companyOptions = meta.companies.map(function (c) {
            return '<option value="' + esc(c) + '"' + (c === v.company ? " selected" : "") + ">" + esc(c) + "</option>";
        }).join("");

        const m = openModal(
            '<h2 class="modal-title">' + (isEdit ? "Edit " + esc(emp.displayName) : "Add employee") + "</h2>" +
            '<p class="muted">' + (isEdit ? "Update this employee's details." : "Create a staff record. You can set up their login once they're added.") + "</p>" +
            '<form class="emp-form" novalidate>' +

            '<fieldset><legend>Personal details</legend><div class="grid-2">' +
            '<div><label for="f-first">First name <span class="req">*</span></label><input type="text" id="f-first" maxlength="60" value="' + esc(v.firstName) + '" required></div>' +
            '<div><label for="f-last">Last name <span class="req">*</span></label><input type="text" id="f-last" maxlength="60" value="' + esc(v.lastName) + '" required></div>' +
            "</div>" +
            '<label for="f-display">Display name</label><input type="text" id="f-display" maxlength="80" value="' + esc(v.displayName) + '">' +
            '<p class="hint">How their name appears across the portal. Filled in from their first and last name unless you change it.</p>' +
            "</fieldset>" +

            '<fieldset><legend>Role</legend>' +
            '<label for="f-title">Job title <span class="req">*</span></label><input type="text" id="f-title" maxlength="100" value="' + esc(v.jobTitle) + '" placeholder="e.g. Marketing Executive" required>' +
            '<div class="grid-2">' +
            '<div><label for="f-company">Company <span class="req">*</span></label><select id="f-company">' + companyOptions + "</select></div>" +
            '<div><label for="f-supervisor">Supervisor</label><select id="f-supervisor"><option value="">No supervisor</option>' +
            supervisors.map(function (p) {
                return '<option value="' + p.id + '"' + (p.id === v.supervisorId ? " selected" : "") + ">" + esc(p.displayName) + " — " + esc(p.jobTitle) + "</option>";
            }).join("") + "</select></div></div>" +
            '<label>Also works at <span class="muted small">(optional)</span></label><div class="check-chips" id="f-other">' +
            meta.companies.map(function (c) {
                return '<label class="check-chip"><input type="checkbox" value="' + esc(c) + '"' + (roleState[c] ? " checked" : "") + "><span>" + esc(c) + "</span></label>";
            }).join("") + "</div>" +
            '<div id="f-roles"></div>' +
            "</fieldset>" +

            '<fieldset><legend>Email addresses</legend>' +
            '<p class="hint hint-top">The primary address is their login username. Add more addresses if they work across several brands.</p>' +
            '<div id="email-rows"></div>' +
            '<button type="button" class="btn btn-link" id="add-email">' + icon("plus") + "Add another email address</button>" +
            "</fieldset>" +

            '<fieldset><legend>Location &amp; contact</legend><div class="grid-2">' +
            '<div><label for="f-location">Location</label><input type="text" id="f-location" maxlength="80" value="' + esc(v.location) + '" placeholder="e.g. Manchester, UK"></div>' +
            '<div><label for="f-tz">Time zone</label><select id="f-tz">' + timezoneOptions(v.timezone || meta.defaultTimezone) + "</select></div>" +
            "</div>" +
            '<label for="f-phone">Phone <span class="muted small">(optional)</span></label><input type="tel" id="f-phone" maxlength="40" value="' + esc(v.phone) + '">' +
            "</fieldset>" +

            '<div class="form-error" id="f-error" role="alert" hidden></div>' +
            '<div class="modal-actions sticky-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
            '<button type="submit" class="btn btn-primary" id="f-submit">' + (isEdit ? "Save changes" : "Add employee") + "</button></div>" +
            "</form>",
            { wide: true }
        );

        const el = m.el;
        const f = function (id) { return $("#" + id, el); };

        function syncOtherCompanies() {
            const company = f("f-company").value;
            $$("#f-other input", el).forEach(function (cb) {
                const own = cb.value === company;
                cb.disabled = own;
                if (own) cb.checked = false;
                cb.parentNode.classList.toggle("disabled", own);
                if (cb.checked && !roleState[cb.value]) roleState[cb.value] = { jobTitle: "", supervisorId: "" };
                if (!cb.checked) delete roleState[cb.value];
            });
            drawRoles();
        }

        function drawRoles() {
            const list = meta.companies.filter(function (c) { return roleState[c]; });
            f("f-roles").innerHTML = list.map(function (c) {
                const r = roleState[c];
                return '<div class="role-row" data-company="' + esc(c) + '"><div class="role-row-head">' + icon("building") + esc(c) + "</div>" +
                    '<div class="grid-2"><div><label>Job title at ' + esc(c) + '</label><input type="text" class="role-title" maxlength="100" value="' + esc(r.jobTitle) +
                    '" placeholder="Same as main job title"></div>' +
                    "<div><label>Supervisor at " + esc(c) + '</label><select class="role-sup">' + supervisorOptions(r.supervisorId, "Same as main supervisor") + "</select></div></div></div>";
            }).join("");
        }

        f("f-roles").addEventListener("input", function (e) {
            const row = e.target.closest(".role-row");
            if (row && e.target.classList.contains("role-title")) roleState[row.dataset.company].jobTitle = e.target.value;
        });
        f("f-roles").addEventListener("change", function (e) {
            const row = e.target.closest(".role-row");
            if (row && e.target.classList.contains("role-sup")) roleState[row.dataset.company].supervisorId = e.target.value;
        });
        f("f-other").addEventListener("change", syncOtherCompanies);

        function domainOptions(selected) {
            return meta.domains.map(function (d) {
                return '<option value="' + esc(d) + '"' + (d === selected ? " selected" : "") + ">" + esc(d) + "</option>";
            }).join("");
        }

        function drawRows() {
            f("email-rows").innerHTML = rows.map(function (r, i) {
                return '<div class="email-row" data-i="' + i + '">' +
                    '<div class="email-input' + (r.auto ? " is-auto" : "") + '">' +
                    '<input type="text" class="email-local" aria-label="Email name" value="' + esc(r.local) + '"' + (r.auto ? " readonly" : "") +
                    ' placeholder="' + (r.auto ? "firstname.lastname" : "name") + '" autocapitalize="none" spellcheck="false">' +
                    '<span class="email-at">@</span>' +
                    '<select class="email-domain" aria-label="Email domain">' + domainOptions(r.domain) + "</select></div>" +
                    '<div class="email-opts">' +
                    '<label class="inline-check"><input type="radio" name="primary-email" class="email-primary"' + (r.primary ? " checked" : "") + "> Primary (login)</label>" +
                    '<label class="inline-check"><input type="checkbox" class="email-custom"' + (r.auto ? "" : " checked") + "> Custom address</label>" +
                    (rows.length > 1 ? '<button type="button" class="btn btn-link danger email-remove">Remove</button>' : "") +
                    "</div>" +
                    '<div class="email-note" hidden></div></div>';
            }).join("");
            f("add-email").hidden = rows.length >= 10;
            updateNotes();
        }

        function updateNotes() {
            $$(".email-row", el).forEach(function (rowEl, i) {
                const r = rows[i];
                const note = $(".email-note", rowEl);
                const text = r.adjusted && r.local ? r.local.replace(/\.\d+\./, ".") + "@" + r.domain + " is already taken, so a number has been added." : "";
                note.textContent = text;
                note.hidden = !text;
                $(".email-local", rowEl).value = r.local;
            });
        }

        let previewTimer;
        let previewSeq = 0;
        function schedulePreview() {
            clearTimeout(previewTimer);
            previewTimer = setTimeout(preview, 250);
        }

        async function preview() {
            if (!rows.some(function (r) { return r.auto; })) return;
            const seq = ++previewSeq;
            try {
                const res = await api("/api/employees/preview-emails", {
                    firstName: f("f-first").value,
                    lastName: f("f-last").value,
                    excludeId: isEdit ? emp.id : undefined,
                    emails: rows,
                });
                if (seq !== previewSeq) return;
                res.emails.forEach(function (e, i) {
                    if (rows[i] && rows[i].auto) {
                        rows[i].local = e.local;
                        rows[i].adjusted = e.adjusted;
                    }
                });
                updateNotes();
            } catch (e) { /* preview is best-effort */ }
        }

        function onNameChange() {
            if (!displayTouched) f("f-display").value = (f("f-first").value.trim() + " " + f("f-last").value.trim()).trim();
            schedulePreview();
        }

        f("f-first").addEventListener("input", onNameChange);
        f("f-last").addEventListener("input", onNameChange);
        f("f-display").addEventListener("input", function () { displayTouched = f("f-display").value.trim() !== ""; });
        f("f-company").addEventListener("change", function () {
            syncOtherCompanies();
            const r = rows[0];
            if (r && r.auto && !r.domainTouched) {
                r.domain = meta.companyDomains[f("f-company").value] || r.domain;
                $(".email-domain", el).value = r.domain;
                schedulePreview();
            }
        });

        f("email-rows").addEventListener("input", function (e) {
            const rowEl = e.target.closest(".email-row");
            if (!rowEl) return;
            const r = rows[+rowEl.dataset.i];
            if (e.target.classList.contains("email-local") && !r.auto) r.local = e.target.value.trim().toLowerCase();
        });

        f("email-rows").addEventListener("change", function (e) {
            const rowEl = e.target.closest(".email-row");
            if (!rowEl) return;
            const i = +rowEl.dataset.i;
            const r = rows[i];
            if (e.target.classList.contains("email-domain")) {
                r.domain = e.target.value;
                r.domainTouched = true;
                if (r.auto) schedulePreview();
            } else if (e.target.classList.contains("email-primary")) {
                rows.forEach(function (x, j) { x.primary = j === i; });
            } else if (e.target.classList.contains("email-custom")) {
                r.auto = !e.target.checked;
                r.adjusted = false;
                drawRows();
                if (r.auto) schedulePreview();
                else $(".email-row[data-i='" + i + "'] .email-local", el).focus();
            }
        });

        f("email-rows").addEventListener("click", function (e) {
            if (!e.target.closest(".email-remove")) return;
            const i = +e.target.closest(".email-row").dataset.i;
            const wasPrimary = rows[i].primary;
            rows.splice(i, 1);
            if (wasPrimary && rows[0]) rows[0].primary = true;
            drawRows();
        });

        f("add-email").addEventListener("click", function () {
            const used = rows.map(function (r) { return r.domain; });
            const domain = meta.domains.find(function (d) { return used.indexOf(d) === -1; }) || meta.domains[0];
            rows.push({ local: "", domain: domain, auto: true, primary: false, domainTouched: true });
            drawRows();
            schedulePreview();
        });

        $("form", el).addEventListener("submit", async function (e) {
            e.preventDefault();
            formError(f("f-error"), "");
            const payload = {
                firstName: f("f-first").value,
                lastName: f("f-last").value,
                displayName: f("f-display").value,
                jobTitle: f("f-title").value,
                company: f("f-company").value,
                supervisorId: f("f-supervisor").value || null,
                otherRoles: meta.companies.filter(function (c) { return roleState[c] && c !== f("f-company").value; }).map(function (c) {
                    return { company: c, jobTitle: roleState[c].jobTitle, supervisorId: roleState[c].supervisorId || null };
                }),
                emails: rows.map(function (r) { return { local: r.local, domain: r.domain, auto: r.auto, primary: r.primary }; }),
                location: f("f-location").value,
                timezone: f("f-tz").value,
                phone: f("f-phone").value,
            };
            const submit = f("f-submit");
            submit.disabled = true;
            try {
                const res = await api(isEdit ? "/api/employees/" + emp.id : "/api/employees", payload);
                if (isEdit) {
                    if (emp.id === state.me.id) await refreshMe();
                    closeModal();
                    toast("Changes saved.");
                    onDone();
                } else {
                    offerAccount(res.employee, onDone);
                }
            } catch (err) {
                formError(f("f-error"), err.message);
                submit.disabled = false;
            }
        });

        syncOtherCompanies();
        drawRows();
        if (!isEdit) schedulePreview();
    }

    function offerAccount(emp, onDone) {
        const m = openModal(
            '<div class="success-mark">' + icon("check") + "</div>" +
            '<h2 class="modal-title center">' + esc(emp.displayName) + " has been added</h2>" +
            '<p class="muted center">Would you like to create a login account for them now?</p>' +
            '<div class="cred-box"><div class="cred-label">Username</div><div class="cred-value">' + esc(emp.loginUsername) + "</div></div>" +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Not now</button>' +
            '<button type="button" class="btn btn-primary" data-create>Create login account</button></div>',
            { onClose: onDone }
        );
        $("[data-create]", m.el).addEventListener("click", function () {
            m.onClose = null;
            createAccountFlow(emp, onDone);
        });
    }

    async function createAccountFlow(emp, onDone) {
        try {
            const res = await api("/api/employees/" + emp.id + "/account", {});
            showCredentials(emp, res, onDone);
        } catch (err) {
            toast(err.message);
            closeModal();
            onDone();
        }
    }

    function showCredentials(emp, creds, onDone) {
        const m = openModal(
            '<div class="success-mark">' + icon("key") + "</div>" +
            '<h2 class="modal-title center">Login details for ' + esc(emp.displayName) + "</h2>" +
            '<p class="muted center">Share these with ' + esc(emp.firstName || emp.displayName) + " securely. They'll be asked to create their own password the first time they sign in.</p>" +
            '<div class="cred-box"><div><div class="cred-label">Username</div><div class="cred-value">' + esc(creds.username) + "</div></div>" +
            '<button type="button" class="icon-btn" data-copy="' + esc(creds.username) + '" aria-label="Copy username">' + icon("copy") + "</button></div>" +
            '<div class="cred-box"><div><div class="cred-label">Temporary password</div><div class="cred-value mono big">' + esc(creds.temporaryPassword) + "</div></div>" +
            '<button type="button" class="icon-btn" data-copy="' + esc(creds.temporaryPassword) + '" aria-label="Copy password">' + icon("copy") + "</button></div>" +
            '<p class="hint center">This password won\'t be shown again. If it gets lost, use <strong>Reset password</strong> to issue a new one.</p>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-copy="' +
            esc("Staff Portal: https://" + window.location.host + "\nUsername: " + creds.username + "\nTemporary password: " + creds.temporaryPassword) +
            '">' + icon("copy") + "Copy all</button>" +
            '<button type="button" class="btn btn-primary" data-close>Done</button></div>',
            { onClose: onDone }
        );
        m.el.addEventListener("click", function (e) {
            const b = e.target.closest("[data-copy]");
            if (b) copyText(b.dataset.copy);
        });
    }

    async function openAccessRules() {
        const data = await api("/api/settings/access");
        const m = openModal(
            '<h2 class="modal-title">Access rules</h2>' +
            '<p class="muted">Anyone whose job title contains one of these words or phrases can use Employee Management. Put one per line. Matching ignores upper and lower case.</p>' +
            '<label for="rules">Leadership &amp; HR job titles</label>' +
            '<textarea id="rules" rows="8">' + esc(data.managementTitles.join("\n")) + "</textarea>" +
            '<h3 class="detail-head">Who has access now</h3><div id="rule-managers"></div>' +
            '<div class="form-error" id="rules-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
            '<button type="button" class="btn btn-primary" id="rules-save">Save rules</button></div>'
        );
        function drawManagers(list) {
            $("#rule-managers", m.el).innerHTML = list.length
                ? '<ul class="plain-list">' + list.map(function (p) { return "<li><strong>" + esc(p.displayName) + '</strong> <span class="muted">— ' + esc(p.jobTitle) + "</span></li>"; }).join("") + "</ul>"
                : '<p class="muted small">No employees match yet. The system administrator always has access.</p>';
        }
        drawManagers(data.managers);
        $("#rules-save", m.el).addEventListener("click", async function () {
            try {
                const res = await api("/api/settings/access", { managementTitles: $("#rules", m.el).value.split("\n") });
                drawManagers(res.managers);
                $("#rules", m.el).value = res.managementTitles.join("\n");
                toast("Access rules saved.");
            } catch (err) {
                formError($("#rules-error", m.el), err.message);
            }
        });
    }

    // ================= Workplace: announcements =================

    function fmtDate(iso) {
        return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }

    function fmtDateTime(iso) {
        return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    function fileSize(bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
        return (bytes / 1024 / 1024).toFixed(1) + " MB";
    }

    // Escapes text, keeps line breaks and turns web addresses into links.
    function richText(text) {
        return esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g, "<br>");
    }

    function audienceChips(companies) {
        return companies.length
            ? companies.map(function (c) { return '<span class="chip">' + esc(c) + "</span>"; }).join("")
            : '<span class="chip chip-all">Everyone</span>';
    }

    // Audience picker used by the announcement and document forms. Nothing ticked = everyone.
    function audienceField(selected) {
        return '<label>Who can see this</label><div class="check-chips audience">' +
            state.meta.companies.map(function (c) {
                return '<label class="check-chip"><input type="checkbox" value="' + esc(c) + '"' + (selected.indexOf(c) !== -1 ? " checked" : "") + "><span>" + esc(c) + "</span></label>";
            }).join("") + '</div><p class="hint">Leave all unticked to share with everyone in HN Group.</p>';
    }

    function readAudience(el) {
        return $$(".audience input:checked", el).map(function (cb) { return cb.value; });
    }

    // One announcement card. `clamp` shortens long messages (used on the home page).
    function announcementHtml(a, opts) {
        opts = opts || {};
        const long = opts.clamp && a.body.length > 400;
        return '<article class="announcement' + (a.important ? " important" : "") + (a.unread ? " unread" : "") + '" data-id="' + a.id + '">' +
            '<header class="ann-head">' + avatar(a.author, "md") +
            '<div class="ann-meta"><div class="ann-author">' + esc(a.author.displayName) + "</div>" +
            '<div class="muted small">' + esc(a.author.jobTitle || "") + (a.author.jobTitle ? " · " : "") + esc(fmtDateTime(a.createdAt)) +
            (a.updatedAt !== a.createdAt ? " · edited" : "") + "</div></div>" +
            '<div class="ann-flags">' +
            (a.unread ? '<span class="badge badge-new">New</span>' : "") +
            (a.pinned ? '<span class="badge">' + icon("pinned") + "Pinned</span>" : "") +
            (a.important ? '<span class="badge badge-red">Important</span>' : "") +
            (opts.menu || "") +
            "</div></header>" +
            '<h2 class="ann-title">' + esc(a.title) + "</h2>" +
            '<div class="ann-body">' + richText(long ? a.body.slice(0, 400).trim() + "…" : a.body) + "</div>" +
            (long ? '<a class="small read-more" href="/announcements" data-link>Read more</a>' : "") +
            '<footer class="chips">' + audienceChips(a.companies) + "</footer>" +
            "</article>";
    }

    // Pop-up of announcements the user hasn't seen yet. Closing it marks them as read.
    function showNewAnnouncements(unread) {
        openModal(
            '<h2 class="modal-title">' + (unread.length === 1 ? "New announcement" : unread.length + " new announcements") + "</h2>" +
            '<div class="announcements popup-list">' + unread.map(function (a) { return announcementHtml(a); }).join("") + "</div>" +
            '<div class="modal-actions"><a class="btn btn-ghost" href="/announcements" data-link>Open Announcements</a>' +
            '<button type="button" class="btn btn-primary" data-close>Got it</button></div>',
            {
                wide: true,
                onClose: function () {
                    api("/api/announcements/seen", {}).then(function (r) {
                        state.me = r.user;
                        renderChrome();
                        $$("#home-news .announcement.unread").forEach(function (el) {
                            el.classList.remove("unread");
                            const b = $(".badge-new", el);
                            if (b) b.remove();
                        });
                    }).catch(function () {});
                },
            }
        );
    }

    async function viewAnnouncements(root, current) {
        const data = await api("/api/announcements");
        if (!current()) return;
        const list = data.announcements;

        root.innerHTML =
            '<div class="page-head"><div><h1>Announcements</h1><p class="muted">News and updates from across HN Group.</p></div>' +
            (data.canPost ? '<div class="page-actions"><button type="button" class="btn btn-primary" id="new-announcement">' + icon("plus") + "New announcement</button></div>" : "") +
            "</div>" +
            '<div class="announcements">' + (list.length ? list.map(function (a) {
                return announcementHtml(a, {
                    menu: data.canPost ? '<div class="nav-item row-menu"><button type="button" class="icon-btn" data-menu aria-haspopup="true" aria-expanded="false" aria-label="Announcement options">' + icon("more") + "</button>" +
                        '<div class="menu menu-right menu-row" role="menu" hidden>' +
                        '<button type="button" class="menu-item compact" data-act="edit">' + icon("edit") + "<span>Edit</span></button>" +
                        '<button type="button" class="menu-item compact danger" data-act="delete">' + icon("trash") + "<span>Delete</span></button></div></div>" : "",
                });
            }).join("") : '<div class="empty-page">' + icon("bell", "big") + "<h2>No announcements yet</h2>" +
                '<p class="muted">' + (data.canPost ? "Post the first one with <strong>New announcement</strong>." : "Check back soon.") + "</p></div>") + "</div>";

        if ($("#new-announcement")) $("#new-announcement").addEventListener("click", function () { openAnnouncementForm(null); });
        root.addEventListener("click", async function (e) {
            const btn = e.target.closest("[data-act]");
            if (!btn) return;
            closeMenus();
            const a = list.find(function (x) { return x.id === btn.closest("[data-id]").dataset.id; });
            if (btn.dataset.act === "edit") return openAnnouncementForm(a);
            if (!(await confirmDialog({ title: "Delete this announcement?", message: "“" + a.title + "” will be removed for everyone.", confirmLabel: "Delete", danger: true }))) return;
            try {
                await api("/api/announcements/" + a.id + "/delete", {});
                toast("Announcement deleted.");
                render();
            } catch (err) { toast(err.message); }
        });

        // Opening the page marks everything as read.
        if (list.some(function (a) { return a.unread; })) {
            api("/api/announcements/seen", {}).then(function (r) { state.me = r.user; renderChrome(); }).catch(function () {});
        }
    }

    function openAnnouncementForm(a) {
        const v = a || { title: "", body: "", companies: [], pinned: false, important: false };
        const m = openModal(
            '<h2 class="modal-title">' + (a ? "Edit announcement" : "New announcement") + "</h2>" +
            '<form novalidate id="ann-form">' +
            '<label for="ann-title">Title</label><input type="text" id="ann-title" maxlength="150" value="' + esc(v.title) + '">' +
            '<label for="ann-body">Message</label><textarea id="ann-body" rows="8" maxlength="10000">' + esc(v.body) + "</textarea>" +
            '<p class="hint">Line breaks are kept and web links become clickable.</p>' +
            audienceField(v.companies) +
            '<div class="option-row"><label class="inline-check"><input type="checkbox" id="ann-pinned"' + (v.pinned ? " checked" : "") + "> Pin to the top</label>" +
            '<label class="inline-check"><input type="checkbox" id="ann-important"' + (v.important ? " checked" : "") + "> Mark as important</label></div>" +
            '<div class="form-error" id="ann-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
            '<button type="submit" class="btn btn-primary" id="ann-save">' + (a ? "Save changes" : "Post announcement") + "</button></div></form>",
            { wide: true }
        );
        $("#ann-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            formError($("#ann-error", m.el), "");
            $("#ann-save", m.el).disabled = true;
            try {
                await api(a ? "/api/announcements/" + a.id : "/api/announcements", {
                    title: $("#ann-title", m.el).value,
                    body: $("#ann-body", m.el).value,
                    companies: readAudience(m.el),
                    pinned: $("#ann-pinned", m.el).checked,
                    important: $("#ann-important", m.el).checked,
                });
                closeModal();
                toast(a ? "Announcement updated." : "Announcement posted.");
                render();
            } catch (err) {
                formError($("#ann-error", m.el), err.message);
                $("#ann-save", m.el).disabled = false;
            }
        });
    }

    // ================= Workplace: documents & policies =================

    const FILE_KINDS = {
        pdf: "PDF", doc: "Word", docx: "Word", odt: "Doc", rtf: "Doc", txt: "Text", csv: "CSV",
        xls: "Excel", xlsx: "Excel", ods: "Sheet", ppt: "PowerPoint", pptx: "PowerPoint", odp: "Slides",
        png: "Image", jpg: "Image", jpeg: "Image",
    };
    const ACCEPT = ".pdf,.doc,.docx,.odt,.rtf,.txt,.csv,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.png,.jpg,.jpeg";

    function fileBadge(ext) {
        return '<span class="file-badge file-' + esc(ext) + '">' + esc((ext || "file").toUpperCase()) + "</span>";
    }

    async function viewDocuments(root, current) {
        const data = await api("/api/documents");
        if (!current()) return;
        const docs = data.documents;
        let category = "";
        const pending = docs.filter(function (d) { return d.needsAck; });

        root.innerHTML =
            '<div class="page-head"><div><h1>Documents &amp; Policies</h1><p class="muted">Handbooks, policies, forms and templates for HN Group staff.</p></div>' +
            (data.canManage ? '<div class="page-actions"><button type="button" class="btn btn-primary" id="upload-doc">' + icon("upload") + "Upload document</button></div>" : "") +
            "</div>" +
            (pending.length ? '<div class="banner banner-warn"><div>' + icon("alert") + " <strong>" + pending.length +
                (pending.length === 1 ? " document needs" : " documents need") + " your acknowledgement.</strong> Please read " + (pending.length === 1 ? "it" : "them") + " and confirm.</div>" +
                '<button type="button" class="btn btn-small btn-dark" id="show-pending">Show me</button></div>' : "") +
            '<div class="company-tabs" id="doc-cats">' +
            '<button type="button" data-cat="">All <span class="tab-count">' + docs.length + "</span></button>" +
            data.categories.map(function (c) {
                const n = docs.filter(function (d) { return d.category === c; }).length;
                return n || data.canManage ? '<button type="button" data-cat="' + esc(c) + '">' + esc(c) + ' <span class="tab-count">' + n + "</span></button>" : "";
            }).join("") +
            (pending.length ? '<button type="button" data-cat="__pending">To acknowledge <span class="tab-count">' + pending.length + "</span></button>" : "") +
            "</div>" +
            '<div class="toolbar"><label class="search">' + icon("search") + '<input type="search" id="doc-search" placeholder="Search documents" aria-label="Search documents"></label></div>' +
            '<div id="doc-list"></div>';

        function draw() {
            $$("#doc-cats [data-cat]").forEach(function (b) { b.classList.toggle("active", b.dataset.cat === category); });
            const q = $("#doc-search").value.trim().toLowerCase();
            const list = docs.filter(function (d) {
                if (category === "__pending" && !d.needsAck) return false;
                if (category && category !== "__pending" && d.category !== category) return false;
                return !q || [d.title, d.description, d.category, d.file.name].join(" ").toLowerCase().indexOf(q) !== -1;
            });
            $("#doc-list").innerHTML = list.length ? '<div class="doc-list">' + list.map(function (d) {
                const status = d.requiresAck
                    ? (d.acknowledgedAt
                        ? '<span class="badge badge-green">' + icon("tick") + "Acknowledged " + esc(fmtDate(d.acknowledgedAt)) + "</span>"
                        : d.needsAck ? '<button type="button" class="btn btn-small btn-primary" data-act="ack">Read &amp; acknowledge</button>' : "")
                    : "";
                const progress = data.canManage && d.requiresAck
                    ? '<button type="button" class="ack-progress" data-act="acks" title="See who has acknowledged"><span class="ack-bar"><span data-pct="' +
                        (d.audienceCount ? Math.round(d.ackCount / d.audienceCount * 100) : 0) + '"></span></span>' + d.ackCount + "/" + d.audienceCount + " acknowledged</button>"
                    : "";
                return '<div class="doc-row' + (d.needsAck ? " needs-ack" : "") + '" data-id="' + d.id + '">' +
                    fileBadge(d.file.ext) +
                    '<div class="doc-main"><div class="doc-title">' + esc(d.title) + (d.requiresAck ? ' <span class="badge">Must read</span>' : "") + "</div>" +
                    (d.description ? '<div class="doc-desc muted small">' + esc(d.description) + "</div>" : "") +
                    '<div class="doc-meta muted small">' + esc(d.category) + " · " + esc(FILE_KINDS[d.file.ext] || d.file.ext) + " · " + fileSize(d.file.size) +
                    " · Updated " + esc(fmtDate(d.updatedAt)) + (d.version > 1 ? " · Version " + d.version : "") + "</div>" +
                    '<div class="chips">' + audienceChips(d.companies) + "</div></div>" +
                    '<div class="doc-side">' + status + progress +
                    '<div class="btn-row">' +
                    (d.file.inline ? '<a class="btn btn-ghost btn-small" href="/api/documents/' + d.id + '/file" target="_blank" rel="noopener">' + icon("eye") + "View</a>" : "") +
                    '<a class="btn btn-ghost btn-small" href="/api/documents/' + d.id + '/file?download=1">' + icon("download") + "Download</a>" +
                    (data.canManage ? '<div class="nav-item row-menu"><button type="button" class="icon-btn" data-menu aria-haspopup="true" aria-expanded="false" aria-label="Document options">' + icon("more") + "</button>" +
                        '<div class="menu menu-right menu-row" role="menu" hidden>' +
                        '<button type="button" class="menu-item compact" data-act="edit">' + icon("edit") + "<span>Edit details</span></button>" +
                        '<button type="button" class="menu-item compact" data-act="replace">' + icon("upload") + "<span>Upload new version</span></button>" +
                        (d.requiresAck ? '<button type="button" class="menu-item compact" data-act="acks">' + icon("users") + "<span>Who has acknowledged</span></button>" : "") +
                        '<div class="menu-sep"></div><button type="button" class="menu-item compact danger" data-act="delete">' + icon("trash") + "<span>Delete</span></button></div></div>" : "") +
                    "</div></div></div>";
            }).join("") + "</div>"
                : '<div class="empty-page">' + icon("file", "big") + "<h2>" + (docs.length ? "No matching documents" : "No documents yet") + "</h2>" +
                  '<p class="muted">' + (docs.length ? "Try a different search or category." : data.canManage ? "Upload the first one with <strong>Upload document</strong>." : "Check back soon.") + "</p></div>";
            $$(".ack-bar [data-pct]").forEach(function (b) { b.style.width = b.dataset.pct + "%"; });
        }

        root.addEventListener("click", async function (e) {
            const cat = e.target.closest("[data-cat]");
            if (cat) { category = cat.dataset.cat; return draw(); }
            if (e.target.closest("#show-pending")) { category = "__pending"; return draw(); }
            if (e.target.closest("#upload-doc")) return openDocumentForm(null, data.categories);
            const btn = e.target.closest("[data-act]");
            if (!btn) return;
            closeMenus();
            const d = docs.find(function (x) { return x.id === btn.closest("[data-id]").dataset.id; });
            const act = btn.dataset.act;
            if (act === "ack") return openAcknowledge(d);
            if (act === "edit") return openDocumentForm(d, data.categories);
            if (act === "replace") return openReplaceFile(d);
            if (act === "acks") return openAcknowledgements(d);
            if (act === "delete") {
                if (!(await confirmDialog({ title: "Delete “" + d.title + "”?", message: "The document and its acknowledgements will be removed for everyone.", confirmLabel: "Delete", danger: true }))) return;
                try {
                    await api("/api/documents/" + d.id + "/delete", {});
                    toast("Document deleted.");
                    render();
                } catch (err) { toast(err.message); }
            }
        });
        $("#doc-search").addEventListener("input", draw);
        draw();
    }

    // Sends a file as the raw request body, with progress.
    function uploadFile(url, file, meta, onProgress) {
        return new Promise(function (resolve, reject) {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", url);
            xhr.setRequestHeader("Content-Type", "application/octet-stream");
            xhr.setRequestHeader("X-Document", encodeURIComponent(JSON.stringify(Object.assign({ fileName: file.name }, meta))));
            xhr.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
            xhr.onload = function () {
                let body = {};
                try { body = JSON.parse(xhr.responseText); } catch (e) { /* ignore */ }
                if (xhr.status === 401) { window.location.href = "/login"; return; }
                if (xhr.status >= 200 && xhr.status < 300) resolve(body);
                else reject(new Error(body.error || "Upload failed. Please try again."));
            };
            xhr.onerror = function () { reject(new Error("Upload failed. Check your connection and try again.")); };
            xhr.send(file);
        });
    }

    function fileDropField(id) {
        return '<label class="drop-zone" for="' + id + '">' + icon("upload") +
            '<span class="dz-text"><strong>Choose a file</strong> or drag it here</span>' +
            '<span class="muted small dz-hint">PDF, Word, Excel, PowerPoint, text, CSV or image · up to 20 MB</span>' +
            '<input type="file" id="' + id + '" accept="' + ACCEPT + '" hidden></label>' +
            '<div class="upload-progress" hidden><span></span></div>';
    }

    function wireDropZone(el, input, onFile) {
        const zone = $(".drop-zone", el);
        ["dragenter", "dragover"].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.add("dragging"); }); });
        ["dragleave", "drop"].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.remove("dragging"); }); });
        zone.addEventListener("drop", function (e) { if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });
        input.addEventListener("change", function () { if (input.files[0]) onFile(input.files[0]); });
    }

    function showProgress(el, pct) {
        const bar = $(".upload-progress", el);
        bar.hidden = false;
        $("span", bar).style.width = pct + "%";
    }

    function openDocumentForm(d, categories) {
        const v = d || { title: "", description: "", category: "Policies", companies: [], requiresAck: false };
        let file = null;
        const m = openModal(
            '<h2 class="modal-title">' + (d ? "Edit document" : "Upload document") + "</h2>" +
            '<form novalidate id="doc-form">' +
            (d ? "" : fileDropField("doc-file")) +
            '<label for="doc-title">Title</label><input type="text" id="doc-title" maxlength="150" value="' + esc(v.title) + '">' +
            '<label for="doc-desc">Description <span class="muted small">(optional)</span></label><textarea id="doc-desc" rows="3" maxlength="1000">' + esc(v.description) + "</textarea>" +
            '<label for="doc-cat">Category</label><select id="doc-cat">' + categories.map(function (c) {
                return '<option' + (c === v.category ? " selected" : "") + ">" + esc(c) + "</option>";
            }).join("") + "</select>" +
            audienceField(v.companies) +
            '<label class="inline-check option-row"><input type="checkbox" id="doc-ack"' + (v.requiresAck ? " checked" : "") +
            "> Staff must read and acknowledge this</label>" +
            '<p class="hint">They\'ll see it on their home page until they confirm they\'ve read it. Uploading a new version asks everyone again.</p>' +
            '<div class="form-error" id="doc-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
            '<button type="submit" class="btn btn-primary" id="doc-save">' + (d ? "Save changes" : "Upload") + "</button></div></form>",
            { wide: true }
        );
        if (!d) {
            wireDropZone(m.el, $("#doc-file", m.el), function (f) {
                file = f;
                $(".dz-text", m.el).innerHTML = "<strong>" + esc(f.name) + "</strong> · " + fileSize(f.size);
                if (!$("#doc-title", m.el).value.trim()) $("#doc-title", m.el).value = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
            });
        }
        $("#doc-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            formError($("#doc-error", m.el), "");
            const meta = {
                title: $("#doc-title", m.el).value,
                description: $("#doc-desc", m.el).value,
                category: $("#doc-cat", m.el).value,
                companies: readAudience(m.el),
                requiresAck: $("#doc-ack", m.el).checked,
            };
            if (!d && !file) return formError($("#doc-error", m.el), "Choose a file to upload.");
            if (!meta.title.trim()) return formError($("#doc-error", m.el), "Give the document a title.");
            $("#doc-save", m.el).disabled = true;
            try {
                if (d) await api("/api/documents/" + d.id, meta);
                else await uploadFile("/api/documents/upload", file, meta, function (pct) { showProgress(m.el, pct); });
                closeModal();
                toast(d ? "Document updated." : "Document uploaded.");
                render();
            } catch (err) {
                formError($("#doc-error", m.el), err.message);
                $("#doc-save", m.el).disabled = false;
            }
        });
    }

    function openReplaceFile(d) {
        let file = null;
        const m = openModal(
            '<h2 class="modal-title">Upload a new version</h2>' +
            '<p class="muted">Replaces the file for “' + esc(d.title) + "” (currently " + esc(d.file.name) + ")." +
            (d.requiresAck ? " Everyone will be asked to acknowledge the new version." : "") + "</p>" +
            fileDropField("rep-file") +
            '<div class="form-error" id="rep-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
            '<button type="button" class="btn btn-primary" id="rep-save">Upload new version</button></div>'
        );
        wireDropZone(m.el, $("#rep-file", m.el), function (f) {
            file = f;
            $(".dz-text", m.el).innerHTML = "<strong>" + esc(f.name) + "</strong> · " + fileSize(f.size);
        });
        $("#rep-save", m.el).addEventListener("click", async function () {
            if (!file) return formError($("#rep-error", m.el), "Choose a file to upload.");
            $("#rep-save", m.el).disabled = true;
            try {
                await uploadFile("/api/documents/" + d.id + "/file", file, {}, function (pct) { showProgress(m.el, pct); });
                closeModal();
                toast("New version uploaded.");
                render();
            } catch (err) {
                formError($("#rep-error", m.el), err.message);
                $("#rep-save", m.el).disabled = false;
            }
        });
    }

    function openAcknowledge(d) {
        const m = openModal(
            '<div class="success-mark">' + icon("file") + "</div>" +
            '<h2 class="modal-title center">' + esc(d.title) + "</h2>" +
            '<p class="muted center">Please read this document in full, then confirm below.</p>' +
            '<div class="center btn-row ack-open">' +
            (d.file.inline ? '<a class="btn btn-ghost" href="/api/documents/' + d.id + '/file" target="_blank" rel="noopener">' + icon("eye") + "Open document</a>" : "") +
            '<a class="btn btn-ghost" href="/api/documents/' + d.id + '/file?download=1">' + icon("download") + "Download</a></div>" +
            '<label class="inline-check ack-confirm"><input type="checkbox" id="ack-check"> I have read and understood this document.</label>' +
            '<div class="form-error" id="ack-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Not yet</button>' +
            '<button type="button" class="btn btn-primary" id="ack-go" disabled>Acknowledge</button></div>'
        );
        $("#ack-check", m.el).addEventListener("change", function (e) { $("#ack-go", m.el).disabled = !e.target.checked; });
        $("#ack-go", m.el).addEventListener("click", async function () {
            try {
                const r = await api("/api/documents/" + d.id + "/acknowledge", {});
                state.me = r.user;
                renderChrome();
                closeModal();
                toast("Thanks — acknowledgement recorded.");
                render();
            } catch (err) { formError($("#ack-error", m.el), err.message); }
        });
    }

    async function openAcknowledgements(d) {
        const data = await api("/api/documents/" + d.id + "/acknowledgements");
        const done = data.people.filter(function (p) { return p.acknowledgedAt; });
        const waiting = data.people.filter(function (p) { return !p.acknowledgedAt; });
        const row = function (p) {
            return '<li class="ack-row">' + avatar(p, "sm") + '<div class="ack-who"><div class="emp-name">' + esc(p.displayName) + '</div><div class="muted small">' + esc(p.jobTitle) + "</div></div>" +
                (p.acknowledgedAt ? '<span class="badge badge-green">' + esc(fmtDate(p.acknowledgedAt)) + "</span>" : '<span class="badge badge-yellow">Not yet</span>') + "</li>";
        };
        openModal(
            '<h2 class="modal-title">Who has acknowledged</h2>' +
            '<p class="muted">' + esc(d.title) + (data.version > 1 ? " · version " + data.version : "") + " · " + done.length + " of " + data.people.length + " people</p>" +
            (waiting.length ? '<h3 class="detail-head">Still to acknowledge (' + waiting.length + ")</h3><ul class=\"ack-list\">" + waiting.map(row).join("") + "</ul>" : "") +
            (done.length ? '<h3 class="detail-head">Acknowledged (' + done.length + ")</h3><ul class=\"ack-list\">" + done.map(row).join("") + "</ul>" : "") +
            (data.people.length ? "" : '<p class="muted">No staff are in this document\'s audience yet.</p>') +
            '<div class="modal-actions"><button type="button" class="btn btn-primary" data-close>Done</button></div>'
        );
    }

    // ================= Settings =================

    async function refreshMe() {
        state.me = (await api("/api/me")).user;
        renderChrome();
    }

    async function resizeImage(file) {
        const url = URL.createObjectURL(file);
        try {
            const img = new Image();
            img.src = url;
            await img.decode();
            const size = 320;
            const s = Math.min(img.naturalWidth, img.naturalHeight);
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
            return canvas.toDataURL("image/jpeg", 0.88);
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    function viewSettings(root) {
        const me = state.me;

        root.innerHTML =
            '<div class="page-head"><div><h1>Settings</h1><p class="muted">Your profile, how the portal looks and your password.</p></div></div>' +
            '<div class="settings-layout">' +
            '<nav class="settings-nav" role="tablist" aria-label="Settings">' +
            '<button type="button" role="tab" data-tab="profile">' + icon("user") + "<span>Profile</span></button>" +
            '<button type="button" role="tab" data-tab="appearance">' + icon("palette") + "<span>Appearance</span></button>" +
            '<button type="button" role="tab" data-tab="security">' + icon("lock") + "<span>Security</span></button>" +
            "</nav>" +
            '<div class="settings-body">' +

            '<div data-pane="profile" class="settings-grid">' +
            '<section class="panel"><h2 class="panel-title">Profile picture</h2>' +
            '<div class="avatar-edit">' + avatar(me, "xl") + "<div>" +
            '<div class="btn-row"><label class="btn btn-primary" for="avatar-file">' + icon("camera") + "Upload photo</label>" +
            (me.avatarUrl ? '<button type="button" class="btn btn-ghost" id="avatar-remove">Remove</button>' : "") + "</div>" +
            '<input type="file" id="avatar-file" accept="image/png,image/jpeg,image/webp" hidden>' +
            '<p class="hint">JPG, PNG or WebP. Your photo will be cropped to a square.</p></div></div></section>' +

            '<section class="panel"><h2 class="panel-title">Basic information</h2>' +
            '<form id="profile-form" novalidate>' +
            '<label for="p-display">Display name</label><input type="text" id="p-display" maxlength="80" value="' + esc(me.displayName) + '">' +
            '<label for="p-phone">Phone</label><input type="tel" id="p-phone" maxlength="40" value="' + esc(me.phone) + '">' +
            '<div class="grid-2"><div><label for="p-location">Location</label><input type="text" id="p-location" maxlength="80" value="' + esc(me.location) + '" placeholder="e.g. Manchester, UK"></div>' +
            '<div><label for="p-tz">Time zone</label><select id="p-tz">' + timezoneOptions(me.timezone || state.meta.defaultTimezone) + "</select></div></div>" +
            '<p class="hint">Your location and time zone are shown on your home page and in the staff directory.</p>' +
            '<div class="form-error" id="p-error" hidden></div>' +
            '<div class="form-actions"><button type="submit" class="btn btn-primary" id="p-save">Save changes</button></div>' +
            "</form></section>" +

            '<section class="panel span-2"><h2 class="panel-title">Employment details</h2>' +
            '<dl class="facts">' +
            (me.system ? "" : "<dt>Name</dt><dd>" + esc(me.firstName + " " + me.lastName) + "</dd>") +
            "<dt>Roles</dt><dd>" + rolesHtml(me) + "</dd>" +
            "<dt>Sign-in</dt><dd>" + esc(me.username) + "</dd>" +
            (me.emails.length ? "<dt>Email</dt><dd>" + me.emails.map(function (e) {
                return esc(e.address) + (e.primary ? ' <span class="badge badge-grey">Login</span>' : "");
            }).join("<br>") + "</dd>" : "") +
            "</dl>" +
            '<p class="hint">These details are managed by HR. Contact them if anything needs changing.</p></section>' +
            "</div>" +

            '<div data-pane="appearance" hidden><section class="panel"><h2 class="panel-title">' + icon("palette") + "Theme</h2>" +
            '<p class="muted small">Choose how the portal looks for you. Your theme is saved to your account, so it follows you to any device.</p>' +
            '<div class="theme-grid" role="radiogroup" aria-label="Theme">' + THEMES.map(function (t) {
                return '<button type="button" class="theme-option" role="radio" data-theme-key="' + t.key + '">' +
                    '<span class="theme-preview' + (t.dark ? " split" : "") + '"><span class="tp-bar"></span><span class="tp-card"></span><span class="tp-line"></span><span class="tp-dot"></span>' +
                    (t.dark ? '<span class="tp-half"></span>' : "") + "</span>" +
                    '<span class="theme-name"><span>' + esc(t.name) + "</span>" + icon("tick") + "</span></button>";
            }).join("") + "</div></section></div>" +

            '<div data-pane="security" hidden><section class="panel narrow-panel"><h2 class="panel-title">' + icon("lock") + "Change password</h2>" +
            (me.impersonatedBy ? '<p class="muted small">Passwords can\'t be changed while you\'re logged in as someone else.</p>' : "") +
            '<form id="pw-form" novalidate>' +
            '<label for="pw-current">Current password</label><input type="password" id="pw-current" autocomplete="current-password">' +
            '<label for="pw-new">New password</label><input type="password" id="pw-new" autocomplete="new-password">' +
            '<label for="pw-confirm">Confirm new password</label><input type="password" id="pw-confirm" autocomplete="new-password">' +
            '<p class="hint">At least 8 characters.</p>' +
            '<div class="form-error" id="pw-error" hidden></div>' +
            '<div class="form-actions"><button type="submit" class="btn btn-primary" id="pw-save">Update password</button></div>' +
            "</form></section>" +
            '<section class="panel narrow-panel code-setup"><h2 class="panel-title">' + icon("shield") + "Sign-in code</h2>" +
            '<p class="muted small">The 6-digit code you enter after your password when you sign in.</p>' +
            (me.impersonatedBy ? '<p class="muted small">Codes can\'t be changed while you\'re logged in as someone else.</p>' : "") +
            '<form id="code-change-form" novalidate>' +
            '<label for="cc-password">Current password</label><input type="password" id="cc-password" autocomplete="current-password">' +
            '<div class="code-label">New code</div>' + codeBoxesHtml("cc-new", "New code") +
            '<div class="code-label">Type it again</div>' + codeBoxesHtml("cc-confirm", "Confirm code") +
            '<div class="form-error" id="cc-error" hidden></div>' +
            '<div class="form-actions"><button type="submit" class="btn btn-primary" id="cc-save">Update code</button></div>' +
            "</form></section></div>" +

            "</div></div>";

        const ccNew = wireCodeBoxes($("#cc-new"), function () { $("#cc-confirm input").focus(); });
        const ccConfirm = wireCodeBoxes($("#cc-confirm"));
        $("#code-change-form").addEventListener("submit", async function (e) {
            e.preventDefault();
            const err = $("#cc-error");
            formError(err, "");
            if (ccNew.value().length !== 6) return formError(err, "Enter all 6 digits of your new code.");
            if (ccNew.value() !== ccConfirm.value()) return formError(err, "The codes don\u2019t match.");
            $("#cc-save").disabled = true;
            try {
                state.me = (await api("/api/me/code", { code: ccNew.value(), currentPassword: $("#cc-password").value })).user;
                $("#cc-password").value = "";
                ccNew.clear();
                ccConfirm.clear();
                toast("Sign-in code updated.");
            } catch (ex) {
                formError(err, ex.message);
            }
            $("#cc-save").disabled = false;
        });

        // Tabs: #appearance and #security (or the older #password) open those tabs directly.
        function showTab(name) {
            $$(".settings-nav [data-tab]").forEach(function (b) {
                const on = b.dataset.tab === name;
                b.classList.toggle("active", on);
                b.setAttribute("aria-selected", String(on));
            });
            $$("[data-pane]").forEach(function (p) { p.hidden = p.dataset.pane !== name; });
        }
        const hash = window.location.hash.slice(1);
        showTab(hash === "appearance" ? "appearance" : hash === "security" || hash === "password" ? "security" : "profile");
        $(".settings-nav").addEventListener("click", function (e) {
            const b = e.target.closest("[data-tab]");
            if (!b) return;
            showTab(b.dataset.tab);
            history.replaceState({}, "", "/settings" + (b.dataset.tab === "profile" ? "" : "#" + b.dataset.tab));
        });

        // Theme previews are painted from the catalogue (inline styles aren't allowed by the CSP).
        $$(".theme-option").forEach(function (btn) {
            const t = THEMES.find(function (x) { return x.key === btn.dataset.themeKey; });
            const paint = function (scope, c) {
                $(".tp-bar", scope).style.background = "linear-gradient(90deg,#e97de8 0 14%,#5514b4 14% 26%,#e3e65b 26% 31%,#3e9ba3 31% 49%,#7a1f6c 49% 57%,#c2306b 57% 66%,#5fae7b 66% 78%,#1c2135 78%)";
                scope.style.background = c[0];
                $(".tp-card", scope).style.background = c[1];
                $(".tp-dot", scope).style.background = c[2];
                $(".tp-line", scope).style.background = c[3];
            };
            const preview = $(".theme-preview", btn);
            paint(preview, t.preview);
            if (t.dark) $(".tp-half", btn).style.background = "linear-gradient(" + t.dark[0] + "," + t.dark[0] + ")";
        });
        function markTheme() {
            $$(".theme-option").forEach(function (btn) {
                const on = btn.dataset.themeKey === (state.me.theme || "light");
                btn.classList.toggle("active", on);
                btn.setAttribute("aria-checked", String(on));
                $(".theme-name .icon", btn).style.visibility = on ? "visible" : "hidden";
            });
        }
        markTheme();
        $(".theme-grid").addEventListener("click", async function (e) {
            const btn = e.target.closest("[data-theme-key]");
            if (!btn) return;
            const previous = state.me.theme;
            state.me.theme = btn.dataset.themeKey;
            applyTheme(state.me.theme);
            markTheme();
            try {
                state.me = (await api("/api/me/theme", { theme: btn.dataset.themeKey })).user;
            } catch (err) {
                state.me.theme = previous;
                applyTheme(previous);
                markTheme();
                toast(err.message);
            }
        });

        $("#avatar-file").addEventListener("change", async function (e) {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const image = await resizeImage(file);
                state.me = (await api("/api/me/avatar", { image: image })).user;
                renderChrome();
                viewSettings(root);
                toast("Profile picture updated.");
            } catch (err) {
                toast(err.message === "The source image cannot be decoded." ? "That image couldn't be read. Try a JPG or PNG." : err.message);
            }
        });

        if ($("#avatar-remove")) {
            $("#avatar-remove").addEventListener("click", async function () {
                state.me = (await api("/api/me/avatar/remove", {})).user;
                renderChrome();
                viewSettings(root);
                toast("Profile picture removed.");
            });
        }

        $("#profile-form").addEventListener("submit", async function (e) {
            e.preventDefault();
            formError($("#p-error"), "");
            $("#p-save").disabled = true;
            try {
                state.me = (await api("/api/me/profile", {
                    displayName: $("#p-display").value,
                    phone: $("#p-phone").value,
                    location: $("#p-location").value,
                    timezone: $("#p-tz").value,
                })).user;
                renderChrome();
                toast("Profile saved.");
            } catch (err) {
                formError($("#p-error"), err.message);
            }
            $("#p-save").disabled = false;
        });

        $("#pw-form").addEventListener("submit", async function (e) {
            e.preventDefault();
            const err = $("#pw-error");
            formError(err, "");
            const next = $("#pw-new").value;
            if (next.length < 8) return formError(err, "New password must be at least 8 characters.");
            if (next !== $("#pw-confirm").value) return formError(err, "New passwords don't match.");
            $("#pw-save").disabled = true;
            try {
                state.me = (await api("/api/me/password", { currentPassword: $("#pw-current").value, newPassword: next })).user;
                $("#pw-form").reset();
                toast("Password updated.");
            } catch (ex) {
                formError(err, ex.message);
            }
            $("#pw-save").disabled = false;
        });
    }

    // ================= System Admin (owner only) =================

    function viewNoSystemAccess(root) {
        root.innerHTML = '<div class="empty-page">' + icon("lock", "big") + "<h1>No access</h1>" +
            '<p class="muted">System Admin is only available to the system owner.</p>' +
            '<a class="btn btn-primary" href="/home" data-link>Back to home</a></div>';
    }

    function timeAgo(iso) {
        const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
        if (secs < 60) return "just now";
        const mins = Math.round(secs / 60);
        if (mins < 60) return mins + " min ago";
        const hrs = Math.round(mins / 60);
        if (hrs < 24) return hrs + (hrs === 1 ? " hour ago" : " hours ago");
        return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    }

    function deviceName(ua) {
        ua = ua || "";
        const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
        const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
        return browser + (os ? " on " + os : "");
    }

    // Activity log wording and filter groups, keyed by the action recorded on the server.
    const AUDIT_ACTIONS = {
        "signed-in": ["signed in", "signin"],
        "signed-out": ["signed out", "signin"],
        "sign-in-failed": ["failed to sign in", "signin"],
        "sign-in-blocked": ["was blocked after too many failed sign-ins", "signin"],
        "password-changed": ["changed their password", "accounts"],
        "code-set": ["set their sign-in code", "accounts"],
        "code-changed": ["changed their sign-in code", "accounts"],
        "code-reset": ["reset the sign-in code for", "accounts"],
        "sign-in-code-failed": ["entered a wrong sign-in code", "signin"],
        "login-created": ["created a login for", "accounts"],
        "password-reset": ["reset the password for", "accounts"],
        "login-disabled": ["disabled the login for", "accounts"],
        "login-enabled": ["enabled the login for", "accounts"],
        "employee-added": ["added employee", "staff"],
        "employee-updated": ["updated employee", "staff"],
        "employee-deleted": ["deleted employee", "staff"],
        "access-rules-changed": ["changed the Employee Management access rules", "staff"],
        "profile-updated": ["updated their profile", "profiles"],
        "photo-updated": ["changed their profile picture", "profiles"],
        "photo-removed": ["removed their profile picture", "profiles"],
        "theme-changed": ["changed their theme to", "profiles"],
        "announcement-posted": ["posted the announcement", "workplace"],
        "announcement-updated": ["edited the announcement", "workplace"],
        "announcement-deleted": ["deleted the announcement", "workplace"],
        "document-uploaded": ["uploaded the document", "workplace"],
        "document-updated": ["edited the document", "workplace"],
        "document-replaced": ["uploaded a new version of", "workplace"],
        "document-deleted": ["deleted the document", "workplace"],
        "document-acknowledged": ["acknowledged", "workplace"],
        "panel-unlocked": ["unlocked System Admin", "system"],
        "pin-failed": ["entered a wrong System Admin PIN", "system"],
        "pin-changed": ["changed the System Admin PIN", "system"],
        "system-admin-denied": ["tried to open System Admin without access", "system"],
        "logged-in-as": ["logged in as", "system"],
        "returned-from": ["returned from being logged in as", "system"],
        "session-ended": ["ended a session for", "system"],
        "force-logout-others": ["logged out everyone else", "system"],
        "force-logout-all": ["force logged out everyone", "system"],
    };
    const AUDIT_FILTERS = [
        ["", "All activity"],
        ["signin", "Sign-ins"],
        ["accounts", "Logins & passwords"],
        ["staff", "Staff records"],
        ["profiles", "Profiles"],
        ["workplace", "Announcements & documents"],
        ["system", "System Admin"],
    ];

    function auditTime(iso) {
        return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }

    function viewSystemPin(root) {
        root.innerHTML =
            '<div class="force-wrap"><div class="force-card">' +
            '<div class="success-mark">' + icon("shield") + "</div>" +
            '<h1 class="center">System Admin</h1>' +
            '<p class="muted center">Enter the master system PIN to continue.</p>' +
            '<form id="pin-form" novalidate>' +
            '<input type="password" id="pin" class="pin-input" inputmode="numeric" autocomplete="off" maxlength="8" aria-label="System PIN" autofocus>' +
            '<div class="form-error" id="pin-error" hidden></div>' +
            '<button type="submit" class="btn btn-primary btn-block" id="pin-go">Unlock</button>' +
            "</form></div></div>";
        $("#pin").addEventListener("input", function (e) { e.target.value = e.target.value.replace(/\D/g, ""); });
        $("#pin-form").addEventListener("submit", async function (e) {
            e.preventDefault();
            formError($("#pin-error"), "");
            $("#pin-go").disabled = true;
            try {
                await api("/api/system/unlock", { pin: $("#pin").value });
                render();
            } catch (err) {
                formError($("#pin-error"), err.message);
                $("#pin").value = "";
                $("#pin").focus();
                $("#pin-go").disabled = false;
            }
        });
    }

    async function viewSystem(root, current) {
        let data;
        try {
            const res = await fetch("/api/system/overview", { headers: { Accept: "application/json" } });
            const body = await res.json().catch(function () { return {}; });
            if (res.status === 403 && body.code === "PIN_REQUIRED") return viewSystemPin(root);
            if (res.status === 401) { window.location.href = "/login"; return; }
            if (!res.ok) throw new Error(body.error || "Couldn't load System Admin.");
            data = body;
        } catch (err) {
            root.innerHTML = '<div class="empty">' + esc(err.message) + "</div>";
            return;
        }
        if (!current()) return;

        const others = data.sessions.filter(function (s) { return !s.current; }).length;

        root.innerHTML =
            '<div class="page-head"><div><h1>System Admin</h1><p class="muted">Sessions, user access, security and a full activity log for the whole portal.</p></div>' +
            '<div class="page-actions"><button type="button" class="btn btn-ghost" id="sys-refresh">Refresh</button>' +
            '<button type="button" class="btn btn-dark" id="sys-lock">' + icon("lock") + "Lock</button></div></div>" +

            '<div class="stat-row">' +
            '<div class="stat"><div class="stat-value">' + data.sessions.length + '</div><div class="stat-label">Active sessions</div></div>' +
            '<div class="stat"><div class="stat-value">' + new Set(data.sessions.map(function (s) { return s.personId; })).size + '</div><div class="stat-label">People signed in</div></div>' +
            '<div class="stat"><div class="stat-value">' + data.users.filter(function (u) { return u.account === "active"; }).length + '</div><div class="stat-label">Active logins</div></div>' +
            "</div>" +

            '<section class="panel sys-section"><div class="panel-head"><h2 class="panel-title">' + icon("power") + 'Active sessions</h2><div class="btn-row">' +
            '<button type="button" class="btn btn-ghost btn-small" id="sys-logout-others"' + (others ? "" : " disabled") + ">Log out everyone else</button>" +
            '<button type="button" class="btn btn-danger btn-small" id="sys-logout-all">' + icon("power") + "Force log out everyone</button></div></div>" +
            '<div class="table-card flat"><table class="table"><thead><tr><th>User</th><th>Device</th><th>IP address</th><th>Signed in</th><th>Last active</th><th class="col-actions"></th></tr></thead><tbody>' +
            data.sessions.map(function (s) {
                return "<tr>" +
                    '<td><div class="emp-cell">' + avatar({ id: s.personId, displayName: s.displayName, avatarUrl: s.avatarUrl }, "sm") +
                    '<div><div class="emp-name">' + esc(s.displayName) + (s.current ? ' <span class="badge badge-green">This session</span>' : "") + "</div>" +
                    '<div class="muted small">' + esc(s.username) + (s.impersonatedBy ? " · logged in as by " + esc(s.impersonatedBy) : "") + "</div></div></div></td>" +
                    '<td data-label="Device">' + esc(deviceName(s.userAgent)) + "</td>" +
                    '<td data-label="IP address" class="mono small">' + esc(s.ip) + "</td>" +
                    '<td data-label="Signed in">' + esc(timeAgo(s.createdAt)) + "</td>" +
                    '<td data-label="Last active">' + esc(timeAgo(s.lastSeen)) + "</td>" +
                    '<td class="col-actions">' + (s.current ? "" : '<button type="button" class="btn btn-ghost btn-small" data-end="' + s.id + '">End</button>') + "</td></tr>";
            }).join("") + "</tbody></table></div></section>" +

            '<section class="panel sys-section"><div class="panel-head"><h2 class="panel-title">' + icon("login") + "Log in as</h2></div>" +
            '<p class="muted small">Open the portal as another user without their password. You\'ll see a banner the whole time, and can return to your own account from it.</p>' +
            '<label class="search sys-search">' + icon("search") + '<input type="search" id="sys-user-search" placeholder="Search users" aria-label="Search users"></label>' +
            '<div class="user-pick" id="sys-users"></div></section>' +

            '<section class="panel sys-section"><div class="panel-head"><h2 class="panel-title">' + icon("activity") + "Activity log</h2>" +
            '<span class="muted small" id="audit-count"></span></div>' +
            '<p class="muted small">Every action taken across the portal: sign-ins, password and login changes, staff record changes, profile updates and System Admin actions.</p>' +
            '<div class="toolbar audit-tools"><label class="search">' + icon("search") + '<input type="search" id="audit-search" placeholder="Search by person, action or IP address" aria-label="Search activity"></label>' +
            '<select id="audit-filter" aria-label="Filter activity">' + AUDIT_FILTERS.map(function (f) { return '<option value="' + f[0] + '">' + f[1] + "</option>"; }).join("") + "</select></div>" +
            '<div class="table-card flat audit-table"><table class="table"><thead><tr><th>When</th><th>Who</th><th>What</th><th>IP address</th></tr></thead><tbody id="audit-body"></tbody></table></div>' +
            '<button type="button" class="btn btn-ghost btn-small audit-more" id="audit-more" hidden>Show more</button>' +
            "</section>" +

            '<section class="panel sys-section sys-pin"><h2 class="panel-title">' + icon("key") + "Change System Admin PIN</h2>" +
            '<form id="sys-pin-form" novalidate>' +
            '<div class="grid-2"><div><label for="sp-current">Current PIN</label><input type="password" id="sp-current" inputmode="numeric" maxlength="8" autocomplete="off"></div>' +
            '<div><label for="sp-new">New PIN</label><input type="password" id="sp-new" inputmode="numeric" maxlength="8" autocomplete="off"></div></div>' +
            '<p class="hint">4 to 8 digits.</p><div class="form-error" id="sp-error" hidden></div>' +
            '<div class="form-actions"><button type="submit" class="btn btn-primary">Update PIN</button></div></form></section>' +

            "";

        function drawUsers() {
            const q = $("#sys-user-search").value.trim().toLowerCase();
            const list = data.users.filter(function (u) {
                return !q || [u.displayName, u.username, u.jobTitle, u.company].join(" ").toLowerCase().indexOf(q) !== -1;
            });
            $("#sys-users").innerHTML = list.length ? list.map(function (u) {
                const can = u.account === "active";
                return '<div class="user-pick-row"><div class="emp-cell">' + avatar(u, "sm") + '<div><div class="emp-name">' + esc(u.displayName) +
                    (u.system ? ' <span class="badge">System account</span>' : "") + '</div><div class="muted small">' + esc(u.username || "No email") + " · " + esc(u.jobTitle) + "</div></div></div>" +
                    (can ? '<button type="button" class="btn btn-ghost btn-small" data-as="' + u.id + '">' + icon("login") + "Log in as</button>"
                        : '<span class="muted small">' + (u.account === "disabled" ? "Login disabled" : "No login account") + "</span>") + "</div>";
            }).join("") : '<p class="muted small">No users match.</p>';
        }

        const reload = function () { render(); };
        $("#sys-user-search").addEventListener("input", drawUsers);
        $("#sys-refresh").addEventListener("click", reload);
        $("#sys-lock").addEventListener("click", async function () {
            await api("/api/system/lock", {});
            viewSystemPin(root);
        });

        root.addEventListener("click", async function handler(e) {
            if (!document.body.contains(root) || !$("#sys-users")) return root.removeEventListener("click", handler);
            const end = e.target.closest("[data-end]");
            const as = e.target.closest("[data-as]");
            try {
                if (end) {
                    await api("/api/system/sessions/" + end.dataset.end + "/end", {});
                    toast("Session ended.");
                    reload();
                } else if (as) {
                    const u = data.users.find(function (x) { return x.id === as.dataset.as; });
                    if (!(await confirmDialog({ title: "Log in as " + u.displayName + "?", message: "You'll see the portal exactly as they do. This is recorded in the activity log.", confirmLabel: "Log in as " + u.displayName }))) return;
                    await api("/api/system/impersonate/" + u.id, {});
                    window.location.href = "/home";
                } else if (e.target.closest("#sys-logout-others")) {
                    if (!(await confirmDialog({ title: "Log out everyone else?", message: "Every other session will be signed out straight away. You'll stay signed in.", confirmLabel: "Log out everyone else", danger: true }))) return;
                    const r = await api("/api/system/force-logout", { includeSelf: false });
                    toast(r.count + (r.count === 1 ? " session" : " sessions") + " signed out.");
                    reload();
                } else if (e.target.closest("#sys-logout-all")) {
                    if (!(await confirmDialog({ title: "Force log out everyone?", message: "Every session, including yours, will be disconnected straight away. Everyone will need to sign in again.", confirmLabel: "Log out everyone", danger: true }))) return;
                    await api("/api/system/force-logout", { includeSelf: true });
                    window.location.href = "/login";
                }
            } catch (err) {
                if (/PIN/.test(err.message)) return viewSystemPin(root);
                toast(err.message);
            }
        });

        $("#sys-pin-form").addEventListener("submit", async function (e) {
            e.preventDefault();
            formError($("#sp-error"), "");
            try {
                await api("/api/system/pin", { currentPin: $("#sp-current").value, newPin: $("#sp-new").value });
                $("#sys-pin-form").reset();
                toast("System PIN updated.");
            } catch (err) {
                formError($("#sp-error"), err.message);
            }
        });

        let auditShown = 100;
        function drawAudit() {
            const q = $("#audit-search").value.trim().toLowerCase();
            const cat = $("#audit-filter").value;
            const list = data.audit.filter(function (a) {
                const def = AUDIT_ACTIONS[a.action] || [a.action, "system"];
                if (cat && def[1] !== cat) return false;
                return !q || [a.actor, a.target, a.detail, a.ip, a.via, def[0]].join(" ").toLowerCase().indexOf(q) !== -1;
            });
            $("#audit-count").textContent = list.length + (list.length === 1 ? " entry" : " entries");
            $("#audit-body").innerHTML = list.length ? list.slice(0, auditShown).map(function (a) {
                const def = AUDIT_ACTIONS[a.action] || [a.action, "system"];
                const bad = /failed|blocked|denied/.test(a.action);
                return "<tr" + (bad ? ' class="audit-bad"' : "") + '><td class="nowrap small">' + esc(auditTime(a.at)) + "</td>" +
                    '<td data-label="Who"><strong>' + esc(a.actor || "System") + "</strong>" + (a.via ? '<div class="muted small">via log in as by ' + esc(a.via) + "</div>" : "") + "</td>" +
                    '<td data-label="What">' + esc(def[0]) + (a.target ? " <strong>" + esc(a.target) + "</strong>" : "") +
                    (a.detail ? '<div class="muted small">' + esc(a.detail) + "</div>" : "") + "</td>" +
                    '<td data-label="IP address" class="mono small">' + esc(a.ip || "") + "</td></tr>";
            }).join("") : '<tr><td colspan="4"><div class="empty">No matching activity.</div></td></tr>';
            $("#audit-more").hidden = list.length <= auditShown;
        }
        $("#audit-search").addEventListener("input", function () { auditShown = 100; drawAudit(); });
        $("#audit-filter").addEventListener("change", function () { auditShown = 100; drawAudit(); });
        $("#audit-more").addEventListener("click", function () { auditShown += 200; drawAudit(); });

        drawUsers();
        drawAudit();
    }

    // ================= First sign-in =================

    // Six single-digit boxes. Typing moves along; pasting fills them all.
    function codeBoxesHtml(id, label) {
        let html = '<div class="code-boxes" id="' + id + '" role="group" aria-label="' + esc(label) + '">';
        for (let i = 0; i < 6; i++) html += '<input type="password" inputmode="numeric" maxlength="1" autocomplete="off" aria-label="' + esc(label) + " digit " + (i + 1) + '">';
        return html + "</div>";
    }

    function wireCodeBoxes(container, onComplete) {
        const boxes = $$("input", container);
        const value = function () { return boxes.map(function (b) { return b.value; }).join(""); };
        const fill = function (text, from) {
            text.split("").forEach(function (d, j) {
                const b = boxes[from + j];
                if (b) { b.value = d; b.classList.add("filled"); }
            });
        };
        boxes.forEach(function (box, i) {
            box.addEventListener("input", function () {
                const digits = box.value.replace(/\D/g, "");
                if (digits.length > 1) fill(digits.slice(0, 6 - i), i); else box.value = digits;
                box.classList.toggle("filled", !!box.value);
                const next = boxes.find(function (b) { return !b.value; });
                if (box.value && next) next.focus();
                if (value().length === 6 && onComplete) onComplete();
            });
            box.addEventListener("keydown", function (e) {
                if (e.key === "Backspace" && !box.value && i > 0) {
                    boxes[i - 1].value = "";
                    boxes[i - 1].classList.remove("filled");
                    boxes[i - 1].focus();
                    e.preventDefault();
                }
            });
            box.addEventListener("paste", function (e) {
                const text = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
                if (!text) return;
                e.preventDefault();
                fill(text, 0);
                (boxes[text.length] || boxes[5]).focus();
                if (value().length === 6 && onComplete) onComplete();
            });
        });
        return {
            value: value,
            clear: function () { boxes.forEach(function (b) { b.value = ""; b.classList.remove("filled"); }); },
            focus: function () { boxes[0].focus(); },
        };
    }

    // Everyone sets a 6-digit sign-in code, asked for after their password each time they sign in.
    function viewSetCode(root) {
        const me = state.me;
        root.innerHTML =
            '<div class="force-wrap"><div class="force-card code-setup">' +
            '<div class="success-mark">' + icon("shield") + "</div>" +
            '<h1 class="center">Set your sign-in code</h1>' +
            '<p class="muted center">' + esc(me.firstName || me.displayName) + ", the portal now asks for a personal 6-digit code as well as your password each time you sign in. Choose one you\u2019ll remember.</p>" +
            '<form id="setcode-form" novalidate>' +
            '<div class="code-label">Choose a 6-digit code</div>' + codeBoxesHtml("sc-new", "New code") +
            '<div class="code-label">Type it again</div>' + codeBoxesHtml("sc-confirm", "Confirm code") +
            '<p class="hint">Avoid easy codes like 123456 or 000000, and don\u2019t reuse a bank PIN.</p>' +
            '<div class="form-error" id="sc-error" hidden></div>' +
            '<button type="submit" class="btn btn-primary btn-block" id="sc-save">Save code and continue</button>' +
            "</form>" +
            '<p class="center small"><button type="button" class="btn btn-link" data-action="logout">Sign out</button></p>' +
            "</div></div>";
        const first = wireCodeBoxes($("#sc-new"), function () { $("#sc-confirm input").focus(); });
        const second = wireCodeBoxes($("#sc-confirm"), function () { $("#setcode-form").requestSubmit(); });
        first.focus();
        $("#setcode-form").addEventListener("submit", async function (e) {
            e.preventDefault();
            const err = $("#sc-error");
            formError(err, "");
            if (first.value().length !== 6) return formError(err, "Enter all 6 digits of your new code.");
            if (first.value() !== second.value()) {
                second.clear();
                second.focus();
                return formError(err, "The codes don\u2019t match. Please type it again.");
            }
            $("#sc-save").disabled = true;
            try {
                state.me = (await api("/api/me/code", { code: first.value() })).user;
                if (!state.meta) state.meta = await api("/api/meta");
                renderChrome();
                navigate("/home", true);
                toast("Sign-in code saved. You\u2019ll be asked for it each time you sign in.");
            } catch (ex) {
                formError(err, ex.message);
                first.clear();
                second.clear();
                first.focus();
                $("#sc-save").disabled = false;
            }
        });
    }

    function viewForcePassword(root) {
        const me = state.me;
        root.innerHTML =
            '<div class="force-wrap"><div class="force-card">' +
            '<div class="success-mark">' + icon("lock") + "</div>" +
            '<h1 class="center">Welcome, ' + esc(me.firstName || me.displayName) + "</h1>" +
            '<p class="muted center">You signed in with a temporary password. Create your own password to continue.</p>' +
            '<form id="force-form" novalidate>' +
            '<label for="fp-new">New password</label><input type="password" id="fp-new" autocomplete="new-password" autofocus>' +
            '<label for="fp-confirm">Confirm new password</label><input type="password" id="fp-confirm" autocomplete="new-password">' +
            '<p class="hint">At least 8 characters.</p>' +
            '<div class="form-error" id="fp-error" hidden></div>' +
            '<button type="submit" class="btn btn-primary btn-block" id="fp-save">Set password and continue</button>' +
            "</form>" +
            '<p class="center small"><button type="button" class="btn btn-link" data-action="logout">Sign out</button></p>' +
            "</div></div>";

        $("#force-form").addEventListener("submit", async function (e) {
            e.preventDefault();
            const err = $("#fp-error");
            formError(err, "");
            const next = $("#fp-new").value;
            if (next.length < 8) return formError(err, "Password must be at least 8 characters.");
            if (next !== $("#fp-confirm").value) return formError(err, "Passwords don't match.");
            $("#fp-save").disabled = true;
            try {
                state.me = (await api("/api/me/password", { newPassword: next })).user;
                if (state.me.codeSetupRequired) return render();
                if (!state.meta) state.meta = await api("/api/meta");
                renderChrome();
                navigate("/home", true);
                toast("Password set. Welcome to the Staff Portal!");
            } catch (ex) {
                formError(err, ex.message);
                $("#fp-save").disabled = false;
            }
        });
    }

    // ================= Start =================

    async function start() {
        $("#year").textContent = new Date().getFullYear();
        try {
            state.me = (await api("/api/me")).user;
            applyTheme(state.me.theme);
            if (!state.me.passwordTemporary && !state.me.codeSetupRequired) state.meta = await api("/api/meta");
        } catch (e) {
            return;
        }
        renderChrome();
        document.body.classList.remove("app-loading");
        render();

        let justSignedIn = false;
        try { justSignedIn = sessionStorage.getItem("hn-just-signed-in") === "1"; sessionStorage.removeItem("hn-just-signed-in"); } catch (e) { /* ignore */ }
        const mainRole = (state.me.roles || []).find(function (r) { return r.main; });
        if (justSignedIn && mainRole && !state.me.system && !state.me.passwordTemporary && !state.me.codeSetupRequired) {
            toast("Signed in as " + mainRole.jobTitle + ", " + mainRole.company);
        }

        // Notice quickly if this session is ended from the system panel.
        setInterval(function () {
            if (document.hidden) return;
            api("/api/me").then(function (d) {
                const was = state.me;
                state.me = d.user;
                if (!!was.impersonatedBy !== !!d.user.impersonatedBy || was.id !== d.user.id) window.location.reload();
                if (was.unreadAnnouncements !== d.user.unreadAnnouncements || was.pendingAcks !== d.user.pendingAcks) {
                    const open = $(".menu:not([hidden])");
                    if (!open) renderChrome();
                }
            }).catch(function () {});
        }, 30000);
    }

    start();
})();
