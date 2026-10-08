// Applies the saved theme before the page draws, so there's no flash of the wrong colours.
(function () {
    var pref;
    try { pref = localStorage.getItem("hn-theme"); } catch (e) { /* private mode */ }
    var dark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

    window.hnApplyTheme = function (theme) {
        theme = theme || "light";
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
