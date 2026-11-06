// Applies the saved theme before the page draws, so there's no flash of the wrong colours.
(function () {
    // The theme every HN Group website shares (the hn_theme cookie: light or dusk); Light when there isn't one.
    var shared = /(?:^|;\s*)hn_theme=(light|dusk)(?:;|$)/.exec(document.cookie || "");
    var pref = shared ? (shared[1] === "dusk" ? "lavender-dusk" : "light") : "light";
    var dark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

    window.hnApplyTheme = function (theme) {
        theme = theme === "lavender-dusk" ? "lavender-dusk" : "light";
        var resolved = theme === "system" ? (dark && dark.matches ? "dark" : "light") : theme;
        document.documentElement.setAttribute("data-theme", resolved);
        document.documentElement.setAttribute("data-theme-pref", theme);
        try { localStorage.setItem("hn-theme", theme); } catch (e) { /* ignore */ }
    };

    window.hnApplyTheme(pref || "light");
    if (dark && dark.addEventListener) {
        dark.addEventListener("change", function () {
            if (document.documentElement.getAttribute("data-theme-pref") === "system") window.hnApplyTheme("system");
        });
    }
})();
