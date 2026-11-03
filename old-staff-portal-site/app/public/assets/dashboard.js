(function () {
    const $ = function (id) { return document.getElementById(id); };

    async function api(path, body) {
        const res = await fetch(path, body === undefined ? {} : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (res.status === 401 && path !== "/api/change-password") {
            window.location.href = "/login";
            throw new Error("Signed out");
        }
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(data.error || "Something went wrong.");
        return data;
    }

    // ----- Header / greeting -----
    const now = new Date();
    const hour = now.getHours();
    const dateText = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    $("today").textContent = dateText;
    $("news-date").textContent = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    $("year").textContent = now.getFullYear();

    function renderUser(user) {
        const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
        const firstName = (user.displayName || user.username).split(" ")[0];
        $("greeting").textContent = greeting + ", " + firstName;
        $("user-name").textContent = user.displayName || user.username;
        $("user-role").textContent = [user.role, user.company].filter(Boolean).join(" · ");
        $("avatar").textContent = (user.displayName || user.username).trim().charAt(0).toUpperCase();
        $("pw-banner").hidden = !user.mustChangePassword;
    }

    api("/api/me").then(function (d) { renderUser(d.user); }).catch(function () {});

    // ----- User dropdown -----
    const userBtn = $("user-btn");
    const dropdown = $("user-dropdown");
    function setDropdown(open) {
        dropdown.hidden = !open;
        userBtn.setAttribute("aria-expanded", String(open));
    }
    userBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        setDropdown(dropdown.hidden);
    });
    document.addEventListener("click", function () { setDropdown(false); });

    $("logout-btn").addEventListener("click", async function () {
        try { await api("/api/logout", {}); } catch (e) { /* ignore */ }
        window.location.href = "/login";
    });

    // ----- Toast -----
    let toastTimer;
    function toast(msg) {
        const el = $("toast");
        el.textContent = msg;
        el.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
    }
    document.querySelectorAll("[data-soon]").forEach(function (el) {
        el.addEventListener("click", function (e) {
            e.preventDefault();
            toast(el.querySelector(".tile-title").textContent + " is coming soon.");
        });
    });

    // ----- Change password modal -----
    const modal = $("pw-modal");
    const form = $("pw-form");
    const errorBox = $("pw-error");
    const successBox = $("pw-success");

    function openModal() {
        setDropdown(false);
        form.reset();
        errorBox.hidden = true;
        successBox.hidden = true;
        modal.hidden = false;
        $("current-pw").focus();
    }
    function closeModal() { modal.hidden = true; }

    $("open-change-pw").addEventListener("click", openModal);
    $("banner-change-pw").addEventListener("click", openModal);
    $("pw-cancel").addEventListener("click", closeModal);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });

    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        errorBox.hidden = true;
        const current = $("current-pw").value;
        const next = $("new-pw").value;
        if (next.length < 8) { errorBox.textContent = "New password must be at least 8 characters."; errorBox.hidden = false; return; }
        if (next !== $("confirm-pw").value) { errorBox.textContent = "New passwords don't match."; errorBox.hidden = false; return; }

        const submit = $("pw-submit");
        submit.disabled = true;
        try {
            const data = await api("/api/change-password", { currentPassword: current, newPassword: next });
            renderUser(data.user);
            successBox.hidden = false;
            setTimeout(closeModal, 900);
            toast("Password updated.");
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.hidden = false;
        } finally {
            submit.disabled = false;
        }
    });
})();
