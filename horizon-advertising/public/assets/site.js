// Horizon Advertising: menu, scroll effects and the news sent to Horizon Advertising from HN Group News.
(function () {
    "use strict";
    document.documentElement.classList.add("js");
    const $ = function (sel, root) { return (root || document).querySelector(sel); };
    const esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

    const header = $(".site-header");
    const onScroll = function () { header.classList.toggle("scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const toggle = $(".menu-toggle"), nav = $("#site-nav");
    toggle.addEventListener("click", function () {
        const open = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", String(open));
        nav.classList.toggle("open", open);
    });
    nav.addEventListener("click", function (e) {
        if (e.target.closest("a")) { toggle.setAttribute("aria-expanded", "false"); nav.classList.remove("open"); }
    });

    const reveals = document.querySelectorAll(".reveal");
    if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
        }, { rootMargin: "0px 0px -8% 0px" });
        reveals.forEach(function (el) { io.observe(el); });
    } else {
        reveals.forEach(function (el) { el.classList.add("in"); });
    }
    const year = $("#year");
    if (year) year.textContent = new Date().getFullYear();

    // News written on HN Group News with Horizon Advertising ticked (read through this site's /api/news).
    const section = $("#news"), list = $("#news-list");
    if (!section || !list) return;
    const day = function (iso) { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); };
    fetch("/api/news").then(function (r) { return r.ok ? r.json() : { posts: [] }; }).then(function (d) {
        const posts = (d.posts || []).slice(0, 6);
        if (!posts.length) return;
        list.innerHTML = posts.map(function (p) {
            return '<article class="news-item card"><p class="news-meta small muted"><span class="news-topic">' + esc(p.category) + "</span> · " + esc(day(p.publishedAt || p.updatedAt)) + "</p>" +
                "<h3>" + esc(p.title) + '</h3><p class="lead">' + esc(p.summary) + "</p>" +
                (p.body ? '<details><summary>Read more</summary><p class="news-body">' + esc(p.body) + "</p></details>" : "") + "</article>";
        }).join("");
        section.hidden = false;
    }).catch(function () {});
})();
