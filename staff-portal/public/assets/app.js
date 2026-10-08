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
                { title: "Announcements", desc: "Group-wide news and updates", icon: "bell", soon: true },
                { title: "Documents & Policies", desc: "Handbooks, forms and templates", icon: "file", soon: true },
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
        const inner = '<span class="mi-icon">' + icon(it.icon) + '</span><span class="mi-text"><span class="mi-title">' + esc(it.title) +
            (it.soon ? ' <span class="soon">Soon</span>' : "") + '</span><span class="mi-desc">' + esc(it.desc) + "</span></span>";
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
                    "<span>" + esc(section.label) + "</span>" + icon("chevron", "chev") + "</button>" +
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
            '<a class="menu-item compact" role="menuitem" href="/settings" data-link>' + icon("user") + "<span>Profile &amp; settings</span></a>" +
            (me.isOwner && !me.impersonatedBy ? '<a class="menu-item compact" role="menuitem" href="/system" data-link>' + icon("shield") + "<span>System Admin</span></a>" : "") +
            '<a class="menu-item compact" role="menuitem" href="/settings#appearance" data-link>' + icon("palette") + "<span>Appearance</span></a>" +
            '<a class="menu-item compact" role="menuitem" href="/settings#password" data-link>' + icon("lock") + "<span>Change password</span></a>" +
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
    };

    function navigate(href, replace) {
        history[replace ? "replaceState" : "pushState"]({}, "", href);
        render();
    }

    window.addEventListener("popstate", render);

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
        document.body.classList.remove("locked");

        const path = window.location.pathname;
        let view = ROUTES[path];
        if (!view) return navigate("/home", true);
        if (path === "/employees" && !state.me.canManage) view = viewNoAccess;
        if (path === "/system" && (!state.me.isOwner || state.me.impersonatedBy)) view = viewNoSystemAccess;

        highlightNav();
        root.innerHTML = '<div class="loading">Loading…</div>';
        try {
            await view(root, function () { return seq === renderSeq; });
        } catch (err) {
            if (seq === renderSeq) root.innerHTML = '<div class="empty">' + esc(err.message) + "</div>";
        }
        if (seq !== renderSeq) return;
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
        backdrop.innerHTML = '<div class="modal' + (opts.wide ? " modal-wide" : "") + '" role="dialog" aria-modal="true">' +
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
            '<section class="hero">' +
            '<p class="eyebrow">' + clock(deviceTz, "date") + "</p>" +
            "<h1>" + esc(greeting) + ", " + esc(firstName) + "</h1>" +
            '<p class="muted">Everything you need across HN Group, in one place.</p></section>' +

            '<section class="clocks">' +
            '<div class="clock-card">' +
            '<div class="clock-head"><span class="clock-icon">' + icon("monitor") + '</span><div><div class="clock-label">Your local time</div>' +
            '<div class="clock-sub">' + esc(tzCity(deviceTz)) + " · " + clock(deviceTz, "zone") + "</div></div></div>" +
            '<div class="clock-time">' + clock(deviceTz, "time") + "</div>" +
            '<div class="clock-date">' + clock(deviceTz, "date") + "</div></div>" +

            '<div class="clock-card clock-card-alt">' +
            '<div class="clock-head"><span class="clock-icon">' + icon("pin") + '</span><div><div class="clock-label">' + esc(placeName) + "</div>" +
            '<div class="clock-sub">Your profile location · ' + clock(profileTz, "zone") + "</div></div></div>" +
            '<div class="clock-time">' + clock(profileTz, "time") + "</div>" +
            '<div class="clock-date">' + clock(profileTz, "date") + "</div>" +
            '<div class="clock-note">' + esc(tzDifference(profileTz)) +
            (me.location ? "" : ' · <a href="/settings" data-link>Set your location</a>') + "</div></div>" +
            "</section>" +

            '<div class="home-grid">' +
            '<section class="panel"><h2 class="section-title">Your details</h2>' +
            '<div class="me-card">' + avatar(me, "lg") + '<div><div class="me-name">' + esc(me.displayName) + "</div>" +
            '<div class="muted small">' + esc(me.jobTitle) + "</div>" + (me.isOwner ? '<span class="badge badge-owner">System owner</span>' : "") + "</div></div>" +
            rolesHtml(me) +
            (primaryEmail(me) ? '<dl class="facts"><dt>Email</dt><dd>' + esc(primaryEmail(me)) + "</dd></dl>" : "") +
            '<a class="btn btn-ghost btn-block-sm" href="/settings" data-link>Edit profile</a></section>' +
            '<section class="panel"><h2 class="section-title">Latest news</h2>' +
            '<article class="news"><h3>Welcome to the new Staff Portal</h3>' +
            '<p class="muted">This is the new home for HN Group staff. More tools will be added over the coming weeks.</p></article></section>' +
            '<section class="panel"><h2 class="section-title">Need help?</h2>' +
            '<p class="muted">For access problems or anything IT related, contact the IT team.</p></section>' +
            "</div>";
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

    // The signed-in user's roles: job title and supervisor at each company they work for.
    function rolesHtml(me) {
        return '<div class="role-list compact">' + (me.roles || []).map(function (r) {
            return '<div class="role-item"><div><div class="role-company">' + esc(r.company) + (r.main && me.roles.length > 1 ? ' <span class="badge">Main</span>' : "") + "</div>" +
                '<div class="small">' + esc(r.jobTitle) + '</div></div><div class="small muted">' + (r.supervisor ? "Reports to " + esc(r.supervisor.displayName) : "No supervisor") + "</div></div>";
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

    async function viewDirectory(root, current) {
        const data = await api("/api/directory");
        if (!current()) return;
        const people = data.people.sort(function (a, b) { return a.displayName.localeCompare(b.displayName); });
        const byId = {};
        people.forEach(function (p) { byId[p.id] = p; });
        let view = savedPref("hn-dir-view", "grid");
        if (!DIR_VIEWS.some(function (v) { return v.key === view; })) view = "grid";
        const collapsed = {};

        root.innerHTML =
            '<div class="page-head"><div><h1>Staff Directory</h1><p class="muted">Find colleagues and see how teams fit together across HN Group.</p></div>' +
            '<div class="segmented" role="tablist" aria-label="Directory view">' +
            DIR_VIEWS.map(function (v) {
                return '<button type="button" role="tab" data-view="' + v.key + '">' + icon(v.icon) + "<span>" + v.label + "</span></button>";
            }).join("") + "</div></div>" +
            '<div class="company-tabs" id="dir-companies" role="tablist" aria-label="Company">' +
            '<button type="button" data-company="">All companies <span class="tab-count">' + people.length + "</span></button>" +
            state.meta.companies.map(function (c) {
                const n = people.filter(function (p) { return worksAt(p, c); }).length;
                return '<button type="button" data-company="' + esc(c) + '">' + esc(c) + ' <span class="tab-count">' + n + "</span></button>";
            }).join("") + "</div>" +
            '<div class="toolbar">' +
            '<label class="search">' + icon("search") + '<input type="search" id="dir-search" placeholder="Search by name, job title, email or location" aria-label="Search"></label>' +
            "</div>" +
            '<p class="muted small" id="dir-count"></p>' +
            '<div id="dir-body"></div>';

        let company = "";

        function matches(p) {
            const q = $("#dir-search").value.trim().toLowerCase();
            if (company && !worksAt(p, company)) return false;
            if (!q) return true;
            const role = roleFor(p, company);
            return [p.displayName, p.firstName, p.lastName, role.jobTitle, p.jobTitle, p.location]
                .concat(companiesOf(p))
                .concat(p.emails.map(function (e) { return e.address; }))
                .join(" ").toLowerCase().indexOf(q) !== -1;
        }

        function card(p) {
            const role = roleFor(p, company);
            const sup = byId[role.supervisorId];
            return '<button type="button" class="person-card" data-person="' + p.id + '">' + avatar(p, "lg") +
                '<span class="pc-name">' + esc(p.displayName) + "</span>" +
                '<span class="pc-title">' + esc(role.jobTitle) + "</span>" +
                '<span class="pc-company">' + esc(role.company) +
                (!company && p.otherRoles && p.otherRoles.length ? ' <span class="count-pill">+' + p.otherRoles.length + "</span>" : "") + "</span>" +
                (sup ? '<span class="pc-reports">Reports to ' + esc(sup.displayName) + "</span>" : "") +
                '<span class="pc-meta">' + icon("clock") + clock(p.timezone, "short") + " · " + esc(p.location || tzCity(p.timezone)) + "</span>" +
                "</button>";
        }

        function row(p) {
            const role = roleFor(p, company);
            const sup = byId[role.supervisorId];
            const email = primaryEmail(p);
            return '<tr data-person="' + p.id + '" tabindex="0">' +
                '<td><div class="emp-cell">' + avatar(p, "sm") + '<div><div class="emp-name">' + esc(p.displayName) + ownerBadge(p) + '</div><div class="muted small">' + esc(role.jobTitle) + "</div></div></div></td>" +
                '<td data-label="Company">' + esc(role.company) + "</td>" +
                '<td data-label="Reports to">' + (sup ? esc(sup.displayName) : '<span class="muted">—</span>') + "</td>" +
                '<td data-label="Email">' + (email ? '<a href="mailto:' + esc(email) + '" data-stop>' + esc(email) + "</a>" : "") + "</td>" +
                '<td data-label="Local time" class="nowrap">' + clock(p.timezone, "short") + ' <span class="muted small">' + esc(p.location || tzCity(p.timezone)) + "</span></td>" +
                "</tr>";
        }

        // Builds the reporting tree for the selected company (or main roles for "All companies").
        function drawTree(list) {
            const inSet = {};
            list.forEach(function (p) { inSet[p.id] = true; });
            const kids = {};
            const roots = [];
            list.forEach(function (p) {
                const sup = roleFor(p, company).supervisorId;
                if (sup && inSet[sup] && sup !== p.id) (kids[sup] = kids[sup] || []).push(p);
                else roots.push(p);
            });
            // Anyone caught in a reporting loop can't be reached from the top, so show them as a root.
            const reached = {};
            (function reach(list) {
                list.forEach(function (p) {
                    if (reached[p.id]) return;
                    reached[p.id] = true;
                    reach(kids[p.id] || []);
                });
            })(roots);
            list.forEach(function (p) {
                if (!reached[p.id]) {
                    roots.push(p);
                    (function reach(x) {
                        if (reached[x.id]) return;
                        reached[x.id] = true;
                        (kids[x.id] || []).forEach(reach);
                    })(p);
                }
            });
            const placed = {};
            function node(p, depth) {
                if (placed[p.id] || depth > 50) return "";
                placed[p.id] = true;
                const role = roleFor(p, company);
                const children = (kids[p.id] || []).filter(function (c) { return !placed[c.id]; });
                const isCollapsed = collapsed[p.id];
                const childHtml = children.length && !isCollapsed ? "<ul>" + children.map(function (c) { return node(c, depth + 1); }).join("") + "</ul>" : "";
                return "<li>" +
                    '<div class="org-node' + (p.isOwner ? " is-owner" : "") + '">' +
                    '<button type="button" class="org-card" data-person="' + p.id + '">' + avatar(p, "md") +
                    '<span class="org-text"><span class="org-name">' + esc(p.displayName) + '</span><span class="org-title">' + esc(role.jobTitle) + "</span>" +
                    (company ? "" : '<span class="org-company">' + esc(role.company) + "</span>") + "</span></button>" +
                    (children.length ? '<button type="button" class="org-toggle" data-toggle="' + p.id + '" aria-label="' + (isCollapsed ? "Show" : "Hide") + " reports of " + esc(p.displayName) + '">' +
                        (isCollapsed ? "+" + children.length : "−") + "</button>" : "") +
                    "</div>" + childHtml + "</li>";
            }
            const html = roots.map(function (r) { return node(r, 0); }).join("");
            return '<div class="org-hint muted small">' + icon("tree") + "Showing reporting lines" + (company ? " within " + esc(company) : " for each person's main company") +
                ". Click a person for details, or −/+ to collapse a team.</div>" +
                '<div class="org-scroll"><div class="org"><ul class="org-roots">' + html + "</ul></div></div>";
        }

        function draw() {
            $$("[data-view]", root).forEach(function (b) {
                b.classList.toggle("active", b.dataset.view === view);
                b.setAttribute("aria-selected", String(b.dataset.view === view));
            });
            $$("#dir-companies [data-company]").forEach(function (b) { b.classList.toggle("active", b.dataset.company === company); });

            const list = people.filter(matches);
            $("#dir-count").textContent = list.length + (list.length === 1 ? " person" : " people") + (company ? " at " + company : "");
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
            const p = e.target.closest("[data-person]");
            if (p) openPersonModal(p.dataset.person, people, company);
        });
        root.addEventListener("keydown", function (e) {
            const tr = e.target.closest("tr[data-person]");
            if (tr && e.key === "Enter") openPersonModal(tr.dataset.person, people, company);
        });
        $("#dir-search").addEventListener("input", draw);
        draw();
    }

    // Shows someone's profile. `company` is the company being looked at (e.g. the directory
    // filter); their title and supervisor for that company are shown first when it applies.
    function openPersonModal(id, people, company) {
        const p = people.find(function (x) { return x.id === id; });
        if (!p) return;
        const byId = {};
        people.forEach(function (x) { byId[x.id] = x; });
        const ctx = company && worksAt(p, company) ? company : p.company;
        const role = roleFor(p, ctx);
        const supervisor = byId[role.supervisorId];
        const reports = people.filter(function (x) {
            if (company) return worksAt(x, company) && roleFor(x, company).supervisorId === p.id;
            return companiesOf(x).some(function (c) { return roleFor(x, c).supervisorId === p.id; });
        });
        const personLink = function (x) {
            return '<button type="button" class="person-chip" data-person="' + x.id + '">' + avatar(x, "xs") + "<span>" + esc(x.displayName) +
                '<span class="muted small"> · ' + esc(roleFor(x, ctx).jobTitle) + "</span></span></button>";
        };
        const allRoles = companiesOf(p).map(function (c) { return roleFor(p, c); });

        const m = openModal(
            '<div class="profile-head">' + avatar(p, "xl") + '<div><h2 class="modal-title">' + esc(p.displayName) + "</h2>" +
            '<div class="muted">' + esc(role.jobTitle) + " · " + esc(role.company) + "</div>" +
            (p.isOwner ? '<div class="chips"><span class="badge badge-owner">System owner</span></div>' : "") + "</div></div>" +
            '<div class="profile-body">' +
            '<div class="detail-row">' + icon("mail") + "<div>" + p.emails.map(function (e) {
                return '<a href="mailto:' + esc(e.address) + '">' + esc(e.address) + "</a>";
            }).join("<br>") + "</div></div>" +
            (p.phone ? '<div class="detail-row">' + icon("phone") + '<div><a href="tel:' + esc(p.phone.replace(/\s+/g, "")) + '">' + esc(p.phone) + "</a></div></div>" : "") +
            '<div class="detail-row">' + icon("pin") + "<div>" + esc(p.location || tzCity(p.timezone)) +
            '<div class="muted small">' + clock(p.timezone, "short") + " local time · " + esc(tzDifference(p.timezone)) + "</div></div></div>" +
            '<h3 class="detail-head">Reports to' + (allRoles.length > 1 ? " at " + esc(role.company) : "") + "</h3>" +
            (supervisor ? '<div class="chips">' + personLink(supervisor) + "</div>" : '<p class="muted small">No one</p>') +
            (reports.length ? '<h3 class="detail-head">Direct reports' + (company ? " at " + esc(company) : "") + '</h3><div class="chips">' + reports.map(personLink).join("") + "</div>" : "") +
            (allRoles.length > 1
                ? '<h3 class="detail-head">Roles across the group</h3><div class="role-list">' + allRoles.map(function (r) {
                    const s = byId[r.supervisorId];
                    return '<div class="role-item' + (r.company === role.company ? " current" : "") + '"><div><div class="role-company">' + esc(r.company) +
                        (r.main ? ' <span class="badge">Main</span>' : "") + '</div><div class="small">' + esc(r.jobTitle) + "</div></div>" +
                        '<div class="small muted">' + (s ? "Reports to " + esc(s.displayName) : "No supervisor") + "</div></div>";
                }).join("") + "</div>"
                : "") +
            "</div>"
        );
        m.el.addEventListener("click", function (e) {
            const chip = e.target.closest("[data-person]");
            if (chip) openPersonModal(chip.dataset.person, people, company);
        });
    }

    // ================= Employee management =================

    function accountBadge(emp) {
        if (!emp.account) return '<span class="badge badge-grey">No account</span>';
        if (!emp.account.enabled) return '<span class="badge badge-red">Disabled</span>';
        if (emp.account.passwordTemporary) return '<span class="badge badge-yellow">Awaiting first sign-in</span>';
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
            '<div class="page-head"><div><h1>Profile &amp; settings</h1><p class="muted">Manage how you appear to colleagues across HN Group.</p></div></div>' +
            '<section class="panel sys-section" id="appearance"><h2 class="panel-title">' + icon("palette") + "Appearance</h2>" +
            '<p class="muted small">Choose how the portal looks for you. Your theme is saved to your account, so it follows you to any device.</p>' +
            '<div class="theme-grid" role="radiogroup" aria-label="Theme">' + THEMES.map(function (t) {
                return '<button type="button" class="theme-option" role="radio" data-theme-key="' + t.key + '">' +
                    '<span class="theme-preview' + (t.dark ? " split" : "") + '"><span class="tp-bar"></span><span class="tp-card"></span><span class="tp-line"></span><span class="tp-dot"></span>' +
                    (t.dark ? '<span class="tp-half"></span>' : "") + "</span>" +
                    '<span class="theme-name"><span>' + esc(t.name) + "</span>" + icon("tick") + "</span></button>";
            }).join("") + "</div></section>" +
            '<div class="settings-grid">' +

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

            '<section class="panel"><h2 class="panel-title">Employment details</h2>' +
            '<dl class="facts">' +
            (me.system ? "" : "<dt>Name</dt><dd>" + esc(me.firstName + " " + me.lastName) + "</dd>") +
            "<dt>Roles</dt><dd>" + rolesHtml(me) + "</dd>" +
            "<dt>Sign-in</dt><dd>" + esc(me.username) + "</dd>" +
            (me.emails.length ? "<dt>Email</dt><dd>" + me.emails.map(function (e) {
                return esc(e.address) + (e.primary ? ' <span class="badge badge-grey">Login</span>' : "");
            }).join("<br>") + "</dd>" : "") +
            "</dl>" +
            '<p class="hint">These details are managed by HR. Contact them if anything needs changing.</p></section>' +

            '<section class="panel" id="password"><h2 class="panel-title">Change password</h2>' +
            '<form id="pw-form" novalidate>' +
            '<label for="pw-current">Current password</label><input type="password" id="pw-current" autocomplete="current-password">' +
            '<label for="pw-new">New password</label><input type="password" id="pw-new" autocomplete="new-password">' +
            '<label for="pw-confirm">Confirm new password</label><input type="password" id="pw-confirm" autocomplete="new-password">' +
            '<p class="hint">At least 8 characters.</p>' +
            '<div class="form-error" id="pw-error" hidden></div>' +
            '<div class="form-actions"><button type="submit" class="btn btn-primary" id="pw-save">Update password</button></div>' +
            "</form></section>" +
            "</div>";

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
            if (!state.me.passwordTemporary) state.meta = await api("/api/meta");
        } catch (e) {
            return;
        }
        renderChrome();
        document.body.classList.remove("app-loading");
        render();

        // Notice quickly if this session is ended from the system panel.
        setInterval(function () {
            if (document.hidden) return;
            api("/api/me").then(function (d) {
                const was = state.me;
                state.me = d.user;
                if (!!was.impersonatedBy !== !!d.user.impersonatedBy || was.id !== d.user.id) window.location.reload();
            }).catch(function () {});
        }, 30000);
    }

    start();
})();
