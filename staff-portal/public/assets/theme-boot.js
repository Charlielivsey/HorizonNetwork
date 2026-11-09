// Applies the saved theme before the page draws, so there's no flash of the wrong colours.
(function () {
    // Shared account theme; default to Midnight Lavender before the page draws.
    var shared = /(?:^|;\s*)hn_theme=(light|dusk|midnight)(?:;|$)/.exec(document.cookie || "");
    var pref = shared ? (shared[1] === "dusk" ? "lavender-dusk" : shared[1]) : "midnight";
    var dark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

    window.hnApplyTheme = function (theme) {
        theme = ["light", "lavender-dusk", "midnight"].includes(theme) ? theme : "midnight";
        var resolved = theme === "system" ? (dark && dark.matches ? "dark" : "light") : theme;
        document.documentElement.setAttribute("data-theme", resolved);
        document.documentElement.setAttribute("data-theme-pref", theme);
        try { localStorage.setItem("hn-theme", theme); } catch (e) { /* ignore */ }
    };

    window.hnApplyTheme(pref || "midnight");
    if (dark && dark.addEventListener) {
        dark.addEventListener("change", function () {
            if (document.documentElement.getAttribute("data-theme-pref") === "system") window.hnApplyTheme("system");
        });
    }
})();
