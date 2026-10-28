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
        chevronLeft: '<path d="m15 18-6-6 6-6"/>',
        chevronRight: '<path d="m9 18 6-6-6-6"/>',
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
        chart: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
        smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
        book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
        help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
        message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
        gift: '<path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
        archive: '<path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>',
        refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
        thermometer: '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>',
        heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
        wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M16 14h.01"/>',
        pound: '<path d="M17 7.5A3.5 3.5 0 0 0 10 7v12"/><path d="M6 13h8M6 19h12"/>',
        printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
        flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
        star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
        chevronLeft: '<path d="m15 18-6-6 6-6"/>',
        chevronRight: '<path d="m9 18 6-6-6-6"/>',
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

    // Whether the signed-in person has a permission (the owner and admin account have them all).
    function can(permission) {
        return !!(state.me && (state.me.permissions || []).indexOf(permission) !== -1);
    }

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
        if (res.status === 503 && data.code === "MAINTENANCE") {
            window.location.href = "/login?maintenance=1";
            throw new Error("The portal is in maintenance mode.");
        }
        if (res.status === 401 && path !== "/api/login") {
            window.location.href = "/login";
            throw new Error("Signed out");
        }
        if (res.status === 403 && data.code === "PASSWORD_CHANGE_REQUIRED") {
            if (!state.me.passwordExpired) state.me.passwordTemporary = true;
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

    const BANNER_PRESETS = [
        { key: "aurora", name: "Aurora" }, { key: "sunset", name: "Sunset" }, { key: "ocean", name: "Ocean" },
        { key: "forest", name: "Forest" }, { key: "lavender", name: "Lavender" }, { key: "midnight", name: "Midnight" },
        { key: "ember", name: "Ember" }, { key: "slate", name: "Slate" },
    ];

    // A person's profile banner: their uploaded image, a preset gradient, or the default.
    function bannerHtml(person, cls, tag) {
        tag = tag || "span";
        const b = person.banner;
        if (b && b.url) return "<" + tag + ' class="' + cls + ' has-image"><img src="' + esc(b.url) + '" alt="" loading="lazy"></' + tag + ">";
        return "<" + tag + ' class="' + cls + (b && b.preset ? " banner-" + esc(b.preset) : "") + '"></' + tag + ">";
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

    // How far `tz` is ahead of or behind `baseTz` (default: this device), e.g. "10 hours behind you".
    function tzDifference(tz, baseTz, who) {
        const diff = tzOffsetMinutes(tz) - tzOffsetMinutes(baseTz || deviceTz);
        who = who || "your device";
        if (diff === 0) return "Same time as " + who;
        const abs = Math.abs(diff);
        const h = Math.floor(abs / 60);
        const m = abs % 60;
        const amount = (h ? h + (h === 1 ? " hour" : " hours") : "") + (h && m ? " " : "") + (m ? m + " min" : "");
        return amount + (diff > 0 ? " ahead of " : " behind ") + who;
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

    // While the page is scrolling, cards ignore the mouse so hover effects don't make them jump.
    let scrollTimer = null;
    window.addEventListener("scroll", function () {
        if (!scrollTimer) document.body.classList.add("is-scrolling");
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function () {
            scrollTimer = null;
            document.body.classList.remove("is-scrolling");
        }, 120);
    }, { passive: true });

    // ----- Scroll bounce -----
    // Cards spring into place as they come on screen, from below when scrolling down and from above
    // when scrolling up. Cards already on screen when a page opens are left alone.
    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const REVEAL = ".panel, .person-card, .announcement, .ticket-row, .slip-row, .poll-card, .company-card, .logo-tile, .leave-row, " +
        ".checklist-grid > .checklist, .stat, .fund-card, .role-card, .doc-row, .ts-review, .theme-option, .clock-card, .monitor, .review-card, .sf-row";
    if (!reducedMotion && "IntersectionObserver" in window) {
        const io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                const el = en.target;
                const fromTop = en.boundingClientRect.top < 0;
                if (!el.dataset.rv) {
                    // First look: if any of it is already on screen, don't animate it.
                    el.dataset.rv = "1";
                    if (en.isIntersecting) return;
                    el.classList.add("rv");
                    el.classList.toggle("rv-from-top", fromTop);
                    return;
                }
                if (!en.isIntersecting) {
                    // Fully off screen: get ready to bounce in from whichever side it comes back on.
                    el.classList.add("rv");
                    el.classList.remove("rv-in");
                    el.classList.toggle("rv-from-top", fromTop);
                } else if (en.intersectionRatio >= 0.08 && el.classList.contains("rv") && !el.classList.contains("rv-in")) {
                    requestAnimationFrame(function () { el.classList.add("rv-in"); });
                }
            });
        }, { threshold: [0, 0.08] });
        // Once it has landed, drop the classes so hover effects work as normal.
        document.addEventListener("transitionend", function (e) {
            const el = e.target;
            if (e.propertyName === "transform" && el.classList && el.classList.contains("rv-in")) el.classList.remove("rv", "rv-in", "rv-from-top");
        });
        const watch = function (root) {
            if (!(root instanceof Element)) return;
            if (root.matches(REVEAL) && !root.closest(".modal-backdrop")) io.observe(root);
            root.querySelectorAll(REVEAL).forEach(function (el) { if (!el.closest(".modal-backdrop")) io.observe(el); });
        };
        new MutationObserver(function (list) {
            list.forEach(function (mut) {
                mut.addedNodes.forEach(function (n) {
                    if (n.nodeType === 1 && (n.id === "view" || (n.closest && n.closest("#view")))) watch(n);
                });
            });
        }).observe(document.body, { childList: true, subtree: true });

        // A little elastic give when you scroll past the top or bottom with a mouse or trackpad.
        let pull = 0;
        let settle = null;
        window.addEventListener("wheel", function (e) {
            if (e.ctrlKey || $(".modal-backdrop") || $(".search-overlay")) return;
            if (e.target.closest && e.target.closest(".menu, .org-scroll, .rota-wrap, .table-card, .member-list, textarea, select")) return;
            const atTop = window.scrollY <= 0 && e.deltaY < 0;
            const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1 && e.deltaY > 0;
            if (!atTop && !atBottom) return;
            const view = $("#view");
            if (!view) return;
            pull = Math.max(-26, Math.min(26, pull - e.deltaY * 0.12));
            view.classList.remove("edge-bounce");
            view.style.transform = "translate3d(0," + pull + "px,0)";
            clearTimeout(settle);
            settle = setTimeout(function () {
                pull = 0;
                view.classList.add("edge-bounce");
                view.style.transform = "";
                setTimeout(function () { view.classList.remove("edge-bounce"); }, 600);
            }, 90);
        }, { passive: true });
    }

    // ================= Navigation & menus =================

    const NAV = [
        {
            label: "People", items: [
                { title: "Staff Directory", desc: "Find colleagues across the group", href: "/directory", icon: "users" },
                { title: "Teams", desc: "Each company’s people, news and plans", href: "/team", icon: "building" },
                { title: "Kudos", desc: "Thank colleagues and celebrate milestones", href: "/kudos", icon: "heart" },
                { title: "Chat", desc: "Message colleagues and company channels", href: "/chat", icon: "message", badge: "chatUnread" },
                { title: "Q&A", desc: "Ask a question, share what you know", href: "/questions", icon: "help" },
                { title: "Knowledge base", desc: "How-to guides anyone can edit", href: "/wiki", icon: "book" },
                { title: "Mentoring", desc: "Find a mentor and plan catch-ups", href: "/mentoring", icon: "users", badge: "mentoringDue" },
                { title: "Employee Management", desc: "Add and manage staff records", href: "/employees", icon: "briefcase", requires: "staff.manage" },
                { title: "Joiners & leavers", desc: "Onboarding and leaving checklists", href: "/onboarding", icon: "check", requires: "onboarding.manage" },
                { title: "Jobs", desc: "Open roles, applications and referrals", href: "/jobs", icon: "briefcase", badge: "newApplicants" },
                { title: "Roles & permissions", desc: "Choose who can do what", href: "/roles", icon: "shield", requires: "access.manage" },
            ],
        },
        {
            label: "Workplace", items: [
                { title: "Announcements", desc: "Group-wide news and updates", href: "/announcements", icon: "bell", badge: "unreadAnnouncements" },
                { title: "Documents & Policies", desc: "Handbooks, policies, forms and templates", href: "/documents", icon: "file", badge: "pendingAcks" },
                { title: "Document storage", desc: "Private storage on HN Group Docs and who can open it", href: "/document-storage", icon: "lock" },
                { title: "Calendar", desc: "Events, bank holidays and celebrations", href: "/calendar", icon: "calendar" },
                { title: "Polls & surveys", desc: "Have your say", href: "/polls", icon: "chart", badge: "openPolls" },
                { title: "Ideas", desc: "Suggest improvements and vote", href: "/ideas", icon: "flag", badge: "newIdeas" },
                { title: "Pulse", desc: "This week’s quick anonymous question", href: "/pulse", icon: "activity" },
                { title: "Email signature", desc: "Make your branded email signature", href: "/signature", icon: "mail" },
            ],
        },
        {
            label: "HR", items: [
                { title: "Leave & Absence", desc: "Book holidays and report absence", href: "/leave", icon: "sun", badge: "leaveApprovals" },
                { title: "Rotas & Timesheets", desc: "Shifts, hours and approvals", href: "/rotas", icon: "clock", badge: "timesheetApprovals" },
                { title: "Probation & reviews", desc: "Probation dates and reviews", href: "/reviews", icon: "star", badge: "reviewsDue" },
                { title: "Goals", desc: "Quarterly goals and progress", href: "/objectives", icon: "flag" },
                { title: "360 feedback", desc: "Anonymous feedback from colleagues", href: "/feedback", icon: "message", badge: "feedbackDue" },
                { title: "Flexible working", desc: "Ask for a different working pattern", href: "/flexible", icon: "clock", badge: "flexibleDecisions" },
                { title: "Exit interviews", desc: "What leavers told us", href: "/exit-interviews", icon: "logout", requires: "staff.manage" },
                { title: "Staff documents", desc: "Contracts and personal documents", href: "/staff-files", icon: "file" },
                { title: "Training", desc: "Courses, certificates and renewals", href: "/training", icon: "star", badge: "trainingDue" },
                { title: "HR cases", desc: "Disciplinary and grievance records", href: "/cases", icon: "shield", requires: "cases.manage", badge: "casesOpen" },
                { title: "Payslips", desc: "View and download your payslips", href: "/payslips", icon: "card" },
                { title: "Expenses", desc: "Claim back money you spent for work", href: "/expenses", icon: "pound", badge: "expenseApprovals" },
                { title: "Run payroll", desc: "Generate and issue payslips", href: "/payroll", icon: "wallet", requires: "payroll.manage" },
                { title: "Company funds", desc: "Balances, budgets and statements", href: "/funds", icon: "pound", requires: "payroll.manage", badge: "budgetWarnings" },
                { title: "Invoices", desc: "Bill customers and track payments", href: "/invoices", icon: "file", requires: "payroll.manage", badge: "invoicesOverdue" },
                { title: "Bills", desc: "Supplier bills and when they're due", href: "/bills", icon: "card", requires: "payroll.manage", badge: "billsDue" },
            ],
        },
        {
            label: "Support", items: [
                { title: "Service status", desc: "Are our websites up?", href: "/status", icon: "activity", badge: "servicesDown" },
                { title: "Activity reports", desc: "Monthly summary as a PDF", href: "/reports", icon: "chart", requires: "reports.view" },
                { title: "About HN Group", desc: "Our companies, brand colours and logos", href: "/about", icon: "building" },
                { title: "IT Helpdesk", desc: "Raise and track support tickets", href: "/helpdesk", icon: "lifebuoy", badge: "helpdeskBadge" },
                { title: "On call", desc: "Who to contact out of hours", href: "/on-call", icon: "phone" },
                { title: "Website enquiries", desc: "Messages from hngroup.org.uk", href: "/enquiries", icon: "mail", requires: "enquiries.manage", badge: "enquiriesNew" },
            ],
        },
    ];

    function visibleItems(section) {
        return section.items.filter(function (it) { return !it.requires || can(it.requires); });
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
                    // Long menus go into two columns so they fit on the screen.
                    '<div class="menu' + (items.length > 6 ? " menu-cols" : "") + '" role="menu" hidden>' + items.map(menuItemHtml).join("") + "</div></div>";
            }).join("");

        $("#user-menu").innerHTML =
            '<button type="button" class="user-btn" data-menu aria-haspopup="true" aria-expanded="false">' +
            '<span class="avatar-wrap">' + avatar(me, "sm") + (me.status ? '<span class="status-badge ' + (STATUSES[me.status.type] || {}).cls + '"></span>' : "") + "</span>" +
            '<span class="user-meta"><span class="user-name">' + esc(me.displayName) + '</span><span class="user-role">' + esc(me.jobTitle) + "</span></span>" +
            icon("chevron", "chev") + "</button>" +
            '<div class="menu menu-right menu-user" role="menu" hidden>' +
            '<div class="menu-header">' + avatar(me, "md") + '<div class="menu-header-text"><div class="mh-name">' + esc(me.displayName) +
            '</div><div class="mh-email">' + esc(me.username) + "</div></div></div>" +
            (me.system ? "" : '<button type="button" class="menu-item compact status-item" role="menuitem" data-action="status">' +
                (me.status ? statusPill(me.status) : '<span class="status-pill st-none"><span class="status-dot"></span>Set a status</span>') + "</button>") +
            '<div class="menu-sep"></div>' +
            '<a class="menu-item compact" role="menuitem" href="/settings" data-link>' + icon("settings") + "<span>Settings</span></a>" +
            '<a class="menu-item compact" role="menuitem" href="/signature" data-link>' + icon("mail") + "<span>Email signature</span></a>" +
            (can("system.admin") && !me.impersonatedBy ? '<a class="menu-item compact" role="menuitem" href="/system" data-link>' + icon("shield") + "<span>System Admin</span></a>" : "") +
            '<div class="menu-sep"></div>' +
            '<button type="button" class="menu-item compact danger" role="menuitem" data-action="logout">' + icon("logout") + "<span>Sign out</span></button>" +
            "</div>";

        const bell = $("#bell-menu");
        if (bell) bell.innerHTML = bellHtml();
        $("#nav-toggle").innerHTML = icon("menu");
        $("#search-btn").innerHTML = icon("search") + '<span class="sb-text">Search</span><kbd>' + (/Mac|iPhone|iPad/.test(navigator.platform) ? "\u2318" : "Ctrl") + " K</kbd>";
        highlightNav();

        renderStatusBanner();
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
            // Keep dropdowns inside the window: shift left if they'd go off the right-hand edge.
            menu.style.transform = "";
            if (window.innerWidth > 900) {
                const r = menu.getBoundingClientRect();
                if (r.right > window.innerWidth - 8) menu.style.transform = "translateX(" + Math.round(window.innerWidth - 8 - r.right) + "px)";
            }
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
            if (menuBtn.id === "bell-btn" && !menuBtn.nextElementSibling.hidden) loadBell();
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

        if (e.target.closest("[data-action='search']")) {
            openSearch();
            return;
        }

        if (e.target.closest("[data-action='status']")) {
            closeMenus();
            openStatusModal();
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
        "/calendar": viewCalendar,
        "/polls": viewPolls,
        "/onboarding": viewOnboarding,
        "/roles": viewRoles,
        "/about": viewAbout,
        "/signature": viewSignature,
        "/leave": viewLeave,
        "/rotas": viewRotas,
        "/payslips": viewPayslips,
        "/payroll": viewPayroll,
        "/funds": viewFunds,
        "/helpdesk": viewHelpdesk,
        "/reviews": viewReviews,
        "/staff-files": viewStaffFiles,
        "/status": viewStatus,
        "/expenses": viewExpenses,
        "/invoices": viewInvoices,
        "/training": viewTraining,
        "/cases": viewCases,
        "/jobs": viewJobs,
        "/notifications": viewNotifications,
        "/kudos": viewKudos,
        "/chat": viewChat,
        "/questions": viewQuestions,
        "/wiki": viewWiki,
        "/mentoring": viewMentoring,
        "/on-call": viewOnCall,
        "/enquiries": viewEnquiries,
        "/document-storage": viewDocumentStorage,
        "/ideas": viewIdeas,
        "/team": viewTeam,
        "/reports": viewReports,
        "/bills": viewBills,
        "/objectives": viewObjectives,
        "/feedback": viewFeedback,
        "/pulse": viewPulse,
        "/exit-interview": viewExitInterview,
        "/exit-interviews": viewExitInterviews,
        "/flexible": viewFlexible,
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
        "/calendar": "calendar",
        "/polls": "chart",
        "/onboarding": "check",
        "/roles": "key",
        "/about": "building",
        "/signature": "mail",
        "/leave": "sun",
        "/rotas": "clock",
        "/payslips": "card",
        "/payroll": "wallet",
        "/funds": "pound",
        "/helpdesk": "lifebuoy",
        "/reviews": "star",
        "/staff-files": "file",
        "/status": "activity",
        "/expenses": "pound",
        "/invoices": "file",
        "/training": "star",
        "/cases": "shield",
        "/jobs": "briefcase",
        "/notifications": "bell",
        "/kudos": "heart",
        "/chat": "message",
        "/questions": "help",
        "/wiki": "book",
        "/mentoring": "users",
        "/on-call": "phone",
        "/enquiries": "mail",
        "/document-storage": "lock",
        "/ideas": "flag",
        "/team": "building",
        "/reports": "chart",
        "/bills": "card",
        "/objectives": "flag",
        "/feedback": "message",
        "/pulse": "activity",
        "/exit-interview": "logout",
        "/exit-interviews": "logout",
        "/flexible": "clock",
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

        if (state.me.passwordTemporary || state.me.passwordExpired) {
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
        const NEEDS = { "/employees": "staff.manage", "/onboarding": "onboarding.manage", "/roles": "access.manage", "/payroll": "payroll.manage", "/funds": "payroll.manage", "/invoices": "payroll.manage", "/cases": "cases.manage", "/reports": "reports.view", "/bills": "payroll.manage", "/exit-interviews": "staff.manage", "/enquiries": "enquiries.manage" };
        if (NEEDS[path] && !can(NEEDS[path])) view = viewNoAccess;
        if (path === "/system" && (!can("system.admin") || state.me.impersonatedBy)) view = viewNoSystemAccess;

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
        // Fresh counts for the reminder chips (approvals and tickets change while you're signed in).
        try {
            state.me = (await api("/api/me")).user;
            renderChrome();
        } catch (e) { /* keep what we have */ }
        const me = state.me;
        // Their own time comes from the time zone in their profile (not the device), and the second
        // clock is always UK time, where HN Group is based (shows BST or GMT).
        const profileTz = me.timezone || state.meta.defaultTimezone;
        const placeName = me.location || tzCity(profileTz);
        const UK_TZ = "Europe/London";
        // The UK clock is only shown when it differs from their own time.
        const sameAsUk = tzOffsetMinutes(UK_TZ) === tzOffsetMinutes(profileTz);
        // Just the town on the clock ("Doncaster", not "Doncaster, United Kingdom"); the full place is its tooltip.
        const placeShort = String(placeName || "").split(",")[0].trim() || placeName;
        const hour = Number(fmt(profileTz, { hour: "2-digit", hourCycle: "h23" }));
        const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
        // Greetings use the name people chose to be known by.
        const firstName = me.displayName || me.firstName;


        root.innerHTML =
            (me.mustChangePassword
                ? '<div class="banner banner-warn"><div><strong>You\'re using the default password.</strong> Please change it now to keep the portal secure.</div>' +
                  '<a class="btn btn-small btn-dark" href="/settings#password" data-link>Change password</a></div>'
                : "") +
            '<section class="home-hero">' +
            '<div class="hero-glow g1"></div><div class="hero-glow g2"></div>' +
            '<div class="hero-main">' +
            '<p class="hero-date">' + clock(profileTz, "date") + "</p>" +
            "<h1>" + esc(greeting) + ", " + esc(firstName) + "</h1>" +
            mainRoleHtml(me) +
            '<div class="hero-chips">' +
            (me.unreadAnnouncements ? '<a class="hero-chip" href="/announcements" data-link>' + icon("bell") + me.unreadAnnouncements + " new announcement" + (me.unreadAnnouncements === 1 ? "" : "s") + "</a>" : "") +
            (me.pendingAcks ? '<a class="hero-chip warn" href="#home-todo">' + icon("check") + me.pendingAcks + (me.pendingAcks === 1 ? " thing" : " things") + " to acknowledge</a>" : "") +
            (me.openPolls ? '<a class="hero-chip" href="/polls" data-link>' + icon("chart") + me.openPolls + (me.openPolls === 1 ? " poll" : " polls") + " to answer</a>" : "") +
            (me.onboardingTasks ? '<a class="hero-chip" href="#home-onboarding">' + icon("check") + me.onboardingTasks + " onboarding task" + (me.onboardingTasks === 1 ? "" : "s") + "</a>" : "") +
            (me.payrollOverdrawn ? '<a class="hero-chip danger" href="/funds" data-link>' + icon("alert") + "Company funds overdrawn \u2013 next payroll can\u2019t be met</a>" : "") +
            (me.reviewsDue ? '<a class="hero-chip" href="/reviews" data-link>' + icon("star") + me.reviewsDue + (me.reviewsDue === 1 ? " probation or review" : " probations or reviews") + " coming up</a>" : "") +
            (me.returnToWorkDue ? '<a class="hero-chip" href="/leave" data-link data-rtw-chip>' + icon("thermometer") + me.returnToWorkDue + " return-to-work form" + (me.returnToWorkDue === 1 ? "" : "s") + " to do</a>" : "") +
            (me.servicesDown ? '<a class="hero-chip danger" href="/status" data-link>' + icon("alert") + me.servicesDown + (me.servicesDown === 1 ? " service is" : " services are") + " down</a>" : "") +
            (me.leaveApprovals ? '<a class="hero-chip" href="/leave" data-link>' + icon("sun") + me.leaveApprovals + " leave request" + (me.leaveApprovals === 1 ? "" : "s") + " to approve</a>" : "") +
            (me.timesheetApprovals ? '<a class="hero-chip" href="/rotas" data-link data-rota-approvals>' + icon("clock") + me.timesheetApprovals + " timesheet" + (me.timesheetApprovals === 1 ? "" : "s") + " to approve</a>" : "") +
            (me.expenseApprovals ? '<a class="hero-chip" href="/expenses" data-link>' + icon("pound") + me.expenseApprovals + " expense claim" + (me.expenseApprovals === 1 ? "" : "s") + " to deal with</a>" : "") +
            (me.budgetWarnings ? '<a class="hero-chip warn" href="/funds" data-link>' + icon("flag") + me.budgetWarnings + (me.budgetWarnings === 1 ? " budget is" : " budgets are") + " nearly used up</a>" : "") +
            (me.exitInterviewDue ? '<a class="hero-chip" href="/exit-interview" data-link>' + icon("logout") + "Fill in your exit interview</a>" : "") +
            (me.feedbackDue ? '<a class="hero-chip" href="/feedback" data-link>' + icon("message") + me.feedbackDue + " feedback request" + (me.feedbackDue === 1 ? "" : "s") + "</a>" : "") +
            (me.flexibleDecisions ? '<a class="hero-chip" href="/flexible" data-link>' + icon("clock") + me.flexibleDecisions + " flexible working request" + (me.flexibleDecisions === 1 ? "" : "s") + " to decide</a>" : "") +
            (me.billsDue ? '<a class="hero-chip warn" href="/bills" data-link>' + icon("card") + me.billsDue + " bill" + (me.billsDue === 1 ? "" : "s") + " due this week</a>" : "") +
            (me.invoicesOverdue ? '<a class="hero-chip warn" href="/invoices" data-link>' + icon("file") + me.invoicesOverdue + " overdue invoice" + (me.invoicesOverdue === 1 ? "" : "s") + "</a>" : "") +
            (me.backupStale ? '<a class="hero-chip danger" href="/system#sys-backups" data-link>' + icon("archive") + "No backup in the last 36 hours</a>" : "") +
            (me.trainingDue ? '<a class="hero-chip warn" href="/training" data-link>' + icon("star") + me.trainingDue + " training item" + (me.trainingDue === 1 ? "" : "s") + " expiring or missing</a>" : "") +
            (me.newApplicants ? '<a class="hero-chip" href="/jobs" data-link>' + icon("briefcase") + me.newApplicants + " new job applicant" + (me.newApplicants === 1 ? "" : "s") + "</a>" : "") +
            (me.chatUnread ? '<a class="hero-chip" href="/chat" data-link>' + icon("message") + me.chatUnread + " unread message" + (me.chatUnread === 1 ? "" : "s") + "</a>" : "") +
            (me.mentoringDue ? '<a class="hero-chip" href="/mentoring" data-link>' + icon("users") + me.mentoringDue + " mentoring catch-up" + (me.mentoringDue === 1 ? "" : "s") + " due</a>" : "") +
            (me.enquiriesNew ? '<a class="hero-chip" href="/enquiries" data-link>' + icon("mail") + me.enquiriesNew + " new website enquir" + (me.enquiriesNew === 1 ? "y" : "ies") + "</a>" : "") +
            (me.helpdeskBadge ? '<a class="hero-chip" href="/helpdesk" data-link>' + icon("lifebuoy") + me.helpdeskBadge + " IT ticket" + (me.helpdeskBadge === 1 ? "" : "s") + " need" + (me.helpdeskBadge === 1 ? "s" : "") + " attention</a>" : "") +
            (!me.unreadAnnouncements && !me.pendingAcks && !me.openPolls && !me.onboardingTasks && !me.leaveApprovals && !me.timesheetApprovals && !me.helpdeskBadge && !me.payrollOverdrawn && !me.reviewsDue && !me.returnToWorkDue && !me.servicesDown && !me.expenseApprovals && !me.budgetWarnings && !me.invoicesOverdue && !me.trainingDue && !me.newApplicants && !me.backupStale && !me.billsDue && !me.exitInterviewDue && !me.feedbackDue && !me.flexibleDecisions && !me.chatUnread && !me.mentoringDue && !me.enquiriesNew ? '<span class="hero-chip calm">' + icon("tick") + "You\u2019re all caught up</span>" : "") +
            "</div></div>" +
            '<div class="hero-clocks' + (sameAsUk ? " single" : "") + '">' +
            '<div class="glass-clock"><div class="gc-label" title="' + esc(placeName) + '">' + icon("pin") + '<span class="gc-place">Your time \u00b7 ' + esc(placeShort) + "</span></div>" +
            '<div class="gc-time">' + clock(profileTz, "time") + "</div>" +
            '<div class="gc-sub">' + clock(profileTz, "zone") + (sameAsUk ? " \u00b7 UK time" : "") + (me.location ? "" : ' \u00b7 <a href="/settings" data-link>Set location</a>') + "</div></div>" +
            (sameAsUk ? "" :
            '<div class="glass-clock"><div class="gc-label">' + icon("clock") + "UK time \u00b7 London</div>" +
            '<div class="gc-time">' + clock(UK_TZ, "time") + "</div>" +
            '<div class="gc-sub">' + clock(UK_TZ, "zone") + " \u00b7 " + esc(tzDifference(UK_TZ, profileTz, "you")) + "</div></div>") +
            "</div></section>" +

            '<div class="home-layout">' +
            '<section class="home-announcements"><div class="panel-head tight"><h2 class="section-title">' + icon("bell") + "Announcements</h2>" +
            '<a class="small link-arrow" href="/announcements" data-link>View all</a></div>' +
            '<div id="home-news" class="announcements wide"><p class="muted small">Loading\u2026</p></div></section>' +

            '<aside class="home-side" id="home-side">' +
            '<section class="panel" id="home-todo" data-widget="todo" hidden></section>' +
            '<section class="panel" id="home-onboarding" data-widget="onboarding" hidden></section>' +
            (me.pulseDue ? '<section class="panel" id="home-pulse" data-widget="pulse"></section>' : "") +
            (me.system ? "" : '<section class="panel" data-widget="leave" hidden></section>') +
            '<section class="panel" id="home-celebrate" data-widget="celebrate" hidden></section>' +
            '<section class="panel" id="home-coming" data-widget="coming"><p class="muted small">Loading\u2026</p></section>' +
            '<section class="panel" data-widget="questions" hidden></section>' +
            '<section class="panel me-panel" data-widget="me"><div class="me-card">' + avatar(me, "lg") + '<div><div class="me-name">' + esc(me.displayName) + "</div>" +
            '<div class="muted small">' + esc(me.jobTitle) + "</div>" + (me.isOwner ? '<span class="badge badge-owner">System owner</span>' : "") + "</div></div>" +
            '<button type="button" class="status-set" id="home-status">' + (me.status ? statusPill(me.status) : '<span class="status-pill st-none"><span class="status-dot"></span>Set a status</span>') + icon("edit") + "</button>" +
            rolesHtml(me) +
            (primaryEmail(me) ? '<div class="me-email">' + icon("mail") + esc(primaryEmail(me)) + "</div>" : "") +
            '<a class="btn btn-ghost btn-block-sm" href="/settings" data-link>' + icon("settings") + "Settings</a></section>" +
            '<section class="panel help-panel" data-widget="help">' + icon("lifebuoy") + '<div><h2 class="section-title">Need help?</h2>' +
            '<p class="muted small">For access problems or anything IT related, contact the IT team.</p>' +
            ((me.onCallNow || []).length ? '<div class="oc-home">' + me.onCallNow.map(function (r) {
                return '<a class="oc-home-row" href="/on-call" data-link>' + avatar(r.person, "sm") + '<span><strong>' + esc(r.person.displayName) + '</strong><span class="muted small">On call · ' + esc(r.name) +
                    (r.contact || r.person.phone ? " · " + esc(r.contact || r.person.phone) : "") + "</span></span></a>";
            }).join("") + "</div>" : "") +
            "</div></section>" +
            '<button type="button" class="btn btn-ghost btn-small home-customise" id="home-customise">' + icon("settings") + "Customise this page</button>" +
            "</aside></div>";
        applyHomeLayout($("#home-side"));
        $("#home-customise").addEventListener("click", openHomeCustomiser);

        // Live panels: the latest announcements, and anything waiting for the user to acknowledge.
        api("/api/announcements").then(function (d) {
            const box = $("#home-news");
            if (!box) return;
            const live = d.announcements.filter(function (a) { return a.state === "live"; });
            const shown = live.slice(0, 5);
            if (shown.length) {
                mountAnnouncements(box, shown, {
                    clamp: true,
                    footer: live.length > shown.length ? '<a class="btn btn-ghost more-link" href="/announcements" data-link>See all ' + live.length + " announcements</a>" : "",
                });
            } else {
                box.innerHTML = '<div class="panel muted small">No announcements yet.</div>';
            }
            // Show anything new as soon as you land on the home page.
            const unread = d.announcements.filter(function (a) { return a.unread && a.state === "live"; });
            if (unread.length && !$(".modal-backdrop")) showNewAnnouncements(unread);
        }).catch(function () {});

        if ($("#home-status")) $("#home-status").addEventListener("click", openStatusModal);
        if ($("[data-rota-approvals]", root)) $("[data-rota-approvals]", root).addEventListener("click", function () { state.rotaTab = "approvals"; });
        if ($("[data-rtw-chip]", root)) $("[data-rtw-chip]", root).addEventListener("click", function () { state.leaveTab = "rtw"; });
        if (me.leaveApprovals) $('.hero-chip[href="/leave"]', root).addEventListener("click", function () { state.leaveTab = "approvals"; });
        $$('a[href^="#home-"]', root).forEach(function (a) {
            a.addEventListener("click", function (e) {
                e.preventDefault();
                const t = $(a.getAttribute("href"));
                if (t && !t.hidden) t.scrollIntoView({ behavior: "smooth", block: "center" });
            });
        });
        if ($("#home-coming")) loadComingUp($("#home-coming"));
        loadCelebrations($("#home-celebrate"));
        if ($("#home-pulse")) api("/api/pulse").then(function (p) {
            const box = $("#home-pulse");
            if (!box || p.answered) { if (box) box.remove(); return; }
            box.innerHTML = pulseCardHtml(p.question);
            wirePulse(box);
        }).catch(function () {});
        if ($("#home-onboarding")) loadMyOnboarding($("#home-onboarding"));

        if (me.pendingAcks && $("#home-todo")) {
            Promise.all([api("/api/documents"), api("/api/announcements")]).then(function (r) {
                const box = $("#home-todo");
                if (!box) return;
                const docs = r[0].documents.filter(function (x) { return x.needsAck; });
                const anns = r[1].announcements.filter(function (x) { return x.needsAck; });
                if (!docs.length && !anns.length) return;
                box.hidden = false;
                box.classList.add("todo-panel");
                box.innerHTML = '<h2 class="section-title">' + icon("alert") + "Needs your attention</h2>" +
                    '<p class="muted small">Please read and acknowledge:</p>' +
                    '<ul class="todo-list">' +
                    anns.map(function (x) {
                        return '<li><a href="/announcements" data-link data-ann="' + x.id + '"><span class="sp-icon">' + icon("bell") + "</span><span>" + esc(x.title) + "</span></a></li>";
                    }).join("") +
                    docs.map(function (x) {
                        return '<li><a href="/documents" data-link>' + fileBadge(x.file.ext) + "<span>" + esc(x.title) + "</span></a></li>";
                    }).join("") + "</ul>";
                box.addEventListener("click", function (e) {
                    const a = e.target.closest("[data-ann]");
                    if (a) state.pendingAnnouncement = a.dataset.ann;
                });
            }).catch(function () {});
        }
    }

    // ================= Staff directory =================

    // The job title and supervisor someone has at a given company. Anything not set for that
    // company comes from their main company.
    function roleFor(p, company) {
        if (company && company !== p.company) {
            const r = (p.otherRoles || []).find(function (x) { return x.company === company; });
            if (r) return { company: company, jobTitle: r.jobTitle || p.jobTitle, department: r.department || p.department || "", supervisorId: r.supervisorId || p.supervisorId, supervisorCompany: r.supervisorId ? r.supervisorCompany || null : null, main: false };
        }
        return { company: p.company, jobTitle: p.jobTitle, department: p.department || "", supervisorId: p.supervisorId, supervisorCompany: p.supervisorCompany || null, main: true };
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
                out.push({ key: p.id + "|" + c, person: p, company: c, jobTitle: r.jobTitle, department: r.department, supervisorId: r.supervisorId, supervisorCompany: r.supervisorCompany, main: r.main });
            });
        });
        return out;
    }

    // The profile an entry reports to: the supervisor's role chosen for it (which can be at another
    // company), else their role at the same company, else their main role.
    // E.g. Charlie (Horizon Advertising) can report to Human's Horizon Network role.
    function supervisorKey(entry, byId) {
        const s = byId[entry.supervisorId];
        if (!s || s.id === entry.person.id) return null;
        if (entry.supervisorCompany && worksAt(s, entry.supervisorCompany)) return s.id + "|" + entry.supervisorCompany;
        return s.id + "|" + (worksAt(s, entry.company) ? entry.company : s.company);
    }

    // The signed-in user's roles: job title and supervisor at each company they work for.
    function rolesHtml(me) {
        return '<div class="role-list compact">' + (me.roles || []).map(function (r) {
            return '<div class="role-item"><div><div class="role-company">' + esc(r.company) + (r.main && me.roles.length > 1 ? ' <span class="badge">Main</span>' : "") + "</div>" +
                '<div class="small">' + esc(r.jobTitle) + (r.department ? ' <span class="muted">\u00b7 ' + esc(r.department) + "</span>" : "") + '</div></div><div class="small muted">' +
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
            '<label class="search">' + icon("search") + '<input type="search" id="dir-search" placeholder="Search by name, job title, department, skill or location" aria-label="Search"></label>' +
            (function () {
                const depts = {};
                ctx.entries.forEach(function (e) { if (e.department) depts[e.department] = true; });
                const list = Object.keys(depts).sort();
                return list.length ? '<select id="dir-dept" aria-label="Department"><option value="">All departments</option>' + list.map(function (d) { return '<option value="' + esc(d) + '">' + esc(d) + "</option>"; }).join("") + "</select>" : "";
            })() +
            "</div>" +
            '<p class="muted small" id="dir-count"></p>' +
            '<div id="dir-body"></div>';

        let company = "";

        function matches(e) {
            if (company && e.company !== company) return false;
            if ($("#dir-dept") && $("#dir-dept").value && e.department !== $("#dir-dept").value) return false;
            const q = $("#dir-search").value.trim().toLowerCase();
            if (!q) return true;
            const p = e.person;
            return [p.displayName, p.firstName, p.lastName, e.jobTitle, e.department, e.company, p.location]
                .concat(p.skills || [], p.languages || [])
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
            return '<button type="button" class="person-card" data-entry="' + esc(e.key) + '">' + bannerHtml(p, "pc-band") + avatar(p, "lg") +
                '<span class="pc-name">' + esc(p.displayName) + "</span>" +
                '<span class="pc-title">' + esc(e.jobTitle) + "</span>" +
                (e.department ? '<span class="pc-dept">' + esc(e.department) + "</span>" : "") +
                '<span class="pc-company">' + esc(e.company) + "</span>" +
                roleTag(e) + statusPill(p.status) +
                (sup ? '<span class="pc-reports">Reports to ' + sup + "</span>" : "") +
                '<span class="pc-meta">' + icon("clock") + clock(p.timezone, "short") + " · " + esc(p.location || tzCity(p.timezone)) + "</span>" +
                "</button>";
        }

        function row(e) {
            const p = e.person;
            const sup = supLabel(e);
            const email = primaryEmail(p);
            return '<tr data-entry="' + esc(e.key) + '" tabindex="0">' +
                '<td><div class="emp-cell">' + avatar(p, "sm") + '<div><div class="emp-name">' + esc(p.displayName) + ownerBadge(p) + '</div><div class="muted small">' + esc(e.jobTitle) + (e.department ? " \u00b7 " + esc(e.department) : "") + "</div>" + statusPill(p.status) + "</div></div></td>" +
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
                ". Someone with several roles appears once per role. Click a person for details, use −/+ to collapse a team, and drag to move around.</div>" +
                '<div class="org-frame"><span class="org-fade left" aria-hidden="true"></span><span class="org-fade right" aria-hidden="true"></span>' +
                '<div class="org-scroll"><div class="org"><ul class="org-roots">' + html + "</ul></div></div></div>";
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
                // Keep the chart where it was when a team is collapsed or expanded; centre it the first time.
                const old = $(".org-scroll", body);
                const keep = old ? { left: old.scrollLeft, top: old.scrollTop } : null;
                body.innerHTML = drawTree(list);
                const scroller = $(".org-scroll", body);
                if (keep) { scroller.scrollLeft = keep.left; scroller.scrollTop = keep.top; }
                else scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
                wireOrgPan(scroller);
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
        if ($("#dir-dept")) $("#dir-dept").addEventListener("change", draw);
        if (state.pendingCompany) {
            company = state.pendingCompany;
            state.pendingCompany = null;
        }
        draw();
        if (state.pendingPerson) {
            const p = ctx.byId[state.pendingPerson];
            state.pendingPerson = null;
            if (p) openPersonModal(p.id + "|" + p.company, ctx);
        }
    }

    // Shows one role profile (a person at one company): their title there, who they report to
    // there (in that supervisor's matching role), their team there, and tabs for their other roles.
    // The org chart has no visible scrollbar: drag it with the mouse (touch screens swipe as normal),
    // and soft fades at the edges show when there's more to see.
    function wireOrgPan(scroller) {
        const frame = scroller.parentNode;
        const fades = function () {
            frame.classList.toggle("more-left", scroller.scrollLeft > 4);
            frame.classList.toggle("more-right", scroller.scrollLeft < scroller.scrollWidth - scroller.clientWidth - 4);
        };
        let drag = null;
        scroller.addEventListener("pointerdown", function (e) {
            if (e.pointerType !== "mouse" || e.button !== 0) return;
            drag = { x: e.clientX, y: e.clientY, left: scroller.scrollLeft, top: scroller.scrollTop, moved: false };
        });
        scroller.addEventListener("pointermove", function (e) {
            if (!drag) return;
            const dx = e.clientX - drag.x;
            const dy = e.clientY - drag.y;
            if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
            if (!drag.moved) {
                drag.moved = true;
                scroller.setPointerCapture(e.pointerId);
                scroller.classList.add("dragging");
            }
            scroller.scrollLeft = drag.left - dx;
            scroller.scrollTop = drag.top - dy;
        });
        const end = function () {
            if (!drag) return;
            const moved = drag.moved;
            drag = null;
            scroller.classList.remove("dragging");
            // A drag shouldn't also count as clicking the person it ended on.
            if (moved) scroller.addEventListener("click", function (e) { e.stopPropagation(); e.preventDefault(); }, { capture: true, once: true });
        };
        scroller.addEventListener("pointerup", end);
        scroller.addEventListener("pointercancel", end);
        scroller.addEventListener("scroll", fades, { passive: true });
        fades();
    }

    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    // Birthday (if they share it) and how long they've been with HN Group.
    function celebrationCard(p) {
        const lines = [];
        if (p.birthday) lines.push('<div class="info-sub">' + icon("gift") + "Birthday " + p.birthday.day + " " + MONTHS[p.birthday.month - 1] + "</div>");
        if (p.startDate) {
            const start = new Date(p.startDate + "T12:00:00");
            const months = (new Date().getFullYear() - start.getFullYear()) * 12 + new Date().getMonth() - start.getMonth() - (new Date().getDate() < start.getDate() ? 1 : 0);
            const len = months < 1 ? "Just joined" : months < 12 ? months + (months === 1 ? " month" : " months") : Math.floor(months / 12) + (Math.floor(months / 12) === 1 ? " year" : " years");
            lines.push('<div class="info-sub">' + icon("star") + "Joined " + esc(fmtDate(p.startDate + "T12:00:00")) + '<span class="muted"> \u00b7 ' + len + "</span></div>");
        }
        if (!lines.length) return "";
        return '<div class="info-card"><div class="info-label">' + icon("calendar") + "Dates</div>" + lines.join("") + "</div>";
    }

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
            bannerHtml(p, "profile-cover", "div") +
            '<div class="profile-top">' +
            '<div class="profile-avatar">' + avatar(p, "xl") + "</div>" +
            '<div class="profile-id"><h2 class="modal-title">' + esc(p.displayName) + "</h2>" +
            '<div class="profile-role">' + esc(e.jobTitle) + "</div>" +
            (e.department ? '<div class="profile-dept">' + icon("users") + esc(e.department) + " department</div>" : "") +
            '<div class="profile-company">' + icon("building") + esc(e.company) + "</div></div>" +
            '<div class="profile-badges">' + (roles.length > 1 ? (e.main ? '<span class="badge">Main role</span>' : '<span class="badge badge-soft">Additional role</span>') : "") +
            (p.isOwner ? '<span class="badge badge-owner">System owner</span>' : "") + "</div>" +
            "</div>" +
            (p.status ? '<div class="profile-status">' + statusPill(p.status) + "</div>" : "") +

            (roles.length > 1
                ? '<div class="role-tabs" role="tablist" aria-label="Roles">' + roles.map(function (r) {
                    return '<button type="button" role="tab" class="role-tab' + (r.key === key ? " active" : "") + '" aria-selected="' + (r.key === key) + '" data-entry="' + esc(r.key) + '">' +
                        '<span class="rt-company">' + esc(r.company) + '</span><span class="rt-title">' + esc(r.jobTitle) + (r.department ? " \u00b7 " + esc(r.department) : "") + "</span></button>";
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
            celebrationCard(p) +
            "</div>" +

            '<div class="profile-section"><h3 class="detail-head">Reports to</h3>' +
            (supervisor ? personRow(supervisor) : '<div class="top-of-org">' + icon("tree") + "Top of " + esc(e.company) + "</div>") + "</div>" +
            (reports.length
                ? '<div class="profile-section"><h3 class="detail-head">Team <span class="tab-count">' + reports.length + "</span></h3>" +
                  '<div class="team-grid">' + reports.map(personRow).join("") + "</div></div>"
                : "") +
            (p.bio ? '<div class="profile-section"><h3 class="detail-head">About</h3><div class="profile-bio">' + richText(p.bio) + "</div></div>" : "") +
            ((p.skills || []).length || (p.languages || []).length
                ? '<div class="profile-section">' +
                  ((p.skills || []).length ? '<h3 class="detail-head">Skills</h3><div class="tag-list">' + p.skills.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div>" : "") +
                  ((p.languages || []).length ? '<h3 class="detail-head">Languages</h3><div class="tag-list">' + p.languages.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div>" : "") + "</div>"
                : "") +
            "</div>" +

            '<div class="profile-actions">' + (p.id !== state.me.id && !p.system ? '<button type="button" class="btn btn-ghost" data-message-person="' + esc(p.id) + '">' + icon("message") + "Message</button>" : "") +
            (email ? '<a class="btn btn-primary" href="mailto:' + esc(email) + '">' + icon("mail") + "Email " + esc(p.displayName || p.firstName) + "</a>" : "") + "</div>",
            { cls: "modal-profile" }
        );
        m.el.addEventListener("click", async function (ev) {
            const copy = ev.target.closest("[data-copy]");
            if (copy) return copyText(copy.dataset.copy);
            const msg = ev.target.closest("[data-message-person]");
            if (msg) {
                try {
                    const r = await api("/api/chat/dm", { personId: msg.dataset.messagePerson });
                    closeModal();
                    state.chatChannel = r.channel;
                    navigate("/chat?c=" + r.channel);
                } catch (err) { toast(err.message); }
                return;
            }
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
            (can("access.manage") ? '<a class="btn btn-ghost" href="/roles" data-link>' + icon("shield") + "Roles & permissions</a>" : "") +
            '<button type="button" class="btn btn-primary" id="add-employee">' + icon("plus") + "Add employee</button></div></div>" +
            '<div class="toolbar"><label class="search">' + icon("search") +
            '<input type="search" id="emp-search" placeholder="Search employees" aria-label="Search employees"></label></div>' +
            '<div class="table-card"><table class="table"><thead><tr><th>Employee</th><th>Job title</th><th>Company</th><th>Reports to</th><th>Login</th><th class="col-actions"><span class="sr-only">Actions</span></th></tr></thead>' +
            '<tbody id="emp-body"></tbody></table></div>';

        function draw() {
            const q = $("#emp-search").value.trim().toLowerCase();
            const list = employees.filter(function (e) {
                return !q || [e.displayName, e.jobTitle, e.department, e.company, e.loginUsername].join(" ").toLowerCase().indexOf(q) !== -1;
            });
            $("#emp-body").innerHTML = list.length ? list.map(function (e) {
                const sup = byId[e.supervisorId];
                const isMe = e.id === state.me.id;
                const locked = e.isOwner && !state.me.isOwner;
                const actions = [
                    '<button type="button" class="menu-item compact" data-act="edit">' + icon("edit") + "<span>Edit details</span></button>",
                ];
                // Sign-in accounts are created on HN Account (the user's request, 28 October 2026).
                const onHnAccount = '<a class="menu-item compact" href="https://accounts.hngroup.org.uk/#accounts" target="_blank" rel="noopener">' + icon("key") + "<span>Create sign-in account on HN Account</span></a>";
                if (locked && !e.account) {
                    actions.length = 0;
                    actions.push(onHnAccount);
                }
                if (!isMe && !locked) {
                    actions.push(e.account
                        ? '<button type="button" class="menu-item compact" data-act="reset">' + icon("key") + "<span>Reset password</span></button>"
                        : onHnAccount);
                    if (e.account && e.account.hasCode) {
                        actions.push('<button type="button" class="menu-item compact" data-act="code-reset">' + icon("shield") + "<span>Reset sign-in code</span></button>");
                    }
                    if (e.account) {
                        actions.push(e.account.enabled
                            ? '<button type="button" class="menu-item compact" data-act="disable">' + icon("ban") + "<span>Disable login</span></button>"
                            : '<button type="button" class="menu-item compact" data-act="enable">' + icon("check") + "<span>Enable login</span></button>");
                    }
                    if (e.account && can("storage.access")) actions.push('<a class="menu-item compact" href="/document-storage?view=' + encodeURIComponent(e.id) + '" data-link>' + icon("lock") + "<span>Document storage</span></a>");
                    actions.push('<div class="menu-sep"></div><button type="button" class="menu-item compact danger" data-act="delete">' + icon("trash") + "<span>Delete employee</span></button>");
                }
                return '<tr data-id="' + e.id + '">' +
                    '<td><div class="emp-cell">' + avatar(e, "sm") + '<div><div class="emp-name">' + esc(e.displayName) + ownerBadge(e) + (isMe ? ' <span class="muted small">(you)</span>' : "") +
                    '</div><div class="muted small">' + esc(e.loginUsername) + (e.emails.length > 1 ? ' <span class="count-pill">+' + (e.emails.length - 1) + "</span>" : "") + "</div></div></div></td>" +
                    '<td data-label="Job title">' + esc(e.jobTitle) + (e.department ? '<div class="muted small">' + esc(e.department) + "</div>" : "") + "</td>" +
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

        $("#emp-body").addEventListener("click", async function (ev) {
            const btn = ev.target.closest("[data-act]");
            if (!btn) {
                // Clicking anywhere else on a row opens that employee's edit panel.
                const tr = ev.target.closest("tr[data-id]");
                if (!tr || ev.target.closest(".row-menu, a, button")) return;
                const target = byId[tr.dataset.id];
                if (target && !(target.isOwner && !state.me.isOwner)) openEmployeeForm(target, employees, reload);
                return;
            }
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
            '<p class="muted">You don\u2019t have permission to open this page. Ask someone who manages roles if you need access.</p>' +
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
        (v.otherRoles || []).forEach(function (r) { roleState[r.company] = { jobTitle: r.jobTitle || "", department: r.department || "", supervisorId: r.supervisorId || "", supervisorCompany: r.supervisorCompany || "" }; });
        // Departments already in use, offered as suggestions.
        const departments = {};
        employees.forEach(function (p) { [p.department].concat((p.otherRoles || []).map(function (r) { return r.department; })).forEach(function (d) { if (d) departments[d] = true; }); });
        const departmentList = '<datalist id="f-departments">' + Object.keys(departments).sort().map(function (d) { return '<option value="' + esc(d) + '">'; }).join("") + "</datalist>";
        // Supervisor choices are roles: each person once per company they work at. The company being
        // set comes first; roles at the other companies follow, so someone can report across companies.
        const supervisorRoles = roleEntries(supervisors);
        const supervisorOptions = function (selectedId, selectedCompany, forCompany, emptyLabel) {
            const chosen = selectedId ? supervisorRoles.find(function (e) { return e.person.id === selectedId && e.company === selectedCompany; }) ||
                supervisorRoles.find(function (e) { return e.person.id === selectedId && e.company === forCompany; }) ||
                supervisorRoles.find(function (e) { return e.person.id === selectedId && e.main; }) : null;
            const order = [forCompany].concat(meta.companies.filter(function (c) { return c !== forCompany; }));
            return '<option value="">' + esc(emptyLabel) + "</option>" + order.map(function (c) {
                const list = supervisorRoles.filter(function (e) { return e.company === c; })
                    .sort(function (a, b) { return a.person.displayName.localeCompare(b.person.displayName); });
                if (!list.length) return "";
                return '<optgroup label="' + esc(c === forCompany ? c : "Other companies · " + c) + '">' + list.map(function (e) {
                    return '<option value="' + esc(e.key) + '"' + (e === chosen ? " selected" : "") + ">" + esc(e.person.displayName) + " — " + esc(e.jobTitle) + (c === forCompany ? "" : " (" + esc(c) + ")") + "</option>";
                }).join("") + "</optgroup>";
            }).join("");
        };
        // "personId|company" from a supervisor select, split back into its parts.
        const supervisorChoice = function (value) {
            const i = String(value || "").indexOf("|");
            return i < 0 ? { supervisorId: null, supervisorCompany: null } : { supervisorId: value.slice(0, i), supervisorCompany: value.slice(i + 1) };
        };
        let mainSupervisor = { supervisorId: v.supervisorId || null, supervisorCompany: v.supervisorCompany || null };
        const drawMainSupervisor = function () {
            f("f-supervisor").innerHTML = supervisorOptions(mainSupervisor.supervisorId, mainSupervisor.supervisorCompany, f("f-company").value, "No supervisor");
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
            '<div class="grid-2"><div><label for="f-title">Job title <span class="req">*</span></label><input type="text" id="f-title" maxlength="100" value="' + esc(v.jobTitle) + '" placeholder="e.g. Marketing Executive" required></div>' +
            '<div><label for="f-dept">Department</label><input type="text" id="f-dept" maxlength="80" value="' + esc(v.department || "") + '" placeholder="e.g. Marketing" list="f-departments"></div></div>' + departmentList +
            '<div class="grid-2">' +
            '<div><label for="f-company">Company <span class="req">*</span></label><select id="f-company">' + companyOptions + "</select></div>" +
            '<div><label for="f-supervisor">Supervisor</label><select id="f-supervisor"></select></div></div>' +
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
            '<div class="grid-2"><div><label for="f-phone">Phone <span class="muted small">(optional)</span></label><input type="tel" id="f-phone" maxlength="40" value="' + esc(v.phone) + '"></div>' +
            '<div><label for="f-start">Start date <span class="muted small">(for work anniversaries)</span></label><input type="date" id="f-start" value="' + esc(v.startDate || "") + '"></div></div>' +
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
                if (cb.checked && !roleState[cb.value]) roleState[cb.value] = { jobTitle: "", department: "", supervisorId: "", supervisorCompany: "" };
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
                    "<div><label>Department at " + esc(c) + '</label><input type="text" class="role-dept" maxlength="80" value="' + esc(r.department || "") + '" placeholder="Same as main department" list="f-departments"></div></div>' +
                    "<label>Supervisor at " + esc(c) + '</label><select class="role-sup">' + supervisorOptions(r.supervisorId, r.supervisorCompany, c, "Same as main supervisor") + "</select></div>";
            }).join("");
        }

        f("f-roles").addEventListener("input", function (e) {
            const row = e.target.closest(".role-row");
            if (row && e.target.classList.contains("role-title")) roleState[row.dataset.company].jobTitle = e.target.value;
            if (row && e.target.classList.contains("role-dept")) roleState[row.dataset.company].department = e.target.value;
        });
        f("f-roles").addEventListener("change", function (e) {
            const row = e.target.closest(".role-row");
            if (row && e.target.classList.contains("role-sup")) Object.assign(roleState[row.dataset.company], supervisorChoice(e.target.value));
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
        f("f-supervisor").addEventListener("change", function () { mainSupervisor = supervisorChoice(f("f-supervisor").value); });
        drawMainSupervisor();
        f("f-company").addEventListener("change", function () {
            drawMainSupervisor();
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
                department: f("f-dept").value,
                company: f("f-company").value,
                supervisorId: mainSupervisor.supervisorId,
                supervisorCompany: mainSupervisor.supervisorCompany,
                otherRoles: meta.companies.filter(function (c) { return roleState[c] && c !== f("f-company").value; }).map(function (c) {
                    return { company: c, jobTitle: roleState[c].jobTitle, department: roleState[c].department, supervisorId: roleState[c].supervisorId || null, supervisorCompany: roleState[c].supervisorCompany || null };
                }),
                emails: rows.map(function (r) { return { local: r.local, domain: r.domain, auto: r.auto, primary: r.primary }; }),
                location: f("f-location").value,
                timezone: f("f-tz").value,
                phone: f("f-phone").value,
                startDate: f("f-start").value,
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
            '<p class="muted center">Sign-in accounts are created on HN Account. Give them one there when they need to sign in; each company they work at is its own profile.</p>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Not now</button>' +
            '<a class="btn btn-primary" href="https://accounts.hngroup.org.uk/#accounts" target="_blank" rel="noopener" data-create>Open HN Account</a></div>',
            { onClose: onDone }
        );
        $("[data-create]", m.el).addEventListener("click", function () { closeModal(); });
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

    // Converts an ISO time to the value a datetime-local input expects (in the viewer's time zone).
    function toLocalInput(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        const pad = function (n) { return String(n).padStart(2, "0"); };
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }

    function timeAgoShort(iso) {
        const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
        if (secs < 60) return "just now";
        const mins = Math.round(secs / 60);
        if (mins < 60) return mins + "m ago";
        const hrs = Math.round(mins / 60);
        if (hrs < 24) return hrs + "h ago";
        return fmtDate(iso);
    }

    // One announcement card, with reactions, comments and acknowledgement.
    // opts: clamp (shorten long messages), menu (manager options), commentsOpen.
    function announcementHtml(a, opts) {
        opts = opts || {};
        const long = opts.clamp && a.body.length > 400;
        const stateBadge = a.state === "scheduled"
            ? '<span class="badge badge-yellow">' + icon("clock") + "Scheduled · " + esc(fmtDateTime(a.publishAt)) + "</span>"
            : a.state === "expired" ? '<span class="badge">Expired</span>' : "";
        const reactions = (a.reactions || []).map(function (r) {
            return '<button type="button" class="reaction' + (r.mine ? " mine" : "") + (r.count ? " has" : "") + '" data-react="' + esc(r.emoji) + '" aria-pressed="' + r.mine + '" aria-label="React ' + esc(r.emoji) + '">' +
                '<span class="r-emoji">' + esc(r.emoji) + "</span>" + (r.count ? '<span class="r-count">' + r.count + "</span>" : "") + "</button>";
        }).join("");
        const comments = a.comments || [];
        const ack = a.requireAck
            ? (a.acknowledgedAt
                ? '<span class="badge badge-green">' + icon("tick") + "Acknowledged</span>"
                : a.needsAck ? '<button type="button" class="btn btn-small btn-primary" data-ack>' + icon("check") + "Acknowledge</button>" : "")
            : "";
        const ackProgress = a.requireAck && a.audienceCount !== undefined
            ? '<button type="button" class="ack-progress" data-acks title="See who has acknowledged"><span class="ack-bar"><span data-pct="' +
              (a.audienceCount ? Math.round(a.ackCount / a.audienceCount * 100) : 0) + '"></span></span>' + a.ackCount + "/" + a.audienceCount + "</button>"
            : "";
        return '<article class="announcement' + (a.important ? " important" : "") + (a.unread ? " unread" : "") + (a.state !== "live" ? " not-live" : "") + (opts.still ? " no-anim" : "") + '" data-id="' + a.id + '">' +
            '<header class="ann-head">' + avatar(a.author, "md") +
            '<div class="ann-meta"><div class="ann-author">' + esc(a.author.displayName) + "</div>" +
            '<div class="muted small">' + esc(a.author.jobTitle || "") + (a.author.jobTitle ? " · " : "") + esc(fmtDateTime(a.publishAt || a.createdAt)) +
            (a.updatedAt !== a.createdAt ? " · edited" : "") + "</div></div>" +
            '<div class="ann-flags">' + stateBadge +
            (a.unread ? '<span class="badge badge-new">New</span>' : "") +
            (a.pinned ? '<span class="badge">' + icon("pinned") + "Pinned</span>" : "") +
            (a.important ? '<span class="badge badge-red">Important</span>' : "") +
            (opts.menu || "") +
            "</div></header>" +
            '<h2 class="ann-title">' + esc(a.title) + "</h2>" +
            '<div class="ann-body">' + richText(long ? a.body.slice(0, 400).trim() + "…" : a.body) + "</div>" +
            (long ? '<a class="small read-more" href="/announcements" data-link>Read more</a>' : "") +
            '<div class="chips ann-audience">' + audienceChips(a.companies) +
            (a.expiresAt && a.state === "live" ? '<span class="chip chip-all">' + icon("clock") + "Until " + esc(fmtDateTime(a.expiresAt)) + "</span>" : "") + "</div>" +
            '<footer class="ann-actions">' +
            '<div class="reactions">' + reactions + "</div>" +
            '<div class="ann-actions-right">' +
            (a.allowComments ? '<button type="button" class="btn btn-link comment-toggle" data-comments>' + icon("message") +
                (comments.length ? comments.length + (comments.length === 1 ? " comment" : " comments") : "Comment") + "</button>" : "") +
            ackProgress + ack + "</div></footer>" +
            (a.allowComments && opts.commentsOpen
                ? '<div class="ann-comments">' + comments.map(function (c) {
                    return '<div class="comment" data-comment="' + c.id + '">' + avatar(c.author, "sm") +
                        '<div class="comment-bubble"><div class="comment-head"><strong>' + esc(c.author.displayName) + '</strong><span class="muted small">' + esc(timeAgoShort(c.createdAt)) + "</span>" +
                        (c.canDelete ? '<button type="button" class="icon-btn icon-btn-sm" data-delete-comment="' + c.id + '" aria-label="Delete comment">' + icon("trash") + "</button>" : "") +
                        '</div><div class="comment-body">' + richText(c.body) + "</div></div></div>";
                }).join("") +
                  '<form class="comment-form" data-comment-form>' + avatar(state.me, "sm") +
                  '<textarea rows="1" maxlength="2000" placeholder="Write a comment…" aria-label="Write a comment"></textarea>' +
                  '<button type="submit" class="btn btn-primary btn-small">Post</button></form></div>'
                : "") +
            "</article>";
    }

    // Renders a list of announcements into a container and handles reacting, commenting and acknowledging.
    function mountAnnouncements(container, list, opts) {
        opts = opts || {};
        const byId = {};
        const open = {};
        list.forEach(function (a) { byId[a.id] = a; });
        const card = function (a, still) {
            return announcementHtml(a, { clamp: opts.clamp, menu: opts.menuFor ? opts.menuFor(a) : "", commentsOpen: open[a.id], still: still });
        };
        const paintBars = function () { $$(".ack-bar [data-pct]", container).forEach(function (b) { b.style.width = b.dataset.pct + "%"; }); };
        const redraw = function (a, focusComment) {
            byId[a.id] = a;
            const el = container.querySelector('.announcement[data-id="' + a.id + '"]');
            if (el) el.outerHTML = card(a, true);
            paintBars();
            if (focusComment) {
                const ta = container.querySelector('.announcement[data-id="' + a.id + '"] .comment-form textarea');
                if (ta) ta.focus();
            }
        };
        container.innerHTML = list.map(function (a) { return card(a); }).join("") + (opts.footer || "");
        paintBars();

        const act = async function (a, path, body) {
            try {
                const r = await api("/api/announcements/" + a.id + "/" + path, body || {});
                if (r.user) { state.me = r.user; renderChrome(); }
                if (r.announcement) redraw(r.announcement, path === "comments");
                if (path === "ack") toast("Thanks — acknowledgement recorded.");
            } catch (err) { toast(err.message); }
        };

        container.addEventListener("click", function (e) {
            const article = e.target.closest(".announcement[data-id]");
            if (!article) return;
            const a = byId[article.dataset.id];
            const react = e.target.closest("[data-react]");
            if (react) return act(a, "react", { emoji: react.dataset.react });
            if (e.target.closest("[data-comments]")) {
                open[a.id] = !open[a.id];
                return redraw(a, open[a.id]);
            }
            const del = e.target.closest("[data-delete-comment]");
            if (del) return act(a, "comments/" + del.dataset.deleteComment + "/delete");
            if (e.target.closest("[data-ack]")) return act(a, "ack");
            if (e.target.closest("[data-acks]")) return openAnnouncementAcks(a);
        });
        container.addEventListener("submit", function (e) {
            const form = e.target.closest("[data-comment-form]");
            if (!form) return;
            e.preventDefault();
            const ta = $("textarea", form);
            if (!ta.value.trim()) return;
            const a = byId[form.closest(".announcement").dataset.id];
            act(a, "comments", { body: ta.value });
        });
        container.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && !e.shiftKey && e.target.matches(".comment-form textarea")) {
                e.preventDefault();
                e.target.closest("form").requestSubmit();
            }
        });
        return { get: function (id) { return byId[id]; } };
    }

    async function openAnnouncementAcks(a) {
        const data = await api("/api/announcements/" + a.id + "/acks");
        const done = data.people.filter(function (p) { return p.acknowledgedAt; });
        const waiting = data.people.filter(function (p) { return !p.acknowledgedAt; });
        const row = function (p) {
            return '<li class="ack-row">' + avatar(p, "sm") + '<div class="ack-who"><div class="emp-name">' + esc(p.displayName) + '</div><div class="muted small">' + esc(p.jobTitle) + "</div></div>" +
                (p.acknowledgedAt ? '<span class="badge badge-green">' + esc(fmtDate(p.acknowledgedAt)) + "</span>" : '<span class="badge badge-yellow">Not yet</span>') + "</li>";
        };
        openModal(
            '<h2 class="modal-title">Who has acknowledged</h2><p class="muted">' + esc(a.title) + " · " + done.length + " of " + data.people.length + " people</p>" +
            (waiting.length ? '<h3 class="detail-head">Still to acknowledge (' + waiting.length + ')</h3><ul class="ack-list">' + waiting.map(row).join("") + "</ul>" : "") +
            (done.length ? '<h3 class="detail-head">Acknowledged (' + done.length + ')</h3><ul class="ack-list">' + done.map(row).join("") + "</ul>" : "") +
            '<div class="modal-actions"><button type="button" class="btn btn-primary" data-close>Done</button></div>'
        );
    }

    // Pop-up of announcements the user hasn't seen yet. Closing it marks them as read.
    function showNewAnnouncements(unread) {
        const m = openModal(
            '<h2 class="modal-title">' + (unread.length === 1 ? "New announcement" : unread.length + " new announcements") + "</h2>" +
            '<div class="announcements popup-list"></div>' +
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
        mountAnnouncements($(".popup-list", m.el), unread);
    }

    async function viewAnnouncements(root, current) {
        const data = await api("/api/announcements");
        if (!current()) return;
        const list = data.announcements;
        const menuFor = function () {
            return data.canPost ? '<div class="nav-item row-menu"><button type="button" class="icon-btn" data-menu aria-haspopup="true" aria-expanded="false" aria-label="Announcement options">' + icon("more") + "</button>" +
                '<div class="menu menu-right menu-row" role="menu" hidden>' +
                '<button type="button" class="menu-item compact" data-act="edit">' + icon("edit") + "<span>Edit</span></button>" +
                '<button type="button" class="menu-item compact danger" data-act="delete">' + icon("trash") + "<span>Delete</span></button></div></div>" : "";
        };

        const tab = data.canPost && state.annTab === "schedule" ? "schedule" : "feed";
        root.innerHTML =
            '<div class="page-head"><div><h1>Announcements</h1><p class="muted">News and updates from across HN Group. React, comment and acknowledge.</p></div>' +
            (data.canPost ? '<div class="page-actions"><button type="button" class="btn btn-primary" id="new-announcement">' + icon("plus") + "New announcement</button></div>" : "") +
            "</div>" +
            (data.canPost ? '<div class="company-tabs" id="ann-tabs"><button type="button" data-ann-tab="feed"' + (tab === "feed" ? ' class="active"' : "") + ">" + icon("list") + "Announcements</button>" +
                '<button type="button" data-ann-tab="schedule"' + (tab === "schedule" ? ' class="active"' : "") + ">" + icon("calendar") + "Schedule" +
                (list.filter(function (a) { return a.state === "scheduled"; }).length ? ' <span class="tab-count">' + list.filter(function (a) { return a.state === "scheduled"; }).length + "</span>" : "") + "</button></div>" : "") +
            (tab === "schedule" ? '<div id="ann-schedule"></div>' :
            list.length ? '<div class="announcements" id="ann-list"></div>'
                : '<div class="empty-page">' + icon("bell", "big") + "<h2>No announcements yet</h2>" +
                  '<p class="muted">' + (data.canPost ? "Post the first one with <strong>New announcement</strong>." : "Check back soon.") + "</p></div>");

        const mounted = list.length && tab === "feed" ? mountAnnouncements($("#ann-list"), list, { menuFor: menuFor }) : null;
        if ($("#new-announcement")) $("#new-announcement").addEventListener("click", function () { openAnnouncementForm(null); });
        if ($("#ann-tabs")) $("#ann-tabs").addEventListener("click", function (e) {
            const b = e.target.closest("[data-ann-tab]");
            if (b && b.dataset.annTab !== tab) { state.annTab = b.dataset.annTab; render(); }
        });
        if (tab === "schedule") {
            drawAnnouncementSchedule($("#ann-schedule"), list, function (id) {
                const a = list.find(function (x) { return x.id === id; });
                if (a) openAnnouncementForm(a);
            }, function (day) {
                openAnnouncementForm(null, day + "T09:00");
            });
        }
        root.addEventListener("click", async function (e) {
            const btn = e.target.closest("[data-act]");
            if (!btn || !mounted) return;
            closeMenus();
            const a = mounted.get(btn.closest("[data-id]").dataset.id);
            if (btn.dataset.act === "edit") return openAnnouncementForm(a);
            if (!(await confirmDialog({ title: "Delete this announcement?", message: "“" + a.title + "” will be removed for everyone, with its comments and reactions.", confirmLabel: "Delete", danger: true }))) return;
            try {
                await api("/api/announcements/" + a.id + "/delete", {});
                toast("Announcement deleted.");
                render();
            } catch (err) { toast(err.message); }
        });

        if (state.pendingAnnouncement) {
            const el = document.querySelector('.announcement[data-id="' + state.pendingAnnouncement + '"]');
            state.pendingAnnouncement = null;
            if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("flash"); }
        }

        // Opening the page marks everything as read.
        if (list.some(function (a) { return a.unread; })) {
            api("/api/announcements/seen", {}).then(function (r) { state.me = r.user; renderChrome(); }).catch(function () {});
        }
    }

    function openAnnouncementForm(a, publishLocal) {
        const v = a || { title: "", body: "", companies: [], pinned: false, important: false, allowComments: true, requireAck: false, publishAt: null, expiresAt: null };
        const scheduled = a && a.state === "scheduled";
        const m = openModal(
            '<h2 class="modal-title">' + (a ? "Edit announcement" : "New announcement") + "</h2>" +
            '<form novalidate id="ann-form">' +
            '<label for="ann-title">Title</label><input type="text" id="ann-title" maxlength="150" value="' + esc(v.title) + '">' +
            '<label for="ann-body">Message</label><textarea id="ann-body" rows="7" maxlength="10000">' + esc(v.body) + "</textarea>" +
            '<p class="hint">Line breaks are kept and web links become clickable.</p>' +
            audienceField(v.companies) +
            '<div class="grid-2"><div><label for="ann-publish">Publish <span class="muted small">(optional)</span></label>' +
            '<input type="datetime-local" id="ann-publish" value="' + esc(publishLocal || (scheduled || !a ? toLocalInput(scheduled ? v.publishAt : null) : "")) + '">' +
            '<p class="hint">Leave empty to publish now.</p></div>' +
            '<div><label for="ann-expire">Remove after <span class="muted small">(optional)</span></label>' +
            '<input type="datetime-local" id="ann-expire" value="' + esc(toLocalInput(v.expiresAt)) + '">' +
            '<p class="hint">It disappears for staff after this time.</p></div></div>' +
            '<div class="option-row"><label class="inline-check"><input type="checkbox" id="ann-pinned"' + (v.pinned ? " checked" : "") + "> Pin to the top</label>" +
            '<label class="inline-check"><input type="checkbox" id="ann-important"' + (v.important ? " checked" : "") + "> Mark as important</label>" +
            '<label class="inline-check"><input type="checkbox" id="ann-comments"' + (v.allowComments !== false ? " checked" : "") + "> Allow comments</label>" +
            '<label class="inline-check"><input type="checkbox" id="ann-ack"' + (v.requireAck ? " checked" : "") + "> Staff must acknowledge</label></div>" +
            '<div class="form-error" id="ann-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
            '<button type="submit" class="btn btn-primary" id="ann-save">' + (a ? "Save changes" : "Post announcement") + "</button></div></form>",
            { wide: true }
        );
        const toIso = function (value) { return value ? new Date(value).toISOString() : ""; };
        $("#ann-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            formError($("#ann-error", m.el), "");
            $("#ann-save", m.el).disabled = true;
            try {
                const publish = $("#ann-publish", m.el).value;
                await api(a ? "/api/announcements/" + a.id : "/api/announcements", {
                    title: $("#ann-title", m.el).value,
                    body: $("#ann-body", m.el).value,
                    companies: readAudience(m.el),
                    pinned: $("#ann-pinned", m.el).checked,
                    important: $("#ann-important", m.el).checked,
                    allowComments: $("#ann-comments", m.el).checked,
                    requireAck: $("#ann-ack", m.el).checked,
                    publishAt: publish ? toIso(publish) : (a && !scheduled ? v.publishAt : ""),
                    expiresAt: toIso($("#ann-expire", m.el).value),
                });
                closeModal();
                toast(publish && new Date(publish) > new Date() ? "Announcement scheduled." : a ? "Announcement updated." : "Announcement posted.");
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
                    " · Updated " + esc(fmtDate(d.updatedAt)) + (d.version > 1 ? ' · <button type="button" class="link-btn" data-act="versions">Version ' + d.version + " \u00b7 history</button>" : "") + "</div>" +
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
            if (act === "versions") return openVersions(d);
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
        if (state.pendingDocSearch) {
            $("#doc-search").value = state.pendingDocSearch;
            state.pendingDocSearch = null;
        }
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

    async function openVersions(d) {
        let r;
        try { r = await api("/api/documents/" + d.id + "/versions"); } catch (err) { return toast(err.message); }
        openModal(
            '<h2 class="modal-title">Version history</h2><p class="muted">' + esc(r.title) + "</p>" +
            '<ol class="version-list">' + r.versions.map(function (v) {
                return '<li class="' + (v.current ? "current" : "") + '"><div class="vl-head"><strong>Version ' + v.version + "</strong>" + (v.current ? ' <span class="badge badge-green">Current</span>' : "") +
                    '<span class="muted small">' + esc(fmtDate(v.uploadedAt)) + (v.uploadedByName ? " \u00b7 " + esc(v.uploadedByName) : "") + (v.replacedAt ? " \u00b7 replaced " + esc(fmtDate(v.replacedAt)) : "") + "</span>" +
                    (v.current ? '<a class="btn btn-ghost btn-small" href="/api/documents/' + d.id + '/file?download=1">' + icon("download") + "</a>" : '<a class="btn btn-ghost btn-small" href="/api/documents/' + d.id + "/versions/" + v.version + '/file">' + icon("download") + "</a>") + "</div>" +
                    (v.note ? '<p class="vl-note">' + esc(v.note) + "</p>" : "") +
                    '<div class="muted small">' + esc(v.file.name) + " \u00b7 " + fileSize(v.file.size) + (d.requiresAck ? " \u00b7 acknowledged by " + v.ackCount + (v.acknowledgedByMe ? " (including you)" : "") : "") + "</div>" +
                    (v.acks && v.acks.length ? '<details class="vl-acks"><summary>Who acknowledged version ' + v.version + "</summary><ul>" + v.acks.map(function (a) { return "<li>" + esc(a.name) + ' <span class="muted small">' + esc(fmtDateTime(a.at)) + "</span></li>"; }).join("") + "</ul></details>" : "") +
                    "</li>";
            }).join("") + "</ol>" +
            '<div class="modal-actions"><button type="button" class="btn btn-primary" data-close>Done</button></div>'
        );
    }

    function openReplaceFile(d) {
        let file = null;
        const m = openModal(
            '<h2 class="modal-title">Upload a new version</h2>' +
            '<p class="muted">Replaces the file for “' + esc(d.title) + "” (currently " + esc(d.file.name) + ")." +
            (d.requiresAck ? " Everyone will be asked to acknowledge the new version." : "") + "</p>" +
            fileDropField("rep-file") +
            '<label for="rep-note">What\u2019s changed? <span class="muted small">(shown in the version history)</span></label><input type="text" id="rep-note" maxlength="300" placeholder="e.g. Updated the holiday section for 2027">' +
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
                await uploadFile("/api/documents/" + d.id + "/file", file, { note: $("#rep-note", m.el).value }, function (pct) { showProgress(m.el, pct); });
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

    // ================= Status / out of office =================

    const STATUSES = {
        available: { label: "Available", cls: "st-available" },
        busy: { label: "Busy", cls: "st-busy" },
        away: { label: "Away", cls: "st-away" },
        ooo: { label: "Out of office", cls: "st-ooo" },
    };

    function statusPill(status) {
        if (!status || !STATUSES[status.type]) return "";
        const s = STATUSES[status.type];
        return '<span class="status-pill ' + s.cls + '"><span class="status-dot"></span>' + esc(s.label) +
            (status.message ? '<span class="status-msg"> · ' + esc(status.message) + "</span>" : "") +
            (status.until && !status.auto ? '<span class="status-msg"> · until ' + esc(fmtDate(status.until + "T12:00:00")) + "</span>" : "") + "</span>";
    }

    function openStatusModal() {
        const cur = state.me.status || {};
        const m = openModal(
            '<h2 class="modal-title">Set your status</h2>' +
            '<p class="muted">Colleagues see this on your profile and in the Staff Directory.</p>' +
            '<form id="status-form" novalidate><div class="status-options">' +
            Object.keys(STATUSES).map(function (k) {
                return '<label class="status-option ' + STATUSES[k].cls + '"><input type="radio" name="status-type" value="' + k + '"' + (cur.type === k ? " checked" : "") + '>' +
                    '<span class="status-dot"></span><span>' + esc(STATUSES[k].label) + "</span></label>";
            }).join("") + "</div>" +
            '<label for="st-msg">Message <span class="muted small">(optional)</span></label>' +
            '<input type="text" id="st-msg" maxlength="120" value="' + esc(cur.message || "") + '" placeholder="e.g. On holiday, back Monday">' +
            '<label for="st-until">Clear after <span class="muted small">(optional)</span></label>' +
            '<input type="date" id="st-until" value="' + esc(cur.until || "") + '">' +
            '<div class="form-error" id="st-error" hidden></div>' +
            '<div class="modal-actions">' + (state.me.status ? '<button type="button" class="btn btn-ghost" id="st-clear">Clear status</button>' : "") +
            '<button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save</button></div></form>'
        );
        const save = async function (body) {
            try {
                state.me = (await api("/api/me/status", body)).user;
                renderChrome();
                closeModal();
                toast(body.type ? "Status updated." : "Status cleared.");
                if (window.location.pathname === "/home") render();
            } catch (err) { formError($("#st-error", m.el), err.message); }
        };
        $("#status-form", m.el).addEventListener("submit", function (e) {
            e.preventDefault();
            const picked = $("input[name=status-type]:checked", m.el);
            if (!picked) return formError($("#st-error", m.el), "Choose a status.");
            save({ type: picked.value, message: $("#st-msg", m.el).value, until: $("#st-until", m.el).value });
        });
        if ($("#st-clear", m.el)) $("#st-clear", m.el).addEventListener("click", function () { save({ type: "" }); });
    }

    // ================= Coming up (home) =================

    const CAL_KINDS = {
        event: { icon: "calendar", label: "Event" },
        "bank-holiday": { icon: "flag", label: "Bank holiday" },
        birthday: { icon: "gift", label: "Birthday" },
        anniversary: { icon: "star", label: "Work anniversary" },
        leave: { icon: "sun", label: "Leave" },
    };
    const EVENT_TYPE_LABELS = { event: "Event", meeting: "Meeting", social: "Social", training: "Training", holiday: "Company holiday" };

    function isoDay(d) {
        const pad = function (n) { return String(n).padStart(2, "0"); };
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }

    function dayLabel(date) {
        const today = isoDay(new Date());
        const tomorrow = isoDay(new Date(Date.now() + 86400000));
        if (date === today) return "Today";
        if (date === tomorrow) return "Tomorrow";
        return new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    }

    function calItemClass(item) {
        return "ci-" + (item.kind === "event" ? item.type : item.kind);
    }

    async function loadComingUp(box) {
        const from = isoDay(new Date());
        const to = isoDay(new Date(Date.now() + 21 * 86400000));
        try {
            const d = await api("/api/calendar?from=" + from + "&to=" + to);
            const items = d.items.slice(0, 8);
            box.innerHTML = '<div class="panel-head tight"><h2 class="section-title">' + icon("calendar") + "Coming up</h2>" +
                '<a class="small link-arrow" href="/calendar" data-link>Calendar</a></div>' +
                (items.length ? '<ul class="upcoming">' + items.map(function (it) {
                    return '<li class="up-item ' + calItemClass(it) + '"><span class="up-icon">' + icon((CAL_KINDS[it.kind] || CAL_KINDS.event).icon) + "</span>" +
                        '<span class="up-text"><span class="up-title">' + esc(it.title) + '</span><span class="muted small">' + esc(dayLabel(it.startDate)) +
                        (it.startTime ? " · " + esc(it.startTime) : "") + (it.location ? " · " + esc(it.location) : "") + "</span></span></li>";
                }).join("") + "</ul>" : '<p class="muted small">Nothing in the next three weeks.</p>');
        } catch (e) { box.hidden = true; }
    }

    // ================= Onboarding (home panel) =================

    const OWNER_LABELS = { employee: "New starter", supervisor: "Supervisor", hr: "HR" };

    function checklistHtml(c, opts) {
        opts = opts || {};
        const pct = c.total ? Math.round(c.done / c.total * 100) : 0;
        return '<div class="checklist" data-checklist="' + c.id + '">' +
            '<div class="cl-head">' + avatar(c.person, "sm") + '<div class="cl-who"><div class="emp-name">' + esc(c.person.displayName) + "</div>" +
            '<div class="muted small">' + esc(c.name) + " · " + c.done + " of " + c.total + " done</div>" +
            (c.kind === "leaver" ? '<span class="badge badge-red leaver-badge">' + icon("logout") + "Leaving" + (c.lastDay ? " \u00b7 last day " + esc(fmtDate(c.lastDay + "T12:00:00")) : "") + "</span>" : "") + "</div>" +
            (opts.menu || "") + "</div>" +
            '<div class="progress"><span data-pct="' + pct + '"></span></div>' +
            '<ul class="cl-tasks">' + (opts.compact ? c.tasks.filter(function (t) { return !t.doneAt && t.canTick; }).slice(0, 4) : c.tasks).map(function (t) {
                return '<li class="cl-task' + (t.doneAt ? " done" : "") + '"><label class="cl-check' + (t.canTick ? "" : " locked") + '">' +
                    '<input type="checkbox" data-task="' + t.id + '"' + (t.doneAt ? " checked" : "") + (t.canTick ? "" : " disabled") + ">" +
                    '<span class="cl-box">' + icon("tick") + "</span>" +
                    '<span class="cl-text"><span class="cl-title">' + esc(t.title) + "</span>" +
                    (t.description ? '<span class="muted small">' + esc(t.description) + "</span>" : "") +
                    (t.actionLabel ? '<span class="cl-action">' + icon("lock") + esc(t.actionLabel) + "</span>" : "") +
                    (t.doneAt ? '<span class="muted small">Done ' + esc(fmtDate(t.doneAt)) + (t.doneByName ? " by " + esc(t.doneByName) : "") + "</span>" : "") +
                    '</span><span class="badge owner-' + t.owner + '">' + esc(t.owner === "employee" && c.kind === "leaver" ? "Leaver" : (OWNER_LABELS[t.owner] || t.owner)) + "</span></label></li>";
            }).join("") + "</ul>" +
            (opts.compact ? (function () {
                const left = c.tasks.filter(function (t) { return !t.doneAt && t.canTick; }).length;
                return left > 4 ? '<p class="muted small cl-more">+' + (left - 4) + " more for you to do" + (can("onboarding.manage") ? ' \u00b7 <a href="/onboarding" data-link>Open onboarding</a>' : "") + "</p>"
                    : !left ? '<p class="muted small cl-more">Nothing left for you \u2014 waiting on others.</p>' : "";
            })() : "") + "</div>";
    }

    function paintProgress(root) {
        $$(".progress [data-pct], .ack-bar [data-pct], .poll-bar [data-pct]", root).forEach(function (b) { b.style.width = b.dataset.pct + "%"; });
    }

    function wireChecklists(container, onChange) {
        container.addEventListener("change", async function (e) {
            const cb = e.target.closest("[data-task]");
            if (!cb) return;
            const id = cb.closest("[data-checklist]").dataset.checklist;
            try {
                const r = await api("/api/onboarding/" + id + "/task", { taskId: cb.dataset.task, done: cb.checked });
                state.me = r.user;
                renderChrome();
                onChange(r.checklist);
            } catch (err) {
                cb.checked = !cb.checked;
                toast(err.message);
            }
        });
    }

    async function loadMyOnboarding(box) {
        try {
            const d = await api("/api/onboarding/mine");
            if (!d.checklists.length) return;
            box.hidden = false;
            const draw = function () {
                box.innerHTML = '<h2 class="section-title">' + icon("check") + "Onboarding</h2>" + d.checklists.map(function (c) { return checklistHtml(c, { compact: true }); }).join("");
                paintProgress(box);
            };
            draw();
            wireChecklists(box, function (updated) {
                d.checklists = d.checklists.map(function (c) { return c.id === updated.id ? updated : c; });
                draw();
                if (updated.done === updated.total) toast("Onboarding complete — welcome aboard!");
            });
        } catch (e) { /* not shown */ }
    }

    // ================= Calendar =================

    async function viewCalendar(root, current) {
        if (state.pendingCalendarDate) {
            state.calendarMonth = state.pendingCalendarDate.slice(0, 7);
            state.pendingCalendarDate = null;
        }
        const month = state.calendarMonth || isoDay(new Date()).slice(0, 7);
        const [y, mth] = month.split("-").map(Number);
        const first = new Date(y, mth - 1, 1);
        const gridStart = new Date(first);
        gridStart.setDate(1 - ((first.getDay() + 6) % 7)); // Monday first
        const gridEnd = new Date(gridStart);
        gridEnd.setDate(gridStart.getDate() + 41);
        const data = await api("/api/calendar?from=" + isoDay(gridStart) + "&to=" + isoDay(gridEnd));
        if (!current()) return;
        const today = isoDay(new Date());

        const byDay = {};
        data.items.forEach(function (it) {
            for (let d = new Date(it.startDate + "T12:00:00"); isoDay(d) <= it.endDate; d.setDate(d.getDate() + 1)) {
                (byDay[isoDay(d)] = byDay[isoDay(d)] || []).push(it);
            }
        });
        const upcoming = data.items.filter(function (it) { return it.endDate >= today; }).slice(0, 12);
        const itemsById = {};
        data.items.forEach(function (it) { itemsById[it.id] = it; });

        let cells = "";
        for (let i = 0; i < 42; i++) {
            const d = new Date(gridStart);
            d.setDate(gridStart.getDate() + i);
            const key = isoDay(d);
            const items = byDay[key] || [];
            const holiday = items.some(function (it) { return it.kind === "bank-holiday" || it.type === "holiday"; });
            cells += '<div class="cal-day' + (d.getMonth() !== mth - 1 ? " other" : "") + (key === today ? " today" : "") + (holiday ? " holiday" : "") +
                ([0, 6].indexOf(d.getDay()) !== -1 ? " weekend" : "") + '" data-day="' + key + '">' +
                '<span class="cal-num">' + d.getDate() + "</span>" +
                items.slice(0, 3).map(function (it) {
                    return '<button type="button" class="cal-item ' + calItemClass(it) + '" data-item="' + esc(it.id) + '">' +
                        (it.startTime && it.startDate === key ? '<span class="cal-time">' + esc(it.startTime) + "</span>" : "") + esc(it.title) + "</button>";
                }).join("") +
                (items.length > 3 ? '<button type="button" class="cal-more" data-more="' + key + '">+' + (items.length - 3) + " more</button>" : "") +
                "</div>";
        }

        root.innerHTML =
            '<div class="page-head"><div><h1>Calendar</h1><p class="muted">Company events, UK bank holidays, birthdays and work anniversaries.</p></div>' +
            (data.canManage ? '<div class="page-actions"><button type="button" class="btn btn-primary" id="new-event">' + icon("plus") + "Add event</button></div>" : "") + "</div>" +
            '<div class="cal-layout"><section class="panel cal-panel">' +
            '<div class="cal-toolbar"><div class="btn-row"><button type="button" class="icon-btn" id="cal-prev" aria-label="Previous month">' + icon("chevronLeft") + "</button>" +
            '<button type="button" class="btn btn-ghost btn-small" id="cal-today">Today</button>' +
            '<button type="button" class="icon-btn" id="cal-next" aria-label="Next month">' + icon("chevronRight") + "</button></div>" +
            '<h2 class="cal-title">' + esc(first.toLocaleDateString("en-GB", { month: "long", year: "numeric" })) + "</h2>" +
            '<div class="cal-legend"><span class="ci-event">Events</span><span class="ci-bank-holiday">Holidays</span><span class="ci-birthday">Birthdays</span><span class="ci-anniversary">Anniversaries</span><span class="ci-leave">Leave</span></div></div>' +
            '<div class="cal-grid"><div class="cal-dow">Mon</div><div class="cal-dow">Tue</div><div class="cal-dow">Wed</div><div class="cal-dow">Thu</div><div class="cal-dow">Fri</div><div class="cal-dow">Sat</div><div class="cal-dow">Sun</div>' +
            cells + "</div></section>" +
            '<aside class="panel cal-side"><h2 class="section-title">' + icon("clock") + "Upcoming</h2>" +
            (upcoming.length ? '<ul class="upcoming">' + upcoming.map(function (it) {
                return '<li class="up-item ' + calItemClass(it) + '" data-item="' + esc(it.id) + '"><span class="up-icon">' + icon((CAL_KINDS[it.kind] || CAL_KINDS.event).icon) + "</span>" +
                    '<span class="up-text"><span class="up-title">' + esc(it.title) + '</span><span class="muted small">' + esc(dayLabel(it.startDate)) +
                    (it.endDate !== it.startDate ? " – " + esc(dayLabel(it.endDate)) : "") + (it.startTime ? " · " + esc(it.startTime) : "") + "</span></span></li>";
            }).join("") + "</ul>" : '<p class="muted small">Nothing coming up this month.</p>') +
            "</aside></div>";

        const shift = function (delta) {
            const d = new Date(y, mth - 1 + delta, 1);
            state.calendarMonth = isoDay(d).slice(0, 7);
            render();
        };
        $("#cal-prev").addEventListener("click", function () { shift(-1); });
        $("#cal-next").addEventListener("click", function () { shift(1); });
        $("#cal-today").addEventListener("click", function () { state.calendarMonth = null; render(); });
        if ($("#new-event")) $("#new-event").addEventListener("click", function () { openEventForm(null, today); });
        root.addEventListener("click", function (e) {
            const item = e.target.closest("[data-item]");
            if (item) return openCalendarItem(itemsById[item.dataset.item]);
            const more = e.target.closest("[data-more]");
            if (more) return openDayList(more.dataset.more, byDay[more.dataset.more]);
            const day = e.target.closest(".cal-day");
            if (day && data.canManage && !e.target.closest("button")) openEventForm(null, day.dataset.day);
        });
    }

    function openDayList(day, items) {
        const m = openModal('<h2 class="modal-title">' + esc(new Date(day + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })) + "</h2>" +
            '<ul class="upcoming">' + items.map(function (it) {
                return '<li class="up-item ' + calItemClass(it) + '" data-item="' + esc(it.id) + '"><span class="up-icon">' + icon((CAL_KINDS[it.kind] || CAL_KINDS.event).icon) + "</span>" +
                    '<span class="up-text"><span class="up-title">' + esc(it.title) + '</span><span class="muted small">' + (it.startTime ? esc(it.startTime) : "All day") + "</span></span></li>";
            }).join("") + "</ul>");
        m.el.addEventListener("click", function (e) {
            const li = e.target.closest("[data-item]");
            if (li) openCalendarItem(items.find(function (x) { return x.id === li.dataset.item; }));
        });
    }

    function openCalendarItem(it) {
        if (!it) return;
        const kind = it.kind === "event" ? EVENT_TYPE_LABELS[it.type] || "Event" : CAL_KINDS[it.kind].label;
        const when = it.startDate === it.endDate
            ? new Date(it.startDate + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
            : fmtDate(it.startDate + "T12:00:00") + " – " + fmtDate(it.endDate + "T12:00:00");
        const m = openModal(
            '<div class="event-detail ' + calItemClass(it) + '"><span class="ed-icon">' + icon((CAL_KINDS[it.kind] || CAL_KINDS.event).icon) + "</span>" +
            '<span class="badge">' + esc(kind) + "</span></div>" +
            '<h2 class="modal-title">' + esc(it.title) + "</h2>" +
            '<div class="detail-row">' + icon("calendar") + "<div>" + esc(when) +
            (it.startTime ? '<div class="muted small">' + esc(it.startTime) + (it.endTime ? " – " + esc(it.endTime) : "") + "</div>" : it.kind === "event" ? '<div class="muted small">All day</div>' : "") + "</div></div>" +
            (it.location ? '<div class="detail-row">' + icon("pin") + "<div>" + esc(it.location) + "</div></div>" : "") +
            (it.description ? '<div class="detail-row">' + icon("file") + '<div class="ann-body">' + richText(it.description) + "</div></div>" : "") +
            (it.companies ? '<div class="chips">' + audienceChips(it.companies) + "</div>" : "") +
            '<div class="modal-actions">' +
            (it.canEdit ? '<button type="button" class="btn btn-ghost danger-text" id="ev-delete">' + icon("trash") + "Delete</button>" +
                '<button type="button" class="btn btn-ghost" id="ev-edit">' + icon("edit") + "Edit</button>" : "") +
            '<button type="button" class="btn btn-primary" data-close>Close</button></div>'
        );
        if (it.canEdit) {
            $("#ev-edit", m.el).addEventListener("click", function () { openEventForm(it); });
            $("#ev-delete", m.el).addEventListener("click", async function () {
                if (!(await confirmDialog({ title: "Delete “" + it.title + "”?", message: "It will be removed from everyone’s calendar.", confirmLabel: "Delete", danger: true }))) return;
                try {
                    await api("/api/events/" + it.id + "/delete", {});
                    toast("Event deleted.");
                    render();
                } catch (err) { toast(err.message); }
            });
        }
    }

    function openEventForm(ev, day) {
        const v = ev || { title: "", type: "event", startDate: day, endDate: day, allDay: true, startTime: "", endTime: "", location: "", description: "", companies: [] };
        const m = openModal(
            '<h2 class="modal-title">' + (ev ? "Edit event" : "Add event") + "</h2>" +
            '<form id="ev-form" novalidate>' +
            '<label for="ev-title">Title</label><input type="text" id="ev-title" maxlength="150" value="' + esc(v.title) + '">' +
            '<label for="ev-type">Type</label><select id="ev-type">' + Object.keys(EVENT_TYPE_LABELS).map(function (k) {
                return '<option value="' + k + '"' + (v.type === k ? " selected" : "") + ">" + esc(EVENT_TYPE_LABELS[k]) + "</option>";
            }).join("") + "</select>" +
            '<div class="grid-2"><div><label for="ev-start">Starts</label><input type="date" id="ev-start" value="' + esc(v.startDate) + '"></div>' +
            '<div><label for="ev-end">Ends</label><input type="date" id="ev-end" value="' + esc(v.endDate) + '"></div></div>' +
            '<label class="inline-check option-row"><input type="checkbox" id="ev-allday"' + (v.allDay ? " checked" : "") + "> All day</label>" +
            '<div class="grid-2" id="ev-times"' + (v.allDay ? " hidden" : "") + '><div><label for="ev-st">From</label><input type="time" id="ev-st" value="' + esc(v.startTime || "") + '"></div>' +
            '<div><label for="ev-et">To</label><input type="time" id="ev-et" value="' + esc(v.endTime || "") + '"></div></div>' +
            '<label for="ev-loc">Location <span class="muted small">(optional)</span></label><input type="text" id="ev-loc" maxlength="150" value="' + esc(v.location || "") + '">' +
            '<label for="ev-desc">Details <span class="muted small">(optional)</span></label><textarea id="ev-desc" rows="3" maxlength="2000">' + esc(v.description || "") + "</textarea>" +
            audienceField(v.companies || []) +
            '<div class="form-error" id="ev-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">' + (ev ? "Save changes" : "Add to calendar") + "</button></div></form>",
            { wide: true }
        );
        $("#ev-allday", m.el).addEventListener("change", function (e) { $("#ev-times", m.el).hidden = e.target.checked; });
        $("#ev-start", m.el).addEventListener("change", function (e) { if ($("#ev-end", m.el).value < e.target.value) $("#ev-end", m.el).value = e.target.value; });
        $("#ev-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            const allDay = $("#ev-allday", m.el).checked;
            try {
                await api(ev ? "/api/events/" + ev.id : "/api/events", {
                    title: $("#ev-title", m.el).value,
                    type: $("#ev-type", m.el).value,
                    startDate: $("#ev-start", m.el).value,
                    endDate: $("#ev-end", m.el).value,
                    allDay: allDay,
                    startTime: allDay ? "" : $("#ev-st", m.el).value,
                    endTime: allDay ? "" : $("#ev-et", m.el).value,
                    location: $("#ev-loc", m.el).value,
                    description: $("#ev-desc", m.el).value,
                    companies: readAudience(m.el),
                });
                closeModal();
                state.calendarMonth = $("#ev-start", m.el).value.slice(0, 7);
                toast(ev ? "Event updated." : "Event added.");
                if (window.location.pathname === "/calendar") render(); else navigate("/calendar");
            } catch (err) { formError($("#ev-error", m.el), err.message); }
        });
    }

    // ================= Polls & surveys =================

    async function viewPolls(root, current) {
        const data = await api("/api/polls");
        if (!current()) return;
        let tab = "open";
        root.innerHTML =
            '<div class="page-head"><div><h1>Polls &amp; surveys</h1><p class="muted">Quick polls and longer surveys. Anonymous ones never record who answered what.</p></div>' +
            (data.canManage ? '<div class="page-actions"><button type="button" class="btn btn-primary" id="new-poll">' + icon("plus") + "New poll</button></div>" : "") + "</div>" +
            '<div class="company-tabs" id="poll-tabs"><button type="button" data-tab="open">Open <span class="tab-count">' + data.polls.filter(function (p) { return p.open; }).length + "</span></button>" +
            '<button type="button" data-tab="closed">Closed <span class="tab-count">' + data.polls.filter(function (p) { return !p.open; }).length + "</span></button></div>" +
            '<div id="poll-list" class="poll-grid"></div>';

        function draw() {
            $$("#poll-tabs [data-tab]").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === tab); });
            const list = data.polls.filter(function (p) { return tab === "open" ? p.open : !p.open; });
            $("#poll-list").innerHTML = list.length ? list.map(function (p) {
                const action = p.canRespond
                    ? '<button type="button" class="btn btn-primary btn-small" data-respond="' + p.id + '">' + icon("edit") + "Answer</button>"
                    : p.responded ? '<span class="badge badge-green">' + icon("tick") + "You’ve answered</span>" : "";
                return '<article class="poll-card" data-poll="' + p.id + '">' +
                    '<div class="poll-top"><span class="poll-icon">' + icon("chart") + "</span>" +
                    '<div class="poll-flags">' + (p.anonymous ? '<span class="badge">Anonymous</span>' : "") + (p.open ? "" : '<span class="badge">Closed</span>') +
                    (p.canManage ? '<div class="nav-item row-menu"><button type="button" class="icon-btn" data-menu aria-haspopup="true" aria-expanded="false" aria-label="Poll options">' + icon("more") + "</button>" +
                        '<div class="menu menu-right menu-row" role="menu" hidden>' +
                        '<button type="button" class="menu-item compact" data-act="results">' + icon("chart") + "<span>Results</span></button>" +
                        (p.responseCount ? "" : '<button type="button" class="menu-item compact" data-act="edit">' + icon("edit") + "<span>Edit</span></button>") +
                        '<button type="button" class="menu-item compact" data-act="' + (p.open ? "close" : "reopen") + '">' + icon(p.open ? "lock" : "refresh") + "<span>" + (p.open ? "Close poll" : "Reopen poll") + "</span></button>" +
                        '<div class="menu-sep"></div><button type="button" class="menu-item compact danger" data-act="delete">' + icon("trash") + "<span>Delete</span></button></div></div>" : "") +
                    "</div></div>" +
                    '<h2 class="poll-title">' + esc(p.title) + "</h2>" +
                    (p.description ? '<p class="muted small poll-desc">' + esc(p.description) + "</p>" : "") +
                    '<div class="poll-meta muted small">' + p.questions.length + (p.questions.length === 1 ? " question" : " questions") +
                    " · " + p.responseCount + (p.audienceCount !== undefined ? " of " + p.audienceCount : "") + " answered" +
                    (p.closesAt && p.open ? " · closes " + esc(fmtDate(p.closesAt)) : "") + "</div>" +
                    '<div class="poll-actions">' + action + (p.results ? '<button type="button" class="btn btn-ghost btn-small" data-results="' + p.id + '">' + icon("chart") + "Results</button>" : "") + "</div>" +
                    "</article>";
            }).join("") : '<div class="empty-page">' + icon("chart", "big") + "<h2>" + (tab === "open" ? "No open polls" : "No closed polls") + "</h2>" +
                '<p class="muted">' + (data.canManage && tab === "open" ? "Create one with <strong>New poll</strong>." : "Check back soon.") + "</p></div>";
        }

        const byId = function (id) { return data.polls.find(function (p) { return p.id === id; }); };
        root.addEventListener("click", async function (e) {
            const t = e.target.closest("[data-tab]");
            if (t) { tab = t.dataset.tab; return draw(); }
            if (e.target.closest("#new-poll")) return openPollBuilder(null);
            const r = e.target.closest("[data-respond]");
            if (r) return openPollResponse(byId(r.dataset.respond));
            const res = e.target.closest("[data-results]");
            if (res) return openPollResults(byId(res.dataset.results));
            const act = e.target.closest("[data-act]");
            if (!act) return;
            closeMenus();
            const p = byId(act.closest("[data-poll]").dataset.poll);
            try {
                if (act.dataset.act === "results") return openPollResults(p);
                if (act.dataset.act === "edit") return openPollBuilder(p);
                if (act.dataset.act === "delete") {
                    if (!(await confirmDialog({ title: "Delete “" + p.title + "”?", message: "The poll and all its answers will be deleted.", confirmLabel: "Delete", danger: true }))) return;
                    await api("/api/polls/" + p.id + "/delete", {});
                    toast("Poll deleted.");
                } else {
                    await api("/api/polls/" + p.id + "/" + act.dataset.act, {});
                    toast(act.dataset.act === "close" ? "Poll closed." : "Poll reopened.");
                }
                render();
            } catch (err) { toast(err.message); }
        });
        draw();
        if (state.pendingPoll) {
            const p = byId(state.pendingPoll);
            state.pendingPoll = null;
            if (p && p.canRespond) openPollResponse(p); else if (p && p.results) openPollResults(p);
        }
    }

    function openPollResponse(p) {
        const m = openModal(
            '<h2 class="modal-title">' + esc(p.title) + "</h2>" +
            (p.description ? '<p class="muted">' + esc(p.description) + "</p>" : "") +
            (p.anonymous ? '<p class="anon-note">' + icon("shield") + "This poll is anonymous. Nobody can see which answers are yours.</p>" : "") +
            '<form id="poll-form" novalidate>' + p.questions.map(function (q, i) {
                let input = "";
                if (q.type === "single" || q.type === "multiple") {
                    input = '<div class="poll-options">' + q.options.map(function (o) {
                        return '<label class="poll-option"><input type="' + (q.type === "single" ? "radio" : "checkbox") + '" name="q-' + q.id + '" value="' + esc(o) + '"><span>' + esc(o) + "</span></label>";
                    }).join("") + "</div>";
                } else if (q.type === "rating") {
                    input = '<div class="rating" data-rating="' + q.id + '">' + [1, 2, 3, 4, 5].map(function (n) {
                        return '<button type="button" class="rating-star" data-value="' + n + '" aria-label="' + n + ' out of 5">' + icon("star") + "</button>";
                    }).join("") + "</div>";
                } else {
                    input = '<textarea name="q-' + q.id + '" rows="3" maxlength="2000"></textarea>';
                }
                return '<fieldset class="poll-q"><legend>' + (i + 1) + ". " + esc(q.text) + (q.required ? "" : ' <span class="muted small">(optional)</span>') +
                    (q.type === "multiple" ? ' <span class="muted small">· choose any</span>' : "") + "</legend>" + input + "</fieldset>";
            }).join("") +
            '<div class="form-error" id="poll-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Submit answers</button></div></form>',
            { wide: true }
        );
        const ratings = {};
        m.el.addEventListener("click", function (e) {
            const star = e.target.closest(".rating-star");
            if (!star) return;
            const box = star.closest("[data-rating]");
            ratings[box.dataset.rating] = Number(star.dataset.value);
            $$(".rating-star", box).forEach(function (s) { s.classList.toggle("on", Number(s.dataset.value) <= ratings[box.dataset.rating]); });
        });
        $("#poll-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            const answers = {};
            p.questions.forEach(function (q) {
                if (q.type === "single") { const c = $('input[name="q-' + q.id + '"]:checked', m.el); if (c) answers[q.id] = c.value; }
                else if (q.type === "multiple") answers[q.id] = $$('input[name="q-' + q.id + '"]:checked', m.el).map(function (c) { return c.value; });
                else if (q.type === "rating") { if (ratings[q.id]) answers[q.id] = ratings[q.id]; }
                else answers[q.id] = $('textarea[name="q-' + q.id + '"]', m.el).value;
            });
            try {
                const r = await api("/api/polls/" + p.id + "/respond", { answers: answers });
                state.me = r.user;
                renderChrome();
                closeModal();
                toast("Thanks for answering!");
                if (window.location.pathname === "/polls") render();
                if (r.poll.results) openPollResults(r.poll);
            } catch (err) { formError($("#poll-error", m.el), err.message); }
        });
    }

    function openPollResults(p) {
        if (!p.results) return toast("Results aren’t shared for this poll.");
        const m = openModal(
            '<h2 class="modal-title">' + esc(p.title) + "</h2>" +
            '<p class="muted">' + p.responseCount + (p.responseCount === 1 ? " response" : " responses") + (p.anonymous ? " · anonymous" : "") + "</p>" +
            p.results.map(function (q, i) {
                let body = "";
                if (q.options) {
                    const max = Math.max.apply(null, q.options.map(function (o) { return o.count; }).concat(1));
                    body = q.options.map(function (o) {
                        const pct = q.total ? Math.round(o.count / q.total * 100) : 0;
                        return '<div class="poll-result"><div class="pr-row"><span>' + esc(o.option) + '</span><span class="muted small">' + o.count + " · " + pct + "%</span></div>" +
                            '<div class="poll-bar' + (o.count === max && o.count ? " top" : "") + '"><span data-pct="' + pct + '"></span></div></div>';
                    }).join("");
                } else if (q.distribution) {
                    body = '<div class="rating-avg">' + (q.average ? q.average.toFixed(1) : "–") + '<span class="muted small"> / 5 average</span></div>' +
                        q.distribution.map(function (n, idx) {
                            const pct = q.total ? Math.round(n / q.total * 100) : 0;
                            return '<div class="poll-result compact"><div class="pr-row"><span>' + (idx + 1) + " ★</span><span class=\"muted small\">" + n + "</span></div>" +
                                '<div class="poll-bar"><span data-pct="' + pct + '"></span></div></div>';
                        }).join("");
                } else {
                    body = q.answers.length ? '<ul class="text-answers">' + q.answers.map(function (a) {
                        return "<li>" + richText(a.text) + (a.by ? '<span class="muted small"> — ' + esc(a.by) + "</span>" : "") + "</li>";
                    }).join("") + "</ul>" : '<p class="muted small">No written answers yet.</p>';
                }
                return '<section class="poll-q"><h3 class="pq-title">' + (i + 1) + ". " + esc(q.text) + '</h3><p class="muted small">' + q.total + " answered</p>" + body + "</section>";
            }).join("") +
            '<div class="modal-actions"><button type="button" class="btn btn-primary" data-close>Done</button></div>',
            { wide: true }
        );
        paintProgress(m.el);
    }

    function openPollBuilder(p) {
        const v = p || { title: "", description: "", anonymous: false, showResults: true, closesAt: null, companies: [], questions: [{ text: "", type: "single", options: ["", ""], required: true }] };
        let questions = v.questions.map(function (q) { return { id: q.id, text: q.text, type: q.type, options: (q.options || []).slice(), required: q.required !== false }; });
        const TYPE_LABELS = { single: "Single choice", multiple: "Multiple choice", rating: "Rating (1–5)", text: "Written answer" };
        const m = openModal(
            '<h2 class="modal-title">' + (p ? "Edit poll" : "New poll") + "</h2>" +
            '<form id="pb-form" novalidate>' +
            '<label for="pb-title">Title</label><input type="text" id="pb-title" maxlength="150" value="' + esc(v.title) + '">' +
            '<label for="pb-desc">Description <span class="muted small">(optional)</span></label><textarea id="pb-desc" rows="2" maxlength="2000">' + esc(v.description) + "</textarea>" +
            '<h3 class="detail-head">Questions</h3><div id="pb-questions"></div>' +
            '<button type="button" class="btn btn-link" id="pb-add">' + icon("plus") + "Add a question</button>" +
            '<div class="grid-2"><div><label for="pb-close">Closes <span class="muted small">(optional)</span></label><input type="date" id="pb-close" value="' + esc(v.closesAt ? v.closesAt.slice(0, 10) : "") + '"></div><div></div></div>' +
            audienceField(v.companies) +
            '<div class="option-row"><label class="inline-check"><input type="checkbox" id="pb-anon"' + (v.anonymous ? " checked" : "") + "> Anonymous</label>" +
            '<label class="inline-check"><input type="checkbox" id="pb-show"' + (v.showResults ? " checked" : "") + "> Show results to staff after they answer</label></div>" +
            '<div class="form-error" id="pb-error" hidden></div>' +
            '<div class="modal-actions sticky-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">' + (p ? "Save poll" : "Publish poll") + "</button></div></form>",
            { wide: true }
        );
        function drawQuestions() {
            $("#pb-questions", m.el).innerHTML = questions.map(function (q, i) {
                return '<div class="pb-q" data-q="' + i + '"><div class="pb-q-head"><span class="pb-num">' + (i + 1) + "</span>" +
                    '<select class="pb-type" aria-label="Question type">' + Object.keys(TYPE_LABELS).map(function (k) {
                        return '<option value="' + k + '"' + (q.type === k ? " selected" : "") + ">" + TYPE_LABELS[k] + "</option>";
                    }).join("") + "</select>" +
                    '<label class="inline-check"><input type="checkbox" class="pb-req"' + (q.required ? " checked" : "") + "> Required</label>" +
                    (questions.length > 1 ? '<button type="button" class="icon-btn icon-btn-sm pb-remove" aria-label="Remove question">' + icon("x") + "</button>" : "") + "</div>" +
                    '<input type="text" class="pb-text" maxlength="300" placeholder="Question" value="' + esc(q.text) + '">' +
                    (q.type === "single" || q.type === "multiple"
                        ? '<textarea class="pb-options" rows="3" placeholder="One option per line">' + esc(q.options.join("\n")) + "</textarea>"
                        : "") + "</div>";
            }).join("");
        }
        drawQuestions();
        const qEl = $("#pb-questions", m.el);
        qEl.addEventListener("input", function (e) {
            const box = e.target.closest("[data-q]");
            if (!box) return;
            const q = questions[+box.dataset.q];
            if (e.target.classList.contains("pb-text")) q.text = e.target.value;
            if (e.target.classList.contains("pb-options")) q.options = e.target.value.split("\n");
        });
        qEl.addEventListener("change", function (e) {
            const box = e.target.closest("[data-q]");
            if (!box) return;
            const q = questions[+box.dataset.q];
            if (e.target.classList.contains("pb-type")) {
                q.type = e.target.value;
                if ((q.type === "single" || q.type === "multiple") && q.options.filter(Boolean).length < 2) q.options = ["", ""];
                drawQuestions();
            }
            if (e.target.classList.contains("pb-req")) q.required = e.target.checked;
        });
        qEl.addEventListener("click", function (e) {
            if (!e.target.closest(".pb-remove")) return;
            questions.splice(+e.target.closest("[data-q]").dataset.q, 1);
            drawQuestions();
        });
        $("#pb-add", m.el).addEventListener("click", function () {
            questions.push({ text: "", type: "single", options: ["", ""], required: true });
            drawQuestions();
        });
        $("#pb-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                const close = $("#pb-close", m.el).value;
                await api(p ? "/api/polls/" + p.id : "/api/polls", {
                    title: $("#pb-title", m.el).value,
                    description: $("#pb-desc", m.el).value,
                    questions: questions.map(function (q) { return { id: q.id, text: q.text, type: q.type, options: q.options.map(function (o) { return o.trim(); }).filter(Boolean), required: q.required }; }),
                    anonymous: $("#pb-anon", m.el).checked,
                    showResults: $("#pb-show", m.el).checked,
                    closesAt: close ? new Date(close + "T23:59:00").toISOString() : "",
                    companies: readAudience(m.el),
                });
                closeModal();
                toast(p ? "Poll saved." : "Poll published.");
                if (window.location.pathname === "/polls") render(); else navigate("/polls");
            } catch (err) { formError($("#pb-error", m.el), err.message); }
        });
    }

    // ================= Onboarding (managers) =================

    async function viewOnboarding(root, current) {
        const data = await api("/api/onboarding");
        if (!current()) return;
        const active = data.checklists.filter(function (c) { return !c.completedAt; });
        const done = data.checklists.filter(function (c) { return c.completedAt; });
        const menu = '<div class="nav-item row-menu"><button type="button" class="icon-btn" data-menu aria-haspopup="true" aria-expanded="false" aria-label="Checklist options">' + icon("more") + "</button>" +
            '<div class="menu menu-right menu-row" role="menu" hidden><button type="button" class="menu-item compact danger" data-act="remove">' + icon("trash") + "<span>Remove checklist</span></button></div></div>";

        root.innerHTML =
            '<div class="page-head"><div><h1>Joiners &amp; leavers</h1><p class="muted">Checklists for new starters and for people leaving. Tasks are shared between the person, their supervisor and HR.</p></div>' +
            '<div class="page-actions"><button type="button" class="btn btn-ghost" id="ob-templates">' + icon("edit") + "Edit checklists</button>" +
            '<button type="button" class="btn btn-ghost" id="ob-leave">' + icon("logout") + "Start leaving process</button>" +
            '<button type="button" class="btn btn-primary" id="ob-start">' + icon("plus") + "Start onboarding</button></div></div>" +
            '<h2 class="section-title">In progress <span class="tab-count">' + active.length + "</span></h2>" +
            '<div class="checklist-grid" id="ob-active">' + (active.length ? active.map(function (c) { return checklistHtml(c, { menu: menu }); }).join("")
                : '<div class="panel muted small">No checklists in progress. Use <strong>Start onboarding</strong> when someone joins, or <strong>Start leaving process</strong> when someone leaves.</div>') + "</div>" +
            (done.length ? '<h2 class="section-title ob-done-title">Completed <span class="tab-count">' + done.length + "</span></h2>" +
                '<div class="checklist-grid compact">' + done.map(function (c) { return checklistHtml(c, { menu: menu }); }).join("") + "</div>" : "");
        paintProgress(root);

        wireChecklists(root, function () { render(); });
        $("#ob-start").addEventListener("click", function () { openStartOnboarding(data, null, "starter"); });
        $("#ob-leave").addEventListener("click", function () { openStartOnboarding(data, null, "leaver"); });
        $("#ob-templates").addEventListener("click", function () { openOnboardingTemplates(data.templates); });
        root.addEventListener("click", async function (e) {
            const act = e.target.closest("[data-act='remove']");
            if (!act) return;
            closeMenus();
            const id = act.closest("[data-checklist]").dataset.checklist;
            if (!(await confirmDialog({ title: "Remove this checklist?", message: "Its progress will be deleted.", confirmLabel: "Remove", danger: true }))) return;
            try {
                await api("/api/onboarding/" + id + "/delete", {});
                toast("Checklist removed.");
                render();
            } catch (err) { toast(err.message); }
        });
    }

    function openStartOnboarding(data, personId, kind) {
        kind = kind || "starter";
        const templates = data.templates.filter(function (t) { return (t.kind || "starter") === kind; });
        const m = openModal(
            '<h2 class="modal-title">' + (kind === "leaver" ? "Start leaving process" : "Start onboarding") + "</h2>" +
            (kind === "leaver" ? '<p class="muted">A checklist for handing over, returning equipment, the final payslip and switching off their login.</p>' : "") +
            '<form id="obs-form" novalidate>' +
            '<label for="obs-person">Employee</label><select id="obs-person">' + data.people.map(function (p) {
                return '<option value="' + p.id + '"' + (p.id === personId ? " selected" : "") + ">" + esc(p.displayName) + " — " + esc(p.jobTitle) + "</option>";
            }).join("") + "</select>" +
            (kind === "leaver" ? '<label for="obs-lastday">Last working day</label><input type="date" id="obs-lastday">' : "") +
            '<label for="obs-template">Checklist</label><select id="obs-template">' + templates.map(function (t) {
                return '<option value="' + t.id + '">' + esc(t.name) + " (" + t.tasks.length + " tasks)</option>";
            }).join("") + "</select>" +
            '<div class="form-error" id="obs-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Start</button></div></form>'
        );
        $("#obs-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await api("/api/onboarding/start", { personId: $("#obs-person", m.el).value, templateId: $("#obs-template", m.el).value, lastDay: $("#obs-lastday", m.el) ? $("#obs-lastday", m.el).value : "" });
                closeModal();
                toast(kind === "leaver" ? "Leaving process started." : "Onboarding started.");
                if (window.location.pathname === "/onboarding") render();
            } catch (err) { formError($("#obs-error", m.el), err.message); }
        });
    }

    function openOnboardingTemplates(templates) {
        const m = openModal(
            '<h2 class="modal-title">Onboarding checklists</h2><p class="muted">Templates used when you start onboarding someone.</p>' +
            '<ul class="plain-list tpl-list">' + templates.map(function (t) {
                return '<li><div><strong>' + esc(t.name) + '</strong> <span class="badge' + ((t.kind || "starter") === "leaver" ? " badge-red" : "") + '">' + ((t.kind || "starter") === "leaver" ? "Leaver" : "New starter") + '</span> <span class="muted small">' + t.tasks.length + " tasks</span></div>" +
                    '<div class="btn-row"><button type="button" class="btn btn-ghost btn-small" data-edit="' + t.id + '">Edit</button>' +
                    (templates.length > 1 ? '<button type="button" class="btn btn-ghost btn-small danger-text" data-del="' + t.id + '">Delete</button>' : "") + "</div></li>";
            }).join("") + "</ul>" +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" id="tpl-new">' + icon("plus") + "New checklist</button><button type=\"button\" class=\"btn btn-primary\" data-close>Done</button></div>"
        );
        m.el.addEventListener("click", async function (e) {
            if (e.target.closest("#tpl-new")) return openTemplateEditor(null);
            const ed = e.target.closest("[data-edit]");
            if (ed) return openTemplateEditor(templates.find(function (t) { return t.id === ed.dataset.edit; }));
            const del = e.target.closest("[data-del]");
            if (del) {
                const t = templates.find(function (x) { return x.id === del.dataset.del; });
                if (!(await confirmDialog({ title: "Delete “" + t.name + "”?", message: "Checklists already started aren’t affected.", confirmLabel: "Delete", danger: true }))) return;
                try { await api("/api/onboarding/templates/" + t.id + "/delete", {}); toast("Checklist deleted."); render(); } catch (err) { toast(err.message); }
            }
        });
    }

    function openTemplateEditor(t) {
        let tasks = t ? t.tasks.map(function (x) { return Object.assign({}, x); }) : [{ title: "", description: "", owner: "employee" }];
        const m = openModal(
            '<h2 class="modal-title">' + (t ? "Edit checklist" : "New checklist") + "</h2>" +
            '<form id="tpl-form" novalidate><div class="grid-2"><div><label for="tpl-name">Name</label><input type="text" id="tpl-name" maxlength="80" value="' + esc(t ? t.name : "") + '"></div>' +
            '<div><label for="tpl-kind">Used for</label><select id="tpl-kind"><option value="starter">New starters</option><option value="leaver"' + (t && t.kind === "leaver" ? " selected" : "") + ">Leavers</option></select></div></div>" +
            '<h3 class="detail-head">Tasks</h3><div id="tpl-tasks"></div>' +
            '<button type="button" class="btn btn-link" id="tpl-add">' + icon("plus") + "Add a task</button>" +
            '<div class="form-error" id="tpl-error" hidden></div>' +
            '<div class="modal-actions sticky-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save checklist</button></div></form>',
            { wide: true }
        );
        function draw() {
            $("#tpl-tasks", m.el).innerHTML = tasks.map(function (x, i) {
                return '<div class="pb-q" data-t="' + i + '"><div class="pb-q-head"><span class="pb-num">' + (i + 1) + "</span>" +
                    '<select class="tpl-owner" aria-label="Who does this">' + Object.keys(OWNER_LABELS).map(function (k) {
                        return '<option value="' + k + '"' + (x.owner === k ? " selected" : "") + ">Done by: " + OWNER_LABELS[k] + "</option>";
                    }).join("") + "</select>" +
                    (tasks.length > 1 ? '<button type="button" class="icon-btn icon-btn-sm tpl-remove" aria-label="Remove task">' + icon("x") + "</button>" : "") + "</div>" +
                    '<input type="text" class="tpl-title" maxlength="150" placeholder="Task" value="' + esc(x.title) + '">' +
                    '<input type="text" class="tpl-desc" maxlength="500" placeholder="Details (optional)" value="' + esc(x.description || "") + '"></div>';
            }).join("");
        }
        draw();
        const box = $("#tpl-tasks", m.el);
        box.addEventListener("input", function (e) {
            const row = e.target.closest("[data-t]");
            if (!row) return;
            const x = tasks[+row.dataset.t];
            if (e.target.classList.contains("tpl-title")) x.title = e.target.value;
            if (e.target.classList.contains("tpl-desc")) x.description = e.target.value;
        });
        box.addEventListener("change", function (e) {
            const row = e.target.closest("[data-t]");
            if (row && e.target.classList.contains("tpl-owner")) tasks[+row.dataset.t].owner = e.target.value;
        });
        box.addEventListener("click", function (e) {
            if (!e.target.closest(".tpl-remove")) return;
            tasks.splice(+e.target.closest("[data-t]").dataset.t, 1);
            draw();
        });
        $("#tpl-add", m.el).addEventListener("click", function () { tasks.push({ title: "", description: "", owner: "employee" }); draw(); });
        $("#tpl-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await api(t ? "/api/onboarding/templates/" + t.id : "/api/onboarding/templates", { name: $("#tpl-name", m.el).value, kind: $("#tpl-kind", m.el).value, tasks: tasks });
                closeModal();
                toast("Checklist saved.");
                render();
            } catch (err) { formError($("#tpl-error", m.el), err.message); }
        });
    }

    // ================= Roles & permissions =================

    async function viewRoles(root, current) {
        const data = await api("/api/roles");
        if (!current()) return;
        const people = {};
        data.people.forEach(function (p) { people[p.id] = p; });

        root.innerHTML =
            '<div class="page-head"><div><h1>Roles &amp; permissions</h1><p class="muted">Give people a role to let them manage parts of the portal. Everyone can still use the portal without a role.</p></div>' +
            '<div class="page-actions"><button type="button" class="btn btn-primary" id="new-role">' + icon("plus") + "New role</button></div></div>" +
            '<div class="banner info-banner">' + icon("shield") + "<div>The system owner always has every permission. The built-in admin account has every permission except System Admin." +
            (can("system.admin") ? "" : " Only people with System Admin access can change roles that include it.") + "</div></div>" +
            '<div class="role-grid">' + data.roles.map(function (r) {
                return '<section class="panel role-card" data-role="' + r.id + '">' +
                    '<div class="panel-head"><h2 class="panel-title">' + icon("shield") + esc(r.name) + "</h2>" +
                    '<div class="btn-row"><button type="button" class="btn btn-ghost btn-small" data-rename>' + icon("edit") + "Rename</button>" +
                    '<button type="button" class="btn btn-ghost btn-small danger-text" data-delete-role>' + icon("trash") + "</button></div></div>" +
                    '<div class="perm-list">' + data.permissions.map(function (p) {
                        const on = r.permissions.indexOf(p.key) !== -1;
                        const locked = !can("system.admin") && (p.key === "system.admin" || r.permissions.indexOf("system.admin") !== -1);
                        return '<label class="perm' + (p.key === "system.admin" ? " perm-super" : "") + (locked ? " locked" : "") + '"><span class="switch"><input type="checkbox" data-perm="' + p.key + '"' + (on ? " checked" : "") + (locked ? " disabled" : "") + '><span class="slider"></span></span>' +
                            '<span><span class="perm-name">' + esc(p.name) + '</span><span class="muted small">' + esc(p.description) + "</span></span></label>";
                    }).join("") + "</div>" +
                    '<div class="role-members"><div class="rm-head"><h3 class="detail-head">People <span class="tab-count">' + r.members.length + "</span></h3>" +
                    '<button type="button" class="btn btn-ghost btn-small" data-members>' + icon("users") + "Choose people</button></div>" +
                    '<div class="chips">' + (r.members.length ? r.members.map(function (id) {
                        const p = people[id];
                        return p ? '<span class="person-chip static">' + avatar(p, "xs") + "<span>" + esc(p.displayName) + "</span></span>" : "";
                    }).join("") : '<span class="muted small">Nobody has this role yet.</span>') + "</div></div></section>";
            }).join("") + "</div>";

        const role = function (el) { return data.roles.find(function (r) { return r.id === el.closest("[data-role]").dataset.role; }); };
        root.addEventListener("change", async function (e) {
            const cb = e.target.closest("[data-perm]");
            if (!cb) return;
            const r = role(cb);
            const perms = $$("[data-perm]", cb.closest("[data-role]")).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.perm; });
            try {
                await api("/api/roles/" + r.id, { name: r.name, permissions: perms });
                r.permissions = perms;
                toast("Permissions updated.");
                state.me = (await api("/api/me")).user;
                renderChrome();
            } catch (err) { cb.checked = !cb.checked; toast(err.message); }
        });
        root.addEventListener("click", async function (e) {
            if (e.target.closest("#new-role")) return openRoleName(null);
            if (e.target.closest("[data-rename]")) return openRoleName(role(e.target));
            if (e.target.closest("[data-members]")) return openRoleMembers(role(e.target), data.people);
            if (e.target.closest("[data-delete-role]")) {
                const r = role(e.target);
                if (!(await confirmDialog({ title: "Delete the “" + r.name + "” role?", message: "The " + r.members.length + " people who have it will lose its permissions.", confirmLabel: "Delete role", danger: true }))) return;
                try { await api("/api/roles/" + r.id + "/delete", {}); toast("Role deleted."); render(); } catch (err) { toast(err.message); }
            }
        });
    }

    function openRoleName(r) {
        const m = openModal('<h2 class="modal-title">' + (r ? "Rename role" : "New role") + "</h2>" +
            '<form id="role-form" novalidate><label for="role-name">Name</label><input type="text" id="role-name" maxlength="60" value="' + esc(r ? r.name : "") + '" placeholder="e.g. IT Support">' +
            '<div class="form-error" id="role-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">' + (r ? "Save" : "Create role") + "</button></div></form>");
        $("#role-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await api(r ? "/api/roles/" + r.id : "/api/roles", { name: $("#role-name", m.el).value, permissions: r ? r.permissions : [] });
                closeModal();
                toast(r ? "Role renamed." : "Role created. Now choose its permissions.");
                render();
            } catch (err) { formError($("#role-error", m.el), err.message); }
        });
    }

    function openRoleMembers(r, people) {
        const chosen = {};
        r.members.forEach(function (id) { chosen[id] = true; });
        const count = function () { return Object.keys(chosen).filter(function (k) { return chosen[k]; }).length; };
        const m = openModal(
            '<div class="rm-modal-head"><span class="rm-modal-icon">' + icon("shield") + "</span><div>" +
            '<h2 class="modal-title">' + esc(r.name) + "</h2>" +
            '<p class="muted small">Choose who has this role. They get its permissions straight away.</p></div></div>' +
            '<label class="search rm-search">' + icon("search") + '<input type="search" id="rm-search" placeholder="Search by name or job title" aria-label="Search people"></label>' +
            '<div class="member-list" id="rm-list"></div>' +
            '<div class="modal-actions rm-actions"><span class="rm-count" id="rm-count"></span>' +
            '<button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="button" class="btn btn-primary" id="rm-save">' + icon("tick") + "Save</button></div>",
            { cls: "modal-members" }
        );
        function drawCount() {
            const n = count();
            $("#rm-count", m.el).textContent = n ? n + (n === 1 ? " person selected" : " people selected") : "Nobody selected";
        }
        function draw() {
            const q = $("#rm-search", m.el).value.trim().toLowerCase();
            const list = people.filter(function (p) { return !q || (p.displayName + " " + p.jobTitle).toLowerCase().indexOf(q) !== -1; });
            $("#rm-list", m.el).innerHTML = list.length ? list.map(function (p) {
                if (p.isOwner) {
                    return '<div class="member-row is-owner">' + avatar(p, "md") + '<span class="mr-text"><span class="emp-name">' + esc(p.displayName) + "</span>" +
                        '<span class="muted small">' + esc(p.jobTitle) + "</span></span>" +
                        '<span class="badge badge-owner">System owner \u00b7 has everything</span></div>';
                }
                return '<label class="member-row' + (chosen[p.id] ? " on" : "") + '">' + avatar(p, "md") +
                    '<span class="mr-text"><span class="emp-name">' + esc(p.displayName) + '</span><span class="muted small">' + esc(p.jobTitle) + "</span></span>" +
                    '<input type="checkbox" value="' + p.id + '"' + (chosen[p.id] ? " checked" : "") + '><span class="mr-check">' + icon("tick") + "</span></label>";
            }).join("") : '<p class="muted small rm-empty">Nobody matches \u201c' + esc(q) + "\u201d.</p>";
        }
        draw();
        drawCount();
        $("#rm-search", m.el).addEventListener("input", draw);
        $("#rm-list", m.el).addEventListener("change", function (e) {
            chosen[e.target.value] = e.target.checked;
            e.target.closest(".member-row").classList.toggle("on", e.target.checked);
            drawCount();
        });
        $("#rm-save", m.el).addEventListener("click", async function () {
            try {
                await api("/api/roles/" + r.id + "/members", { personIds: Object.keys(chosen).filter(function (k) { return chosen[k]; }) });
                closeModal();
                toast("People updated.");
                render();
            } catch (err) { toast(err.message); }
        });
    }

    // ================= Your sessions (Settings → Security) =================

    async function loadMySessions(box) {
        try {
            const d = await api("/api/me/sessions");
            const others = d.sessions.filter(function (s) { return !s.current; }).length;
            box.innerHTML = '<div class="panel-head"><h2 class="panel-title">' + icon("monitor") + "Where you’re signed in</h2>" +
                (others ? '<button type="button" class="btn btn-ghost btn-small" id="ms-others">Sign out everywhere else</button>' : "") + "</div>" +
                '<ul class="session-list">' + d.sessions.map(function (s) {
                    return '<li class="session-row"><span class="session-icon">' + icon("monitor") + "</span>" +
                        '<div class="session-text"><div class="emp-name">' + esc(deviceName(s.userAgent)) + (s.current ? ' <span class="badge badge-green">This device</span>' : "") +
                        (s.impersonated ? ' <span class="badge">Log in as</span>' : "") + '</div><div class="muted small">' + esc(s.ip) + " · signed in " + esc(timeAgo(s.createdAt)) +
                        " · active " + esc(timeAgo(s.lastSeen)) + "</div></div>" +
                        (s.current ? "" : '<button type="button" class="btn btn-ghost btn-small" data-end-session="' + s.id + '">Sign out</button>') + "</li>";
                }).join("") + "</ul>";
            box.onclick = async function (e) {
                const one = e.target.closest("[data-end-session]");
                if (!one && !e.target.closest("#ms-others")) return;
                try {
                    await api(one ? "/api/me/sessions/" + one.dataset.endSession + "/end" : "/api/me/sessions/end-others", {});
                    toast("Signed out.");
                    loadMySessions(box);
                } catch (err) { toast(err.message); }
            };
        } catch (e) { box.hidden = true; }
    }

    // ================= Backups (System Admin) =================

    function mountBackups(box) {
        const kindLabel = { auto: "Nightly", manual: "Manual", "pre-restore": "Before restore", uploaded: "Uploaded" };
        async function draw() {
            let d;
            try { d = await api("/api/system/backups"); } catch (err) { box.innerHTML = '<p class="muted">' + esc(err.message) + "</p>"; return; }
            box.innerHTML = '<div class="panel-head"><h2 class="panel-title">' + icon("archive") + "Backups</h2>" +
                '<div class="btn-row"><label class="btn btn-ghost btn-small bk-upload">' + icon("upload") + 'Upload a backup<input type="file" id="bk-file" accept=".gz,.tar.gz,application/gzip" hidden></label>' +
                '<button type="button" class="btn btn-primary btn-small" id="bk-now">' + icon("archive") + "Back up now</button></div></div>" +
                '<p class="muted small">A backup of everything (staff, logins, documents, photos, settings) is taken automatically every night at 2am. The latest 14 nightly backups are kept. You can also upload a backup downloaded from here (for example from another server) and restore it.</p>' +
                '<div class="bk-health' + (d.health.stale ? " is-stale" : "") + '">' + icon(d.health.stale ? "alert" : "check") + "<span>" +
                (d.health.last ? "Last backup " + esc(fmtDateTime(d.health.last.createdAt)) + " (" + (d.health.hoursSince < 1 ? "under an hour" : Math.round(d.health.hoursSince) + " hours") + " ago)" : "No backups yet") +
                (d.health.stale ? " \u2013 that\u2019s more than 36 hours. Check the nightly backup is running, or back up now." : "") +
                ' \u00b7 ' + d.health.count + " backups using " + esc(fileSize(d.health.totalSize)) + "</span></div>" +
                (d.backups.length ? '<div class="table-card flat"><table class="table"><thead><tr><th>Backup</th><th>Type</th><th>Size</th><th class="col-actions"></th></tr></thead><tbody>' +
                    d.backups.map(function (b) {
                        return "<tr><td>" + esc(fmtDateTime(b.createdAt)) + '</td><td data-label="Type"><span class="badge">' + esc(kindLabel[b.kind] || b.kind) + "</span></td>" +
                            '<td data-label="Size">' + esc(fileSize(b.size)) + "</td>" +
                            '<td class="col-actions nowrap"><a class="btn btn-ghost btn-small" href="/api/system/backups/' + esc(b.name) + '/download">' + icon("download") + "</a> " +
                            '<button type="button" class="btn btn-ghost btn-small" data-restore="' + esc(b.name) + '">' + icon("refresh") + "Restore</button> " +
                            '<button type="button" class="btn btn-ghost btn-small danger-text" data-del-backup="' + esc(b.name) + '" aria-label="Delete backup">' + icon("trash") + "</button></td></tr>";
                    }).join("") + "</tbody></table></div>" : '<p class="muted small">No backups yet.</p>');
        }
        box.addEventListener("change", async function (e) {
            if (e.target.id !== "bk-file" || !e.target.files[0]) return;
            const file = e.target.files[0];
            try {
                const res = await fetch("/api/system/backups/upload", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
                const r = await res.json().catch(function () { return {}; });
                if (!res.ok) throw new Error(r.error || "Upload failed.");
                toast("Backup uploaded. Use Restore to put it back.");
            } catch (err) { toast(err.message); }
            draw();
        });
        box.addEventListener("click", async function (e) {
            if (e.target.closest("#bk-now")) {
                e.target.closest("#bk-now").disabled = true;
                try { await api("/api/system/backups", {}); toast("Backup created."); } catch (err) { toast(err.message); }
                return draw();
            }
            const del = e.target.closest("[data-del-backup]");
            if (del) {
                if (!(await confirmDialog({ title: "Delete this backup?", message: "It can’t be recovered afterwards.", confirmLabel: "Delete", danger: true }))) return;
                try { await api("/api/system/backups/" + del.dataset.delBackup + "/delete", {}); toast("Backup deleted."); } catch (err) { toast(err.message); }
                return draw();
            }
            const rs = e.target.closest("[data-restore]");
            if (rs) openRestore(rs.dataset.restore);
        });
        draw();
    }

    function openRestore(name) {
        const m = openModal(
            '<div class="success-mark danger-mark">' + icon("alert") + "</div>" +
            '<h2 class="modal-title center">Restore this backup?</h2>' +
            '<p class="muted center">Everything in the portal goes back to how it was when this backup was taken. Changes since then will be lost (a safety backup of the current data is taken first). Everyone, including you, will be signed out.</p>' +
            '<form id="rs-form" novalidate><label for="rs-pin">System PIN</label><input type="password" id="rs-pin" inputmode="numeric" maxlength="8" autocomplete="off">' +
            '<div class="form-error" id="rs-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-danger">Restore backup</button></div></form>'
        );
        $("#rs-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                const r = await api("/api/system/backups/" + name + "/restore", { pin: $("#rs-pin", m.el).value });
                window.location.href = r.redirect || "/login";
            } catch (err) { formError($("#rs-error", m.el), err.message); }
        });
    }

    // ================= Global search =================

    let searchOpen = false;

    function openSearch() {
        if (searchOpen || !state.me || state.me.passwordTemporary || state.me.passwordExpired || state.me.codeSetupRequired) return;
        searchOpen = true;
        closeMenus();
        const overlay = document.createElement("div");
        overlay.className = "search-overlay";
        overlay.innerHTML = '<div class="search-palette" role="dialog" aria-modal="true" aria-label="Search">' +
            '<div class="sp-input">' + icon("search") + '<input type="search" id="sp-q" placeholder="Search people, documents, announcements, events…" autocomplete="off" aria-label="Search">' +
            '<kbd>Esc</kbd></div><div class="sp-results" id="sp-results"><p class="sp-hint muted small">Type at least two letters.</p></div></div>';
        document.body.appendChild(overlay);
        const input = $("#sp-q", overlay);
        const results = $("#sp-results", overlay);
        input.focus();
        let items = [];
        let active = 0;
        let timer;
        let seq = 0;
        const close = function () {
            searchOpen = false;
            overlay.remove();
            document.removeEventListener("keydown", onKey, true);
        };
        const pages = NAV.reduce(function (all, s) { return all.concat(visibleItems(s).filter(function (it) { return it.href; })); }, [
            { title: "Home", href: "/home", icon: "home" }, { title: "Settings", href: "/settings", icon: "settings" },
        ]);
        function go(it) {
            close();
            if (it.kind === "person") { state.pendingPerson = it.id; navigate("/directory"); }
            else if (it.kind === "document") { state.pendingDocSearch = it.title; navigate("/documents"); }
            else if (it.kind === "announcement") { state.pendingAnnouncement = it.id; navigate("/announcements"); }
            else if (it.kind === "event") { state.pendingCalendarDate = it.date; navigate("/calendar"); }
            else if (it.kind === "poll") { state.pendingPoll = it.id; navigate("/polls"); }
            else if (it.kind === "page") navigate("/wiki?p=" + it.id);
            else if (it.kind === "question") navigate("/questions?q=" + it.id);
            else navigate(it.href);
        }
        function draw(groups) {
            items = [];
            let html = "";
            groups.forEach(function (g) {
                if (!g.items.length) return;
                html += '<div class="sp-group">' + esc(g.label) + "</div>";
                g.items.forEach(function (it) {
                    items.push(it);
                    html += '<button type="button" class="sp-item" data-i="' + (items.length - 1) + '">' + (it.person ? avatar(it.person, "sm") : '<span class="sp-icon">' + icon(it.icon) + "</span>") +
                        '<span class="sp-text"><span class="sp-title">' + esc(it.title) + '</span>' + (it.sub ? '<span class="muted small">' + esc(it.sub) + "</span>" : "") + "</span></button>";
                });
            });
            results.innerHTML = html || '<p class="sp-hint muted small">No results.</p>';
            active = 0;
            highlight();
        }
        function highlight() {
            $$(".sp-item", results).forEach(function (b, i) { b.classList.toggle("active", i === active); if (i === active) b.scrollIntoView({ block: "nearest" }); });
        }
        async function run() {
            const q = input.value.trim();
            const mySeq = ++seq;
            const pageHits = pages.filter(function (p) { return q && p.title.toLowerCase().indexOf(q.toLowerCase()) !== -1; })
                .map(function (p) { return { kind: "page", href: p.href, title: p.title, icon: p.icon, sub: "Page" }; });
            if (q.length < 2) {
                if (!pageHits.length) results.innerHTML = '<p class="sp-hint muted small">Type at least two letters.</p>';
                else draw([{ label: "Pages", items: pageHits }]);
                return;
            }
            try {
                const d = await api("/api/search?q=" + encodeURIComponent(q));
                if (mySeq !== seq) return;
                draw([
                    { label: "People", items: d.people.map(function (p) { return { kind: "person", id: p.id, title: p.displayName, sub: p.jobTitle + " · " + p.company, person: p }; }) },
                    { label: "Pages", items: pageHits },
                    { label: "Documents", items: d.documents.map(function (x) { return { kind: "document", id: x.id, title: x.title, sub: x.category + " · " + x.ext.toUpperCase(), icon: "file" }; }) },
                    { label: "Announcements", items: d.announcements.map(function (x) { return { kind: "announcement", id: x.id, title: x.title, sub: fmtDate(x.publishAt), icon: "bell" }; }) },
                    { label: "Events", items: d.events.map(function (x) { return { kind: "event", id: x.id, date: x.startDate, title: x.title, sub: dayLabel(x.startDate), icon: "calendar" }; }) },
                    { label: "Polls", items: d.polls.map(function (x) { return { kind: "poll", id: x.id, title: x.title, sub: x.open ? "Open" : "Closed", icon: "chart" }; }) },
                    { label: "Knowledge base", items: (d.pages || []).map(function (x) { return { kind: "page", id: x.slug, title: x.title, sub: "Knowledge base", icon: "file" }; }) },
                    { label: "Q&A", items: (d.questions || []).map(function (x) { return { kind: "question", id: x.id, title: x.title, sub: x.solved ? "Answered" : "Open question", icon: "message" }; }) },
                ]);
            } catch (e) { /* ignore */ }
        }
        function onKey(e) {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
            else if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(items.length - 1, active + 1); highlight(); }
            else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); highlight(); }
            else if (e.key === "Enter" && items[active]) { e.preventDefault(); go(items[active]); }
        }
        document.addEventListener("keydown", onKey, true);
        input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 150); });
        overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) close(); });
        results.addEventListener("click", function (e) {
            const b = e.target.closest("[data-i]");
            if (b) go(items[+b.dataset.i]);
        });
    }

    document.addEventListener("keydown", function (e) {
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
        if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
            if (!state.me) return;
            e.preventDefault();
            openSearch();
        }
    });

    // ================= About HN Group =================

    // Logos live in /assets/brand/svg and /assets/brand/png. "dark" files are white, for dark backgrounds;
    // "pngOnly" files have no SVG version.
    const BRANDS = [
        {
            name: "HN Group", legal: "HN Group Limited", logo: "hn-group-wordmark", domain: "hngroup.org.uk",
            about: "The parent company that brings all of the Horizon businesses together under one group, with shared leadership, people and standards.",
            files: [
                ["hn-group-wordmark", "Wordmark"], ["hn-group-wordmark-white", "Wordmark – white", true],
                ["hn-group-email-logo", "Email signature logo", false, true], ["hn-group-google-workspace", "Google Workspace logo", false, true],
            ],
        },
        {
            name: "Horizon Network", legal: "Horizon Network Limited", logo: "horizon-network-wordmark", domain: "horizon-network.co.uk",
            about: "A growing network of digital services and solutions, building the infrastructure for tomorrow's businesses. UK based, with 24/7 monitoring and 99.9% uptime.",
            points: ["Horizon Hosting (coming soon): VPS, dedicated servers and managed cloud"],
            files: [
                ["horizon-network-wordmark", "Wordmark"], ["horizon-network-wordmark-white", "Wordmark – white", true],
                ["horizon-network-wordmark-stacked", "Stacked wordmark"], ["horizon-network-wordmark-stacked-white", "Stacked wordmark – white", true],
                ["horizon-network-email-logo", "Email signature logo", false, true],
            ],
        },
        {
            name: "Horizon Advertising", legal: "Horizon Advertising Limited", logo: "horizon-advertising-logo", domain: "horizonadvertising.co.uk",
            about: "Digital advertising solutions powered by the Horizon Network. Reaching audiences with precision and scale, with measurable results.",
            points: ["Display advertising", "Campaign management", "Analytics & reporting"],
            files: roundelSet("horizon-advertising").concat([["horizon-advertising-email-logo", "Email signature logo", false, true]]),
        },
        {
            name: "Horizon Development", legal: "Part of Horizon Network Limited", logo: "horizon-development-logo",
            about: "Custom software development and web applications, from concept to deployment, built with modern technologies.",
            files: roundelSet("horizon-development").concat([["horizon-development-email-logo", "Email signature logo", false, true]]),
        },
        {
            name: "Horizon Media Group", legal: "Horizon Media Group Limited", logo: "horizon-media-group-logo", domain: "media.hngroup.org.uk",
            about: "The media arm of HN Group.",
            files: roundelSet("horizon-media-group").concat([["horizon-media-group-email-logo", "Email signature logo", false, true]]),
        },
        {
            name: "HN Group Management", legal: "HN Group Management Limited", logo: "hn-group-management-logo", domain: "holding.hngroup.org.uk",
            about: "Owns HN Group's assets and manages email services for the whole group. It has no staff of its own and is managed directly by HN Group staff.",
            points: ["Domains", "Discord servers", "Technical assets", "Email services"],
            files: roundelSet("hn-group-management").concat([["hn-group-management-email-logo", "Email signature logo", false, true]]),
        },
    ];

    function roundelSet(key) {
        return [
            [key + "-logo", "Logo"], [key + "-logo-white", "Logo – white", true],
            [key + "-roundel", "Roundel"], [key + "-roundel-white", "Roundel – white", true],
            [key + "-app-icon", "App icon"],
        ];
    }

    const BRAND_COLOURS = [
        ["Pink", "#E97DE8"], ["Purple", "#5514B4"], ["Yellow", "#E3E65B"], ["Teal", "#3E9BA3"],
        ["Plum", "#7A1F6C"], ["Raspberry", "#C2306B"], ["Green", "#5FAE7B"], ["Navy", "#1C2135"],
    ];

    function brandImg(file, cls, alt) {
        return '<img src="/assets/brand/' + (file[3] ? "png/" + file[0] + ".png" : "svg/" + file[0] + ".svg") + '" alt="' + esc(alt || "") + '"' + (cls ? ' class="' + cls + '"' : "") + ' loading="lazy">';
    }

    async function viewAbout(root, current) {
        let counts = {};
        try {
            const d = await api("/api/directory");
            d.people.forEach(function (p) { companiesOf(p).forEach(function (c) { counts[c] = (counts[c] || 0) + 1; }); });
        } catch (e) { counts = {}; }
        if (!current()) return;
        const companies = BRANDS.filter(function (b) { return !b.logosOnly; });
        let brandFilter = "";

        root.innerHTML =
            '<div class="page-head"><div><h1>About HN Group</h1><p class="muted">Who we are, the companies in the group, and the brand colours and logos to use.</p></div>' +
            '<div class="page-actions"><a class="btn btn-ghost" href="#brand-logos">' + icon("download") + "Logos</a></div></div>" +

            '<section class="about-hero">' +
            '<div class="about-hero-text"><p class="eyebrow">One group, ' + companies.length + " companies</p>" +
            "<h2>Building the digital infrastructure, products and media for tomorrow’s businesses.</h2>" +
            '<p class="muted">HN Group Limited wholly owns Horizon Network, Horizon Media Group and HN Group Management. Horizon Development is part of Horizon Network, and Horizon Advertising is a Horizon Media Group subsidiary managed by Horizon Network. Each company has its own focus, and they share people, systems and standards across the group.</p></div>' +
            '<div class="about-hero-logo">' + brandImg(["hn-group-wordmark"], "logo-light-theme", "HN Group") + brandImg(["hn-group-wordmark-white"], "logo-dark-theme", "HN Group") + "</div>" +
            "</section>" +

            '<h2 class="section-title about-title">' + icon("building") + "Our companies</h2>" +
            '<div class="company-grid">' + companies.map(function (b) {
                const n = counts[b.name] || 0;
                return '<article class="company-card">' +
                    '<div class="cc-logo">' + brandImg([b.logo], "logo-light-theme", b.name) + brandImg([b.logo + "-white"], "logo-dark-theme", b.name) + "</div>" +
                    '<h3 class="cc-name">' + esc(b.name) + "</h3>" +
                    (b.legal ? '<p class="muted small">' + esc(b.legal) + "</p>" : "") +
                    '<p class="cc-about">' + esc(b.about) + "</p>" +
                    (b.points ? '<ul class="cc-points">' + b.points.map(function (p) { return "<li>" + icon("tick") + esc(p) + "</li>"; }).join("") + "</ul>" : "") +
                    '<div class="cc-meta">' +
                    (n ? '<a class="chip" href="/directory" data-link data-company-link="' + esc(b.name) + '">' + icon("users") + n + (n === 1 ? " person" : " people") + "</a>" : "") +
                    (b.domain ? '<span class="chip chip-all">' + icon("mail") + "@" + esc(b.domain) + "</span>" : "") +
                    "</div></article>";
            }).join("") + "</div>" +

            '<h2 class="section-title about-title" id="brand-colours">' + icon("palette") + "Brand colours</h2>" +
            '<p class="muted small about-sub">The eight colours from the stripe under the HN Group and Horizon Network wordmarks. Click a colour to copy its code.</p>' +
            '<div class="swatch-row">' + BRAND_COLOURS.map(function (c) {
                return '<button type="button" class="swatch" data-copy="' + c[1] + '"><span class="swatch-chip" data-colour="' + c[1] + '"></span>' +
                    '<span class="swatch-name">' + c[0] + '</span><span class="swatch-hex mono">' + c[1] + "</span></button>";
            }).join("") + "</div>" +

            '<h2 class="section-title about-title" id="brand-logos">' + icon("download") + "Logos</h2>" +
            '<div class="brand-notes">' +
            '<div class="info-card"><div class="info-label">' + icon("tree") + "Wordmarks</div><p class=\"small\">HN Group and Horizon Network use a heavy wordmark above a stepped line of the eight brand colours. Use the stacked version where space is tight, such as email.</p></div>" +
            '<div class="info-card"><div class="info-label">' + icon("star") + "Roundels</div><p class=\"small\">The other companies use a thick ring with their initials. Horizon Advertising is lavender (#7B52C4); the others are indigo (#5514B4).</p></div>" +
            '<div class="info-card"><div class="info-label">' + icon("eye") + "Light or dark</div><p class=\"small\">Use the <strong>white</strong> versions on dark or photo backgrounds. SVG is best for print and the web; PNG works everywhere else.</p></div>" +
            "</div>" +
            '<div class="company-tabs" id="brand-tabs"><button type="button" data-brand="">All logos</button>' +
            BRANDS.map(function (b) { return '<button type="button" data-brand="' + esc(b.name) + '">' + esc(b.name) + "</button>"; }).join("") + "</div>" +
            '<div id="brand-library"></div>';

        $$(".swatch-chip", root).forEach(function (el) { el.style.background = el.dataset.colour; });

        function drawLibrary() {
            $$("#brand-tabs [data-brand]").forEach(function (b) { b.classList.toggle("active", b.dataset.brand === brandFilter); });
            $("#brand-library").innerHTML = BRANDS.filter(function (b) { return !brandFilter || b.name === brandFilter; }).map(function (b) {
                return '<section class="brand-group"><h3 class="detail-head">' + esc(b.name) + '</h3><div class="logo-grid">' + b.files.map(function (f) {
                    return '<div class="logo-tile"><div class="logo-preview' + (f[2] ? " on-dark" : "") + (/app-icon/.test(f[0]) ? " is-icon" : "") + '">' + brandImg(f, "", b.name + " " + f[1]) + "</div>" +
                        '<div class="logo-info"><span class="logo-name">' + esc(f[1]) + "</span>" +
                        '<span class="logo-dl">' + (f[3] ? "" : '<a class="btn btn-ghost btn-small" href="/assets/brand/svg/' + f[0] + '.svg" download>SVG</a>') +
                        '<a class="btn btn-ghost btn-small" href="/assets/brand/png/' + f[0] + '.png" download>PNG</a></span></div></div>';
                }).join("") + "</div></section>";
            }).join("");
        }
        drawLibrary();

        root.addEventListener("click", function (e) {
            const tab = e.target.closest("[data-brand]");
            if (tab) { brandFilter = tab.dataset.brand; return drawLibrary(); }
            const co = e.target.closest("[data-company-link]");
            if (co) state.pendingCompany = co.dataset.companyLink;
            const sw = e.target.closest(".swatch[data-copy]");
            if (sw) return copyText(sw.dataset.copy);
            const jump = e.target.closest('a[href^="#brand-"]');
            if (jump) {
                e.preventDefault();
                const t = $(jump.getAttribute("href"));
                if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        });
    }

    // ================= Email signature generator =================

    // Same layout as the signatures in brand/email-signature: logo on the left, details on the right,
    // the eight-colour stripe, the parent company line and the confidentiality notice.
    const SIGNATURE_COMPANIES = {
        "HN Group": { logo: "hn-group-email-logo", accent: "#5514B4", web: "hngroup.org.uk", domain: "hngroup.org.uk", legal: "HN Group Limited" },
        "Horizon Network": { logo: "horizon-network-email-logo", accent: "#5514B4", web: "horizon-network.co.uk", domain: "horizon-network.co.uk", legal: "Horizon Network Limited", parent: "HN Group", parentLegal: "HN Group Limited" },
        "Horizon Advertising": { logo: "horizon-advertising-email-logo", accent: "#7B52C4", web: "horizonadvertising.co.uk", domain: "horizonadvertising.co.uk", legal: "Horizon Advertising Limited", parent: "Horizon Media Group", parentLegal: "Horizon Media Group Limited" },
        "Horizon Development": { logo: "horizon-development-email-logo", accent: "#5514B4", web: "horizon-network.co.uk", legal: "Horizon Development", parent: "Horizon Network", parentLegal: "Horizon Network Limited" },
        "Horizon Media Group": { logo: "horizon-media-group-email-logo", accent: "#5514B4", web: "hngroup.org.uk", domain: "media.hngroup.org.uk", legal: "Horizon Media Group Limited", parent: "HN Group", parentLegal: "HN Group Limited" },
    };
    const SIG_STRIPE = [["#E97DE8", 14], ["#5514B4", 14], ["#E3E65B", 6], ["#3E9BA3", 20], ["#7A1F6C", 10], ["#C2306B", 10], ["#5FAE7B", 13], ["#1C2235", 13]];

    function signatureHtml(v) {
        const c = SIGNATURE_COMPANIES[v.company] || SIGNATURE_COMPANIES["HN Group"];
        const web = v.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
        const href = "https://" + web;
        const logo = window.location.origin + "/assets/brand/png/" + c.logo + ".png";
        const line = function (letter, inner) { return '<span style="color:#1A1A1A;font-weight:bold;">' + letter + "</span>&nbsp; " + inner; };
        const lines = [];
        if (v.email) lines.push(line("E", '<a href="mailto:' + esc(v.email) + '" style="color:#4A4A4A;text-decoration:none;">' + esc(v.email) + "</a>"));
        if (v.phone) lines.push(line("T", '<a href="tel:' + esc(v.phone.replace(/[^\d+]/g, "")) + '" style="color:#4A4A4A;text-decoration:none;">' + esc(v.phone) + "</a>"));
        if (web) lines.push(line("W", '<a href="' + esc(href) + '" style="color:#4A4A4A;text-decoration:none;">' + esc(web) + "</a>"));
        return '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;max-width:560px;">' +
            "<tr>" +
            '<td valign="middle" style="padding:0 20px 0 0;width:200px;border-right:2px solid ' + c.accent + ';">' +
            '<a href="' + esc(href) + '" style="text-decoration:none;"><img src="' + esc(logo) + '" width="200" height="100" alt="' + esc(v.company) + '" style="display:block;border:0;width:200px;height:100px;"></a></td>' +
            '<td valign="middle" style="padding:0 0 0 20px;">' +
            '<p style="margin:0;font-size:17px;line-height:22px;font-weight:bold;color:#1A1A1A;">' + esc(v.name) + "</p>" +
            '<p style="margin:4px 0 10px;font-size:12px;line-height:18px;"><span style="color:' + c.accent + ';font-weight:bold;">' + esc(v.title) + "</span> &nbsp;" +
            '<span style="color:#4A4A4A;">' + esc(c.legal) + "</span></p>" +
            '<p style="margin:0;font-size:12px;line-height:19px;color:#4A4A4A;">' + lines.join("<br>") + "</p>" +
            "</td></tr>" +
            '<tr><td colspan="2" style="padding:14px 0 0;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="border-collapse:collapse;"><tr>' +
            SIG_STRIPE.map(function (s) { return '<td height="3" width="' + s[1] + '%" bgcolor="' + s[0] + '" style="font-size:0;line-height:0;">&nbsp;</td>'; }).join("") +
            "</tr></table></td></tr>" +
            (c.parent ? '<tr><td colspan="2" style="padding:10px 0 0;font-size:11px;line-height:18px;color:#1A1A1A;">A <strong>' + esc(c.parent) + "</strong> company</td></tr>" : "") +
            '<tr><td colspan="2" style="padding:12px 0 0;font-size:10px;line-height:14px;color:#9A9A9A;">' +
            "This email and any attachments are confidential and intended only for the named recipient. If you have received it in error, please tell the sender and delete it." +
            (c.parent ? " " + esc(v.company) + " is a subsidiary of " + esc(c.parentLegal) + "." : "") +
            "</td></tr></table>";
    }

    // The same signature drawn as a PNG image (2x for sharp text), matching signatureHtml's layout.
    async function signaturePng(v) {
        const c = SIGNATURE_COMPANIES[v.company] || SIGNATURE_COMPANIES["HN Group"];
        const web = v.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
        const logo = await new Promise(function (resolve) {
            const img = new Image();
            img.onload = function () { resolve(img); };
            img.onerror = function () { resolve(null); };
            img.src = "/assets/brand/png/" + c.logo + ".png";
        });
        const W = 560, PAD = 24, SCALE = 2, FONT = "Arial, Helvetica, sans-serif";
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const font = function (size, bold) { ctx.font = (bold ? "bold " : "") + size + "px " + FONT; };
        // Wrap the notice to the signature width.
        const notice = "This email and any attachments are confidential and intended only for the named recipient. If you have received it in error, please tell the sender and delete it." +
            (c.parent ? " " + v.company + " is a subsidiary of " + c.parentLegal + "." : "");
        font(10, false);
        const noticeLines = [];
        notice.split(" ").forEach(function (word) {
            const last = noticeLines[noticeLines.length - 1];
            if (last !== undefined && ctx.measureText(last + " " + word).width <= W) noticeLines[noticeLines.length - 1] = last + " " + word;
            else noticeLines.push(word);
        });
        const details = [];
        if (v.email) details.push(["E", v.email]);
        if (v.phone) details.push(["T", v.phone]);
        if (web) details.push(["W", web]);
        const textH = 22 + 4 + 18 + 10 + details.length * 19;
        const topH = Math.max(100, textH);
        const H = PAD + topH + 14 + 3 + (c.parent ? 10 + 18 : 0) + 12 + noticeLines.length * 14 + PAD;
        canvas.width = (W + PAD * 2) * SCALE;
        canvas.height = H * SCALE;
        ctx.scale(SCALE, SCALE);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, W + PAD * 2, H);
        ctx.textBaseline = "middle";
        if (logo) ctx.drawImage(logo, PAD, PAD + (topH - 100) / 2, 200, 100);
        ctx.fillStyle = c.accent;
        ctx.fillRect(PAD + 220, PAD, 2, topH);
        const x = PAD + 242;
        let y = PAD + (topH - textH) / 2;
        font(17, true); ctx.fillStyle = "#1A1A1A"; ctx.fillText(v.name, x, y + 11); y += 22 + 4;
        font(12, true); ctx.fillStyle = c.accent; ctx.fillText(v.title, x, y + 9);
        const titleW = v.title ? ctx.measureText(v.title + "  ").width : 0;
        font(12, false); ctx.fillStyle = "#4A4A4A"; ctx.fillText(c.legal, x + titleW, y + 9); y += 18 + 10;
        details.forEach(function (d) {
            font(12, true); ctx.fillStyle = "#1A1A1A"; ctx.fillText(d[0], x, y + 9.5);
            const w = ctx.measureText(d[0] + "  ").width;
            font(12, false); ctx.fillStyle = "#4A4A4A"; ctx.fillText(d[1], x + w, y + 9.5);
            y += 19;
        });
        y = PAD + topH + 14;
        let sx = PAD;
        SIG_STRIPE.forEach(function (s) { const w = W * s[1] / 100; ctx.fillStyle = s[0]; ctx.fillRect(sx, y, w + 0.5, 3); sx += w; });
        y += 3;
        if (c.parent) {
            y += 10;
            font(11, false); ctx.fillStyle = "#1A1A1A"; ctx.fillText("A ", PAD, y + 9);
            let px = PAD + ctx.measureText("A ").width;
            font(11, true); ctx.fillText(c.parent, px, y + 9); px += ctx.measureText(c.parent + " ").width;
            font(11, false); ctx.fillText("company", px, y + 9);
            y += 18;
        }
        y += 12;
        font(10, false); ctx.fillStyle = "#9A9A9A";
        noticeLines.forEach(function (l) { ctx.fillText(l, PAD, y + 7); y += 14; });
        return new Promise(function (resolve) { canvas.toBlob(resolve, "image/png"); });
    }

    // The portal's security policy blocks style attributes in page markup, so the preview is parsed
    // separately and each element's styles are applied through the DOM (which is allowed).
    function renderSignaturePreview(box, html) {
        // Our own markup, with attribute values escaped, so renaming style="…" is safe.
        box.innerHTML = html.replace(/ style="/g, ' data-sig-style="');
        $$("[data-sig-style]", box).forEach(function (el) {
            el.style.cssText = el.getAttribute("data-sig-style");
            el.removeAttribute("data-sig-style");
        });
    }

    async function viewSignature(root, current) {
        const me = state.me;
        const manager = can("staff.manage");
        let people = [];
        if (manager) {
            try { people = (await api("/api/directory")).people; } catch (e) { people = []; }
            if (!current()) return;
        }
        const self = people.find(function (p) { return p.id === me.id; }) || me;
        let person = me.system && people.length ? people[0] : self;

        root.innerHTML =
            '<div class="page-head"><div><h1>Email signature</h1><p class="muted">Your branded signature, built from your staff profile. Copy it straight into Gmail or Outlook.</p></div></div>' +
            '<div class="sig-layout">' +
            '<section class="panel sig-form"><h2 class="panel-title">' + icon("edit") + "Details</h2>" +
            (manager ? '<label for="sig-person">Person</label><select id="sig-person">' + people.map(function (p) {
                return '<option value="' + p.id + '"' + (p.id === person.id ? " selected" : "") + ">" + esc(p.displayName) + (p.id === me.id ? " (you)" : "") + "</option>";
            }).join("") + "</select>" : "") +
            '<label for="sig-role">Company</label><select id="sig-role"></select>' +
            '<label for="sig-name">Name</label><input type="text" id="sig-name" maxlength="80">' +
            '<label for="sig-title">Job title</label><input type="text" id="sig-title" maxlength="100">' +
            '<label for="sig-email">Email</label><select id="sig-email"></select>' +
            '<div class="grid-2"><div><label for="sig-phone">Phone <span class="muted small">(optional)</span></label><input type="tel" id="sig-phone" maxlength="40"></div>' +
            '<div><label for="sig-web">Website</label><input type="text" id="sig-web" maxlength="80"></div></div>' +
            '<p class="hint">Changes here only affect the signature, not the staff profile.</p>' +
            "</section>" +
            '<section class="sig-right">' +
            '<div class="panel sig-preview-panel"><div class="panel-head"><h2 class="panel-title">' + icon("eye") + "Preview</h2>" +
            '<div class="btn-row"><button type="button" class="btn btn-ghost btn-small" id="sig-download">' + icon("download") + "Download PNG</button>" +
            '<button type="button" class="btn btn-ghost btn-small" id="sig-copy-code">' + icon("copy") + "Copy HTML</button>" +
            '<button type="button" class="btn btn-primary btn-small" id="sig-copy">' + icon("copy") + "Copy signature</button></div></div>" +
            '<div class="sig-mail"><div class="sig-mail-bar"><span></span><span></span><span></span></div>' +
            '<div class="sig-mail-body"><p class="sig-mail-text">Kind regards,</p><div id="sig-preview"></div></div></div></div>' +
            '<div class="panel sig-help"><h2 class="panel-title">' + icon("lifebuoy") + "Adding it to your email</h2>" +
            '<div class="segmented sig-tabs" role="tablist"><button type="button" data-help="gmail" class="active">Gmail</button><button type="button" data-help="outlook">Outlook</button><button type="button" data-help="apple">Apple Mail</button></div>' +
            '<ol class="sig-steps" data-steps="gmail"><li>Click <strong>Copy signature</strong> above.</li><li>In Gmail, open <strong>Settings</strong> (the cog) → <strong>See all settings</strong>.</li><li>Under <strong>Signature</strong>, click <strong>Create new</strong>, name it, and paste into the box.</li><li>Set it as the default for new emails and replies, then click <strong>Save changes</strong> at the bottom.</li></ol>' +
            '<ol class="sig-steps" data-steps="outlook" hidden><li>Click <strong>Copy signature</strong> above.</li><li>In Outlook, go to <strong>Settings</strong> → <strong>Mail</strong> (or <strong>Accounts</strong>) → <strong>Signatures</strong>.</li><li>Click <strong>New signature</strong>, name it, and paste into the box.</li><li>Choose it as the default for new messages and replies, then <strong>Save</strong>.</li></ol>' +
            '<ol class="sig-steps" data-steps="apple" hidden><li>Click <strong>Copy signature</strong> above.</li><li>In Mail, open <strong>Settings</strong> → <strong>Signatures</strong>, click <strong>+</strong> and paste.</li><li>Untick <strong>Always match my default message font</strong>.</li></ol>' +
            "</div></section></div>";

        const f = function (id) { return $("#" + id); };

        function rolesOf(p) {
            const list = [{ company: p.company, jobTitle: p.jobTitle }];
            (p.otherRoles || []).forEach(function (r) { list.push({ company: r.company, jobTitle: r.jobTitle || p.jobTitle }); });
            return list;
        }

        function pickEmail(p, company) {
            const domain = (SIGNATURE_COMPANIES[company] || {}).domain;
            const emails = p.emails || [];
            const match = domain && emails.find(function (e) { return e.address.toLowerCase().endsWith("@" + domain); });
            return (match || emails.find(function (e) { return e.primary; }) || emails[0] || {}).address || "";
        }

        function fillRole() {
            const role = rolesOf(person)[f("sig-role").selectedIndex] || rolesOf(person)[0];
            f("sig-title").value = role.jobTitle || "";
            const emails = person.emails || [];
            f("sig-email").innerHTML = emails.map(function (e) { return '<option value="' + esc(e.address) + '">' + esc(e.address) + "</option>"; }).join("") +
                '<option value="">No email</option>';
            f("sig-email").value = pickEmail(person, role.company);
            f("sig-web").value = (SIGNATURE_COMPANIES[role.company] || SIGNATURE_COMPANIES["HN Group"]).web;
        }

        function fillPerson() {
            const roles = rolesOf(person);
            f("sig-role").innerHTML = roles.map(function (r, i) {
                return '<option value="' + i + '">' + esc(r.company) + " — " + esc(r.jobTitle) + "</option>";
            }).join("");
            // Signatures use the full legal-style name, not the display name.
            f("sig-name").value = [person.firstName, person.lastName].filter(Boolean).join(" ").trim() || person.displayName || "";
            f("sig-phone").value = person.phone || "";
            fillRole();
        }

        function values() {
            const role = rolesOf(person)[f("sig-role").selectedIndex] || rolesOf(person)[0];
            return {
                company: role.company,
                name: f("sig-name").value.trim(),
                title: f("sig-title").value.trim(),
                email: f("sig-email").value,
                phone: f("sig-phone").value.trim(),
                website: f("sig-web").value.trim(),
            };
        }

        function draw() {
            renderSignaturePreview(f("sig-preview"), signatureHtml(values()));
        }

        fillPerson();
        draw();

        if (manager) f("sig-person").addEventListener("change", function (e) {
            person = people.find(function (p) { return p.id === e.target.value; });
            fillPerson();
            draw();
        });
        f("sig-role").addEventListener("change", function () { fillRole(); draw(); });
        $(".sig-form").addEventListener("input", draw);
        $(".sig-form").addEventListener("change", draw);

        f("sig-copy").addEventListener("click", async function () {
            const html = signatureHtml(values());
            try {
                await navigator.clipboard.write([new ClipboardItem({
                    "text/html": new Blob([html], { type: "text/html" }),
                    "text/plain": new Blob([f("sig-preview").innerText], { type: "text/plain" }),
                })]);
            } catch (e) {
                // Older browsers: copy the rendered preview as a selection.
                const range = document.createRange();
                range.selectNodeContents(f("sig-preview"));
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                document.execCommand("copy");
                sel.removeAllRanges();
            }
            toast("Signature copied. Paste it into your email signature settings.");
        });
        f("sig-copy-code").addEventListener("click", function () { copyText(signatureHtml(values())); });
        f("sig-download").addEventListener("click", async function () {
            const v = values();
            const png = await signaturePng(v);
            if (!png) { toast("The image couldn't be created. Try again."); return; }
            const a = document.createElement("a");
            a.href = URL.createObjectURL(png);
            a.download = (v.name || "signature").toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + v.company.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-signature.png";
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        });
        $(".sig-tabs").addEventListener("click", function (e) {
            const b = e.target.closest("[data-help]");
            if (!b) return;
            $$(".sig-tabs [data-help]").forEach(function (x) { x.classList.toggle("active", x === b); });
            $$("[data-steps]").forEach(function (o) { o.hidden = o.dataset.steps !== b.dataset.help; });
        });
    }

    // ================= Shared bits for the HR pages =================

    function fmtMoney(n) {
        const v = Number(n) || 0;
        return (v < 0 ? "−" : "") + "£" + Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtDays(n) {
        return (Math.round(n * 2) / 2) + (n === 1 ? " day" : " days");
    }

    function dateRange(from, to) {
        const f = new Date(from + "T12:00:00");
        const t = new Date(to + "T12:00:00");
        const opts = { day: "numeric", month: "short" };
        if (from === to) return f.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
        return f.toLocaleDateString("en-GB", f.getFullYear() === t.getFullYear() ? opts : Object.assign({ year: "numeric" }, opts)) + " – " +
            t.toLocaleDateString("en-GB", Object.assign({ year: "numeric" }, opts));
    }

    // A small modal asking for an optional note; resolves with the text, or null if cancelled.
    function askNote(opts) {
        return new Promise(function (resolve) {
            let done = false;
            const m = openModal(
                '<h2 class="modal-title">' + esc(opts.title) + "</h2>" + (opts.message ? '<p class="muted">' + esc(opts.message) + "</p>" : "") +
                '<form id="note-form" novalidate><label for="note-text">' + esc(opts.label || "Note") + ' <span class="muted small">' + (opts.required ? "" : "(optional)") + "</span></label>" +
                '<textarea id="note-text" rows="3" maxlength="500"></textarea><div class="form-error" id="note-error" hidden></div>' +
                '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn ' + (opts.danger ? "btn-danger" : "btn-primary") + '">' + esc(opts.confirmLabel || "Save") + "</button></div></form>",
                { onClose: function () { if (!done) resolve(null); } }
            );
            $("#note-text", m.el).focus();
            $("#note-form", m.el).addEventListener("submit", function (e) {
                e.preventDefault();
                const v = $("#note-text", m.el).value.trim();
                if (opts.required && !v) return formError($("#note-error", m.el), "Please add a note.");
                done = true;
                closeModal();
                resolve(v);
            });
        });
    }

    function statusBadge(status, labels) {
        const cls = { pending: "badge-yellow", submitted: "badge-yellow", draft: "", approved: "badge-green", issued: "badge-green", declined: "badge-red", rejected: "badge-red", cancelled: "" }[status] || "";
        return '<span class="badge ' + cls + '">' + esc((labels && labels[status]) || status.charAt(0).toUpperCase() + status.slice(1)) + "</span>";
    }

    // ================= Leave & absence =================

    const LEAVE_ICONS = { annual: "sun", sick: "thermometer", compassionate: "heart", unpaid: "calendar", other: "calendar", toil: "clock" };

    async function viewLeave(root, current) {
        const year = state.leaveYear || new Date().getFullYear();
        const d = await api("/api/leave?year=" + year);
        if (!current()) return;
        let tab = state.leaveTab || (d.approvals.length ? "approvals" : "mine");
        if (tab === "approvals" && !d.isApprover) tab = "mine";
        if ((tab === "allowances" || tab === "shutdowns") && !d.canManage) tab = "mine";
        if (tab === "rtw" && !d.returnToWork.length && !d.canManage) tab = "mine";
        const s = d.summary;

        const tabs = [["mine", "My leave", d.mine.length]];
        if (d.isApprover) tabs.push(["approvals", "To approve", d.approvals.length]);
        tabs.push(["off", "Who’s off", d.whosOff.length]);
        tabs.push(["calendar", "Calendar", null]);
        if (d.returnToWork.length || d.canManage) tabs.push(["rtw", "Return to work", d.returnToWork.length]);
        if (d.canManage) tabs.push(["allowances", "Allowances & absence", null], ["shutdowns", "Shutdown days", null]);

        root.innerHTML =
            '<div class="page-head"><div><h1>Leave &amp; Absence</h1><p class="muted">Book holidays, report sickness and see who’s off. Weekends and bank holidays never count against your allowance.</p></div>' +
            '<div class="page-actions">' + (s ? '<button type="button" class="btn btn-ghost" id="lv-sick">' + icon("thermometer") + "Report sickness</button>" : "") +
            (d.setPeople.length ? '<button type="button" class="btn ' + (s ? "btn-ghost" : "btn-primary") + '" id="lv-set">' + icon("calendar") + "Set leave</button>" : "") +
            (s ? '<button type="button" class="btn btn-primary" id="lv-new">' + icon("plus") + "Request leave</button>" : "") + "</div></div>" +
            (s ? '<section class="leave-summary">' +
                '<div class="ls-main"><div class="ls-year"><button type="button" class="icon-btn icon-btn-sm" data-year="' + (year - 1) + '" aria-label="Previous year">' + icon("chevronLeft") + "</button>" +
                "<span>" + year + " holiday allowance</span>" +
                '<button type="button" class="icon-btn icon-btn-sm" data-year="' + (year + 1) + '" aria-label="Next year">' + icon("chevronRight") + "</button></div>" +
                '<div class="ls-remaining"><span class="ls-big">' + (Math.round(s.remaining * 2) / 2) + '</span><span class="muted">of ' + s.allowance + " days left</span>" +
                (s.carried ? '<span class="badge badge-soft">Includes ' + s.carried + (s.carried === 1 ? " day" : " days") + " carried over from " + (year - 1) + "</span>" : "") +
                (s.bankHolidayAdjustment ? '<span class="badge badge-soft">' + (s.bankHolidayAdjustment > 0 ? "Includes " + s.bankHolidayAdjustment : "Less " + (-s.bankHolidayAdjustment)) + " for bank holidays (you work " + esc(s.patternLabel) + ")</span>" : "") + "</div>" +
                '<div class="ls-bar"><span class="ls-taken" data-pct="' + pct(s.taken, s.allowance) + '"></span><span class="ls-booked" data-pct="' + pct(s.booked, s.allowance) + '"></span><span class="ls-pending" data-pct="' + pct(s.pending, s.allowance) + '"></span></div>' +
                '<div class="ls-legend"><span class="ls-k taken">Taken ' + s.taken + '</span><span class="ls-k booked">Booked ' + s.booked + '</span><span class="ls-k pending">Waiting for approval ' + s.pending + "</span></div></div>" +
                '<div class="ls-side"><div class="stat"><div class="stat-value">' + s.sickDays + '</div><div class="stat-label">Sick days in ' + year + "</div></div>" +
                (s.toilHours ? '<button type="button" class="stat stat-btn" id="lv-mytoil"><div class="stat-value">' + s.toilHours + '<small class="stat-unit">hrs</small></div><div class="stat-label">Time off in lieu to use</div></button>' : "") +
                (state.me.onLeaveToday ? '<div class="stat ls-today"><div class="stat-value">' + icon("sun") + '</div><div class="stat-label">You’re on leave today</div></div>' : "") + "</div>" +
                "</section>" : "") +
            '<div class="company-tabs" id="lv-tabs">' + tabs.map(function (t) {
                return '<button type="button" data-tab="' + t[0] + '">' + esc(t[1]) + (t[2] !== null ? ' <span class="tab-count">' + t[2] + "</span>" : "") + "</button>";
            }).join("") + "</div>" +
            '<div id="lv-body"></div>';

        function pct(n, of) { return of ? Math.max(0, Math.min(100, (n / of) * 100)) : 0; }
        $$(".ls-bar [data-pct]", root).forEach(function (b) { b.style.width = b.dataset.pct + "%"; });

        function requestRow(r, opts) {
            opts = opts || {};
            return '<div class="leave-row" data-id="' + r.id + '">' +
                (opts.person ? avatar(r.person, "md") : '<span class="leave-icon lt-' + r.type + '">' + icon(LEAVE_ICONS[r.type] || "calendar") + "</span>") +
                '<div class="lr-main"><div class="lr-title">' + (opts.person ? esc(r.person.displayName) + ' <span class="muted">· ' + esc(r.typeLabel) + "</span>" : esc(r.typeLabel)) + "</div>" +
                '<div class="muted small">' + esc(dateRange(r.startDate, r.endDate)) + (r.halfDay ? " (" + (r.halfDay === "am" ? "morning" : "afternoon") + ")" : "") + " · " + fmtDays(r.days) + "</div>" +
                (r.note ? '<div class="lr-note">' + esc(r.note) + "</div>" : "") +
                (r.decisionNote ? '<div class="lr-note decision">' + icon("message") + esc(r.decidedBy || "") + ": " + esc(r.decisionNote) + "</div>" : "") +
                (r.clash ? '<div class="lr-note lr-clash">' + icon("alert") + r.clash.count + (r.clash.count === 1 ? " other person" : " others") + " from " + esc(r.clash.company) + " " + (r.clash.count === 1 ? "is" : "are") + " off on " + esc(fmtDate(r.clash.date + "T12:00:00")) + " (" + esc(r.clash.names.join(", ")) + ")</div>" : "") +
                (r.shutdown ? '<div class="lr-note">' + icon("building") + "Company shutdown</div>" : "") +
                (r.returnToWork ? '<div class="lr-note rtw-done">' + icon("check") + "Return-to-work form done" + (r.returnToWork.byName ? " by " + esc(r.returnToWork.byName) + (r.returnToWork.fitForWork === false ? " \u00b7 not yet fit for work" : "") : "") + "</div>" : "") +
                "</div>" +
                '<div class="lr-side">' + (opts.noStatus ? "" : statusBadge(r.status)) +
                (r.overBy ? '<span class="badge badge-yellow lr-over">' + icon("alert") + fmtDays(r.overBy) + " over allowance</span>" : "") +
                (r.canApprove && opts.actions ? '<div class="btn-row"><button type="button" class="btn btn-ghost btn-small" data-act="decline">Decline</button><button type="button" class="btn btn-primary btn-small" data-act="approve">' + icon("tick") + "Approve</button></div>" : "") +
                (r.canCancel && opts.cancel ? '<button type="button" class="btn btn-link btn-small" data-act="cancel">Cancel</button>' : "") +
                "</div></div>";
        }

        function draw() {
            $$("#lv-tabs [data-tab]").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === tab); });
            const body = $("#lv-body");
            if (tab === "mine") {
                body.innerHTML = d.mine.length ? '<div class="panel leave-list">' + d.mine.map(function (r) { return requestRow(r, { cancel: true }); }).join("") + "</div>"
                    : '<div class="empty-page">' + icon("sun", "big") + "<h2>No leave yet</h2><p class=\"muted\">Use <strong>Request leave</strong> to book some time off.</p></div>";
            } else if (tab === "approvals") {
                body.innerHTML = d.approvals.length ? '<div class="panel leave-list">' + d.approvals.map(function (r) { return requestRow(r, { person: true, actions: true, noStatus: true }); }).join("") + "</div>"
                    : '<div class="empty-page">' + icon("check", "big") + "<h2>Nothing to approve</h2><p class=\"muted\">Requests from your team will appear here.</p></div>";
            } else if (tab === "rtw") {
                body.innerHTML = d.returnToWork.length ? '<div class="panel leave-list">' + d.returnToWork.map(function (r) {
                    return '<div class="leave-row" data-id="' + r.id + '">' + avatar(r.person, "md") +
                        '<div class="lr-main"><div class="lr-title">' + esc(r.person.displayName) + ' <span class="muted">\u00b7 off sick</span></div>' +
                        '<div class="muted small">' + esc(dateRange(r.startDate, r.endDate)) + " \u00b7 " + fmtDays(r.days) + "</div>" +
                        (r.note ? '<div class="lr-note">' + esc(r.note) + "</div>" : "") + "</div>" +
                        '<div class="lr-side"><button type="button" class="btn btn-primary btn-small" data-rtw="' + r.id + '">' + icon("edit") + "Complete form</button></div></div>";
                }).join("") + "</div>"
                    : '<div class="empty-page">' + icon("check", "big") + "<h2>No forms to complete</h2><p class=\"muted\">When someone you look after comes back from sickness, a return-to-work form appears here.</p></div>";
            } else if (tab === "off") {
                body.innerHTML = d.whosOff.length ? '<div class="panel leave-list">' + d.whosOff.map(function (r) { return requestRow(r, { person: true, noStatus: true, cancel: d.canManage }); }).join("") + "</div>"
                    : '<div class="empty-page">' + icon("users", "big") + "<h2>Nobody’s off</h2><p class=\"muted\">" + (d.canManage ? "No approved leave in the next 60 days." : "No approved leave for you or your team in the next 60 days.") + "</p></div>";
            } else if (tab === "calendar") {
                mountLeaveCalendar(body);
            } else if (tab === "shutdowns") {
                mountShutdowns(body);
            } else {
                body.innerHTML = '<section class="panel"><div class="panel-head"><h2 class="panel-title">' + icon("sun") + year + " allowances</h2>" +
                    '<div class="allow-forms"><form class="allow-default" id="lv-default"><label for="lv-def">Default for everyone</label><input type="number" id="lv-def" min="0" max="100" step="0.5" value="' + d.allowances.defaultAllowance + '"><span class="muted small">days</span>' +
                    '<button type="submit" class="btn btn-ghost btn-small">Save</button></form>' +
                    '<form class="allow-default" id="lv-carry"><label for="lv-carry-n">Carry over up to</label><input type="number" id="lv-carry-n" min="0" max="50" step="0.5" value="' + d.allowances.maxCarryOver + '"><span class="muted small">days into next year</span>' +
                    '<button type="submit" class="btn btn-ghost btn-small">Save</button></form>' +
                    '<form class="allow-default" id="lv-clash"><label for="lv-clash-n">Warn when more than</label><input type="number" id="lv-clash-n" min="0" max="100" value="' + d.allowances.maxOffPerCompany + '"><span class="muted small">people from one company are off (0 = never)</span>' +
                    '<button type="submit" class="btn btn-ghost btn-small">Save</button></form></div></div>' +
                    '<p class="muted small">Annual leave days per year, not counting bank holidays. Leave a person’s box empty to use the default.</p>' +
                    '<div class="table-card flat"><table class="table"><thead><tr><th>Person</th><th>Allowance</th><th>Carried</th><th>Taken</th><th>Booked</th><th>Waiting</th><th>Left</th><th title="Sickness in the last 52 weeks">Sickness (52 wks)</th><th title="Occurrences squared × days. Higher scores mean frequent short absences.">Bradford</th><th>TOIL</th><th>Working days</th></tr></thead><tbody>' +
                    d.people.map(function (p) {
                        const custom = d.allowances.custom[p.id];
                        return '<tr><td><div class="emp-cell">' + avatar(p, "sm") + '<div><div class="emp-name">' + esc(p.displayName) + '</div><div class="muted small">' + esc(p.jobTitle) + "</div></div></div></td>" +
                            '<td data-label="Allowance"><input type="number" class="allow-input" data-allow="' + p.id + '" min="0" max="100" step="0.5" value="' + (custom === undefined ? "" : custom) + '" placeholder="' + d.allowances.defaultAllowance + '" aria-label="Allowance for ' + esc(p.displayName) + '"></td>' +
                            '<td data-label="Carried">' + (p.summary.carried || '<span class="muted">\u2013</span>') + '</td><td data-label="Taken">' + p.summary.taken + '</td><td data-label="Booked">' + p.summary.booked + '</td><td data-label="Waiting">' + p.summary.pending + "</td>" +
                            '<td data-label="Left"><strong' + (p.summary.remaining < 0 ? ' class="danger-text"' : "") + ">" + p.summary.remaining + "</strong></td>" +
                            '<td data-label="Sickness">' + (p.absence.occurrences ? p.absence.occurrences + (p.absence.occurrences === 1 ? " time, " : " times, ") + fmtDays(p.absence.days) : '<span class="muted">None</span>') + "</td>" +
                            '<td data-label="Bradford"><span class="bradford ' + (p.absence.bradford >= 200 ? "b-high" : p.absence.bradford >= 50 ? "b-mid" : "b-low") + '">' + p.absence.bradford + "</span></td>" +
                            '<td data-label="TOIL"><button type="button" class="btn btn-ghost btn-small" data-toil="' + p.id + '" data-name="' + esc(p.displayName) + '">' + (p.summary.toilHours || 0) + " hrs</button></td>" +
                            '<td data-label="Working days"><button type="button" class="btn btn-ghost btn-small" data-wp="' + p.id + '" data-name="' + esc(p.displayName) + '" data-days="' + p.summary.pattern.join(",") + '">' + esc(p.summary.patternLabel) + "</button>" +
                            (p.summary.bankHolidayAdjustment ? '<div class="muted small">Bank holidays ' + (p.summary.bankHolidayAdjustment > 0 ? "+" : "") + p.summary.bankHolidayAdjustment + "</div>" : "") + "</td></tr>";
                    }).join("") + "</tbody></table></div></section>";
                $("#lv-clash").addEventListener("submit", async function (e) {
                    e.preventDefault();
                    try { await api("/api/leave/settings", { maxOffPerCompany: $("#lv-clash-n").value }); toast("Clash warning saved."); render(); } catch (err) { toast(err.message); }
                });
                $("#lv-carry").addEventListener("submit", async function (e) {
                    e.preventDefault();
                    try { await api("/api/leave/allowances", { maxCarryOver: $("#lv-carry-n").value }); toast("Carry-over limit saved."); render(); } catch (err) { toast(err.message); }
                });
                $("#lv-default").addEventListener("submit", async function (e) {
                    e.preventDefault();
                    try { await api("/api/leave/allowances", { defaultAllowance: $("#lv-def").value }); toast("Default allowance saved."); render(); } catch (err) { toast(err.message); }
                });
            }
        }

        root.addEventListener("change", async function (e) {
            const inp = e.target.closest("[data-allow]");
            if (!inp) return;
            try { await api("/api/leave/allowances", { personId: inp.dataset.allow, days: inp.value }); toast("Allowance saved."); render(); } catch (err) { toast(err.message); }
        });
        root.addEventListener("click", async function (e) {
            const t = e.target.closest("[data-tab]");
            if (t) { tab = state.leaveTab = t.dataset.tab; return draw(); }
            const y = e.target.closest("[data-year]");
            if (y) { state.leaveYear = Number(y.dataset.year); return render(); }
            if (e.target.closest("#lv-new")) return openLeaveForm(d, "annual");
            if (e.target.closest("#lv-sick")) return openLeaveForm(d, "sick");
            if (e.target.closest("#lv-set")) return openLeaveForm(d, "annual", true);
            const wp = e.target.closest("[data-wp]");
            if (wp) return openWorkPattern(wp.dataset.wp, wp.dataset.name, wp.dataset.days.split(",").map(Number));
            const toil = e.target.closest("[data-toil]");
            if (toil) return openToil(toil.dataset.toil, toil.dataset.name, true);
            if (e.target.closest("#lv-mytoil")) return openToil(state.me.id, state.me.displayName, false);
            const rtw = e.target.closest("[data-rtw]");
            if (rtw) return openReturnToWork(d.returnToWork.find(function (x) { return x.id === rtw.dataset.rtw; }));
            const act = e.target.closest("[data-act]");
            if (!act) return;
            const id = act.closest("[data-id]").dataset.id;
            try {
                let note = "";
                if (act.dataset.act === "decline") {
                    note = await askNote({ title: "Decline this request?", label: "Reason", confirmLabel: "Decline", danger: true });
                    if (note === null) return;
                } else if (act.dataset.act === "cancel") {
                    if (!(await confirmDialog({ title: "Cancel this leave?", message: "The days go back into the allowance.", confirmLabel: "Cancel leave", danger: true }))) return;
                }
                let allowOver = false;
                const row = (d.approvals || []).find(function (x) { return x.id === id; });
                if (act.dataset.act === "approve" && row && row.overBy) {
                    if (!(await confirmDialog({ title: "Approve leave over allowance?", message: esc(row.person.displayName) + " doesn’t have enough holiday left. Approving this takes them " + fmtDays(row.overBy) + " over their allowance.", confirmLabel: "Approve anyway" }))) return;
                    allowOver = true;
                }
                const r = await api("/api/leave/" + id + "/" + act.dataset.act, { note: note, allowOver: allowOver });
                state.me = r.user;
                renderChrome();
                toast({ approve: "Leave approved.", decline: "Request declined.", cancel: "Leave cancelled." }[act.dataset.act]);
                render();
            } catch (err) { toast(err.message); }
        });
        draw();
    }

    function openReturnToWork(r) {
        const m = openModal(
            '<h2 class="modal-title">Return-to-work form</h2>' +
            '<p class="muted">' + esc(r.person.displayName) + " was off sick " + esc(dateRange(r.startDate, r.endDate)) + " (" + fmtDays(r.days) + "). Have a short chat with them, then record it here. Only their managers and HR see this.</p>" +
            '<form id="rtw-form" novalidate>' +
            '<div class="grid-2"><div><label for="rtw-date">Date of the chat</label><input type="date" id="rtw-date" value="' + isoDay(new Date()) + '"></div><div></div></div>' +
            '<label for="rtw-reason">What was the absence for?</label><input type="text" id="rtw-reason" maxlength="300" placeholder="e.g. Cold and flu">' +
            '<div class="option-row"><label class="inline-check"><input type="checkbox" id="rtw-fit" checked> Fit to return to work</label>' +
            '<label class="inline-check"><input type="checkbox" id="rtw-work"> Caused or made worse by work</label>' +
            '<label class="inline-check"><input type="checkbox" id="rtw-note"> Fit note provided</label></div>' +
            '<label for="rtw-adj">Support or adjustments agreed <span class="muted small">(optional)</span></label><textarea id="rtw-adj" rows="2" maxlength="1000" placeholder="e.g. Shorter days for the first week"></textarea>' +
            '<label for="rtw-notes">Other notes <span class="muted small">(optional)</span></label><textarea id="rtw-notes" rows="2" maxlength="2000"></textarea>' +
            '<div class="form-error" id="rtw-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">' + icon("tick") + "Save form</button></div></form>"
        );
        $("#rtw-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                const res = await api("/api/leave/" + r.id + "/return-to-work", {
                    meetingDate: $("#rtw-date", m.el).value, reason: $("#rtw-reason", m.el).value, fitForWork: $("#rtw-fit", m.el).checked,
                    workRelated: $("#rtw-work", m.el).checked, fitNote: $("#rtw-note", m.el).checked, adjustments: $("#rtw-adj", m.el).value, notes: $("#rtw-notes", m.el).value,
                });
                state.me = res.user;
                renderChrome();
                closeModal();
                toast("Return-to-work form saved.");
                render();
            } catch (err) { formError($("#rtw-error", m.el), err.message); }
        });
    }

    // "Request leave" and "Report sickness" are for yourself. "Set leave" places someone else on
    // leave straight away (HR for anyone, supervisors for their team), with no approval step.
    function openLeaveForm(d, type, setFor) {
        const t0 = isoDay(new Date());
        const m = openModal(
            '<h2 class="modal-title">' + (setFor ? "Set leave" : type === "sick" ? "Report sickness" : "Request leave") + "</h2>" +
            (setFor ? '<p class="muted">Place someone on leave. It’s booked straight away, with no approval needed.</p>'
                : type === "sick" ? '<p class="muted">Let your team know you’re off sick. It’s recorded straight away and doesn’t come out of your holiday allowance.</p>' : "") +
            '<form id="lv-form" novalidate>' +
            (setFor ? '<label for="lv-person">Who</label><select id="lv-person" required><option value="">Choose someone…</option>' + d.setPeople.map(function (p) {
                return '<option value="' + p.id + '">' + esc(p.displayName) + (p.jobTitle ? " \u00b7 " + esc(p.jobTitle) : "") + "</option>";
            }).join("") + "</select>" : "") +
            '<label for="lv-type">Type</label><select id="lv-type">' + Object.keys(d.types).map(function (k) {
                return '<option value="' + k + '"' + (k === type ? " selected" : "") + ">" + esc(d.types[k]) + "</option>";
            }).join("") + "</select>" +
            '<div class="grid-2"><div><label for="lv-start">From</label><input type="date" id="lv-start" value="' + t0 + '"></div>' +
            '<div><label for="lv-end">To</label><input type="date" id="lv-end" value="' + t0 + '"></div></div>' +
            '<div class="option-row" id="lv-half-row"><label class="inline-check"><input type="radio" name="lv-half" value="" checked> Full day</label>' +
            '<label class="inline-check"><input type="radio" name="lv-half" value="am"> Morning only</label><label class="inline-check"><input type="radio" name="lv-half" value="pm"> Afternoon only</label></div>' +
            '<div class="lv-count" id="lv-count"></div>' +
            '<label for="lv-note">Note <span class="muted small">(optional' + (type === "sick" ? ", only your manager and HR see it" : "") + ')</span></label><textarea id="lv-note" rows="2" maxlength="500"></textarea>' +
            '<div class="form-error" id="lv-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary" id="lv-submit">' + (setFor ? "Set leave" : type === "sick" ? "Report sickness" : "Send request") + "</button></div></form>"
        );
        let seq = 0;
        async function recount() {
            const from = $("#lv-start", m.el).value;
            const to = $("#lv-end", m.el).value;
            $("#lv-half-row", m.el).hidden = from !== to;
            const mySeq = ++seq;
            const who = setFor ? $("#lv-person", m.el).value : "";
            let days = 0, remaining = null;
            try {
                const w = await api("/api/leave/working-days", { startDate: from, endDate: to, personId: who });
                days = w.days; remaining = w.remaining;
            } catch (e) { days = 0; }
            if (mySeq !== seq) return;
            const half = from === to && $("input[name=lv-half]:checked", m.el).value;
            if (half && days) days = 0.5;
            const typ = $("#lv-type", m.el).value;
            const over = typ === "annual" && remaining !== null && days > remaining ? Math.round((days - Math.max(0, remaining)) * 2) / 2 : 0;
            const count = $("#lv-count", m.el);
            count.classList.toggle("lv-over", !!over && !!days);
            count.innerHTML = !days ? icon("alert") + "These dates are all weekends or bank holidays."
                : icon(over ? "alert" : "calendar") + "<strong>" + fmtDays(days) + "</strong>" +
                  (typ === "annual" && remaining !== null && !over ? " · " + (Math.round((remaining - days) * 2) / 2) + " left afterwards" : "") +
                  (over ? " · " + fmtDays(over) + " over " + (setFor ? "their" : "your") + " allowance" + (setFor ? "" : ", so your supervisor will need to approve it") : "") +
                  (typ === "sick" ? " · not taken from holiday" : "");
            $("#lv-submit", m.el).textContent = setFor ? "Set leave" : typ === "sick" ? "Report sickness" : "Send request";
        }
        $("#lv-start", m.el).addEventListener("change", function (e) { if ($("#lv-end", m.el).value < e.target.value) $("#lv-end", m.el).value = e.target.value; recount(); });
        m.el.addEventListener("change", function (e) { if (e.target.id !== "lv-start") recount(); });
        recount();
        $("#lv-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                if (setFor && !$("#lv-person", m.el).value) return formError($("#lv-error", m.el), "Choose who to put on leave.");
                const r = await api("/api/leave", {
                    personId: setFor ? $("#lv-person", m.el).value : "",
                    type: $("#lv-type", m.el).value,
                    startDate: $("#lv-start", m.el).value,
                    endDate: $("#lv-end", m.el).value,
                    halfDay: $("#lv-start", m.el).value === $("#lv-end", m.el).value ? $("input[name=lv-half]:checked", m.el).value : "",
                    note: $("#lv-note", m.el).value,
                });
                state.me = r.user;
                renderChrome();
                closeModal();
                toast(setFor ? "Leave set." : $("#lv-type", m.el).value === "sick" ? "Sickness recorded. Get well soon." : "Request sent for approval.");
                state.leaveTab = setFor ? "off" : "mine";
                render();
            } catch (err) { formError($("#lv-error", m.el), err.message); }
        });
    }

    // ================= Rotas & timesheets =================

    function addDaysIso(date, n) {
        const d = new Date(date + "T12:00:00");
        d.setDate(d.getDate() + n);
        return isoDay(d);
    }

    function mondayOf(date) {
        const d = new Date(date + "T12:00:00");
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return isoDay(d);
    }

    function hoursBetween(start, end, breakMins) {
        if (!start || !end) return 0;
        const mins = function (t) { return Number(t.slice(0, 2)) * 60 + Number(t.slice(3)); };
        let span = mins(end) - mins(start);
        if (span <= 0) span += 1440;
        return Math.max(0, Math.round(((span - (Number(breakMins) || 0)) / 60) * 100) / 100);
    }

    function fmtHours(h) {
        const whole = Math.floor(h);
        const m = Math.round((h - whole) * 60);
        return whole + "h" + (m ? " " + m + "m" : "");
    }

    const SHEET_STATUS = { draft: "Draft", submitted: "Waiting for approval", approved: "Approved", rejected: "Sent back" };

    async function viewRotas(root, current) {
        const week = state.rotaWeek || mondayOf(isoDay(new Date()));
        const [rota, mine] = await Promise.all([
            api("/api/rotas?week=" + week),
            state.me.system ? Promise.resolve(null) : api("/api/timesheets/mine?week=" + week),
        ]);
        const review = rota.isApprover ? await api("/api/timesheets/review") : null;
        if (!current()) return;
        let tab = state.rotaTab || "rota";
        if (tab === "timesheet" && !mine) tab = "rota";
        if (tab === "approvals" && !review) tab = "rota";
        let company = state.rotaCompany || "";

        const tabs = [["rota", "Rota", null]];
        if (mine) tabs.push(["timesheet", "My timesheet", null]);
        if (review) tabs.push(["approvals", "Timesheets to approve", review.waiting.length]);
        const days = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return addDaysIso(week, i); });
        const weekLabel = new Date(week + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " – " +
            new Date(days[6] + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

        root.innerHTML =
            '<div class="page-head"><div><h1>Rotas &amp; Timesheets</h1><p class="muted">Who’s working when, and the hours you’ve worked.</p></div>' +
            (rota.canManage ? '<div class="page-actions"><button type="button" class="btn btn-ghost" id="rt-copy">' + icon("copy") + "Copy last week</button>" +
                '<button type="button" class="btn btn-primary" id="rt-add">' + icon("plus") + "Add shift</button></div>" : "") + "</div>" +
            '<div class="company-tabs" id="rt-tabs">' + tabs.map(function (t) {
                return '<button type="button" data-tab="' + t[0] + '">' + esc(t[1]) + (t[2] !== null ? ' <span class="tab-count">' + t[2] + "</span>" : "") + "</button>";
            }).join("") + "</div>" +
            '<div class="week-nav"><button type="button" class="icon-btn" data-week="' + addDaysIso(week, -7) + '" aria-label="Previous week">' + icon("chevronLeft") + "</button>" +
            '<button type="button" class="btn btn-ghost btn-small" data-week="' + mondayOf(isoDay(new Date())) + '">This week</button>' +
            '<button type="button" class="icon-btn" data-week="' + addDaysIso(week, 7) + '" aria-label="Next week">' + icon("chevronRight") + "</button>" +
            '<h2 class="week-title">' + esc(weekLabel) + "</h2></div>" +
            '<div id="rt-body"></div>';

        const today = isoDay(new Date());
        const peopleById = {};
        rota.people.forEach(function (p) { peopleById[p.id] = p; });

        function drawRota() {
            const worksAtCo = function (p) { return !company || p.company === company || p.otherCompanies.indexOf(company) !== -1; };
            let people = rota.people.filter(worksAtCo);
            if (!rota.canManage) {
                people = people.filter(function (p) { return p.id === state.me.id || rota.shifts.some(function (s) { return s.personId === p.id; }); });
            }
            const companies = Array.from(new Set(rota.people.map(function (p) { return p.company; })));
            return '<div class="company-tabs small-tabs" id="rt-companies"><button type="button" data-co=""' + (company ? "" : ' class="active"') + ">Everyone</button>" +
                companies.map(function (c) { return '<button type="button" data-co="' + esc(c) + '"' + (company === c ? ' class="active"' : "") + ">" + esc(c) + "</button>"; }).join("") + "</div>" +
                (people.length ? '<div class="rota-wrap"><table class="rota"><thead><tr><th class="rota-person">Person</th>' + days.map(function (d) {
                    const dt = new Date(d + "T12:00:00");
                    return '<th class="' + (d === today ? "is-today" : "") + '"><span class="rd-dow">' + dt.toLocaleDateString("en-GB", { weekday: "short" }) + '</span><span class="rd-num">' + dt.getDate() + "</span></th>";
                }).join("") + '<th class="rota-total">Hours</th></tr></thead><tbody>' +
                    people.map(function (p) {
                        let total = 0;
                        return '<tr><th class="rota-person" scope="row"><div class="emp-cell">' + avatar(p, "sm") + '<div><div class="emp-name">' + esc(p.displayName) + '</div><div class="muted small">' + esc(p.jobTitle) + "</div></div></div></th>" +
                            days.map(function (d) {
                                const shifts = rota.shifts.filter(function (s) { return s.personId === p.id && s.date === d; });
                                const off = rota.leave.find(function (l) { return l.personId === p.id && l.startDate <= d && l.endDate >= d; });
                                shifts.forEach(function (s) { total += s.hours; });
                                return '<td class="rota-cell' + (d === today ? " is-today" : "") + (rota.canManage ? " editable" : "") + '" data-person="' + p.id + '" data-date="' + d + '">' +
                                    (off ? '<span class="rota-leave">' + icon("sun") + "Leave</span>" : "") +
                                    shifts.map(function (s) {
                                        return '<button type="button" class="shift" data-shift="' + s.id + '"><span class="sh-time">' + esc(s.start) + "–" + esc(s.end) + "</span>" +
                                            (s.note ? '<span class="sh-note">' + esc(s.note) + "</span>" : "") + "</button>";
                                    }).join("") +
                                    (rota.canManage && !shifts.length ? '<span class="rota-add" aria-hidden="true">' + icon("plus") + "</span>" : "") + "</td>";
                            }).join("") + '<td class="rota-total">' + (total ? fmtHours(total) : '<span class="muted">–</span>') + "</td></tr>";
                    }).join("") + "</tbody></table></div>"
                    : '<div class="empty-page">' + icon("clock", "big") + "<h2>No shifts this week</h2><p class=\"muted\">" + (rota.canManage ? "Use <strong>Add shift</strong> or click a day on the rota." : "Nothing has been planned yet.") + "</p></div>");
        }

        function drawTimesheet() {
            const sh = mine.sheet;
            const locked = sh.status === "submitted" || sh.status === "approved";
            return '<section class="panel ts-panel">' +
                '<div class="panel-head"><h2 class="panel-title">' + icon("clock") + "Week of " + esc(new Date(week + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" })) + "</h2>" +
                statusBadge(sh.status, SHEET_STATUS) + "</div>" +
                (sh.status === "rejected" && sh.decisionNote ? '<div class="banner banner-warn"><div><strong>Sent back by ' + esc(sh.decidedByName || "your approver") + ":</strong> " + esc(sh.decisionNote) + "</div></div>" : "") +
                (sh.status === "approved" ? '<p class="muted small">Approved by ' + esc(sh.decidedByName || "") + " " + esc(timeAgo(sh.decidedAt)) + ".</p>" : "") +
                (!sh.id && sh.fromRota ? '<p class="muted small">' + icon("tick") + "Filled in from your shifts on the rota. Change anything that was different.</p>" : "") +
                '<div class="table-card flat"><table class="table ts-table"><thead><tr><th>Day</th><th>Start</th><th>Finish</th><th>Break (mins)</th><th>Hours</th><th>Note</th></tr></thead><tbody>' +
                sh.days.map(function (d, i) {
                    const dt = new Date(d.date + "T12:00:00");
                    return '<tr data-i="' + i + '"><td class="nowrap"><strong>' + dt.toLocaleDateString("en-GB", { weekday: "short" }) + "</strong> " + dt.getDate() + "</td>" +
                        '<td data-label="Start"><input type="time" class="ts-start" value="' + esc(d.start) + '"' + (locked ? " disabled" : "") + "></td>" +
                        '<td data-label="Finish"><input type="time" class="ts-end" value="' + esc(d.end) + '"' + (locked ? " disabled" : "") + "></td>" +
                        '<td data-label="Break"><input type="number" class="ts-break" min="0" max="600" step="5" value="' + (d.start ? d.breakMins : "") + '"' + (locked ? " disabled" : "") + "></td>" +
                        '<td data-label="Hours" class="ts-hours">' + (d.hours ? fmtHours(d.hours) : '<span class="muted">–</span>') + "</td>" +
                        '<td data-label="Note"><input type="text" class="ts-note" maxlength="200" value="' + esc(d.note) + '"' + (locked ? " disabled" : "") + "></td></tr>";
                }).join("") + '</tbody><tfoot><tr><td colspan="4"><strong>Total</strong></td><td id="ts-total"><strong>' + fmtHours(sh.totalHours) + "</strong></td><td></td></tr></tfoot></table></div>" +
                '<div class="form-error" id="ts-error" hidden></div>' +
                (locked ? "" : '<div class="form-actions btn-row ts-actions"><button type="button" class="btn btn-ghost" id="ts-save">Save draft</button><button type="button" class="btn btn-primary" id="ts-submit">' + icon("tick") + "Submit for approval</button></div>") +
                "</section>" +
                (mine.recent.length ? '<section class="panel"><h2 class="panel-title">' + icon("list") + "Recent timesheets</h2><ul class=\"plain-list ts-recent\">" + mine.recent.map(function (t) {
                    return '<li><button type="button" class="btn btn-link" data-week="' + t.week + '">Week of ' + esc(new Date(t.week + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })) + "</button>" +
                        '<span class="muted small">' + fmtHours(t.totalHours) + "</span>" + statusBadge(t.status, SHEET_STATUS) + "</li>";
                }).join("") + "</ul></section>" : "");
        }

        function sheetCard(t, actions) {
            return '<article class="panel ts-review" data-sheet="' + t.id + '"><div class="ts-review-head">' + avatar(t.person, "md") +
                '<div class="lr-main"><div class="lr-title">' + esc(t.person.displayName) + '</div><div class="muted small">Week of ' +
                esc(new Date(t.week + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })) + " · <strong>" + fmtHours(t.totalHours) + "</strong></div></div>" +
                (actions ? '<div class="btn-row"><button type="button" class="btn btn-ghost btn-small" data-ts="reject">Send back</button><button type="button" class="btn btn-primary btn-small" data-ts="approve">' + icon("tick") + "Approve</button></div>"
                    : statusBadge(t.status, SHEET_STATUS)) + "</div>" +
                '<div class="ts-days">' + t.days.map(function (d) {
                    const dt = new Date(d.date + "T12:00:00");
                    return '<div class="ts-day' + (d.start ? "" : " off") + '"><span class="tsd-dow">' + dt.toLocaleDateString("en-GB", { weekday: "short" }) + "</span>" +
                        (d.start ? '<span class="tsd-time">' + esc(d.start) + "–" + esc(d.end) + '</span><span class="tsd-hours">' + fmtHours(d.hours) + "</span>" : '<span class="tsd-time muted">Off</span>') +
                        (d.note ? '<span class="tsd-note" title="' + esc(d.note) + '">' + icon("message") + "</span>" : "") + "</div>";
                }).join("") + "</div>" +
                (t.decisionNote && !actions ? '<p class="lr-note decision">' + icon("message") + esc(t.decidedByName || "") + ": " + esc(t.decisionNote) + "</p>" : "") +
                "</article>";
        }

        function drawApprovals() {
            return (review.waiting.length ? review.waiting.map(function (t) { return sheetCard(t, true); }).join("")
                : '<div class="empty-page">' + icon("check", "big") + "<h2>All caught up</h2><p class=\"muted\">Submitted timesheets from your team appear here.</p></div>") +
                (review.recent.length ? '<h2 class="section-title about-title">' + icon("clock") + "Recently dealt with</h2>" + review.recent.map(function (t) { return sheetCard(t, false); }).join("") : "");
        }

        function draw() {
            $$("#rt-tabs [data-tab]").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === tab); });
            $(".week-nav").hidden = tab === "approvals";
            const body = $("#rt-body");
            body.innerHTML = tab === "rota" ? drawRota() : tab === "timesheet" ? drawTimesheet() : drawApprovals();
        }

        function readSheet() {
            return $$(".ts-table tbody tr").map(function (tr) {
                const i = Number(tr.dataset.i);
                return { date: mine.sheet.days[i].date, start: $(".ts-start", tr).value, end: $(".ts-end", tr).value, breakMins: $(".ts-break", tr).value, note: $(".ts-note", tr).value };
            });
        }

        root.addEventListener("input", function (e) {
            const tr = e.target.closest(".ts-table tbody tr");
            if (!tr) return;
            const h = hoursBetween($(".ts-start", tr).value, $(".ts-end", tr).value, $(".ts-break", tr).value);
            $(".ts-hours", tr).innerHTML = h ? fmtHours(h) : '<span class="muted">–</span>';
            const total = readSheet().reduce(function (n, d) { return n + hoursBetween(d.start, d.end, d.breakMins); }, 0);
            $("#ts-total").innerHTML = "<strong>" + fmtHours(total) + "</strong>";
        });

        root.addEventListener("click", async function (e) {
            const t = e.target.closest("[data-tab]");
            if (t) { tab = state.rotaTab = t.dataset.tab; return draw(); }
            const w = e.target.closest("[data-week]");
            if (w) { state.rotaWeek = mondayOf(w.dataset.week); return render(); }
            const co = e.target.closest("[data-co]");
            if (co) { company = state.rotaCompany = co.dataset.co; return draw(); }
            if (e.target.closest("#rt-add")) return openShiftForm(rota, null, { date: week });
            if (e.target.closest("#rt-copy")) {
                if (!(await confirmDialog({ title: "Copy last week’s shifts?", message: "Every shift from the week before is added to this week. Shifts already here are kept.", confirmLabel: "Copy shifts" }))) return;
                try {
                    const r = await api("/api/rotas/copy-week", { from: addDaysIso(week, -7), to: week });
                    toast(r.added ? r.added + (r.added === 1 ? " shift copied." : " shifts copied.") : "Nothing new to copy.");
                    render();
                } catch (err) { toast(err.message); }
                return;
            }
            const shiftBtn = e.target.closest("[data-shift]");
            if (shiftBtn) {
                const s = rota.shifts.find(function (x) { return x.id === shiftBtn.dataset.shift; });
                if (rota.canManage) return openShiftForm(rota, s);
                return toast(peopleById[s.personId].displayName + ": " + s.start + "–" + s.end + (s.note ? " (" + s.note + ")" : "") + ", " + fmtHours(s.hours));
            }
            const cell = e.target.closest(".rota-cell.editable");
            if (cell) return openShiftForm(rota, null, { personId: cell.dataset.person, date: cell.dataset.date });
            if (e.target.closest("#ts-save") || e.target.closest("#ts-submit")) {
                const submit = !!e.target.closest("#ts-submit");
                try {
                    const r = await api("/api/timesheets/mine", { week: week, days: readSheet(), submit: submit });
                    mine.sheet = r.sheet;
                    state.me = r.user;
                    renderChrome();
                    toast(submit ? "Timesheet submitted for approval." : "Draft saved.");
                    render();
                } catch (err) { formError($("#ts-error"), err.message); }
                return;
            }
            const ts = e.target.closest("[data-ts]");
            if (ts) {
                const id = ts.closest("[data-sheet]").dataset.sheet;
                let note = "";
                let toilHours = 0;
                const sheet = review && review.waiting.find(function (x) { return x.id === id; });
                if (ts.dataset.ts === "approve" && sheet && sheet.plannedHours > 0 && sheet.totalHours > sheet.plannedHours) {
                    const extra = Math.round((sheet.totalHours - sheet.plannedHours) * 100) / 100;
                    toilHours = await askToil(sheet.person.displayName, extra, sheet.plannedHours, sheet.totalHours);
                    if (toilHours === null) return;
                }
                if (ts.dataset.ts === "reject") {
                    note = await askNote({ title: "Send this timesheet back?", message: "They can correct it and submit it again.", label: "What needs changing", required: true, confirmLabel: "Send back", danger: true });
                    if (note === null) return;
                }
                try {
                    const r = await api("/api/timesheets/" + id + "/" + ts.dataset.ts, { note: note, toilHours: toilHours });
                    state.me = r.user;
                    renderChrome();
                    toast(ts.dataset.ts === "approve" ? "Timesheet approved." : "Timesheet sent back.");
                    render();
                } catch (err) { toast(err.message); }
            }
        });
        draw();
    }

    function openShiftForm(rota, shift, preset) {
        const v = shift || Object.assign({ personId: rota.people[0] && rota.people[0].id, start: "09:00", end: "17:00", breakMins: 30, note: "" }, preset || {});
        const m = openModal(
            '<h2 class="modal-title">' + (shift ? "Edit shift" : "Add shift") + "</h2>" +
            '<form id="sh-form" novalidate>' +
            '<label for="sh-person">Person</label><select id="sh-person">' + rota.people.map(function (p) {
                return '<option value="' + p.id + '"' + (p.id === v.personId ? " selected" : "") + ">" + esc(p.displayName) + " — " + esc(p.jobTitle) + "</option>";
            }).join("") + "</select>" +
            '<label for="sh-date">Date</label><input type="date" id="sh-date" value="' + esc(v.date) + '">' +
            '<div class="grid-2"><div><label for="sh-start">Start</label><input type="time" id="sh-start" value="' + esc(v.start) + '"></div>' +
            '<div><label for="sh-end">Finish</label><input type="time" id="sh-end" value="' + esc(v.end) + '"></div></div>' +
            '<div class="grid-2"><div><label for="sh-break">Break (minutes)</label><input type="number" id="sh-break" min="0" max="600" step="5" value="' + esc(v.breakMins) + '"></div>' +
            '<div><label for="sh-note">Note <span class="muted small">(optional)</span></label><input type="text" id="sh-note" maxlength="120" value="' + esc(v.note || "") + '" placeholder="e.g. Front desk"></div></div>' +
            '<p class="muted small" id="sh-hours"></p>' +
            '<div class="form-error" id="sh-error" hidden></div>' +
            '<div class="modal-actions">' + (shift ? '<button type="button" class="btn btn-ghost danger-text" id="sh-delete">' + icon("trash") + "Delete</button>" : "") +
            '<button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">' + (shift ? "Save shift" : "Add shift") + "</button></div></form>"
        );
        const showHours = function () {
            $("#sh-hours", m.el).textContent = fmtHours(hoursBetween($("#sh-start", m.el).value, $("#sh-end", m.el).value, $("#sh-break", m.el).value)) + " paid time";
        };
        m.el.addEventListener("input", showHours);
        showHours();
        if (shift) $("#sh-delete", m.el).addEventListener("click", async function () {
            try { await api("/api/rotas/shifts/" + shift.id + "/delete", {}); closeModal(); toast("Shift deleted."); render(); } catch (err) { formError($("#sh-error", m.el), err.message); }
        });
        $("#sh-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await api(shift ? "/api/rotas/shifts/" + shift.id : "/api/rotas/shifts", {
                    personId: $("#sh-person", m.el).value, date: $("#sh-date", m.el).value, start: $("#sh-start", m.el).value,
                    end: $("#sh-end", m.el).value, breakMins: $("#sh-break", m.el).value, note: $("#sh-note", m.el).value,
                });
                closeModal();
                toast(shift ? "Shift updated." : "Shift added.");
                state.rotaWeek = mondayOf($("#sh-date", m.el).value);
                render();
            } catch (err) { formError($("#sh-error", m.el), err.message); }
        });
    }

    // ================= Payslips =================

    function payslipDocHtml(p) {
        const t = p.totals;
        const lines = function (list, emptyText) {
            return list.length ? list.map(function (l) {
                return '<div class="ps-line"><span>' + esc(l.label) + '</span><span class="ps-amt">' + fmtMoney(l.amount) + "</span></div>";
            }).join("") : '<div class="ps-line ps-none"><span>' + emptyText + "</span></div>";
        };
        const fact = function (label, value) { return '<div class="ps-fact"><span>' + label + "</span><strong>" + esc(value || "–") + "</strong></div>"; };
        const share = function (n) { return t.gross > 0 ? Math.max(0, Math.min(100, (n / t.gross) * 100)) : 0; };
        return '<article class="payslip">' +
            '<header class="ps-band">' +
            '<div class="ps-brand"><img src="/assets/brand/svg/hn-group-wordmark-white.svg" alt="HN Group"></div>' +
            '<div class="ps-title"><span class="ps-kicker">' + (p.additional ? "Additional payslip" : "Payslip") + "</span>" + '<span class="ps-period">' + esc(p.periodLabel) + "</span></div>" +
            "</header>" +
            '<div class="ps-stripe" aria-hidden="true"></div>' +

            '<section class="ps-intro">' +
            '<div class="ps-who"><div class="ps-name">' + esc(p.employeeName) + '</div><div class="ps-job">' + esc(p.jobTitle || "") + "</div>" +
            '<div class="ps-employer">' + icon("building") + "Paid by " + esc(p.employer) + "</div></div>" +
            '<div class="ps-netcard"><span class="ps-netlabel">Take-home pay</span><span class="ps-netvalue">' + fmtMoney(t.net) + "</span>" +
            '<span class="ps-netdate">Paid ' + esc(new Date(p.payDate + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" })) + "</span></div>" +
            "</section>" +

            '<section class="ps-facts">' +
            fact("Employee no.", p.employeeNumber) + fact("NI number", p.niNumber) + fact("Tax code", p.taxCode) + fact("NI category", p.niCategory) +
            fact("Pay period", new Date(p.periodStart + "T12:00:00").getDate() + "–" + new Date(p.periodEnd + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })) +
            fact("Tax month", String(p.ytd.taxMonth)) +
            "</section>" +

            '<section class="ps-flow" aria-label="How your pay adds up">' +
            '<div class="ps-flow-bar"><span class="pf-net" data-w="' + share(t.net) + '"></span><span class="pf-tax" data-w="' + share(t.tax + t.ni) + '"></span><span class="pf-other" data-w="' + share(t.deductions - t.tax - t.ni) + '"></span></div>' +
            '<div class="ps-flow-key"><span class="k-net">Take-home ' + fmtMoney(t.net) + '</span><span class="k-tax">Tax &amp; NI ' + fmtMoney(t.tax + t.ni) + "</span>" +
            (t.deductions - t.tax - t.ni ? '<span class="k-other">Pension &amp; other ' + fmtMoney(t.deductions - t.tax - t.ni) + "</span>" : "") + "</div>" +
            "</section>" +

            '<section class="ps-columns">' +
            '<div class="ps-col"><h4>' + icon("plus") + "Payments</h4>" + lines(p.payments, "No payments") +
            '<div class="ps-line ps-total"><span>Total pay</span><span class="ps-amt">' + fmtMoney(t.gross) + "</span></div></div>" +
            '<div class="ps-col"><h4>' + icon("x") + "Deductions</h4>" + lines(p.deductions, "No deductions") +
            '<div class="ps-line ps-total"><span>Total deductions</span><span class="ps-amt">' + fmtMoney(t.deductions) + "</span></div></div>" +
            "</section>" +

            ((p.reimbursements || []).length ? '<section class="ps-reimb"><div class="ps-col"><h4>' + icon("pound") + "Expenses repaid <small>tax free, added to your take-home pay</small></h4>" + lines(p.reimbursements, "") +
                '<div class="ps-line ps-total"><span>Total expenses repaid</span><span class="ps-amt">' + fmtMoney(t.reimbursed) + "</span></div></div></section>" : "") +
            '<section class="ps-sum"><span>' + fmtMoney(t.gross) + '<small>Total pay</small></span><b>−</b><span>' + fmtMoney(t.deductions) + "<small>Deductions</small></span>" +
            (t.reimbursed ? "<b>+</b><span>" + fmtMoney(t.reimbursed) + "<small>Expenses</small></span>" : "") + "<b>=</b>" +
            '<span class="ps-sum-net">' + fmtMoney(t.net) + "<small>Take-home pay</small></span></section>" +

            '<section class="ps-ytd"><h4>This tax year so far <small>since ' + esc(fmtDate(p.ytd.from + "T12:00:00")) + "</small></h4>" +
            '<div class="ps-ytd-grid">' +
            "<div><span>Total pay</span><strong>" + fmtMoney(p.ytd.gross) + "</strong></div>" +
            "<div><span>Income tax</span><strong>" + fmtMoney(p.ytd.tax) + "</strong></div>" +
            "<div><span>National Insurance</span><strong>" + fmtMoney(p.ytd.ni) + "</strong></div>" +
            "<div><span>Pension</span><strong>" + fmtMoney(p.ytd.pension) + "</strong></div>" +
            '<div class="ps-ytd-net"><span>Take-home pay</span><strong>' + fmtMoney(p.ytd.net) + "</strong></div>" +
            "</div></section>" +

            '<section class="ps-employer-ded"><div class="ps-col"><h4>' + icon("building") + "Employer deductions <small>paid by " + esc(p.employer) + " on top of your pay \u2013 not taken from it</small></h4>" +
            lines(p.employerItems, "None") +
            '<div class="ps-line ps-total"><span>Total employer deductions</span><span class="ps-amt">' + fmtMoney(t.employer) + "</span></div>" +
            '<div class="ps-line ps-cost"><span>Total cost of your pay to ' + esc(p.employer) + '</span><span class="ps-amt">' + fmtMoney(t.cost) + "</span></div></div></section>" +
            (p.note ? '<section class="ps-note">' + icon("message") + "<div>" + richText(p.note) + "</div></section>" : "") +
            '<footer class="ps-foot"><span>' + esc(p.employer) + "</span><span>Private and confidential</span><span>Ref " + esc(p.id.slice(0, 8).toUpperCase()) + "</span></footer>" +
            "</article>";
    }

    function paintPayslip(root) {
        $$(".ps-flow-bar [data-w]", root).forEach(function (s) { s.style.width = s.dataset.w + "%"; });
    }

    async function openPayslip(id, opts) {
        opts = opts || {};
        let p;
        try { p = (await api("/api/payslips/" + id)).payslip; } catch (err) { return toast(err.message); }
        const m = openModal(
            (p.status === "draft" ? '<div class="banner banner-warn pd-draft"><div><strong>Draft.</strong> The employee can’t see this payslip until it’s issued.</div></div>' : "") +
            '<div class="print-area">' + payslipDocHtml(p) + "</div>" +
            '<div class="modal-actions no-print">' + (opts.footer || "") + '<button type="button" class="btn btn-ghost" id="ps-print">' + icon("printer") + "Print or save as PDF</button>" +
            '<button type="button" class="btn btn-primary" data-close>Done</button></div>',
            { wide: true, cls: "modal-payslip" }
        );
        paintPayslip(m.el);
        $("#ps-print", m.el).addEventListener("click", function () {
            document.body.classList.add("printing");
            window.print();
            setTimeout(function () { document.body.classList.remove("printing"); }, 500);
        });
        return m;
    }

    async function viewPayslips(root, current) {
        const d = await api("/api/payslips");
        if (!current()) return;
        const latest = d.payslips[0];
        const yearTotal = d.payslips.filter(function (s) { return latest && s.payDate.slice(0, 4) === latest.payDate.slice(0, 4); }).reduce(function (n, s) { return n + s.net; }, 0);
        root.innerHTML =
            '<div class="page-head"><div><h1>Payslips</h1><p class="muted">Your payslips from HN Group Limited. Only you and Human Resources can see them.</p></div>' +
            '<div class="page-actions">' + (d.payslips.length ? '<button type="button" class="btn btn-ghost" id="ps-p60">' + icon("file") + "End of year (P60)</button>" : "") +
            (d.canRunPayroll ? '<a class="btn btn-ghost" href="/funds" data-link>' + icon("pound") + "Company funds</a>" +
                '<a class="btn btn-primary" href="/payroll" data-link>' + icon("wallet") + "Run payroll</a>" : "") + "</div></div>" +
            (latest ? '<section class="payslip-hero"><div><p class="eyebrow">Latest payslip · ' + esc(latest.periodLabel) + '</p><div class="ph-net">' + fmtMoney(latest.net) +
                '</div><p class="muted">Take-home pay, paid ' + esc(fmtDate(latest.payDate + "T12:00:00")) + " · " + fmtMoney(latest.gross) + " before deductions</p></div>" +
                '<div class="ph-side"><div class="ph-stat"><span>' + fmtMoney(yearTotal) + "</span><small>Take-home in " + esc(latest.payDate.slice(0, 4)) + "</small></div>" +
                '<button type="button" class="btn btn-light" data-slip="' + latest.id + '">' + icon("eye") + "Open payslip</button></div></section>" : "") +
            (d.payslips.length ? '<div class="slip-list">' + d.payslips.map(function (s) {
                return '<button type="button" class="slip-row" data-slip="' + s.id + '"><span class="slip-icon">' + icon("card") + "</span>" +
                    '<span class="slip-main"><strong>' + esc(s.periodLabel) + (s.additional ? ' <span class="badge badge-soft">Additional</span>' : "") + '</strong><span class="muted small">Paid ' + esc(fmtDate(s.payDate + "T12:00:00")) + " · " + esc(s.employer) + "</span></span>" +
                    '<span class="slip-gross"><small>Total pay</small>' + fmtMoney(s.gross) + '</span><span class="slip-net"><small>Take-home</small>' + fmtMoney(s.net) + "</span>" +
                    icon("chevronRight", "slip-chev") + "</button>";
            }).join("") + "</div>"
                : '<div class="empty-page">' + icon("card", "big") + "<h2>No payslips yet</h2><p class=\"muted\">Your payslips will appear here once Human Resources issues them.</p></div>");
        root.addEventListener("click", function (e) {
            if (e.target.closest("#ps-p60")) return openMyP60();
            const s = e.target.closest("[data-slip]");
            if (s) openPayslip(s.dataset.slip);
        });
    }

    // ================= Company funds (Human Resources) =================

    function fundsWarningHtml(f) {
        if (!f.warning) return "";
        return '<div class="banner funds-warning ' + (f.warning.level === "danger" ? "is-danger" : "is-warn") + '">' + icon("alert") +
            "<div><strong>" + (f.overdrawn ? "Next payroll cannot be met." : f.warning.level === "danger" ? "Not enough money for the next payroll." : "Payroll fund is short.") + "</strong> " + esc(f.warning.message) +
            (f.overdrawn && window.location.pathname === "/payroll" ? " Running payroll is locked until then." : "") + "</div>" +
            (window.location.pathname === "/funds" ? "" : '<a class="btn btn-small ' + (f.warning.level === "danger" ? "btn-danger" : "btn-ghost") + '" href="/funds" data-link>Add funds</a>') + "</div>";
    }

    function fundCardsHtml(f, actions) {
        return '<div class="fund-cards">' +
            '<section class="fund-card fund-main' + (f.balances.main < 0 ? " overdrawn" : "") + '"><div class="fc-head"><span class="fc-icon">' + icon("pound") + '</span><span>Main balance</span></div>' +
            '<div class="fc-value">' + fmtMoney(f.balances.main) + "</div>" +
            '<p class="fc-sub">Money the company holds. Add PayPal and bank payments here.</p>' +
            (actions ? '<div class="btn-row"><button type="button" class="btn btn-primary btn-small" data-fund="add">' + icon("plus") + "Add funds</button>" +
                '<button type="button" class="btn btn-ghost btn-small" data-fund="remove">Remove funds</button></div>' : "") + "</section>" +
            '<div class="fund-arrow" aria-hidden="true">' + icon("chevronRight") + "</div>" +
            '<section class="fund-card fund-payroll' + (f.balances.payroll < 0 ? " overdrawn" : "") + '"><div class="fc-head"><span class="fc-icon">' + icon("wallet") + '</span><span>Payroll fund</span></div>' +
            '<div class="fc-value">' + fmtMoney(f.balances.payroll) + "</div>" +
            '<p class="fc-sub">Pays wages first; anything it can\u2019t cover is taken from the main balance. Money moves between it and the main balance only. Next payroll needs about <strong>' + fmtMoney(f.nextPayroll) + "</strong>.</p>" +
            (actions ? '<div class="btn-row"><button type="button" class="btn btn-primary btn-small" data-fund="transfer">' + icon("refresh") + "Move from main balance</button>" +
                '<button type="button" class="btn btn-ghost btn-small" data-fund="return"' + (f.balances.payroll > 0 ? "" : " disabled") + ">" + icon("chevronLeft") + "Move to main balance</button></div>" : "") + "</section>" +
            "</div>";
    }

    const FUND_TYPES = {
        deposit: ["Money in", "in"], withdrawal: ["Removed", "out"], "transfer-out": ["To payroll fund", "out"],
        "transfer-in": ["From main balance", "in"], payroll: ["Payroll", "out"], "payroll-refund": ["Payroll refund", "in"],
        "payroll-shortfall": ["Payroll (the payroll fund ran out)", "out"],
        "payroll-to-main": ["To main balance", "out"], "main-from-payroll": ["From payroll fund", "in"],
        expense: ["Expenses repaid", "out"],
        bill: ["Bill paid", "out"],
    };

    async function viewFunds(root, current) {
        const d = await api("/api/funds");
        if (!current()) return;
        let account = state.fundsAccount || "";
        root.innerHTML =
            '<div class="page-head"><div><h1>Company funds</h1><p class="muted">The main balance and the payroll fund for HN Group Limited. Only Human Resources can see this page.</p></div>' +
            '<div class="page-actions"><a class="btn btn-ghost" href="/payroll" data-link>' + icon("wallet") + "Run payroll</a>" +
            '<button type="button" class="btn btn-primary" id="fd-statement">' + icon("file") + "Statement</button></div></div>" +
            fundsWarningHtml(d) + fundCardsHtml(d, true) +
            '<div id="fd-insights"></div><div id="fd-forecast"></div>' +
            '<section class="panel"><div class="panel-head"><h2 class="panel-title">' + icon("list") + "History</h2>" +
            '<div class="company-tabs small-tabs" id="fd-tabs"><button type="button" data-acc="">Everything</button><button type="button" data-acc="main">Main balance</button><button type="button" data-acc="payroll">Payroll fund</button></div></div>' +
            '<div id="fd-history"></div></section>';

        function draw() {
            $$("#fd-tabs [data-acc]").forEach(function (b) { b.classList.toggle("active", b.dataset.acc === account); });
            const list = d.transactions.filter(function (t) { return !account || t.account === account; });
            $("#fd-history").innerHTML = list.length ? '<div class="table-card flat"><table class="table"><thead><tr><th>When</th><th>What</th><th>Account</th><th class="num">Amount</th><th class="num">Balance after</th></tr></thead><tbody>' +
                list.map(function (t) {
                    const type = FUND_TYPES[t.type] || [t.type, t.amount >= 0 ? "in" : "out"];
                    return "<tr><td class=\"nowrap small\">" + esc(fmtDateTime(t.at)) + "</td>" +
                        '<td data-label="What"><div class="emp-name">' + esc(t.description || type[0]) + "</div>" +
                        '<div class="muted small">' + esc(type[0]) + (t.sourceLabel && t.type === "deposit" ? " · " + esc(t.sourceLabel) : "") + (t.category && t.amount < 0 ? " · " + esc(t.category) : "") + (t.reference ? " · ref " + esc(t.reference) : "") + " · " + esc(t.byName) + "</div></td>" +
                        '<td data-label="Account"><span class="badge' + (t.account === "payroll" ? " badge-soft" : "") + '">' + (t.account === "payroll" ? "Payroll fund" : "Main balance") + "</span></td>" +
                        '<td data-label="Amount" class="num fund-' + (t.amount >= 0 ? "in" : "out") + '">' + (t.amount >= 0 ? "+" : "") + fmtMoney(t.amount) + "</td>" +
                        '<td data-label="Balance after" class="num' + (t.balanceAfter < 0 ? " danger-text" : "") + '">' + fmtMoney(t.balanceAfter) + "</td></tr>";
                }).join("") + "</tbody></table></div>"
                : '<p class="muted small">Nothing yet. Use <strong>Add funds</strong> when money reaches the company PayPal.</p>';
        }
        root.addEventListener("click", function (e) {
            const a = e.target.closest("[data-acc]");
            if (a) { account = state.fundsAccount = a.dataset.acc; return draw(); }
            if (e.target.closest("#fd-statement")) return openStatement();
            if (e.target.closest("#fd-budgets") && insights) return openBudgets(insights);
            const f = e.target.closest("[data-fund]");
            if (f) openFundsForm(f.dataset.fund, d);
        });
        let insights = null;
        api("/api/funds/insights").then(function (x) {
            insights = x;
            state.fundsCategories = x.categories;
            const box = $("#fd-insights");
            if (!box) return;
            box.innerHTML = fundsInsightsHtml(x);
            $$(".br-bar [data-w]", box).forEach(function (s) { s.style.width = s.dataset.w + "%"; });
        }).catch(function () {});
        api("/api/funds/forecast").then(function (f) {
            const box = $("#fd-forecast");
            if (box) box.innerHTML = forecastHtml(f);
        }).catch(function () {});
        draw();
    }

    function openFundsForm(kind, d) {
        const titles = { add: "Add funds", remove: "Remove funds", transfer: "Move money to the payroll fund", return: "Move money back to the main balance" };
        const m = openModal(
            '<h2 class="modal-title">' + titles[kind] + "</h2>" +
            '<p class="muted">' + (kind === "add" ? "Record money that has reached the company, such as a PayPal payment." :
                kind === "remove" ? "Take money out of the main balance. Main balance: <strong>" + fmtMoney(d.balances.main) + "</strong>." :
                kind === "return" ? "Move money the payroll fund doesn\u2019t need back to the main balance. Payroll fund: <strong>" + fmtMoney(d.balances.payroll) + "</strong>." :
                "The payroll fund can only be topped up from the main balance. Main balance: <strong>" + fmtMoney(d.balances.main) + "</strong>.") + "</p>" +
            '<form id="fd-form" novalidate>' +
            '<label for="fd-amount">Amount</label><div class="money-input"><span>£</span><input type="text" id="fd-amount" inputmode="decimal" placeholder="0.00" autocomplete="off"></div>' +
            (kind === "return" && d.balances.payroll > 0 ? '<div class="fd-quick"><span class="muted small">Quick amounts:</span>' +
                '<button type="button" class="chip" data-quick="' + d.balances.payroll.toFixed(2) + '">Everything (' + fmtMoney(d.balances.payroll) + ")</button>" +
                (d.balances.payroll > d.nextPayroll ? '<button type="button" class="chip" data-quick="' + (d.balances.payroll - d.nextPayroll).toFixed(2) + '">Keep enough for next payroll (' + fmtMoney(d.balances.payroll - d.nextPayroll) + ")</button>" : "") + "</div>" : "") +
            (kind === "transfer" && d.nextPayroll > 0 ? '<div class="fd-quick"><span class="muted small">Quick amounts:</span>' +
                '<button type="button" class="chip" data-quick="' + d.nextPayroll.toFixed(2) + '">Next payroll (' + fmtMoney(d.nextPayroll) + ")</button>" +
                (d.balances.payroll < 0 ? '<button type="button" class="chip" data-quick="' + (d.nextPayroll - d.balances.payroll).toFixed(2) + '">Cover the overdraft and next payroll (' + fmtMoney(d.nextPayroll - d.balances.payroll) + ")</button>" : "") + "</div>" : "") +
            (kind === "add" ? '<div class="grid-2"><div><label for="fd-source">Where from</label><select id="fd-source">' + Object.keys(d.sources).map(function (k) {
                return '<option value="' + k + '">' + esc(d.sources[k]) + "</option>";
            }).join("") + '</select></div><div><label for="fd-ref">Reference <span class="muted small">(optional)</span></label><input type="text" id="fd-ref" maxlength="80" placeholder="e.g. PayPal transaction ID"></div></div>' : "") +
            (kind === "remove" ? '<label for="fd-cat">Category</label><select id="fd-cat">' + (state.fundsCategories || ["Other"]).filter(function (c) { return c !== "Payroll"; }).map(function (c) {
                return "<option" + (c === "Other" ? " selected" : "") + ">" + esc(c) + "</option>";
            }).join("") + "</select>" : "") +
            '<label for="fd-note">' + (kind === "remove" ? "Reason" : 'Note <span class="muted small">(optional)</span>') + '</label><input type="text" id="fd-note" maxlength="200">' +
            '<div class="form-error" id="fd-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn ' + (kind === "remove" ? "btn-danger" : "btn-primary") + '">' + ({ add: "Add funds", remove: "Remove funds", transfer: "Move money", return: "Move money" })[kind] + "</button></div></form>"
        );
        $("#fd-amount", m.el).focus();
        m.el.addEventListener("click", function (e) {
            const q = e.target.closest("[data-quick]");
            if (q) $("#fd-amount", m.el).value = q.dataset.quick;
        });
        $("#fd-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                const r = await api("/api/funds/" + kind, {
                    amount: $("#fd-amount", m.el).value.replace(/[£,\s]/g, ""),
                    source: $("#fd-source", m.el) ? $("#fd-source", m.el).value : "",
                    reference: $("#fd-ref", m.el) ? $("#fd-ref", m.el).value : "",
                    note: $("#fd-note", m.el).value,
                    category: $("#fd-cat", m.el) ? $("#fd-cat", m.el).value : "",
                });
                state.me = r.user;
                renderChrome();
                closeModal();
                toast({ add: "Funds added.", remove: "Funds removed.", transfer: "Moved to the payroll fund.", return: "Moved back to the main balance." }[kind]);
                render();
            } catch (err) { formError($("#fd-error", m.el), err.message); }
        });
    }

    // ================= Statements =================

    function statementDocHtml(st) {
        const left = st.isCurrent || st.isFuture ? st.current.total : st.closing;
        const leftLabel = st.isCurrent || st.isFuture ? "Left now" : "Left at month end";
        const fmtDay = function (d) { return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); };
        const share = function (n) { return st.spent > 0 ? Math.max(0, Math.min(100, (n / st.spent) * 100)) : 0; };
        const acc = function (key, name) {
            const a = st.accounts[key];
            const now = st.isCurrent || st.isFuture ? st.current[key] : a.closing;
            return "<tr><td><strong>" + name + '</strong></td><td class="num">' + fmtMoney(a.opening) + '</td><td class="num st-in">+' + fmtMoney(a.in) + "</td>" +
                '<td class="num">−' + fmtMoney(a.out) + '</td><td class="num' + (now < 0 ? " st-neg" : "") + '"><strong>' + fmtMoney(now) + "</strong></td></tr>";
        };
        return '<article class="statement">' +
            '<header class="ps-band"><div class="ps-brand"><img src="/assets/brand/svg/hn-group-wordmark-white.svg" alt="HN Group"></div>' +
            '<div class="ps-title"><span class="ps-kicker">Statement</span><span class="ps-period">' + esc(st.periodLabel) + "</span></div></header>" +
            '<div class="ps-stripe" aria-hidden="true"></div>' +
            '<section class="st-intro"><div><div class="ps-name">' + esc(st.employer) + '</div><div class="ps-job">Company funds · ' + esc(fmtDay(st.start)) + " to " + esc(fmtDay(st.end)) + "</div></div>" +
            '<div class="st-generated">Produced ' + esc(fmtDateTime(st.generatedAt)) + "<br>by " + esc(st.generatedBy) + "</div></section>" +

            '<section class="st-cards">' +
            '<div class="st-card"><span>Opening balance</span><strong>' + fmtMoney(st.opening) + "</strong><small>" + esc(fmtDay(st.start)) + "</small></div>" +
            '<div class="st-card"><span>Money in</span><strong class="st-in">+' + fmtMoney(st.moneyIn) + "</strong><small>PayPal, bank and manual</small></div>" +
            '<div class="st-card"><span>Spent</span><strong>−' + fmtMoney(st.spent) + "</strong><small>Payroll and removals</small></div>" +
            '<div class="st-card"><span>' + leftLabel + "</span><strong" + (left < 0 ? ' class="st-neg"' : "") + ">" + fmtMoney(left) + "</strong><small>Main balance and payroll fund</small></div>" +
            '<div class="st-card st-estimate' + (st.estimatedEnd < 0 ? " is-negative" : "") + '"><span>' + (st.isCurrent || st.isFuture ? "Estimated by month end" : "Closing balance") + "</span><strong>" + fmtMoney(st.estimatedEnd) + "</strong><small>" + (st.estimatedEnd < 0 ? "Overdrawn" : esc(fmtDay(st.end))) + "</small></div>" +
            "</section>" +

            (st.isCurrent || st.isFuture ? '<section class="st-box st-estimate-box">' + icon("clock") + "<div><strong>How the estimate is worked out.</strong> " +
                fmtMoney(st.current.total) + " left now" + (st.earlierPayroll ? ", less about " + fmtMoney(st.earlierPayroll) + " for payroll in the months before" : "") + (st.remainingPayroll.people ? ", less about " + fmtMoney(st.remainingPayroll.cost) + " for the payroll still to run this month (" + st.remainingPayroll.people + (st.remainingPayroll.people === 1 ? " person" : " people") + ", including employer NI and pension)"
                    : ". Everyone has already been paid this month") + ", gives <strong>" + fmtMoney(st.estimatedEnd) + "</strong>." +
                (st.estimatedEnd < 0 ? " <strong>The company would be overdrawn by the end of the month.</strong>" : "") + " Money still to come in isn’t included.</div></section>" : "") +

            (st.nextMonth ? '<section class="st-section st-next"><h4>Next month estimate \u00b7 ' + esc(st.nextMonth.periodLabel) + "</h4>" +
                '<div class="st-flow">' +
                '<div class="st-flow-step"><span>Starts with</span><strong' + (st.nextMonth.start < 0 ? ' class="st-neg"' : "") + ">" + fmtMoney(st.nextMonth.start) + "</strong><small>Estimated end of " + esc(st.periodLabel) + "</small></div>" +
                '<b class="st-op">\u2212</b>' +
                '<div class="st-flow-step"><span>Payroll</span><strong>' + fmtMoney(st.nextMonth.payroll.cost) + "</strong><small>" + (st.nextMonth.payroll.people ? st.nextMonth.payroll.people + (st.nextMonth.payroll.people === 1 ? " person" : " people") + ", with employer NI and pension" : "Payslips already made and paid for") + "</small></div>" +
                '<b class="st-op">=</b>' +
                '<div class="st-flow-step st-flow-result' + (st.nextMonth.estimatedEnd < 0 ? " is-negative" : "") + '"><span>Estimated end of month</span><strong>' + fmtMoney(st.nextMonth.estimatedEnd) + "</strong><small>" + (st.nextMonth.estimatedEnd < 0 ? "Overdrawn" : "If no money comes in") + "</small></div>" +
                "</div>" +
                (st.nextMonth.averageIn > 0 ? '<p class="st-small">If money comes in like the last three months (about ' + fmtMoney(st.nextMonth.averageIn) + " a month), " + esc(st.nextMonth.periodLabel) + " would end at about <strong" + (st.nextMonth.estimatedEndWithIncome < 0 ? ' class="st-neg"' : "") + ">" + fmtMoney(st.nextMonth.estimatedEndWithIncome) + "</strong>.</p>"
                    : '<p class="st-small">No money came in over the last three months, so none is assumed.</p>') +
                "</section>" : "") +
            '<section class="st-section"><h4>Where the money went</h4>' +
            (st.spent > 0 ? '<div class="st-bar"><span class="sb-payroll" data-w="' + share(st.spentBy.payroll) + '"></span><span class="sb-removed" data-w="' + share(st.spentBy.removed) + '"></span><span class="sb-expenses" data-w="' + share(st.spentBy.expenses || 0) + '"></span><span class="sb-bills" data-w="' + share(st.spentBy.bills || 0) + '"></span></div>' : "") +
            '<div class="st-rows">' +
            '<div class="ps-line"><span><i class="st-dot sb-payroll"></i>Payroll (pay, employer NI and pension)</span><span class="ps-amt">' + fmtMoney(st.spentBy.payroll) + "</span></div>" +
            '<div class="ps-line"><span><i class="st-dot sb-removed"></i>Funds removed</span><span class="ps-amt">' + fmtMoney(st.spentBy.removed) + "</span></div>" +
            (st.spentBy.expenses ? '<div class="ps-line"><span><i class="st-dot sb-expenses"></i>Expenses repaid</span><span class="ps-amt">' + fmtMoney(st.spentBy.expenses) + "</span></div>" : "") +
            (st.spentBy.bills ? '<div class="ps-line"><span><i class="st-dot sb-bills"></i>Bills paid</span><span class="ps-amt">' + fmtMoney(st.spentBy.bills) + "</span></div>" : "") +
            '<div class="ps-line ps-total"><span>Total spent</span><span class="ps-amt">' + fmtMoney(st.spent) + "</span></div></div>" +
            ((st.byCategory || []).length ? '<h4 class="st-subhead">By category</h4><div class="st-rows">' + st.byCategory.map(function (c) {
                return '<div class="ps-line"><span>' + esc(c.category) + '</span><span class="ps-amt">' + fmtMoney(c.amount) + "</span></div>";
            }).join("") + "</div>" : "") + "</section>" +

            '<section class="st-section"><h4>Accounts</h4><table class="st-table"><thead><tr><th>Account</th><th class="num">Opening</th><th class="num">In</th><th class="num">Out</th><th class="num">' + (st.isCurrent || st.isFuture ? "Now" : "Closing") + "</th></tr></thead><tbody>" +
            acc("main", "Main balance") + acc("payroll", "Payroll fund") + "</tbody></table>" +
            '<p class="st-small">Money moved between the main balance and the payroll fund shows in both accounts but isn’t counted as money in or spent.</p></section>' +

            '<section class="st-section"><h4>Transactions <small>' + st.transactions.length + "</small></h4>" +
            (st.transactions.length ? '<table class="st-table st-tx"><thead><tr><th>Date</th><th>Details</th><th>Account</th><th class="num">Amount</th><th class="num">Balance</th></tr></thead><tbody>' +
                st.transactions.map(function (t) {
                    return "<tr" + (t.internal ? ' class="st-internal"' : "") + "><td class=\"nowrap\">" + esc(new Date(t.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })) + "</td>" +
                        "<td>" + esc(t.description) + (t.reference ? ' <span class="st-ref">ref ' + esc(t.reference) + "</span>" : "") + '<div class="st-by">' + esc(t.byName) + (t.sourceLabel && t.type === "deposit" ? " · " + esc(t.sourceLabel) : "") + "</div></td>" +
                        '<td class="nowrap">' + (t.account === "payroll" ? "Payroll fund" : "Main balance") + "</td>" +
                        '<td class="num' + (t.amount >= 0 ? " st-in" : "") + '">' + (t.amount >= 0 ? "+" : "") + fmtMoney(t.amount) + "</td>" +
                        '<td class="num' + (t.balanceAfter < 0 ? " st-neg" : "") + '">' + fmtMoney(t.balanceAfter) + "</td></tr>";
                }).join("") + "</tbody></table>" : '<p class="st-small">No money moved this month.</p>') + "</section>" +
            '<footer class="ps-foot"><span>' + esc(st.employer) + "</span><span>Private and confidential</span><span>Statement for " + esc(st.periodLabel) + "</span></footer>" +
            "</article>";
    }

    function openStatement() {
        let period = isoDay(new Date()).slice(0, 7);
        const m = openModal(
            '<div class="st-toolbar no-print"><h2 class="modal-title">Statement</h2>' +
            '<div class="week-nav"><button type="button" class="icon-btn" data-step="-1" aria-label="Previous month">' + icon("chevronLeft") + "</button>" +
            '<input type="month" id="st-month" aria-label="Statement month">' +
            '<button type="button" class="icon-btn" data-step="1" aria-label="Next month">' + icon("chevronRight") + "</button></div></div>" +
            '<div class="print-area" id="st-doc"><p class="muted">Loading…</p></div>' +
            '<div class="modal-actions no-print"><button type="button" class="btn btn-ghost" data-close>Close</button>' +
            '<button type="button" class="btn btn-primary" id="st-print">' + icon("download") + "Download PDF</button></div>",
            { wide: true, cls: "modal-payslip modal-statement" }
        );
        async function load() {
            $("#st-month", m.el).value = period;
            try {
                const st = (await api("/api/funds/statement?period=" + period)).statement;
                $("#st-doc", m.el).innerHTML = statementDocHtml(st);
                $$(".st-bar [data-w]", m.el).forEach(function (s) { s.style.width = s.dataset.w + "%"; });
            } catch (err) { $("#st-doc", m.el).innerHTML = '<p class="form-error">' + esc(err.message) + "</p>"; }
        }
        m.el.addEventListener("click", function (e) {
            const step = e.target.closest("[data-step]");
            if (step) { period = shiftMonth(period, Number(step.dataset.step)); load(); }
        });
        $("#st-month", m.el).addEventListener("change", function (e) { if (e.target.value) { period = e.target.value; load(); } });
        $("#st-print", m.el).addEventListener("click", function () {
            // The browser's print dialog saves it as a PDF ("Save as PDF" / "Microsoft Print to PDF").
            const title = document.title;
            document.title = "HN Group statement " + period;
            document.body.classList.add("printing");
            window.print();
            setTimeout(function () { document.body.classList.remove("printing"); document.title = title; }, 500);
        });
        load();
    }

    // ================= Payroll (Human Resources) =================

    function shiftMonth(period, n) {
        const [y, m] = period.split("-").map(Number);
        const d = new Date(y, m - 1 + n, 1);
        return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    }

    function lastWorkingDay(period) {
        const [y, m] = period.split("-").map(Number);
        const d = new Date(y, m, 0, 12);
        while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
        return isoDay(d);
    }

    function payLabel(p) {
        return p.payType === "hourly" ? fmtMoney(p.hourlyRate) + " an hour" : fmtMoney(p.monthlySalary) + " a month";
    }

    async function viewPayroll(root, current) {
        const period = state.payPeriod || isoDay(new Date()).slice(0, 7);
        const d = await api("/api/payroll?period=" + period);
        if (!current()) return;
        const drafts = d.payslips.filter(function (s) { return s.status === "draft"; });
        const issued = d.payslips.filter(function (s) { return s.status === "issued"; });
        const sumOf = function (list, k) { return list.reduce(function (n, s) { return n + s[k]; }, 0); };
        const withSlip = {};
        d.payslips.forEach(function (s) { withSlip[s.personId] = true; });
        const overdrawn = d.funds.overdrawn;

        root.innerHTML =
            '<div class="page-head"><div><h1>Run payroll</h1><p class="muted">Payslips are paid by ' + esc(d.employer) + ". Tax and National Insurance are worked out automatically. Only Human Resources can see this page.</p></div>" +
            '<div class="page-actions"><button type="button" class="btn btn-ghost" id="pr-bands">' + icon("list") + "Salary bands</button>" +
            '<button type="button" class="btn btn-ghost" id="pr-yearend">' + icon("chart") + "Year end</button>" +
            '<button type="button" class="btn btn-ghost" id="pr-single"' + (overdrawn ? " disabled" : "") + ">" + icon("plus") + "Single payslip</button>" +
            '<button type="button" class="btn btn-primary" id="pr-run"' + (overdrawn ? ' disabled title="The payroll fund is overdrawn"' : "") + ">" + icon(overdrawn ? "lock" : "wallet") + "Run payroll</button></div></div>" +
            fundsWarningHtml(d.funds) +
            '<div class="payroll-funds"><div><span class="pf-label">Payroll fund</span><strong class="' + (d.funds.balances.payroll < 0 ? "danger-text" : "") + '">' + fmtMoney(d.funds.balances.payroll) + "</strong></div>" +
            '<div><span class="pf-label">Next payroll needs about</span><strong>' + fmtMoney(d.funds.nextPayroll) + "</strong></div>" +
            '<div><span class="pf-label">Main balance</span><strong class="' + (d.funds.balances.main < 0 ? "danger-text" : "") + '">' + fmtMoney(d.funds.balances.main) + "</strong></div>" +
            '<a class="btn btn-ghost btn-small" href="/funds" data-link>' + icon("pound") + "Company funds</a></div>" +
            '<div class="week-nav"><button type="button" class="icon-btn" data-period="' + shiftMonth(period, -1) + '" aria-label="Previous month">' + icon("chevronLeft") + "</button>" +
            '<input type="month" id="pr-month" value="' + period + '" aria-label="Pay month">' +
            '<button type="button" class="icon-btn" data-period="' + shiftMonth(period, 1) + '" aria-label="Next month">' + icon("chevronRight") + "</button>" +
            '<h2 class="week-title">' + esc(d.periodLabel) + "</h2></div>" +
            '<div class="stat-row">' +
            '<div class="stat"><div class="stat-value">' + issued.length + " / " + d.payslips.length + '</div><div class="stat-label">Issued</div></div>' +
            '<div class="stat"><div class="stat-value">' + fmtMoney(sumOf(d.payslips, "gross")) + '</div><div class="stat-label">Total pay</div></div>' +
            '<div class="stat"><div class="stat-value">' + fmtMoney(sumOf(d.payslips, "net")) + '</div><div class="stat-label">Take-home pay</div></div>' +
            '<div class="stat"><div class="stat-value">' + fmtMoney(sumOf(d.payslips, "cost")) + '</div><div class="stat-label">Cost to the company</div></div>' +
            "</div>" +
            '<section class="panel"><div class="panel-head"><h2 class="panel-title">' + icon("card") + "Payslips for " + esc(d.periodLabel) + "</h2>" +
            '<div class="btn-row">' + (d.requireApproval && drafts.some(function (x) { return !x.approvedBy && x.createdBy !== d.meId && x.updatedBy !== d.meId; }) ? '<button type="button" class="btn btn-ghost btn-small" id="pr-approve-all">' + icon("check") + "Approve all</button>" : "") +
            (drafts.length ? '<button type="button" class="btn btn-primary btn-small" id="pr-issue-all">' + icon("tick") + "Issue all " + (d.requireApproval ? "approved" : drafts.length) + " drafts</button>" : "") + "</div></div>" +
            '<label class="inline-check pr-approval"><input type="checkbox" id="pr-require"' + (d.requireApproval ? " checked" : "") + "> Payslips need approving by a second person (not the person who made or changed them) before they can be issued</label>" +
            (d.requireApproval && d.payrollPeople < 2 ? '<div class="banner banner-warn">' + icon("alert") + "<div><strong>Only one person can run payroll.</strong> Give someone else <em>Run payroll &amp; finance</em> so they can approve payslips, or turn approval off.</div></div>" : "") +
            (d.payslips.length ? '<div class="table-card flat"><table class="table"><thead><tr><th>Employee</th><th>Status</th><th class="num">Total pay</th><th class="num">Take-home</th><th class="num">Cost</th><th class="col-actions"></th></tr></thead><tbody>' +
                d.payslips.map(function (s) {
                    return '<tr data-slip="' + s.id + '"><td><div class="emp-cell">' + avatar(s.person, "sm") + '<div><div class="emp-name">' + esc(s.person.displayName) + (s.additional ? ' <span class="badge badge-soft">Additional</span>' : "") + '</div><div class="muted small">' + esc(s.person.jobTitle || "") + "</div></div></div></td>" +
                        '<td data-label="Status">' + statusBadge(s.status) + (s.status === "draft" && d.requireApproval ? (s.approvedBy ? '<div class="small pr-ok">' + icon("check") + "Approved by " + esc(s.approvedBy) + "</div>" : '<div class="small muted">Needs approval</div>') : "") +
                        '</td><td data-label="Total pay" class="num">' + fmtMoney(s.gross) + '</td><td data-label="Take-home" class="num"><strong>' + fmtMoney(s.net) + "</strong></td>" +
                        '<td data-label="Cost" class="num muted">' + fmtMoney(s.cost) + "</td>" +
                        '<td class="col-actions nowrap"><button type="button" class="btn btn-ghost btn-small" data-pa="view" aria-label="View">' + icon("eye") + "</button>" +
                        (s.status === "draft" ? '<button type="button" class="btn btn-ghost btn-small" data-pa="edit">' + icon("edit") + "Edit</button>" +
                            (d.requireApproval && !s.approvedBy ? (s.createdBy !== d.meId && s.updatedBy !== d.meId ? '<button type="button" class="btn btn-primary btn-small" data-pa="approve">Approve</button>' : '<span class="muted small pr-wait">Waiting for someone else to approve</span>')
                                : (d.requireApproval ? '<button type="button" class="btn btn-ghost btn-small" data-pa="unapprove">Unapprove</button>' : "") + '<button type="button" class="btn btn-primary btn-small" data-pa="issue">Issue</button>')
                            : '<button type="button" class="btn btn-ghost btn-small" data-pa="withdraw">Withdraw</button>') +
                        '<button type="button" class="btn btn-ghost btn-small danger-text" data-pa="delete" aria-label="Delete">' + icon("trash") + "</button></td></tr>";
                }).join("") + "</tbody></table></div>"
                : '<p class="muted small">No payslips for ' + esc(d.periodLabel) + " yet. Use <strong>Run payroll</strong> to make them for everyone.</p>") +
            "</section>" +
            '<section class="panel"><div class="panel-head"><h2 class="panel-title">' + icon("users") + "Pay details</h2>" +
            '<span class="muted small">Standard pay is ' + fmtMoney(d.standardSalary) + " a month</span></div>" +
            '<div class="table-card flat"><table class="table"><thead><tr><th>Employee</th><th>Pay</th><th>' + esc(d.periodLabel) + '</th><th class="col-actions"></th></tr></thead><tbody>' +
            d.people.map(function (p) {
                return '<tr><td><div class="emp-cell">' + avatar(p, "sm") + '<div><div class="emp-name">' + esc(p.displayName) + '</div><div class="muted small">' + esc(p.jobTitle) + "</div></div></div></td>" +
                    '<td data-label="Pay"><strong>' + payLabel(p) + "</strong>" + (p.isStandard ? ' <span class="badge badge-soft">Standard</span>' : "") +
                    (p.band ? ' <span class="badge band-' + p.band.position + '" title="Band ' + esc(fmtMoney(p.band.min) + " – " + fmtMoney(p.band.max)) + ' a month">' + ({ below: "Below band", within: "In band", above: "Above band" })[p.band.position] + "</span>" : "") +
                    (p.pendingBonuses ? ' <span class="badge badge-yellow">Bonus due</span>' : "") + (p.commission ? ' <span class="badge badge-soft">Commission</span>' : "") + "</td>" +
                    '<td data-label="Payslip">' + (withSlip[p.id] ? '<span class="badge badge-green">' + icon("tick") + "Done</span>" : '<span class="muted small">Not yet</span>') + "</td>" +
                    '<td class="col-actions nowrap"><button type="button" class="btn btn-ghost btn-small" data-history="' + p.id + '" data-name="' + esc(p.displayName) + '">' + icon("clock") + "History &amp; bonuses</button>" +
                    '<button type="button" class="btn btn-ghost btn-small" data-details="' + p.id + '">' + icon("edit") + "Pay details</button></td></tr>";
            }).join("") + "</tbody></table></div>" +
            '<p class="muted small pr-rates">' + icon("shield") + "<span>Tax is worked out cumulatively across the tax year with " + esc(d.rates) +
            " rates for England, Wales and Northern Ireland, and National Insurance for each month. Scottish tax codes are treated as the rest of the UK.</span></p></section>" +
            '<div id="pr-upcoming"></div>';
        api("/api/payroll/upcoming-changes").then(function (r) {
            const box = $("#pr-upcoming");
            if (!box || !r.changes.length) return;
            box.innerHTML = '<section class="panel"><div class="panel-head"><h2 class="panel-title">' + icon("calendar") + "Upcoming pay changes</h2></div>" +
                '<div class="pc-list">' + r.changes.map(function (c) {
                    return '<div class="pc-row"><span class="pc-when">' + esc(c.label) + "</span><strong>" + esc(c.displayName) + "</strong><span>" + (c.payType === "hourly" ? fmtMoney(c.hourlyRate) + " an hour" : fmtMoney(c.monthlySalary) + " a month") +
                        (c.note ? ' <span class="muted small">· ' + esc(c.note) + "</span>" : "") + "</span></div>";
                }).join("") + "</div></section>";
        }).catch(function () {});

        root.addEventListener("change", async function (e) {
            if (e.target.id === "pr-month" && e.target.value) { state.payPeriod = e.target.value; render(); }
            if (e.target.id === "pr-require") {
                try { await api("/api/payroll/settings", { requireApproval: e.target.checked }); toast(e.target.checked ? "Payslips now need a second approval." : "Second approval turned off."); render(); } catch (err) { toast(err.message); }
            }
        });
        root.addEventListener("click", async function (e) {
            const per = e.target.closest("[data-period]");
            if (per) { state.payPeriod = per.dataset.period; return render(); }
            if (e.target.closest("#pr-run")) return openPayrollRun(d, period, withSlip);
            if (e.target.closest("#pr-single")) return openPayslipEditor(d, null, period);
            if (e.target.closest("#pr-yearend")) return openYearEnd();
            if (e.target.closest("#pr-bands")) return openBands();
            const hist = e.target.closest("[data-history]");
            if (hist) return openPayHistory(hist.dataset.history, hist.dataset.name);
            if (e.target.closest("#pr-approve-all")) {
                try { const r = await api("/api/payroll/approve-all", { period: period }); toast(r.approved + " approved." + (r.skipped ? " " + r.skipped + " you made or changed need someone else." : "")); render(); } catch (err) { toast(err.message); }
                return;
            }
            const det = e.target.closest("[data-details]");
            if (det) return openPayDetails(det.dataset.details, d);
            if (e.target.closest("#pr-issue-all")) {
                if (!(await confirmDialog({ title: "Issue " + drafts.length + " payslips?", message: "Each employee will be able to see their payslip straight away.", confirmLabel: "Issue payslips" }))) return;
                try { const r = await api("/api/payroll/issue-all", { period: period }); toast(r.issued + " payslips issued." + (r.waiting ? " " + r.waiting + " still need approving." : "")); render(); } catch (err) { toast(err.message); }
                return;
            }
            const pa = e.target.closest("[data-pa]");
            if (!pa) return;
            const id = pa.closest("[data-slip]").dataset.slip;
            const act = pa.dataset.pa;
            try {
                if (act === "view") return openPayslip(id);
                if (act === "edit") return openPayslipEditor(d, (await api("/api/payroll/payslips/" + id)).payslip, period);
                if (act === "delete" && !(await confirmDialog({ title: "Delete this payslip?", message: "Its cost goes back into the payroll fund. Only delete a payslip that was made by mistake.", confirmLabel: "Delete", danger: true }))) return;
                if (act === "withdraw" && !(await confirmDialog({ title: "Withdraw this payslip?", message: "The employee won’t be able to see it until it’s issued again.", confirmLabel: "Withdraw" }))) return;
                await api("/api/payroll/payslips/" + id + "/" + act, {});
                toast({ issue: "Payslip issued.", withdraw: "Payslip withdrawn.", delete: "Payslip deleted and its cost returned to the payroll fund.", approve: "Payslip approved.", unapprove: "Approval removed." }[act]);
                render();
            } catch (err) { toast(err.message); }
        });
    }

    function openPayrollRun(d, period, withSlip) {
        const ready = d.people.filter(function (p) { return !withSlip[p.id]; });
        const m = openModal(
            '<h2 class="modal-title">Run payroll for ' + esc(d.periodLabel) + "</h2>" +
            '<p class="muted">A payslip is made for each person from their pay details, with tax and National Insurance worked out automatically. The cost comes out of the payroll fund straight away. You can check every payslip before issuing it.</p>' +
            '<form id="run-form" novalidate><label for="run-date">Pay date</label><input type="date" id="run-date" value="' + lastWorkingDay(period) + '">' +
            '<div class="rm-head"><h3 class="detail-head">Who to pay</h3><button type="button" class="btn btn-link btn-small" id="run-all">Select all</button></div>' +
            '<div class="member-list run-list">' + (ready.length ? ready.map(function (p) {
                return '<label class="member-row on">' + avatar(p, "md") + '<span class="mr-text"><span class="emp-name">' + esc(p.displayName) + "</span>" +
                    '<span class="muted small">' + payLabel(p) + "</span></span>" +
                    '<input type="checkbox" value="' + p.id + '" checked><span class="mr-check">' + icon("tick") + "</span></label>";
            }).join("") : '<p class="muted small">Everyone already has a payslip for this month.</p>') + "</div>" +
            '<div class="run-summary" id="run-summary"></div>' +
            '<div class="form-error" id="run-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary"' + (ready.length ? "" : " disabled") + ">Make payslips</button></div></form>",
            { cls: "modal-members" }
        );
        // A rough cost for the summary: salaried pay for the people ticked (hourly pay depends on timesheets).
        function summary() {
            const ids = $$(".run-list input:checked", m.el).map(function (c) { return c.value; });
            const est = d.people.filter(function (p) { return ids.indexOf(p.id) !== -1 && p.payType === "salary"; })
                .reduce(function (n, p) { return n + p.monthlySalary * (1 + (p.pensionEmployerPct || 0) / 100); }, 0);
            const fromPayroll = Math.min(est, Math.max(0, d.funds.balances.payroll));
            const fromMain = est - fromPayroll;
            const mainAfter = d.funds.balances.main - fromMain;
            $("#run-summary", m.el).innerHTML = ids.length ? "<div><span>About to pay (pay and employer pension)</span><strong>" + fmtMoney(est) + "</strong></div>" +
                "<div><span>From the payroll fund (" + fmtMoney(d.funds.balances.payroll) + ")</span><strong>\u2212" + fmtMoney(fromPayroll) + "</strong></div>" +
                (fromMain > 0.004 ? "<div><span>From the main balance (" + fmtMoney(d.funds.balances.main) + ")</span><strong>\u2212" + fmtMoney(fromMain) + "</strong></div>" +
                    '<div class="' + (mainAfter < 0 ? "danger-text" : "") + '"><span>Main balance afterwards</span><strong>' + fmtMoney(mainAfter) + "</strong></div>" : "") +
                (mainAfter < 0 ? '<p class="run-warn">' + icon("alert") + "There isn\u2019t enough money, so the main balance will go negative. Payroll can still run, but the next one is locked until funds are added.</p>" : "") : "";
        }
        m.el.addEventListener("change", function (e) {
            const row = e.target.closest(".member-row");
            if (row) row.classList.toggle("on", e.target.checked);
            summary();
        });
        $("#run-all", m.el).addEventListener("click", function () {
            $$(".run-list input", m.el).forEach(function (c) { c.checked = true; c.closest(".member-row").classList.add("on"); });
            summary();
        });
        summary();
        $("#run-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            const ids = $$(".run-list input:checked", m.el).map(function (c) { return c.value; });
            if (!ids.length) return formError($("#run-error", m.el), "Choose at least one person.");
            try {
                const r = await api("/api/payroll/run", { period: period, payDate: $("#run-date", m.el).value, personIds: ids });
                closeModal();
                toast(r.made + (r.made === 1 ? " payslip made: " : " payslips made: ") + fmtMoney(r.fromPayroll) + " from the payroll fund" +
                    (r.fromMain ? " and " + fmtMoney(r.fromMain) + " from the main balance" : "") + "." + (r.skipped.length ? " " + r.skipped.length + " skipped." : ""));
                render();
            } catch (err) { formError($("#run-error", m.el), err.message); }
        });
    }

    function openPayDetails(personId, d) {
        api("/api/payroll/details/" + personId).then(function (r) {
            const v = r.details;
            const m = openModal(
                '<h2 class="modal-title">Pay details · ' + esc(r.person.displayName) + "</h2>" +
                '<p class="muted">Used to make payslips, paid by ' + esc(d.employer) + ". Only Human Resources can see these.</p>" +
                '<form id="pd-form" novalidate>' +
                '<div class="grid-2"><div><label for="pd-type">Pay type</label><select id="pd-type"><option value="salary"' + (v.payType === "salary" ? " selected" : "") + '>Monthly salary</option><option value="hourly"' + (v.payType === "hourly" ? " selected" : "") + ">Hourly rate</option></select></div>" +
                '<div id="pd-salary-box"><label for="pd-salary">Monthly salary (£)</label><input type="number" id="pd-salary" min="0" step="0.01" value="' + esc(v.monthlySalary) + '"></div>' +
                '<div id="pd-rate-box"><label for="pd-rate">Hourly rate (£)</label><input type="number" id="pd-rate" min="0" step="0.01" value="' + esc(v.hourlyRate || "") + '"></div></div>' +
                '<div class="grid-2"><div><label for="pd-num">Employee number</label><input type="text" id="pd-num" maxlength="20" value="' + esc(v.employeeNumber) + '"></div>' +
                '<div><label for="pd-ni">National Insurance number</label><input type="text" id="pd-ni" maxlength="13" value="' + esc(v.niNumber) + '" placeholder="AB123456C"></div></div>' +
                '<div class="grid-2"><div><label for="pd-tax">Tax code</label><input type="text" id="pd-tax" maxlength="12" value="' + esc(v.taxCode) + '"></div>' +
                '<div><label for="pd-nicat">NI category</label><input type="text" id="pd-nicat" maxlength="1" value="' + esc(v.niCategory) + '"></div></div>' +
                '<div class="grid-2"><div><label for="pd-pen">Employee pension (%)</label><input type="number" id="pd-pen" min="0" max="100" step="0.5" value="' + esc(v.pensionEmployeePct) + '"></div>' +
                '<div><label for="pd-epen">Employer pension (%)</label><input type="number" id="pd-epen" min="0" max="100" step="0.5" value="' + esc(v.pensionEmployerPct) + '"></div></div>' +
                '<label for="pd-loan">Student loan</label><select id="pd-loan"><option value="">None</option>' + Object.keys(d.studentLoans).map(function (k) {
                    return '<option value="' + k + '"' + (v.studentLoan === k ? " selected" : "") + ">" + esc(d.studentLoans[k]) + "</option>";
                }).join("") + "</select>" +
                '<h3 class="detail-head">Earlier this tax year</h3>' +
                '<p class="muted small">Pay and tax since ' + esc(fmtDate(v.currentTaxYear + "T12:00:00")) + ' that isn\u2019t on a payslip here (from their P45, or your previous payroll). Income tax is worked out across the whole tax year, so this keeps it right.</p>' +
                '<div class="grid-2"><div><label for="pd-prevpay">Total pay (\u00a3)</label><input type="number" id="pd-prevpay" min="0" step="0.01" value="' + esc(v.previousPay || "") + '" placeholder="0.00"></div>' +
                '<div><label for="pd-prevtax">Tax paid (\u00a3)</label><input type="number" id="pd-prevtax" min="0" step="0.01" value="' + esc(v.previousTax || "") + '" placeholder="0.00"></div></div>' +
                '<div class="form-error" id="pd-error" hidden></div>' +
                '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save pay details</button></div></form>' +
                '<div id="pd-changes" class="pd-changes"></div>'
            );
            mountPayChanges($("#pd-changes", m.el), personId);
            const sync = function () {
                const hourly = $("#pd-type", m.el).value === "hourly";
                $("#pd-salary-box", m.el).hidden = hourly;
                $("#pd-rate-box", m.el).hidden = !hourly;
            };
            $("#pd-type", m.el).addEventListener("change", sync);
            sync();
            $("#pd-form", m.el).addEventListener("submit", async function (e) {
                e.preventDefault();
                try {
                    await api("/api/payroll/details/" + personId, {
                        employeeNumber: $("#pd-num", m.el).value, niNumber: $("#pd-ni", m.el).value,
                        niCategory: $("#pd-nicat", m.el).value, taxCode: $("#pd-tax", m.el).value, payType: $("#pd-type", m.el).value,
                        monthlySalary: $("#pd-salary", m.el).value, hourlyRate: $("#pd-rate", m.el).value,
                        pensionEmployeePct: $("#pd-pen", m.el).value, pensionEmployerPct: $("#pd-epen", m.el).value, studentLoan: $("#pd-loan", m.el).value,
                        previousPay: $("#pd-prevpay", m.el).value, previousTax: $("#pd-prevtax", m.el).value,
                    });
                    closeModal();
                    toast("Pay details saved.");
                    render();
                } catch (err) { formError($("#pd-error", m.el), err.message); }
            });
        }).catch(function (err) { toast(err.message); });
    }

    // Create or edit a payslip. HR sets the payments and any extra deductions; tax, NI, pension and
    // student loan are recalculated automatically as the payments change.
    function openPayslipEditor(d, slip, period) {
        const v = slip || { payments: [], deductions: [], employerItems: [], payDate: lastWorkingDay(period), note: "" };
        const lines = {
            payments: v.payments.map(function (l) { return Object.assign({}, l); }),
            extras: v.deductions.filter(function (l) { return l.kind === "other"; }).map(function (l) { return Object.assign({}, l); }),
        };
        let auto = { deductions: v.deductions.filter(function (l) { return l.kind !== "other"; }), employer: v.employerItems };
        const m = openModal(
            '<h2 class="modal-title">' + (slip ? "Edit payslip · " + esc(slip.employeeName) + " · " + esc(slip.periodLabel) : "New payslip · " + esc(d.periodLabel)) + "</h2>" +
            '<form id="pe-form" novalidate>' +
            (slip ? "" : '<label for="pe-person">Employee</label><select id="pe-person"><option value="">Choose someone</option>' + d.people.map(function (p) {
                return '<option value="' + p.id + '">' + esc(p.displayName) + " — " + payLabel(p) + (d.payslips.some(function (x) { return x.personId === p.id; }) ? " (already has one)" : "") + "</option>";
            }).join("") + "</select>") +
            '<div class="grid-2"><div><label for="pe-date">Pay date</label><input type="date" id="pe-date" value="' + esc(v.payDate) + '"></div><div></div></div>' +
            (slip ? "" : '<div class="pe-override" id="pe-override" hidden>' + icon("alert") + '<div><strong>This person already has a payslip for ' + esc(d.periodLabel) + ".</strong>" +
                '<label class="inline-check"><input type="checkbox" id="pe-override-box"> Make an additional payslip anyway (for example a bonus or a correction)</label></div></div>') +
            '<div id="pe-lines"></div>' +
            '<div class="pe-totals" id="pe-totals"></div>' +
            '<label for="pe-note">Message on the payslip <span class="muted small">(optional)</span></label><textarea id="pe-note" rows="2" maxlength="500">' + esc(v.note || "") + "</textarea>" +
            '<div class="form-error" id="pe-error" hidden></div>' +
            '<div class="modal-actions sticky-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
            '<button type="submit" class="btn btn-ghost" data-issue="0">Save draft</button><button type="submit" class="btn btn-primary" data-issue="1">' + icon("tick") + "Save and issue</button></div></form>",
            { wide: true }
        );
        const editable = function (key, title, addLabel) {
            return '<div class="pe-section" data-key="' + key + '"><div class="pe-head"><h3 class="detail-head">' + title + '</h3><button type="button" class="btn btn-link btn-small" data-add="' + key + '">' + icon("plus") + addLabel + "</button></div>" +
                (lines[key].length ? lines[key].map(function (l, i) {
                    return '<div class="pe-line" data-i="' + i + '"><input type="text" class="pe-label" maxlength="80" value="' + esc(l.label) + '" placeholder="Description">' +
                        '<span class="pe-money"><span>£</span><input type="number" class="pe-amount" step="0.01" value="' + (l.amount === "" ? "" : Number(l.amount).toFixed(2)) + '" aria-label="Amount"></span>' +
                        '<button type="button" class="icon-btn icon-btn-sm" data-remove aria-label="Remove line">' + icon("x") + "</button></div>";
                }).join("") : '<p class="muted small pe-empty">None</p>') + "</div>";
        };
        const autoRows = function (list) {
            return list.map(function (l) {
                return '<div class="pe-line pe-auto"><span class="pe-auto-label">' + icon("lock") + esc(l.label) + '</span><span class="pe-auto-amt">' + fmtMoney(l.amount) + "</span></div>";
            }).join("");
        };
        function drawLines() {
            $("#pe-lines", m.el).innerHTML = editable("payments", "Payments", "Add payment") +
                '<div class="pe-section"><div class="pe-head"><h3 class="detail-head">Worked out automatically</h3><span class="muted small">Updates as you change the payments</span></div>' +
                autoRows(auto.deductions) + "</div>" +
                editable("extras", "Other deductions", "Add deduction") +
                (auto.employer.some(function (l) { return l.amount; }) ? '<div class="pe-section"><div class="pe-head"><h3 class="detail-head">Paid by the employer (not deducted)</h3></div>' + autoRows(auto.employer) + "</div>" : "");
            drawTotals();
        }
        function drawTotals() {
            const s = function (list) { return list.reduce(function (n, l) { return n + (Number(l.amount) || 0); }, 0); };
            const gross = s(lines.payments);
            const ded = s(auto.deductions) + s(lines.extras);
            $("#pe-totals", m.el).innerHTML = "<span>Total pay <strong>" + fmtMoney(gross) + "</strong></span><span>Deductions <strong>" + fmtMoney(ded) + "</strong></span>" +
                '<span class="pe-net">Take-home <strong>' + fmtMoney(gross - ded) + "</strong></span><span class=\"muted\">Cost to the payroll fund <strong>" + fmtMoney(gross + s(auto.employer)) + "</strong></span>";
        }
        const personId = function () { return slip ? slip.personId : $("#pe-person", m.el).value; };
        let timer;
        let seq = 0;
        async function recalc() {
            if (!personId()) { auto = { deductions: [], employer: [] }; drawLines(); return; }
            const mySeq = ++seq;
            try {
                const r = await api("/api/payroll/calculate", { personId: personId(), payments: lines.payments, payDate: $("#pe-date", m.el).value, payslipId: slip ? slip.id : "" });
                if (mySeq !== seq) return;
                auto = { deductions: r.deductions, employer: r.employer };
                const focused = document.activeElement;
                const keep = focused && focused.closest && focused.closest(".pe-line") ? { key: focused.closest("[data-key]").dataset.key, i: focused.closest(".pe-line").dataset.i, cls: focused.className } : null;
                drawLines();
                if (keep) {
                    const el = $('[data-key="' + keep.key + '"] .pe-line[data-i="' + keep.i + '"] .' + keep.cls.split(" ")[0], m.el);
                    if (el) { el.focus(); if (el.setSelectionRange && el.type === "text") el.setSelectionRange(el.value.length, el.value.length); }
                }
            } catch (err) { formError($("#pe-error", m.el), err.message); }
        }
        const scheduleRecalc = function () { clearTimeout(timer); timer = setTimeout(recalc, 350); };
        drawLines();
        const box = $("#pe-lines", m.el);
        box.addEventListener("input", function (e) {
            const row = e.target.closest(".pe-line");
            if (!row || !row.closest("[data-key]")) return;
            const l = lines[row.closest("[data-key]").dataset.key][Number(row.dataset.i)];
            if (e.target.classList.contains("pe-label")) l.label = e.target.value;
            if (e.target.classList.contains("pe-amount")) {
                l.amount = e.target.value;
                if (row.closest("[data-key]").dataset.key === "payments") scheduleRecalc();
            }
            drawTotals();
        });
        box.addEventListener("click", function (e) {
            const add = e.target.closest("[data-add]");
            if (add) { lines[add.dataset.add].push({ label: "", amount: "" }); drawLines(); return; }
            const rm = e.target.closest("[data-remove]");
            if (rm) {
                const row = rm.closest(".pe-line");
                const key = row.closest("[data-key]").dataset.key;
                lines[key].splice(Number(row.dataset.i), 1);
                drawLines();
                if (key === "payments") scheduleRecalc();
            }
        });
        $("#pe-date", m.el).addEventListener("change", scheduleRecalc);
        const hasSlip = function (id) { return d.payslips.some(function (x) { return x.personId === id; }); };
        if ($("#pe-person", m.el)) $("#pe-person", m.el).addEventListener("change", async function () {
            $("#pe-override", m.el).hidden = !hasSlip(personId());
            $("#pe-override-box", m.el).checked = false;
            if (!personId()) return;
            try {
                const est = await api("/api/payroll/estimate", { personId: personId(), period: period, payDate: $("#pe-date", m.el).value });
                lines.payments = est.payments;
                auto = { deductions: est.deductions, employer: est.employer };
                drawLines();
            } catch (err) { formError($("#pe-error", m.el), err.message); }
        });
        $("#pe-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            const issue = e.submitter && e.submitter.dataset.issue === "1";
            const body = {
                payDate: $("#pe-date", m.el).value,
                payments: lines.payments,
                deductions: lines.extras.map(function (l) { return { label: l.label, amount: l.amount, kind: "other" }; }),
                note: $("#pe-note", m.el).value,
            };
            try {
                let saved;
                if (slip) saved = (await api("/api/payroll/payslips/" + slip.id, body)).payslip;
                else {
                    body.personId = personId();
                    body.period = period;
                    if (!body.personId) return formError($("#pe-error", m.el), "Choose an employee.");
                    if (hasSlip(body.personId) && !$("#pe-override-box", m.el).checked) {
                        return formError($("#pe-error", m.el), "They already have a payslip this month. Tick \u201cMake an additional payslip anyway\u201d to make another one.");
                    }
                    body.override = hasSlip(body.personId);
                    saved = (await api("/api/payroll/payslips", body)).payslip;
                }
                if (issue) await api("/api/payroll/payslips/" + saved.id + "/issue", {});
                closeModal();
                toast(issue ? "Payslip issued." : "Draft saved.");
                render();
            } catch (err) { formError($("#pe-error", m.el), err.message); }
        });
    }

    // ================= IT Helpdesk =================

    function ticketStatusPill(status, labels) {
        return '<span class="tk-status tk-' + status + '">' + esc(labels[status] || status) + "</span>";
    }

    function priorityPill(p, labels) {
        return '<span class="tk-priority tp-' + p + '">' + esc(labels[p] || p) + "</span>";
    }

    async function viewHelpdesk(root, current) {
        const d = await api("/api/helpdesk");
        if (!current()) return;
        const me = state.me;
        const done = function (t) { return t.status === "resolved" || t.status === "closed"; };
        const filters = d.canManage
            ? [["open", "Open", function (t) { return !done(t); }], ["mine", "Assigned to me", function (t) { return !done(t) && t.assignee && t.assignee.id === me.id; }],
               ["unassigned", "Unassigned", function (t) { return !done(t) && !t.assignee; }], ["raised", "Raised by me", function (t) { return t.requester && t.requester.id === me.id; }],
               ["done", "Resolved & closed", done]]
            : [["open", "Open", function (t) { return !done(t); }], ["done", "Resolved & closed", done]];
        let filter = state.helpFilter && filters.some(function (f) { return f[0] === state.helpFilter; }) ? state.helpFilter : "open";

        root.innerHTML =
            '<div class="page-head"><div><h1>IT Helpdesk</h1><p class="muted">' + (d.canManage ? "Every ticket raised across HN Group." : "Get help from the IT team. Raise a ticket and follow it here.") + "</p></div>" +
            '<div class="page-actions"><button type="button" class="btn btn-primary" id="hd-new">' + icon("plus") + "New ticket</button></div></div>" +
            '<div class="company-tabs" id="hd-tabs">' + filters.map(function (f) {
                return '<button type="button" data-f="' + f[0] + '">' + esc(f[1]) + ' <span class="tab-count">' + d.tickets.filter(f[2]).length + "</span></button>";
            }).join("") + "</div>" +
            '<div id="hd-list"></div>';

        function draw() {
            $$("#hd-tabs [data-f]").forEach(function (b) { b.classList.toggle("active", b.dataset.f === filter); });
            const fn = filters.find(function (f) { return f[0] === filter; })[2];
            const list = d.tickets.filter(fn);
            $("#hd-list").innerHTML = list.length ? '<div class="ticket-list">' + list.map(function (t) {
                return '<button type="button" class="ticket-row" data-ticket="' + t.id + '">' +
                    '<span class="tk-num">#' + t.number + "</span>" +
                    '<span class="tk-main"><span class="tk-subject">' + esc(t.subject) + "</span>" +
                    '<span class="muted small">' + esc(t.categoryLabel) + (d.canManage && t.requester ? " · " + esc(t.requester.displayName) : "") +
                    " · updated " + esc(timeAgo(t.updatedAt)) + (t.replies ? " · " + t.replies + (t.replies === 1 ? " reply" : " replies") : "") + "</span></span>" +
                    '<span class="tk-side">' + priorityPill(t.priority, d.priorities) + ticketStatusPill(t.status, d.statuses) +
                    (t.assignee ? '<span class="tk-assignee" title="Assigned to ' + esc(t.assignee.displayName) + '">' + avatar(t.assignee, "xs") + "</span>" : "") + "</span></button>";
            }).join("") + "</div>"
                : '<div class="empty-page">' + icon("lifebuoy", "big") + "<h2>" + (filter === "open" ? "No open tickets" : "Nothing here") + "</h2>" +
                  '<p class="muted">' + (filter === "open" && !d.canManage ? "Something not working? Use <strong>New ticket</strong> and the IT team will help." : "All quiet.") + "</p></div>";
        }

        root.addEventListener("click", function (e) {
            const f = e.target.closest("[data-f]");
            if (f) { filter = state.helpFilter = f.dataset.f; return draw(); }
            if (e.target.closest("#hd-new")) return openNewTicket(d);
            const t = e.target.closest("[data-ticket]");
            if (t) openTicket(t.dataset.ticket, d);
        });
        draw();
        if (state.pendingTicket) {
            const id = state.pendingTicket;
            state.pendingTicket = null;
            openTicket(id, d);
        }
    }

    function openNewTicket(d) {
        const m = openModal(
            '<h2 class="modal-title">New IT ticket</h2><p class="muted">Tell the IT team what’s wrong. The more detail, the quicker they can fix it.</p>' +
            '<form id="tk-form" novalidate>' +
            '<label for="tk-subject">Summary</label><input type="text" id="tk-subject" maxlength="150" placeholder="e.g. Can’t connect to the VPN from home">' +
            '<div class="grid-2"><div><label for="tk-cat">Category</label><select id="tk-cat">' + Object.keys(d.categories).map(function (k) {
                return '<option value="' + k + '">' + esc(d.categories[k]) + "</option>";
            }).join("") + "</select></div>" +
            '<div><label for="tk-pri">How urgent?</label><select id="tk-pri">' + Object.keys(d.priorities).map(function (k) {
                return '<option value="' + k + '"' + (k === "normal" ? " selected" : "") + ">" + esc(d.priorities[k]) + "</option>";
            }).join("") + "</select></div></div>" +
            '<label for="tk-body">Details</label><textarea id="tk-body" rows="6" maxlength="5000" placeholder="What happened, what you expected, any error messages, and what you’ve tried."></textarea>' +
            '<div class="form-error" id="tk-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Raise ticket</button></div></form>'
        );
        $("#tk-subject", m.el).focus();
        $("#tk-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                const r = await api("/api/helpdesk", { subject: $("#tk-subject", m.el).value, category: $("#tk-cat", m.el).value, priority: $("#tk-pri", m.el).value, body: $("#tk-body", m.el).value });
                state.me = r.user;
                renderChrome();
                closeModal();
                toast("Ticket #" + r.ticket.number + " raised. The IT team will be in touch.");
                state.pendingTicket = r.ticket.id;
                state.helpFilter = "open";
                if (window.location.pathname === "/helpdesk") render(); else navigate("/helpdesk");
            } catch (err) { formError($("#tk-error", m.el), err.message); }
        });
    }

    async function openTicket(id, d) {
        let t;
        try { t = (await api("/api/helpdesk/" + id)).ticket; } catch (err) { return toast(err.message); }
        const done = t.status === "resolved" || t.status === "closed";
        const m = openModal(
            '<div class="tk-header"><span class="tk-num">#' + t.number + "</span>" + ticketStatusPill(t.status, d.statuses) + priorityPill(t.priority, d.priorities) + "</div>" +
            '<h2 class="modal-title">' + esc(t.subject) + "</h2>" +
            '<p class="muted small">' + esc(t.categoryLabel) + " · raised by " + esc(t.requester ? t.requester.displayName : "") + " " + esc(timeAgo(t.createdAt)) +
            (t.assignee ? " · assigned to " + esc(t.assignee.displayName) : " · not assigned yet") + "</p>" +
            (t.canManage ? '<div class="tk-controls">' +
                '<label>Status<select id="tk-status">' + Object.keys(d.statuses).map(function (k) { return '<option value="' + k + '"' + (t.status === k ? " selected" : "") + ">" + esc(k === "waiting" ? "Waiting on requester" : d.statuses[k]) + "</option>"; }).join("") + "</select></label>" +
                '<label>Priority<select id="tk-priority">' + Object.keys(d.priorities).map(function (k) { return '<option value="' + k + '"' + (t.priority === k ? " selected" : "") + ">" + esc(d.priorities[k]) + "</option>"; }).join("") + "</select></label>" +
                '<label>Assigned to<select id="tk-assignee"><option value="">Nobody</option>' + d.agents.map(function (a) { return '<option value="' + a.id + '"' + (t.assignee && t.assignee.id === a.id ? " selected" : "") + ">" + esc(a.displayName) + (a.id === state.me.id ? " (me)" : "") + "</option>"; }).join("") + "</select></label>" +
                "</div>" : "") +
            '<div class="tk-thread">' + t.messages.map(function (msg) {
                const mine = msg.authorId === state.me.id;
                return '<div class="tk-msg' + (mine ? " mine" : "") + (msg.internal ? " internal" : "") + (msg.fromIt ? " from-it" : "") + '">' + avatar(msg.author || {}, "sm") +
                    '<div class="tk-bubble"><div class="tk-meta"><strong>' + esc(msg.author ? msg.author.displayName : "") + "</strong>" +
                    (msg.fromIt ? '<span class="badge">IT</span>' : "") + (msg.internal ? '<span class="badge badge-yellow">Internal note</span>' : "") +
                    '<span class="muted small">' + esc(timeAgo(msg.at)) + '</span></div><div class="tk-body">' + richText(msg.body) + "</div></div></div>";
            }).join("") + "</div>" +
            (t.status === "closed" && !t.canManage ? '<p class="muted small center">This ticket is closed. Reopen it if the problem is back.</p>' :
            '<form id="tk-reply" class="tk-reply" novalidate><textarea id="tk-reply-text" rows="3" maxlength="5000" placeholder="' + (t.canManage ? "Reply to " + esc(t.requester ? t.requester.displayName : "the requester") : "Add more detail or reply to IT") + '…"></textarea>' +
            '<div class="tk-reply-bar">' + (t.canManage ? '<label class="inline-check"><input type="checkbox" id="tk-internal"> Internal note (only IT sees it)</label>' : "<span></span>") +
            '<button type="submit" class="btn btn-primary btn-small">' + icon("message") + "Send</button></div></form>") +
            '<div class="modal-actions">' + (t.isRequester && !t.canManage
                ? (done ? '<button type="button" class="btn btn-ghost" data-set="open">' + icon("refresh") + "Reopen ticket</button>" : '<button type="button" class="btn btn-ghost" data-set="resolved">' + icon("tick") + "It’s fixed – close ticket</button>")
                : "") + '<button type="button" class="btn btn-primary" data-close>Done</button></div>',
            { wide: true, cls: "modal-ticket" }
        );
        const thread = $(".tk-thread", m.el);
        thread.scrollTop = thread.scrollHeight;
        const after = function (r, message) {
            state.me = r.user;
            renderChrome();
            toast(message);
            if (window.location.pathname === "/helpdesk") {
                closeModal();
                state.pendingTicket = id;
                render();
            }
        };
        if (t.canManage) {
            m.el.addEventListener("change", async function (e) {
                const field = { "tk-status": "status", "tk-priority": "priority", "tk-assignee": "assigneeId" }[e.target.id];
                if (!field) return;
                const body = {};
                body[field] = e.target.value;
                try { after(await api("/api/helpdesk/" + id + "/update", body), "Ticket updated."); } catch (err) { toast(err.message); }
            });
        }
        const replyForm = $("#tk-reply", m.el);
        if (replyForm) replyForm.addEventListener("submit", async function (e) {
            e.preventDefault();
            const body = $("#tk-reply-text", m.el).value;
            if (!body.trim()) return;
            try { after(await api("/api/helpdesk/" + id + "/reply", { body: body, internal: $("#tk-internal", m.el) ? $("#tk-internal", m.el).checked : false }), "Reply sent."); } catch (err) { toast(err.message); }
        });
        m.el.addEventListener("click", async function (e) {
            const s = e.target.closest("[data-set]");
            if (!s) return;
            try { after(await api("/api/helpdesk/" + id + "/update", { status: s.dataset.set }), s.dataset.set === "open" ? "Ticket reopened." : "Ticket closed. Thanks!"); } catch (err) { toast(err.message); }
        });
    }

    // ================= Probation & reviews =================

    const PROBATION_STATUS = { "in-progress": ["In probation", "badge-yellow"], due: ["Probation ending", "badge-red"], extended: ["Probation extended", "badge-yellow"], passed: ["Passed probation", "badge-green"], failed: ["Didn’t pass", "badge-red"], none: ["No probation", ""], unknown: ["No start date", ""] };

    function dueText(days) {
        if (days < 0) return Math.abs(days) + (days === -1 ? " day" : " days") + " overdue";
        if (days === 0) return "today";
        return "in " + days + (days === 1 ? " day" : " days");
    }

    function probationBadge(p) {
        const s = PROBATION_STATUS[p.status] || PROBATION_STATUS.unknown;
        return '<span class="badge ' + s[1] + '">' + esc(s[0]) + "</span>";
    }

    function reviewCardHtml(r, manage) {
        return '<article class="review-card" data-review="' + r.id + '">' +
            '<div class="rc-head"><span class="rc-type">' + esc(r.typeLabel) + "</span>" +
            (r.outcomeLabel ? '<span class="badge ' + (r.outcome === "passed" ? "badge-green" : r.outcome === "failed" ? "badge-red" : "badge-yellow") + '">' + esc(r.outcomeLabel) + "</span>" : "") +
            (manage ? (r.shared ? '<span class="badge badge-soft">' + icon("eye") + "Shared</span>" : '<span class="badge">' + icon("lock") + "Private</span>") : "") +
            '<span class="rc-date">' + esc(fmtDate(r.date + "T12:00:00")) + "</span></div>" +
            (r.rating ? '<div class="rc-rating" aria-label="' + r.rating + ' out of 5">' + [1, 2, 3, 4, 5].map(function (n) { return '<span class="' + (n <= r.rating ? "on" : "") + '">' + icon("star") + "</span>"; }).join("") + "</div>" : "") +
            '<div class="rc-body">' + richText(r.summary) + "</div>" +
            (r.strengths ? '<div class="rc-part"><h4>Going well</h4>' + richText(r.strengths) + "</div>" : "") +
            (r.improvements ? '<div class="rc-part"><h4>To work on</h4>' + richText(r.improvements) + "</div>" : "") +
            '<div class="rc-foot"><span class="muted small">By ' + esc(r.reviewer.displayName) + (r.nextReviewDate ? " · next review " + esc(fmtDate(r.nextReviewDate + "T12:00:00")) : "") + "</span>" +
            (manage ? '<span class="btn-row"><button type="button" class="btn btn-ghost btn-small" data-share="' + (r.shared ? "0" : "1") + '">' + (r.shared ? "Make private" : "Share with them") + "</button>" +
                '<button type="button" class="btn btn-ghost btn-small danger-text" data-del-review aria-label="Delete review">' + icon("trash") + "</button></span>" : "") + "</div>" +
            "</article>";
    }

    async function viewReviews(root, current) {
        const d = await api("/api/reviews");
        if (!current()) return;
        let tab = state.reviewsTab || (d.isManager ? (d.due.length ? "due" : "team") : "mine");
        if (!d.isManager && tab !== "mine") tab = "mine";
        const tabs = d.isManager ? [["due", "Coming up", d.due.length], ["team", "My team", d.team.length], ["mine", "My reviews", d.mine.length]] : [["mine", "My reviews", d.mine.length]];
        const mp = d.myProbation;
        root.innerHTML =
            '<div class="page-head"><div><h1>Probation &amp; reviews</h1><p class="muted">' + (d.isManager ? "Probation dates and reviews for the people you look after, and your own reviews." : "Your probation and the reviews your manager has shared with you.") + "</p></div></div>" +
            (mp && mp.endDate && ["in-progress", "due", "extended"].indexOf(mp.status) !== -1 ? '<section class="panel probation-banner">' + icon("clock") + '<div><strong>Your probation ' + (mp.status === "extended" ? "has been extended and now ends" : "ends") + " on " + esc(fmtDate(mp.endDate + "T12:00:00")) + ".</strong> " +
                '<span class="muted">Your supervisor will review it with you around then.</span></div></section>' : "") +
            '<div class="company-tabs" id="rv-tabs">' + tabs.map(function (t) { return '<button type="button" data-tab="' + t[0] + '">' + esc(t[1]) + ' <span class="tab-count">' + t[2] + "</span></button>"; }).join("") + "</div>" +
            '<div id="rv-body"></div>';

        function draw() {
            $$("#rv-tabs [data-tab]").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === tab); });
            const body = $("#rv-body");
            if (tab === "due") {
                body.innerHTML = d.due.length ? '<div class="panel leave-list">' + d.due.map(function (x) {
                    return '<div class="leave-row">' + avatar(x.person, "md") + '<div class="lr-main"><div class="lr-title">' + esc(x.person.displayName) + "</div>" +
                        '<div class="muted small">' + (x.kind === "probation" ? "Probation ends " : "Review due ") + esc(fmtDate(x.date + "T12:00:00")) + "</div></div>" +
                        '<div class="lr-side"><span class="badge ' + (x.days < 0 ? "badge-red" : "badge-yellow") + '">' + esc(dueText(x.days)) + "</span>" +
                        '<button type="button" class="btn btn-primary btn-small" data-person="' + x.person.id + '">' + (x.kind === "probation" ? "Review probation" : "Open") + "</button></div></div>";
                }).join("") + "</div>" : '<div class="empty-page">' + icon("check", "big") + "<h2>Nothing coming up</h2><p class=\"muted\">Probations ending and reviews due in the next two weeks show here.</p></div>";
            } else if (tab === "team") {
                body.innerHTML = '<div class="table-card"><table class="table table-click"><thead><tr><th>Person</th><th>Probation</th><th>Last review</th><th>Next review</th><th class="col-actions"></th></tr></thead><tbody>' +
                    d.team.map(function (t) {
                        return '<tr data-person="' + t.person.id + '" tabindex="0"><td><div class="emp-cell">' + avatar(t.person, "sm") + '<div><div class="emp-name">' + esc(t.person.displayName) + '</div><div class="muted small">' + esc(t.person.jobTitle || "") + "</div></div></div></td>" +
                            '<td data-label="Probation">' + probationBadge(t.probation) + (t.probation.endDate && ["in-progress", "due", "extended"].indexOf(t.probation.status) !== -1 ? '<div class="muted small">ends ' + esc(fmtDate(t.probation.endDate + "T12:00:00")) + "</div>" : "") + "</td>" +
                            '<td data-label="Last review">' + (t.lastReview ? esc(t.lastReview.typeLabel) + '<div class="muted small">' + esc(fmtDate(t.lastReview.date + "T12:00:00")) + "</div>" : '<span class="muted">None yet</span>') + "</td>" +
                            '<td data-label="Next review">' + (t.nextReviewDate ? esc(fmtDate(t.nextReviewDate + "T12:00:00")) : '<span class="muted">–</span>') + "</td>" +
                            '<td class="col-actions">' + icon("chevronRight") + "</td></tr>";
                    }).join("") + "</tbody></table></div>";
            } else {
                body.innerHTML = d.mine.length ? '<div class="review-list">' + d.mine.map(function (r) { return reviewCardHtml(r, false); }).join("") + "</div>"
                    : '<div class="empty-page">' + icon("star", "big") + "<h2>No reviews yet</h2><p class=\"muted\">Reviews your manager shares with you will appear here.</p></div>";
            }
        }
        root.addEventListener("click", function (e) {
            const t = e.target.closest("[data-tab]");
            if (t) { tab = state.reviewsTab = t.dataset.tab; return draw(); }
            const p = e.target.closest("[data-person]");
            if (p) openPersonReviews(p.dataset.person, d);
        });
        draw();
    }

    async function openPersonReviews(personId, d) {
        let r;
        try { r = await api("/api/reviews/person/" + personId); } catch (err) { return toast(err.message); }
        const pr = r.probation;
        const m = openModal(
            '<h2 class="modal-title">' + esc(r.person.displayName) + '</h2><p class="muted">' + esc(r.person.jobTitle || "") + (r.person.startDate ? " · started " + esc(fmtDate(r.person.startDate + "T12:00:00")) : "") + "</p>" +
            '<section class="probation-box"><div><div class="pb-label">Probation</div>' + probationBadge(pr) +
            (pr.endDate ? ' <span class="muted small">' + (pr.status === "passed" || pr.status === "failed" ? "ended " : "ends ") + esc(fmtDate(pr.endDate + "T12:00:00")) + (pr.custom ? "" : " (3 months after their start date)") + "</span>" : ' <span class="muted small">Add a start date in Employee Management, or set a date here.</span>') +
            '</div><button type="button" class="btn btn-ghost btn-small" id="pr-edit">' + icon("edit") + "Change</button></section>" +
            '<div class="rm-head rv-head"><h3 class="detail-head">Reviews <span class="tab-count">' + r.reviews.length + '</span></h3><button type="button" class="btn btn-primary btn-small" id="rv-add">' + icon("plus") + "Add review</button></div>" +
            (r.reviews.length ? '<div class="review-list">' + r.reviews.map(function (x) { return reviewCardHtml(x, true); }).join("") + "</div>" : '<p class="muted small">No reviews yet.</p>') +
            '<div class="modal-actions"><button type="button" class="btn btn-primary" data-close>Done</button></div>',
            { wide: true }
        );
        const reopen = function () { closeModal(); openPersonReviews(personId, d); };
        m.el.addEventListener("click", async function (e) {
            if (e.target.closest("#rv-add")) return openReviewForm(r, d, reopen);
            if (e.target.closest("#pr-edit")) return openProbationForm(r, reopen);
            const card = e.target.closest("[data-review]");
            if (!card) return;
            const id = card.dataset.review;
            try {
                if (e.target.closest("[data-share]")) {
                    await api("/api/reviews/" + id + "/share", { shared: e.target.closest("[data-share]").dataset.share === "1" });
                    toast(e.target.closest("[data-share]").dataset.share === "1" ? "Shared with " + r.person.displayName + "." : "Review made private.");
                    return reopen();
                }
                if (e.target.closest("[data-del-review]")) {
                    if (!(await confirmDialog({ title: "Delete this review?", message: "It can’t be recovered.", confirmLabel: "Delete", danger: true }))) return reopen();
                    await api("/api/reviews/" + id + "/delete", {});
                    toast("Review deleted.");
                    reopen();
                }
            } catch (err) { toast(err.message); }
        });
    }

    function openProbationForm(r, after) {
        const pr = r.probation;
        const m = openModal(
            '<h2 class="modal-title">Probation · ' + esc(r.person.displayName) + "</h2>" +
            '<form id="prb-form" novalidate><div class="grid-2"><div><label for="prb-date">Ends on</label><input type="date" id="prb-date" value="' + esc(pr.endDate || "") + '"></div>' +
            '<div><label for="prb-status">Status</label><select id="prb-status">' + ["in-progress", "extended", "passed", "failed", "none"].map(function (k) {
                return '<option value="' + k + '"' + ((pr.status === k || (pr.status === "due" && k === "in-progress")) ? " selected" : "") + ">" + esc(PROBATION_STATUS[k][0]) + "</option>";
            }).join("") + "</select></div></div>" +
            '<p class="hint">Recording a probation review with an outcome updates this for you.</p>' +
            '<div class="form-error" id="prb-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save</button></div></form>'
        );
        $("#prb-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                const res = await api("/api/reviews/person/" + r.person.id + "/probation", { endDate: $("#prb-date", m.el).value, status: $("#prb-status", m.el).value });
                state.me = res.user;
                renderChrome();
                toast("Probation updated.");
                after();
            } catch (err) { formError($("#prb-error", m.el), err.message); }
        });
    }

    function openReviewForm(r, d, after) {
        const probationOpen = ["in-progress", "due", "extended"].indexOf(r.probation.status) !== -1;
        const m = openModal(
            '<h2 class="modal-title">Add review · ' + esc(r.person.displayName) + "</h2>" +
            '<form id="rvf-form" novalidate>' +
            '<div class="grid-2"><div><label for="rvf-type">Type</label><select id="rvf-type">' + Object.keys(d.types).map(function (k) {
                return '<option value="' + k + '"' + ((probationOpen ? k === "probation" : k === "one-to-one") ? " selected" : "") + ">" + esc(d.types[k]) + "</option>";
            }).join("") + "</select></div>" +
            '<div><label for="rvf-date">Date</label><input type="date" id="rvf-date" value="' + isoDay(new Date()) + '"></div></div>' +
            '<div id="rvf-outcome-box"><label for="rvf-outcome">Outcome</label><select id="rvf-outcome"><option value="">No decision yet</option>' + Object.keys(d.outcomes).map(function (k) {
                return '<option value="' + k + '">' + esc(d.outcomes[k]) + "</option>";
            }).join("") + '</select><div id="rvf-extend-box" hidden><label for="rvf-extend">Extend probation to</label><input type="date" id="rvf-extend"></div></div>' +
            '<label for="rvf-summary">Summary</label><textarea id="rvf-summary" rows="3" maxlength="3000" placeholder="How things are going overall"></textarea>' +
            '<div class="grid-2"><div><label for="rvf-good">Going well <span class="muted small">(optional)</span></label><textarea id="rvf-good" rows="3" maxlength="2000"></textarea></div>' +
            '<div><label for="rvf-improve">To work on <span class="muted small">(optional)</span></label><textarea id="rvf-improve" rows="3" maxlength="2000"></textarea></div></div>' +
            '<div class="grid-2"><div><label>Rating <span class="muted small">(optional)</span></label><div class="rating" id="rvf-rating">' + [1, 2, 3, 4, 5].map(function (n) {
                return '<button type="button" class="rating-star" data-value="' + n + '" aria-label="' + n + ' out of 5">' + icon("star") + "</button>";
            }).join("") + "</div></div>" +
            '<div><label for="rvf-next">Next review <span class="muted small">(optional)</span></label><input type="date" id="rvf-next"></div></div>' +
            '<label class="inline-check option-row"><input type="checkbox" id="rvf-share"> Share this review with ' + esc(r.person.displayName) + "</label>" +
            '<div class="form-error" id="rvf-error" hidden></div>' +
            '<div class="modal-actions sticky-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save review</button></div></form>',
            { wide: true }
        );
        let rating = 0;
        const sync = function () {
            $("#rvf-outcome-box", m.el).hidden = $("#rvf-type", m.el).value !== "probation";
            $("#rvf-extend-box", m.el).hidden = $("#rvf-outcome", m.el).value !== "extended";
        };
        m.el.addEventListener("change", sync);
        sync();
        $("#rvf-rating", m.el).addEventListener("click", function (e) {
            const s = e.target.closest(".rating-star");
            if (!s) return;
            rating = Number(s.dataset.value) === rating ? 0 : Number(s.dataset.value);
            $$(".rating-star", m.el).forEach(function (b) { b.classList.toggle("on", Number(b.dataset.value) <= rating); });
        });
        $("#rvf-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            const type = $("#rvf-type", m.el).value;
            try {
                const res = await api("/api/reviews/person/" + r.person.id, {
                    type: type, date: $("#rvf-date", m.el).value, summary: $("#rvf-summary", m.el).value,
                    strengths: $("#rvf-good", m.el).value, improvements: $("#rvf-improve", m.el).value, rating: rating || "",
                    outcome: type === "probation" ? $("#rvf-outcome", m.el).value : "", extendTo: $("#rvf-extend", m.el).value,
                    nextReviewDate: $("#rvf-next", m.el).value, shared: $("#rvf-share", m.el).checked,
                });
                state.me = res.user;
                renderChrome();
                toast("Review saved.");
                after();
            } catch (err) { formError($("#rvf-error", m.el), err.message); }
        });
    }

    // ================= Staff documents =================

    async function viewStaffFiles(root, current) {
        const personId = state.staffFilesPerson || "";
        const d = await api("/api/staff-files" + (personId ? "?person=" + personId : ""));
        if (!current()) return;
        const own = d.person.id === state.me.id;
        const list = '<section class="panel sf-files"><div class="panel-head"><h2 class="panel-title">' + icon("file") + (own ? "Your documents" : esc(d.person.displayName)) + "</h2>" +
            (d.canManage ? '<button type="button" class="btn btn-primary btn-small" id="sf-upload">' + icon("upload") + "Upload</button>" : "") + "</div>" +
            (d.files.length ? '<div class="sf-list">' + d.files.map(function (f) {
                return '<div class="sf-row" data-file="' + f.id + '">' + fileBadge(f.ext) +
                    '<div class="sf-main"><div class="emp-name">' + esc(f.title) + "</div>" +
                    '<div class="muted small">' + esc(f.category) + " · " + esc(fileSize(f.size)) + " · added " + esc(fmtDate(f.uploadedAt)) + (d.canManage ? " by " + esc(f.uploadedByName) : "") + "</div>" +
                    (f.note ? '<div class="lr-note">' + esc(f.note) + "</div>" : "") + "</div>" +
                    '<div class="sf-actions">' + (d.canManage ? (f.shared ? '<span class="badge badge-soft">' + icon("eye") + "They can see it</span>" : '<span class="badge">' + icon("lock") + "HR only</span>") : "") +
                    (f.inline ? '<a class="btn btn-ghost btn-small" href="/api/staff-files/' + f.id + '/file" target="_blank" rel="noopener">' + icon("eye") + "View</a>" : "") +
                    '<a class="btn btn-ghost btn-small" href="/api/staff-files/' + f.id + '/file?download">' + icon("download") + "</a>" +
                    (d.canManage ? '<button type="button" class="btn btn-ghost btn-small" data-sf-share="' + (f.shared ? "0" : "1") + '">' + (f.shared ? "Hide from them" : "Show to them") + "</button>" +
                        '<button type="button" class="btn btn-ghost btn-small danger-text" data-sf-del aria-label="Delete">' + icon("trash") + "</button>" : "") + "</div></div>";
            }).join("") + "</div>" : '<p class="muted small">' + (own ? "HR hasn’t added any documents for you yet. Your contract and other personal documents will appear here." : "No documents for " + esc(d.person.displayName) + " yet.") + "</p>") +
            "</section>";
        root.innerHTML =
            '<div class="page-head"><div><h1>Staff documents</h1><p class="muted">' + (d.canManage ? "Private documents for each member of staff, such as contracts and right-to-work checks. Only HR and the person can see them." : "Your contract and other personal documents. Only you and HR can see these.") + "</p></div></div>" +
            (d.canManage ? '<div class="sf-layout"><aside class="panel sf-people"><label class="search">' + icon("search") + '<input type="search" id="sf-search" placeholder="Find someone" aria-label="Find someone"></label><div class="sf-people-list" id="sf-people"></div></aside>' + list + "</div>" : list);

        function drawPeople() {
            const q = ($("#sf-search").value || "").trim().toLowerCase();
            $("#sf-people").innerHTML = d.people.filter(function (p) { return !q || (p.displayName + " " + p.jobTitle).toLowerCase().indexOf(q) !== -1; }).map(function (p) {
                return '<button type="button" class="sf-person' + (p.id === d.person.id ? " active" : "") + '" data-sf-person="' + p.id + '">' + avatar(p, "sm") +
                    '<span class="mr-text"><span class="emp-name">' + esc(p.displayName) + '</span><span class="muted small">' + esc(p.jobTitle) + "</span></span>" +
                    (p.count ? '<span class="tab-count">' + p.count + "</span>" : "") + "</button>";
            }).join("");
        }
        if (d.canManage) {
            drawPeople();
            $("#sf-search").addEventListener("input", drawPeople);
        }
        root.addEventListener("click", async function (e) {
            const p = e.target.closest("[data-sf-person]");
            if (p) { state.staffFilesPerson = p.dataset.sfPerson; return render(); }
            if (e.target.closest("#sf-upload")) return openStaffUpload(d);
            const row = e.target.closest("[data-file]");
            if (!row) return;
            const id = row.dataset.file;
            try {
                const share = e.target.closest("[data-sf-share]");
                if (share) {
                    await api("/api/staff-files/" + id, { shared: share.dataset.sfShare === "1" });
                    toast(share.dataset.sfShare === "1" ? "They can now see it." : "Now only HR can see it.");
                    return render();
                }
                if (e.target.closest("[data-sf-del]")) {
                    if (!(await confirmDialog({ title: "Delete this document?", message: "It will be removed for good.", confirmLabel: "Delete", danger: true }))) return;
                    await api("/api/staff-files/" + id + "/delete", {});
                    toast("Document deleted.");
                    render();
                }
            } catch (err) { toast(err.message); }
        });
    }

    function openStaffUpload(d) {
        const m = openModal(
            '<h2 class="modal-title">Upload a document for ' + esc(d.person.displayName) + "</h2>" +
            '<form id="sfu-form" novalidate><label for="sfu-file">File</label><input type="file" id="sfu-file">' +
            '<div class="grid-2"><div><label for="sfu-title">Title</label><input type="text" id="sfu-title" maxlength="150" placeholder="e.g. Employment contract"></div>' +
            '<div><label for="sfu-cat">Type</label><select id="sfu-cat">' + d.categories.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + "</select></div></div>" +
            '<label for="sfu-note">Note <span class="muted small">(optional)</span></label><input type="text" id="sfu-note" maxlength="500">' +
            '<label class="inline-check option-row"><input type="checkbox" id="sfu-shared" checked> Let ' + esc(d.person.displayName) + " see this document</label>" +
            '<div class="progress" id="sfu-progress" hidden><span></span></div>' +
            '<div class="form-error" id="sfu-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">' + icon("upload") + "Upload</button></div></form>"
        );
        $("#sfu-file", m.el).addEventListener("change", function (e) {
            const f = e.target.files[0];
            if (f && !$("#sfu-title", m.el).value) $("#sfu-title", m.el).value = f.name.replace(/\.[^.]+$/, "");
        });
        $("#sfu-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            const file = $("#sfu-file", m.el).files[0];
            if (!file) return formError($("#sfu-error", m.el), "Choose a file.");
            $("#sfu-progress", m.el).hidden = false;
            try {
                await uploadFile("/api/staff-files/upload", file, {
                    personId: d.person.id, title: $("#sfu-title", m.el).value, category: $("#sfu-cat", m.el).value,
                    note: $("#sfu-note", m.el).value, shared: $("#sfu-shared", m.el).checked,
                }, function (pct) { $("#sfu-progress span", m.el).style.width = pct + "%"; });
                closeModal();
                toast("Document uploaded.");
                render();
            } catch (err) { formError($("#sfu-error", m.el), err.message); $("#sfu-progress", m.el).hidden = true; }
        });
    }

    // ================= Service status =================

    let statusTimer = null;

    async function viewStatus(root, current) {
        clearInterval(statusTimer);
        const d = await api("/api/status");
        if (!current()) return;
        const down = d.monitors.filter(function (x) { return x.state === "down"; });
        root.innerHTML =
            '<div class="page-head"><div><h1>Service status</h1><p class="muted">Our websites and services, checked automatically every few minutes.</p></div>' +
            (d.canManage ? '<div class="page-actions"><button type="button" class="btn btn-primary" id="st-add">' + icon("plus") + "Add a website</button></div>" : "") + "</div>" +
            '<section class="status-hero ' + (!d.monitors.length ? "sh-empty" : down.length ? "sh-down" : "sh-up") + '"><span class="sh-icon">' + icon(down.length ? "alert" : "check") + "</span><div>" +
            "<h2>" + (!d.monitors.length ? "Nothing monitored yet" : down.length ? down.length + (down.length === 1 ? " service is down" : " services are down") : "All systems operational") + "</h2>" +
            '<p>' + (down.length ? esc(down.map(function (x) { return x.name; }).join(", ")) + ". The IT team has been alerted on their home page." : d.monitors.length ? "Everything we monitor is up and responding." : (d.canManage ? "Add the websites you want to keep an eye on." : "The IT team hasn’t added anything yet.")) + "</p></div></section>" +
            '<div class="monitor-list">' + d.monitors.map(function (x) {
                return '<article class="monitor m-' + x.state + '" data-mon="' + x.id + '">' +
                    '<div class="mon-head"><span class="mon-dot"></span><div class="mon-name"><strong>' + esc(x.name) + (x.announce ? ' <span class="badge badge-soft" title="Everyone sees a banner while it\u2019s down">Banner for all staff</span>' : "") + '</strong><a class="muted small" href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">' + esc(x.url.replace(/^https?:\/\//, "").replace(/\/$/, "")) + "</a></div>" +
                    '<span class="mon-state">' + (x.state === "up" ? "Up" : x.state === "down" ? "Down" : "Checking…") + "</span></div>" +
                    '<div class="mon-bar" aria-label="Last 24 hours">' + x.timeline.map(function (b) { return '<span class="mb-' + b + '"></span>'; }).join("") + "</div>" +
                    '<div class="mon-bar-labels"><span>24 hours ago</span><span>Now</span></div>' +
                    '<div class="mon-stats">' +
                    "<div><span>Uptime (24h)</span><strong>" + (x.uptime24h === null ? "–" : x.uptime24h + "%") + "</strong></div>" +
                    "<div><span>Uptime (7 days)</span><strong>" + (x.uptime7d === null ? "–" : x.uptime7d + "%") + "</strong></div>" +
                    "<div><span>Response time</span><strong>" + (x.avgMs === null ? "–" : x.avgMs + " ms") + "</strong></div>" +
                    "<div><span>" + (x.state === "down" ? "Down since" : "Up since") + "</span><strong>" + (x.since ? esc(timeAgo(x.since).replace(" ago", "")) : "–") + "</strong></div>" +
                    "</div>" +
                    (x.state === "down" && x.last ? '<p class="mon-error">' + icon("alert") + esc(x.last.error || "Responded with status " + x.last.status) + "</p>" : "") +
                    (d.canManage ? '<div class="mon-actions"><span class="muted small">Checked ' + (x.last ? esc(timeAgo(x.last.at)) : "not yet") + " · every " + x.intervalMin + " min</span>" +
                        '<span class="btn-row"><button type="button" class="btn btn-ghost btn-small" data-mon-act="check">' + icon("refresh") + "Check now</button>" +
                        '<button type="button" class="btn btn-ghost btn-small" data-mon-act="edit">' + icon("edit") + "</button>" +
                        (x.self ? "" : '<button type="button" class="btn btn-ghost btn-small danger-text" data-mon-act="delete" aria-label="Delete">' + icon("trash") + "</button>") + "</span></div>" : "") +
                    "</article>";
            }).join("") + "</div>";

        root.addEventListener("click", async function (e) {
            if (e.target.closest("#st-add")) return openMonitorForm(null);
            const act = e.target.closest("[data-mon-act]");
            if (!act) return;
            const id = act.closest("[data-mon]").dataset.mon;
            const mon = d.monitors.find(function (x) { return x.id === id; });
            try {
                if (act.dataset.monAct === "edit") return openMonitorForm(mon);
                if (act.dataset.monAct === "delete") {
                    if (!(await confirmDialog({ title: "Stop monitoring " + mon.name + "?", message: "Its history will be deleted.", confirmLabel: "Delete", danger: true }))) return;
                    await api("/api/status/monitors/" + id + "/delete", {});
                    toast("Removed.");
                } else {
                    act.disabled = true;
                    const r = await api("/api/status/monitors/" + id + "/check", {});
                    toast(r.monitor.name + " is " + (r.monitor.state === "up" ? "up (" + r.monitor.last.ms + " ms)." : "down."));
                }
                render();
            } catch (err) { toast(err.message); }
        });
        // Keep it fresh while the page is open.
        statusTimer = setInterval(function () {
            if (window.location.pathname !== "/status") return clearInterval(statusTimer);
            if (!$(".modal-backdrop") && !document.hidden) render();
        }, 60000);
    }

    function openMonitorForm(mon) {
        const m = openModal(
            '<h2 class="modal-title">' + (mon ? "Edit " + esc(mon.name) : "Add a website") + "</h2>" +
            '<form id="mon-form" novalidate><label for="mon-name">Name</label><input type="text" id="mon-name" maxlength="80" value="' + esc(mon ? mon.name : "") + '" placeholder="e.g. Horizon Network website">' +
            '<label for="mon-url">Address</label><input type="text" id="mon-url" value="' + esc(mon ? mon.url : "https://") + '" placeholder="https://horizon-network.co.uk"' + (mon && mon.self ? " readonly" : "") + ">" +
            '<label for="mon-int">Check every</label><select id="mon-int">' + [1, 5, 10, 15, 30, 60].map(function (n) {
                return '<option value="' + n + '"' + ((mon ? mon.intervalMin : 5) === n ? " selected" : "") + ">" + (n === 60 ? "hour" : n + (n === 1 ? " minute" : " minutes")) + "</option>";
            }).join("") + "</select>" +
            '<p class="hint">It counts as up if it responds within 10 seconds without an error. After two failed checks in a row, IT gets a notification and a banner, and again when it\u2019s back up.</p>' +
            '<label class="inline-check"><input type="checkbox" id="mon-announce"' + (mon && mon.announce ? " checked" : "") + "> Show a banner to all staff while it\u2019s down (for services everyone uses)</label>" +
            '<div class="form-error" id="mon-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">' + (mon ? "Save" : "Add and check") + "</button></div></form>"
        );
        $("#mon-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                const r = await api("/api/status/monitors" + (mon ? "/" + mon.id : ""), { name: $("#mon-name", m.el).value, url: $("#mon-url", m.el).value, intervalMin: $("#mon-int", m.el).value, announce: $("#mon-announce", m.el).checked });
                closeModal();
                toast(mon ? "Saved." : r.monitor.name + " added: " + (r.monitor.state === "up" ? "it’s up." : "it’s not responding."));
                render();
            } catch (err) { formError($("#mon-error", m.el), err.message); }
        });
    }

    // ================= Settings =================

    async function refreshMe() {
        state.me = (await api("/api/me")).user;
        renderChrome();
    }

    function gifDataUrl(file) {
        if (file.size > 1.4 * 1024 * 1024) return Promise.reject(new Error("That GIF is too large (max 1.4 MB)."));
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(new Error("That GIF couldn't be read.")); };
            reader.readAsDataURL(file);
        });
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

    // Crops an image to a 3:1 banner, 1500 pixels wide.
    async function resizeBanner(file) {
        const url = URL.createObjectURL(file);
        try {
            const img = new Image();
            img.src = url;
            await img.decode();
            const w = 1500, h = 500;
            const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
            const sw = w / scale, sh = h / scale;
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
            return canvas.toDataURL("image/jpeg", 0.85);
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
            '<input type="file" id="avatar-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>' +
            '<p class="hint">JPG, PNG, WebP or an animated GIF (up to 1.4 MB). Your picture is shown as a circle, so square images work best.</p></div></div></section>' +

            '<section class="panel span-2"><h2 class="panel-title">Profile banner</h2>' +
            '<p class="muted small">Shown at the top of your profile and on your card in the Staff Directory.</p>' +
            '<div class="banner-preview">' + bannerHtml(me, "bp-cover", "div") + '<div class="bp-avatar">' + avatar(me, "lg") + "</div></div>" +
            '<div class="banner-presets" role="radiogroup" aria-label="Banner style">' + BANNER_PRESETS.map(function (b) {
                const on = me.banner && me.banner.preset === b.key;
                return '<button type="button" class="banner-swatch banner-' + b.key + (on ? " active" : "") + '" data-preset="' + b.key + '" role="radio" aria-checked="' + on + '" title="' + b.name + '"><span>' + b.name + "</span></button>";
            }).join("") + "</div>" +
            '<div class="btn-row banner-actions"><label class="btn btn-ghost" for="banner-file">' + icon("camera") + "Upload your own image</label>" +
            (me.banner ? '<button type="button" class="btn btn-ghost" id="banner-remove">Use the default</button>' : "") + "</div>" +
            '<input type="file" id="banner-file" accept="image/png,image/jpeg,image/webp" hidden>' +
            '<p class="hint">Wide images work best (about 1500 \u00d7 500). Your image will be cropped to fit.</p></section>' +

            '<section class="panel"><h2 class="panel-title">Basic information</h2>' +
            '<form id="profile-form" novalidate>' +
            '<label for="p-display">Display name</label><input type="text" id="p-display" maxlength="80" value="' + esc(me.displayName) + '">' +
            '<label for="p-phone">Phone</label><input type="tel" id="p-phone" maxlength="40" value="' + esc(me.phone) + '">' +
            '<div class="grid-2"><div><label for="p-location">Location</label><input type="text" id="p-location" maxlength="80" value="' + esc(me.location) + '" placeholder="e.g. Manchester, UK"></div>' +
            '<div><label for="p-tz">Time zone</label><select id="p-tz">' + timezoneOptions(me.timezone || state.meta.defaultTimezone) + "</select></div></div>" +
            '<label for="p-skills">Skills</label><input type="text" id="p-skills" maxlength="400" value="' + esc((me.skills || []).join(", ")) + '" placeholder="e.g. Photoshop, Excel, first aid">' +
            '<label for="p-langs">Languages</label><input type="text" id="p-langs" maxlength="300" value="' + esc((me.languages || []).join(", ")) + '" placeholder="e.g. English, Polish, BSL">' +
            '<p class="muted small">Separate with commas. Colleagues can search the directory by these.</p>' +
            '<label for="p-bio">About me <span class="muted small">(optional)</span></label>' +
            '<textarea id="p-bio" rows="4" maxlength="600" placeholder="A short introduction: what you do, what you\u2019re working on, something about you.">' + esc(me.bio || "") + "</textarea>" +
            '<p class="muted small"><span id="p-bio-count">' + (me.bio || "").length + "</span>/600 \u00b7 Shown on your staff profile.</p>" +
            (me.onNetworkSite ? '<label class="inline-check"><input type="checkbox" id="p-bio-public"' + (me.bioPublic ? " checked" : "") + "> Also show my About me on the Horizon Network website, where you\u2019re listed as part of the leadership team</label>" : "") +
            '<p class="hint">Your location and time zone are shown on your home page and in the staff directory.</p>' +
            (me.system ? "" :
                '<div class="grid-2"><div><label for="p-bday">Birthday <span class="muted small">(optional)</span></label><select id="p-bday"><option value="">Day</option>' +
                Array.from({ length: 31 }, function (_, i) { return '<option value="' + (i + 1) + '"' + (me.myBirthday && me.myBirthday.day === i + 1 ? " selected" : "") + ">" + (i + 1) + "</option>"; }).join("") + "</select></div>" +
                '<div><label class="label-spacer" aria-hidden="true">&nbsp;</label><select id="p-bmonth" aria-label="Birthday month"><option value="">Month</option>' +
                MONTHS.map(function (mn, i) { return '<option value="' + (i + 1) + '"' + (me.myBirthday && me.myBirthday.month === i + 1 ? " selected" : "") + ">" + mn + "</option>"; }).join("") + "</select></div></div>" +
                '<label class="inline-check option-row"><input type="checkbox" id="p-bshow"' + (!me.myBirthday || me.myBirthday.show ? " checked" : "") + "> Show my birthday to colleagues (on the calendar and my profile). The year is never asked for.</label>") +
            '<div class="form-error" id="p-error" hidden></div>' +
            '<div class="form-actions"><button type="submit" class="btn btn-primary" id="p-save">Save changes</button></div>' +
            "</form></section>" +

            '<section class="panel span-2"><h2 class="panel-title">Employment details</h2>' +
            '<dl class="facts">' +
            (me.system ? "" : "<dt>Full name</dt><dd>" + esc(me.firstName + " " + me.lastName) + "</dd><dt>Display name</dt><dd>" + esc(me.displayName) + "</dd>") +
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
            '<p class="hint">At least ' + (me.passwordMinLength || 8) + ' characters. Avoid common passwords and your name: three random words work well.</p>' +
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
            "</form></section>" +
            '<section class="panel narrow-panel" id="my-sessions"><p class="muted small">Loading\u2026</p></section>' +
            '<section class="panel narrow-panel" id="my-logins"><p class="muted small">Loading\u2026</p></section>' +
            '<section class="panel narrow-panel"><h2 class="panel-title">' + icon("download") + "Your data</h2>" +
            '<p class="muted small">Download a copy of the personal data the portal holds about you: your profile, leave, payslips, expenses, timesheets, training, goals, messages and more, as a JSON file.</p>' +
            (me.impersonatedBy ? '<p class="muted small">You can\'t download someone else\'s data while logged in as them.</p>' : '<a class="btn btn-ghost" href="/api/me/export" download id="my-export">' + icon("download") + "Download my data</a>") +
            "</section></div>" +

            "</div></div>";

        loadMySessions($("#my-sessions"));
        loadMyLogins($("#my-logins"));
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

        async function saveBanner(body, message) {
            try {
                state.me = (await api(body ? "/api/me/banner" : "/api/me/banner/remove", body || {})).user;
                renderChrome();
                viewSettings(root);
                toast(message);
            } catch (err) { toast(err.message); }
        }
        $(".banner-presets").addEventListener("click", function (e) {
            const b = e.target.closest("[data-preset]");
            if (b) saveBanner({ preset: b.dataset.preset }, "Banner updated.");
        });
        $("#banner-file").addEventListener("change", async function (e) {
            const file = e.target.files[0];
            if (!file) return;
            try {
                saveBanner({ image: await resizeBanner(file) }, "Banner updated.");
            } catch (err) {
                toast("That image couldn\u2019t be read. Try a JPG or PNG.");
            }
        });
        if ($("#banner-remove")) $("#banner-remove").addEventListener("click", function () { saveBanner(null, "Banner reset to the default."); });

        $("#avatar-file").addEventListener("change", async function (e) {
            const file = e.target.files[0];
            if (!file) return;
            try {
                // GIFs are sent unchanged so the animation is kept; other photos are cropped and resized.
                const image = file.type === "image/gif" ? await gifDataUrl(file) : await resizeImage(file);
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

        $("#p-bio").addEventListener("input", function () { $("#p-bio-count").textContent = $("#p-bio").value.length; });
        $("#profile-form").addEventListener("submit", async function (e) {
            e.preventDefault();
            formError($("#p-error"), "");
            $("#p-save").disabled = true;
            try {
                const bday = $("#p-bday") ? { birthdayDay: $("#p-bday").value, birthdayMonth: $("#p-bmonth").value, showBirthday: $("#p-bshow").checked } : {};
                if (bday.birthdayDay && !bday.birthdayMonth || !bday.birthdayDay && bday.birthdayMonth) throw new Error("Choose both the day and month of your birthday.");
                state.me = (await api("/api/me/profile", Object.assign(bday, {
                    displayName: $("#p-display").value,
                    phone: $("#p-phone").value,
                    location: $("#p-location").value,
                    timezone: $("#p-tz").value,
                    skills: $("#p-skills").value,
                    languages: $("#p-langs").value,
                    bio: $("#p-bio").value,
                    bioPublic: $("#p-bio-public") ? $("#p-bio-public").checked : undefined,
                }))).user;
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
            if (next.length < (state.me.passwordMinLength || 8)) return formError(err, "New password must be at least " + (state.me.passwordMinLength || 8) + " characters.");
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
            '<p class="muted">System Admin is only available to the system owner and people with the System Admin permission.</p>' +
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
        "sign-in-google": ["signed in with Google (PIN next)", "signin"],
        "sign-in-google-unknown": ["tried to sign in with a Google account that isn't connected", "signin"],
        "sign-in-google-mismatch": ["tried to sign in with Google, but its email no longer matches", "signin"],
        "google-connected": ["turned on Sign in with Google", "accounts"],
        "google-disconnected": ["turned off Sign in with Google", "accounts"],
        "login-created": ["created a sign-in account for", "accounts"],
        "login-updated": ["changed the sign-in account", "accounts"],
        "login-deleted": ["deleted the sign-in account", "accounts"],
        "profile-chosen": ["signed in as their profile at", "sign-ins"],
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
        "banner-updated": ["changed their profile banner", "profiles"],
        "banner-removed": ["reset their profile banner", "profiles"],
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
        "signed-out-refresh": ["was signed out after reloading the page", "signin"],
        "own-sessions-ended": ["signed out their other sessions", "signin"],
        "status-changed": ["changed their status", "profiles"],
        "announcement-commented": ["commented on", "workplace"],
        "announcement-comment-deleted": ["deleted a comment on", "workplace"],
        "announcement-acknowledged": ["acknowledged the announcement", "workplace"],
        "event-added": ["added the event", "calendar"],
        "event-updated": ["edited the event", "calendar"],
        "event-deleted": ["deleted the event", "calendar"],
        "poll-created": ["created the poll", "polls"],
        "poll-updated": ["edited the poll", "polls"],
        "poll-answered": ["answered the poll", "polls"],
        "poll-closed": ["closed the poll", "polls"],
        "poll-reopened": ["reopened the poll", "polls"],
        "poll-deleted": ["deleted the poll", "polls"],
        "onboarding-started": ["started onboarding for", "staff"],
        "onboarding-task-done": ["ticked off an onboarding task for", "staff"],
        "onboarding-task-undone": ["unticked an onboarding task for", "staff"],
        "onboarding-removed": ["removed the onboarding checklist for", "staff"],
        "onboarding-template-added": ["created the onboarding checklist", "staff"],
        "onboarding-template-updated": ["edited the onboarding checklist", "staff"],
        "onboarding-template-deleted": ["deleted the onboarding checklist", "staff"],
        "role-created": ["created the role", "access"],
        "role-updated": ["changed the permissions of", "access"],
        "role-deleted": ["deleted the role", "access"],
        "role-members-changed": ["changed who has the role", "access"],
        "backup-created": ["created a backup", "system"],
        "backup-downloaded": ["downloaded the backup", "system"],
        "backup-deleted": ["deleted the backup", "system"],
        "backup-restored": ["restored the backup", "system"],
        "backup-failed": ["\u2014 the nightly backup failed", "system"],
        "leave-requested": ["requested leave", "leave"],
        "absence-reported": ["reported an absence", "leave"],
        "leave-approved": ["approved leave for", "leave"],
        "leave-declined": ["declined leave for", "leave"],
        "leave-cancelled": ["cancelled leave for", "leave"],
        "leave-allowance-changed": ["changed the holiday allowance", "leave"],
        "shift-added": ["added a shift for", "rotas"],
        "shift-updated": ["changed a shift for", "rotas"],
        "shift-deleted": ["deleted a shift for", "rotas"],
        "rota-copied": ["copied the rota", "rotas"],
        "timesheet-submitted": ["submitted a timesheet", "rotas"],
        "timesheet-approved": ["approved the timesheet of", "rotas"],
        "timesheet-rejected": ["sent back the timesheet of", "rotas"],
        "pay-details-updated": ["updated the pay details of", "payroll"],
        "payroll-drafted": ["made draft payslips", "payroll"],
        "payslip-edited": ["edited the payslip of", "payroll"],
        "payslip-issued": ["issued payslips", "payroll"],
        "payslip-withdrawn": ["withdrew the payslip of", "payroll"],
        "payslip-deleted": ["deleted the payslip of", "payroll"],
        "payslip-viewed": ["viewed their payslip", "payroll"],
        "funds-added": ["added funds to the main balance", "payroll"],
        "funds-removed": ["removed funds from the main balance", "payroll"],
        "funds-transferred": ["moved money to the payroll fund", "payroll"],
        "funds-returned": ["moved money back to the main balance", "payroll"],
        "funds-statement": ["produced a funds statement for", "payroll"],
        "ticket-raised": ["raised IT ticket", "helpdesk"],
        "probation-updated": ["updated the probation of", "staff"],
        "review-added": ["added a review for", "staff"],
        "review-deleted": ["deleted a review for", "staff"],
        "review-shared": ["shared a review with", "staff"],
        "review-unshared": ["made a review private for", "staff"],
        "return-to-work-completed": ["completed a return-to-work form for", "leave"],
        "leaving-started": ["started the leaving process for", "staff"],
        "staff-file-uploaded": ["uploaded a staff document for", "staff"],
        "staff-file-updated": ["changed a staff document for", "staff"],
        "staff-file-deleted": ["deleted a staff document for", "staff"],
        "staff-file-opened": ["opened a staff document for", "staff"],
        "monitor-added": ["started monitoring", "helpdesk"],
        "monitor-updated": ["changed the monitor for", "helpdesk"],
        "monitor-deleted": ["stopped monitoring", "helpdesk"],
        "ticket-replied": ["replied to IT ticket", "helpdesk"],
        "ticket-note-added": ["added an internal note to IT ticket", "helpdesk"],
        "ticket-updated": ["updated IT ticket", "helpdesk"],
        "ticket-raised": ["raised IT ticket", "helpdesk"],
        "expense-claimed": ["claimed expenses", "payroll"],
        "expense-approved": ["approved an expense claim from", "payroll"],
        "expense-rejected": ["rejected an expense claim from", "payroll"],
        "expense-paid": ["repaid expenses to", "payroll"],
        "expense-withdrawn": ["withdrew an expense claim for", "payroll"],
        "funds-category-changed": ["changed the spending categories", "payroll"],
        "budget-set": ["set the monthly budget for", "payroll"],
        "pay-change-scheduled": ["scheduled a pay change for", "payroll"],
        "pay-change-deleted": ["removed a scheduled pay change for", "payroll"],
        "payroll-exported": ["exported the payroll for", "payroll"],
        "invoice-created": ["created invoice", "payroll"],
        "invoice-updated": ["edited invoice", "payroll"],
        "invoice-sent": ["marked as sent: invoice", "payroll"],
        "invoice-paid": ["marked as paid: invoice", "payroll"],
        "invoice-void": ["voided invoice", "payroll"],
        "invoice-deleted": ["deleted invoice", "payroll"],
        "invoice-settings-changed": ["changed the invoice settings", "payroll"],
        "leave-settings-changed": ["changed the leave clash warning", "leave"],
        "shutdown-booked": ["booked company shutdown days:", "leave"],
        "shutdown-cancelled": ["cancelled the shutdown", "leave"],
        "toil-added": ["added time off in lieu for", "leave"],
        "training-added": ["added training for", "staff"],
        "training-updated": ["updated training for", "staff"],
        "training-deleted": ["deleted training for", "staff"],
        "training-required-added": ["made this training required:", "staff"],
        "case-opened": ["opened HR case", "cases"],
        "case-viewed": ["viewed HR case", "cases"],
        "case-updated": ["updated HR case", "cases"],
        "case-entry": ["added to the timeline of HR case", "cases"],
        "case-close": ["closed HR case", "cases"],
        "case-reopen": ["reopened HR case", "cases"],
        "case-deleted": ["deleted HR case", "cases"],
        "case-file-added": ["attached a file to HR case", "cases"],
        "case-file-opened": ["opened a file in HR case", "cases"],
        "vacancy-posted": ["posted the vacancy", "staff"],
        "vacancy-updated": ["updated the vacancy", "staff"],
        "vacancy-deleted": ["deleted the vacancy", "staff"],
        "job-applied": ["applied for", "staff"],
        "candidate-referred": ["referred a candidate for", "staff"],
        "candidate-hired": ["hired", "staff"],
        "applicant-stage": ["moved an applicant:", "staff"],
        "applicant-note": ["added a note about applicant", "staff"],
        "applicant-delete": ["removed applicant", "staff"],
        "kudos-given": ["gave kudos to", "workplace"],
        "kudos-deleted": ["deleted a kudos post", "workplace"],
        "idea-posted": ["shared the idea", "workplace"],
        "idea-status-changed": ["updated the idea", "workplace"],
        "idea-deleted": ["deleted the idea", "workplace"],
        "report-viewed": ["viewed the activity report for", "system"],
        "backup-uploaded": ["uploaded the backup", "system"],
        "maintenance-on": ["turned maintenance mode on", "system"],
        "maintenance-off": ["turned maintenance mode off", "system"],
        "sign-in-maintenance": ["tried to sign in during maintenance", "signin"],
        "maintenance-pin-failed": ["entered a wrong maintenance PIN", "system"],
        "service-down": ["\u2014 a service went down:", "helpdesk"],
        "service-up": ["\u2014 a service came back up:", "helpdesk"],
        "bill-added": ["added the bill", "payroll"],
        "bill-updated": ["changed the bill", "payroll"],
        "bill-paid": ["paid the bill", "payroll"],
        "bill-deleted": ["deleted the bill", "payroll"],
        "payroll-approved": ["approved payroll for", "payroll"],
        "payroll-settings-changed": ["changed the payroll settings", "payroll"],
        "pay-extra-deleted": ["removed a bonus or commission for", "payroll"],
        "salary-band-changed": ["changed the salary band", "payroll"],
        "work-pattern-changed": ["changed the working pattern for", "staff"],
        "objective-set": ["set a goal for", "staff"],
        "feedback-requested": ["asked for 360 feedback on", "staff"],
        "feedback-given": ["gave 360 feedback", "staff"],
        "pulse-question-set": ["set the pulse question", "workplace"],
        "exit-interview-sent": ["sent an exit interview to", "staff"],
        "flexible-requested": ["asked for flexible working", "staff"],
        "flexible-decided": ["decided a flexible working request for", "staff"],
        "question-asked": ["asked the question", "workplace"],
        "wiki-page-created": ["created the knowledge base page", "workplace"],
        "wiki-page-deleted": ["deleted the knowledge base page", "workplace"],
        "wiki-page-edited": ["edited the knowledge base page", "workplace"],
        "wiki-page-restored": ["restored an old version of the knowledge base page", "workplace"],
        "mentoring-requested": ["set up mentoring with", "staff"],
        "sign-in-reported": ["reported a sign-in they don\u2019t recognise", "signin"],
        "data-exported": ["downloaded their data", "accounts"],
        "password-rules-changed": ["changed the password rules", "system"],
        "retention-changed": ["changed the data retention settings", "system"],
        "retention-run": ["ran the data retention clean-up", "system"],
        "retention-cleanup": ["\u2014 old data was deleted:", "system"],
        "leaver-record-deleted": ["\u2014 a leaver\u2019s record was deleted:", "system"],
        "website-enquiry": ["sent a message from the website:", "workplace"],
        "website-application": ["applied on the website for", "staff"],
        "enquiry-updated": ["updated the website enquiry from", "workplace"],
        "enquiry-deleted": ["deleted the website enquiry from", "workplace"],
        "oncall-rota-created": ["created the on-call rota", "helpdesk"],
        "oncall-rota-changed": ["changed the on-call rota", "helpdesk"],
    };
    const AUDIT_FILTERS = [
        ["", "All activity"],
        ["signin", "Sign-ins"],
        ["accounts", "Logins & passwords"],
        ["staff", "Staff records"],
        ["profiles", "Profiles"],
        ["workplace", "Announcements & documents"],
        ["calendar", "Calendar"],
        ["polls", "Polls & surveys"],
        ["access", "Roles & permissions"],
        ["leave", "Leave & absence"],
        ["rotas", "Rotas & timesheets"],
        ["payroll", "Payroll & funds"],
        ["helpdesk", "IT Helpdesk"],
        ["cases", "HR cases"],
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
            '<div class="page-head"><div><h1>System Admin</h1><p class="muted">Sessions, user access, backups, security and a full activity log for the whole portal.</p></div>' +
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
                    '<td class="col-actions">' + (s.current || s.protected ? "" : '<button type="button" class="btn btn-ghost btn-small" data-end="' + s.id + '">End</button>') + "</td></tr>";
            }).join("") + "</tbody></table></div></section>" +

            '<section class="panel sys-section"><div class="panel-head"><h2 class="panel-title">' + icon("login") + "Log in as</h2></div>" +
            '<p class="muted small">Open the portal as another user without their password. You\'ll see a banner the whole time, and can return to your own account from it.</p>' +
            (state.me.maintenance && state.me.maintenance.on ? '<div class="banner banner-warn">' + icon("lock") + "<div><strong>Turned off during maintenance mode.</strong> Turn maintenance mode off to log in as someone.</div></div>" : "") +
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

            '<section class="panel sys-section" id="sys-security"></section>' +
            '<section class="panel sys-section" id="sys-maint"></section>' +
            '<section class="panel sys-section" id="sys-backups"></section>' +

            (data.isOwner ? '<section class="panel sys-section sys-pin"><h2 class="panel-title">' + icon("key") + "Change System Admin PIN</h2>" +
            '<form id="sys-pin-form" novalidate>' +
            '<div class="grid-2"><div><label for="sp-current">Current PIN</label><input type="password" id="sp-current" inputmode="numeric" maxlength="8" autocomplete="off"></div>' +
            '<div><label for="sp-new">New PIN</label><input type="password" id="sp-new" inputmode="numeric" maxlength="8" autocomplete="off"></div></div>' +
            '<p class="hint">4 to 8 digits.</p><div class="form-error" id="sp-error" hidden></div>' +
            '<div class="form-actions"><button type="submit" class="btn btn-primary">Update PIN</button></div></form></section>' : "") +

            "";

        mountBackups($("#sys-backups"));
        mountMaintenance($("#sys-maint"));
        mountSecurityAdmin($("#sys-security"));

        function drawUsers() {
            const q = $("#sys-user-search").value.trim().toLowerCase();
            const list = data.users.filter(function (u) {
                return !q || [u.displayName, u.username, u.jobTitle, u.company].join(" ").toLowerCase().indexOf(q) !== -1;
            });
            $("#sys-users").innerHTML = list.length ? list.map(function (u) {
                const can = u.account === "active";
                return '<div class="user-pick-row"><div class="emp-cell">' + avatar(u, "sm") + '<div><div class="emp-name">' + esc(u.displayName) +
                    (u.system ? ' <span class="badge">System account</span>' : "") + '</div><div class="muted small">' + esc(u.username || "No email") + " · " + esc(u.jobTitle) + "</div></div></div>" +
                    (u.protected ? '<span class="muted small">' + icon("lock") + "System owner</span>"
                        : can ? '<button type="button" class="btn btn-ghost btn-small" data-as="' + u.id + '">' + icon("login") + "Log in as</button>"
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

        if ($("#sys-pin-form")) $("#sys-pin-form").addEventListener("submit", async function (e) {
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
            '<p class="muted center">' + esc(me.displayName || me.firstName) + ", the portal now asks for a personal 6-digit code as well as your password each time you sign in. Choose one you\u2019ll remember.</p>" +
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
            '<h1 class="center">Welcome, ' + esc(me.displayName || me.firstName) + "</h1>" +
            '<p class="muted center">' + (me.passwordTemporary ? "You signed in with a temporary password. Create your own password to continue." : "Your password has expired. Choose a new one to continue.") + "</p>" +
            '<form id="force-form" novalidate>' +
            '<label for="fp-new">New password</label><input type="password" id="fp-new" autocomplete="new-password" autofocus>' +
            '<label for="fp-confirm">Confirm new password</label><input type="password" id="fp-confirm" autocomplete="new-password">' +
            '<p class="hint">At least ' + (me.passwordMinLength || 8) + ' characters. Avoid common passwords and your name: three random words work well.</p>' +
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
            if (next.length < (me.passwordMinLength || 8)) return formError(err, "Password must be at least " + (me.passwordMinLength || 8) + " characters.");
            if (next !== $("#fp-confirm").value) return formError(err, "Passwords don't match.");
            $("#fp-save").disabled = true;
            const wasTemporary = me.passwordTemporary;
            try {
                state.me = (await api("/api/me/password", { newPassword: next })).user;
                if (state.me.codeSetupRequired) return render();
                if (!state.meta) state.meta = await api("/api/meta");
                renderChrome();
                navigate("/home", true);
                toast(wasTemporary ? "Password set. Welcome to the Staff Portal!" : "Password changed.");
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
            if (!state.me.passwordTemporary && !state.me.passwordExpired && !state.me.codeSetupRequired) state.meta = await api("/api/meta");
        } catch (e) {
            return;
        }
        renderChrome();
        document.body.classList.remove("app-loading");
        render();

        let justSignedIn = false;
        try { justSignedIn = sessionStorage.getItem("hn-just-signed-in") === "1"; sessionStorage.removeItem("hn-just-signed-in"); } catch (e) { /* ignore */ }
        const mainRole = (state.me.roles || []).find(function (r) { return r.main; });
        if (justSignedIn && mainRole && !state.me.system && !state.me.passwordTemporary && !state.me.passwordExpired && !state.me.codeSetupRequired) {
            toast("Signed in as " + mainRole.jobTitle + ", " + mainRole.company);
        }

        // Notice quickly if this session is ended from the system panel.
        setInterval(function () {
            if (document.hidden) return;
            api("/api/me").then(function (d) {
                const was = state.me;
                state.me = d.user;
                if (!!was.impersonatedBy !== !!d.user.impersonatedBy || was.id !== d.user.id) { renderChrome(); render(); return; }
                if (was.unreadAnnouncements !== d.user.unreadAnnouncements || was.pendingAcks !== d.user.pendingAcks || was.notificationsUnread !== d.user.notificationsUnread) {
                    const open = $(".menu:not([hidden])");
                    if (!open) renderChrome();
                }
            }).catch(function () {});
        }, 30000);
    }


    // ================= Expense claims =================

    const EXPENSE_BADGES = { submitted: "badge-yellow", approved: "badge-green", rejected: "badge-red", paid: "badge-soft" };

    async function viewExpenses(root, current) {
        const d = await api("/api/expenses");
        if (!current()) return;
        let tab = state.expenseTab || (d.toApprove.length ? "approve" : "mine");
        const unpaid = d.all.filter(function (c) { return c.canPay; });
        const tabs = [["mine", "My claims", d.mine.length]];
        if (d.toApprove.length || d.canPay) tabs.push(["approve", "To approve", d.toApprove.length]);
        if (d.canPay) tabs.push(["pay", "To repay", unpaid.length], ["all", "All claims", null]);
        if (!tabs.some(function (t) { return t[0] === tab; })) tab = "mine";
        const owed = d.mine.filter(function (c) { return c.status === "approved"; }).reduce(function (n, c) { return n + c.amount; }, 0);
        const waiting = d.mine.filter(function (c) { return c.status === "submitted"; }).reduce(function (n, c) { return n + c.amount; }, 0);

        root.innerHTML =
            '<div class="page-head"><div><h1>Expenses</h1><p class="muted">Claim back money you spent for work. Add a photo or PDF of the receipt. Your supervisor or payroll approves it, then it’s repaid from company funds or with your next payslip.</p></div>' +
            '<div class="page-actions">' + (state.me.system ? "" : '<button type="button" class="btn btn-ghost" id="ex-miles">' + icon("pin") + 'Claim mileage</button><button type="button" class="btn btn-primary" id="ex-new">' + icon("plus") + "New claim</button>") + "</div></div>" +
            (state.me.system ? "" : '<div class="stat-row">' +
                '<div class="stat"><div class="stat-value">' + fmtMoney(waiting) + '</div><div class="stat-label">Waiting for approval</div></div>' +
                '<div class="stat"><div class="stat-value">' + fmtMoney(owed) + '</div><div class="stat-label">Approved, to be repaid</div></div>' +
                '<div class="stat"><div class="stat-value">' + fmtMoney(d.mine.filter(function (c) { return c.status === "paid"; }).reduce(function (n, c) { return n + c.amount; }, 0)) + '</div><div class="stat-label">Repaid so far</div></div></div>') +
            '<div class="company-tabs" id="ex-tabs">' + tabs.map(function (t) {
                return '<button type="button" data-tab="' + t[0] + '">' + esc(t[1]) + (t[2] !== null ? ' <span class="tab-count">' + t[2] + "</span>" : "") + "</button>";
            }).join("") + "</div><div id=\"ex-body\"></div>";

        function row(c, opts) {
            return '<div class="leave-row claim-row" data-id="' + c.id + '">' +
                (opts.person ? avatar(c.person, "md") : '<span class="leave-icon">' + icon("pound") + "</span>") +
                '<div class="lr-main"><div class="lr-title">' + (opts.person ? esc(c.person.displayName) + ' <span class="muted">· ' : "") + esc(c.description) + (opts.person ? "</span>" : "") + "</div>" +
                '<div class="muted small">' + esc(c.category) + " · spent " + esc(fmtDate(c.date + "T12:00:00")) + " · claimed " + esc(fmtDate(c.createdAt)) + "</div>" +
                (c.mileage ? '<span class="claim-receipt">' + icon("pin") + c.mileage.miles + " miles" + (c.mileage.atLower ? " (" + c.mileage.atFull + " at 45p, " + c.mileage.atLower + " at 25p)" : " at 45p") + "</span>" :
                    c.receipt ? '<a class="claim-receipt" href="/api/expenses/' + c.id + '/receipt" target="_blank" rel="noopener">' + icon("file") + esc(c.receipt.fileName) + "</a>" : '<span class="muted small">No receipt</span>') +
                (c.decisionNote ? '<div class="lr-note decision">' + icon("message") + esc(c.decidedByName || "") + ": " + esc(c.decisionNote) + "</div>" : "") +
                "</div>" +
                '<div class="lr-side"><strong class="claim-amt">' + fmtMoney(c.amount) + '</strong><span class="badge ' + (EXPENSE_BADGES[c.status] || "") + '">' + esc(c.statusLabel) + "</span>" +
                (c.canApprove ? '<div class="btn-row"><button type="button" class="btn btn-ghost btn-small" data-ex="reject">Reject</button><button type="button" class="btn btn-primary btn-small" data-ex="approve">' + icon("tick") + "Approve</button></div>" : "") +
                (c.canPay ? '<div class="btn-row"><button type="button" class="btn btn-ghost btn-small" data-ex="payslip">With next payslip</button><button type="button" class="btn btn-primary btn-small" data-ex="direct">' + icon("pound") + "Pay now</button></div>" : "") +
                (c.canCancel && opts.cancel ? '<button type="button" class="btn btn-link btn-small" data-ex="cancel">Withdraw</button>' : "") +
                "</div></div>";
        }

        function list(items, opts, empty) {
            return items.length ? '<div class="panel leave-list">' + items.map(function (c) { return row(c, opts); }).join("") + "</div>"
                : '<div class="empty-page">' + icon("pound", "big") + "<h2>" + empty[0] + '</h2><p class="muted">' + empty[1] + "</p></div>";
        }

        function draw() {
            $$("#ex-tabs [data-tab]").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === tab); });
            const body = $("#ex-body");
            if (tab === "mine") body.innerHTML = list(d.mine, { cancel: true }, ["No claims yet", "Use <strong>New claim</strong> when you’ve paid for something for work."]);
            else if (tab === "approve") body.innerHTML = list(d.toApprove, { person: true }, ["Nothing to approve", "Claims from your team will appear here."]);
            else if (tab === "pay") body.innerHTML = list(unpaid, { person: true }, ["Nothing to repay", "Approved claims waiting to be repaid will appear here."]);
            else body.innerHTML = list(d.all, { person: true, cancel: true }, ["No claims yet", "Claims from everyone will appear here."]);
        }

        root.addEventListener("click", async function (e) {
            const t = e.target.closest("[data-tab]");
            if (t) { tab = state.expenseTab = t.dataset.tab; return draw(); }
            if (e.target.closest("#ex-new")) return openExpenseForm(d);
            if (e.target.closest("#ex-miles")) return openMileageForm();
            const b = e.target.closest("[data-ex]");
            if (!b) return;
            const id = b.closest("[data-id]").dataset.id;
            const act = b.dataset.ex;
            try {
                let body = {};
                let path = act;
                if (act === "reject") {
                    const note = await askNote({ title: "Reject this claim?", label: "Reason", required: true, confirmLabel: "Reject", danger: true });
                    if (note === null) return;
                    body.note = note;
                } else if (act === "cancel") {
                    if (!(await confirmDialog({ title: "Withdraw this claim?", message: "It will be removed, along with its receipt.", confirmLabel: "Withdraw", danger: true }))) return;
                } else if (act === "direct" || act === "payslip") {
                    const c = d.all.find(function (x) { return x.id === id; });
                    if (act === "direct" && !(await confirmDialog({ title: "Pay " + fmtMoney(c.amount) + " now?", message: "It’s taken from the main balance and recorded under " + c.category + ".", confirmLabel: "Pay now" }))) return;
                    path = "pay";
                    body.method = act;
                }
                const r = await api("/api/expenses/" + id + "/" + path, body);
                state.me = r.user;
                renderChrome();
                toast({ approve: "Claim approved.", reject: "Claim rejected.", cancel: "Claim withdrawn.", direct: "Paid from the main balance.", payslip: "It’ll be added to their next payslip." }[act]);
                render();
            } catch (err) { toast(err.message); }
        });
        draw();
    }

    function openExpenseForm(d) {
        let file = null;
        const m = openModal(
            '<h2 class="modal-title">New expense claim</h2>' +
            '<form id="ex-form" novalidate>' +
            '<label for="ex-desc">What was it for?</label><input type="text" id="ex-desc" maxlength="300" placeholder="e.g. Train to the client meeting in Leeds">' +
            '<div class="grid-2"><div><label for="ex-amount">Amount</label><div class="money-input"><span>£</span><input type="text" id="ex-amount" inputmode="decimal" placeholder="0.00"></div></div>' +
            '<div><label for="ex-date">Date paid</label><input type="date" id="ex-date" value="' + isoDay(new Date()) + '" max="' + isoDay(new Date()) + '"></div></div>' +
            '<label for="ex-cat">Category</label><select id="ex-cat">' + d.categories.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + "</select>" +
            '<label>Receipt</label><label class="drop-zone" id="ex-drop"><input type="file" id="ex-file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,image/*,application/pdf" hidden>' +
            icon("upload") + '<span id="ex-file-name">Add a photo or PDF of the receipt</span></label>' +
            '<div class="form-error" id="ex-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Send claim</button></div></form>'
        );
        $("#ex-file", m.el).addEventListener("change", function (e) {
            file = e.target.files[0] || null;
            $("#ex-file-name", m.el).textContent = file ? file.name + " (" + Math.round(file.size / 1024) + " KB)" : "Add a photo or PDF of the receipt";
        });
        $("#ex-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            if (file && file.size > 10 * 1024 * 1024) return formError($("#ex-error", m.el), "Receipts can be up to 10 MB.");
            const meta = {
                description: $("#ex-desc", m.el).value, amount: $("#ex-amount", m.el).value.replace(/[£,\s]/g, ""),
                date: $("#ex-date", m.el).value, category: $("#ex-cat", m.el).value, fileName: file ? file.name : "",
            };
            try {
                const res = await fetch("/api/expenses", {
                    method: "POST",
                    headers: { "Content-Type": "application/octet-stream", "X-Claim": encodeURIComponent(JSON.stringify(meta)) },
                    body: file || new Blob([]),
                });
                const r = await res.json().catch(function () { return {}; });
                if (!res.ok) throw new Error(r.error || "Something went wrong.");
                state.me = r.user;
                renderChrome();
                closeModal();
                toast("Claim sent for approval.");
                state.expenseTab = "mine";
                render();
            } catch (err) { formError($("#ex-error", m.el), err.message); }
        });
    }

    // ================= Invoices =================

    const INVOICE_BADGES = { draft: "", sent: "badge-yellow", paid: "badge-green", void: "badge-red" };

    async function viewInvoices(root, current) {
        const d = await api("/api/invoices");
        if (!current()) return;
        let filter = state.invoiceFilter || "";
        root.innerHTML =
            '<div class="page-head"><div><h1>Invoices</h1><p class="muted">Raise branded invoices from any HN Group company. Marking one paid adds the money to the main balance.</p></div>' +
            '<div class="page-actions"><button type="button" class="btn btn-ghost" id="iv-settings">' + icon("settings") + "Invoice settings</button>" +
            '<button type="button" class="btn btn-primary" id="iv-new">' + icon("plus") + "New invoice</button></div></div>" +
            '<div class="stat-row">' +
            '<div class="stat"><div class="stat-value">' + fmtMoney(d.summary.outstanding) + '</div><div class="stat-label">Waiting to be paid</div></div>' +
            '<div class="stat' + (d.summary.overdue ? " stat-danger" : "") + '"><div class="stat-value">' + fmtMoney(d.summary.overdue) + '</div><div class="stat-label">Overdue' + (d.summary.overdueCount ? " (" + d.summary.overdueCount + ")" : "") + "</div></div>" +
            '<div class="stat"><div class="stat-value">' + fmtMoney(d.summary.paidThisMonth) + '</div><div class="stat-label">Paid this month</div></div></div>' +
            '<div class="company-tabs" id="iv-tabs"><button type="button" data-f="">All</button><button type="button" data-f="draft">Drafts</button><button type="button" data-f="sent">Waiting</button><button type="button" data-f="overdue">Overdue</button><button type="button" data-f="paid">Paid</button></div>' +
            '<div id="iv-body"></div>';

        function draw() {
            $$("#iv-tabs [data-f]").forEach(function (b) { b.classList.toggle("active", b.dataset.f === filter); });
            const list = d.invoices.filter(function (i) { return !filter || (filter === "overdue" ? i.overdue : i.status === filter); });
            $("#iv-body").innerHTML = list.length ? '<div class="table-card"><table class="table"><thead><tr><th>Invoice</th><th>Customer</th><th>From</th><th>Due</th><th>Status</th><th class="num">Total</th><th class="col-actions"></th></tr></thead><tbody>' +
                list.map(function (i) {
                    return '<tr data-inv="' + i.id + '"><td><strong>' + esc(i.number) + '</strong><div class="muted small">' + esc(fmtDate(i.issueDate + "T12:00:00")) + "</div></td>" +
                        '<td data-label="Customer">' + esc(i.customer.name) + (i.reference ? '<div class="muted small">Ref ' + esc(i.reference) + "</div>" : "") + "</td>" +
                        '<td data-label="From">' + esc(i.company) + "</td>" +
                        '<td data-label="Due" class="nowrap' + (i.overdue ? " danger-text" : "") + '">' + esc(fmtDate(i.dueDate + "T12:00:00")) + "</td>" +
                        '<td data-label="Status"><span class="badge ' + (i.overdue ? "badge-red" : INVOICE_BADGES[i.status]) + '">' + esc(i.statusLabel) + "</span></td>" +
                        '<td data-label="Total" class="num"><strong>' + fmtMoney(i.total) + "</strong></td>" +
                        '<td class="col-actions nowrap"><button type="button" class="btn btn-ghost btn-small" data-iv="view">' + icon("eye") + "Open</button></td></tr>";
                }).join("") + "</tbody></table></div>"
                : '<div class="empty-page">' + icon("file", "big") + "<h2>No invoices" + (filter ? " here" : " yet") + '</h2><p class="muted">Use <strong>New invoice</strong> to bill a customer.</p></div>';
        }
        root.addEventListener("click", function (e) {
            const f = e.target.closest("[data-f]");
            if (f) { filter = state.invoiceFilter = f.dataset.f; return draw(); }
            if (e.target.closest("#iv-new")) return openInvoiceEditor(d, null);
            if (e.target.closest("#iv-settings")) return openInvoiceSettings(d);
            const r = e.target.closest("[data-inv]");
            if (r) openInvoice(d, d.invoices.find(function (i) { return i.id === r.dataset.inv; }));
        });
        draw();
    }

    function invoiceDocHtml(inv, settings) {
        const day = function (iso) { return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); };
        return '<article class="statement invoice">' +
            '<header class="ps-band"><div class="ps-brand"><img src="/assets/brand/svg/hn-group-wordmark-white.svg" alt="HN Group"></div>' +
            '<div class="ps-title"><span class="ps-kicker">Invoice</span><span class="ps-period">' + esc(inv.number) + "</span></div></header>" +
            '<div class="ps-stripe" aria-hidden="true"></div>' +
            '<section class="iv-parties"><div><span class="iv-label">From</span><strong>' + esc(inv.company) + "</strong><span>Part of HN Group</span></div>" +
            '<div><span class="iv-label">Bill to</span><strong>' + esc(inv.customer.name) + "</strong>" + (inv.customer.address ? "<span>" + esc(inv.customer.address).replace(/\n/g, "<br>") + "</span>" : "") +
            (inv.customer.email ? "<span>" + esc(inv.customer.email) + "</span>" : "") + "</div>" +
            '<div class="iv-dates"><div><span class="iv-label">Invoice date</span><strong>' + esc(day(inv.issueDate)) + "</strong></div>" +
            '<div><span class="iv-label">Due date</span><strong>' + esc(day(inv.dueDate)) + "</strong></div>" +
            (inv.reference ? '<div><span class="iv-label">Your reference</span><strong>' + esc(inv.reference) + "</strong></div>" : "") + "</div></section>" +
            '<section class="st-section"><table class="st-table iv-lines"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead><tbody>' +
            inv.lines.map(function (l) {
                return "<tr><td>" + esc(l.description) + '</td><td class="num">' + esc(l.quantity) + '</td><td class="num">' + fmtMoney(l.unitPrice) + '</td><td class="num">' + fmtMoney(l.quantity * l.unitPrice) + "</td></tr>";
            }).join("") + "</tbody></table>" +
            '<div class="iv-totals"><div><span>Subtotal</span><span>' + fmtMoney(inv.subtotal) + "</span></div>" +
            "<div><span>VAT (" + inv.vatRate + "%)</span><span>" + fmtMoney(inv.vat) + "</span></div>" +
            '<div class="iv-grand"><span>Total due</span><span>' + fmtMoney(inv.total) + "</span></div></div></section>" +
            (inv.notes ? '<section class="ps-note">' + icon("message") + "<div>" + esc(inv.notes).replace(/\n/g, "<br>") + "</div></section>" : "") +
            (settings.bankDetails ? '<section class="st-section"><h4>How to pay</h4><p class="st-small">' + esc(settings.bankDetails).replace(/\n/g, "<br>") + "</p></section>" : "") +
            (inv.status === "paid" ? '<div class="iv-paid">PAID ' + esc(fmtDate(inv.paidAt)) + "</div>" : "") +
            '<footer class="ps-foot"><span>' + esc(inv.company) + "</span><span>" + esc(settings.footer || "") + "</span><span>" + esc(inv.number) + "</span></footer></article>";
    }

    function openInvoice(d, inv) {
        const open = inv.status === "draft" || inv.status === "sent";
        const m = openModal(
            '<div class="print-area">' + invoiceDocHtml(inv, d.settings) + "</div>" +
            '<div class="modal-actions no-print">' +
            (inv.status === "draft" ? '<button type="button" class="btn btn-ghost danger-text" data-iva="delete">' + icon("trash") + "Delete</button>" : "") +
            (open ? '<button type="button" class="btn btn-ghost" data-iva="void">Void</button><button type="button" class="btn btn-ghost" data-iva="edit">' + icon("edit") + "Edit</button>" : "") +
            '<button type="button" class="btn btn-ghost" data-iva="print">' + icon("download") + "Download PDF</button>" +
            (inv.status === "draft" ? '<button type="button" class="btn btn-primary" data-iva="sent">Mark as sent</button>' : "") +
            (open ? '<button type="button" class="btn btn-primary" data-iva="paid">' + icon("tick") + "Mark as paid</button>" : "") +
            "</div>",
            { wide: true, cls: "modal-payslip modal-statement" }
        );
        m.el.addEventListener("click", async function (e) {
            const b = e.target.closest("[data-iva]");
            if (!b) return;
            const act = b.dataset.iva;
            if (act === "print") {
                const title = document.title;
                document.title = inv.number + " " + inv.customer.name;
                document.body.classList.add("printing");
                window.print();
                setTimeout(function () { document.body.classList.remove("printing"); document.title = title; }, 500);
                return;
            }
            if (act === "edit") return openInvoiceEditor(d, inv);
            if (act === "paid" && !(await confirmDialog({ title: "Mark " + inv.number + " as paid?", message: fmtMoney(inv.total) + " will be added to the main balance.", confirmLabel: "Mark as paid" }))) return;
            if (act === "void" && !(await confirmDialog({ title: "Void " + inv.number + "?", message: "It stays on record but can’t be paid or changed.", confirmLabel: "Void invoice", danger: true }))) return;
            if (act === "delete" && !(await confirmDialog({ title: "Delete " + inv.number + "?", message: "Drafts can be deleted. This can’t be undone.", confirmLabel: "Delete", danger: true }))) return;
            try {
                const r = await api("/api/invoices/" + inv.id + "/" + act, {});
                if (r.user) { state.me = r.user; renderChrome(); }
                closeModal();
                toast({ sent: "Marked as sent.", paid: "Marked as paid and added to the main balance.", void: "Invoice voided.", delete: "Invoice deleted." }[act]);
                render();
            } catch (err) { toast(err.message); }
        });
    }

    function openInvoiceEditor(d, inv) {
        const v = inv || { company: d.companies[0], customer: { name: "", email: "", address: "" }, issueDate: isoDay(new Date()), dueDate: "", reference: "", lines: [{ description: "", quantity: 1, unitPrice: "" }], vatRate: 0, notes: "" };
        const lines = v.lines.map(function (l) { return Object.assign({}, l); });
        const m = openModal(
            '<h2 class="modal-title">' + (inv ? "Edit " + esc(inv.number) : "New invoice") + "</h2>" +
            '<form id="iv-form" novalidate>' +
            '<div class="grid-2"><div><label for="iv-company">From</label><select id="iv-company">' + d.companies.map(function (c) { return "<option" + (c === v.company ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></div>" +
            '<div><label for="iv-ref">Customer reference <span class="muted small">(optional)</span></label><input type="text" id="iv-ref" maxlength="80" value="' + esc(v.reference) + '"></div></div>' +
            '<div class="grid-2"><div><label for="iv-cust">Customer name</label><input type="text" id="iv-cust" maxlength="120" value="' + esc(v.customer.name) + '"></div>' +
            '<div><label for="iv-email">Customer email <span class="muted small">(optional)</span></label><input type="email" id="iv-email" maxlength="160" value="' + esc(v.customer.email) + '"></div></div>' +
            '<label for="iv-addr">Customer address <span class="muted small">(optional)</span></label><textarea id="iv-addr" rows="2" maxlength="400">' + esc(v.customer.address) + "</textarea>" +
            '<div class="grid-2"><div><label for="iv-date">Invoice date</label><input type="date" id="iv-date" value="' + esc(v.issueDate) + '"></div>' +
            '<div><label for="iv-due">Due date <span class="muted small">(blank = ' + d.settings.paymentTerms + ' days)</span></label><input type="date" id="iv-due" value="' + esc(inv ? v.dueDate : "") + '"></div></div>' +
            '<h3 class="detail-head">Lines</h3><div id="iv-lines"></div><button type="button" class="btn btn-link" id="iv-add">' + icon("plus") + "Add a line</button>" +
            '<div class="grid-2"><div><label for="iv-vat">VAT</label><select id="iv-vat">' + d.vatRates.map(function (r) { return '<option value="' + r + '"' + (r === v.vatRate ? " selected" : "") + ">" + (r ? r + "%" : "No VAT") + "</option>"; }).join("") + "</select></div>" +
            '<div class="iv-edit-total" id="iv-total"></div></div>' +
            '<label for="iv-notes">Notes <span class="muted small">(optional, shown on the invoice)</span></label><textarea id="iv-notes" rows="2" maxlength="1000">' + esc(v.notes) + "</textarea>" +
            '<div class="form-error" id="iv-error" hidden></div>' +
            '<div class="modal-actions sticky-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">' + (inv ? "Save invoice" : "Create invoice") + "</button></div></form>",
            { wide: true }
        );
        function total() {
            const sub = lines.reduce(function (n, l) { return n + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0); }, 0);
            const vat = sub * Number($("#iv-vat", m.el).value) / 100;
            $("#iv-total", m.el).innerHTML = '<span class="muted small">Total</span><strong>' + fmtMoney(sub + vat) + "</strong>";
        }
        function drawLines() {
            $("#iv-lines", m.el).innerHTML = lines.map(function (l, i) {
                return '<div class="iv-line" data-l="' + i + '"><input type="text" data-k="description" placeholder="Description" maxlength="200" value="' + esc(l.description) + '">' +
                    '<input type="number" data-k="quantity" min="0" step="0.01" aria-label="Quantity" value="' + esc(l.quantity) + '">' +
                    '<div class="money-input"><span>£</span><input type="number" data-k="unitPrice" step="0.01" aria-label="Unit price" placeholder="0.00" value="' + esc(l.unitPrice) + '"></div>' +
                    '<button type="button" class="icon-btn" data-rm="' + i + '" aria-label="Remove line">' + icon("x") + "</button></div>";
            }).join("");
            total();
        }
        m.el.addEventListener("input", function (e) {
            const row = e.target.closest("[data-l]");
            if (row) lines[Number(row.dataset.l)][e.target.dataset.k] = e.target.value;
            total();
        });
        m.el.addEventListener("change", function (e) { if (e.target.id === "iv-vat") total(); });
        m.el.addEventListener("click", function (e) {
            if (e.target.closest("#iv-add")) { lines.push({ description: "", quantity: 1, unitPrice: "" }); drawLines(); return; }
            const rm = e.target.closest("[data-rm]");
            if (rm && lines.length > 1) { lines.splice(Number(rm.dataset.rm), 1); drawLines(); }
        });
        drawLines();
        $("#iv-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await api(inv ? "/api/invoices/" + inv.id : "/api/invoices", {
                    company: $("#iv-company", m.el).value, reference: $("#iv-ref", m.el).value,
                    customerName: $("#iv-cust", m.el).value, customerEmail: $("#iv-email", m.el).value, customerAddress: $("#iv-addr", m.el).value,
                    issueDate: $("#iv-date", m.el).value, dueDate: $("#iv-due", m.el).value, lines: lines, vatRate: $("#iv-vat", m.el).value, notes: $("#iv-notes", m.el).value,
                });
                closeModal();
                toast(inv ? "Invoice saved." : "Invoice created.");
                render();
            } catch (err) { formError($("#iv-error", m.el), err.message); }
        });
    }

    function openInvoiceSettings(d) {
        const s = d.settings;
        const m = openModal(
            '<h2 class="modal-title">Invoice settings</h2><form id="is-form" novalidate>' +
            '<label for="is-terms">Payment terms (days)</label><input type="number" id="is-terms" min="0" max="365" value="' + esc(s.paymentTerms) + '">' +
            '<label for="is-bank">How to pay <span class="muted small">(bank details, PayPal address…)</span></label><textarea id="is-bank" rows="3" maxlength="400">' + esc(s.bankDetails) + "</textarea>" +
            '<label for="is-foot">Footer</label><input type="text" id="is-foot" maxlength="300" value="' + esc(s.footer) + '">' +
            '<div class="form-error" id="is-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save</button></div></form>'
        );
        $("#is-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await api("/api/invoices/settings", { paymentTerms: $("#is-terms", m.el).value, bankDetails: $("#is-bank", m.el).value, footer: $("#is-foot", m.el).value });
                closeModal();
                toast("Invoice settings saved.");
                render();
            } catch (err) { formError($("#is-error", m.el), err.message); }
        });
    }

    // ================= Funds charts and budgets =================

    function monthShort(period) {
        const [y, m] = period.split("-").map(Number);
        return new Date(y, m - 1, 15).toLocaleDateString("en-GB", { month: "short" });
    }

    // A 12-month chart: bars for money in and spent, a line for the total balance.
    function fundsChartSvg(series) {
        const W = 720, H = 240, L = 56, R = 12, T = 16, B = 30;
        const vals = [];
        series.forEach(function (s) { vals.push(s.in, s.out, s.total); });
        let max = Math.max.apply(null, vals.concat([1]));
        let min = Math.min.apply(null, vals.concat([0]));
        const pad = (max - min) * 0.1 || 1;
        max += pad;
        if (min < 0) min -= pad;
        const y = function (v) { return T + (H - T - B) * (1 - (v - min) / (max - min)); };
        const step = (W - L - R) / series.length;
        const bw = Math.max(4, step / 4);
        let out = '<svg class="funds-chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Money in, spent and balance over the last 12 months">';
        for (let i = 0; i <= 4; i++) {
            const v = min + (max - min) * i / 4;
            out += '<line class="fc-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"></line>' +
                '<text class="fc-axis" x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + esc(fmtMoney(Math.round(v)).replace(".00", "")) + "</text>";
        }
        if (min < 0) out += '<line class="fc-zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '"></line>';
        const pts = [];
        series.forEach(function (s, i) {
            const cx = L + step * i + step / 2;
            out += '<rect class="fc-in" x="' + (cx - bw - 1) + '" y="' + Math.min(y(s.in), y(0)) + '" width="' + bw + '" height="' + Math.abs(y(0) - y(s.in)) + '"><title>' + esc(monthShort(s.period)) + ": in " + esc(fmtMoney(s.in)) + "</title></rect>" +
                '<rect class="fc-out" x="' + (cx + 1) + '" y="' + Math.min(y(s.out), y(0)) + '" width="' + bw + '" height="' + Math.abs(y(0) - y(s.out)) + '"><title>' + esc(monthShort(s.period)) + ": spent " + esc(fmtMoney(s.out)) + "</title></rect>" +
                '<text class="fc-axis" x="' + cx + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(monthShort(s.period)) + "</text>";
            pts.push(cx + "," + y(s.total));
        });
        out += '<polyline class="fc-line" points="' + pts.join(" ") + '"></polyline>';
        series.forEach(function (s, i) {
            out += '<circle class="fc-dot" cx="' + (L + step * i + step / 2) + '" cy="' + y(s.total) + '" r="3.5"><title>' + esc(monthShort(s.period)) + ": balance " + esc(fmtMoney(s.total)) + "</title></circle>";
        });
        return out + "</svg>";
    }

    function fundsInsightsHtml(x) {
        const withBudget = x.budgets.filter(function (b) { return b.budget || b.spent; });
        return '<section class="panel"><div class="panel-head"><h2 class="panel-title">' + icon("chart") + "Last 12 months</h2>" +
            '<div class="chart-key"><span class="ck-in">Money in</span><span class="ck-out">Spent</span><span class="ck-line">Total balance</span></div></div>' +
            '<div class="chart-wrap">' + fundsChartSvg(x.series) + "</div></section>" +
            '<section class="panel"><div class="panel-head"><h2 class="panel-title">' + icon("flag") + "Budgets this month</h2>" +
            '<button type="button" class="btn btn-ghost btn-small" id="fd-budgets">' + icon("settings") + "Categories &amp; budgets</button></div>" +
            (withBudget.length ? '<div class="budget-list">' + withBudget.map(function (b) {
                const pct = b.budget ? Math.min(100, Math.round(b.used * 100)) : 0;
                return '<div class="budget-row b-' + (b.level || "none") + '"><div class="br-head"><strong>' + esc(b.category) + "</strong><span>" + fmtMoney(b.spent) +
                    (b.budget ? ' <span class="muted">of ' + fmtMoney(b.budget) + "</span>" : ' <span class="muted">· no budget</span>') + "</span></div>" +
                    (b.budget ? '<div class="br-bar"><span data-w="' + pct + '"></span></div><div class="muted small">' +
                        (b.level === "over" ? '<span class="danger-text">' + fmtMoney(-b.left) + " over budget</span>" : fmtMoney(b.left) + " left" + (b.level === "close" ? " · nearly used up" : "")) + "</div>" : "") + "</div>";
            }).join("") + "</div>" : '<p class="muted small">Nothing spent yet this month, and no budgets set. Use <strong>Categories &amp; budgets</strong> to set monthly limits.</p>') +
            "</section>";
    }

    function openBudgets(x) {
        const m = openModal(
            '<h2 class="modal-title">Categories &amp; budgets</h2>' +
            '<p class="muted">Money taken out of the company is tagged with a category. Give a category a monthly budget to get a warning when it’s nearly used up (80%) or over. Leave it blank for no budget.</p>' +
            '<div class="budget-edit">' + x.categories.map(function (c) {
                const b = x.budgets.find(function (y) { return y.category === c; }) || {};
                return '<div class="be-row"><span>' + esc(c) + '</span><div class="money-input"><span>£</span><input type="text" inputmode="decimal" data-budget="' + esc(c) + '" value="' + (b.budget ? b.budget.toFixed(2) : "") + '" placeholder="No budget"></div>' +
                    (c === "Payroll" || c === "Other" ? '<span class="be-x"></span>' : '<button type="button" class="icon-btn" data-rmcat="' + esc(c) + '" aria-label="Remove ' + esc(c) + '">' + icon("trash") + "</button>") + "</div>";
            }).join("") + "</div>" +
            '<form id="cat-form" class="inline-form"><input type="text" id="cat-name" maxlength="40" placeholder="New category, e.g. Insurance"><button type="submit" class="btn btn-ghost">' + icon("plus") + "Add</button></form>" +
            '<div class="form-error" id="bd-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Close</button><button type="button" class="btn btn-primary" id="bd-save">Save budgets</button></div>'
        );
        m.el.addEventListener("click", async function (e) {
            const rm = e.target.closest("[data-rmcat]");
            if (rm) {
                try { await api("/api/funds/categories", { remove: rm.dataset.rmcat }); closeModal(); toast("Category removed."); render(); } catch (err) { formError($("#bd-error", m.el), err.message); }
            }
            if (e.target.closest("#bd-save")) {
                try {
                    for (const inp of $$("[data-budget]", m.el)) {
                        const cur = (x.budgets.find(function (y) { return y.category === inp.dataset.budget; }) || {}).budget || 0;
                        const val = Number(inp.value.replace(/[£,\s]/g, "")) || 0;
                        if (val !== cur) await api("/api/funds/budgets", { category: inp.dataset.budget, amount: inp.value.replace(/[£,\s]/g, "") });
                    }
                    closeModal();
                    toast("Budgets saved.");
                    render();
                } catch (err) { formError($("#bd-error", m.el), err.message); }
            }
        });
        $("#cat-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try { await api("/api/funds/categories", { add: $("#cat-name", m.el).value }); closeModal(); toast("Category added."); render(); } catch (err) { formError($("#bd-error", m.el), err.message); }
        });
    }

    // ================= Year end and P60s =================

    function p60DocHtml(p) {
        const row = function (label, v) { return '<div class="ps-line"><span>' + label + '</span><span class="ps-amt">' + fmtMoney(v) + "</span></div>"; };
        const fact = function (label, value) { return '<div class="ps-fact"><span>' + label + "</span><strong>" + esc(value || "–") + "</strong></div>"; };
        return '<article class="payslip p60">' +
            '<header class="ps-band"><div class="ps-brand"><img src="/assets/brand/svg/hn-group-wordmark-white.svg" alt="HN Group"></div>' +
            '<div class="ps-title"><span class="ps-kicker">End of year certificate</span><span class="ps-period">Tax year ' + esc(p.label) + "</span></div></header>" +
            '<div class="ps-stripe" aria-hidden="true"></div>' +
            '<section class="ps-intro"><div class="ps-who"><div class="ps-name">' + esc(p.employeeName) + '</div><div class="ps-job">' + esc(p.jobTitle || "") + "</div>" +
            '<div class="ps-employer">' + icon("building") + "Employer: " + esc(p.employer) + "</div></div>" +
            '<div class="ps-netcard"><span class="ps-netlabel">Pay in this employment</span><span class="ps-netvalue">' + fmtMoney(p.gross) + '</span><span class="ps-netdate">6 April ' + esc(p.start.slice(0, 4)) + " to 5 April " + esc(p.end.slice(0, 4)) + "</span></div></section>" +
            '<section class="ps-facts">' + fact("Employee no.", p.employeeNumber) + fact("NI number", p.niNumber) + fact("Final tax code", p.taxCode) + fact("Payslips", String(p.payslips)) + "</section>" +
            (p.complete ? "" : '<div class="banner banner-warn p60-note"><div><strong>The tax year isn’t over yet.</strong> These are the figures so far.</div></div>') +
            '<section class="ps-columns"><div class="ps-col"><h4>' + icon("plus") + "Pay and tax</h4>" + row("Total pay", p.gross) + row("Taxable pay (after pension)", p.taxable) + row("Income tax deducted", p.tax) +
            '<div class="ps-line ps-total"><span>Take-home pay</span><span class="ps-amt">' + fmtMoney(p.net) + "</span></div></div>" +
            '<div class="ps-col"><h4>' + icon("shield") + "Other deductions</h4>" + row("Employee National Insurance", p.ni) + row("Employee pension", p.pension) + row("Student loan", p.studentLoan) +
            (p.reimbursed ? row("Expenses repaid (tax free)", p.reimbursed) : "") + "</div></section>" +
            '<section class="ps-employer-ded"><div class="ps-col"><h4>' + icon("building") + "Paid by your employer</h4>" + row("Employer National Insurance", p.employerNi) + row("Employer pension", p.employerPension) + "</div></section>" +
            '<footer class="ps-foot"><span>' + esc(p.employer) + "</span><span>Keep this certificate. You may need it for tax returns or tax credits.</span><span>" + esc(p.label) + "</span></footer></article>";
    }

    function printDoc(title) {
        const t = document.title;
        document.title = title;
        document.body.classList.add("printing");
        window.print();
        setTimeout(function () { document.body.classList.remove("printing"); document.title = t; }, 500);
    }

    async function openMyP60(start) {
        let r;
        try { r = await api("/api/payslips/p60" + (start ? "?start=" + start : "")); } catch (err) { return toast(err.message); }
        const m = openModal(
            '<div class="st-toolbar no-print"><h2 class="modal-title">End of year certificate (P60)</h2><select id="p60-year">' + r.years.map(function (y) {
                return '<option value="' + y.start + '"' + (y.start === r.p60.start ? " selected" : "") + ">Tax year " + esc(y.label) + "</option>";
            }).join("") + "</select></div>" +
            '<div class="print-area">' + p60DocHtml(r.p60) + "</div>" +
            '<div class="modal-actions no-print"><button type="button" class="btn btn-ghost" id="p60-print">' + icon("printer") + 'Print or save as PDF</button><button type="button" class="btn btn-primary" data-close>Done</button></div>',
            { wide: true, cls: "modal-payslip" }
        );
        $("#p60-year", m.el).addEventListener("change", function (e) { openMyP60(e.target.value); });
        $("#p60-print", m.el).addEventListener("click", function () { printDoc("P60 " + r.p60.label); });
    }

    async function openYearEnd(start) {
        let r;
        try { r = await api("/api/payroll/year-end" + (start ? "?start=" + start : "")); } catch (err) { return toast(err.message); }
        const y = r.report;
        const m = openModal(
            '<div class="st-toolbar"><h2 class="modal-title">Year end · ' + esc(y.label) + "</h2>" +
            '<select id="ye-year">' + r.years.map(function (x) { return '<option value="' + x.start + '"' + (x.start === y.start ? " selected" : "") + ">Tax year " + esc(x.label) + "</option>"; }).join("") + "</select></div>" +
            '<p class="muted">Issued payslips from 6 April ' + esc(y.start.slice(0, 4)) + " to 5 April " + esc(y.end.slice(0, 4)) + ". Open someone’s P60 to print it, or export every payslip to a spreadsheet.</p>" +
            '<div class="stat-row">' +
            '<div class="stat"><div class="stat-value">' + fmtMoney(y.totals.gross) + '</div><div class="stat-label">Total pay</div></div>' +
            '<div class="stat"><div class="stat-value">' + fmtMoney(y.totals.tax) + '</div><div class="stat-label">Income tax</div></div>' +
            '<div class="stat"><div class="stat-value">' + fmtMoney(y.totals.ni + y.totals.employerNi) + '</div><div class="stat-label">NI (employee + employer)</div></div>' +
            '<div class="stat"><div class="stat-value">' + fmtMoney(y.totals.cost) + '</div><div class="stat-label">Total cost</div></div></div>' +
            (y.people.length ? '<div class="table-card flat"><table class="table ye-table"><thead><tr><th>Employee</th><th class="num">Payslips</th><th class="num">Total pay</th><th class="num">Tax</th><th class="num">NI</th><th class="num">Pension</th><th class="num">Take-home</th><th class="col-actions"></th></tr></thead><tbody>' +
                y.people.map(function (p) {
                    return "<tr><td><div class=\"emp-name\">" + esc(p.displayName) + '</div><div class="muted small">' + esc(p.jobTitle) + "</div></td>" +
                        '<td class="num" data-label="Payslips">' + p.payslips + '</td><td class="num" data-label="Total pay">' + fmtMoney(p.gross) + '</td><td class="num" data-label="Tax">' + fmtMoney(p.tax) + "</td>" +
                        '<td class="num" data-label="NI">' + fmtMoney(p.ni) + '</td><td class="num" data-label="Pension">' + fmtMoney(p.pension) + '</td><td class="num" data-label="Take-home"><strong>' + fmtMoney(p.net) + "</strong></td>" +
                        '<td class="col-actions"><button type="button" class="btn btn-ghost btn-small" data-p60="' + p.personId + '">' + icon("file") + "P60</button></td></tr>";
                }).join("") + "</tbody></table></div>" : '<p class="muted small">No issued payslips in this tax year yet.</p>') +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Close</button>' +
            '<a class="btn btn-primary" href="/api/payroll/year-end.csv?start=' + y.start + '" download>' + icon("download") + "Export to spreadsheet (CSV)</a></div>",
            { wide: true }
        );
        $("#ye-year", m.el).addEventListener("change", function (e) { openYearEnd(e.target.value); });
        m.el.addEventListener("click", async function (e) {
            const b = e.target.closest("[data-p60]");
            if (!b) return;
            try {
                const p = (await api("/api/payroll/p60/" + b.dataset.p60 + "?start=" + y.start)).p60;
                const pm = openModal('<div class="print-area">' + p60DocHtml(p) + "</div>" +
                    '<div class="modal-actions no-print"><button type="button" class="btn btn-ghost" id="p60-back">Back to year end</button><button type="button" class="btn btn-primary" id="p60-print">' + icon("printer") + "Print or save as PDF</button></div>",
                    { wide: true, cls: "modal-payslip" });
                $("#p60-back", pm.el).addEventListener("click", function () { openYearEnd(y.start); });
                $("#p60-print", pm.el).addEventListener("click", function () { printDoc("P60 " + p.employeeName + " " + p.label); });
            } catch (err) { toast(err.message); }
        });
    }

    // Scheduled pay changes, shown inside the pay details pop-up.
    function payChangesHtml(changes) {
        return '<h3 class="detail-head">Scheduled pay changes</h3>' +
            '<p class="muted small">Set a pay rise (or any change) from a future month. Payroll picks it up automatically from that month.</p>' +
            (changes.length ? '<div class="pc-list">' + changes.map(function (c) {
                return '<div class="pc-row' + (c.applied ? " applied" : "") + '"><span class="pc-when">' + esc(c.label) + "</span><strong>" + (c.payType === "hourly" ? fmtMoney(c.hourlyRate) + " an hour" : fmtMoney(c.monthlySalary) + " a month") + "</strong>" +
                    '<span class="muted small">' + (c.applied ? "In effect" : "Upcoming") + (c.note ? " · " + esc(c.note) : "") + "</span>" +
                    '<button type="button" class="icon-btn" data-pcdel="' + c.id + '" aria-label="Remove">' + icon("trash") + "</button></div>";
            }).join("") + "</div>" : "") +
            '<div class="pc-form"><input type="month" id="pc-month" aria-label="From month">' +
            '<select id="pc-type" aria-label="Pay type"><option value="salary">Monthly salary</option><option value="hourly">Hourly rate</option></select>' +
            '<div class="money-input"><span>£</span><input type="number" id="pc-amount" step="0.01" min="0" placeholder="New amount" aria-label="New amount"></div>' +
            '<input type="text" id="pc-note" maxlength="200" placeholder="Note (optional)" aria-label="Note">' +
            '<button type="button" class="btn btn-ghost" id="pc-add">' + icon("plus") + "Schedule</button></div>" +
            '<div class="form-error" id="pc-error" hidden></div>';
    }

    function mountPayChanges(box, personId) {
        function load(changes) {
            box.innerHTML = payChangesHtml(changes);
            $("#pc-month", box).value = shiftMonth(isoDay(new Date()).slice(0, 7), 1);
        }
        api("/api/payroll/pay-changes/" + personId).then(function (r) { load(r.changes); }).catch(function () {});
        box.addEventListener("click", async function (e) {
            const del = e.target.closest("[data-pcdel]");
            try {
                if (del) return load((await api("/api/payroll/pay-changes/" + personId + "/" + del.dataset.pcdel + "/delete", {})).changes);
                if (e.target.closest("#pc-add")) {
                    const type = $("#pc-type", box).value;
                    load((await api("/api/payroll/pay-changes/" + personId, {
                        effective: $("#pc-month", box).value, payType: type, note: $("#pc-note", box).value,
                        monthlySalary: type === "salary" ? $("#pc-amount", box).value : 0, hourlyRate: type === "hourly" ? $("#pc-amount", box).value : 0,
                    })).changes);
                    toast("Pay change scheduled.");
                }
            } catch (err) { formError($("#pc-error", box), err.message); }
        });
    }

    // ================= Leave calendar, shutdown days and TOIL =================

    function mountLeaveCalendar(box) {
        let month = state.leaveMonth || isoDay(new Date()).slice(0, 7);
        let company = state.leaveCompany || "";
        async function load() {
            box.innerHTML = '<p class="muted small">Loading…</p>';
            let g;
            try { g = await api("/api/leave/grid?month=" + month + "&company=" + encodeURIComponent(company)); } catch (err) { box.innerHTML = '<p class="form-error">' + esc(err.message) + "</p>"; return; }
            const [y, mo] = month.split("-").map(Number);
            const label = new Date(y, mo - 1, 15).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
            const t = isoDay(new Date());
            box.innerHTML = '<section class="panel lc-panel"><div class="lc-toolbar">' +
                '<div class="week-nav"><button type="button" class="icon-btn" data-lcm="-1" aria-label="Previous month">' + icon("chevronLeft") + "</button>" +
                '<h2 class="week-title">' + esc(label) + '</h2><button type="button" class="icon-btn" data-lcm="1" aria-label="Next month">' + icon("chevronRight") + "</button></div>" +
                '<select id="lc-company" aria-label="Company"><option value="">All companies</option>' + g.companies.map(function (c) { return "<option" + (c === company ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></div>" +
                (Object.keys(g.clashes).length ? '<div class="banner banner-warn lc-warn">' + icon("alert") + "<div><strong>Busy days.</strong> More than " + g.maxOffPerCompany + (g.maxOffPerCompany === 1 ? " person" : " people") + " from one company are off on " +
                    Object.keys(g.clashes).map(function (d) { return esc(new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })) + " (" + g.clashes[d].map(function (c) { return esc(c.company) + ", " + c.count; }).join("; ") + ")"; }).join(", ") + ".</div></div>" : "") +
                '<div class="lc-scroll"><table class="lc-grid"><thead><tr><th class="lc-name">Person</th>' + g.days.map(function (d) {
                    const dt = new Date(d.date + "T12:00:00");
                    return '<th class="' + (d.weekend ? "lc-we" : "") + (d.bankHoliday ? " lc-bh" : "") + (g.clashes[d.date] ? " lc-clash" : "") + (d.date === t ? " lc-today" : "") + '"' + (d.bankHoliday ? ' title="' + esc(d.bankHoliday) + '"' : "") + "><span>" + "MTWTFSS".charAt((dt.getDay() + 6) % 7) + "</span>" + dt.getDate() + "</th>";
                }).join("") + "</tr></thead><tbody>" +
                g.rows.map(function (r) {
                    return '<tr><th class="lc-name"><div class="emp-cell">' + avatar(r, "sm") + '<span class="emp-name">' + esc(r.displayName) + "</span></div></th>" + g.days.map(function (d) {
                        const c = r.cells[d.date];
                        return '<td class="' + (d.weekend ? "lc-we" : "") + (d.bankHoliday ? " lc-bh" : "") + (g.clashes[d.date] ? " lc-clash" : "") + '">' +
                            (c ? '<span class="lc-cell lt-' + esc(c.type) + (c.pending ? " lc-pending" : "") + (c.half ? " lc-half" : "") + '" title="' + esc(c.label + (c.pending ? " (waiting for approval)" : "") + (c.half ? " (half day)" : "") + (c.shutdown ? " (company shutdown)" : "")) + '"></span>' : "") + "</td>";
                    }).join("") + "</tr>";
                }).join("") + "</tbody></table></div>" +
                '<div class="lc-key">' + ["annual", "toil", "sick", "compassionate", "unpaid", "other"].map(function (k) {
                    return '<span><i class="lc-cell lt-' + k + '"></i>' + esc(g.types[k]) + "</span>";
                }).join("") + '<span><i class="lc-cell lt-annual lc-pending"></i>Waiting for approval</span><span><i class="lc-bh-key"></i>Bank holiday</span></div></section>';
            $("#lc-company", box).addEventListener("change", function (e) { company = state.leaveCompany = e.target.value; load(); });
        }
        box.onclick = function (e) {
            const b = e.target.closest("[data-lcm]");
            if (b) { month = state.leaveMonth = shiftMonth(month, Number(b.dataset.lcm)); load(); }
        };
        load();
    }

    function mountShutdowns(box) {
        api("/api/leave/shutdowns").then(function (r) {
            box.innerHTML = '<section class="panel"><div class="panel-head"><h2 class="panel-title">' + icon("building") + "Company shutdown days</h2>" +
                '<button type="button" class="btn btn-primary btn-small" id="sd-new">' + icon("plus") + "Book shutdown days</button></div>" +
                '<p class="muted small">Book the same days off for everyone, like the days between Christmas and New Year. Each person gets the days as approved annual leave, so they come out of their allowance. Cancelling a shutdown gives the days back.</p>' +
                (r.shutdowns.length ? '<div class="leave-list">' + r.shutdowns.map(function (x) {
                    return '<div class="leave-row"><span class="leave-icon">' + icon("building") + '</span><div class="lr-main"><div class="lr-title">' + esc(x.name) + "</div>" +
                        '<div class="muted small">' + esc(dateRange(x.startDate, x.endDate)) + " · " + fmtDays(x.days) + " · " + (x.companies.length ? esc(x.companies.join(", ")) : "Everyone") + " · booked by " + esc(x.byName) + "</div>" +
                        '<div class="muted small">' + x.people + (x.people === 1 ? " person" : " people") + " booked" + (x.skipped.length ? " · " + x.skipped.length + " skipped (already off): " + esc(x.skipped.map(function (k) { return k.displayName; }).join(", ")) : "") + "</div></div>" +
                        '<div class="lr-side"><button type="button" class="btn btn-ghost btn-small danger-text" data-sddel="' + x.id + '">Cancel shutdown</button></div></div>';
                }).join("") + "</div>" : '<p class="muted small">No shutdown days booked yet.</p>') + "</section>";
            box.onclick = async function (e) {
                if (e.target.closest("#sd-new")) return openShutdownForm(r.companies);
                const del = e.target.closest("[data-sddel]");
                if (del && await confirmDialog({ title: "Cancel this shutdown?", message: "Everyone’s days go back into their allowance.", confirmLabel: "Cancel shutdown", danger: true })) {
                    try { await api("/api/leave/shutdowns/" + del.dataset.sddel + "/delete", {}); toast("Shutdown cancelled."); render(); } catch (err) { toast(err.message); }
                }
            };
        }).catch(function (err) { box.innerHTML = '<p class="form-error">' + esc(err.message) + "</p>"; });
    }

    function openShutdownForm(companies) {
        const m = openModal(
            '<h2 class="modal-title">Book shutdown days</h2>' +
            '<form id="sd-form" novalidate><label for="sd-name">Name</label><input type="text" id="sd-name" maxlength="80" placeholder="e.g. Christmas closure">' +
            '<div class="grid-2"><div><label for="sd-start">First day</label><input type="date" id="sd-start"></div><div><label for="sd-end">Last day</label><input type="date" id="sd-end"></div></div>' +
            '<label>Who</label><div class="check-grid">' + companies.map(function (c) { return '<label class="inline-check"><input type="checkbox" value="' + esc(c) + '"> ' + esc(c) + "</label>"; }).join("") + "</div>" +
            '<p class="muted small">Leave every company unticked to book it for everyone.</p>' +
            '<div class="form-error" id="sd-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Book days off</button></div></form>'
        );
        $("#sd-start", m.el).addEventListener("change", function (e) { if (!$("#sd-end", m.el).value || $("#sd-end", m.el).value < e.target.value) $("#sd-end", m.el).value = e.target.value; });
        $("#sd-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                const r = await api("/api/leave/shutdowns", {
                    name: $("#sd-name", m.el).value, startDate: $("#sd-start", m.el).value, endDate: $("#sd-end", m.el).value,
                    companies: $$(".check-grid input:checked", m.el).map(function (c) { return c.value; }),
                });
                state.me = r.user;
                closeModal();
                toast("Booked for " + r.shutdown.requestIds.length + " people" + (r.shutdown.skipped.length ? ", " + r.shutdown.skipped.length + " skipped." : "."));
                render();
            } catch (err) { formError($("#sd-error", m.el), err.message); }
        });
    }

    async function openToil(personId, name, manage) {
        let r;
        try { r = await api("/api/leave/toil/" + personId); } catch (err) { return toast(err.message); }
        const m = openModal(
            '<h2 class="modal-title">Time off in lieu · ' + esc(name) + "</h2>" +
            '<div class="toil-balance"><strong>' + r.balance + " hours</strong><span class=\"muted\">available, about " + fmtDays(Math.floor(r.balance / r.hoursPerDay * 2) / 2) + " (" + r.hoursPerDay + " hours a day)</span></div>" +
            '<p class="muted small">Extra hours worked are banked here when a timesheet is approved, or added by a supervisor. Book it as <strong>Time off in lieu</strong> on the Leave page.</p>' +
            (manage ? '<form id="toil-form" class="toil-form"><input type="number" id="toil-h" step="0.25" placeholder="Hours (use minus to take off)" aria-label="Hours"><input type="text" id="toil-why" maxlength="200" placeholder="Reason" aria-label="Reason"><button type="submit" class="btn btn-primary">Add</button></form><div class="form-error" id="toil-error" hidden></div>' : "") +
            (r.history.length ? '<div class="toil-list">' + r.history.map(function (h) {
                return '<div class="toil-row"><span class="' + (h.hours > 0 ? "fund-in" : "fund-out") + '">' + (h.hours > 0 ? "+" : "") + h.hours + " hrs</span><span>" + esc(h.reason) + '</span><span class="muted small">' + esc(fmtDate(h.at)) + " · " + esc(h.byName) + "</span></div>";
            }).join("") + "</div>" : '<p class="muted small">Nothing banked yet.</p>') +
            '<div class="modal-actions"><button type="button" class="btn btn-primary" data-close>Done</button></div>'
        );
        if (manage) $("#toil-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try { await api("/api/leave/toil/" + personId, { hours: $("#toil-h", m.el).value, reason: $("#toil-why", m.el).value }); toast("Time off in lieu updated."); openToil(personId, name, manage); } catch (err) { formError($("#toil-error", m.el), err.message); }
        });
    }

    // Approving a timesheet with more hours than the rota planned: offer to bank them as TOIL.
    function askToil(name, extra, planned, worked) {
        return new Promise(function (resolve) {
            let done = false;
            const m = openModal(
                '<h2 class="modal-title">Bank extra hours as time off in lieu?</h2>' +
                '<p class="muted">' + esc(name) + " worked " + fmtHours(worked) + " against " + fmtHours(planned) + " on the rota.</p>" +
                '<label for="at-h">Hours to bank</label><input type="number" id="at-h" min="0" step="0.25" value="' + extra + '">' +
                '<div class="modal-actions"><button type="button" class="btn btn-ghost" id="at-no">Approve without TOIL</button><button type="button" class="btn btn-primary" id="at-yes">Approve and bank hours</button></div>',
                { onClose: function () { if (!done) resolve(null); } }
            );
            $("#at-no", m.el).addEventListener("click", function () { done = true; closeModal(); resolve(0); });
            $("#at-yes", m.el).addEventListener("click", function () { done = true; const v = Number($("#at-h", m.el).value) || 0; closeModal(); resolve(v); });
        });
    }

    // ================= Training records =================

    const TRAINING_STATES = { valid: ["Current", "badge-green"], expiring: ["Expiring soon", "badge-yellow"], expired: ["Expired", "badge-red"] };

    async function viewTraining(root, current) {
        const d = await api("/api/training");
        if (!current()) return;
        let tab = state.trainingTab || "mine";
        if (!d.canManage) tab = "mine";
        const tabs = [["mine", "My training", d.mine.length]];
        if (d.canManage) tabs.push(["all", "Everyone", d.all.length], ["required", "Required courses", d.required.length]);
        root.innerHTML =
            '<div class="page-head"><div><h1>Training</h1><p class="muted">Courses, qualifications and certificates. Things that need renewing show a reminder 30 days before they expire.</p></div>' +
            '<div class="page-actions">' + (state.me.system ? "" : '<button type="button" class="btn btn-primary" id="tr-new">' + icon("plus") + "Add training</button>") + "</div></div>" +
            (d.myMissing.length ? '<div class="banner banner-warn">' + icon("alert") + "<div><strong>Required training missing:</strong> " + esc(d.myMissing.join(", ")) + ". Add it once you’ve done it.</div></div>" : "") +
            '<div class="company-tabs" id="tr-tabs">' + tabs.map(function (t) { return '<button type="button" data-tab="' + t[0] + '">' + esc(t[1]) + ' <span class="tab-count">' + t[2] + "</span></button>"; }).join("") + "</div>" +
            '<div id="tr-body"></div>';

        function card(r, showPerson) {
            const st = TRAINING_STATES[r.state];
            return '<div class="tr-card" data-id="' + r.id + '"><div class="tr-top">' + (showPerson ? avatar(r.person, "sm") : '<span class="tr-icon">' + icon("star") + "</span>") +
                '<div class="tr-main"><strong>' + esc(r.course) + "</strong>" + (showPerson ? '<span class="muted small">' + esc(r.person.displayName) + "</span>" : "") +
                (r.provider ? '<span class="muted small">' + esc(r.provider) + "</span>" : "") + "</div>" +
                '<span class="badge ' + st[1] + '">' + st[0] + "</span></div>" +
                '<div class="tr-dates"><span>Completed <strong>' + esc(fmtDate(r.completedOn + "T12:00:00")) + "</strong></span>" +
                (r.expiresOn ? "<span>" + (r.state === "expired" ? "Expired" : "Expires") + " <strong>" + esc(fmtDate(r.expiresOn + "T12:00:00")) + "</strong>" + (r.state === "expiring" ? " (" + r.daysLeft + " days)" : "") + "</span>" : "<span>Doesn’t expire</span>") + "</div>" +
                (r.note ? '<p class="muted small">' + esc(r.note) + "</p>" : "") +
                '<div class="tr-foot">' + (r.certificate ? '<a href="/api/training/' + r.id + '/certificate" target="_blank" rel="noopener" class="claim-receipt">' + icon("file") + esc(r.certificate.fileName) + "</a>" : '<span class="muted small">No certificate</span>') +
                (r.verified ? '<span class="tr-verified">' + icon("check") + "Checked by HR</span>" : d.canManage ? '<button type="button" class="btn btn-link btn-small" data-tr="verify">Mark as checked</button>' : '<span class="muted small">Not checked yet</span>') +
                (r.canEdit ? '<span class="tr-actions"><button type="button" class="icon-btn" data-tr="edit" aria-label="Edit">' + icon("edit") + '</button><button type="button" class="icon-btn" data-tr="delete" aria-label="Delete">' + icon("trash") + "</button></span>" : "") +
                "</div></div>";
        }

        function draw() {
            $$("#tr-tabs [data-tab]").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === tab); });
            const body = $("#tr-body");
            if (tab === "mine") {
                body.innerHTML = d.mine.length ? '<div class="tr-grid">' + d.mine.map(function (r) { return card(r, false); }).join("") + "</div>"
                    : '<div class="empty-page">' + icon("star", "big") + '<h2>No training recorded</h2><p class="muted">Add courses and certificates with <strong>Add training</strong>.</p></div>';
            } else if (tab === "all") {
                const gaps = d.matrix.filter(function (p) { return p.missing.length; });
                body.innerHTML = (gaps.length ? '<section class="panel"><h2 class="panel-title">' + icon("alert") + "Missing required training</h2><div class=\"tr-gaps\">" + gaps.map(function (p) {
                    return '<div class="tr-gap"><strong>' + esc(p.displayName) + '</strong><span class="muted small">' + esc(p.missing.join(", ")) + "</span></div>";
                }).join("") + "</div></section>" : "") +
                    (d.all.length ? '<div class="tr-grid">' + d.all.map(function (r) { return card(r, true); }).join("") + "</div>" : '<p class="muted">No training recorded yet.</p>');
            } else {
                body.innerHTML = '<section class="panel"><h2 class="panel-title">' + icon("flag") + "Required courses</h2>" +
                    '<p class="muted small">Everyone (or everyone at one company) should have a current record with this exact course name. People missing one get a reminder.</p>' +
                    (d.required.length ? '<div class="pc-list">' + d.required.map(function (q) {
                        return '<div class="pc-row"><strong>' + esc(q.course) + '</strong><span class="muted small">' + esc(q.company || "Everyone") + '</span><button type="button" class="icon-btn" data-reqdel="' + q.id + '" aria-label="Remove">' + icon("trash") + "</button></div>";
                    }).join("") + "</div>" : "") +
                    '<form id="req-form" class="inline-form"><input type="text" id="req-course" maxlength="120" placeholder="Course, e.g. Fire safety"><select id="req-company"><option value="">Everyone</option>' +
                    d.companies.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + '</select><button type="submit" class="btn btn-ghost">' + icon("plus") + "Add</button></form></section>";
                $("#req-form").addEventListener("submit", async function (e) {
                    e.preventDefault();
                    try { await api("/api/training/required", { course: $("#req-course").value, company: $("#req-company").value }); toast("Required course added."); render(); } catch (err) { toast(err.message); }
                });
            }
        }
        root.addEventListener("click", async function (e) {
            const t = e.target.closest("[data-tab]");
            if (t) { tab = state.trainingTab = t.dataset.tab; return draw(); }
            if (e.target.closest("#tr-new")) return openTrainingForm(d, null);
            const rq = e.target.closest("[data-reqdel]");
            if (rq) { try { await api("/api/training/required/" + rq.dataset.reqdel + "/delete", {}); render(); } catch (err) { toast(err.message); } return; }
            const b = e.target.closest("[data-tr]");
            if (!b) return;
            const id = b.closest("[data-id]").dataset.id;
            const rec = d.mine.concat(d.all || []).find(function (x) { return x.id === id; });
            try {
                if (b.dataset.tr === "edit") return openTrainingForm(d, rec);
                if (b.dataset.tr === "delete" && !(await confirmDialog({ title: "Delete this record?", message: rec.course + " will be removed, with its certificate.", confirmLabel: "Delete", danger: true }))) return;
                await api("/api/training/" + id + "/" + b.dataset.tr, {});
                toast(b.dataset.tr === "verify" ? "Marked as checked." : "Record deleted.");
                render();
            } catch (err) { toast(err.message); }
        });
        draw();
    }

    function openTrainingForm(d, rec) {
        let file = null;
        const v = rec || { course: "", provider: "", completedOn: isoDay(new Date()), expiresOn: "", note: "" };
        const m = openModal(
            '<h2 class="modal-title">' + (rec ? "Edit training" : "Add training") + "</h2><form id=\"tr-form\" novalidate>" +
            (!rec && d.canManage ? '<label for="tr-person">Who</label><select id="tr-person">' + (state.me.system ? "" : '<option value="">Me</option>') + d.people.filter(function (p) { return p.id !== state.me.id; }).map(function (p) { return '<option value="' + p.id + '">' + esc(p.displayName) + "</option>"; }).join("") + "</select>" : "") +
            '<label for="tr-course">Course or qualification</label><input type="text" id="tr-course" maxlength="120" list="tr-courses" value="' + esc(v.course) + '"><datalist id="tr-courses">' + d.required.map(function (q) { return '<option value="' + esc(q.course) + '">'; }).join("") + "</datalist>" +
            '<label for="tr-provider">Provider <span class="muted small">(optional)</span></label><input type="text" id="tr-provider" maxlength="120" value="' + esc(v.provider) + '">' +
            '<div class="grid-2"><div><label for="tr-done">Completed</label><input type="date" id="tr-done" value="' + esc(v.completedOn) + '"></div>' +
            '<div><label for="tr-exp">Expires <span class="muted small">(if it needs renewing)</span></label><input type="date" id="tr-exp" value="' + esc(v.expiresOn || "") + '"></div></div>' +
            '<label for="tr-note">Note <span class="muted small">(optional)</span></label><input type="text" id="tr-note" maxlength="500" value="' + esc(v.note || "") + '">' +
            '<label>Certificate</label><label class="drop-zone"><input type="file" id="tr-file" accept=".pdf,.jpg,.jpeg,.png" hidden>' + icon("upload") + '<span id="tr-file-name">' + (rec && rec.certificate ? "Replace " + esc(rec.certificate.fileName) : "Add a PDF or photo of the certificate") + "</span></label>" +
            '<div class="form-error" id="tr-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save</button></div></form>'
        );
        $("#tr-file", m.el).addEventListener("change", function (e) { file = e.target.files[0] || null; $("#tr-file-name", m.el).textContent = file ? file.name : "Add a PDF or photo of the certificate"; });
        $("#tr-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            const meta = {
                id: rec ? rec.id : undefined, personId: $("#tr-person", m.el) ? $("#tr-person", m.el).value || state.me.id : undefined,
                course: $("#tr-course", m.el).value, provider: $("#tr-provider", m.el).value, completedOn: $("#tr-done", m.el).value,
                expiresOn: $("#tr-exp", m.el).value, note: $("#tr-note", m.el).value, fileName: file ? file.name : "", verified: rec ? rec.verified : false,
            };
            try {
                const r = await uploadJson("/api/training", "X-Training", meta, file);
                if (r.user) { state.me = r.user; renderChrome(); }
                closeModal();
                toast("Training saved.");
                render();
            } catch (err) { formError($("#tr-error", m.el), err.message); }
        });
    }

    // Sends a file (or nothing) as the body with its details in a header.
    async function uploadJson(path, header, meta, file) {
        const headers = { "Content-Type": "application/octet-stream" };
        headers[header] = encodeURIComponent(JSON.stringify(meta));
        const res = await fetch(path, { method: "POST", headers: headers, body: file || new Blob([]) });
        const r = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(r.error || "Something went wrong.");
        return r;
    }

    // ================= HR cases =================

    async function viewCases(root, current) {
        const d = await api("/api/cases");
        if (!current()) return;
        let filter = state.caseFilter || "open";
        root.innerHTML =
            '<div class="page-head"><div><h1>HR cases</h1><p class="muted">Disciplinary, grievance, capability and investigation records. Only people with the HR cases permission can see this page. Every time a case is opened it’s recorded in the activity log.</p></div>' +
            '<div class="page-actions"><button type="button" class="btn btn-primary" id="cs-new">' + icon("plus") + "Open a case</button></div></div>" +
            '<div class="company-tabs" id="cs-tabs"><button type="button" data-f="open">Open</button><button type="button" data-f="warnings">Live warnings</button><button type="button" data-f="closed">Closed</button><button type="button" data-f="">All</button></div>' +
            '<div id="cs-body"></div>';
        function draw() {
            $$("#cs-tabs [data-f]").forEach(function (b) { b.classList.toggle("active", b.dataset.f === filter); });
            const list = d.cases.filter(function (c) { return !filter || (filter === "warnings" ? c.liveWarning : c.status === filter); });
            $("#cs-body").innerHTML = list.length ? '<div class="table-card"><table class="table"><thead><tr><th>Case</th><th>Employee</th><th>Type</th><th>Opened</th><th>Status</th><th class="col-actions"></th></tr></thead><tbody>' +
                list.map(function (c) {
                    return '<tr data-case="' + c.id + '"><td><strong>' + esc(c.number) + '</strong><div class="muted small">' + esc(c.title) + "</div></td>" +
                        '<td data-label="Employee"><div class="emp-cell">' + avatar(c.person, "sm") + '<div><div class="emp-name">' + esc(c.person.displayName) + '</div><div class="muted small">' + esc(c.person.jobTitle || "") + "</div></div></div></td>" +
                        '<td data-label="Type">' + esc(c.typeLabel) + '</td><td data-label="Opened" class="nowrap">' + esc(fmtDate(c.openedOn + "T12:00:00")) + "</td>" +
                        '<td data-label="Status">' + (c.status === "open" ? '<span class="badge badge-yellow">Open</span>' : '<span class="badge">' + esc(c.outcomeLabel) + "</span>") +
                        (c.liveWarning ? '<div class="small danger-text">Warning live until ' + esc(fmtDate(c.warningExpires + "T12:00:00")) + "</div>" : "") + "</td>" +
                        '<td class="col-actions"><button type="button" class="btn btn-ghost btn-small">' + icon("eye") + "Open</button></td></tr>";
                }).join("") + "</tbody></table></div>" : '<div class="empty-page">' + icon("shield", "big") + "<h2>No cases here</h2></div>";
        }
        root.addEventListener("click", function (e) {
            const f = e.target.closest("[data-f]");
            if (f) { filter = state.caseFilter = f.dataset.f; return draw(); }
            if (e.target.closest("#cs-new")) return openCaseForm(d);
            const r = e.target.closest("[data-case]");
            if (r) openCase(d, r.dataset.case);
        });
        draw();
    }

    function openCaseForm(d) {
        const m = openModal(
            '<h2 class="modal-title">Open a case</h2><form id="cf-form" novalidate>' +
            '<div class="grid-2"><div><label for="cf-person">Employee</label><select id="cf-person"><option value="">Choose…</option>' + d.people.map(function (p) { return '<option value="' + p.id + '">' + esc(p.displayName) + "</option>"; }).join("") + "</select></div>" +
            '<div><label for="cf-type">Type</label><select id="cf-type">' + Object.keys(d.types).map(function (k) { return '<option value="' + k + '">' + esc(d.types[k]) + "</option>"; }).join("") + "</select></div></div>" +
            '<label for="cf-title">Title</label><input type="text" id="cf-title" maxlength="150" placeholder="e.g. Repeated lateness">' +
            '<label for="cf-sum">Summary</label><textarea id="cf-sum" rows="4" maxlength="3000"></textarea>' +
            '<label for="cf-date">Opened on</label><input type="date" id="cf-date" value="' + isoDay(new Date()) + '">' +
            '<div class="form-error" id="cf-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Open case</button></div></form>'
        );
        $("#cf-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                const r = await api("/api/cases", { personId: $("#cf-person", m.el).value, type: $("#cf-type", m.el).value, title: $("#cf-title", m.el).value, summary: $("#cf-sum", m.el).value, openedOn: $("#cf-date", m.el).value });
                closeModal();
                toast("Case " + r.case.number + " opened.");
                render();
            } catch (err) { formError($("#cf-error", m.el), err.message); }
        });
    }

    async function openCase(d, id) {
        let c;
        try { c = (await api("/api/cases/" + id)).case; } catch (err) { return toast(err.message); }
        const m = openModal(
            '<div class="case-head"><div><span class="eyebrow">' + esc(c.number) + " · " + esc(c.typeLabel) + '</span><h2 class="modal-title">' + esc(c.title) + "</h2>" +
            '<div class="emp-cell">' + avatar(c.person, "sm") + "<span>" + esc(c.person.displayName) + ' <span class="muted small">· ' + esc(c.person.jobTitle || "") + "</span></span></div></div>" +
            (c.status === "open" ? '<span class="badge badge-yellow">Open</span>' : '<span class="badge">' + esc(c.outcomeLabel) + "</span>") + "</div>" +
            (c.summary ? '<p class="case-summary">' + esc(c.summary).replace(/\n/g, "<br>") + "</p>" : "") +
            (c.status === "closed" ? '<div class="banner ' + (c.liveWarning ? "banner-warn" : "") + '"><div><strong>Outcome:</strong> ' + esc(c.outcomeLabel) + " on " + esc(fmtDate(c.outcomeDate + "T12:00:00")) +
                (c.warningExpires ? " · warning " + (c.liveWarning ? "live until " : "expired ") + esc(fmtDate(c.warningExpires + "T12:00:00")) : "") + "</div></div>" : "") +
            '<h3 class="detail-head">Timeline</h3>' +
            '<form id="ce-form" class="case-entry"><select id="ce-kind">' + Object.keys(d.entryKinds).map(function (k) { return '<option value="' + k + '">' + esc(d.entryKinds[k]) + "</option>"; }).join("") + '</select><input type="date" id="ce-date" value="' + isoDay(new Date()) + '">' +
            '<textarea id="ce-text" rows="2" maxlength="5000" placeholder="What happened, who was there, what was agreed…"></textarea><button type="submit" class="btn btn-ghost">' + icon("plus") + "Add</button></form>" +
            (c.entries.length ? '<ol class="case-timeline">' + c.entries.map(function (e) {
                return '<li><div class="ct-head"><span class="badge badge-soft">' + esc(e.kindLabel) + "</span><strong>" + esc(fmtDate(e.date + "T12:00:00")) + '</strong><span class="muted small">' + esc(e.byName) + "</span></div><p>" + esc(e.text).replace(/\n/g, "<br>") + "</p></li>";
            }).join("") + "</ol>" : '<p class="muted small">Nothing recorded yet.</p>') +
            '<h3 class="detail-head">Files</h3>' +
            (c.files.length ? '<div class="sf-files">' + c.files.map(function (f) {
                return '<a class="claim-receipt" href="/api/cases/' + c.id + "/files/" + f.id + '" target="_blank" rel="noopener">' + icon("file") + esc(f.title) + ' <span class="muted small">(' + esc(f.fileName) + ")</span></a>";
            }).join("") + "</div>" : "") +
            '<label class="btn btn-ghost btn-small case-upload">' + icon("upload") + 'Attach a file<input type="file" id="cs-file" hidden></label>' +
            '<div class="form-error" id="cs-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost danger-text" data-ca="delete">' + icon("trash") + "Delete case</button>" +
            (c.status === "open" ? '<button type="button" class="btn btn-primary" data-ca="close">Close with outcome</button>' : '<button type="button" class="btn btn-ghost" data-ca="reopen">Reopen</button>') + "</div>",
            { wide: true }
        );
        $("#ce-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try { await api("/api/cases/" + c.id + "/entry", { kind: $("#ce-kind", m.el).value, date: $("#ce-date", m.el).value, text: $("#ce-text", m.el).value }); openCase(d, c.id); } catch (err) { formError($("#cs-error", m.el), err.message); }
        });
        $("#cs-file", m.el).addEventListener("change", async function (e) {
            const file = e.target.files[0];
            if (!file) return;
            try { await uploadJson("/api/cases/" + c.id + "/files", "X-Document", { fileName: file.name, title: file.name.replace(/\.[^.]+$/, "") }, file); openCase(d, c.id); } catch (err) { formError($("#cs-error", m.el), err.message); }
        });
        m.el.addEventListener("click", async function (e) {
            const b = e.target.closest("[data-ca]");
            if (!b) return;
            try {
                if (b.dataset.ca === "close") return openCaseClose(d, c);
                if (b.dataset.ca === "delete" && !(await confirmDialog({ title: "Delete " + c.number + "?", message: "The case, its timeline and files will be permanently deleted.", confirmLabel: "Delete", danger: true }))) return;
                await api("/api/cases/" + c.id + "/" + b.dataset.ca, {});
                closeModal();
                toast(b.dataset.ca === "delete" ? "Case deleted." : "Case reopened.");
                render();
            } catch (err) { formError($("#cs-error", m.el), err.message); }
        });
    }

    function openCaseClose(d, c) {
        const m = openModal(
            '<h2 class="modal-title">Close ' + esc(c.number) + "</h2><form id=\"cc-form\" novalidate>" +
            '<label for="cc-out">Outcome</label><select id="cc-out">' + Object.keys(d.outcomes).filter(Boolean).map(function (k) { return '<option value="' + k + '">' + esc(d.outcomes[k]) + "</option>"; }).join("") + "</select>" +
            '<div class="grid-2"><div><label for="cc-date">Outcome date</label><input type="date" id="cc-date" value="' + isoDay(new Date()) + '"></div>' +
            '<div><label for="cc-exp">Warning expires <span class="muted small">(warnings only)</span></label><input type="date" id="cc-exp"></div></div>' +
            '<p class="muted small">Leave the expiry blank to use the usual period: 6 months for informal and first written warnings, 12 months for a final written warning.</p>' +
            '<div class="form-error" id="cc-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Close case</button></div></form>'
        );
        $("#cc-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try { await api("/api/cases/" + c.id + "/close", { outcome: $("#cc-out", m.el).value, outcomeDate: $("#cc-date", m.el).value, warningExpires: $("#cc-exp", m.el).value }); closeModal(); toast("Case closed."); render(); } catch (err) { formError($("#cc-error", m.el), err.message); }
        });
    }

    // ================= Jobs and recruitment =================

    async function viewJobs(root, current) {
        const d = await api("/api/jobs");
        if (!current()) return;
        root.innerHTML =
            '<div class="page-head"><div><h1>Jobs</h1><p class="muted">Open roles across HN Group. Apply yourself, or refer someone you know.' + (d.canManage ? " As a recruiter you can post vacancies and move applicants through to hire." : "") + "</p></div>" +
            (d.canManage ? '<div class="page-actions"><button type="button" class="btn btn-primary" id="jb-new">' + icon("plus") + "Post a vacancy</button></div>" : "") + "</div>" +
            (d.vacancies.length ? '<div class="job-list">' + d.vacancies.map(function (v) {
                return '<article class="job-card' + (v.open ? "" : " job-closed") + '" data-job="' + v.id + '"><div class="job-head"><div><h2>' + esc(v.title) + "</h2>" +
                    '<div class="job-meta"><span>' + icon("building") + esc(v.company) + "</span>" + (v.location ? "<span>" + icon("pin") + esc(v.location) + "</span>" : "") +
                    "<span>" + icon("clock") + esc(v.contractLabel) + "</span>" + (v.salary ? "<span>" + icon("pound") + esc(v.salary) + "</span>" : "") +
                    (v.publicListing && d.canManage ? "<span>" + icon("monitor") + "On the website</span>" : "") + "</div></div>" +
                    (v.open ? (v.closingDate ? '<span class="badge badge-soft">Closes ' + esc(fmtDate(v.closingDate + "T12:00:00")) + "</span>" : '<span class="badge badge-green">Open</span>') : '<span class="badge">' + (v.status === "filled" ? "Filled" : "Closed") + "</span>") + "</div>" +
                    (v.description ? '<div class="job-desc">' + richText(v.description) + "</div>" : "") +
                    '<div class="job-foot">' + (v.hiringManagerName ? '<span class="muted small">Hiring manager: ' + esc(v.hiringManagerName) + "</span>" : "<span></span>") +
                    '<div class="btn-row">' + (v.myApplication ? '<span class="badge badge-soft">You applied · ' + esc(v.myApplication.stageLabel) + "</span>" : "") +
                    (v.open ? '<button type="button" class="btn btn-ghost btn-small" data-jb="refer">' + icon("users") + "Refer someone</button>" + (v.applied || state.me.system ? "" : '<button type="button" class="btn btn-primary btn-small" data-jb="apply">Apply</button>') : "") + "</div></div>" +
                    (d.canManage ? jobPipelineHtml(d, v) : "") + "</article>";
            }).join("") + "</div>" : '<div class="empty-page">' + icon("briefcase", "big") + "<h2>No vacancies right now</h2><p class=\"muted\">New roles will appear here.</p></div>");
        root.addEventListener("click", async function (e) {
            if (e.target.closest("#jb-new")) return openVacancyForm(d, null);
            const b = e.target.closest("[data-jb]");
            if (!b) return;
            const v = d.vacancies.find(function (x) { return x.id === b.closest("[data-job]").dataset.job; });
            const act = b.dataset.jb;
            if (act === "apply" || act === "refer") return openApplyForm(v, act === "apply", d);
            if (act === "edit") return openVacancyForm(d, v);
            if (act === "applicant") return openApplicant(d, v, v.applicants.find(function (a) { return a.id === b.dataset.id; }));
            try {
                if (act === "delete" && !(await confirmDialog({ title: "Delete this vacancy?", message: "Its applicants and CVs will be deleted too.", confirmLabel: "Delete", danger: true }))) return;
                await api("/api/jobs/" + v.id + (act === "delete" ? "/delete" : "/status"), { status: act });
                toast(act === "delete" ? "Vacancy deleted." : "Vacancy " + (act === "open" ? "reopened." : act + "."));
                render();
            } catch (err) { toast(err.message); }
        });
    }

    function jobPipelineHtml(d, v) {
        const stages = ["applied", "screening", "interview", "offer", "hired"];
        return '<div class="job-pipeline"><div class="jp-head"><strong>' + v.applicants.length + (v.applicants.length === 1 ? " applicant" : " applicants") + "</strong>" +
            '<div class="btn-row"><button type="button" class="btn btn-ghost btn-small" data-jb="edit">' + icon("edit") + "Edit</button>" +
            (v.status === "open" ? '<button type="button" class="btn btn-ghost btn-small" data-jb="closed">Close</button>' : '<button type="button" class="btn btn-ghost btn-small" data-jb="open">Reopen</button>') +
            '<button type="button" class="icon-btn" data-jb="delete" aria-label="Delete vacancy">' + icon("trash") + "</button></div></div>" +
            '<div class="jp-cols">' + stages.map(function (st) {
                const list = v.applicants.filter(function (a) { return a.stage === st; });
                return '<div class="jp-col"><div class="jp-col-head">' + esc(d.stages[st]) + ' <span class="tab-count">' + list.length + "</span></div>" +
                    list.map(function (a) {
                        return '<button type="button" class="jp-card" data-jb="applicant" data-id="' + a.id + '"><strong>' + esc(a.name) + '</strong><span class="muted small">' + esc(a.sourceLabel) + (a.cv ? " · CV" : "") + "</span></button>";
                    }).join("") + "</div>";
            }).join("") + "</div>" +
            (v.applicants.some(function (a) { return a.stage === "rejected" || a.stage === "withdrawn"; }) ? '<p class="muted small">' + v.applicants.filter(function (a) { return a.stage === "rejected" || a.stage === "withdrawn"; }).length + " not progressing or withdrawn.</p>" : "") + "</div>";
    }

    function openVacancyForm(d, v) {
        v = v || { title: "", company: d.companies[0], location: "", contract: "full-time", salary: "", description: "", closingDate: "", hiringManagerId: "" };
        const m = openModal(
            '<h2 class="modal-title">' + (v.id ? "Edit vacancy" : "Post a vacancy") + "</h2><form id=\"vf-form\" novalidate>" +
            '<label for="vf-title">Job title</label><input type="text" id="vf-title" maxlength="120" value="' + esc(v.title) + '">' +
            '<div class="grid-2"><div><label for="vf-company">Company</label><select id="vf-company">' + d.companies.map(function (c) { return "<option" + (c === v.company ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></div>" +
            '<div><label for="vf-contract">Contract</label><select id="vf-contract">' + Object.keys(d.contracts).map(function (k) { return '<option value="' + k + '"' + (k === v.contract ? " selected" : "") + ">" + esc(d.contracts[k]) + "</option>"; }).join("") + "</select></div></div>" +
            '<div class="grid-2"><div><label for="vf-loc">Location</label><input type="text" id="vf-loc" maxlength="120" value="' + esc(v.location) + '" placeholder="e.g. Manchester / Remote"></div>' +
            '<div><label for="vf-salary">Salary</label><input type="text" id="vf-salary" maxlength="80" value="' + esc(v.salary) + '" placeholder="e.g. £24,000 – £28,000"></div></div>' +
            '<div class="grid-2"><div><label for="vf-close">Closing date <span class="muted small">(optional)</span></label><input type="date" id="vf-close" value="' + esc(v.closingDate || "") + '"></div>' +
            '<div><label for="vf-mgr">Hiring manager</label><select id="vf-mgr"><option value="">None</option>' + d.people.map(function (p) { return '<option value="' + p.id + '"' + (p.id === v.hiringManagerId ? " selected" : "") + ">" + esc(p.displayName) + "</option>"; }).join("") + "</select></div></div>" +
            '<label for="vf-desc">Description</label><textarea id="vf-desc" rows="7" maxlength="6000" placeholder="What the role involves, who you’re looking for…">' + esc(v.description) + "</textarea>" +
            '<label class="inline-check"><input type="checkbox" id="vf-public"' + (v.publicListing ? " checked" : "") + "> Advertise on the HN Group website (hngroup.org.uk/careers), where anyone can apply with a CV</label>" +
            '<div class="form-error" id="vf-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">' + (v.id ? "Save" : "Post vacancy") + "</button></div></form>",
            { wide: true }
        );
        $("#vf-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await api(v.id ? "/api/jobs/" + v.id : "/api/jobs", {
                    title: $("#vf-title", m.el).value, company: $("#vf-company", m.el).value, contract: $("#vf-contract", m.el).value, location: $("#vf-loc", m.el).value,
                    salary: $("#vf-salary", m.el).value, closingDate: $("#vf-close", m.el).value, hiringManagerId: $("#vf-mgr", m.el).value, description: $("#vf-desc", m.el).value,
                    publicListing: $("#vf-public", m.el).checked,
                });
                closeModal();
                toast(v.id ? "Vacancy saved." : "Vacancy posted. Everyone has been notified.");
                render();
            } catch (err) { formError($("#vf-error", m.el), err.message); }
        });
    }

    function openApplyForm(v, self, d) {
        let file = null;
        const m = openModal(
            '<h2 class="modal-title">' + (self ? "Apply for " : "Refer someone for ") + esc(v.title) + "</h2><form id=\"ap-form\" novalidate>" +
            (self ? '<p class="muted">Your name and current role are sent to the recruiters. Add a note about why you’d like the job.</p>'
                : '<div class="grid-2"><div><label for="ap-name">Their name</label><input type="text" id="ap-name" maxlength="120"></div><div><label for="ap-email">Their email</label><input type="email" id="ap-email" maxlength="160"></div></div>' +
                  '<label for="ap-phone">Phone <span class="muted small">(optional)</span></label><input type="tel" id="ap-phone" maxlength="40">' +
                  (d.canManage ? '<label for="ap-source">Source</label><select id="ap-source">' + Object.keys(d.sources).filter(function (k) { return k !== "internal"; }).map(function (k) { return '<option value="' + k + '">' + esc(d.sources[k]) + "</option>"; }).join("") + "</select>" : "")) +
            '<label for="ap-msg">' + (self ? "Why you’d be great" : "Why you’re recommending them") + '</label><textarea id="ap-msg" rows="4" maxlength="3000"></textarea>' +
            '<label>CV <span class="muted small">(optional)</span></label><label class="drop-zone"><input type="file" id="ap-file" accept=".pdf,.doc,.docx,.odt,.rtf,.txt" hidden>' + icon("upload") + '<span id="ap-file-name">Add a CV (PDF or Word)</span></label>' +
            '<div class="form-error" id="ap-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">' + (self ? "Send application" : "Send referral") + "</button></div></form>"
        );
        $("#ap-file", m.el).addEventListener("change", function (e) { file = e.target.files[0] || null; $("#ap-file-name", m.el).textContent = file ? file.name : "Add a CV (PDF or Word)"; });
        $("#ap-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await uploadJson("/api/jobs/" + v.id + "/apply", "X-Applicant", {
                    self: self, name: self ? "" : $("#ap-name", m.el).value, email: self ? "" : $("#ap-email", m.el).value, phone: self ? "" : $("#ap-phone", m.el).value,
                    source: $("#ap-source", m.el) ? $("#ap-source", m.el).value : "", message: $("#ap-msg", m.el).value, fileName: file ? file.name : "",
                }, file);
                closeModal();
                toast(self ? "Application sent. Good luck!" : "Referral sent. Thank you!");
                render();
            } catch (err) { formError($("#ap-error", m.el), err.message); }
        });
    }

    function openApplicant(d, v, a) {
        const m = openModal(
            '<span class="eyebrow">' + esc(v.title) + '</span><h2 class="modal-title">' + esc(a.name) + "</h2>" +
            '<div class="ap-facts"><span class="badge">' + esc(a.stageLabel) + "</span><span>" + esc(a.sourceLabel) + (a.referredByName ? " · referred by " + esc(a.referredByName) : "") + "</span>" +
            (a.email ? '<a href="mailto:' + esc(a.email) + '">' + esc(a.email) + "</a>" : "") + (a.phone ? "<span>" + esc(a.phone) + "</span>" : "") +
            (a.cv ? '<a class="claim-receipt" href="/api/jobs/applicants/' + a.id + '/cv" target="_blank" rel="noopener">' + icon("file") + esc(a.cv.fileName) + "</a>" : "") + "</div>" +
            (a.message ? '<p class="case-summary">' + esc(a.message).replace(/\n/g, "<br>") + "</p>" : "") +
            (a.stage !== "hired" ? '<label for="ap-stage">Move to</label><div class="inline-form"><select id="ap-stage">' + Object.keys(d.stages).filter(function (k) { return k !== "hired"; }).map(function (k) {
                return '<option value="' + k + '"' + (k === a.stage ? " selected" : "") + ">" + esc(d.stages[k]) + "</option>";
            }).join("") + '</select><button type="button" class="btn btn-ghost" id="ap-move">Move</button><button type="button" class="btn btn-primary" id="ap-hire">' + icon("tick") + "Hire</button></div>" : "") +
            '<h3 class="detail-head">Notes</h3><form id="ap-note" class="inline-form"><input type="text" id="ap-note-t" maxlength="3000" placeholder="Interview feedback, next steps…"><button type="submit" class="btn btn-ghost">Add</button></form>' +
            (a.notes.length ? '<ol class="case-timeline">' + a.notes.map(function (n) {
                return "<li" + (n.auto ? ' class="ct-auto"' : "") + '><div class="ct-head"><strong>' + esc(n.byName) + '</strong><span class="muted small">' + esc(fmtDateTime(n.at)) + "</span></div><p>" + esc(n.text) + "</p></li>";
            }).join("") + "</ol>" : "") +
            '<div class="form-error" id="ap-err" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost danger-text" id="ap-del">' + icon("trash") + 'Remove applicant</button><button type="button" class="btn btn-primary" data-close>Done</button></div>',
            { wide: true }
        );
        async function act(path, body, msg) {
            try { await api("/api/jobs/applicants/" + a.id + "/" + path, body); closeModal(); toast(msg); render(); } catch (err) { formError($("#ap-err", m.el), err.message); }
        }
        if ($("#ap-move", m.el)) $("#ap-move", m.el).addEventListener("click", function () { act("stage", { stage: $("#ap-stage", m.el).value }, "Applicant moved."); });
        if ($("#ap-hire", m.el)) $("#ap-hire", m.el).addEventListener("click", function () { openHireForm(d, v, a); });
        $("#ap-note", m.el).addEventListener("submit", function (e) { e.preventDefault(); act("note", { text: $("#ap-note-t", m.el).value }, "Note added."); });
        $("#ap-del", m.el).addEventListener("click", async function () {
            if (await confirmDialog({ title: "Remove " + a.name + "?", message: "Their application and CV will be deleted.", confirmLabel: "Remove", danger: true })) act("delete", {}, "Applicant removed.");
        });
    }

    function openHireForm(d, v, a) {
        const parts = a.name.split(/\s+/);
        const m = openModal(
            '<h2 class="modal-title">Hire ' + esc(a.name) + "</h2><form id=\"hf-form\" novalidate>" +
            (a.personId ? '<p class="muted">' + esc(a.name) + " already works here. They’ll be marked as hired; update their job title and company in Employee Management.</p>" :
                '<p class="muted">This creates their employee record (with a work email address) and starts their onboarding checklist. You can set up their login from Employee Management.</p>' +
                '<div class="grid-2"><div><label for="hf-first">First name</label><input type="text" id="hf-first" maxlength="60" value="' + esc(parts[0] || "") + '"></div>' +
                '<div><label for="hf-last">Last name</label><input type="text" id="hf-last" maxlength="60" value="' + esc(parts.slice(1).join(" ")) + '"></div></div>' +
                '<div class="grid-2"><div><label for="hf-title">Job title</label><input type="text" id="hf-title" maxlength="100" value="' + esc(v.title) + '"></div>' +
                '<div><label for="hf-start">Start date</label><input type="date" id="hf-start"></div></div>' +
                '<div class="grid-2"><div><label for="hf-company">Company</label><select id="hf-company">' + d.companies.map(function (c) { return "<option" + (c === v.company ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></div>" +
                '<div><label for="hf-sup">Supervisor</label><select id="hf-sup"><option value="">None</option>' + d.people.map(function (p) { return '<option value="' + p.id + '"' + (p.id === v.hiringManagerId ? " selected" : "") + ">" + esc(p.displayName) + "</option>"; }).join("") + "</select></div></div>") +
            '<label class="inline-check"><input type="checkbox" id="hf-close" checked> Mark the vacancy as filled</label>' +
            '<div class="form-error" id="hf-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">' + icon("tick") + "Hire</button></div></form>"
        );
        $("#hf-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            const val = function (id) { const el = $(id, m.el); return el ? el.value : ""; };
            try {
                const r = await api("/api/jobs/applicants/" + a.id + "/hire", {
                    firstName: val("#hf-first"), lastName: val("#hf-last"), jobTitle: val("#hf-title"), startDate: val("#hf-start"),
                    company: val("#hf-company"), supervisorId: val("#hf-sup"), closeVacancy: $("#hf-close", m.el).checked,
                });
                closeModal();
                toast(a.personId ? "Marked as hired." : "Hired. Their employee record is ready" + (r.onboarding ? " and onboarding has started." : "."));
                render();
            } catch (err) { formError($("#hf-error", m.el), err.message); }
        });
    }

    // ================= Notifications =================

    const NOTE_ICONS = { leave: "sun", expense: "pound", payslip: "card", review: "star", helpdesk: "lifebuoy", kudos: "heart", idea: "flag", jobs: "briefcase", timesheet: "clock", status: "activity", training: "star", info: "bell" };

    function timeAgo(iso) {
        const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
        if (s < 60) return "just now";
        if (s < 3600) return Math.floor(s / 60) + " min ago";
        if (s < 86400) return Math.floor(s / 3600) + " hr ago";
        if (s < 7 * 86400) return Math.floor(s / 86400) + (s < 2 * 86400 ? " day ago" : " days ago");
        return fmtDate(iso);
    }

    function noteItemHtml(n) {
        return '<button type="button" class="note-item' + (n.read ? "" : " unread") + '" data-note="' + esc(n.id) + '" data-href="' + esc(n.link || "") + '">' +
            '<span class="note-icon">' + icon(NOTE_ICONS[n.type] || "bell") + '</span><span class="note-text"><span class="note-title">' + esc(n.title) + "</span>" +
            (n.body ? '<span class="note-body">' + esc(n.body) + "</span>" : "") + '<span class="note-time">' + esc(timeAgo(n.at)) + "</span></span></button>";
    }

    function bellHtml() {
        const n = state.me.notificationsUnread || 0;
        return '<button type="button" class="bell-btn" id="bell-btn" data-menu aria-haspopup="true" aria-expanded="false" aria-label="Notifications' + (n ? ", " + n + " unread" : "") + '">' + icon("bell") +
            (n ? '<span class="bell-count">' + (n > 99 ? "99+" : n) + "</span>" : "") + "</button>" +
            '<div class="menu menu-right bell-menu-panel" role="menu" hidden><div class="bell-head"><strong>Notifications</strong><button type="button" class="btn btn-link btn-small" data-bell="read-all">Mark all as read</button></div>' +
            '<div class="bell-list" id="bell-list"><p class="muted small">Loading…</p></div>' +
            '<a class="bell-foot" href="/notifications" data-link>See all notifications</a></div>';
    }

    async function loadBell() {
        const box = $("#bell-list");
        if (!box) return;
        try {
            const r = await api("/api/notifications");
            const extra = state.me.unreadAnnouncements ? '<a class="note-item unread" href="/announcements" data-link><span class="note-icon">' + icon("bell") + '</span><span class="note-text"><span class="note-title">' +
                state.me.unreadAnnouncements + " new announcement" + (state.me.unreadAnnouncements === 1 ? "" : "s") + '</span><span class="note-time">Workplace</span></span></a>' : "";
            box.innerHTML = extra + (r.items.length ? r.items.slice(0, 12).map(noteItemHtml).join("") : extra ? "" : '<div class="bell-empty">' + icon("bell") + "<p>You’re all caught up.</p></div>");
        } catch (err) { box.innerHTML = '<p class="muted small">' + esc(err.message) + "</p>"; }
    }

    async function openNote(el) {
        closeMenus();
        try {
            const r = await api("/api/notifications/read", { id: el.dataset.note });
            state.me.notificationsUnread = r.unread;
            renderChrome();
        } catch (e) { /* ignore */ }
        if (el.dataset.href) navigate(el.dataset.href);
        else if (window.location.pathname === "/notifications") render();
    }

    document.addEventListener("click", async function (e) {
        const n = e.target.closest("[data-note]");
        if (n) { e.preventDefault(); return openNote(n); }
        const b = e.target.closest("[data-bell]");
        if (b) {
            e.preventDefault();
            try {
                const r = await api("/api/notifications/" + (b.dataset.bell === "clear" ? "clear" : "read"), {});
                state.me.notificationsUnread = r.unread;
                renderChrome();
                if (window.location.pathname === "/notifications") render();
                else { const btn = $("#bell-btn"); if (btn) { toggleMenu(btn); loadBell(); } }
            } catch (err) { toast(err.message); }
        }
    });

    async function viewNotifications(root, current) {
        const r = await api("/api/notifications");
        if (!current()) return;
        root.innerHTML = '<div class="page-head"><div><h1>Notifications</h1><p class="muted">Everything that’s happened that involves you: approvals, replies, payslips, kudos and more. Kept for 90 days.</p></div>' +
            '<div class="page-actions"><button type="button" class="btn btn-ghost" data-bell="read-all">' + icon("tick") + "Mark all as read</button>" +
            (r.items.length ? '<button type="button" class="btn btn-ghost danger-text" data-bell="clear">' + icon("trash") + "Clear all</button>" : "") + "</div></div>" +
            (r.items.length ? '<section class="panel note-page">' + r.items.map(noteItemHtml).join("") + "</section>"
                : '<div class="empty-page">' + icon("bell", "big") + '<h2>Nothing yet</h2><p class="muted">When something needs you or happens to you, it’ll show up here and on the bell.</p></div>');
    }

    // ================= Kudos and milestones =================

    const MILESTONE_ICONS = { birthday: "gift", anniversary: "star", starter: "smile" };

    function milestoneHtml(x) {
        const day = x.today ? "Today" : new Date(x.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
        return '<div class="ms-item ms-' + x.type + (x.today ? " ms-today" : "") + '">' + avatar(x.person, "md") +
            '<div class="ms-text"><span class="ms-title">' + icon(MILESTONE_ICONS[x.type]) + esc(x.title) + '</span><span class="muted small">' + esc(day) +
            (x.congrats ? " · " + x.congrats + " congratulation" + (x.congrats === 1 ? "" : "s") : "") + "</span></div>" +
            (x.self ? "" : '<button type="button" class="btn btn-small ms-congrats ' + (x.mine ? "btn-primary" : "btn-ghost") + '" data-congrats="' + esc(x.key) + '" title="' + (x.mine ? "Congratulations sent" : "Say congratulations") + '" aria-label="Say congratulations">🎉</button>') + "</div>";
    }

    function kudosCardHtml(k) {
        return '<article class="kudos-card kv-' + esc(k.value) + '" data-kudos="' + k.id + '"><div class="kc-head"><span class="kc-value">' + esc(k.valueLabel) + "</span>" +
            '<span class="muted small">' + esc(timeAgo(k.at)) + "</span>" + (k.canDelete ? '<button type="button" class="icon-btn icon-btn-sm" data-kd="delete" aria-label="Delete">' + icon("trash") + "</button>" : "") + "</div>" +
            '<div class="kc-people">' + avatar(k.from, "sm") + '<span class="kc-arrow">' + icon("chevronRight") + "</span>" + k.to.map(function (p) { return avatar(p, "sm"); }).join("") +
            '<span class="kc-names"><strong>' + esc(k.from.displayName) + "</strong> thanked <strong>" + k.to.map(function (p) { return esc(p.displayName); }).join(", ") + "</strong></span></div>" +
            '<p class="kc-msg">' + esc(k.message) + "</p>" +
            '<div class="kc-reacts">' + k.reactions.map(function (r) {
                return '<button type="button" class="react-btn' + (r.mine ? " mine" : "") + '" data-kr="' + r.emoji + '">' + r.emoji + (r.count ? " " + r.count : "") + "</button>";
            }).join("") + "</div></article>";
    }

    async function viewKudos(root, current) {
        const d = await api("/api/kudos");
        if (!current()) return;
        root.innerHTML = '<div class="page-head"><div><h1>Kudos</h1><p class="muted">Thank a colleague publicly for something great. Birthdays, work anniversaries and new starters show up here too.</p></div>' +
            (state.me.system ? "" : '<div class="page-actions"><button type="button" class="btn btn-primary" id="kd-new">' + icon("heart") + "Give kudos</button></div>") + "</div>" +
            '<div class="kudos-layout"><div class="kudos-feed" id="kd-feed">' + (d.posts.length ? d.posts.map(kudosCardHtml).join("") :
                '<div class="empty-page">' + icon("heart", "big") + '<h2>No kudos yet</h2><p class="muted">Be the first to thank someone.</p></div>') + "</div>" +
            '<aside class="kudos-side"><section class="panel"><h2 class="panel-title">' + icon("gift") + "Celebrations</h2>" +
            (d.milestones.length ? '<div class="ms-list">' + d.milestones.map(milestoneHtml).join("") + "</div>" : '<p class="muted small">No birthdays, anniversaries or new starters in the next two weeks.</p>') + "</section>" +
            (d.leaders.length ? '<section class="panel"><h2 class="panel-title">' + icon("star") + "Most thanked this month</h2><ol class=\"kd-leaders\">" + d.leaders.map(function (p) {
                return "<li>" + avatar(p, "sm") + '<span class="emp-name">' + esc(p.displayName) + '</span><span class="badge badge-soft">' + p.count + "</span></li>";
            }).join("") + "</ol></section>" : "") + "</aside></div>";
        root.addEventListener("click", async function (e) {
            if (e.target.closest("#kd-new")) return openKudosForm(d);
            const cg = e.target.closest("[data-congrats]");
            if (cg) return sendCongrats(cg);
            const card = e.target.closest("[data-kudos]");
            if (!card) return;
            const id = card.dataset.kudos;
            const r = e.target.closest("[data-kr]");
            try {
                if (r) {
                    const res = await api("/api/kudos/" + id + "/react", { emoji: r.dataset.kr });
                    if (res.post) card.outerHTML = kudosCardHtml(res.post);
                } else if (e.target.closest('[data-kd="delete"]')) {
                    if (!(await confirmDialog({ title: "Delete this kudos?", message: "It’ll be removed for everyone.", confirmLabel: "Delete", danger: true }))) return;
                    await api("/api/kudos/" + id + "/delete", {});
                    card.remove();
                }
            } catch (err) { toast(err.message); }
        });
    }

    async function sendCongrats(btn) {
        try {
            const r = await api("/api/kudos/congrats", { key: btn.dataset.congrats });
            btn.classList.toggle("btn-primary", r.added);
            btn.classList.toggle("btn-ghost", !r.added);
            btn.title = r.added ? "Congratulations sent" : "Say congratulations";
            if (r.added) toast("Congratulations sent!");
        } catch (err) { toast(err.message); }
    }

    function openKudosForm(d, preset) {
        const chosen = preset ? [preset] : [];
        const m = openModal(
            '<h2 class="modal-title">Give kudos</h2><form id="kf-form" novalidate>' +
            '<label for="kf-search">Who are you thanking?</label><div class="kf-chosen" id="kf-chosen"></div>' +
            '<input type="search" id="kf-search" placeholder="Search for a colleague" autocomplete="off"><div class="kf-results" id="kf-results"></div>' +
            '<label>For</label><div class="kf-values">' + Object.keys(d.values).map(function (k, i) {
                return '<label class="kf-value kv-' + k + '"><input type="radio" name="kf-value" value="' + k + '"' + (i === 0 ? " checked" : "") + "><span>" + esc(d.values[k]) + "</span></label>";
            }).join("") + "</div>" +
            '<label for="kf-msg">What did they do?</label><textarea id="kf-msg" rows="3" maxlength="600" placeholder="Thanks for staying late to get the launch over the line!"></textarea>' +
            '<div class="form-error" id="kf-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">' + icon("heart") + "Send kudos</button></div></form>"
        );
        function drawChosen() {
            $("#kf-chosen", m.el).innerHTML = chosen.map(function (id) {
                const p = d.people.find(function (x) { return x.id === id; });
                return '<span class="kf-chip">' + avatar(p, "sm") + esc(p.displayName) + '<button type="button" data-unpick="' + id + '" aria-label="Remove">' + icon("x") + "</button></span>";
            }).join("");
        }
        function search() {
            const q = $("#kf-search", m.el).value.trim().toLowerCase();
            $("#kf-results", m.el).innerHTML = q ? d.people.filter(function (p) { return chosen.indexOf(p.id) === -1 && (p.displayName + " " + p.jobTitle).toLowerCase().indexOf(q) !== -1; }).slice(0, 6).map(function (p) {
                return '<button type="button" class="kf-result" data-pick="' + p.id + '">' + avatar(p, "sm") + "<span>" + esc(p.displayName) + ' <span class="muted small">' + esc(p.jobTitle) + "</span></span></button>";
            }).join("") : "";
        }
        $("#kf-search", m.el).addEventListener("input", search);
        m.el.addEventListener("click", function (e) {
            const pick = e.target.closest("[data-pick]");
            if (pick) { chosen.push(pick.dataset.pick); $("#kf-search", m.el).value = ""; search(); drawChosen(); $("#kf-search", m.el).focus(); }
            const un = e.target.closest("[data-unpick]");
            if (un) { chosen.splice(chosen.indexOf(un.dataset.unpick), 1); drawChosen(); }
        });
        drawChosen();
        $("#kf-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await api("/api/kudos", { to: chosen, value: $("input[name=kf-value]:checked", m.el).value, message: $("#kf-msg", m.el).value });
                closeModal();
                toast("Kudos sent! 👏");
                if (window.location.pathname === "/kudos") render(); else navigate("/kudos");
            } catch (err) { formError($("#kf-error", m.el), err.message); }
        });
    }

    // Home page: celebrations this week and the latest kudos.
    function loadCelebrations(box) {
        if (!box) return;
        api("/api/kudos").then(function (d) {
            const soon = d.milestones.filter(function (x) { return x.date <= isoDay(new Date(Date.now() + 7 * 86400000)); });
            const latest = d.posts.slice(0, 2);
            if (!soon.length && !latest.length) return;
            box.hidden = false;
            box.innerHTML = '<div class="panel-head tight"><h2 class="section-title">' + icon("gift") + "Celebrations &amp; kudos</h2>" +
                '<a class="small link-arrow" href="/kudos" data-link>See all</a></div>' +
                (soon.length ? '<div class="ms-list">' + soon.slice(0, 4).map(milestoneHtml).join("") + "</div>" : "") +
                latest.map(function (k) {
                    return '<a class="home-kudos" href="/kudos" data-link><span class="kc-value">' + esc(k.valueLabel) + "</span><span><strong>" + esc(k.from.displayName) + "</strong> → <strong>" +
                        k.to.map(function (p) { return esc(p.displayName); }).join(", ") + '</strong></span><span class="muted small">' + esc(k.message.length > 90 ? k.message.slice(0, 90) + "…" : k.message) + "</span></a>";
                }).join("");
            box.addEventListener("click", function (e) {
                const cg = e.target.closest("[data-congrats]");
                if (cg) { e.preventDefault(); sendCongrats(cg); }
            });
        }).catch(function () {});
    }

    // ================= Ideas box =================

    async function viewIdeas(root, current) {
        const d = await api("/api/ideas");
        if (!current()) return;
        let filter = state.ideaFilter || "open";
        let sort = state.ideaSort || "votes";
        root.innerHTML = '<div class="page-head"><div><h1>Ideas</h1><p class="muted">Suggest ways to make HN Group better and vote for the ideas you like. Leadership reviews them and says what’s happening.</p></div>' +
            (state.me.system ? "" : '<div class="page-actions"><button type="button" class="btn btn-primary" id="id-new">' + icon("plus") + "Share an idea</button></div>") + "</div>" +
            '<div class="toolbar"><div class="company-tabs" id="id-tabs"><button type="button" data-f="open">Open</button><button type="button" data-f="planned">Planned &amp; in progress</button><button type="button" data-f="done">Done</button><button type="button" data-f="declined">Not going ahead</button><button type="button" data-f="mine">Mine</button></div>' +
            '<select id="id-sort" aria-label="Sort"><option value="votes">Most votes</option><option value="new">Newest</option></select></div>' +
            '<div id="id-list" class="idea-list"></div>';
        $("#id-sort").value = sort;
        function draw() {
            $$("#id-tabs [data-f]").forEach(function (b) { b.classList.toggle("active", b.dataset.f === filter); });
            const match = { open: ["new", "review"], planned: ["planned", "progress"], done: ["done"], declined: ["declined"] };
            const list = d.ideas.filter(function (i) { return filter === "mine" ? i.mine : match[filter].indexOf(i.status) !== -1; })
                .sort(function (a, b) { return sort === "votes" ? b.votes - a.votes || b.createdAt.localeCompare(a.createdAt) : b.createdAt.localeCompare(a.createdAt); });
            $("#id-list").innerHTML = list.length ? list.map(ideaHtml).join("") : '<div class="empty-page">' + icon("flag", "big") + '<h2>No ideas here yet</h2><p class="muted">Use <strong>Share an idea</strong> to get things started.</p></div>';
        }
        function ideaHtml(i) {
            return '<article class="idea-card" data-idea="' + i.id + '"><button type="button" class="vote-btn' + (i.voted ? " voted" : "") + '" data-ia="vote"' + (i.status === "done" || i.status === "declined" ? " disabled" : "") + ' aria-label="Vote">' +
                icon("chevronRight", "vote-up") + "<strong>" + i.votes + "</strong><span>vote" + (i.votes === 1 ? "" : "s") + "</span></button>" +
                '<div class="idea-main"><div class="idea-head"><h3>' + esc(i.title) + '</h3><span class="badge idea-st-' + i.status + '">' + esc(i.statusLabel) + "</span></div>" +
                (i.body ? '<p class="idea-body">' + esc(i.body).replace(/\n/g, "<br>") + "</p>" : "") +
                '<div class="idea-meta muted small"><span class="badge badge-soft">' + esc(i.categoryLabel) + "</span>" + (i.author ? esc(i.author.displayName) : "Anonymous") + " · " + esc(timeAgo(i.createdAt)) +
                " · " + i.comments.length + " comment" + (i.comments.length === 1 ? "" : "s") + "</div>" +
                (i.statusNote ? '<div class="idea-response">' + icon("message") + "<div><strong>" + esc(i.statusByName || "Leadership") + ":</strong> " + esc(i.statusNote) + "</div></div>" : "") +
                '<details class="idea-comments"><summary>Comments</summary>' + i.comments.map(function (c) {
                    return '<div class="ic-row">' + avatar(c.author, "sm") + "<div><strong>" + esc(c.author.displayName) + '</strong> <span class="muted small">' + esc(timeAgo(c.at)) + "</span><p>" + esc(c.text) + "</p></div></div>";
                }).join("") + '<form class="inline-form" data-ia-form><input type="text" maxlength="1500" placeholder="Add a comment" aria-label="Comment"><button type="submit" class="btn btn-ghost btn-small">Post</button></form></details>' +
                '<div class="idea-actions">' + (d.canManage ? '<button type="button" class="btn btn-ghost btn-small" data-ia="status">' + icon("edit") + "Update status</button>" : "") +
                (i.canDelete ? '<button type="button" class="btn btn-link btn-small danger-text" data-ia="delete">Delete</button>' : "") + "</div></div></article>";
        }
        $("#id-sort").addEventListener("change", function (e) { sort = state.ideaSort = e.target.value; draw(); });
        async function act(id, path, body) {
            const r = await api("/api/ideas/" + id + "/" + path, body || {});
            const i = d.ideas.findIndex(function (x) { return x.id === id; });
            if (r.idea) d.ideas[i] = r.idea; else d.ideas.splice(i, 1);
            draw();
        }
        root.addEventListener("submit", async function (e) {
            const f = e.target.closest("[data-ia-form]");
            if (!f) return;
            e.preventDefault();
            const id = f.closest("[data-idea]").dataset.idea;
            try { await act(id, "comment", { text: $("input", f).value }); const card = $('[data-idea="' + id + '"] details'); if (card) card.open = true; } catch (err) { toast(err.message); }
        });
        root.addEventListener("click", async function (e) {
            const t = e.target.closest("[data-f]");
            if (t) { filter = state.ideaFilter = t.dataset.f; return draw(); }
            if (e.target.closest("#id-new")) return openIdeaForm(d);
            const b = e.target.closest("[data-ia]");
            if (!b) return;
            const id = b.closest("[data-idea]").dataset.idea;
            try {
                if (b.dataset.ia === "vote") return act(id, "vote");
                if (b.dataset.ia === "status") return openIdeaStatus(d, d.ideas.find(function (x) { return x.id === id; }), act);
                if (b.dataset.ia === "delete" && await confirmDialog({ title: "Delete this idea?", message: "Its votes and comments go too.", confirmLabel: "Delete", danger: true })) await act(id, "delete");
            } catch (err) { toast(err.message); }
        });
        draw();
    }

    function openIdeaForm(d) {
        const m = openModal(
            '<h2 class="modal-title">Share an idea</h2><form id="if-form" novalidate>' +
            '<label for="if-title">Your idea in a sentence</label><input type="text" id="if-title" maxlength="150" placeholder="e.g. A quiet room for focused work">' +
            '<label for="if-body">More detail <span class="muted small">(optional)</span></label><textarea id="if-body" rows="4" maxlength="3000"></textarea>' +
            '<label for="if-cat">Category</label><select id="if-cat">' + Object.keys(d.categories).map(function (k) { return '<option value="' + k + '">' + esc(d.categories[k]) + "</option>"; }).join("") + "</select>" +
            '<label class="inline-check"><input type="checkbox" id="if-anon"> Post anonymously (nobody, including leadership, will see it was you)</label>' +
            '<div class="form-error" id="if-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Share idea</button></div></form>'
        );
        $("#if-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await api("/api/ideas", { title: $("#if-title", m.el).value, body: $("#if-body", m.el).value, category: $("#if-cat", m.el).value, anonymous: $("#if-anon", m.el).checked });
                closeModal();
                toast("Idea shared. Thank you!");
                state.ideaFilter = "open";
                render();
            } catch (err) { formError($("#if-error", m.el), err.message); }
        });
    }

    function openIdeaStatus(d, idea, act) {
        const m = openModal(
            '<h2 class="modal-title">Update “' + esc(idea.title) + "”</h2><form id=\"is2-form\" novalidate>" +
            '<label for="is2-st">Status</label><select id="is2-st">' + Object.keys(d.statuses).map(function (k) { return '<option value="' + k + '"' + (k === idea.status ? " selected" : "") + ">" + esc(d.statuses[k]) + "</option>"; }).join("") + "</select>" +
            '<label for="is2-note">Note to everyone <span class="muted small">(what’s happening and why)</span></label><textarea id="is2-note" rows="3" maxlength="1000">' + esc(idea.statusNote || "") + "</textarea>" +
            '<p class="muted small">The person who shared it and everyone who voted gets a notification.</p>' +
            '<div class="form-error" id="is2-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Update</button></div></form>'
        );
        $("#is2-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try { await act(idea.id, "status", { status: $("#is2-st", m.el).value, note: $("#is2-note", m.el).value }); closeModal(); toast("Idea updated."); } catch (err) { formError($("#is2-error", m.el), err.message); }
        });
    }

    // ================= Team pages =================

    async function viewTeam(root, current) {
        const params = new URLSearchParams(window.location.search);
        const mine = (state.me.roles || []).find(function (r) { return r.main; });
        const company = state.meta.companies.indexOf(params.get("company")) !== -1 ? params.get("company") : (mine && state.meta.companies.indexOf(mine.company) !== -1 ? mine.company : state.meta.companies[0]);
        const d = await api("/api/teams/" + encodeURIComponent(company));
        if (!current()) return;
        const off = d.people.filter(function (p) { return p.offToday; });
        root.innerHTML = '<div class="page-head"><div><h1>' + esc(company) + '</h1><p class="muted">The team, what’s coming up and the latest news for ' + esc(company) + ".</p></div></div>" +
            '<div class="company-tabs" id="tm-tabs">' + state.meta.companies.map(function (c) { return '<button type="button" data-team="' + esc(c) + '" class="' + (c === company ? "active" : "") + '">' + esc(c) + "</button>"; }).join("") + "</div>" +
            '<div class="stat-row"><div class="stat"><div class="stat-value">' + d.people.length + '</div><div class="stat-label">People</div></div>' +
            '<div class="stat"><div class="stat-value">' + off.length + '</div><div class="stat-label">Off today</div></div>' +
            '<div class="stat"><div class="stat-value">' + d.vacancies.length + '</div><div class="stat-label">Open roles</div></div></div>' +
            '<div class="team-layout"><div class="team-main">' +
            '<section class="panel"><h2 class="panel-title">' + icon("users") + "The team</h2><div class=\"team-grid\">" + d.people.map(function (p) {
                return '<div class="team-person' + (p.offToday ? " is-off" : "") + '">' + avatar(p, "md") + '<div><div class="emp-name">' + esc(p.displayName) + '</div><div class="muted small">' + esc(p.jobTitle) + "</div>" +
                    (p.offToday ? '<span class="badge badge-soft">Off today</span>' : statusPill(p.status)) + "</div></div>";
            }).join("") + "</div></section>" +
            '<section class="panel"><div class="panel-head"><h2 class="panel-title">' + icon("bell") + "News for " + esc(company) + '</h2><a class="small link-arrow" href="/announcements" data-link>All announcements</a></div>' +
            (d.announcements.length ? d.announcements.map(function (a) {
                return '<div class="team-news"><strong>' + esc(a.title) + '</strong><span class="muted small">' + esc(a.author ? a.author.displayName : "") + " · " + esc(fmtDate(a.createdAt)) + "</span><p>" + esc(a.body.length > 220 ? a.body.slice(0, 220) + "…" : a.body) + "</p></div>";
            }).join("") : '<p class="muted small">No announcements just for ' + esc(company) + " right now.</p>") + "</section>" +
            '<section class="panel"><div class="panel-head"><h2 class="panel-title">' + icon("heart") + 'Kudos</h2><a class="small link-arrow" href="/kudos" data-link>Kudos wall</a></div>' +
            (d.kudos.length ? '<div class="kudos-feed compact">' + d.kudos.map(kudosCardHtml).join("") + "</div>" : '<p class="muted small">No kudos for this team yet.</p>') + "</section>" +
            "</div><aside class=\"team-side\">" +
            '<section class="panel"><h2 class="panel-title">' + icon("gift") + "Celebrations</h2>" + (d.milestones.length ? '<div class="ms-list">' + d.milestones.map(milestoneHtml).join("") + "</div>" : '<p class="muted small">Nothing in the next month.</p>') + "</section>" +
            '<section class="panel"><h2 class="panel-title">' + icon("sun") + "Leave in the next 30 days</h2>" + (d.leave.length ? '<ul class="team-list">' + d.leave.map(function (l) {
                return "<li><strong>" + esc(l.title.split(" – ")[0]) + '</strong><span class="muted small">' + esc(dateRange(l.startDate, l.endDate)) + "</span></li>";
            }).join("") + "</ul>" : '<p class="muted small">Nobody has leave booked.</p>') + "</section>" +
            '<section class="panel"><h2 class="panel-title">' + icon("calendar") + "Upcoming events</h2>" + (d.events.length ? '<ul class="team-list">' + d.events.map(function (e) {
                return "<li><strong>" + esc(e.title) + '</strong><span class="muted small">' + esc(dateRange(e.startDate, e.endDate)) + (e.location ? " · " + esc(e.location) : "") + "</span></li>";
            }).join("") + "</ul>" : '<p class="muted small">No events coming up.</p>') + "</section>" +
            (d.vacancies.length ? '<section class="panel"><h2 class="panel-title">' + icon("briefcase") + "We’re hiring</h2><ul class=\"team-list\">" + d.vacancies.map(function (v) {
                return '<li><a href="/jobs" data-link><strong>' + esc(v.title) + "</strong></a>" + (v.location ? '<span class="muted small">' + esc(v.location) + "</span>" : "") + "</li>";
            }).join("") + "</ul></section>" : "") +
            "</aside></div>";
        root.addEventListener("click", function (e) {
            const t = e.target.closest("[data-team]");
            if (t) return navigate("/team?company=" + encodeURIComponent(t.dataset.team));
            const cg = e.target.closest("[data-congrats]");
            if (cg) return sendCongrats(cg);
        });
    }

    // ================= Maintenance mode =================

    function mountMaintenance(box) {
        async function draw() {
            let m;
            try { m = await api("/api/system/maintenance"); } catch (err) { box.innerHTML = '<p class="muted">' + esc(err.message) + "</p>"; return; }
            if (m.central) { box.innerHTML = '<h3>Website maintenance</h3><p class="muted small">Maintenance is managed through the HN Group website control panel. Access is granted separately.</p><a class="btn btn-primary" href="https://admin.hngroup.org.uk">Open website control →</a>'; return; }
            box.innerHTML = '<div class="panel-head"><h2 class="panel-title">' + icon("settings") + "Maintenance mode</h2>" +
                '<span class="badge ' + (m.on ? "badge-red" : "badge-green") + '">' + (m.on ? "On" : "Off") + "</span></div>" +
                '<p class="muted small">While maintenance mode is on, only the system owner can sign in. Everyone else is signed out straight away, and when they sign in they see the HN Group logo and this message instead of the portal.</p>' +
                (m.on ? '<div class="banner banner-warn">' + icon("alert") + "<div><strong>Maintenance mode has been on since " + esc(fmtDateTime(m.since)) + ".</strong> Turned on by " + esc(m.by || "the owner") + ".</div></div>" : "") +
                '<form id="mt-form" novalidate><label for="mt-msg">Message</label><textarea id="mt-msg" rows="3" maxlength="600"' + (m.canChange ? "" : " disabled") + ">" + esc(m.message) + "</textarea>" +
                (m.canChange ? '<div class="form-actions">' + (m.on
                    ? '<button type="button" class="btn btn-ghost" id="mt-save">Update message</button><button type="button" class="btn btn-primary" id="mt-off">' + icon("power") + "Turn maintenance mode off</button>"
                    : '<button type="button" class="btn btn-danger" id="mt-on">' + icon("power") + "Turn maintenance mode on</button>") + "</div>"
                    : '<p class="hint">Only the system owner can turn maintenance mode on or off.</p>') + "</form>";
        }
        box.addEventListener("click", async function (e) {
            const b = e.target.closest("#mt-on, #mt-off, #mt-save");
            if (!b) return;
            const on = b.id !== "mt-off";
            let pin = "";
            if (b.id === "mt-on") {
                pin = await askMaintenancePin();
                if (pin === null) return;
            }
            try {
                const r = await api("/api/system/maintenance", { on: on, message: $("#mt-msg", box).value, pin: pin });
                toast(b.id === "mt-save" ? "Message updated." : on ? "Maintenance mode is on" + (r.ended ? ": " + r.ended + " signed out." : ".") : "Maintenance mode is off. Everyone can sign in again.");
                state.me = (await api("/api/me")).user;
                renderChrome();
                draw();
            } catch (err) { toast(err.message); }
        });
        draw();
    }

    // Turning maintenance mode on needs the separate maintenance PIN.
    function askMaintenancePin() {
        return new Promise(function (resolve) {
            let done = false;
            const m = openModal(
                '<h2 class="modal-title">Turn on maintenance mode?</h2>' +
                '<p class="muted">Everyone except you will be signed out now, and nobody else can sign in (or be logged in as) until you turn it off. Enter the maintenance PIN to confirm.</p>' +
                '<form id="mp-form" novalidate><label for="mp-pin">Maintenance PIN</label><input type="password" id="mp-pin" inputmode="numeric" maxlength="8" autocomplete="off">' +
                '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-danger">Turn on</button></div></form>',
                { onClose: function () { if (!done) resolve(null); } }
            );
            $("#mp-form", m.el).addEventListener("submit", function (e) {
                e.preventDefault();
                done = true;
                const v = $("#mp-pin", m.el).value;
                closeModal();
                resolve(v);
            });
        });
    }

    // ================= Service outage banner =================

    // Shown on every page while a monitored service is down: IT see every outage, everyone else
    // only services marked "show a banner to all staff". Dismissing hides it until something changes.
    function renderStatusBanner() {
        const box = $("#status-banner");
        if (!box) return;
        if (state.me && state.me.maintenance && state.me.maintenance.on) {
            box.hidden = false;
            box.className = "status-banner maint-banner";
            box.innerHTML = '<div class="sb-inner">' + icon("settings") + "<span><strong>Maintenance mode is on.</strong> Only you can sign in; everyone else sees the maintenance message.</span>" +
                (state.me.isOwner && !state.me.impersonatedBy ? '<button type="button" class="btn btn-small btn-light" data-maint-off>Turn off</button>' : "") + "</div>";
            const off = $("[data-maint-off]", box);
            if (off) off.addEventListener("click", async function () {
                if (!(await confirmDialog({ title: "Turn off maintenance mode?", message: "Everyone will be able to sign in again straight away.", confirmLabel: "Turn off" }))) return;
                off.disabled = true;
                try {
                    const r = await api("/api/maintenance/off", {});
                    state.me = r.user;
                    renderChrome();
                    toast("Maintenance mode is off. Everyone can sign in again.");
                    if (window.location.pathname === "/system") render();
                } catch (err) { off.disabled = false; toast(err.message); }
            });
            return;
        }
        box.className = "status-banner";
        const alerts = (state.me && state.me.serviceAlerts) || [];
        const key = alerts.map(function (a) { return a.id + a.since; }).join("|");
        let dismissed = "";
        try { dismissed = sessionStorage.getItem("hn-status-dismissed") || ""; } catch (e) { /* ignore */ }
        box.hidden = !alerts.length || dismissed === key;
        if (box.hidden) return;
        const it = can("helpdesk.manage");
        box.innerHTML = '<div class="sb-inner">' + icon("alert") + "<span><strong>" +
            (alerts.length === 1 ? esc(alerts[0].name) + " is down" : alerts.length + " services are down: " + esc(alerts.map(function (a) { return a.name; }).join(", "))) + ".</strong> " +
            (alerts.length === 1 ? esc(alerts[0].error) + " · since " + esc(new Date(alerts[0].since).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })) + ". " : "") +
            (it ? "" : "IT know about it and are looking into it.") + "</span>" +
            (it ? '<a class="btn btn-small btn-light" href="/status" data-link>Service status</a>' : "") +
            '<button type="button" class="icon-btn sb-close" data-sb-close aria-label="Hide">' + icon("x") + "</button></div>";
        $("[data-sb-close]", box).addEventListener("click", function () {
            try { sessionStorage.setItem("hn-status-dismissed", key); } catch (e) { /* ignore */ }
            box.hidden = true;
        });
    }

    // ================= Activity reports =================

    const REPORT_ACTIONS = {
        "signed-in": "Sign-ins", "leave-requested": "Leave requests", "leave-approved": "Leave approved", "absence-reported": "Sickness reported",
        "timesheet-approved": "Timesheets approved", "ticket-raised": "IT tickets raised", "ticket-replied": "IT ticket replies", "kudos-given": "Kudos given",
        "expense-claimed": "Expense claims", "announcement-posted": "Announcements", "document-uploaded": "Documents uploaded", "payslip-viewed": "Payslips viewed",
        "idea-posted": "Ideas shared", "profile-updated": "Profiles updated", "status-changed": "Statuses set", "training-added": "Training added",
    };

    function reportDocHtml(r) {
        const [y, m] = r.month.split("-").map(Number);
        const label = new Date(y, m - 1, 15).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
        const card = function (title, value, note) { return '<div class="st-card"><span>' + title + "</span><strong>" + value + "</strong>" + (note ? "<small>" + note + "</small>" : "") + "</div>"; };
        const days = Object.keys(r.logins.byDay).sort();
        const max = Math.max.apply(null, days.map(function (d) { return r.logins.byDay[d]; }).concat([1]));
        const lastDay = Number(r.to.slice(8));
        let bars = "";
        for (let i = 1; i <= lastDay; i++) {
            const d = r.month + "-" + String(i).padStart(2, "0");
            const n = r.logins.byDay[d] || 0;
            bars += '<span class="rp-bar" title="' + esc(d + ": " + n) + '"><i data-h="' + Math.round((n / max) * 100) + '"></i></span>';
        }
        return '<article class="statement report">' +
            '<header class="ps-band"><div class="ps-brand"><img src="/assets/brand/svg/hn-group-wordmark-white.svg" alt="HN Group"></div>' +
            '<div class="ps-title"><span class="ps-kicker">Activity report</span><span class="ps-period">' + esc(label) + "</span></div></header>" +
            '<div class="ps-stripe" aria-hidden="true"></div>' +
            '<section class="st-intro"><div><div class="ps-name">HN Group staff portal</div><div class="ps-job">' + esc(fmtDate(r.from + "T12:00:00")) + " to " + esc(fmtDate(r.to + "T12:00:00")) + (r.isCurrent ? " (month so far)" : "") + "</div></div>" +
            '<div class="st-generated">Produced ' + esc(fmtDateTime(r.generatedAt)) + "<br>by " + esc(r.generatedBy) + "</div></section>" +
            '<section class="st-cards">' +
            card("People", r.people.headcount, r.people.starters.length + " joined · " + r.people.leavers.length + " leaving") +
            card("Sign-ins", r.logins.total, r.logins.people + " different people") +
            card("Leave taken", fmtDays(r.leave.total), "all types") +
            card("IT tickets", r.helpdesk.opened + " opened", r.helpdesk.closed + " closed · " + r.helpdesk.open + " still open") +
            card("Outages", r.status.incidents, r.status.incidents === 1 ? "service went down" : "times a service went down") +
            "</section>" +
            '<section class="st-section"><h4>Sign-ins each day</h4><div class="rp-bars">' + bars + '</div><p class="st-small">' +
            (r.logins.busiestDay ? "Busiest day: " + esc(fmtDate(r.logins.busiestDay[0] + "T12:00:00")) + " with " + r.logins.busiestDay[1] + " sign-ins." : "Nobody signed in this month.") + "</p></section>" +
            '<section class="rp-cols"><div class="st-section"><h4>People</h4><div class="st-rows">' +
            r.people.byCompany.map(function (c) { return '<div class="ps-line"><span>' + esc(c.company) + '</span><span class="ps-amt">' + c.count + "</span></div>"; }).join("") +
            '<div class="ps-line"><span>Hired through Jobs</span><span class="ps-amt">' + r.people.hires + "</span></div>" +
            "</div>" + (r.people.starters.length ? '<p class="st-small"><strong>Joined:</strong> ' + esc(r.people.starters.join(", ")) + "</p>" : "") +
            (r.people.leavers.length ? '<p class="st-small"><strong>Leaving:</strong> ' + esc(r.people.leavers.join(", ")) + "</p>" : "") + "</div>" +
            '<div class="st-section"><h4>Leave</h4><div class="st-rows">' + (r.leave.byType.length ? r.leave.byType.map(function (l) {
                return '<div class="ps-line"><span>' + esc(l.label) + '</span><span class="ps-amt">' + fmtDays(l.days) + "</span></div>";
            }).join("") : '<div class="ps-line ps-none"><span>No leave</span></div>') + "</div></div></section>" +
            '<section class="rp-cols"><div class="st-section"><h4>Engagement</h4><div class="st-rows">' +
            [["Kudos given", r.engagement.kudos], ["Ideas shared", r.engagement.ideas], ["Announcements posted", r.engagement.announcements], ["Documents uploaded", r.engagement.documents], ["Expense claims", r.engagement.expenseClaims]].map(function (x) {
                return '<div class="ps-line"><span>' + x[0] + '</span><span class="ps-amt">' + x[1] + "</span></div>";
            }).join("") + "</div></div>" +
            '<div class="st-section"><h4>Services</h4><div class="st-rows">' + (r.status.services.length ? r.status.services.map(function (s) {
                return '<div class="ps-line"><span>' + esc(s.name) + '</span><span class="ps-amt">' + (s.uptime7d === null ? "–" : s.uptime7d + "% (7 days)") + "</span></div>";
            }).join("") : '<div class="ps-line ps-none"><span>Nothing monitored</span></div>') + "</div></div></section>" +
            (r.money ? '<section class="st-section"><h4>Money</h4><div class="st-rows">' +
                '<div class="ps-line"><span>Payroll cost (' + r.money.payroll.payslips + " payslips)</span><span class=\"ps-amt\">" + fmtMoney(r.money.payroll.cost) + "</span></div>" +
                '<div class="ps-line"><span>Expenses repaid (' + r.money.expenses.count + ")</span><span class=\"ps-amt\">" + fmtMoney(r.money.expenses.amount) + "</span></div>" +
                '<div class="ps-line"><span>Invoices paid</span><span class="ps-amt">' + fmtMoney(r.money.invoicesPaid) + "</span></div>" +
                '<div class="ps-line"><span>Money in</span><span class="ps-amt">' + fmtMoney(r.money.moneyIn) + "</span></div>" +
                '<div class="ps-line"><span>Money spent</span><span class="ps-amt">' + fmtMoney(r.money.spent) + "</span></div>" +
                '<div class="ps-line ps-total"><span>Company funds at the end of the month</span><span class="ps-amt">' + fmtMoney(r.money.closing) + "</span></div></div></section>" : "") +
            (r.activity.length ? '<section class="st-section"><h4>Most common activity</h4><div class="rp-activity">' + r.activity.map(function (a) {
                return '<div><span>' + esc(REPORT_ACTIONS[a.action] || a.action.replace(/-/g, " ")) + "</span><strong>" + a.count + "</strong></div>";
            }).join("") + "</div></section>" : "") +
            '<footer class="ps-foot"><span>HN Group</span><span>Private and confidential</span><span>Activity report ' + esc(label) + "</span></footer></article>";
    }

    async function viewReports(root, current) {
        let month = state.reportMonth || isoDay(new Date()).slice(0, 7);
        root.innerHTML = '<div class="page-head"><div><h1>Activity reports</h1><p class="muted">A monthly summary of how the portal and the business are doing: people, sign-ins, leave, IT, services' + (can("payroll.manage") ? " and money" : "") + ". Download it as a PDF to share.</p></div>" +
            '<div class="page-actions"><button type="button" class="btn btn-primary" id="rp-pdf">' + icon("download") + "Download PDF</button></div></div>" +
            '<div class="week-nav no-print"><button type="button" class="icon-btn" data-rpm="-1" aria-label="Previous month">' + icon("chevronLeft") + "</button>" +
            '<input type="month" id="rp-month" aria-label="Month"><button type="button" class="icon-btn" data-rpm="1" aria-label="Next month">' + icon("chevronRight") + "</button></div>" +
            '<div class="print-area report-wrap" id="rp-doc"><p class="muted">Loading…</p></div>';
        async function load() {
            $("#rp-month").value = month;
            try {
                const r = (await api("/api/reports?month=" + month)).report;
                if (!current()) return;
                $("#rp-doc").innerHTML = reportDocHtml(r);
                $$(".rp-bar i", root).forEach(function (b) { b.style.height = Math.max(2, Number(b.dataset.h)) + "%"; });
            } catch (err) { $("#rp-doc").innerHTML = '<p class="form-error">' + esc(err.message) + "</p>"; }
        }
        root.addEventListener("click", function (e) {
            const s = e.target.closest("[data-rpm]");
            if (s) { month = state.reportMonth = shiftMonth(month, Number(s.dataset.rpm)); load(); }
            if (e.target.closest("#rp-pdf")) {
                // Printing only shows pop-ups, so the report is printed from one.
                const pm = openModal('<div class="print-area">' + $("#rp-doc").innerHTML + "</div>", { wide: true, cls: "modal-payslip modal-statement" });
                $$(".rp-bar i", pm.el).forEach(function (b) { b.style.height = Math.max(2, Number(b.dataset.h)) + "%"; });
                printDoc("HN Group activity report " + month);
                setTimeout(closeModal, 600);
            }
        });
        root.addEventListener("change", function (e) { if (e.target.id === "rp-month" && e.target.value) { month = state.reportMonth = e.target.value; load(); } });
        await load();
    }

    // ================= Salary bands, pay history, bonuses and commission =================

    async function openBands() {
        let r;
        try { r = await api("/api/payroll/bands"); } catch (err) { return toast(err.message); }
        const m = openModal(
            '<h2 class="modal-title">Salary bands</h2>' +
            '<p class="muted">A monthly pay range for each job title. Pay details then show whether each person is below, in or above their band (hourly pay counts as 162.5 hours a month).</p>' +
            (r.bands.length ? '<div class="table-card flat"><table class="table"><thead><tr><th>Job title</th><th class="num">Minimum</th><th class="num">Maximum</th><th class="col-actions"></th></tr></thead><tbody>' +
                r.bands.map(function (b) {
                    return "<tr><td>" + esc(b.jobTitle) + '</td><td class="num" data-label="Minimum">' + fmtMoney(b.min) + '</td><td class="num" data-label="Maximum">' + fmtMoney(b.max) + "</td>" +
                        '<td class="col-actions"><button type="button" class="icon-btn" data-band-del="' + b.id + '" aria-label="Delete">' + icon("trash") + "</button></td></tr>";
                }).join("") + "</tbody></table></div>" : '<p class="muted small">No bands yet.</p>') +
            '<form id="band-form" class="band-form" novalidate><input type="text" id="band-title" maxlength="100" placeholder="Job title, e.g. Graphic Designer" list="band-titles">' +
            '<div class="money-input"><span>£</span><input type="number" id="band-min" min="0" step="0.01" placeholder="Min a month"></div>' +
            '<div class="money-input"><span>£</span><input type="number" id="band-max" min="0" step="0.01" placeholder="Max a month"></div>' +
            '<button type="submit" class="btn btn-ghost">' + icon("plus") + "Add</button></form>" +
            '<div class="form-error" id="band-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-primary" data-close>Done</button></div>'
        );
        api("/api/directory").then(function (d) {
            const titles = {};
            d.people.forEach(function (p) { titles[p.jobTitle] = true; });
            const list = document.createElement("datalist");
            list.id = "band-titles";
            list.innerHTML = Object.keys(titles).sort().map(function (t) { return '<option value="' + esc(t) + '">'; }).join("");
            m.el.appendChild(list);
        }).catch(function () {});
        m.el.addEventListener("click", async function (e) {
            const del = e.target.closest("[data-band-del]");
            if (!del) return;
            try { await api("/api/payroll/bands", { delete: del.dataset.bandDel }); openBands(); } catch (err) { formError($("#band-error", m.el), err.message); }
        });
        $("#band-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await api("/api/payroll/bands", { jobTitle: $("#band-title", m.el).value, min: $("#band-min", m.el).value, max: $("#band-max", m.el).value });
                toast("Band saved.");
                openBands();
            } catch (err) { formError($("#band-error", m.el), err.message); }
        });
    }

    async function openPayHistory(personId, name) {
        let r;
        try { r = await api("/api/payroll/history/" + personId); } catch (err) { return toast(err.message); }
        const max = Math.max.apply(null, r.payslips.map(function (s) { return s.gross; }).concat([1]));
        const m = openModal(
            '<h2 class="modal-title">' + esc(name) + "</h2>" +
            (r.band ? '<div class="band-meter band-' + r.band.position + '"><div class="bm-head"><strong>' + esc(r.band.jobTitle) + " band</strong><span>" + fmtMoney(r.band.min) + " – " + fmtMoney(r.band.max) + " a month</span></div>" +
                '<div class="bm-track"><span class="bm-dot" data-left="' + Math.max(0, Math.min(100, (r.band.monthly - r.band.min) / Math.max(1, r.band.max - r.band.min) * 100)) + '"></span></div>' +
                '<div class="muted small">' + fmtMoney(r.band.monthly) + " a month · " + ({ below: "below the band", within: "within the band", above: "above the band" })[r.band.position] + "</div></div>" : "") +
            '<h3 class="detail-head">Bonuses and commission</h3>' +
            '<p class="muted small">A bonus is paid once, on the next payslip made for them. Commission is added every month between the months you choose. Both are taxed as normal pay.</p>' +
            (r.extras.length ? '<div class="pc-list">' + r.extras.map(function (x) {
                return '<div class="pc-row' + (x.paid ? " applied" : "") + '"><span class="pc-when">' + (x.kind === "bonus" ? "Bonus" : "Commission") + "</span><strong>" + fmtMoney(x.amount) + "</strong><span>" + esc(x.label) +
                    ' <span class="muted small">· ' + (x.kind === "bonus" ? (x.paid ? "paid" : "on the next payslip") : esc(x.fromLabel) + (x.toLabel ? " to " + esc(x.toLabel) : " onwards")) + "</span></span>" +
                    (x.paid ? "" : '<button type="button" class="icon-btn" data-extra-del="' + x.id + '" aria-label="Remove">' + icon("trash") + "</button>") + "</div>";
            }).join("") + "</div>" : "") +
            '<form id="ex2-form" class="extra-form" novalidate><select id="ex2-kind"><option value="bonus">One-off bonus</option><option value="commission">Monthly commission</option></select>' +
            '<input type="text" id="ex2-label" maxlength="80" placeholder="Label, e.g. Christmas bonus">' +
            '<div class="money-input"><span>£</span><input type="number" id="ex2-amount" min="0" step="0.01" placeholder="Amount"></div>' +
            '<span class="ex2-range" hidden><input type="month" id="ex2-from" aria-label="From"><input type="month" id="ex2-to" aria-label="To (optional)"></span>' +
            '<button type="submit" class="btn btn-ghost">' + icon("plus") + "Add</button></form>" +
            '<div class="form-error" id="ex2-error" hidden></div>' +
            '<h3 class="detail-head">Pay over time</h3>' +
            (r.payslips.length ? '<div class="pay-bars">' + r.payslips.map(function (s) {
                return '<div class="pb-col" title="' + esc(s.label + ": " + fmtMoney(s.gross)) + '"><span data-h="' + Math.round(s.gross / max * 100) + '"></span><small>' + esc(s.label.slice(0, 3)) + "</small></div>";
            }).join("") + "</div>" : '<p class="muted small">No issued payslips yet.</p>') +
            '<h3 class="detail-head">Pay changes</h3>' +
            (r.changes.length ? '<div class="pc-list">' + r.changes.map(function (c) {
                return '<div class="pc-row"><span class="pc-when">' + esc(fmtDate(c.at)) + "</span><strong>" + (c.payType === "hourly" ? fmtMoney(c.hourlyRate) + " an hour" : fmtMoney(c.monthlySalary) + " a month") + "</strong>" +
                    '<span class="muted small">' + esc(c.note || "") + " · " + esc(c.byName) + "</span></div>";
            }).join("") + "</div>" : '<p class="muted small">No changes recorded yet. Changes to pay details and scheduled pay changes show up here.</p>') +
            '<div class="modal-actions"><button type="button" class="btn btn-primary" data-close>Done</button></div>',
            { wide: true }
        );
        $$("[data-h]", m.el).forEach(function (b) { b.style.height = Math.max(3, Number(b.dataset.h)) + "%"; });
        $$("[data-left]", m.el).forEach(function (b) { b.style.left = b.dataset.left + "%"; });
        $("#ex2-from", m.el).value = isoDay(new Date()).slice(0, 7);
        $("#ex2-kind", m.el).addEventListener("change", function (e) { $(".ex2-range", m.el).hidden = e.target.value !== "commission"; });
        m.el.addEventListener("click", async function (e) {
            const del = e.target.closest("[data-extra-del]");
            if (!del) return;
            try { await api("/api/payroll/extras/" + personId + "/" + del.dataset.extraDel + "/delete", {}); openPayHistory(personId, name); } catch (err) { formError($("#ex2-error", m.el), err.message); }
        });
        $("#ex2-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await api("/api/payroll/extras/" + personId, { kind: $("#ex2-kind", m.el).value, label: $("#ex2-label", m.el).value, amount: $("#ex2-amount", m.el).value, from: $("#ex2-from", m.el).value, to: $("#ex2-to", m.el).value });
                toast($("#ex2-kind", m.el).value === "bonus" ? "Bonus added to their next payslip." : "Commission added.");
                openPayHistory(personId, name);
            } catch (err) { formError($("#ex2-error", m.el), err.message); }
        });
    }

    // ================= Mileage claims =================

    function openMileageForm() {
        const m = openModal(
            '<h2 class="modal-title">Claim mileage</h2>' +
            '<p class="muted">For business journeys in your own car or van. HMRC rates: 45p a mile for the first 10,000 miles in the tax year, then 25p. Don’t include your normal commute.</p>' +
            '<form id="mi-form" novalidate><div class="grid-2"><div><label for="mi-from">From</label><input type="text" id="mi-from" maxlength="120" placeholder="e.g. Manchester office"></div>' +
            '<div><label for="mi-to">To</label><input type="text" id="mi-to" maxlength="120" placeholder="e.g. Client site, Leeds"></div></div>' +
            '<div class="grid-2"><div><label for="mi-miles">Miles (one way)</label><input type="number" id="mi-miles" min="0" step="0.1"></div>' +
            '<div><label for="mi-date">Date of journey</label><input type="date" id="mi-date" value="' + isoDay(new Date()) + '" max="' + isoDay(new Date()) + '"></div></div>' +
            '<label class="inline-check"><input type="checkbox" id="mi-return"> Return journey (doubles the miles)</label>' +
            '<div class="lv-count" id="mi-calc">' + icon("pound") + "Enter the miles to see what you’ll get back.</div>" +
            '<label for="mi-note">What was it for?</label><input type="text" id="mi-note" maxlength="200" placeholder="e.g. Pitch meeting with Acme">' +
            '<div class="form-error" id="mi-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Send claim</button></div></form>'
        );
        function miles() { return (Number($("#mi-miles", m.el).value) || 0) * ($("#mi-return", m.el).checked ? 2 : 1); }
        let seq = 0;
        async function calc() {
            const n = miles();
            if (!n) return;
            const mine = ++seq;
            try {
                const r = await api("/api/expenses/mileage?miles=" + n + "&date=" + $("#mi-date", m.el).value);
                if (mine !== seq) return;
                $("#mi-calc", m.el).innerHTML = icon("pound") + "<strong>" + fmtMoney(r.amount) + "</strong>&nbsp;for " + n + " miles" +
                    (r.atLower ? " (" + r.atFull + " at 45p, " + r.atLower + " at 25p)" : " at 45p a mile") + " · " + Math.round(r.before) + " miles already claimed this tax year";
            } catch (e) { /* ignore */ }
        }
        m.el.addEventListener("input", calc);
        m.el.addEventListener("change", calc);
        $("#mi-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            const from = $("#mi-from", m.el).value, to = $("#mi-to", m.el).value, ret = $("#mi-return", m.el).checked;
            const note = $("#mi-note", m.el).value.trim();
            try {
                const r = await uploadJson("/api/expenses", "X-Claim", {
                    kind: "mileage", from: from, to: to, miles: miles(), returnTrip: ret, date: $("#mi-date", m.el).value,
                    description: note ? note + " – " + from + " to " + to + (ret ? " and back" : "") + " (" + miles() + " miles)" : "",
                }, null);
                state.me = r.user;
                renderChrome();
                closeModal();
                toast("Mileage claim sent for approval.");
                render();
            } catch (err) { formError($("#mi-error", m.el), err.message); }
        });
    }

    // ================= Cash-flow forecast =================

    function forecastHtml(f) {
        const vals = f.months.map(function (x) { return x.end; }).concat(f.months.map(function (x) { return x.start; }), [0]);
        const max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
        const range = (max - min) || 1;
        const W = 640, H = 150, L = 8, T = 12, B = 22;
        const x = function (i) { return L + (W - 2 * L) * (i + 0.5) / f.months.length; };
        const y = function (v) { return T + (H - T - B) * (1 - (v - min) / range); };
        const pts = f.months.map(function (m, i) { return x(i) + "," + y(m.end); }).join(" ");
        const svg = '<svg class="funds-chart fc-forecast" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Forecast balance at the end of each month">' +
            (min < 0 ? '<line class="fc-zero" x1="0" x2="' + W + '" y1="' + y(0) + '" y2="' + y(0) + '"></line>' : "") +
            '<polyline class="fc-line" points="' + pts + '"></polyline>' +
            f.months.map(function (m, i) {
                return '<circle class="fc-dot' + (m.end < 0 ? " neg" : "") + '" cx="' + x(i) + '" cy="' + y(m.end) + '" r="4"><title>' + esc(m.label + ": " + fmtMoney(m.end)) + "</title></circle>" +
                    '<text class="fc-axis" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(m.label.slice(0, 3)) + "</text>";
            }).join("") + "</svg>";
        return '<section class="panel"><div class="panel-head"><h2 class="panel-title">' + icon("activity") + "Cash-flow forecast</h2>" +
            '<span class="muted small">Lowest point: <strong class="' + (f.lowest.end < 0 ? "danger-text" : "") + '">' + fmtMoney(f.lowest.end) + "</strong> at the end of " + esc(f.lowest.label) + "</span></div>" +
            '<div class="chart-wrap">' + svg + "</div>" +
            '<div class="table-card flat"><table class="table forecast-table"><thead><tr><th>Month</th><th class="num">Starts with</th><th class="num">Invoices due in</th><th class="num">Bills due</th><th class="num">Payroll</th><th class="num">Other spending</th><th class="num">Ends with</th></tr></thead><tbody>' +
            f.months.map(function (m) {
                return "<tr><td>" + esc(m.label) + '</td><td class="num" data-label="Starts with">' + fmtMoney(m.start) + '</td><td class="num fund-in" data-label="Invoices in">+' + fmtMoney(m.invoicesIn) + "</td>" +
                    '<td class="num" data-label="Bills">−' + fmtMoney(m.billsOut) + '</td><td class="num" data-label="Payroll">−' + fmtMoney(m.payroll) + '</td><td class="num" data-label="Other">−' + fmtMoney(m.other) + "</td>" +
                    '<td class="num' + (m.end < 0 ? " danger-text" : "") + '" data-label="Ends with"><strong>' + fmtMoney(m.end) + "</strong></td></tr>";
            }).join("") + "</tbody></table></div>" +
            '<p class="muted small">Payroll is everyone’s pay (with scheduled pay changes, commission, employer NI and pension) for payslips not made yet. Bills include repeats of repeating bills. Other spending is the average of funds removed and expenses over the last three months (' + fmtMoney(f.averageOther) + " a month). Only invoices already sent count as money in" +
            (f.averageIn ? "; on average " + fmtMoney(f.averageIn) + " a month has come in recently" : "") + ".</p></section>";
    }

    // ================= Supplier bills =================

    async function viewBills(root, current) {
        const d = await api("/api/bills");
        if (!current()) return;
        let filter = state.billFilter || "unpaid";
        root.innerHTML = '<div class="page-head"><div><h1>Bills</h1><p class="muted">Money the company owes suppliers. Mark a bill paid to take it out of the main balance; repeating bills make the next one automatically.</p></div>' +
            '<div class="page-actions"><button type="button" class="btn btn-primary" id="bl-new">' + icon("plus") + "Add a bill</button></div></div>" +
            '<div class="stat-row"><div class="stat"><div class="stat-value">' + fmtMoney(d.summary.unpaid) + '</div><div class="stat-label">Unpaid</div></div>' +
            '<div class="stat' + (d.summary.overdue ? " stat-danger" : "") + '"><div class="stat-value">' + fmtMoney(d.summary.overdue) + '</div><div class="stat-label">Overdue' + (d.summary.overdueCount ? " (" + d.summary.overdueCount + ")" : "") + "</div></div>" +
            '<div class="stat"><div class="stat-value">' + fmtMoney(d.summary.dueThisMonth) + '</div><div class="stat-label">Due by the end of this month</div></div></div>' +
            '<div class="company-tabs" id="bl-tabs"><button type="button" data-f="unpaid">Unpaid</button><button type="button" data-f="paid">Paid</button><button type="button" data-f="">All</button></div><div id="bl-body"></div>';
        function draw() {
            $$("#bl-tabs [data-f]").forEach(function (b) { b.classList.toggle("active", b.dataset.f === filter); });
            const list = d.bills.filter(function (b) { return !filter || b.status === filter; });
            $("#bl-body").innerHTML = list.length ? '<div class="table-card"><table class="table"><thead><tr><th>Supplier</th><th>Category</th><th>Due</th><th>Repeats</th><th class="num">Amount</th><th class="col-actions"></th></tr></thead><tbody>' +
                list.map(function (b) {
                    return '<tr data-bill="' + b.id + '"><td><strong>' + esc(b.supplier) + "</strong>" + (b.reference ? '<div class="muted small">Ref ' + esc(b.reference) + "</div>" : "") + (b.note ? '<div class="muted small">' + esc(b.note) + "</div>" : "") + "</td>" +
                        '<td data-label="Category">' + esc(b.category) + "</td>" +
                        '<td data-label="Due" class="nowrap' + (b.overdue ? " danger-text" : "") + '">' + esc(fmtDate(b.dueDate + "T12:00:00")) + (b.overdue ? ' <span class="badge badge-red">Overdue</span>' : b.dueSoon ? ' <span class="badge badge-yellow">Due soon</span>' : "") +
                        (b.status === "paid" ? '<div class="muted small">Paid ' + esc(fmtDate(b.paidAt)) + "</div>" : "") + "</td>" +
                        '<td data-label="Repeats">' + esc(b.repeatLabel) + '</td><td class="num" data-label="Amount"><strong>' + fmtMoney(b.amount) + "</strong></td>" +
                        '<td class="col-actions nowrap">' + (b.status === "unpaid" ? '<button type="button" class="btn btn-ghost btn-small" data-bl="edit">' + icon("edit") + '</button><button type="button" class="btn btn-ghost btn-small danger-text" data-bl="delete">' + icon("trash") + '</button><button type="button" class="btn btn-primary btn-small" data-bl="pay">Mark paid</button>' : '<span class="badge badge-green">Paid</span>') + "</td></tr>";
                }).join("") + "</tbody></table></div>" : '<div class="empty-page">' + icon("file", "big") + "<h2>No bills here</h2></div>";
        }
        root.addEventListener("click", async function (e) {
            const t = e.target.closest("[data-f]");
            if (t) { filter = state.billFilter = t.dataset.f; return draw(); }
            if (e.target.closest("#bl-new")) return openBillForm(d, null);
            const b = e.target.closest("[data-bl]");
            if (!b) return;
            const bill = d.bills.find(function (x) { return x.id === b.closest("[data-bill]").dataset.bill; });
            if (b.dataset.bl === "edit") return openBillForm(d, bill);
            try {
                if (b.dataset.bl === "pay" && !(await confirmDialog({ title: "Mark " + bill.supplier + " as paid?", message: fmtMoney(bill.amount) + " will be taken from the main balance under " + bill.category + "." + (bill.repeat !== "none" ? " The next one will be added automatically." : ""), confirmLabel: "Mark paid" }))) return;
                if (b.dataset.bl === "delete" && !(await confirmDialog({ title: "Delete this bill?", message: "It hasn’t been paid, so nothing changes in company funds.", confirmLabel: "Delete", danger: true }))) return;
                const r = await api("/api/bills/" + bill.id + "/" + b.dataset.bl, {});
                if (r.user) { state.me = r.user; renderChrome(); }
                toast(b.dataset.bl === "pay" ? "Bill paid." : "Bill deleted.");
                render();
            } catch (err) { toast(err.message); }
        });
        draw();
    }

    function openBillForm(d, b) {
        const v = b || { supplier: "", reference: "", amount: "", dueDate: isoDay(new Date()), category: "Other", repeat: "none", note: "" };
        const m = openModal(
            '<h2 class="modal-title">' + (b ? "Edit bill" : "Add a bill") + '</h2><form id="bf-form" novalidate>' +
            '<div class="grid-2"><div><label for="bf-sup">Supplier</label><input type="text" id="bf-sup" maxlength="120" value="' + esc(v.supplier) + '" placeholder="e.g. Hetzner"></div>' +
            '<div><label for="bf-ref">Reference <span class="muted small">(optional)</span></label><input type="text" id="bf-ref" maxlength="80" value="' + esc(v.reference) + '"></div></div>' +
            '<div class="grid-2"><div><label for="bf-amt">Amount</label><div class="money-input"><span>£</span><input type="text" id="bf-amt" inputmode="decimal" value="' + esc(v.amount) + '"></div></div>' +
            '<div><label for="bf-due">Due date</label><input type="date" id="bf-due" value="' + esc(v.dueDate) + '"></div></div>' +
            '<div class="grid-2"><div><label for="bf-cat">Category</label><select id="bf-cat">' + d.categories.map(function (c) { return "<option" + (c === v.category ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></div>" +
            '<div><label for="bf-rep">Repeats</label><select id="bf-rep">' + Object.keys(d.repeats).map(function (k) { return '<option value="' + k + '"' + (k === v.repeat ? " selected" : "") + ">" + esc(d.repeats[k]) + "</option>"; }).join("") + "</select></div></div>" +
            '<label for="bf-note">Note <span class="muted small">(optional)</span></label><input type="text" id="bf-note" maxlength="500" value="' + esc(v.note || "") + '">' +
            '<div class="form-error" id="bf-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save</button></div></form>'
        );
        $("#bf-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await api(b ? "/api/bills/" + b.id : "/api/bills", { supplier: $("#bf-sup", m.el).value, reference: $("#bf-ref", m.el).value, amount: $("#bf-amt", m.el).value, dueDate: $("#bf-due", m.el).value, category: $("#bf-cat", m.el).value, repeat: $("#bf-rep", m.el).value, note: $("#bf-note", m.el).value });
                closeModal();
                toast("Bill saved.");
                render();
            } catch (err) { formError($("#bf-error", m.el), err.message); }
        });
    }

    // ================= Objectives (goals) =================

    const OBJ_CLS = { "on-track": "badge-green", "at-risk": "badge-yellow", "off-track": "badge-red", done: "badge-soft", dropped: "" };

    async function viewObjectives(root, current) {
        const q = new URLSearchParams(window.location.search);
        const quarter = state.objQuarter || "";
        const d = await api("/api/objectives?" + (quarter ? "quarter=" + quarter + "&" : "") + (q.get("person") ? "person=" + q.get("person") : ""));
        if (!current()) return;
        root.innerHTML = '<div class="page-head"><div><h1>' + (d.isSelf ? "My goals" : "Goals · " + esc(d.person.displayName)) + '</h1><p class="muted">Goals for each quarter, with progress updates. Managers can set goals for their team, and they show alongside reviews.</p></div>' +
            '<div class="page-actions">' + (d.isSelf ? "" : '<a class="btn btn-ghost" href="/objectives" data-link>My goals</a>') + '<button type="button" class="btn btn-primary" id="ob-new">' + icon("plus") + "Add a goal</button></div></div>" +
            '<div class="week-nav"><button type="button" class="icon-btn" data-q="' + d.prev + '" aria-label="Previous quarter">' + icon("chevronLeft") + '</button><h2 class="week-title">' + esc(d.quarterLabel) + "</h2>" +
            '<button type="button" class="icon-btn" data-q="' + d.next + '" aria-label="Next quarter">' + icon("chevronRight") + "</button></div>" +
            '<div class="obj-layout"><div class="obj-list">' + (d.objectives.length ? d.objectives.map(function (o) {
                return '<article class="obj-card" data-obj="' + o.id + '"><div class="obj-head"><h3>' + esc(o.title) + '</h3><span class="badge ' + (OBJ_CLS[o.status] || "") + '">' + esc(o.statusLabel) + "</span></div>" +
                    (o.description ? '<p class="muted">' + esc(o.description) + "</p>" : "") + (o.measure ? '<p class="small"><strong>Done when:</strong> ' + esc(o.measure) + "</p>" : "") +
                    '<div class="obj-progress"><div class="br-bar"><span data-w="' + o.progress + '"></span></div><strong>' + o.progress + "%</strong></div>" +
                    (o.updates.length ? '<details class="obj-updates"><summary>' + o.updates.length + " update" + (o.updates.length === 1 ? "" : "s") + "</summary>" + o.updates.map(function (u) {
                        return '<div class="ic-row"><div><strong>' + u.progress + "% · " + esc(u.statusLabel) + '</strong> <span class="muted small">' + esc(u.byName) + " · " + esc(fmtDate(u.at)) + "</span>" + (u.note ? "<p>" + esc(u.note) + "</p>" : "") + "</div></div>";
                    }).join("") + "</details>" : "") +
                    (o.canEdit ? '<div class="btn-row obj-actions"><button type="button" class="btn btn-primary btn-small" data-oa="progress">Update progress</button><button type="button" class="btn btn-ghost btn-small" data-oa="edit">' + icon("edit") + 'Edit</button><button type="button" class="btn btn-link btn-small danger-text" data-oa="delete">Delete</button></div>' : "") + "</article>";
            }).join("") : '<div class="empty-page">' + icon("flag", "big") + '<h2>No goals for this quarter</h2><p class="muted">Use <strong>Add a goal</strong> to set one.</p></div>') + "</div>" +
            (d.team.length ? '<aside class="panel obj-team"><h2 class="panel-title">' + icon("users") + "Your team</h2>" + d.team.map(function (p) {
                return '<a class="obj-member" href="/objectives?person=' + p.id + '" data-link>' + avatar(p, "sm") + '<span><span class="emp-name">' + esc(p.displayName) + '</span><span class="muted small">' + (p.count ? p.count + " goal" + (p.count === 1 ? "" : "s") + " · " + p.average + "% average" + (p.atRisk ? " · " + p.atRisk + " at risk" : "") : "No goals yet") + "</span></span></a>";
            }).join("") + "</aside>" : "") + "</div>";
        $$(".br-bar [data-w]", root).forEach(function (s) { s.style.width = s.dataset.w + "%"; });
        root.addEventListener("click", async function (e) {
            const qb = e.target.closest("[data-q]");
            if (qb) { state.objQuarter = qb.dataset.q; return render(); }
            if (e.target.closest("#ob-new")) return openObjectiveForm(d, null);
            const b = e.target.closest("[data-oa]");
            if (!b) return;
            const o = d.objectives.find(function (x) { return x.id === b.closest("[data-obj]").dataset.obj; });
            if (b.dataset.oa === "edit") return openObjectiveForm(d, o);
            if (b.dataset.oa === "progress") return openObjectiveProgress(d, o);
            if (await confirmDialog({ title: "Delete this goal?", message: o.title, confirmLabel: "Delete", danger: true })) {
                try { await api("/api/objectives/" + o.id + "/delete", {}); render(); } catch (err) { toast(err.message); }
            }
        });
    }

    function openObjectiveForm(d, o) {
        const v = o || { title: "", description: "", measure: "", quarter: d.quarter };
        const m = openModal('<h2 class="modal-title">' + (o ? "Edit goal" : "Add a goal" + (d.isSelf ? "" : " for " + esc(d.person.displayName))) + '</h2><form id="of-form" novalidate>' +
            '<label for="of-title">Goal</label><input type="text" id="of-title" maxlength="150" value="' + esc(v.title) + '" placeholder="e.g. Launch the new Horizon Advertising website">' +
            '<label for="of-desc">Details <span class="muted small">(optional)</span></label><textarea id="of-desc" rows="3" maxlength="2000">' + esc(v.description) + "</textarea>" +
            '<label for="of-measure">How we’ll know it’s done <span class="muted small">(optional)</span></label><input type="text" id="of-measure" maxlength="300" value="' + esc(v.measure || "") + '">' +
            '<label for="of-q">Quarter</label><select id="of-q">' + [d.prev, d.quarter, d.next].map(function (q) { return '<option value="' + q + '"' + (q === v.quarter ? " selected" : "") + ">" + q.replace("-", " ") + "</option>"; }).join("") + "</select>" +
            '<div class="form-error" id="of-error" hidden></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save goal</button></div></form>');
        $("#of-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await api(o ? "/api/objectives/" + o.id : "/api/objectives", { personId: d.person.id, title: $("#of-title", m.el).value, description: $("#of-desc", m.el).value, measure: $("#of-measure", m.el).value, quarter: $("#of-q", m.el).value });
                closeModal(); toast("Goal saved."); render();
            } catch (err) { formError($("#of-error", m.el), err.message); }
        });
    }

    function openObjectiveProgress(d, o) {
        const m = openModal('<h2 class="modal-title">Update progress</h2><p class="muted">' + esc(o.title) + '</p><form id="op-form" novalidate>' +
            '<label for="op-pct">Progress: <strong id="op-val">' + o.progress + '%</strong></label><input type="range" id="op-pct" min="0" max="100" step="5" value="' + o.progress + '">' +
            '<label for="op-st">Status</label><select id="op-st">' + Object.keys(d.statuses).map(function (k) { return '<option value="' + k + '"' + (k === o.status ? " selected" : "") + ">" + esc(d.statuses[k]) + "</option>"; }).join("") + "</select>" +
            '<label for="op-note">What’s happened? <span class="muted small">(optional)</span></label><textarea id="op-note" rows="3" maxlength="1000"></textarea>' +
            '<div class="form-error" id="op-error" hidden></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save update</button></div></form>');
        $("#op-pct", m.el).addEventListener("input", function (e) { $("#op-val", m.el).textContent = e.target.value + "%"; if (e.target.value === "100") $("#op-st", m.el).value = "done"; });
        $("#op-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try { await api("/api/objectives/" + o.id + "/progress", { progress: $("#op-pct", m.el).value, status: $("#op-st", m.el).value, note: $("#op-note", m.el).value }); closeModal(); toast("Progress updated."); render(); } catch (err) { formError($("#op-error", m.el), err.message); }
        });
    }

    // ================= 360 feedback =================

    function ratingInput(name, value) {
        return '<div class="rating-row" role="radiogroup">' + [1, 2, 3, 4, 5].map(function (n) {
            return '<label class="rating-pill"><input type="radio" name="' + name + '" value="' + n + '"' + (value === n ? " checked" : "") + "><span>" + n + "</span></label>";
        }).join("") + '<span class="muted small rating-key">1 = poor · 5 = excellent</span></div>';
    }

    async function viewFeedback(root, current) {
        const d = await api("/api/feedback");
        if (!current()) return;
        const canAsk = d.people.some(function (p) { return p.canRequest; });
        root.innerHTML = '<div class="page-head"><div><h1>360 feedback</h1><p class="muted">Anonymous feedback from colleagues before a review. Nobody sees who said what, and answers only show once at least two people have replied.</p></div>' +
            (canAsk ? '<div class="page-actions"><button type="button" class="btn btn-primary" id="fb-new">' + icon("plus") + "Ask for feedback</button></div>" : "") + "</div>" +
            (d.toGive.length ? '<section class="panel"><h2 class="panel-title">' + icon("message") + "Feedback you’ve been asked for</h2>" + d.toGive.map(function (r) {
                return '<div class="leave-row"><span>' + avatar(r.subject, "md") + '</span><div class="lr-main"><div class="lr-title">' + esc(r.subject.displayName) + '</div><div class="muted small">Asked by ' + esc(r.requestedBy.displayName) + " · by " + esc(fmtDate(r.dueDate + "T12:00:00")) + "</div>" + (r.note ? '<div class="lr-note">' + esc(r.note) + "</div>" : "") + "</div>" +
                    '<div class="lr-side"><button type="button" class="btn btn-primary btn-small" data-give="' + r.id + '">Give feedback</button></div></div>';
            }).join("") + "</section>" : "") +
            '<section class="panel"><h2 class="panel-title">' + icon("chart") + "Results</h2>" + (d.requests.length ? d.requests.map(function (r) {
                return '<div class="fb-request"><div class="fb-head">' + avatar(r.subject, "md") + '<div><strong>' + esc(r.subject.displayName) + '</strong><div class="muted small">' + r.answeredCount + " of " + r.asked + " answered · asked by " + esc(r.requestedBy.displayName) + " · " + esc(fmtDate(r.createdAt)) + (r.closed ? " · closed" : "") + "</div></div>" +
                    (r.canManage ? '<div class="btn-row">' + (r.closed ? "" : '<button type="button" class="btn btn-ghost btn-small" data-fbc="close" data-id="' + r.id + '">Close</button>') + '<button type="button" class="icon-btn" data-fbc="delete" data-id="' + r.id + '" aria-label="Delete">' + icon("trash") + "</button></div>" : "") + "</div>" +
                    (r.results ? feedbackResultsHtml(d.questions, r.results) : '<p class="muted small">Results appear once at least ' + r.minResponses + " people have answered.</p>") + "</div>";
            }).join("") : '<p class="muted small">No feedback requests yet.</p>') + "</section>";
        root.addEventListener("click", async function (e) {
            if (e.target.closest("#fb-new")) return openFeedbackRequest(d);
            const g = e.target.closest("[data-give]");
            if (g) return openGiveFeedback(d, d.toGive.find(function (x) { return x.id === g.dataset.give; }));
            const c = e.target.closest("[data-fbc]");
            if (c && (c.dataset.fbc === "close" || await confirmDialog({ title: "Delete this request and its answers?", message: "This can’t be undone.", confirmLabel: "Delete", danger: true }))) {
                try { await api("/api/feedback/" + c.dataset.id + "/" + c.dataset.fbc, {}); render(); } catch (err) { toast(err.message); }
            }
        });
    }

    function feedbackResultsHtml(questions, res) {
        return '<div class="fb-results">' + questions.map(function (q) {
            const v = res[q.key];
            if (q.type === "rating") return '<div class="fb-rating"><span>' + esc(q.label) + '</span><strong>' + v.average + ' / 5</strong><div class="fb-dist">' + v.counts.map(function (n, i) { return '<span title="' + (i + 1) + ": " + n + '">' + (i + 1) + "<b>" + n + "</b></span>"; }).join("") + "</div></div>";
            return v.length ? '<div class="fb-text"><span>' + esc(q.label) + "</span><ul>" + v.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>" : "";
        }).join("") + "</div>";
    }

    function openFeedbackRequest(d) {
        const subjects = d.people.filter(function (p) { return p.canRequest; });
        const m = openModal('<h2 class="modal-title">Ask for feedback</h2><form id="fr-form" novalidate>' +
            '<label for="fr-subject">Feedback about</label><select id="fr-subject">' + subjects.map(function (p) { return '<option value="' + p.id + '"' + (p.id === state.me.id ? " selected" : "") + ">" + esc(p.displayName) + (p.id === state.me.id ? " (me)" : "") + "</option>"; }).join("") + "</select>" +
            '<label>Who to ask <span class="muted small">(at least 2)</span></label><div class="member-list fr-people">' + d.people.map(function (p) {
                return '<label class="member-row" data-pid="' + p.id + '"><span class="mr-text"><span class="emp-name">' + esc(p.displayName) + '</span><span class="muted small">' + esc(p.jobTitle) + '</span></span><input type="checkbox" value="' + p.id + '"><span class="mr-check">' + icon("tick") + "</span></label>";
            }).join("") + "</div>" +
            '<div class="grid-2"><div><label for="fr-due">Answer by</label><input type="date" id="fr-due" value="' + isoDay(new Date(Date.now() + 14 * 86400000)) + '"></div>' +
            '<div><label class="inline-check fr-share"><input type="checkbox" id="fr-share" checked> They can see the results too</label></div></div>' +
            '<label for="fr-note">Note to the people you ask <span class="muted small">(optional)</span></label><input type="text" id="fr-note" maxlength="500">' +
            '<div class="form-error" id="fr-error" hidden></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Send requests</button></div></form>', { cls: "modal-members" });
        function sync() {
            const subject = $("#fr-subject", m.el).value;
            $$(".fr-people .member-row", m.el).forEach(function (r) { r.hidden = r.dataset.pid === subject; });
        }
        $("#fr-subject", m.el).addEventListener("change", sync);
        m.el.addEventListener("change", function (e) { const row = e.target.closest(".member-row"); if (row) row.classList.toggle("on", e.target.checked); });
        sync();
        $("#fr-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await api("/api/feedback", { subjectId: $("#fr-subject", m.el).value, reviewers: $$(".fr-people .member-row:not([hidden]) input:checked", m.el).map(function (c) { return c.value; }), dueDate: $("#fr-due", m.el).value, note: $("#fr-note", m.el).value, shareWithSubject: $("#fr-share", m.el).checked });
                closeModal(); toast("Feedback requests sent."); render();
            } catch (err) { formError($("#fr-error", m.el), err.message); }
        });
    }

    function openGiveFeedback(d, r) {
        const m = openModal('<h2 class="modal-title">Feedback on ' + esc(r.subject.displayName) + '</h2><p class="muted">Your answers are anonymous: nobody will see that they came from you.</p><form id="gf-form" novalidate>' +
            d.questions.map(function (q) {
                return '<div class="gf-q"><label>' + esc(q.label) + (q.optional ? ' <span class="muted small">(optional)</span>' : "") + "</label>" + (q.type === "rating" ? ratingInput("gf-" + q.key) : '<textarea name="gf-' + q.key + '" rows="3" maxlength="2000"></textarea>') + "</div>";
            }).join("") +
            '<div class="form-error" id="gf-error" hidden></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Send feedback</button></div></form>', { wide: true });
        $("#gf-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            const answers = {};
            d.questions.forEach(function (q) {
                if (q.type === "rating") { const c = $('input[name="gf-' + q.key + '"]:checked', m.el); answers[q.key] = c ? c.value : ""; }
                else answers[q.key] = $('textarea[name="gf-' + q.key + '"]', m.el).value;
            });
            try { const res = await api("/api/feedback/" + r.id + "/respond", { answers: answers }); state.me = res.user; renderChrome(); closeModal(); toast("Thanks for your feedback."); render(); } catch (err) { formError($("#gf-error", m.el), err.message); }
        });
    }

    // ================= Pulse =================

    const PULSE_FACES = ["😞", "😕", "😐", "🙂", "😀"];

    function pulseCardHtml(question) {
        return '<div class="pulse-card"><h2 class="section-title">' + icon("activity") + "This week’s pulse</h2><p class=\"pulse-q\">" + esc(question) + '</p><div class="pulse-faces">' +
            PULSE_FACES.map(function (f, i) { return '<button type="button" class="pulse-face" data-pulse="' + (i + 1) + '" aria-label="' + (i + 1) + ' out of 5">' + f + "</button>"; }).join("") + "</div>" +
            '<input type="text" class="pulse-comment" maxlength="500" placeholder="Anything to add? (optional, anonymous)"><p class="muted small">Anonymous. Only overall scores are shown.</p></div>';
    }

    function wirePulse(box, after) {
        box.addEventListener("click", async function (e) {
            const b = e.target.closest("[data-pulse]");
            if (!b) return;
            try {
                const r = await api("/api/pulse", { score: b.dataset.pulse, comment: ($(".pulse-comment", box) || {}).value || "" });
                state.me = r.user; renderChrome();
                box.innerHTML = '<div class="pulse-done">' + icon("tick") + "<span>Thanks! See you next week.</span></div>";
                if (after) after();
            } catch (err) { toast(err.message); }
        });
    }

    async function viewPulse(root, current) {
        const d = await api("/api/pulse");
        if (!current()) return;
        root.innerHTML = '<div class="page-head"><div><h1>Pulse</h1><p class="muted">One quick, anonymous question each week so leadership can see how everyone’s doing.</p></div></div>' +
            '<section class="panel" id="pl-answer">' + (d.answered ? '<div class="pulse-done">' + icon("tick") + "<span>You’ve answered this week. Thank you!</span></div>" : pulseCardHtml(d.question)) + "</section>" +
            (d.canSeeResults ? '<section class="panel"><div class="panel-head"><h2 class="panel-title">' + icon("chart") + "Results</h2>" +
                '<form id="pl-q" class="inline-form"><input type="text" id="pl-qtext" maxlength="200" placeholder="Change this week’s question (before anyone answers)"><button type="submit" class="btn btn-ghost btn-small">Set</button></form></div>' +
                (d.results.length ? '<div class="pulse-trend">' + d.results.map(function (w) {
                    return '<div class="pt-col" title="' + esc(w.question) + '"><span class="pt-val">' + (w.average === null ? "–" : w.average) + '</span><span class="pt-bar"><i data-h="' + (w.average ? Math.round(w.average / 5 * 100) : 0) + '"></i></span><small>' + esc(w.week.slice(5)) + "</small><small>" + w.responses + "</small></div>";
                }).join("") + "</div>" +
                d.results.slice().reverse().slice(0, 4).map(function (w) {
                    return '<div class="pulse-week"><div class="pw-head"><strong>' + esc(w.week) + "</strong> · " + esc(w.question) + ' <span class="muted small">' + w.responses + " answers · average " + (w.average === null ? "–" : w.average) + "</span></div>" +
                        (w.byCompany.length ? '<div class="chips">' + w.byCompany.map(function (c) { return '<span class="chip">' + esc(c.company) + " " + c.average + "</span>"; }).join("") + "</div>" : "") +
                        (w.comments.length ? "<ul>" + w.comments.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
                }).join("") : '<p class="muted small">No answers yet.</p>') +
                '<p class="muted small">Company scores and comments only show when at least ' + d.minGroup + " people answered, so nobody can be identified.</p></section>" : "");
        $$(".pt-bar [data-h]", root).forEach(function (b) { b.style.height = b.dataset.h + "%"; });
        if (!d.answered) wirePulse($("#pl-answer"), function () { if (d.canSeeResults) render(); });
        const qf = $("#pl-q");
        if (qf) qf.addEventListener("submit", async function (e) {
            e.preventDefault();
            try { await api("/api/pulse/question", { text: $("#pl-qtext").value }); toast("This week’s question updated."); render(); } catch (err) { toast(err.message); }
        });
    }

    // ================= Exit interviews =================

    async function viewExitInterview(root, current) {
        const d = await api("/api/exit-interview");
        if (!current()) return;
        if (!d.eligible) { root.innerHTML = '<div class="empty-page">' + icon("logout", "big") + "<h2>Nothing here</h2><p class=\"muted\">The exit interview opens when your leaving process starts.</p></div>"; return; }
        if (d.submitted) { root.innerHTML = '<div class="empty-page">' + icon("check", "big") + "<h2>Thank you</h2><p class=\"muted\">You sent your exit interview on " + esc(fmtDate(d.submitted)) + ". Only HR can read it.</p></div>"; return; }
        root.innerHTML = '<div class="page-head"><div><h1>Exit interview</h1><p class="muted">We’re sorry to see you go' + (d.lastDay ? " (your last day is " + esc(fmtDate(d.lastDay + "T12:00:00")) + ")" : "") + ". A few honest answers help us make HN Group better. Only HR can read them.</p></div></div>" +
            '<form class="panel exit-form" id="xi-form" novalidate>' + d.questions.map(function (q) {
                let input;
                if (q.type === "reasons") input = '<div class="check-grid">' + Object.keys(d.reasons).map(function (k) { return '<label class="inline-check"><input type="checkbox" name="xi-reasons" value="' + k + '"> ' + esc(d.reasons[k]) + "</label>"; }).join("") + "</div>";
                else if (q.type === "rating") input = ratingInput("xi-" + q.key);
                else if (q.type === "choice") input = '<div class="option-row">' + q.options.map(function (o) { return '<label class="inline-check"><input type="radio" name="xi-' + q.key + '" value="' + o + '"> ' + o + "</label>"; }).join("") + "</div>";
                else input = '<textarea name="xi-' + q.key + '" rows="3" maxlength="3000"></textarea>';
                return '<div class="gf-q"><label>' + esc(q.label) + (q.optional ? ' <span class="muted small">(optional)</span>' : "") + "</label>" + input + "</div>";
            }).join("") + '<div class="form-error" id="xi-error" hidden></div><div class="form-actions"><button type="submit" class="btn btn-primary">Send exit interview</button></div></form>';
        $("#xi-form").addEventListener("submit", async function (e) {
            e.preventDefault();
            const answers = {};
            d.questions.forEach(function (q) {
                if (q.type === "reasons") answers[q.key] = $$('input[name="xi-reasons"]:checked').map(function (c) { return c.value; });
                else if (q.type === "rating" || q.type === "choice") { const c = $('input[name="xi-' + q.key + '"]:checked'); answers[q.key] = c ? c.value : ""; }
                else answers[q.key] = $('textarea[name="xi-' + q.key + '"]').value;
            });
            try { const r = await api("/api/exit-interview", { answers: answers }); state.me = r.user; renderChrome(); toast("Thank you. Your exit interview has been sent."); render(); } catch (err) { formError($("#xi-error"), err.message); }
        });
    }

    async function viewExitInterviews(root, current) {
        const d = await api("/api/exit-interviews");
        if (!current()) return;
        const qs = {};
        d.questions.forEach(function (q) { qs[q.key] = q; });
        root.innerHTML = '<div class="page-head"><div><h1>Exit interviews</h1><p class="muted">What leavers told us. Only HR can see this page.</p></div></div>' +
            (d.summary.length ? '<section class="panel"><h2 class="panel-title">' + icon("chart") + "Why people leave</h2><div class=\"budget-list\">" + d.summary.map(function (s) {
                return '<div class="budget-row"><div class="br-head"><strong>' + esc(s.label) + "</strong><span>" + s.count + "</span></div></div>";
            }).join("") + "</div></section>" : "") +
            (d.interviews.length ? d.interviews.map(function (i) {
                return '<section class="panel xi-card"><div class="panel-head"><h2 class="panel-title">' + esc(i.name) + ' <span class="muted small">' + esc(i.jobTitle) + " · " + esc(i.company) + "</span></h2><span class=\"muted small\">" + esc(fmtDate(i.at)) + "</span></div>" +
                    '<div class="chips">' + i.answers.reasons.map(function (r) { return '<span class="chip">' + esc(d.reasons[r]) + "</span>"; }).join("") + "</div>" +
                    '<dl class="xi-answers">' + ["enjoyed", "improve", "manager", "recommend", "return", "other"].filter(function (k) { return i.answers[k] !== "" && i.answers[k] !== undefined; }).map(function (k) {
                        return "<dt>" + esc(qs[k].label) + "</dt><dd>" + esc(qs[k].type === "rating" ? i.answers[k] + " / 5" : i.answers[k]) + "</dd>";
                    }).join("") + "</dl></section>";
            }).join("") : '<div class="empty-page">' + icon("logout", "big") + "<h2>No exit interviews yet</h2></div>");
    }

    // ================= Flexible working =================

    const FLEX_CLS = { pending: "badge-yellow", approved: "badge-green", trial: "badge-soft", declined: "badge-red", withdrawn: "" };

    async function viewFlexible(root, current) {
        const d = await api("/api/flexible");
        if (!current()) return;
        function card(r) {
            return '<article class="panel flex-card" data-flex="' + r.id + '"><div class="panel-head"><div class="emp-cell">' + avatar(r.person, "md") + "<div><strong>" + esc(r.typeLabel) + '</strong><div class="muted small">' + esc(r.person.displayName) + " · asked " + esc(fmtDate(r.createdAt)) + " · from " + esc(fmtDate(r.startDate + "T12:00:00")) + "</div></div></div>" +
                '<span class="badge ' + (FLEX_CLS[r.status] || "") + '">' + esc(r.statusLabel) + (r.status === "trial" && r.trialUntil ? " until " + esc(fmtDate(r.trialUntil + "T12:00:00")) : "") + "</span></div>" +
                '<dl class="xi-answers">' + (r.current ? "<dt>Now</dt><dd>" + esc(r.current) + "</dd>" : "") + "<dt>Asking for</dt><dd>" + esc(r.requested) + "</dd>" +
                (r.reason ? "<dt>Why</dt><dd>" + esc(r.reason) + "</dd>" : "") + (r.impact ? "<dt>Effect on work and how to handle it</dt><dd>" + esc(r.impact) + "</dd>" : "") +
                (r.decisionNote ? "<dt>Decision" + (r.decidedByName ? " by " + esc(r.decidedByName) : "") + "</dt><dd>" + esc(r.decisionNote) + "</dd>" : "") + "</dl>" +
                (r.status === "pending" ? '<p class="small ' + (r.overdue ? "danger-text" : "muted") + '">A decision is due by ' + esc(fmtDate(r.decideBy + "T12:00:00")) + " (within two months).</p>" : "") +
                (r.comments.length ? r.comments.map(function (c) { return '<div class="ic-row">' + avatar(c.author, "sm") + "<div><strong>" + esc(c.author.displayName) + '</strong> <span class="muted small">' + esc(fmtDateTime(c.at)) + "</span><p>" + esc(c.text) + "</p></div></div>"; }).join("") : "") +
                '<form class="inline-form" data-flex-comment><input type="text" maxlength="1500" placeholder="Add a comment"><button type="submit" class="btn btn-ghost btn-small">Post</button></form>' +
                '<div class="btn-row flex-actions">' + (r.canDecide ? '<button type="button" class="btn btn-primary btn-small" data-fx="decide">Decide</button>' : "") + (r.mine && r.status === "pending" ? '<button type="button" class="btn btn-link btn-small" data-fx="withdraw">Withdraw</button>' : "") + "</div></article>";
        }
        root.innerHTML = '<div class="page-head"><div><h1>Flexible working</h1><p class="muted">Ask for a different working pattern: hours, hybrid working, compressed hours and so on. Your supervisor or HR decide, normally within two months, and give a reason if it’s a no.</p></div>' +
            (state.me.system ? "" : '<div class="page-actions"><button type="button" class="btn btn-primary" id="fx-new">' + icon("plus") + "Make a request</button></div>") + "</div>" +
            (d.others.length ? '<h2 class="section-title">' + icon("users") + "Requests from others</h2>" + d.others.map(card).join("") : "") +
            '<h2 class="section-title">' + icon("user") + "My requests</h2>" + (d.mine.length ? d.mine.map(card).join("") : '<p class="muted small">You haven’t made any requests.</p>');
        root.addEventListener("submit", async function (e) {
            const f = e.target.closest("[data-flex-comment]");
            if (!f) return;
            e.preventDefault();
            try { await api("/api/flexible/" + f.closest("[data-flex]").dataset.flex + "/comment", { text: $("input", f).value }); render(); } catch (err) { toast(err.message); }
        });
        root.addEventListener("click", async function (e) {
            if (e.target.closest("#fx-new")) return openFlexibleForm(d);
            const b = e.target.closest("[data-fx]");
            if (!b) return;
            const r = d.mine.concat(d.others).find(function (x) { return x.id === b.closest("[data-flex]").dataset.flex; });
            if (b.dataset.fx === "decide") return openFlexibleDecision(r);
            if (await confirmDialog({ title: "Withdraw this request?", message: "You can make a new one later.", confirmLabel: "Withdraw" })) {
                try { await api("/api/flexible/" + r.id + "/withdraw", {}); render(); } catch (err) { toast(err.message); }
            }
        });
    }

    function openFlexibleForm(d) {
        const m = openModal('<h2 class="modal-title">Flexible working request</h2><form id="ff-form" novalidate>' +
            '<label for="ff-type">What kind of change?</label><select id="ff-type">' + Object.keys(d.types).map(function (k) { return '<option value="' + k + '">' + esc(d.types[k]) + "</option>"; }).join("") + "</select>" +
            '<label for="ff-current">How you work now</label><textarea id="ff-current" rows="2" maxlength="1000" placeholder="e.g. Monday to Friday, 9 to 5.30, in the office"></textarea>' +
            '<label for="ff-req">What you’d like</label><textarea id="ff-req" rows="2" maxlength="2000" placeholder="e.g. Work from home on Tuesdays and Thursdays"></textarea>' +
            '<label for="ff-start">From</label><input type="date" id="ff-start" value="' + isoDay(new Date(Date.now() + 30 * 86400000)) + '">' +
            '<label for="ff-reason">Why <span class="muted small">(optional)</span></label><textarea id="ff-reason" rows="2" maxlength="2000"></textarea>' +
            '<label for="ff-impact">How it might affect your work, and how that could be handled <span class="muted small">(optional)</span></label><textarea id="ff-impact" rows="2" maxlength="2000"></textarea>' +
            '<div class="form-error" id="ff-error" hidden></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Send request</button></div></form>', { wide: true });
        $("#ff-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                await api("/api/flexible", { type: $("#ff-type", m.el).value, current: $("#ff-current", m.el).value, requested: $("#ff-req", m.el).value, startDate: $("#ff-start", m.el).value, reason: $("#ff-reason", m.el).value, impact: $("#ff-impact", m.el).value });
                closeModal(); toast("Request sent."); render();
            } catch (err) { formError($("#ff-error", m.el), err.message); }
        });
    }

    function openFlexibleDecision(r) {
        const m = openModal('<h2 class="modal-title">Decide: ' + esc(r.typeLabel) + "</h2><p class=\"muted\">" + esc(r.person.displayName) + " · " + esc(r.requested) + '</p><form id="fd2-form" novalidate>' +
            '<div class="option-row"><label class="inline-check"><input type="radio" name="fd2" value="approved" checked> Approve</label><label class="inline-check"><input type="radio" name="fd2" value="trial"> Agree on a trial</label><label class="inline-check"><input type="radio" name="fd2" value="declined"> Decline</label></div>' +
            '<div id="fd2-trial" hidden><label for="fd2-until">Trial until</label><input type="date" id="fd2-until"></div>' +
            '<label for="fd2-note">Note <span class="muted small" id="fd2-hint">(optional)</span></label><textarea id="fd2-note" rows="3" maxlength="2000"></textarea>' +
            '<div class="form-error" id="fd2-error" hidden></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save decision</button></div></form>');
        m.el.addEventListener("change", function () {
            const v = $('input[name="fd2"]:checked', m.el).value;
            $("#fd2-trial", m.el).hidden = v !== "trial";
            $("#fd2-hint", m.el).textContent = v === "declined" ? "(required: the business reason)" : "(optional)";
        });
        $("#fd2-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try { await api("/api/flexible/" + r.id + "/decide", { status: $('input[name="fd2"]:checked', m.el).value, trialUntil: $("#fd2-until", m.el).value, note: $("#fd2-note", m.el).value }); closeModal(); toast("Decision saved."); render(); } catch (err) { formError($("#fd2-error", m.el), err.message); }
        });
    }

    // ================= Work patterns =================

    function openWorkPattern(personId, name, current) {
        const days = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];
        const m = openModal('<h2 class="modal-title">Working days · ' + esc(name) + '</h2><p class="muted">For part-time and shift staff. Leave only counts their working days, and bank holidays are shared out fairly: they get bank holidays in proportion to the days they work, and the difference from the ones that fall on their working days is added to (or taken from) their allowance.</p>' +
            '<div class="day-pick">' + days.map(function (d) { return '<label class="day-chip"><input type="checkbox" value="' + d[0] + '"' + (current.indexOf(d[0]) !== -1 ? " checked" : "") + "><span>" + d[1] + "</span></label>"; }).join("") + "</div>" +
            '<div class="form-error" id="wp-error" hidden></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="button" class="btn btn-primary" id="wp-save">Save</button></div>');
        $("#wp-save", m.el).addEventListener("click", async function () {
            try {
                const r = await api("/api/leave/pattern/" + personId, { days: $$(".day-pick input:checked", m.el).map(function (c) { return Number(c.value); }) });
                closeModal();
                toast("Saved. Bank holiday adjustment this year: " + (r.summary.bankHolidayAdjustment > 0 ? "+" : "") + r.summary.bankHolidayAdjustment + " days.");
                render();
            } catch (err) { formError($("#wp-error", m.el), err.message); }
        });
    }


    // ================= Simple Markdown (wiki, Q&A) =================
    // Everything is escaped first, then a few safe patterns are turned into HTML. Links only allow
    // http(s), mailto and paths on this site.

    function mdInline(t) {
        return t
            .replace(/`([^`]+)`/g, "<code>$1</code>")
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
            .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
            .replace(/\[\[([^\]]{1,120})\]\]/g, function (m, title) { return '<a href="#" data-wikilink="' + title + '">' + title + "</a>"; })
            .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|\/)[^)\s]+)\)/g, function (m, text, url) {
                return '<a href="' + url + '"' + (url.charAt(0) === "/" ? " data-link" : ' target="_blank" rel="noopener noreferrer"') + ">" + text + "</a>";
            });
    }

    function md(text) {
        const lines = esc(text || "").split("\n");
        let html = "", list = null, para = [], code = null;
        function flushPara() { if (para.length) { html += "<p>" + mdInline(para.join(" ")) + "</p>"; para = []; } }
        function flushList() { if (list) { html += "</" + list + ">"; list = null; } }
        lines.forEach(function (raw) {
            const line = raw.replace(/\s+$/, "");
            if (code !== null) {
                if (/^```/.test(line)) { html += "<pre><code>" + code.join("\n") + "</code></pre>"; code = null; } else code.push(raw);
                return;
            }
            if (/^```/.test(line)) { flushPara(); flushList(); code = []; return; }
            let m;
            if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flushPara(); flushList(); const n = m[1].length + 1; html += "<h" + n + ">" + mdInline(m[2]) + "</h" + n + ">"; return; }
            if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) { flushPara(); if (list !== "ul") { flushList(); html += "<ul>"; list = "ul"; } html += "<li>" + mdInline(m[1]) + "</li>"; return; }
            if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) { flushPara(); if (list !== "ol") { flushList(); html += "<ol>"; list = "ol"; } html += "<li>" + mdInline(m[1]) + "</li>"; return; }
            if (/^&gt;\s?/.test(line)) { flushPara(); flushList(); html += "<blockquote>" + mdInline(line.replace(/^&gt;\s?/, "")) + "</blockquote>"; return; }
            if (/^---+$/.test(line)) { flushPara(); flushList(); html += "<hr>"; return; }
            if (!line.trim()) { flushPara(); flushList(); return; }
            flushList();
            para.push(line);
        });
        if (code !== null) html += "<pre><code>" + code.join("\n") + "</code></pre>";
        flushPara(); flushList();
        return html;
    }

    // ================= Team chat =================

    async function viewChat(root, current) {
        let channel = new URLSearchParams(window.location.search).get("c") || state.chatChannel || "everyone";
        const d = await api("/api/chat?open=" + encodeURIComponent(channel));
        if (!current()) return;
        let channels = d.channels;
        if (!channels.some(function (c) { return c.id === channel; }) && !/^dm-/.test(channel)) channel = "everyone";
        let last = "";
        root.innerHTML = '<div class="page-head"><div><h1>Chat</h1><p class="muted">Talk to everyone, your company, or message someone directly.</p></div>' +
            '<div class="page-actions"><button type="button" class="btn btn-primary" id="ch-new">' + icon("message") + "New message</button></div></div>" +
            '<div class="chat-layout"><aside class="chat-channels" id="ch-list"></aside><section class="chat-pane"><div class="chat-head" id="ch-head"></div>' +
            '<div class="chat-messages" id="ch-msgs"></div><form class="chat-input" id="ch-form"><textarea id="ch-text" rows="1" maxlength="4000" placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"></textarea>' +
            '<button type="submit" class="btn btn-primary" aria-label="Send">' + icon("chevronRight") + "</button></form></section></div>";
        function drawChannels() {
            const groups = [["Channels", channels.filter(function (c) { return c.kind !== "dm"; })], ["Direct messages", channels.filter(function (c) { return c.kind === "dm"; })]];
            $("#ch-list").innerHTML = groups.map(function (g) {
                return '<div class="ch-group">' + g[0] + "</div>" + (g[1].length ? g[1].map(function (c) {
                    return '<button type="button" class="ch-item' + (c.id === channel ? " active" : "") + (c.unread ? " unread" : "") + '" data-ch="' + c.id + '">' +
                        (c.other ? avatar(c.other, "sm") : '<span class="ch-hash">#</span>') + '<span class="ch-name"><strong>' + esc(c.name) + "</strong>" +
                        (c.last ? '<span class="muted small">' + esc((c.kind === "dm" ? "" : c.last.by.split(" ")[0] + ": ") + c.last.text.replace(/\*\*|__|`/g, "")) + "</span>" : "") + "</span>" +
                        (c.unread ? '<span class="count-badge">' + c.unread + "</span>" : "") + "</button>";
                }).join("") : '<p class="muted small ch-none">None yet</p>');
            }).join("");
            const cur = channels.find(function (c) { return c.id === channel; });
            $("#ch-head").innerHTML = cur ? (cur.other ? avatar(cur.other, "sm") + "<strong>" + esc(cur.name) + '</strong><span class="muted small">' + esc(cur.other.jobTitle || "") + "</span>" : '<span class="ch-hash">#</span><strong>' + esc(cur.name) + "</strong>") : "";
        }
        function msgHtml(x, prev) {
            const same = prev && prev.by.id === x.by.id && (new Date(x.at) - new Date(prev.at)) < 5 * 60000;
            return '<div class="chat-msg' + (x.mine ? " mine" : "") + (same ? " cont" : "") + '" data-msg="' + x.id + '">' + (same ? '<span class="cm-gap"></span>' : avatar(x.by, "sm")) +
                '<div class="cm-body">' + (same ? "" : '<div class="cm-head"><strong>' + esc(x.by.displayName) + '</strong><span class="muted small">' + esc(new Date(x.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) + "</span></div>") +
                '<div class="cm-text">' + (x.deleted ? '<em class="muted">Message deleted</em>' : richText(x.text)) + "</div></div>" +
                (x.canDelete ? '<button type="button" class="icon-btn icon-btn-sm cm-del" data-del="' + x.id + '" aria-label="Delete message">' + icon("trash") + "</button>" : "") + "</div>";
        }
        let shown = [];
        async function load(fresh) {
            try {
                const r = await api("/api/chat/c/" + channel + (fresh || !last ? "" : "?after=" + encodeURIComponent(last)));
                if (!current()) return;
                const box = $("#ch-msgs");
                const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
                if (fresh || !last) shown = r.messages; else shown = shown.concat(r.messages);
                if (r.messages.length || fresh) {
                    box.innerHTML = shown.length ? shown.map(function (x, i) { return msgHtml(x, shown[i - 1]); }).join("") : '<div class="chat-empty">' + icon("message", "big") + "<p>No messages yet. Say hello!</p></div>";
                    if (fresh || atBottom) box.scrollTop = box.scrollHeight;
                }
                if (shown.length) last = shown[shown.length - 1].at;
                if (state.me.chatUnread !== r.unreadTotal) { state.me.chatUnread = r.unreadTotal; renderChrome(); }
            } catch (err) { /* keep trying */ }
        }
        async function refreshChannels() {
            try { channels = (await api("/api/chat?open=" + encodeURIComponent(channel))).channels; if (current()) drawChannels(); } catch (e) { /* ignore */ }
        }
        function open(id) {
            channel = state.chatChannel = id;
            last = ""; shown = [];
            history.replaceState({}, "", "/chat?c=" + id);
            drawChannels();
            load(true).then(refreshChannels);
            $("#ch-text").focus();
        }
        drawChannels();
        load(true).then(refreshChannels);
        const timer = setInterval(function () {
            if (!current()) return clearInterval(timer);
            if (document.hidden) return;
            load(false);
            refreshChannels();
        }, 4000);
        $("#ch-text").addEventListener("keydown", function (e) {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#ch-form").requestSubmit(); }
        });
        $("#ch-text").addEventListener("input", function (e) { e.target.style.height = "auto"; e.target.style.height = Math.min(160, e.target.scrollHeight) + "px"; });
        $("#ch-form").addEventListener("submit", async function (e) {
            e.preventDefault();
            const t = $("#ch-text").value.trim();
            if (!t) return;
            $("#ch-text").value = "";
            $("#ch-text").style.height = "auto";
            try { await api("/api/chat/c/" + channel, { text: t }); await load(false); refreshChannels(); $("#ch-msgs").scrollTop = $("#ch-msgs").scrollHeight; } catch (err) { toast(err.message); $("#ch-text").value = t; }
        });
        root.addEventListener("click", async function (e) {
            const c = e.target.closest("[data-ch]");
            if (c) return open(c.dataset.ch);
            const del = e.target.closest("[data-del]");
            if (del) {
                try { await api("/api/chat/c/" + channel + "/" + del.dataset.del + "/delete", {}); load(true); } catch (err) { toast(err.message); }
                return;
            }
            if (e.target.closest("#ch-new")) {
                const m = openModal('<h2 class="modal-title">New message</h2><input type="search" id="nm-search" placeholder="Search for a colleague" autocomplete="off"><div class="kf-results" id="nm-results"></div>');
                const draw = function () {
                    const q = $("#nm-search", m.el).value.trim().toLowerCase();
                    $("#nm-results", m.el).innerHTML = d.people.filter(function (p) { return !q || (p.displayName + " " + p.jobTitle).toLowerCase().indexOf(q) !== -1; }).slice(0, 8).map(function (p) {
                        return '<button type="button" class="kf-result" data-dm="' + p.id + '">' + avatar(p, "sm") + "<span>" + esc(p.displayName) + ' <span class="muted small">' + esc(p.jobTitle) + "</span></span></button>";
                    }).join("");
                };
                $("#nm-search", m.el).addEventListener("input", draw);
                m.el.addEventListener("click", async function (ev) {
                    const b = ev.target.closest("[data-dm]");
                    if (!b) return;
                    const r = await api("/api/chat/dm", { personId: b.dataset.dm });
                    closeModal();
                    const p = d.people.find(function (x) { return x.id === b.dataset.dm; });
                    if (!channels.some(function (x) { return x.id === r.channel; })) channels.push({ id: r.channel, kind: "dm", name: p.displayName, other: p, unread: 0, last: null });
                    open(r.channel);
                });
                draw();
            }
        });
    }

    // ================= Q&A =================

    async function viewQuestions(root, current) {
        const qid = new URLSearchParams(window.location.search).get("q");
        if (qid) return viewQuestion(root, current, qid);
        const d = await api("/api/qa");
        if (!current()) return;
        let filter = state.qaFilter || "all";
        root.innerHTML = '<div class="page-head"><div><h1>Q&amp;A</h1><p class="muted">Ask a question and anyone can answer. The best answer gets pinned, so the next person can find it.</p></div>' +
            (state.me.system ? "" : '<div class="page-actions"><button type="button" class="btn btn-primary" id="qa-new">' + icon("plus") + "Ask a question</button></div>") + "</div>" +
            '<div class="toolbar"><label class="search">' + icon("search") + '<input type="search" id="qa-search" placeholder="Search questions and answers"></label>' +
            '<div class="company-tabs" id="qa-tabs"><button type="button" data-f="all">All</button><button type="button" data-f="open">Unanswered</button><button type="button" data-f="solved">Solved</button><button type="button" data-f="mine">Mine</button></div></div>' +
            '<div id="qa-list" class="qa-list"></div>';
        function draw() {
            $$("#qa-tabs [data-f]").forEach(function (b) { b.classList.toggle("active", b.dataset.f === filter); });
            const s = $("#qa-search").value.trim().toLowerCase();
            const list = d.questions.filter(function (q) {
                if (filter === "open" && q.answerCount) return false;
                if (filter === "solved" && !q.solved) return false;
                if (filter === "mine" && !q.mine) return false;
                return !s || (q.title + " " + q.snippet + " " + q.tags.join(" ")).toLowerCase().indexOf(s) !== -1;
            });
            $("#qa-list").innerHTML = list.length ? list.map(function (q) {
                return '<a class="qa-row" href="/questions?q=' + q.id + '" data-link><span class="qa-count' + (q.solved ? " solved" : q.answerCount ? " answered" : "") + '"><strong>' + q.answerCount + "</strong>answer" + (q.answerCount === 1 ? "" : "s") + "</span>" +
                    '<span class="qa-main"><strong>' + esc(q.title) + "</strong>" + (q.snippet ? '<span class="muted small">' + esc(q.snippet) + "</span>" : "") +
                    '<span class="qa-meta">' + q.tags.map(function (t) { return '<span class="chip">' + esc(t) + "</span>"; }).join("") + '<span class="muted small">' + esc(q.author.displayName) + " · " + esc(timeAgo(q.createdAt)) + "</span></span></span></a>";
            }).join("") : '<div class="empty-page">' + icon("message", "big") + "<h2>No questions here</h2></div>";
        }
        $("#qa-search").addEventListener("input", draw);
        root.addEventListener("click", function (e) {
            const t = e.target.closest("[data-f]");
            if (t) { filter = state.qaFilter = t.dataset.f; draw(); }
            if (e.target.closest("#qa-new")) openAskForm();
        });
        draw();
    }

    function openAskForm() {
        const m = openModal('<h2 class="modal-title">Ask a question</h2><form id="ak-form" novalidate>' +
            '<label for="ak-title">Your question</label><input type="text" id="ak-title" maxlength="200" placeholder="e.g. How do I add someone to the shared calendar?">' +
            '<label for="ak-body">More detail <span class="muted small">(optional)</span></label><textarea id="ak-body" rows="4" maxlength="5000"></textarea>' +
            '<label for="ak-tags">Tags <span class="muted small">(optional, comma separated)</span></label><input type="text" id="ak-tags" maxlength="150" placeholder="e.g. IT, calendar">' +
            '<div class="form-error" id="ak-error" hidden></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Ask</button></div></form>');
        $("#ak-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try { const r = await api("/api/qa", { title: $("#ak-title", m.el).value, body: $("#ak-body", m.el).value, tags: $("#ak-tags", m.el).value }); closeModal(); navigate("/questions?q=" + r.id); } catch (err) { formError($("#ak-error", m.el), err.message); }
        });
    }

    async function viewQuestion(root, current, id) {
        let q = (await api("/api/qa/" + id)).question;
        if (!current()) return;
        function draw() {
            root.innerHTML = '<a class="back-link" href="/questions" data-link>' + icon("chevronLeft") + "All questions</a>" +
                '<article class="panel qa-question"><h1>' + esc(q.title) + '</h1><div class="qa-meta">' + q.tags.map(function (t) { return '<span class="chip">' + esc(t) + "</span>"; }).join("") +
                '<span class="muted small">Asked by ' + esc(q.author.displayName) + " · " + esc(fmtDateTime(q.createdAt)) + "</span>" +
                (q.canDelete ? '<button type="button" class="btn btn-link btn-small danger-text" data-qd>Delete question</button>' : "") + "</div>" +
                (q.body ? '<div class="md">' + md(q.body) + "</div>" : "") + "</article>" +
                '<h2 class="section-title">' + q.answers.length + " answer" + (q.answers.length === 1 ? "" : "s") + "</h2>" +
                q.answers.map(function (a) {
                    return '<article class="panel qa-answer' + (a.accepted ? " accepted" : "") + '" data-a="' + a.id + '"><div class="qa-vote"><button type="button" class="vote-btn' + (a.voted ? " voted" : "") + '" data-av' + (a.mine ? " disabled" : "") + ' aria-label="Helpful">' + icon("chevronRight", "vote-up") + "<strong>" + a.votes + "</strong><span>helpful</span></button></div>" +
                        '<div class="qa-a-main">' + (a.accepted ? '<span class="badge badge-green">' + icon("check") + "Best answer</span>" : "") + '<div class="md">' + md(a.body) + "</div>" +
                        '<div class="qa-meta"><span class="muted small">' + esc(a.author.displayName) + " · " + esc(fmtDateTime(a.at)) + "</span>" +
                        (q.canAccept ? '<button type="button" class="btn btn-link btn-small" data-aa>' + (a.accepted ? "Unmark best answer" : "Mark as best answer") + "</button>" : "") +
                        (a.canDelete ? '<button type="button" class="btn btn-link btn-small danger-text" data-ad>Delete</button>' : "") + "</div></div></article>";
                }).join("") +
                (state.me.system ? "" : '<form class="panel qa-reply" id="qa-reply"><h2 class="panel-title">Your answer</h2><textarea id="qa-text" rows="5" maxlength="5000" placeholder="Share what you know. **bold**, - lists and links work."></textarea><div class="form-error" id="qa-error" hidden></div><div class="form-actions"><button type="submit" class="btn btn-primary">Post answer</button></div></form>');
        }
        async function act(path, body) {
            try { const r = await api("/api/qa/" + q.id + path, body || {}); if (r.question) { q = r.question; draw(); } } catch (err) { toast(err.message); }
        }
        root.addEventListener("submit", function (e) {
            if (e.target.id !== "qa-reply") return;
            e.preventDefault();
            act("/answer", { body: $("#qa-text").value });
        });
        root.addEventListener("click", async function (e) {
            const a = e.target.closest("[data-a]");
            if (e.target.closest("[data-av]")) return act("/vote", { answerId: a.dataset.a });
            if (e.target.closest("[data-aa]")) return act("/accept", { answerId: a.dataset.a });
            if (e.target.closest("[data-ad]") && await confirmDialog({ title: "Delete this answer?", message: "It can’t be undone.", confirmLabel: "Delete", danger: true })) return act("/answers/" + a.dataset.a + "/delete");
            if (e.target.closest("[data-qd]") && await confirmDialog({ title: "Delete this question?", message: "Its answers go too.", confirmLabel: "Delete", danger: true })) {
                try { await api("/api/qa/" + q.id + "/delete", {}); navigate("/questions"); } catch (err) { toast(err.message); }
            }
        });
        draw();
    }

    // ================= Knowledge base =================

    async function viewWiki(root, current) {
        const slug = new URLSearchParams(window.location.search).get("p");
        if (slug) return viewWikiPage(root, current, slug);
        const d = await api("/api/wiki");
        if (!current()) return;
        root.innerHTML = '<div class="page-head"><div><h1>Knowledge base</h1><p class="muted">How-to guides anyone can write and improve. Every change is kept, so nothing gets lost.</p></div>' +
            (state.me.system ? "" : '<div class="page-actions"><button type="button" class="btn btn-primary" id="wk-new">' + icon("plus") + "New page</button></div>") + "</div>" +
            '<div class="toolbar"><label class="search">' + icon("search") + '<input type="search" id="wk-search" placeholder="Search pages"></label></div><div id="wk-list"></div>';
        function draw() {
            const s = $("#wk-search").value.trim().toLowerCase();
            const list = d.pages.filter(function (p) { return !s || (p.title + " " + p.section).toLowerCase().indexOf(s) !== -1; });
            const sections = {};
            list.forEach(function (p) { (sections[p.section] = sections[p.section] || []).push(p); });
            $("#wk-list").innerHTML = Object.keys(sections).length ? Object.keys(sections).sort().map(function (sec) {
                return '<section class="panel wk-section"><h2 class="panel-title">' + icon("file") + esc(sec) + '</h2><div class="wk-pages">' + sections[sec].map(function (p) {
                    return '<a class="wk-page" href="/wiki?p=' + p.slug + '" data-link><strong>' + esc(p.title) + '</strong><span class="muted small">Updated ' + esc(timeAgo(p.updatedAt)) + " by " + esc(p.updatedByName) + "</span></a>";
                }).join("") + "</div></section>";
            }).join("") : '<div class="empty-page">' + icon("file", "big") + "<h2>No pages found</h2></div>";
        }
        $("#wk-search").addEventListener("input", draw);
        root.addEventListener("click", function (e) { if (e.target.closest("#wk-new")) openWikiEditor(null, d.pages); });
        draw();
    }

    async function viewWikiPage(root, current, slug) {
        let r;
        try { r = await api("/api/wiki/page/" + slug); } catch (err) { root.innerHTML = '<div class="empty-page">' + icon("file", "big") + "<h2>Page not found</h2><p><a href=\"/wiki\" data-link>Back to the knowledge base</a></p></div>"; return; }
        if (!current()) return;
        const p = r.page;
        root.innerHTML = '<a class="back-link" href="/wiki" data-link>' + icon("chevronLeft") + "Knowledge base</a>" +
            '<article class="panel wk-article"><div class="wk-head"><div><span class="eyebrow">' + esc(p.section) + "</span><h1>" + esc(p.title) + '</h1><p class="muted small">Last changed ' + esc(fmtDateTime(p.updatedAt)) + " by " + esc(p.updatedByName) + " · " + p.edits + " version" + (p.edits === 1 ? "" : "s") + "</p></div>" +
            '<div class="btn-row">' + (state.me.system ? "" : '<button type="button" class="btn btn-primary btn-small" id="wk-edit">' + icon("edit") + "Edit</button>") +
            (p.history.length ? '<button type="button" class="btn btn-ghost btn-small" id="wk-hist">' + icon("clock") + "History</button>" : "") +
            (r.canDelete ? '<button type="button" class="icon-btn" id="wk-del" aria-label="Delete page">' + icon("trash") + "</button>" : "") + "</div></div>" +
            '<div class="md">' + md(p.body) + "</div>" +
            (p.linkedFrom.length ? '<div class="wk-links"><span class="muted small">Linked from:</span> ' + p.linkedFrom.map(function (l) { return '<a href="/wiki?p=' + l.slug + '" data-link>' + esc(l.title) + "</a>"; }).join(", ") + "</div>" : "") + "</article>";
        root.addEventListener("click", async function (e) {
            const wl = e.target.closest("[data-wikilink]");
            if (wl) {
                e.preventDefault();
                const res = await api("/api/wiki/resolve?title=" + encodeURIComponent(wl.dataset.wikilink));
                if (res.slug) return navigate("/wiki?p=" + res.slug);
                return openWikiEditor({ title: wl.dataset.wikilink, body: "", section: p.section }, null, true);
            }
            if (e.target.closest("#wk-edit")) return openWikiEditor(p);
            if (e.target.closest("#wk-hist")) return openWikiHistory(p);
            if (e.target.closest("#wk-del") && await confirmDialog({ title: "Delete this page?", message: "The page and its history will be removed.", confirmLabel: "Delete", danger: true })) {
                try { await api("/api/wiki/page/" + p.slug + "/delete", {}); navigate("/wiki"); } catch (err) { toast(err.message); }
            }
        });
    }

    function openWikiEditor(p, pages, isNewFromLink) {
        const editing = p && p.slug && !isNewFromLink;
        const v = p || { title: "", body: "", section: "General" };
        const m = openModal('<h2 class="modal-title">' + (editing ? "Edit page" : "New page") + '</h2><form id="we-form" novalidate>' +
            '<div class="grid-2"><div><label for="we-title">Title</label><input type="text" id="we-title" maxlength="120" value="' + esc(v.title) + '"></div>' +
            '<div><label for="we-sec">Section</label><input type="text" id="we-sec" maxlength="60" value="' + esc(v.section) + '" list="we-sections" placeholder="e.g. IT, HR, Getting started"></div></div>' +
            '<div class="we-tabs"><button type="button" class="active" data-wt="write">Write</button><button type="button" data-wt="preview">Preview</button><span class="muted small">Headings with #, lists with -, **bold**, [[Another page]], [link](https://…)</span></div>' +
            '<textarea id="we-body" rows="16" class="we-body">' + esc(v.body) + '</textarea><div class="md we-preview" id="we-preview" hidden></div>' +
            (editing ? '<label for="we-note">What did you change? <span class="muted small">(optional)</span></label><input type="text" id="we-note" maxlength="200">' : "") +
            '<div class="form-error" id="we-error" hidden></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save page</button></div></form>', { wide: true });
        api("/api/wiki").then(function (d) {
            const secs = {};
            d.pages.forEach(function (x) { secs[x.section] = true; });
            const dl = document.createElement("datalist");
            dl.id = "we-sections";
            dl.innerHTML = Object.keys(secs).map(function (s) { return '<option value="' + esc(s) + '">'; }).join("");
            m.el.appendChild(dl);
        }).catch(function () {});
        m.el.addEventListener("click", function (e) {
            const t = e.target.closest("[data-wt]");
            if (!t) return;
            $$("[data-wt]", m.el).forEach(function (b) { b.classList.toggle("active", b === t); });
            const prev = t.dataset.wt === "preview";
            $("#we-body", m.el).hidden = prev;
            $("#we-preview", m.el).hidden = !prev;
            if (prev) $("#we-preview", m.el).innerHTML = md($("#we-body", m.el).value) || '<p class="muted">Nothing to preview yet.</p>';
        });
        $("#we-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            const body = { title: $("#we-title", m.el).value, section: $("#we-sec", m.el).value, body: $("#we-body", m.el).value, note: $("#we-note", m.el) ? $("#we-note", m.el).value : "", baseUpdatedAt: editing ? p.updatedAt : undefined };
            try { const r = await api(editing ? "/api/wiki/page/" + p.slug : "/api/wiki", body); closeModal(); toast("Page saved."); navigate("/wiki?p=" + r.slug); } catch (err) { formError($("#we-error", m.el), err.message); }
        });
    }

    function openWikiHistory(p) {
        const m = openModal('<h2 class="modal-title">History · ' + esc(p.title) + '</h2><p class="muted">Earlier versions of the page. Restoring one saves it as a new version, so the current text is kept too.</p>' +
            '<ol class="version-list">' + '<li class="current"><div class="vl-head"><strong>Current version</strong><span class="muted small">' + esc(fmtDateTime(p.updatedAt)) + " · " + esc(p.updatedByName) + "</span></div>" + (p.note ? '<p class="vl-note">' + esc(p.note) + "</p>" : "") + "</li>" +
            p.history.map(function (h) {
                return '<li><div class="vl-head"><strong>' + esc(fmtDateTime(h.at)) + '</strong><span class="muted small">' + esc(h.byName) + "</span>" +
                    '<button type="button" class="btn btn-ghost btn-small" data-restore="' + h.index + '">Restore</button></div>' + (h.note ? '<p class="vl-note">' + esc(h.note) + "</p>" : "") +
                    '<details class="vl-acks"><summary>Show this version</summary><div class="md wk-old">' + md(h.body) + "</div></details></li>";
            }).join("") + "</ol>" +
            '<div class="modal-actions"><button type="button" class="btn btn-primary" data-close>Done</button></div>', { wide: true });
        m.el.addEventListener("click", async function (e) {
            const b = e.target.closest("[data-restore]");
            if (!b) return;
            try { await api("/api/wiki/page/" + p.slug + "/restore", { index: Number(b.dataset.restore) }); closeModal(); toast("Version restored."); render(); } catch (err) { toast(err.message); }
        });
    }

    // ================= Mentoring =================

    async function viewMentoring(root, current) {
        const d = await api("/api/mentoring");
        if (!current()) return;
        function pairHtml(p) {
            const other = p.role === "mentor" ? p.mentee : p.mentor;
            return '<article class="panel mt-card" data-pair="' + p.id + '"><div class="panel-head"><div class="emp-cell">' + avatar(p.role ? other : p.mentee, "md") + "<div>" +
                (p.role ? "<strong>" + esc(other.displayName) + '</strong><div class="muted small">' + (p.role === "mentor" ? "You’re mentoring them" : "Your mentor") + " · " + esc(other.jobTitle || "") + "</div>"
                    : "<strong>" + esc(p.mentor.displayName) + " → " + esc(p.mentee.displayName) + '</strong><div class="muted small">' + p.meetingCount + " catch-up" + (p.meetingCount === 1 ? "" : "s") + "</div>") + "</div></div>" +
                '<span class="badge ' + (p.status === "active" ? "badge-green" : p.status === "requested" ? "badge-yellow" : "") + '">' + esc(p.statusLabel) + "</span></div>" +
                (p.goals ? '<p><strong>Goals:</strong> ' + esc(p.goals) + "</p>" : "") +
                (p.status === "active" ? '<p class="small ' + (p.due ? "danger-text" : "muted") + '">' + icon("calendar") + " Catch up every " + p.everyWeeks + " week" + (p.everyWeeks === 1 ? "" : "s") + " · next one " + (p.due ? "is due" : "") + " " + esc(fmtDate(p.nextCatchUp + "T12:00:00")) + "</p>" : "") +
                (p.canRespond ? '<div class="btn-row"><button type="button" class="btn btn-ghost btn-small" data-mt="decline">Not right now</button><button type="button" class="btn btn-primary btn-small" data-mt="accept">Yes, I’ll mentor them</button></div>' : "") +
                (p.role && p.status === "active" ? '<div class="btn-row"><button type="button" class="btn btn-primary btn-small" data-mt="meeting">' + icon("check") + 'Log a catch-up</button><button type="button" class="btn btn-ghost btn-small" data-mt="end">End mentoring</button></div>' +
                    '<div class="mt-cols"><div><h3 class="detail-head">Catch-ups</h3>' + (p.meetings.length ? p.meetings.map(function (x) { return '<div class="mt-meeting"><strong>' + esc(fmtDate(x.date + "T12:00:00")) + "</strong>" + (x.summary ? "<p>" + esc(x.summary) + "</p>" : "") + (x.actions ? '<p class="small"><strong>Actions:</strong> ' + esc(x.actions) + "</p>" : "") + "</div>"; }).join("") : '<p class="muted small">None yet.</p>') + "</div>" +
                    '<div><h3 class="detail-head">Shared notebook <span class="muted small">(only you two can see it)</span></h3><form class="inline-form" data-mt-note><input type="text" maxlength="3000" placeholder="Add a note"><button type="submit" class="btn btn-ghost btn-small">Add</button></form>' +
                    p.notes.map(function (n) { return '<div class="ic-row">' + avatar(n.author, "sm") + "<div><strong>" + esc(n.author.displayName) + '</strong> <span class="muted small">' + esc(fmtDate(n.at)) + "</span><p>" + esc(n.text) + "</p></div></div>"; }).join("") + "</div></div>" : "") +
                "</article>";
        }
        const mentorsWithSkills = d.people.filter(function (p) { return p.id !== state.me.id; });
        root.innerHTML = '<div class="page-head"><div><h1>Mentoring</h1><p class="muted">Learn from a colleague. Ask someone to mentor you, agree what you’d like to work on, and keep notes of your catch-ups. Notes are private to the two of you.</p></div>' +
            '<div class="page-actions">' + (d.canPair ? '<button type="button" class="btn btn-ghost" id="mt-pair">' + icon("users") + "Pair people</button>" : "") + (state.me.system ? "" : '<button type="button" class="btn btn-primary" id="mt-ask">' + icon("plus") + "Find a mentor</button>") + "</div></div>" +
            (d.mine.length ? d.mine.map(pairHtml).join("") : '<div class="empty-page">' + icon("users", "big") + "<h2>No mentoring yet</h2><p class=\"muted\">Use <strong>Find a mentor</strong> to ask someone.</p></div>") +
            (d.all.length ? '<h2 class="section-title">' + icon("users") + "All mentoring</h2>" + d.all.map(pairHtml).join("") : "");
        root.addEventListener("submit", async function (e) {
            const f = e.target.closest("[data-mt-note]");
            if (!f) return;
            e.preventDefault();
            try { await api("/api/mentoring/" + f.closest("[data-pair]").dataset.pair + "/note", { text: $("input", f).value }); render(); } catch (err) { toast(err.message); }
        });
        root.addEventListener("click", async function (e) {
            if (e.target.closest("#mt-ask")) return openMentorForm(d, mentorsWithSkills, false);
            if (e.target.closest("#mt-pair")) return openMentorForm(d, d.people, true);
            const b = e.target.closest("[data-mt]");
            if (!b) return;
            const id = b.closest("[data-pair]").dataset.pair;
            try {
                if (b.dataset.mt === "meeting") return openMeetingForm(id);
                if (b.dataset.mt === "end") {
                    if (!(await confirmDialog({ title: "End this mentoring?", message: "Your notes stay available to you both.", confirmLabel: "End" }))) return;
                    await api("/api/mentoring/" + id + "/update", { end: true });
                } else {
                    const r = await api("/api/mentoring/" + id + "/" + b.dataset.mt, {});
                    state.me = r.user; renderChrome();
                }
                render();
            } catch (err) { toast(err.message); }
        });
    }

    function openMentorForm(d, people, pairMode) {
        const opts = function (sel) { return people.map(function (p) { return '<option value="' + p.id + '">' + esc(p.displayName) + " — " + esc(p.jobTitle) + (p.skills.length ? " (" + esc(p.skills.slice(0, 3).join(", ")) + ")" : "") + "</option>"; }).join(""); };
        const m = openModal('<h2 class="modal-title">' + (pairMode ? "Pair people for mentoring" : "Find a mentor") + '</h2><form id="mf-form" novalidate>' +
            (pairMode ? '<label for="mf-mentee">Mentee</label><select id="mf-mentee">' + opts() + "</select>" : "") +
            '<label for="mf-mentor">Mentor</label><select id="mf-mentor">' + opts() + "</select>" +
            '<label for="mf-goals">What would you like to work on?</label><textarea id="mf-goals" rows="3" maxlength="2000" placeholder="e.g. Getting better at presenting to clients"></textarea>' +
            '<label for="mf-every">Catch up every</label><select id="mf-every"><option value="1">week</option><option value="2">2 weeks</option><option value="4" selected>4 weeks</option><option value="6">6 weeks</option><option value="8">8 weeks</option></select>' +
            '<div class="form-error" id="mf-error" hidden></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">' + (pairMode ? "Pair them" : "Ask them") + "</button></div></form>");
        $("#mf-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                const r = await api("/api/mentoring", { mentorId: $("#mf-mentor", m.el).value, menteeId: pairMode ? $("#mf-mentee", m.el).value : undefined, goals: $("#mf-goals", m.el).value, everyWeeks: $("#mf-every", m.el).value });
                state.me = r.user; renderChrome(); closeModal(); toast(pairMode ? "Paired." : "Request sent."); render();
            } catch (err) { formError($("#mf-error", m.el), err.message); }
        });
    }

    function openMeetingForm(id) {
        const m = openModal('<h2 class="modal-title">Log a catch-up</h2><form id="mm-form" novalidate>' +
            '<div class="grid-2"><div><label for="mm-date">Date</label><input type="date" id="mm-date" value="' + isoDay(new Date()) + '"></div><div><label for="mm-next">Next catch-up <span class="muted small">(optional)</span></label><input type="date" id="mm-next"></div></div>' +
            '<label for="mm-sum">What you talked about</label><textarea id="mm-sum" rows="3" maxlength="3000"></textarea>' +
            '<label for="mm-act">Actions <span class="muted small">(optional)</span></label><input type="text" id="mm-act" maxlength="1000">' +
            '<div class="form-error" id="mm-error" hidden></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save</button></div></form>');
        $("#mm-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try { const r = await api("/api/mentoring/" + id + "/meeting", { date: $("#mm-date", m.el).value, next: $("#mm-next", m.el).value, summary: $("#mm-sum", m.el).value, actions: $("#mm-act", m.el).value }); state.me = r.user; renderChrome(); closeModal(); toast("Catch-up saved."); render(); } catch (err) { formError($("#mm-error", m.el), err.message); }
        });
    }

    // ================= On call =================

    async function viewOnCall(root, current) {
        const from = state.onCallFrom || "";
        const d = await api("/api/oncall" + (from ? "?from=" + from : ""));
        if (!current()) return;
        const weekLabel = function (w) { const a = new Date(w + "T12:00:00"); const b = new Date(a); b.setDate(b.getDate() + 6); return a.getDate() + " " + a.toLocaleDateString("en-GB", { month: "short" }) + " – " + b.getDate() + " " + b.toLocaleDateString("en-GB", { month: "short" }); };
        root.innerHTML = '<div class="page-head"><div><h1>On call</h1><p class="muted">Who to contact out of hours. Each person is on call for a week, Monday to Sunday.</p></div>' +
            (d.canManage ? '<div class="page-actions"><button type="button" class="btn btn-primary" id="oc-new">' + icon("plus") + "New rota</button></div>" : "") + "</div>" +
            '<div class="week-nav"><button type="button" class="icon-btn" data-ocw="-4" aria-label="Earlier">' + icon("chevronLeft") + '</button><h2 class="week-title">From ' + esc(weekLabel(d.from)) + '</h2><button type="button" class="icon-btn" data-ocw="4" aria-label="Later">' + icon("chevronRight") + "</button></div>" +
            d.rotas.map(function (r) {
                return '<section class="panel oc-rota" data-rota="' + r.id + '"><div class="panel-head"><div><h2 class="panel-title">' + icon("phone") + esc(r.name) + "</h2>" + (r.description ? '<p class="muted small">' + esc(r.description) + "</p>" : "") + "</div>" +
                    (d.canManage ? '<div class="btn-row"><button type="button" class="btn btn-ghost btn-small" data-oca="rotate">' + icon("refresh") + 'Take turns</button><button type="button" class="btn btn-ghost btn-small" data-oca="edit">' + icon("edit") + '</button><button type="button" class="icon-btn" data-oca="delete" aria-label="Delete rota">' + icon("trash") + "</button></div>" : "") + "</div>" +
                    '<div class="oc-now">' + (r.now ? avatar(r.now, "md") + '<div><span class="muted small">On call this week</span><strong>' + esc(r.now.displayName) + "</strong>" + (r.now.phone ? '<a href="tel:' + esc(r.now.phone) + '">' + icon("phone") + esc(r.now.phone) + "</a>" : "") + "</div>" : '<span class="muted">Nobody is on call this week.</span>') +
                    (r.contact ? '<div class="oc-contact"><span class="muted small">Contact</span><strong>' + esc(r.contact) + "</strong></div>" : "") + "</div>" +
                    '<div class="oc-weeks">' + r.weeks.map(function (w) {
                        return '<div class="oc-week"><span class="muted small">' + esc(weekLabel(w.week)) + "</span>" + (d.canManage ? '<select data-ocweek="' + w.week + '"><option value="">Nobody</option>' + d.people.map(function (p) { return '<option value="' + p.id + '"' + (w.person && w.person.id === p.id ? " selected" : "") + ">" + esc(p.displayName) + "</option>"; }).join("") + "</select>" : "<strong>" + (w.person ? esc(w.person.displayName) : '<span class="muted">Nobody</span>') + "</strong>") + "</div>";
                    }).join("") + "</div></section>";
            }).join("");
        root.addEventListener("change", async function (e) {
            const s = e.target.closest("[data-ocweek]");
            if (!s) return;
            try { await api("/api/oncall/" + s.closest("[data-rota]").dataset.rota + "/assign", { week: s.dataset.ocweek, personId: s.value }); toast("Saved."); } catch (err) { toast(err.message); }
        });
        root.addEventListener("click", async function (e) {
            const w = e.target.closest("[data-ocw]");
            if (w) { const dt = new Date(d.from + "T12:00:00"); dt.setDate(dt.getDate() + Number(w.dataset.ocw) * 7); state.onCallFrom = isoDay(dt); return render(); }
            if (e.target.closest("#oc-new")) return openRotaForm(null);
            const b = e.target.closest("[data-oca]");
            if (!b) return;
            const r = d.rotas.find(function (x) { return x.id === b.closest("[data-rota]").dataset.rota; });
            if (b.dataset.oca === "edit") return openRotaForm(r);
            if (b.dataset.oca === "rotate") return openRotateForm(r, d);
            if (await confirmDialog({ title: "Delete " + r.name + "?", message: "Its weeks will be cleared.", confirmLabel: "Delete", danger: true })) {
                try { await api("/api/oncall/" + r.id + "/delete", {}); render(); } catch (err) { toast(err.message); }
            }
        });
    }

    function openRotaForm(r) {
        const v = r || { name: "", description: "", contact: "" };
        const m = openModal('<h2 class="modal-title">' + (r ? "Edit rota" : "New rota") + '</h2><form id="or-form" novalidate><label for="or-name">Name</label><input type="text" id="or-name" maxlength="80" value="' + esc(v.name) + '">' +
            '<label for="or-desc">What it covers</label><input type="text" id="or-desc" maxlength="300" value="' + esc(v.description) + '">' +
            '<label for="or-contact">Contact (phone or how to reach them) <span class="muted small">(optional)</span></label><input type="text" id="or-contact" maxlength="120" value="' + esc(v.contact) + '">' +
            '<div class="form-error" id="or-error" hidden></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save</button></div></form>');
        $("#or-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try { await api(r ? "/api/oncall/" + r.id : "/api/oncall", { name: $("#or-name", m.el).value, description: $("#or-desc", m.el).value, contact: $("#or-contact", m.el).value }); closeModal(); render(); } catch (err) { formError($("#or-error", m.el), err.message); }
        });
    }

    function openRotateForm(r, d) {
        const m = openModal('<h2 class="modal-title">Take turns · ' + esc(r.name) + '</h2><p class="muted">Fills the coming weeks by going round the people you tick, in order.</p><form id="ot-form" novalidate>' +
            '<div class="member-list">' + d.people.map(function (p) { return '<label class="member-row"><span class="mr-text"><span class="emp-name">' + esc(p.displayName) + '</span><span class="muted small">' + esc(p.jobTitle) + '</span></span><input type="checkbox" value="' + p.id + '"><span class="mr-check">' + icon("tick") + "</span></label>"; }).join("") + "</div>" +
            '<div class="grid-2"><div><label for="ot-from">Starting week</label><input type="date" id="ot-from" value="' + d.from + '"></div><div><label for="ot-count">Weeks to fill</label><input type="number" id="ot-count" min="1" max="52" value="8"></div></div>' +
            '<div class="form-error" id="ot-error" hidden></div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Fill weeks</button></div></form>', { cls: "modal-members" });
        m.el.addEventListener("change", function (e) { const row = e.target.closest(".member-row"); if (row) row.classList.toggle("on", e.target.checked); });
        $("#ot-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            try { await api("/api/oncall/" + r.id + "/rotate", { people: $$(".member-row input:checked", m.el).map(function (c) { return c.value; }), from: $("#ot-from", m.el).value, count: $("#ot-count", m.el).value }); closeModal(); toast("Weeks filled."); render(); } catch (err) { formError($("#ot-error", m.el), err.message); }
        });
    }


    // ================= Sign-in history (Settings → Security) =================

    async function loadMyLogins(box) {
        let d;
        try { d = await api("/api/me/logins"); } catch (e) { box.hidden = true; return; }
        let showAll = false;
        function draw() {
            const list = showAll ? d.logins : d.logins.slice(0, 8);
            box.innerHTML = '<div class="panel-head"><h2 class="panel-title">' + icon("clock") + "Sign-in history</h2></div>" +
                '<p class="muted small">Recent sign-ins and failed attempts on your account. If you don’t recognise one, press <strong>This wasn’t me</strong>: we’ll sign you out everywhere else and tell the IT team.</p>' +
                (list.length ? '<ul class="session-list login-list">' + list.map(function (l) {
                    const canReport = !l.reported && (l.action === "signed-in" || l.failed) && !state.me.impersonatedBy;
                    return '<li class="session-row' + (l.failed ? " is-failed" : "") + '"><span class="session-icon">' + icon(l.failed ? "alert" : l.action === "signed-in" ? "login" : "key") + "</span>" +
                        '<div class="session-text"><div class="emp-name">' + esc(l.label) + (l.detail === "resumed" ? ' <span class="badge">Resumed session</span>' : "") +
                        (l.reported ? ' <span class="badge badge-red">Reported</span>' : "") + "</div>" +
                        '<div class="muted small">' + esc(fmtDateTime(l.at)) + (l.ip ? " · " + esc(l.ip) : "") + (l.ua ? " · " + esc(deviceName(l.ua)) : "") + "</div></div>" +
                        (canReport ? '<button type="button" class="btn btn-ghost btn-small" data-report-at="' + esc(l.at) + '" data-report-ip="' + esc(l.ip) + '">This wasn’t me</button>' : "") + "</li>";
                }).join("") + "</ul>" : '<p class="muted small">No sign-ins recorded yet.</p>') +
                (!showAll && d.logins.length > 8 ? '<button type="button" class="btn btn-ghost btn-small" id="ml-more">Show all ' + d.logins.length + "</button>" : "");
        }
        draw();
        box.onclick = async function (e) {
            if (e.target.closest("#ml-more")) { showAll = true; return draw(); }
            const b = e.target.closest("[data-report-at]");
            if (!b) return;
            const ok = await confirmDialog({
                title: "Report this sign-in?",
                message: "We’ll sign you out on every other device, forget any remembered browsers and raise an urgent IT ticket. You should then change your password and sign-in code.",
                confirmLabel: "Report it", danger: true,
            });
            if (!ok) return;
            try {
                const r = await api("/api/me/logins/report", { at: b.dataset.reportAt, ip: b.dataset.reportIp });
                d = await api("/api/me/logins");
                draw();
                if ($("#my-sessions")) loadMySessions($("#my-sessions"));
                openModal('<h2 class="modal-title">Thanks for telling us</h2>' +
                    '<p>You’ve been signed out everywhere else, and IT ticket <strong>#' + r.ticket + "</strong> has been raised so the IT team can look into it.</p>" +
                    '<p class="muted">Now change your password and sign-in code, just in case.</p>' +
                    '<div class="modal-actions"><button type="button" class="btn btn-primary" data-close id="ml-change">Change my password</button></div>');
                $("#ml-change").addEventListener("click", function () { setTimeout(function () { const f = $("#pw-current"); if (f) { f.scrollIntoView({ block: "center" }); f.focus(); } }, 50); });
            } catch (err) { toast(err.message); }
        };
    }

    // ================= Security & data (System Admin) =================

    function mountSecurityAdmin(box) {
        const RET = {
            auditDays: ["Activity log", "Sign-ins and actions in the activity log", "days"],
            applicantsDays: ["Unsuccessful job applicants", "Applicants marked “Not progressing” or withdrawn, with their CVs", "days"],
            chatDays: ["Chat messages", "Messages in every chat channel and direct message", "days"],
            ticketsDays: ["Closed IT tickets", "Resolved and closed helpdesk tickets", "days"],
            enquiriesDays: ["Website enquiries", "Contact form messages marked as dealt with or spam", "days"],
            leaversYears: ["Leavers’ records", "Staff records, payslips and checklists of leavers whose login is off, counted from their last day", "years"],
        };
        const label = function (n, unit) {
            if (!n) return "Keep forever";
            if (unit === "years") return n + " years";
            return n % 365 === 0 ? (n / 365) + (n === 365 ? " year" : " years") : n + " days";
        };
        async function draw() {
            let d;
            try { d = await api("/api/system/security"); } catch (err) { box.innerHTML = '<p class="muted">' + esc(err.message) + "</p>"; return; }
            const p = d.password, r = d.retention;
            box.innerHTML = '<div class="panel-head"><h2 class="panel-title">' + icon("shield") + "Password rules</h2></div>" +
                '<form id="sec-pw" novalidate><div class="grid-2">' +
                '<div><label for="sec-min">Minimum length</label><input type="number" id="sec-min" min="8" max="32" value="' + p.minLength + '"></div>' +
                '<div><label for="sec-exp">Make people change their password</label><select id="sec-exp">' + d.choices.expiry.map(function (n) {
                    return '<option value="' + n + '"' + (n === p.expiryDays ? " selected" : "") + ">" + (n ? "Every " + (n === 365 ? "year" : n + " days") : "Never") + "</option>";
                }).join("") + "</select></div></div>" +
                '<label class="inline-check"><input type="checkbox" id="sec-common"' + (p.blockCommon ? " checked" : "") + "> Block common and leaked passwords, and passwords based on someone’s name</label>" +
                '<p class="hint">Changes apply the next time someone sets a password. ' + (p.expiryDays ? "Passwords expire " + p.expiryDays + " days after they were last changed (or since expiry was turned on, " + esc(fmtDate(p.expirySince)) + "). People are asked for a new one when they next sign in." : "National Cyber Security Centre advice is not to force regular changes unless a password may have leaked.") + "</p>" +
                '<div class="form-actions"><button type="submit" class="btn btn-primary">Save password rules</button></div></form>' +

                '<div class="panel-head sec-split"><h2 class="panel-title">' + icon("archive") + "Data retention</h2>" +
                '<button type="button" class="btn btn-ghost btn-small" id="sec-run">' + icon("refresh") + "Run clean-up now</button></div>" +
                '<p class="muted small">How long personal data is kept. Anything older is deleted automatically every night (around 3am). Backups taken before then still contain it until they’re rotated out after 14 days.</p>' +
                '<form id="sec-ret" novalidate><div class="ret-grid">' + Object.keys(RET).map(function (k) {
                    return '<div class="ret-row"><div><strong>' + RET[k][0] + '</strong><span class="muted small">' + RET[k][1] + "</span></div>" +
                        '<select data-ret="' + k + '" aria-label="' + esc(RET[k][0]) + '">' + d.choices.retention[k].map(function (n) {
                            return '<option value="' + n + '"' + (n === r[k] ? " selected" : "") + ">" + label(n, RET[k][2]) + "</option>";
                        }).join("") + "</select></div>";
                }).join("") + "</div>" +
                (d.preview.leavers.length ? '<div class="banner banner-warn">' + icon("alert") + "<div><strong>The next clean-up will delete " + d.preview.leavers.length + " leaver" + (d.preview.leavers.length === 1 ? "’s" : "s’") + " records:</strong> " + d.preview.leavers.map(esc).join(", ") + "</div></div>" : "") +
                '<p class="hint">' + (r.lastCleanup ? "Last clean-up " + esc(fmtDateTime(r.lastCleanup.at)) + ": deleted " + r.lastCleanup.audit + " log entries, " + r.lastCleanup.applicants + " applicants, " + r.lastCleanup.chat + " chat messages, " + r.lastCleanup.tickets + " IT tickets, " + (r.lastCleanup.enquiries || 0) + " website enquiries and " + r.lastCleanup.leavers + " leavers." : "The clean-up hasn’t run yet.") + "</p>" +
                '<div class="form-actions"><button type="submit" class="btn btn-primary">Save retention settings</button></div></form>';
        }
        box.addEventListener("submit", async function (e) {
            e.preventDefault();
            try {
                if (e.target.id === "sec-pw") {
                    await api("/api/system/security/password", { minLength: $("#sec-min", box).value, expiryDays: $("#sec-exp", box).value, blockCommon: $("#sec-common", box).checked });
                    toast("Password rules saved.");
                } else {
                    const body = {};
                    $$("[data-ret]", box).forEach(function (s) { body[s.dataset.ret] = s.value; });
                    const leavers = Number(body.leaversYears) > 0;
                    if (leavers && !(await confirmDialog({ title: "Delete old leavers’ records?", message: "Leavers’ staff records, payslips and checklists will be permanently deleted once they left more than " + body.leaversYears + " years ago. UK employers must keep payroll records for at least 3 years after the tax year they relate to.", confirmLabel: "Save" }))) return;
                    await api("/api/system/security/retention", body);
                    toast("Retention settings saved.");
                }
                draw();
            } catch (err) { toast(err.message); }
        });
        box.addEventListener("click", async function (e) {
            if (!e.target.closest("#sec-run")) return;
            if (!(await confirmDialog({ title: "Run the clean-up now?", message: "Data older than the limits below will be deleted straight away. This can’t be undone (except by restoring a backup).", confirmLabel: "Run clean-up", danger: true }))) return;
            try {
                const r = (await api("/api/system/security/cleanup", {})).result;
                toast("Deleted " + r.audit + " log entries, " + r.applicants + " applicants, " + r.chat + " messages, " + r.tickets + " tickets and " + r.leavers + " leavers.");
                draw();
            } catch (err) { toast(err.message); }
        });
        draw();
    }

    // ================= Announcement schedule (calendar of what goes out when) =================

    function drawAnnouncementSchedule(box, list, onEdit, onNew) {
        let month = state.annMonth || isoDay(new Date()).slice(0, 7);
        function draw() {
            const y = Number(month.slice(0, 4)), mth = Number(month.slice(5, 7));
            const first = new Date(y, mth - 1, 1);
            const start = new Date(first);
            start.setDate(1 - ((first.getDay() + 6) % 7));
            const today = isoDay(new Date());
            const byDay = {};
            list.forEach(function (a) {
                const k = isoDay(new Date(a.publishAt));
                (byDay[k] = byDay[k] || []).push({ a: a, kind: "out" });
                if (a.expiresAt) { const e = isoDay(new Date(a.expiresAt)); (byDay[e] = byDay[e] || []).push({ a: a, kind: "end" }); }
            });
            let cells = "";
            for (let i = 0; i < 42; i++) {
                const d = new Date(start);
                d.setDate(start.getDate() + i);
                if (i >= 35 && d.getMonth() !== mth - 1) break;
                const key = isoDay(d);
                const items = byDay[key] || [];
                cells += '<div class="cal-day' + (d.getMonth() !== mth - 1 ? " other" : "") + (key === today ? " today" : "") + (d.getDay() % 6 === 0 ? " weekend" : "") + '" data-day="' + key + '">' +
                    '<span class="cal-num">' + d.getDate() + "</span>" +
                    items.map(function (it) {
                        return '<button type="button" class="cal-item ac-' + (it.kind === "end" ? "end" : it.a.state) + '" data-ann="' + esc(it.a.id) + '" title="' + esc(it.a.title) + '">' +
                            '<span class="cal-time">' + esc(new Date(it.kind === "end" ? it.a.expiresAt : it.a.publishAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })) + "</span>" +
                            (it.kind === "end" ? "Ends: " : "") + esc(it.a.title) + "</button>";
                    }).join("") + "</div>";
            }
            const upcoming = list.filter(function (a) { return a.state === "scheduled"; }).sort(function (a, b) { return a.publishAt.localeCompare(b.publishAt); });
            box.innerHTML = '<div class="cal-layout"><section class="panel cal-panel">' +
                '<div class="cal-toolbar"><div class="btn-row"><button type="button" class="icon-btn" data-am="-1" aria-label="Previous month">' + icon("chevronLeft") + "</button>" +
                '<button type="button" class="btn btn-ghost btn-small" data-am="0">Today</button>' +
                '<button type="button" class="icon-btn" data-am="1" aria-label="Next month">' + icon("chevronRight") + "</button></div>" +
                '<h2 class="cal-title">' + esc(first.toLocaleDateString("en-GB", { month: "long", year: "numeric" })) + "</h2>" +
                '<div class="cal-legend"><span class="ac-scheduled">Scheduled</span><span class="ac-live">Published</span><span class="ac-end">Removed</span></div></div>' +
                '<div class="cal-grid"><div class="cal-dow">Mon</div><div class="cal-dow">Tue</div><div class="cal-dow">Wed</div><div class="cal-dow">Thu</div><div class="cal-dow">Fri</div><div class="cal-dow">Sat</div><div class="cal-dow">Sun</div>' + cells + "</div>" +
                '<p class="hint">Click an empty day to schedule an announcement for 9am that day.</p></section>' +
                '<aside class="panel cal-side"><h2 class="section-title">' + icon("clock") + "Coming up</h2>" +
                (upcoming.length ? '<div class="ann-upcoming">' + upcoming.map(function (a) {
                    return '<button type="button" class="ann-up-row" data-ann="' + esc(a.id) + '"><strong>' + esc(a.title) + '</strong><span class="muted small">' + esc(fmtDateTime(a.publishAt)) +
                        (a.companies && a.companies.length ? " · " + esc(a.companies.join(", ")) : " · Everyone") + "</span></button>";
                }).join("") + "</div>" : '<p class="muted small">Nothing scheduled. Set a publish time when you write an announcement to schedule it.</p>') +
                "</aside></div>";
        }
        box.onclick = function (e) {
            const nav = e.target.closest("[data-am]");
            if (nav) {
                month = nav.dataset.am === "0" ? isoDay(new Date()).slice(0, 7) : shiftMonth(month, Number(nav.dataset.am));
                state.annMonth = month;
                return draw();
            }
            const it = e.target.closest("[data-ann]");
            if (it) return onEdit(it.dataset.ann);
            const day = e.target.closest(".cal-day");
            if (day && day.dataset.day >= isoDay(new Date())) onNew(day.dataset.day);
        };
        draw();
    }

    // ================= Home page panels: choose which show, and in what order =================

    const HOME_WIDGETS = [
        { key: "todo", label: "To do", desc: "Things waiting for you to acknowledge" },
        { key: "onboarding", label: "Onboarding", desc: "Your joiner or leaver checklist" },
        { key: "pulse", label: "Pulse", desc: "This week’s quick question" },
        { key: "leave", label: "Leave balance", desc: "Days left this year and what’s booked", off: true },
        { key: "celebrate", label: "Celebrations", desc: "Birthdays and work anniversaries" },
        { key: "coming", label: "Coming up", desc: "Events and holidays in the next few weeks" },
        { key: "questions", label: "Unanswered questions", desc: "Q&A questions waiting for an answer", off: true },
        { key: "me", label: "Your profile", desc: "Your status, roles and settings" },
        { key: "help", label: "Need help? / On call", desc: "IT contact and who’s on call" },
    ];

    function homeLayout() {
        const saved = state.me.homeLayout;
        const keys = HOME_WIDGETS.map(function (w) { return w.key; });
        const order = (saved && saved.order || []).filter(function (k) { return keys.indexOf(k) !== -1; });
        keys.forEach(function (k) { if (order.indexOf(k) === -1) order.splice(keys.indexOf(k), 0, k); });
        const hidden = saved ? (saved.hidden || []) : HOME_WIDGETS.filter(function (w) { return w.off; }).map(function (w) { return w.key; });
        return { order: order, hidden: hidden };
    }

    // Puts the side panels in the person's order and removes the ones they've turned off.
    function applyHomeLayout(aside) {
        const l = homeLayout();
        l.order.forEach(function (k) {
            const el = $('[data-widget="' + k + '"]', aside);
            if (!el) return;
            if (l.hidden.indexOf(k) !== -1) el.remove(); else aside.insertBefore(el, $(".home-customise", aside));
        });
        if (l.hidden.indexOf("leave") === -1 && $('[data-widget="leave"]', aside)) loadLeaveWidget($('[data-widget="leave"]', aside));
        if (l.hidden.indexOf("questions") === -1 && $('[data-widget="questions"]', aside)) loadQuestionsWidget($('[data-widget="questions"]', aside));
    }

    async function loadLeaveWidget(box) {
        try {
            const d = await api("/api/leave");
            if (!d.summary) { box.remove(); return; }
            const s = d.summary;
            const next = (d.mine || []).filter(function (r) { return r.status === "approved" && r.endDate >= isoDay(new Date()); }).sort(function (a, b) { return a.startDate.localeCompare(b.startDate); })[0];
            box.hidden = false;
            box.innerHTML = '<div class="panel-head tight"><h2 class="section-title">' + icon("sun") + 'Leave</h2><a class="small link-arrow" href="/leave" data-link>Book leave</a></div>' +
                '<div class="lw-stats"><div><strong>' + esc(fmtDays(s.remaining)) + '</strong><span class="muted small">left in ' + s.year + "</span></div>" +
                "<div><strong>" + esc(fmtDays(s.booked + s.pending)) + '</strong><span class="muted small">booked or waiting</span></div>' +
                (s.toilHours ? "<div><strong>" + esc(fmtHours(s.toilHours)) + '</strong><span class="muted small">time off in lieu</span></div>' : "") + "</div>" +
                (next ? '<p class="muted small">Next: ' + esc(dateRange(next.startDate, next.endDate)) + "</p>" : "");
        } catch (e) { box.remove(); }
    }

    async function loadQuestionsWidget(box) {
        try {
            const d = await api("/api/qa");
            const open = d.questions.filter(function (q) { return !q.answerCount && !q.mine; }).slice(0, 4);
            box.hidden = false;
            box.innerHTML = '<div class="panel-head tight"><h2 class="section-title">' + icon("help") + 'Can you help?</h2><a class="small link-arrow" href="/questions" data-link>All questions</a></div>' +
                (open.length ? '<div class="qw-list">' + open.map(function (q) {
                    return '<a class="qw-row" href="/questions?q=' + q.id + '" data-link><strong>' + esc(q.title) + '</strong><span class="muted small">' + esc(q.author.displayName) + " · " + esc(timeAgo(q.createdAt)) + "</span></a>";
                }).join("") + "</div>" : '<p class="muted small">Every question has an answer. Nice work!</p>');
        } catch (e) { box.remove(); }
    }

    function openHomeCustomiser() {
        const l = homeLayout();
        let order = l.order.slice();
        const hidden = {};
        l.hidden.forEach(function (k) { hidden[k] = true; });
        const byKey = {};
        HOME_WIDGETS.forEach(function (w) { byKey[w.key] = w; });
        const m = openModal('<h2 class="modal-title">Customise your home page</h2><p class="muted">Choose which panels show down the side of your home page, and move them into the order you like.</p>' +
            '<ul class="hw-list" id="hw-list"></ul>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" id="hw-reset">Reset</button><button type="button" class="btn btn-primary" id="hw-save">Save</button></div>');
        function draw() {
            $("#hw-list", m.el).innerHTML = order.map(function (k, i) {
                const w = byKey[k];
                return '<li class="hw-row' + (hidden[k] ? " is-off" : "") + '"><label class="hw-toggle"><input type="checkbox" data-hw-show="' + k + '"' + (hidden[k] ? "" : " checked") + "><span><strong>" + esc(w.label) + '</strong><span class="muted small">' + esc(w.desc) + "</span></span></label>" +
                    '<span class="hw-move"><button type="button" class="icon-btn icon-btn-sm" data-hw-up="' + i + '" aria-label="Move ' + esc(w.label) + ' up"' + (i ? "" : " disabled") + ">" + icon("chevronLeft", "hw-up") + "</button>" +
                    '<button type="button" class="icon-btn icon-btn-sm" data-hw-down="' + i + '" aria-label="Move ' + esc(w.label) + ' down"' + (i < order.length - 1 ? "" : " disabled") + ">" + icon("chevronRight", "hw-down") + "</button></span></li>";
            }).join("");
        }
        m.el.addEventListener("change", function (e) {
            const c = e.target.closest("[data-hw-show]");
            if (c) { hidden[c.dataset.hwShow] = !c.checked; draw(); }
        });
        m.el.addEventListener("click", async function (e) {
            const up = e.target.closest("[data-hw-up]"), down = e.target.closest("[data-hw-down]");
            if (up || down) {
                const i = Number((up || down).dataset[up ? "hwUp" : "hwDown"]), j = up ? i - 1 : i + 1;
                const t = order[i]; order[i] = order[j]; order[j] = t;
                return draw();
            }
            const reset = e.target.closest("#hw-reset");
            if (!reset && !e.target.closest("#hw-save")) return;
            try {
                state.me = (await api("/api/me/home-layout", reset ? {} : { order: order, hidden: Object.keys(hidden).filter(function (k) { return hidden[k]; }) })).user;
                closeModal();
                toast(reset ? "Home page reset." : "Home page updated.");
                render();
            } catch (err) { toast(err.message); }
        });
        draw();
    }


    // ================= Website enquiries (contact form on hngroup.org.uk) =================

    async function viewEnquiries(root, current) {
        const d = await api("/api/enquiries");
        if (!current()) return;
        let filter = state.enqFilter || "inbox";
        let openId = new URLSearchParams(window.location.search).get("e");
        root.innerHTML = '<div class="page-head"><div><h1>Website enquiries</h1><p class="muted">Messages sent from the contact form on hngroup.org.uk. Reply from your own email, then mark them as dealt with.</p></div></div>' +
            '<div class="toolbar"><label class="search">' + icon("search") + '<input type="search" id="enq-search" placeholder="Search by name, email or message"></label>' +
            '<div class="company-tabs" id="enq-tabs">' + [["inbox", "To deal with"], ["mine", "Assigned to me"], ["done", "Dealt with"], ["spam", "Spam"], ["all", "All"]].map(function (t) {
                const n = t[0] === "inbox" ? d.enquiries.filter(function (e) { return e.status === "new" || e.status === "open"; }).length : 0;
                return '<button type="button" data-f="' + t[0] + '">' + t[1] + (n ? ' <span class="tab-count">' + n + "</span>" : "") + "</button>";
            }).join("") + "</div></div>" +
            '<div class="enq-layout"><div class="enq-list" id="enq-list"></div><section class="panel enq-detail" id="enq-detail"></section></div>';

        function shown() {
            const q = $("#enq-search").value.trim().toLowerCase();
            return d.enquiries.filter(function (e) {
                if (filter === "inbox" && !(e.status === "new" || e.status === "open")) return false;
                if (filter === "mine" && e.assigneeId !== state.me.id) return false;
                if ((filter === "done" || filter === "spam") && e.status !== filter) return false;
                return !q || [e.name, e.email, e.organisation, e.message, e.company].join(" ").toLowerCase().indexOf(q) !== -1;
            });
        }
        function drawList() {
            $$("#enq-tabs [data-f]").forEach(function (b) { b.classList.toggle("active", b.dataset.f === filter); });
            const list = shown();
            if (!openId || !list.some(function (e) { return e.id === openId; })) openId = list.length ? list[0].id : null;
            $("#enq-list").innerHTML = list.length ? list.map(function (e) {
                return '<button type="button" class="enq-row' + (e.id === openId ? " active" : "") + (e.status === "new" ? " is-new" : "") + '" data-e="' + e.id + '">' +
                    '<span class="enq-top"><strong>' + esc(e.name) + '</strong><span class="muted small">' + esc(timeAgo(e.createdAt)) + "</span></span>" +
                    '<span class="muted small">' + esc(e.topicLabel) + (e.company ? " · " + esc(e.company) : "") + "</span>" +
                    '<span class="enq-snip small">' + esc(e.message.slice(0, 110)) + "</span></button>";
            }).join("") : '<div class="empty-page">' + icon("mail", "big") + "<h2>Nothing here</h2><p class=\"muted\">New messages from the website appear here.</p></div>";
            drawDetail();
        }
        function drawDetail() {
            const e = d.enquiries.find(function (x) { return x.id === openId; });
            const box = $("#enq-detail");
            box.hidden = !e;
            if (!e) return;
            const subject = "Re: your message to HN Group";
            box.innerHTML = '<div class="panel-head"><div><h2 class="panel-title">' + esc(e.name) + "</h2>" +
                '<p class="muted small">' + esc(fmtDateTime(e.createdAt)) + " · " + esc(e.topicLabel) + (e.company ? " · about " + esc(e.company) : "") + "</p></div>" +
                '<span class="badge ' + (e.status === "done" ? "badge-green" : e.status === "spam" ? "badge-red" : e.status === "new" ? "badge-yellow" : "") + '">' + esc(e.statusLabel) + "</span></div>" +
                '<div class="enq-contact">' +
                '<a href="mailto:' + esc(e.email) + "?subject=" + encodeURIComponent(subject) + '">' + icon("mail") + esc(e.email) + "</a>" +
                (e.phone ? '<a href="tel:' + esc(e.phone.replace(/[^\d+]/g, "")) + '">' + icon("phone") + esc(e.phone) + "</a>" : "") +
                (e.organisation ? "<span>" + icon("building") + esc(e.organisation) + "</span>" : "") + "</div>" +
                '<div class="enq-message">' + richText(e.message) + "</div>" +
                '<div class="grid-2"><div><label for="enq-assign">Assigned to</label><select id="enq-assign"><option value="">Nobody</option>' + d.handlers.map(function (h) {
                    return '<option value="' + h.id + '"' + (h.id === e.assigneeId ? " selected" : "") + ">" + esc(h.displayName) + "</option>";
                }).join("") + "</select></div>" +
                '<div><label for="enq-status">Status</label><select id="enq-status">' + Object.keys(d.statuses).map(function (k) {
                    return '<option value="' + k + '"' + (k === e.status ? " selected" : "") + ">" + esc(d.statuses[k]) + "</option>";
                }).join("") + "</select></div></div>" +
                '<h3 class="detail-head">Notes <span class="muted small">(only staff see these)</span></h3>' +
                (e.notes.length ? '<ul class="enq-notes">' + e.notes.map(function (n) {
                    return '<li><div class="small"><strong>' + esc(n.byName) + '</strong> <span class="muted">' + esc(fmtDateTime(n.at)) + "</span></div>" + richText(n.text) + "</li>";
                }).join("") + "</ul>" : "") +
                '<form class="inline-form" id="enq-note"><input type="text" maxlength="3000" placeholder="e.g. Replied with our rates, following up on Friday"><button type="submit" class="btn btn-ghost btn-small">Add note</button></form>' +
                '<div class="form-actions enq-actions">' +
                '<button type="button" class="icon-btn" id="enq-del" aria-label="Delete enquiry">' + icon("trash") + "</button>" +
                '<a class="btn btn-ghost" href="mailto:' + esc(e.email) + "?subject=" + encodeURIComponent(subject) + '">' + icon("mail") + "Reply by email</a>" +
                (e.status !== "done" ? '<button type="button" class="btn btn-primary" id="enq-done">' + icon("check") + "Mark as dealt with</button>" : "") + "</div>";
        }
        async function save(body) {
            try {
                const r = await api("/api/enquiries/" + openId, body);
                const i = d.enquiries.findIndex(function (x) { return x.id === openId; });
                d.enquiries[i] = r.enquiry;
                state.me = (await api("/api/me")).user;
                renderChrome();
                drawList();
            } catch (err) { toast(err.message); }
        }
        $("#enq-search").addEventListener("input", drawList);
        root.addEventListener("click", async function (ev) {
            const f = ev.target.closest("#enq-tabs [data-f]");
            if (f) { filter = state.enqFilter = f.dataset.f; openId = null; return drawList(); }
            const row = ev.target.closest("[data-e]");
            if (row) { openId = row.dataset.e; history.replaceState({}, "", "/enquiries?e=" + openId); return drawList(); }
            if (ev.target.closest("#enq-done")) { await save({ status: "done" }); return toast("Marked as dealt with."); }
            if (ev.target.closest("#enq-del") && await confirmDialog({ title: "Delete this enquiry?", message: "It will be removed for everyone.", confirmLabel: "Delete", danger: true })) {
                try {
                    await api("/api/enquiries/" + openId + "/delete", {});
                    d.enquiries = d.enquiries.filter(function (x) { return x.id !== openId; });
                    openId = null;
                    drawList();
                } catch (err) { toast(err.message); }
            }
        });
        root.addEventListener("change", function (ev) {
            if (ev.target.id === "enq-assign") save({ assigneeId: ev.target.value });
            if (ev.target.id === "enq-status") save({ status: ev.target.value });
        });
        root.addEventListener("submit", function (ev) {
            if (ev.target.id !== "enq-note") return;
            ev.preventDefault();
            const input = $("input", ev.target);
            if (input.value.trim()) save({ note: input.value });
        });
        drawList();
    }

    // ================= Document storage (private storage on docs.hngroup.org.uk) =================
    // Everyone sees the storage they've been given access to. People with "Access staff document storage" (Super
    // Admin and the system owner have it) can open anyone's storage and give individuals access for a while.

    async function viewDocumentStorage(root, current) {
        let d = await api("/api/document-storage");
        if (!current()) return;
        const DOCS = "https://docs.hngroup.org.uk";
        const day = function (iso) { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)); };
        const inDays = function (n) { const t = new Date(Date.now() + n * 86400000); return t.toISOString().slice(0, 10); };
        let viewing = new URLSearchParams(window.location.search).get("view"), viewData = null, viewError = "";
        const size = function (b) { return b < 1024 ? b + " bytes" : b < 1048576 ? Math.round(b / 1024) + " KB" : (b / 1048576).toFixed(1) + " MB"; };
        // Someone's storage, shown here: their private documents (download as PDF) and files. View only; Docs records it.
        function viewer() {
            if (!viewing) return "";
            if (!viewData) return '<section class="panel" id="ds-viewer"><p class="muted">' + (viewError ? esc(viewError) : "Opening their storage…") + '</p><button type="button" class="btn btn-ghost btn-small" data-close-view>Close</button></section>';
            const base = "/api/document-storage/people/" + encodeURIComponent(viewing);
            const p = viewData.person, docs = viewData.documents, files = viewData.files;
            return '<section class="panel" id="ds-viewer"><div class="panel-head"><div><h2 class="panel-title">' + esc(p.name) + "’s storage</h2>" +
                '<p class="muted small">' + (p.jobTitle ? esc(p.jobTitle) + " · " : "") + "View only. Opening and downloading are recorded on HN Group Docs.</p></div>" +
                '<div class="ds-view-actions"><a class="btn btn-ghost btn-small" href="' + DOCS + "/storage/" + encodeURIComponent(viewing) + '" target="_blank" rel="noopener">Open in HN Group Docs ↗</a><button type="button" class="btn btn-ghost btn-small" data-close-view>Close</button></div></div>' +
                '<h3 class="detail-head">Documents</h3>' +
                (docs.length ? '<div class="table-card flat"><table class="table"><thead><tr><th>Title</th><th>Status</th><th>Last edited</th><th class="col-actions"></th></tr></thead><tbody>' +
                    docs.map(function (x) { return "<tr><td>" + esc(x.title) + (x.confidential ? ' <span class="badge badge-red">Confidential</span>' : "") + "</td><td>" + (x.status === "final" ? "Final" : "Draft") + "</td><td>" + esc(fmtDateTime(new Date(x.updatedAt).toISOString())) + '</td><td class="col-actions"><a class="btn btn-ghost btn-small" href="' + base + "/documents/" + x.id + '/pdf">Download PDF</a></td></tr>'; }).join("") + "</tbody></table></div>"
                    : '<p class="muted">No private documents.</p>') +
                '<h3 class="detail-head">Files</h3>' +
                (files.length ? '<div class="table-card flat"><table class="table"><thead><tr><th>Name</th><th>Size</th><th>Added</th><th class="col-actions"></th></tr></thead><tbody>' +
                    files.map(function (f) { return "<tr><td>" + esc(f.name) + "</td><td>" + esc(size(f.size)) + "</td><td>" + esc(fmtDateTime(new Date(f.createdAt).toISOString())) + '</td><td class="col-actions"><a class="btn btn-ghost btn-small" href="' + base + "/files/" + f.id + '" target="_blank" rel="noopener">Open</a> <a class="btn btn-ghost btn-small" href="' + base + "/files/" + f.id + '?download=1">Download</a></td></tr>'; }).join("") + "</tbody></table></div>"
                    : '<p class="muted">No files.</p>') + "</section>";
        }
        async function openView(id) {
            viewing = id; viewData = null; viewError = "";
            history.replaceState({}, "", "/document-storage?view=" + encodeURIComponent(id));
            draw(); if ($("#ds-viewer")) $("#ds-viewer").scrollIntoView({ behavior: "smooth", block: "start" });
            try { viewData = await api("/api/document-storage/people/" + encodeURIComponent(id)); } catch (err) { viewError = err.message; }
            if (current() && viewing === id) draw();
        }
        function draw() {
            const mine = '<section class="panel"><h2 class="panel-title">Storage you can open</h2>' +
                (d.myGrants.length ? '<div class="table-card flat"><table class="table"><thead><tr><th>Whose storage</th><th>Until</th><th class="col-actions"></th></tr></thead><tbody>' +
                    d.myGrants.map(function (g) { return "<tr><td>" + esc(g.name) + "</td><td>" + esc(day(g.until)) + '</td><td class="col-actions"><button type="button" class="btn btn-ghost btn-small" data-view="' + esc(g.personId) + '">View documents</button></td></tr>'; }).join("") + "</tbody></table></div>"
                    : '<p class="muted">' + (d.manage ? "You can open anyone’s storage from the list below." : "Nobody has given you access to anyone else’s storage. Your own storage is at " + '<a href="' + DOCS + '/storage" target="_blank" rel="noopener">docs.hngroup.org.uk</a>.') + "</p>") + "</section>";
            if (!d.manage) { root.innerHTML = head + viewer() + mine; return; }
            const options = function (sel) { return '<option value="">Choose…</option>' + d.people.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === sel ? " selected" : "") + ">" + esc(p.displayName) + (p.jobTitle ? " – " + esc(p.jobTitle) : "") + "</option>"; }).join(""); };
            root.innerHTML = head + viewer() + (d.myGrants.length ? mine : "") +
                '<section class="panel"><div class="panel-head"><h2 class="panel-title">Everyone’s storage</h2><label class="search">' + icon("search") + '<input type="search" id="ds-search" placeholder="Search staff"></label></div>' +
                '<p class="muted small">Opening someone’s storage shows their private documents and files, view only. Every visit is recorded.</p>' +
                '<div class="table-card flat"><table class="table"><thead><tr><th>Name</th><th>Job title</th><th>Company</th><th class="col-actions"></th></tr></thead><tbody id="ds-people"></tbody></table></div></section>' +
                '<section class="panel" id="ds-give"><h2 class="panel-title">Give someone access to one person’s storage</h2>' +
                '<p class="muted small">For temporary access, for example while someone covers for a colleague. It ends by itself on the date you choose, or remove it below.</p>' +
                '<form id="ds-form" class="grid-2">' +
                '<div><label for="ds-grantee">Who gets access</label><select id="ds-grantee" required>' + options("") + "</select></div>" +
                '<div><label for="ds-owner">Whose storage they can open</label><select id="ds-owner" required>' + options(state.dsOwner || "") + "</select></div>" +
                '<div><label for="ds-until">Until the end of</label><input type="date" id="ds-until" required min="' + inDays(0) + '" max="' + inDays(365) + '" value="' + inDays(7) + '"></div>' +
                '<div><label for="ds-reason">Reason <span class="muted small">(optional)</span></label><input type="text" id="ds-reason" maxlength="300" placeholder="e.g. Covering while they’re on leave"></div>' +
                '<div class="form-actions"><button type="submit" class="btn btn-primary">' + icon("lock") + "Give access</button></div></form>" +
                '<h3 class="detail-head">Access given</h3>' +
                (d.grants.length ? '<div class="table-card flat"><table class="table"><thead><tr><th>Who</th><th>Can open</th><th>Until</th><th>Given by</th><th class="col-actions"></th></tr></thead><tbody>' +
                    d.grants.map(function (g) {
                        return "<tr><td>" + esc(g.granteeName) + "</td><td>" + esc(g.ownerName) + "’s storage" + (g.reason ? '<div class="muted small">' + esc(g.reason) + "</div>" : "") + "</td><td>" + esc(day(g.until)) + (g.active ? "" : ' <span class="badge">Ended</span>') + "</td><td>" + esc(g.grantedByName) + '</td><td class="col-actions"><button type="button" class="btn btn-ghost btn-small" data-remove="' + esc(g.id) + '">Remove</button></td></tr>';
                    }).join("") + "</tbody></table></div>" : '<p class="muted">Nobody has been given individual access.</p>') + "</section>";
            drawPeople();
        }
        const head = '<div class="page-head"><div><h1>Document storage</h1><p class="muted">Everyone has private storage on <a href="' + DOCS + '" target="_blank" rel="noopener">HN Group Docs</a> that nobody else can open, except people with the “Access staff document storage” permission and anyone given access below.</p></div></div>';
        function drawPeople() {
            const q = ($("#ds-search") ? $("#ds-search").value : "").trim().toLowerCase();
            const list = d.people.filter(function (p) { return !q || [p.displayName, p.jobTitle, p.company].join(" ").toLowerCase().indexOf(q) !== -1; });
            $("#ds-people").innerHTML = list.map(function (p) {
                return "<tr><td>" + esc(p.displayName) + "</td><td>" + esc(p.jobTitle) + "</td><td>" + esc(p.company) + '</td><td class="col-actions"><button type="button" class="btn btn-ghost btn-small" data-view="' + esc(p.id) + '">View documents</button> <button type="button" class="btn btn-ghost btn-small" data-give="' + esc(p.id) + '">Give access…</button></td></tr>';
            }).join("") || '<tr><td colspan="4" class="muted">Nobody matches.</td></tr>';
        }
        async function reload() { d = await api("/api/document-storage"); if (current()) draw(); }
        root.addEventListener("input", function (ev) { if (ev.target.id === "ds-search") drawPeople(); });
        root.addEventListener("click", async function (ev) {
            const view = ev.target.closest("[data-view]");
            if (view) return openView(view.dataset.view);
            if (ev.target.closest("[data-close-view]")) { viewing = null; viewData = null; history.replaceState({}, "", "/document-storage"); return draw(); }
            const give = ev.target.closest("[data-give]");
            if (give) { $("#ds-owner").value = give.dataset.give; $("#ds-give").scrollIntoView({ behavior: "smooth", block: "start" }); $("#ds-grantee").focus(); return; }
            const rm = ev.target.closest("[data-remove]");
            if (rm && await confirmDialog({ title: "Remove this access?", message: "They won’t be able to open that storage any more (within a minute).", confirmLabel: "Remove", danger: true })) {
                try { await api("/api/document-storage/grants/" + rm.dataset.remove + "/delete", {}); toast("Access removed."); reload(); } catch (err) { toast(err.message); }
            }
        });
        root.addEventListener("submit", async function (ev) {
            if (ev.target.id !== "ds-form") return;
            ev.preventDefault();
            const until = $("#ds-until").value;
            try {
                await api("/api/document-storage/grants", { granteeId: $("#ds-grantee").value, ownerId: $("#ds-owner").value, until: until ? until + "T23:59:59" : "", reason: $("#ds-reason").value });
                toast("Access given.");
                reload();
            } catch (err) { toast(err.message); }
        });
        if (viewing) openView(viewing); else draw();
    }

    start();
})();
