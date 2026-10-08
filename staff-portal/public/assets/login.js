(function () {
    const form = document.getElementById("login-form");
    const errorBox = document.getElementById("login-error");
    const button = document.getElementById("login-btn");
    const password = document.getElementById("password");
    const toggle = document.getElementById("toggle-pw");

    toggle.addEventListener("click", function () {
        const show = password.type === "password";
        password.type = show ? "text" : "password";
        toggle.textContent = show ? "Hide" : "Show";
        toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
    }

    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        errorBox.hidden = true;

        const username = form.username.value.trim();
        if (!username || !password.value) {
            showError("Enter your username and password.");
            return;
        }

        button.disabled = true;
        button.textContent = "Signing in…";
        try {
            const res = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: username, password: password.value }),
            });
            const data = await res.json().catch(function () { return {}; });
            if (!res.ok) throw new Error(data.error || "Sign in failed. Please try again.");
            window.location.href = "/dashboard";
        } catch (err) {
            showError(err.message === "Failed to fetch" ? "Can't reach the server. Check your connection." : err.message);
            password.value = "";
            password.focus();
            button.disabled = false;
            button.textContent = "Sign in";
        }
    });
})();
