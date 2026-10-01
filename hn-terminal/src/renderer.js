(() => {
    const $ = (id) => document.getElementById(id);

    let settings = { host: "", port: 22, username: "root", theme: "dark" };
    let currentView = "home";
    let tabCounter = 0;
    let activeTabId = null;
    const sshTabs = new Map();

    // ── Helpers ─────────────────────────────────────

    function targetLabel(s = settings) {
        return `${s.username}@${s.host}${Number(s.port) === 22 ? "" : ":" + s.port}`;
    }

    // ── Theme ───────────────────────────────────────

    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        document.querySelectorAll(".theme-swatch").forEach((s) => {
            s.classList.toggle("active", s.dataset.theme === theme);
        });
        for (const tab of sshTabs.values()) {
            updateTermTheme(tab);
        }
    }

    function getTermTheme() {
        const style = getComputedStyle(document.documentElement);
        const bg = style.getPropertyValue("--term-bg").trim() || "#0c0c0c";
        const fg = style.getPropertyValue("--term-fg").trim() || "#cccccc";
        const cursor = style.getPropertyValue("--term-cursor").trim() || "#ffffff";
        const selection = style.getPropertyValue("--term-selection").trim() || "#264f78";
        return {
            background: bg,
            foreground: fg,
            cursor: cursor,
            cursorAccent: bg,
            selectionBackground: selection,
            selectionForeground: "#ffffff",
            black: bg,
            red: "#c50f1f",
            green: "#13a10e",
            yellow: "#c19c00",
            blue: "#0037da",
            magenta: "#881798",
            cyan: "#3a96dd",
            white: fg,
            brightBlack: "#767676",
            brightRed: "#e74856",
            brightGreen: "#16c60c",
            brightYellow: "#f9f1a5",
            brightBlue: "#3b78ff",
            brightMagenta: "#b4009e",
            brightCyan: "#61d6d6",
            brightWhite: "#f2f2f2",
        };
    }

    function updateTermTheme(tab) {
        if (tab.term) {
            tab.term.options.theme = getTermTheme();
        }
    }

    $("theme-picker").addEventListener("click", (e) => {
        const swatch = e.target.closest("[data-theme]");
        if (!swatch) return;
        const theme = swatch.dataset.theme;
        settings.theme = theme;
        applyTheme(theme);
        hn.saveTheme(theme);
    });

    // ── Sidebar navigation ──────────────────────────

    function switchView(view) {
        currentView = view;
        document.querySelectorAll(".sidebar-item").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.view === view);
        });
        document.querySelectorAll(".view").forEach((v) => {
            v.hidden = v.id !== "view-" + view;
        });
        if (view === "ssh" && !sshTabs.size) {
            createSSHTab();
        }
        if (view === "ssh" && activeTabId) {
            const tab = sshTabs.get(activeTabId);
            if (tab && tab.term) {
                setTimeout(() => {
                    try { tab.fitAddon.fit(); } catch (_) {}
                    tab.term.focus();
                }, 50);
            }
        }
        if (view === "settings") {
            populateSettingsForm();
        }
        if (view === "files") {
            refreshFilesIfNeeded();
        }
    }

    document.querySelectorAll(".sidebar-item").forEach((btn) => {
        btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    document.querySelectorAll("[data-nav]").forEach((btn) => {
        btn.addEventListener("click", () => switchView(btn.dataset.nav));
    });

    $("files-connect-btn").addEventListener("click", () => switchView("ssh"));

    // ── SSH tabs ────────────────────────────────────

    function createSSHTab() {
        tabCounter++;
        const tabId = "tab-" + tabCounter;

        const tab = {
            id: tabId,
            state: "idle",
            term: null,
            fitAddon: null,
            pane: null,
            tabEl: null,
            target: null,
        };

        // Create tab element
        const tabEl = document.createElement("div");
        tabEl.className = "ssh-tab";
        tabEl.dataset.tabId = tabId;
        tabEl.innerHTML = `
            <span class="tab-dot"></span>
            <span class="tab-text">New session</span>
            <button class="tab-close" title="Close tab">&times;</button>
        `;
        tabEl.addEventListener("click", (e) => {
            if (!e.target.closest(".tab-close")) switchSSHTab(tabId);
        });
        tabEl.querySelector(".tab-close").addEventListener("click", (e) => {
            e.stopPropagation();
            closeSSHTab(tabId);
        });
        $("ssh-tabs").appendChild(tabEl);
        tab.tabEl = tabEl;

        // Create pane
        const pane = document.createElement("div");
        pane.className = "ssh-pane";
        pane.dataset.tabId = tabId;
        pane.innerHTML = `
            <div class="terminal-wrap" id="term-${tabId}"></div>
            <div class="overlay" id="overlay-${tabId}">
                <section class="card" id="screen-connecting-${tabId}" hidden>
                    <div class="spinner"></div>
                    <h2>Connecting…</h2>
                    <p class="target" data-target></p>
                    <div class="actions">
                        <button class="btn btn-ghost" data-action="cancel" data-tab="${tabId}">Cancel</button>
                    </div>
                </section>
                <section class="card" id="screen-password-${tabId}" hidden>
                    <div class="card-icon icon-accent">
                        <svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                    </div>
                    <h2>Enter password</h2>
                    <p class="target" data-target></p>
                    <form class="password-form" autocomplete="off">
                        <input type="password" class="input pw-input" placeholder="Password" spellcheck="false">
                        <p class="form-error pw-error" hidden></p>
                        <div class="actions">
                            <button type="button" class="btn btn-ghost" data-action="cancel" data-tab="${tabId}">Cancel</button>
                            <button type="submit" class="btn btn-primary">Log in</button>
                        </div>
                    </form>
                </section>
                <section class="card" id="screen-message-${tabId}" hidden>
                    <div class="card-icon" id="msg-icon-${tabId}">
                        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>
                    </div>
                    <h2 id="msg-title-${tabId}"></h2>
                    <p class="message" id="msg-text-${tabId}"></p>
                    <p class="target" data-target></p>
                    <div class="actions">
                        <button class="btn btn-ghost" data-action="settings" data-tab="${tabId}">Settings</button>
                        <button class="btn btn-primary" id="msg-primary-${tabId}" data-action="connect" data-tab="${tabId}">Connect</button>
                    </div>
                </section>
                <section class="card" id="screen-idle-${tabId}">
                    <div class="card-icon icon-accent">
                        <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 8l4 4-4 4M13 16h4"/></svg>
                    </div>
                    <h2>Ready to connect</h2>
                    <p class="target" data-target></p>
                    <div class="actions">
                        <button class="btn btn-ghost" data-action="settings" data-tab="${tabId}">Settings</button>
                        <button class="btn btn-primary" data-action="connect" data-tab="${tabId}">Connect</button>
                    </div>
                </section>
            </div>
        `;
        $("ssh-content").appendChild(pane);
        tab.pane = pane;

        // Create terminal
        const term = new Terminal({
            theme: getTermTheme(),
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
        term.open(pane.querySelector(".terminal-wrap"));
        tab.term = term;
        tab.fitAddon = fitAddon;

        new ResizeObserver(() => {
            try { fitAddon.fit(); } catch (_) {}
            if (tab.state === "connected") hn.resize(tabId, term.cols, term.rows);
        }).observe(pane.querySelector(".terminal-wrap"));

        term.onData((data) => {
            if (tab.state === "connected") hn.sendInput(tabId, data);
        });

        term.attachCustomKeyEventHandler((e) => {
            if (e.type !== "keydown" || !e.ctrlKey) return true;
            const key = e.key.toLowerCase();
            if (key === "c" && (e.shiftKey || term.hasSelection())) {
                if (term.hasSelection()) {
                    hn.writeClipboard(term.getSelection());
                    term.clearSelection();
                }
                e.preventDefault();
                return false;
            }
            if (key === "v") {
                e.preventDefault();
                hn.readClipboard().then((text) => {
                    if (text && tab.state === "connected") term.paste(text);
                });
                return false;
            }
            return true;
        });

        pane.querySelector(".terminal-wrap").addEventListener("contextmenu", (e) => {
            e.preventDefault();
            if (term.hasSelection()) {
                hn.writeClipboard(term.getSelection());
                term.clearSelection();
            } else {
                hn.readClipboard().then((text) => {
                    if (text && tab.state === "connected") term.paste(text);
                });
            }
        });

        // Password form
        const pwForm = pane.querySelector(".password-form");
        pwForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const input = pane.querySelector(".pw-input");
            const password = input.value;
            if (!password) { input.focus(); return; }
            hn.sendPassword(tabId, password);
            input.value = "";
            showTabScreen(tabId, "connecting");
            setTabDot(tabId, "busy");
            setTabText(tabId, "Logging in…");
        });

        // Action buttons
        pane.querySelectorAll("[data-action]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const action = btn.dataset.action;
                const tid = btn.dataset.tab;
                if (action === "cancel") hn.cancel(tid);
                else if (action === "connect") connectTab(tid);
                else if (action === "settings") switchView("settings");
            });
        });

        sshTabs.set(tabId, tab);
        switchSSHTab(tabId);
        refreshTargets();
        return tabId;
    }

    function switchSSHTab(tabId) {
        activeTabId = tabId;
        for (const [id, tab] of sshTabs) {
            tab.tabEl.classList.toggle("active", id === tabId);
            tab.pane.hidden = id !== tabId;
        }
        const tab = sshTabs.get(tabId);
        if (tab && tab.term && currentView === "ssh") {
            setTimeout(() => {
                try { tab.fitAddon.fit(); } catch (_) {}
                if (tab.state === "connected") tab.term.focus();
            }, 50);
        }
    }

    function closeSSHTab(tabId) {
        const tab = sshTabs.get(tabId);
        if (!tab) return;
        if (tab.state === "connected" || tab.state === "connecting" || tab.state === "password") {
            hn.disconnect(tabId);
        }
        tab.term.dispose();
        tab.tabEl.remove();
        tab.pane.remove();
        sshTabs.delete(tabId);

        if (activeTabId === tabId) {
            const remaining = [...sshTabs.keys()];
            if (remaining.length) {
                switchSSHTab(remaining[remaining.length - 1]);
            } else {
                activeTabId = null;
            }
        }
        updateHomeStatus();
    }

    function connectTab(tabId) {
        const tab = sshTabs.get(tabId);
        if (!tab) return;
        tab.term.reset();
        try { tab.fitAddon.fit(); } catch (_) {}
        hn.connect(tabId, tab.term.cols, tab.term.rows);
    }

    function setTabDot(tabId, cls) {
        const tab = sshTabs.get(tabId);
        if (tab) tab.tabEl.querySelector(".tab-dot").className = "tab-dot " + cls;
    }

    function setTabText(tabId, text) {
        const tab = sshTabs.get(tabId);
        if (tab) tab.tabEl.querySelector(".tab-text").textContent = text;
    }

    function showTabScreen(tabId, screen) {
        const pane = sshTabs.get(tabId)?.pane;
        if (!pane) return;
        const overlay = pane.querySelector(".overlay");
        overlay.hidden = screen === null;
        for (const s of ["connecting", "password", "message", "idle"]) {
            const el = pane.querySelector(`#screen-${s}-${tabId}`);
            if (el) el.hidden = s !== screen;
        }
    }

    function refreshTargets(target) {
        const label = targetLabel(target || settings);
        document.querySelectorAll("[data-target]").forEach((el) => (el.textContent = label));
        $("home-target").textContent = label;
    }

    $("ssh-tab-add").addEventListener("click", () => createSSHTab());

    // ── SSH status handler ──────────────────────────

    hn.onStatus((status) => {
        const tabId = status.tabId;
        const tab = sshTabs.get(tabId);
        if (!tab) return;

        tab.state = status.state;
        if (status.target) tab.target = status.target;
        const label = targetLabel(status.target || settings);

        switch (status.state) {
            case "connecting":
                setTabDot(tabId, "busy");
                setTabText(tabId, "Connecting…");
                showTabScreen(tabId, "connecting");
                break;

            case "password": {
                setTabDot(tabId, "busy");
                setTabText(tabId, label);
                const input = tab.pane.querySelector(".pw-input");
                input.value = "";
                const errEl = tab.pane.querySelector(".pw-error");
                errEl.textContent = status.error || "";
                errEl.hidden = !status.error;
                showTabScreen(tabId, "password");
                input.focus();
                break;
            }

            case "connected":
                setTabDot(tabId, "online");
                setTabText(tabId, label);
                showTabScreen(tabId, null);
                try { tab.fitAddon.fit(); } catch (_) {}
                tab.term.focus();
                break;

            case "closed":
                setTabDot(tabId, "offline");
                setTabText(tabId, "Disconnected"); {
                    const icon = tab.pane.querySelector(`#msg-icon-${tabId}`);
                    icon.className = "card-icon icon-neutral";
                    $(`msg-title-${tabId}`).textContent = "Session ended";
                    $(`msg-text-${tabId}`).textContent = "You have been disconnected from the server.";
                    $(`msg-text-${tabId}`).hidden = false;
                    $(`msg-primary-${tabId}`).textContent = "Reconnect";
                    showTabScreen(tabId, "message");
                }
                break;

            case "error":
                setTabDot(tabId, "offline");
                setTabText(tabId, "Not connected"); {
                    const icon = tab.pane.querySelector(`#msg-icon-${tabId}`);
                    icon.className = "card-icon icon-danger";
                    $(`msg-title-${tabId}`).textContent = status.title;
                    $(`msg-text-${tabId}`).textContent = status.message || "";
                    $(`msg-text-${tabId}`).hidden = !status.message;
                    $(`msg-primary-${tabId}`).textContent = "Try again";
                    showTabScreen(tabId, "message");
                }
                break;

            default:
                setTabDot(tabId, "");
                setTabText(tabId, "New session");
                showTabScreen(tabId, "idle");
        }

        refreshTargets(status.target);
        updateHomeStatus();
    });

    hn.onData(({ tabId, data }) => {
        const tab = sshTabs.get(tabId);
        if (tab && tab.term) tab.term.write(data);
    });

    function updateHomeStatus() {
        let anyConnected = false;
        let connectedTarget = null;
        for (const tab of sshTabs.values()) {
            if (tab.state === "connected") {
                anyConnected = true;
                connectedTarget = tab.target;
                break;
            }
        }
        const dot = $("home-status-dot");
        const text = $("home-status-text");
        if (anyConnected) {
            dot.className = "status-dot online";
            text.textContent = "Connected";
        } else {
            dot.className = "status-dot";
            text.textContent = "Not connected";
        }
    }

    // ── Settings page ───────────────────────────────

    function populateSettingsForm() {
        $("set-host").value = settings.host;
        $("set-port").value = settings.port;
        $("set-username").value = settings.username;
        $("settings-error").hidden = true;
        $("forget-host-key").textContent = "Forget";
        $("forget-host-key").disabled = false;
    }

    $("settings-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const result = await hn.saveSettings({
            host: $("set-host").value,
            port: $("set-port").value,
            username: $("set-username").value,
            theme: settings.theme,
        });
        if (!result.ok) {
            $("settings-error").textContent = result.error;
            $("settings-error").hidden = false;
            return;
        }
        settings = result.settings;
        $("settings-error").hidden = true;
        refreshTargets(settings);

        // Brief flash to confirm save
        const btn = $("settings-save");
        btn.textContent = "Saved!";
        btn.classList.remove("btn-primary");
        btn.classList.add("btn-success");
        setTimeout(() => {
            btn.textContent = "Save";
            btn.classList.remove("btn-success");
            btn.classList.add("btn-primary");
        }, 1200);
    });

    $("forget-host-key").addEventListener("click", async () => {
        await hn.forgetHostKey();
        $("forget-host-key").textContent = "Forgotten";
        $("forget-host-key").disabled = true;
    });

    // ── File browser ────────────────────────────────

    let filesTabId = null;
    let filesCurrentPath = "/";

    function getConnectedTabId() {
        for (const [id, tab] of sshTabs) {
            if (tab.state === "connected") return id;
        }
        return null;
    }

    function refreshFilesIfNeeded() {
        const connId = getConnectedTabId();
        if (!connId) {
            $("files-empty").hidden = false;
            $("files-list").querySelectorAll(".file-row").forEach((r) => r.remove());
            $("files-preview").hidden = true;
            return;
        }
        if (filesTabId !== connId) {
            filesTabId = connId;
            filesCurrentPath = "/";
        }
        loadDirectory(filesCurrentPath);
    }

    async function loadDirectory(dirPath) {
        const connId = getConnectedTabId();
        if (!connId) return;
        filesTabId = connId;
        filesCurrentPath = dirPath;
        $("files-breadcrumb").textContent = dirPath;
        $("files-empty").hidden = true;
        $("files-preview").hidden = true;

        // Remove old rows
        $("files-list").querySelectorAll(".file-row").forEach((r) => r.remove());

        try {
            const items = await hn.sftpList(connId, dirPath);

            // Parent dir link
            if (dirPath !== "/") {
                const parentRow = createFileRow({ name: "..", isDir: true, size: 0 }, dirPath);
                $("files-list").appendChild(parentRow);
            }

            for (const item of items) {
                const row = createFileRow(item, dirPath);
                $("files-list").appendChild(row);
            }
        } catch (err) {
            $("files-empty").hidden = false;
            $("files-empty").querySelector("p").textContent = err.message || "Failed to list directory.";
        }
    }

    function createFileRow(item, parentPath) {
        const row = document.createElement("div");
        row.className = "file-row " + (item.isDir ? "dir" : "file");

        const iconSvg = item.isDir
            ? '<svg class="file-icon" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
            : '<svg class="file-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

        const sizeStr = item.isDir ? "" : formatSize(item.size);

        row.innerHTML = `${iconSvg}<span class="file-name">${escapeHtml(item.name)}</span><span class="file-size">${sizeStr}</span>`;

        row.addEventListener("click", () => {
            if (item.isDir) {
                let newPath;
                if (item.name === "..") {
                    newPath = parentPath.replace(/\/[^/]+\/?$/, "") || "/";
                } else {
                    newPath = parentPath === "/" ? "/" + item.name : parentPath + "/" + item.name;
                }
                loadDirectory(newPath);
            } else {
                previewFile(item.name, parentPath === "/" ? "/" + item.name : parentPath + "/" + item.name);
                $("files-list").querySelectorAll(".file-row").forEach((r) => r.classList.remove("selected"));
                row.classList.add("selected");
            }
        });

        return row;
    }

    async function previewFile(name, filePath) {
        const connId = getConnectedTabId();
        if (!connId) return;
        $("preview-name").textContent = name;
        $("preview-content").textContent = "Loading…";
        $("files-preview").hidden = false;

        try {
            const content = await hn.sftpRead(connId, filePath);
            $("preview-content").textContent = content;
        } catch (err) {
            $("preview-content").textContent = err.message || "Cannot preview this file.";
        }
    }

    $("preview-close").addEventListener("click", () => {
        $("files-preview").hidden = true;
        $("files-list").querySelectorAll(".file-row").forEach((r) => r.classList.remove("selected"));
    });

    $("files-refresh").addEventListener("click", () => loadDirectory(filesCurrentPath));

    function formatSize(bytes) {
        if (bytes === 0) return "0 B";
        const units = ["B", "KB", "MB", "GB"];
        const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + " " + units[i];
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Window controls ─────────────────────────────

    $("btn-minimize").addEventListener("click", () => hn.minimize());
    $("btn-maximize").addEventListener("click", () => hn.maximize());
    $("btn-close").addEventListener("click", () => hn.close());

    hn.onWindowState(({ maximized }) => {
        $("icon-maximize").hidden = maximized;
        $("icon-restore").hidden = !maximized;
    });

    // ── Startup ─────────────────────────────────────

    hn.getState().then((initial) => {
        settings = initial.settings;
        $("title-version").textContent = "v" + initial.version;
        $("settings-version").textContent = "v" + initial.version;
        refreshTargets(settings);
        applyTheme(settings.theme || "dark");
        // Start on home page, don't auto-connect
    });
})();
