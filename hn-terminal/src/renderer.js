(() => {
    const $ = (id) => document.getElementById(id);

    const term = new Terminal({
        theme: {
            background: "#0c0c0c",
            foreground: "#cccccc",
            cursor: "#ffffff",
            cursorAccent: "#0c0c0c",
            selectionBackground: "#264f78",
            selectionForeground: "#ffffff",
            black: "#0c0c0c",
            red: "#c50f1f",
            green: "#13a10e",
            yellow: "#c19c00",
            blue: "#0037da",
            magenta: "#881798",
            cyan: "#3a96dd",
            white: "#cccccc",
            brightBlack: "#767676",
            brightRed: "#e74856",
            brightGreen: "#16c60c",
            brightYellow: "#f9f1a5",
            brightBlue: "#3b78ff",
            brightMagenta: "#b4009e",
            brightCyan: "#61d6d6",
            brightWhite: "#f2f2f2",
        },
        fontFamily: "'Cascadia Mono', 'Cascadia Code', Consolas, 'DejaVu Sans Mono', monospace",
        fontSize: 14,
        lineHeight: 1.15,
        cursorBlink: true,
        cursorStyle: "bar",
        scrollback: 10000,
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon.WebLinksAddon((_event, uri) => hn.openExternal(uri)));
    term.open($("terminal"));

    let state = "idle";
    let settings = { host: "", port: 22, username: "root" };
    let connectOnSave = false;

    // ── Helpers ─────────────────────────────────────

    function targetLabel(s = settings) {
        return `${s.username}@${s.host}${Number(s.port) === 22 ? "" : ":" + s.port}`;
    }

    function fitTerminal() {
        try {
            fitAddon.fit();
        } catch (_) {}
        if (state === "connected") hn.resize(term.cols, term.rows);
    }

    function setTab(dot, label) {
        $("tab-dot").className = "status-dot " + dot;
        $("tab-label").textContent = label;
    }

    function showScreen(id) {
        $("overlay").hidden = id === null;
        for (const screen of ["screen-connecting", "screen-password", "screen-message"]) {
            $(screen).hidden = screen !== id;
        }
    }

    function refreshTargets(target) {
        const label = targetLabel(target);
        document.querySelectorAll("[data-target]").forEach((el) => (el.textContent = label));
    }

    function showMessage({ tone, title, message, primary }) {
        const icon = $("message-icon");
        icon.className = "card-icon " + (tone === "error" ? "icon-danger" : "icon-neutral");
        $("message-title").textContent = title;
        $("message-text").textContent = message || "";
        $("message-text").hidden = !message;
        $("message-primary").textContent = primary;
        showScreen("screen-message");
        $("message-primary").focus();
    }

    function connect() {
        term.reset();
        fitTerminal();
        hn.connect(term.cols, term.rows);
    }

    // ── Terminal I/O ────────────────────────────────

    new ResizeObserver(fitTerminal).observe($("terminal"));

    term.onData((data) => {
        if (state === "connected") hn.sendInput(data);
    });

    hn.onData((data) => term.write(data));

    async function paste() {
        const text = await hn.readClipboard();
        if (text && state === "connected") term.paste(text);
    }

    function copySelection() {
        if (!term.hasSelection()) return false;
        hn.writeClipboard(term.getSelection());
        term.clearSelection();
        return true;
    }

    term.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown" || !e.ctrlKey) return true;
        const key = e.key.toLowerCase();
        if (key === "c" && (e.shiftKey || term.hasSelection())) {
            copySelection();
            e.preventDefault();
            return false;
        }
        if (key === "v") {
            e.preventDefault();
            paste();
            return false;
        }
        return true;
    });

    $("terminal").addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (!copySelection()) paste();
    });

    // ── Connection status ───────────────────────────

    hn.onStatus((status) => {
        state = status.state;
        if (status.target) refreshTargets(status.target);
        const label = targetLabel(status.target || settings);

        switch (status.state) {
            case "connecting":
                setTab("busy", "Connecting…");
                showScreen("screen-connecting");
                break;

            case "password":
                setTab("busy", label);
                $("password-input").value = "";
                $("password-error").textContent = status.error || "";
                $("password-error").hidden = !status.error;
                showScreen("screen-password");
                $("password-input").focus();
                break;

            case "connected":
                setTab("online", label);
                showScreen(null);
                fitTerminal();
                term.focus();
                break;

            case "closed":
                setTab("offline", "Disconnected");
                showMessage({
                    tone: "neutral",
                    title: "Session ended",
                    message: "You have been disconnected from the server.",
                    primary: "Reconnect",
                });
                break;

            case "error":
                setTab("offline", "Not connected");
                showMessage({ tone: "error", title: status.title, message: status.message, primary: "Try again" });
                break;

            default:
                setTab("offline", "Not connected");
                showMessage({ tone: "neutral", title: "Not connected", message: "", primary: "Connect" });
        }
    });

    $("password-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const password = $("password-input").value;
        if (!password) {
            $("password-input").focus();
            return;
        }
        hn.sendPassword(password);
        $("password-input").value = "";
        setTab("busy", "Logging in…");
        showScreen("screen-connecting");
    });

    document.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const action = btn.dataset.action;
            if (action === "cancel") hn.cancel();
            else if (action === "connect") connect();
            else if (action === "settings") openSettings();
        });
    });

    window.addEventListener("focus", () => {
        if (state === "password") $("password-input").focus();
        else if (state === "connected" && $("settings-modal").hidden) term.focus();
    });

    // ── Settings ────────────────────────────────────

    function setSettingsError(message) {
        $("settings-error").textContent = message || "";
        $("settings-error").hidden = !message;
    }

    function openSettings() {
        $("set-host").value = settings.host;
        $("set-port").value = settings.port;
        $("set-username").value = settings.username;
        setSettingsError(null);

        const connected = state === "connected";
        const busy = state === "connecting" || state === "password";
        connectOnSave = !connected && !busy;
        $("settings-save").textContent = connectOnSave ? "Save & connect" : "Save";
        $("settings-hint").textContent = connected ? "Changes apply the next time you connect." : "";
        $("forget-host-key").textContent = "Forget";
        $("forget-host-key").disabled = false;

        $("settings-modal").hidden = false;
        $("set-host").focus();
        $("set-host").select();
    }

    function closeSettings() {
        $("settings-modal").hidden = true;
        if (state === "connected") term.focus();
        else if (state === "password") $("password-input").focus();
    }

    $("settings-open").addEventListener("click", openSettings);
    $("settings-close").addEventListener("click", closeSettings);
    $("settings-cancel").addEventListener("click", closeSettings);

    $("settings-modal").addEventListener("mousedown", (e) => {
        if (e.target === $("settings-modal")) closeSettings();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !$("settings-modal").hidden) closeSettings();
    });

    $("settings-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const result = await hn.saveSettings({
            host: $("set-host").value,
            port: $("set-port").value,
            username: $("set-username").value,
        });
        if (!result.ok) {
            setSettingsError(result.error);
            return;
        }
        settings = result.settings;
        closeSettings();
        if (state !== "connected") refreshTargets(settings);
        if (connectOnSave) connect();
    });

    $("forget-host-key").addEventListener("click", async () => {
        await hn.forgetHostKey();
        $("forget-host-key").textContent = "Forgotten";
        $("forget-host-key").disabled = true;
    });

    $("check-updates").addEventListener("click", () => hn.checkUpdates());

    // ── Updates ─────────────────────────────────────

    hn.onUpdateAvailable((version) => {
        $("update-text").textContent = `Version ${version} is available.`;
        $("update-bar").hidden = false;
    });

    $("update-download").addEventListener("click", () => hn.checkUpdates());
    $("update-dismiss").addEventListener("click", () => ($("update-bar").hidden = true));

    // ── Window controls ─────────────────────────────

    $("btn-minimize").addEventListener("click", () => hn.minimize());
    $("btn-maximize").addEventListener("click", () => hn.maximize());
    $("btn-close").addEventListener("click", () => hn.close());

    hn.onWindowState(({ maximized }) => {
        $("icon-maximize").hidden = maximized;
        $("icon-restore").hidden = !maximized;
    });

    // ── Startup: one connection attempt, no automatic retries ──

    hn.getState().then((initial) => {
        settings = initial.settings;
        $("title-version").textContent = "v" + initial.version;
        $("settings-version").textContent = "v" + initial.version;
        refreshTargets(settings);
        connect();
    });
})();
