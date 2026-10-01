(() => {
    const $ = (id) => document.getElementById(id);

    let settings = { host: "", port: 22, username: "root", theme: "dark" };
    let currentUser = null;
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
        if (currentUser) hn.saveUserTheme(currentUser.username, theme);
        hn.syncTheme(theme).catch(() => {});
    });

    // ── Login ──────────────────────────────────────

    $("login-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = $("login-username").value.trim();
        const password = $("login-password").value;
        if (!username || !password) return;

        const result = await hn.login(username, password);
        if (!result.ok) {
            $("login-error").textContent = result.error;
            $("login-error").hidden = false;
            return;
        }

        currentUser = result.user;
        $("login-overlay").hidden = true;
        $("login-error").hidden = true;
        $("sidebar-logout").hidden = false;
        if (currentUser.isAdmin) $("admin-section").hidden = false;
        if (currentUser.theme) {
            settings.theme = currentUser.theme;
            applyTheme(currentUser.theme);
        }
        switchView("home");
    });

    $("sidebar-logout").addEventListener("click", () => {
        currentUser = null;
        $("login-overlay").hidden = false;
        $("sidebar-logout").hidden = true;
        $("admin-section").hidden = true;
        $("login-username").value = "";
        $("login-password").value = "";
        $("login-error").hidden = true;
        switchView("home");
        setTimeout(() => $("login-username").focus(), 100);
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
        if (view === "admin") {
            loadUserList();
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
                hn.syncTheme(settings.theme).catch(() => {});
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

    // ── Admin page ─────────────────────────────────

    $("admin-settings-btn").addEventListener("click", () => switchView("admin"));
    $("admin-back").addEventListener("click", () => switchView("settings"));

    $("admin-add-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = $("admin-new-username").value.trim();
        const password = $("admin-new-password").value;
        const isAdmin = $("admin-new-isadmin").checked;

        if (!username || !password) {
            $("admin-add-error").textContent = "Username and password are required.";
            $("admin-add-error").hidden = false;
            return;
        }

        const result = await hn.addUser(username, password, isAdmin);
        if (!result.ok) {
            $("admin-add-error").textContent = result.error;
            $("admin-add-error").hidden = false;
            return;
        }

        $("admin-add-error").hidden = true;
        $("admin-new-username").value = "";
        $("admin-new-password").value = "";
        $("admin-new-isadmin").checked = false;
        loadUserList();
    });

    async function loadUserList() {
        const users = await hn.getUsers();
        const list = $("admin-user-list");
        list.innerHTML = "";

        for (const user of users) {
            const row = document.createElement("div");
            row.className = "admin-user-row";
            row.innerHTML = `
                <div class="admin-user-info">
                    <span class="admin-user-name">${escapeHtml(user.username)}</span>
                    ${user.isAdmin ? '<span class="admin-user-badge">Admin</span>' : ""}
                </div>
                <div class="admin-user-actions">
                    <button class="btn btn-small btn-ghost admin-toggle-btn">${user.isAdmin ? "Remove Admin" : "Make Admin"}</button>
                    <button class="btn btn-small btn-ghost admin-delete-btn">Delete</button>
                </div>
            `;

            row.querySelector(".admin-toggle-btn").addEventListener("click", async () => {
                await hn.toggleAdmin(user.username);
                loadUserList();
            });

            row.querySelector(".admin-delete-btn").addEventListener("click", async () => {
                if (!confirm(`Delete user "${user.username}"?`)) return;
                const result = await hn.deleteUser(user.username);
                if (result.ok) loadUserList();
            });

            list.appendChild(row);
        }
    }

    // ── Theme sync ─────────────────────────────────

    $("sync-theme-btn").addEventListener("click", async () => {
        const btn = $("sync-theme-btn");
        const status = $("sync-theme-status");
        btn.textContent = "Syncing…";
        btn.disabled = true;
        status.hidden = true;

        try {
            await hn.syncTheme(settings.theme);
            btn.textContent = "Synced!";
            status.textContent = "Theme colours pushed to VPS.";
            status.className = "sync-status success";
            status.hidden = false;
        } catch (err) {
            status.textContent = err.message || "Sync failed. Are you connected?";
            status.className = "sync-status error";
            status.hidden = false;
        }

        setTimeout(() => { btn.textContent = "Sync"; btn.disabled = false; }, 1500);
    });

    // ── File browser ────────────────────────────────

    let filesTabId = null;
    let filesCurrentPath = "/";
    let filesItems = [];
    let filesHistory = [];
    let filesHistoryIdx = -1;
    let filesSortKey = "name";
    let filesSortAsc = true;
    let filesFilter = "";
    let filesPreviewPath = null;
    let contextTarget = null;

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
            $("files-col-header").hidden = true;
            $("files-list").querySelectorAll(".file-row").forEach((r) => r.remove());
            $("files-preview").hidden = true;
            $("files-statusbar").hidden = true;
            return;
        }
        if (filesTabId !== connId) {
            filesTabId = connId;
            filesCurrentPath = "/";
            filesHistory = ["/"];
            filesHistoryIdx = 0;
        }
        loadDirectory(filesCurrentPath, true);
    }

    function navigateTo(dirPath) {
        if (dirPath === filesCurrentPath) { loadDirectory(dirPath, true); return; }
        filesHistory = filesHistory.slice(0, filesHistoryIdx + 1);
        filesHistory.push(dirPath);
        filesHistoryIdx = filesHistory.length - 1;
        loadDirectory(dirPath);
    }

    function updateNavButtons() {
        $("files-back").disabled = filesHistoryIdx <= 0;
        $("files-forward").disabled = filesHistoryIdx >= filesHistory.length - 1;
        $("files-up").disabled = filesCurrentPath === "/";
    }

    $("files-back").addEventListener("click", () => {
        if (filesHistoryIdx > 0) { filesHistoryIdx--; loadDirectory(filesHistory[filesHistoryIdx]); }
    });
    $("files-forward").addEventListener("click", () => {
        if (filesHistoryIdx < filesHistory.length - 1) { filesHistoryIdx++; loadDirectory(filesHistory[filesHistoryIdx]); }
    });
    $("files-up").addEventListener("click", () => {
        if (filesCurrentPath !== "/") {
            navigateTo(filesCurrentPath.replace(/\/[^/]+\/?$/, "") || "/");
        }
    });

    function buildBreadcrumb(dirPath) {
        const bc = $("files-breadcrumb");
        bc.innerHTML = "";
        const parts = dirPath.split("/").filter(Boolean);
        const rootSeg = document.createElement("span");
        rootSeg.className = "bread-seg";
        rootSeg.textContent = "/";
        rootSeg.addEventListener("click", () => navigateTo("/"));
        bc.appendChild(rootSeg);

        let built = "";
        for (let i = 0; i < parts.length; i++) {
            built += "/" + parts[i];
            const sep = document.createElement("span");
            sep.className = "bread-sep";
            sep.textContent = "/";
            bc.appendChild(sep);

            const seg = document.createElement("span");
            seg.className = "bread-seg";
            seg.textContent = parts[i];
            const target = built;
            seg.addEventListener("click", () => navigateTo(target));
            bc.appendChild(seg);
        }
    }

    async function loadDirectory(dirPath, skipHistory) {
        const connId = getConnectedTabId();
        if (!connId) return;
        filesTabId = connId;
        filesCurrentPath = dirPath;
        buildBreadcrumb(dirPath);
        $("files-empty").hidden = true;
        $("files-col-header").hidden = false;
        $("files-statusbar").hidden = false;
        $("files-preview").hidden = true;
        filesPreviewPath = null;
        $("files-status-text").textContent = "Loading…";

        $("files-list").querySelectorAll(".file-row").forEach((r) => r.remove());
        updateNavButtons();

        try {
            filesItems = await hn.sftpList(connId, dirPath);
            renderFileList();
        } catch (err) {
            filesItems = [];
            $("files-empty").hidden = false;
            $("files-col-header").hidden = true;
            $("files-empty").querySelector("p").textContent = err.message || "Failed to list directory.";
            $("files-status-text").textContent = "";
        }
    }

    function sortItems(items) {
        const sorted = [...items];
        sorted.sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            let cmp = 0;
            if (filesSortKey === "name") cmp = a.name.localeCompare(b.name);
            else if (filesSortKey === "size") cmp = (a.size || 0) - (b.size || 0);
            else if (filesSortKey === "date") cmp = (a.modified || 0) - (b.modified || 0);
            else if (filesSortKey === "perms") cmp = (a.mode || 0) - (b.mode || 0);
            return filesSortAsc ? cmp : -cmp;
        });
        return sorted;
    }

    function filterItems(items) {
        if (!filesFilter) return items;
        const q = filesFilter.toLowerCase();
        return items.filter((i) => i.name.toLowerCase().includes(q));
    }

    function renderFileList() {
        $("files-list").querySelectorAll(".file-row").forEach((r) => r.remove());
        const filtered = filterItems(sortItems(filesItems));

        for (const item of filtered) {
            const row = createFileRow(item, filesCurrentPath);
            $("files-list").appendChild(row);
        }

        const dirs = filesItems.filter((i) => i.isDir).length;
        const files = filesItems.filter((i) => !i.isDir).length;
        let status = `${dirs} folder${dirs !== 1 ? "s" : ""}, ${files} file${files !== 1 ? "s" : ""}`;
        if (filesFilter) status = `${filtered.length} of ${filesItems.length} items (filtered)`;
        $("files-status-text").textContent = status;

        updateSortHeaders();
    }

    function updateSortHeaders() {
        $("files-col-header").querySelectorAll("[data-sort]").forEach((col) => {
            const key = col.dataset.sort;
            const arrow = col.querySelector(".sort-arrow");
            if (key === filesSortKey) {
                col.classList.add("active");
                arrow.textContent = filesSortAsc ? "▲" : "▼";
            } else {
                col.classList.remove("active");
                arrow.textContent = "";
            }
        });
    }

    $("files-col-header").addEventListener("click", (e) => {
        const col = e.target.closest("[data-sort]");
        if (!col) return;
        const key = col.dataset.sort;
        if (key === filesSortKey) filesSortAsc = !filesSortAsc;
        else { filesSortKey = key; filesSortAsc = true; }
        renderFileList();
    });

    $("files-search").addEventListener("input", (e) => {
        filesFilter = e.target.value;
        renderFileList();
    });

    function getFileType(name, mode) {
        const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
        const codeExts = ["js", "ts", "jsx", "tsx", "py", "rb", "go", "rs", "c", "cpp", "h", "hpp", "java", "php", "cs", "swift", "kt", "sh", "bash", "zsh", "fish", "ps1", "lua", "pl", "r", "sql", "html", "htm", "css", "scss", "less", "xml", "svg", "vue", "svelte"];
        const imageExts = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "ico", "svg", "tiff", "tif"];
        const archiveExts = ["zip", "tar", "gz", "bz2", "xz", "7z", "rar", "deb", "rpm", "pkg"];
        const configExts = ["json", "yaml", "yml", "toml", "ini", "cfg", "conf", "env", "properties"];
        const isExec = mode && (mode & 0o111) !== 0;

        if (codeExts.includes(ext)) return "file-code";
        if (imageExts.includes(ext)) return "file-image";
        if (archiveExts.includes(ext)) return "file-archive";
        if (configExts.includes(ext)) return "file-config";
        if (isExec && !ext) return "file-exec";
        return "file";
    }

    function getFileIcon(item) {
        if (item.isDir) {
            return '<svg class="file-icon" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
        }
        const ext = item.name.includes(".") ? item.name.split(".").pop().toLowerCase() : "";
        const imageExts = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "ico", "tiff", "tif"];
        const archiveExts = ["zip", "tar", "gz", "bz2", "xz", "7z", "rar", "deb", "rpm"];
        const codeExts = ["js", "ts", "jsx", "tsx", "py", "rb", "go", "rs", "c", "cpp", "h", "java", "php", "sh", "bash"];

        if (imageExts.includes(ext)) {
            return '<svg class="file-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
        }
        if (archiveExts.includes(ext)) {
            return '<svg class="file-icon" viewBox="0 0 24 24"><path d="M21 8v13H3V3h12l6 5z"/><path d="M14 3v6h6"/><path d="M10 12h4M10 15h4"/></svg>';
        }
        if (codeExts.includes(ext)) {
            return '<svg class="file-icon" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
        }
        if (["md", "txt", "log", "csv", "readme"].includes(ext) || item.name.toLowerCase() === "readme") {
            return '<svg class="file-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
        }
        return '<svg class="file-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    }

    function modeToString(mode) {
        if (!mode) return "";
        const perms = mode & 0o7777;
        const str = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];
        return str[(perms >> 6) & 7] + str[(perms >> 3) & 7] + str[perms & 7];
    }

    function formatDate(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        if (d.getFullYear() === now.getFullYear()) {
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            return `${months[d.getMonth()]} ${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function joinPath(base, name) {
        return base === "/" ? "/" + name : base + "/" + name;
    }

    function createFileRow(item, parentPath) {
        const row = document.createElement("div");
        const fileType = item.isDir ? "dir" : getFileType(item.name, item.mode);
        row.className = "file-row " + fileType;
        row.dataset.name = item.name;
        row.dataset.isDir = item.isDir ? "1" : "";

        const sizeStr = item.isDir ? "—" : formatSize(item.size);
        const dateStr = formatDate(item.modified);
        const permStr = modeToString(item.mode);

        row.innerHTML = `<div class="file-icon-wrap">${getFileIcon(item)}</div><span class="file-name">${escapeHtml(item.name)}</span><span class="file-size">${sizeStr}</span><span class="file-date">${dateStr}</span><span class="file-perms">${permStr}</span>`;

        row.addEventListener("click", (e) => {
            if (e.target.closest(".file-rename-input")) return;
            if (item.isDir) {
                navigateTo(joinPath(parentPath, item.name));
            } else {
                const fullPath = joinPath(parentPath, item.name);
                previewFile(item, fullPath);
                $("files-list").querySelectorAll(".file-row").forEach((r) => r.classList.remove("selected"));
                row.classList.add("selected");
            }
        });

        row.addEventListener("dblclick", () => {
            if (item.isDir) navigateTo(joinPath(parentPath, item.name));
        });

        row.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e.clientX, e.clientY, item, parentPath);
        });

        return row;
    }

    // ── Preview ────────────────────────────────────

    const previewImageExts = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "ico", "svg", "tiff", "tif"];

    function isImageFile(name) {
        const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
        return previewImageExts.includes(ext);
    }

    async function previewFile(item, filePath) {
        const connId = getConnectedTabId();
        if (!connId) return;
        filesPreviewPath = filePath;
        $("preview-name").textContent = item.name;
        $("preview-meta").textContent = `${formatSize(item.size)} · ${formatDate(item.modified)} · ${modeToString(item.mode)}`;
        $("preview-content").textContent = "Loading…";
        $("preview-content").hidden = false;
        $("preview-image").hidden = true;
        $("files-preview").hidden = false;

        if (isImageFile(item.name)) {
            try {
                const content = await hn.sftpRead(connId, filePath);
                const ext = item.name.split(".").pop().toLowerCase();
                if (ext === "svg") {
                    $("preview-image").innerHTML = `<img src="data:image/svg+xml;base64,${btoa(content)}" alt="${escapeHtml(item.name)}">`;
                } else {
                    const mimeMap = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", webp: "image/webp", ico: "image/x-icon", tiff: "image/tiff", tif: "image/tiff" };
                    const mime = mimeMap[ext] || "application/octet-stream";
                    const bytes = new TextEncoder().encode(content);
                    let binary = "";
                    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                    $("preview-image").innerHTML = `<img src="data:${mime};base64,${btoa(binary)}" alt="${escapeHtml(item.name)}">`;
                }
                $("preview-content").hidden = true;
                $("preview-image").hidden = false;
            } catch (err) {
                $("preview-content").textContent = err.message || "Cannot preview this file.";
            }
            return;
        }

        try {
            const content = await hn.sftpRead(connId, filePath);
            $("preview-content").textContent = content;
        } catch (err) {
            $("preview-content").textContent = err.message || "Cannot preview this file.";
        }
    }

    $("preview-close").addEventListener("click", () => {
        $("files-preview").hidden = true;
        filesPreviewPath = null;
        $("files-list").querySelectorAll(".file-row").forEach((r) => r.classList.remove("selected"));
    });

    $("preview-download").addEventListener("click", () => {
        if (filesPreviewPath) downloadFile(filesPreviewPath);
    });

    // ── File operations ────────────────────────────

    async function downloadFile(remotePath) {
        const connId = getConnectedTabId();
        if (!connId) return;
        try {
            await hn.sftpDownload(connId, remotePath);
        } catch (err) {
            alert("Download failed: " + (err.message || err));
        }
    }

    async function uploadFiles() {
        const connId = getConnectedTabId();
        if (!connId) return;
        try {
            const result = await hn.sftpUpload(connId, filesCurrentPath);
            if (result && !result.canceled) loadDirectory(filesCurrentPath, true);
        } catch (err) {
            alert("Upload failed: " + (err.message || err));
        }
    }

    async function deleteItem(item, parentPath) {
        const fullPath = joinPath(parentPath, item.name);
        const msg = item.isDir
            ? `Delete folder "${item.name}" and all its contents?`
            : `Delete "${item.name}"?`;
        if (!confirm(msg)) return;
        const connId = getConnectedTabId();
        if (!connId) return;
        try {
            await hn.sftpDelete(connId, fullPath, item.isDir);
            loadDirectory(filesCurrentPath, true);
        } catch (err) {
            alert("Delete failed: " + (err.message || err));
        }
    }

    async function renameItem(item, parentPath) {
        const row = $("files-list").querySelector(`.file-row[data-name="${CSS.escape(item.name)}"]`);
        if (!row) return;
        row.classList.add("rename-active");
        const nameSpan = row.querySelector(".file-name");
        const oldName = item.name;
        const input = document.createElement("input");
        input.className = "file-rename-input";
        input.value = oldName;
        nameSpan.replaceWith(input);
        input.focus();
        const dotIdx = oldName.lastIndexOf(".");
        if (dotIdx > 0 && !item.isDir) input.setSelectionRange(0, dotIdx);
        else input.select();

        const finish = async (commit) => {
            input.replaceWith(nameSpan);
            row.classList.remove("rename-active");
            if (!commit || input.value === oldName || !input.value.trim()) return;
            const connId = getConnectedTabId();
            if (!connId) return;
            const oldPath = joinPath(parentPath, oldName);
            const newPath = joinPath(parentPath, input.value.trim());
            try {
                await hn.sftpRename(connId, oldPath, newPath);
                loadDirectory(filesCurrentPath, true);
            } catch (err) {
                alert("Rename failed: " + (err.message || err));
            }
        };

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); finish(true); }
            if (e.key === "Escape") { e.preventDefault(); finish(false); }
        });
        input.addEventListener("blur", () => finish(true));
    }

    async function createFolder() {
        const name = prompt("New folder name:");
        if (!name || !name.trim()) return;
        const connId = getConnectedTabId();
        if (!connId) return;
        const newPath = joinPath(filesCurrentPath, name.trim());
        try {
            await hn.sftpMkdir(connId, newPath);
            loadDirectory(filesCurrentPath, true);
        } catch (err) {
            alert("Create folder failed: " + (err.message || err));
        }
    }

    async function chmodItem(item, parentPath) {
        const current = item.mode ? "0" + (item.mode & 0o7777).toString(8) : "0644";
        const input = prompt("Enter new permissions (octal, e.g. 0755):", current);
        if (!input || !input.trim()) return;
        const mode = parseInt(input.trim(), 8);
        if (isNaN(mode) || mode < 0 || mode > 0o7777) { alert("Invalid permission value."); return; }
        const connId = getConnectedTabId();
        if (!connId) return;
        const fullPath = joinPath(parentPath, item.name);
        try {
            await hn.sftpChmod(connId, fullPath, mode);
            loadDirectory(filesCurrentPath, true);
        } catch (err) {
            alert("Chmod failed: " + (err.message || err));
        }
    }

    $("files-refresh").addEventListener("click", () => loadDirectory(filesCurrentPath, true));
    $("files-new-folder").addEventListener("click", () => createFolder());
    $("files-upload-btn").addEventListener("click", () => uploadFiles());

    // ── Context menu ───────────────────────────────

    function showContextMenu(x, y, item, parentPath) {
        contextTarget = { item, parentPath };
        const menu = $("files-context-menu");
        menu.hidden = false;
        const openBtn = menu.querySelector('[data-action="open"]');
        const dlBtn = menu.querySelector('[data-action="download"]');
        openBtn.textContent = item.isDir ? "Open folder" : "Preview";
        dlBtn.hidden = item.isDir;

        const rect = menu.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        menu.style.left = (x + rect.width > vw ? vw - rect.width - 8 : x) + "px";
        menu.style.top = (y + rect.height > vh ? vh - rect.height - 8 : y) + "px";
    }

    function hideContextMenu() {
        $("files-context-menu").hidden = true;
        contextTarget = null;
    }

    document.addEventListener("click", hideContextMenu);
    document.addEventListener("contextmenu", (e) => {
        if (!e.target.closest(".files-context-menu")) hideContextMenu();
    });

    $("files-context-menu").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn || !contextTarget) return;
        const { item, parentPath } = contextTarget;
        const action = btn.dataset.action;
        hideContextMenu();

        if (action === "open") {
            if (item.isDir) navigateTo(joinPath(parentPath, item.name));
            else previewFile(item, joinPath(parentPath, item.name));
        } else if (action === "download") {
            downloadFile(joinPath(parentPath, item.name));
        } else if (action === "rename") {
            renameItem(item, parentPath);
        } else if (action === "delete") {
            deleteItem(item, parentPath);
        } else if (action === "chmod") {
            chmodItem(item, parentPath);
        }
    });

    // ── Drag & drop upload ─────────────────────────

    const listWrap = $("files-list-wrap");
    let dragCounter = 0;

    listWrap.addEventListener("dragenter", (e) => {
        e.preventDefault();
        dragCounter++;
        if (getConnectedTabId()) $("files-drop-overlay").hidden = false;
    });

    listWrap.addEventListener("dragleave", (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) { dragCounter = 0; $("files-drop-overlay").hidden = true; }
    });

    listWrap.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
    });

    listWrap.addEventListener("drop", async (e) => {
        e.preventDefault();
        dragCounter = 0;
        $("files-drop-overlay").hidden = true;
        const connId = getConnectedTabId();
        if (!connId) return;

        const files = e.dataTransfer.files;
        if (!files.length) return;

        let uploaded = 0;
        for (const file of files) {
            try {
                await hn.sftpUploadBuffer(connId, filesCurrentPath, file.name, await file.arrayBuffer());
                uploaded++;
            } catch (err) {
                console.error("Upload failed:", file.name, err);
            }
        }

        if (uploaded > 0) loadDirectory(filesCurrentPath, true);
    });

    // ── File browser keyboard shortcuts ────────────

    document.addEventListener("keydown", (e) => {
        if (currentView !== "files") return;
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        if (e.key === "Backspace" || (e.altKey && e.key === "ArrowLeft")) {
            e.preventDefault();
            if (filesHistoryIdx > 0) { filesHistoryIdx--; loadDirectory(filesHistory[filesHistoryIdx]); }
        }
        if (e.altKey && e.key === "ArrowUp") {
            e.preventDefault();
            if (filesCurrentPath !== "/") navigateTo(filesCurrentPath.replace(/\/[^/]+\/?$/, "") || "/");
        }
        if (e.key === "F5" || (e.ctrlKey && e.key === "r")) {
            e.preventDefault();
            loadDirectory(filesCurrentPath, true);
        }
        if (e.ctrlKey && e.key === "f") {
            e.preventDefault();
            $("files-search").focus();
        }
    });

    function formatSize(bytes) {
        if (bytes === 0) return "0 B";
        if (bytes == null) return "";
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
        $("login-username").focus();
    });
})();
