(function () {
    const card = document.querySelector(".login-card");
    const stepPassword = document.getElementById("step-password");
    const stepCode = document.getElementById("step-code");
    const form = document.getElementById("login-form");
    const codeForm = document.getElementById("code-form");
    const password = document.getElementById("password");
    const toggle = document.getElementById("toggle-pw");
    const boxes = Array.prototype.slice.call(document.querySelectorAll("#code-boxes input"));
    let challenge = null;

    toggle.addEventListener("click", function () {
        const show = password.type === "password";
        password.type = show ? "text" : "password";
        toggle.textContent = show ? "Hide" : "Show";
        toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });

    function showError(id, message) {
        const box = document.getElementById(id);
        box.textContent = message;
        box.hidden = false;
        // Restart the shake animation.
        card.classList.remove("shake");
        void card.offsetWidth;
        card.classList.add("shake");
    }

    function setBusy(button, busy, idle) {
        button.disabled = busy;
        button.classList.toggle("busy", busy);
        button.querySelector(".btn-label").textContent = busy ? "Checking…" : idle;
    }

    function finish(button) {
        try { sessionStorage.setItem("hn-just-signed-in", "1"); } catch (e) { /* ignore */ }
        button.classList.add("done");
        button.querySelector(".btn-label").textContent = "Welcome";
        document.body.classList.add("leaving");
        setTimeout(function () { window.location.href = "/home"; }, 350);
    }

    function showStep(step) {
        stepPassword.hidden = step !== "password";
        stepCode.hidden = step !== "code";
        (step === "code" ? stepCode : stepPassword).classList.add("step-enter");
        if (step === "code") {
            boxes.forEach(function (b) { b.value = ""; b.classList.remove("filled"); });
            boxes[0].focus();
        } else {
            password.value = "";
            password.focus();
        }
    }

    async function post(url, body) {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok) throw Object.assign(new Error(data.error || "Sign in failed. Please try again."), { restart: data.restart });
        return data;
    }

    function friendly(err) {
        return err.message === "Failed to fetch" ? "Can't reach the server. Check your connection." : err.message;
    }

    // Step 1: email and password.
    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        document.getElementById("login-error").hidden = true;
        const username = form.username.value.trim();
        if (!username || !password.value) return showError("login-error", "Enter your email address and password.");

        const button = document.getElementById("login-btn");
        setBusy(button, true, "Continue");
        try {
            const data = await post("/api/login", { username: username, password: password.value });
            if (data.codeRequired) {
                challenge = data.challenge;
                document.getElementById("code-email").textContent = username;
                setBusy(button, false, "Continue");
                showStep("code");
            } else {
                finish(button);
            }
        } catch (err) {
            showError("login-error", friendly(err));
            password.value = "";
            password.focus();
            setBusy(button, false, "Continue");
        }
    });

    // Step 2: the 6-digit code. Typing moves along the boxes; pasting fills them all.
    function code() {
        return boxes.map(function (b) { return b.value; }).join("");
    }

    boxes.forEach(function (box, i) {
        box.addEventListener("input", function () {
            const digits = box.value.replace(/\D/g, "");
            if (digits.length > 1) {
                digits.slice(0, 6 - i).split("").forEach(function (d, j) { boxes[i + j].value = d; boxes[i + j].classList.add("filled"); });
            } else {
                box.value = digits;
            }
            box.classList.toggle("filled", !!box.value);
            const next = boxes.find(function (b) { return !b.value; });
            if (box.value && next) next.focus();
            if (code().length === 6) codeForm.requestSubmit();
        });
        box.addEventListener("keydown", function (e) {
            if (e.key === "Backspace" && !box.value && i > 0) {
                boxes[i - 1].value = "";
                boxes[i - 1].classList.remove("filled");
                boxes[i - 1].focus();
                e.preventDefault();
            } else if (e.key === "ArrowLeft" && i > 0) {
                boxes[i - 1].focus();
            } else if (e.key === "ArrowRight" && i < 5) {
                boxes[i + 1].focus();
            }
        });
        box.addEventListener("paste", function (e) {
            const text = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
            if (!text) return;
            e.preventDefault();
            text.split("").forEach(function (d, j) { if (boxes[j]) { boxes[j].value = d; boxes[j].classList.add("filled"); } });
            (boxes[text.length] || boxes[5]).focus();
            if (code().length === 6) codeForm.requestSubmit();
        });
    });

    codeForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        document.getElementById("code-error").hidden = true;
        if (code().length !== 6) return showError("code-error", "Enter all 6 digits of your code.");
        const button = document.getElementById("code-btn");
        if (button.disabled) return;
        setBusy(button, true, "Sign in");
        try {
            await post("/api/login/code", { challenge: challenge, code: code() });
            finish(button);
        } catch (err) {
            setBusy(button, false, "Sign in");
            if (err.restart) {
                showStep("password");
                showError("login-error", friendly(err));
            } else {
                showError("code-error", friendly(err));
                boxes.forEach(function (b) { b.value = ""; b.classList.remove("filled"); });
                boxes[0].focus();
            }
        }
    });

    document.getElementById("code-back").addEventListener("click", function () {
        challenge = null;
        document.getElementById("code-error").hidden = true;
        showStep("password");
    });
})();
