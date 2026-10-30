/* HN Group support section (the user's request, 30 October 2026: support moved off support.hngroup.org.uk into
   hngroup.org.uk, network.hngroup.org.uk, media.hngroup.org.uk and development.hngroup.org.uk).
   Drawn into <div data-hn-support data-site="website|network|media|development">. Requests go to the staff
   portal's Website enquiries (through the site's own /api/public/support routes); the person gets a private
   reference to read replies and answer here. Copied identically into each site (brand/web/copies.json). */
(function () {
    "use strict";
    var root = document.querySelector("[data-hn-support]");
    if (!root) return;
    var site = root.getAttribute("data-site") || "website";
    var KEY = "hn-support-reference";
    var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
    var when = function (iso) { try { return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };
    var TOPICS = [
        ["account", "My HN Group account or sign-in"],
        ["website", "A website or online service"],
        ["apps", "HN Browser, Secure Network or App Manager"],
        ["project", "A project or service we provide"],
        ["billing", "Invoices and payments"],
        ["other", "Something else"]
    ];
    var HELP = [
        ["Sign-in, password and PIN", "Manage your HN Group account, password, PIN and signed-in devices.", "https://accounts.hngroup.org.uk", "HN Account"],
        ["Is something down?", "Live availability, maintenance and incident updates for every HN Group service.", "https://status.hngroup.org.uk", "Service status"],
        ["Apps and downloads", "Download HN Browser, HN Secure Network and the HN Group App Manager.", "https://downloads.hngroup.org.uk", "Downloads"],
        ["Find a website", "Every HN Group company, website and service in one place.", "https://links.hngroup.org.uk", "HN Group Links"]
    ];
    var FAQ = [
        ["How do I check on my request?", "When you send a request you get a private reference. Paste it into “Check a request” below to read replies, see its status and answer. Replies appear here; we don’t send them by email."],
        ["Who can see my request?", "The HN Group support team, and anyone who has your private reference. Keep the reference to yourself, and never include passwords, PINs or payment card details in a message."],
        ["I can’t sign in to my HN Group account", "Try “Forgot your password?” on HN Group Auth first. If you’ve forgotten your PIN or your account is locked, send a request below about “My HN Group account or sign-in” and we’ll help."],
        ["A website isn’t working", "Check service status first: if there’s a known problem it’ll be listed there with updates. If not, send a request with the web address, what you were doing and any error message."]
    ];
    var field = function (id, label, input, optional) { return '<div><label for="' + id + '">' + esc(label) + (optional ? ' <span class="optional">(optional)</span>' : "") + "</label>" + input + "</div>"; };

    root.innerHTML =
        '<div class="hs-help">' + HELP.map(function (h) {
            return '<a class="card hs-help-card" href="' + h[2] + '"><h3>' + esc(h[0]) + '</h3><p class="muted small">' + esc(h[1]) + '</p><span class="link-arrow">' + esc(h[3]) + "</span></a>";
        }).join("") + "</div>" +
        '<div class="split hs-split">' +
        '<div class="hs-forms">' +
        '<form class="card form" id="hs-new" novalidate><p class="eyebrow">New request</p><h3>Tell us what’s wrong.</h3>' +
        '<div class="grid-2">' + field("hs-name", "Your name", '<input id="hs-name" name="name" autocomplete="name" maxlength="120" required>') +
        field("hs-email", "Email", '<input id="hs-email" name="email" type="email" autocomplete="email" maxlength="160" required>') + "</div>" +
        '<div class="grid-2">' + field("hs-topic", "What’s it about?", '<select id="hs-topic" name="topic">' + TOPICS.map(function (t) { return '<option value="' + t[0] + '">' + esc(t[1]) + "</option>"; }).join("") + "</select>") +
        field("hs-org", "Organisation", '<input id="hs-org" name="organisation" autocomplete="organization" maxlength="120">', true) + "</div>" +
        field("hs-subject", "Subject", '<input id="hs-subject" name="subject" maxlength="160" required placeholder="e.g. I can’t sign in to HN Browser">') +
        field("hs-message", "What happened?", '<textarea id="hs-message" name="message" rows="6" maxlength="5000" required placeholder="What you were doing, what you expected, and any error message."></textarea>') +
        '<div class="hp" aria-hidden="true"><label for="hs-website">Leave this empty</label><input id="hs-website" name="website" tabindex="-1" autocomplete="off"></div>' +
        '<p class="small muted">Please don’t include passwords, PINs or card details. See our <a href="https://hngroup.org.uk/privacypolicy">privacy policy</a>.</p>' +
        '<p class="form-error" id="hs-new-error" role="alert" hidden></p>' +
        '<button class="btn btn-primary" type="submit">Send request</button></form>' +
        '<div class="card hs-done" id="hs-done" hidden tabindex="-1"><div class="done-mark" aria-hidden="true"></div><h3>Request sent.</h3>' +
        '<p class="muted">This is your private reference. Copy it somewhere safe: you’ll need it to read our reply and answer. We can’t show it to you again.</p>' +
        '<code class="hs-ref" id="hs-ref"></code><div class="hs-actions"><button class="btn btn-primary" type="button" id="hs-copy">Copy reference</button><button class="btn btn-ghost" type="button" id="hs-open">Open my request</button><button class="btn btn-ghost" type="button" id="hs-again">Send another</button></div></div>' +
        "</div>" +
        '<div class="hs-side">' +
        '<form class="card form" id="hs-track" novalidate><p class="eyebrow">Check a request</p><h3>Already sent one?</h3><p class="muted small">Paste your private reference to read replies and answer.</p>' +
        field("hs-reference", "Private reference", '<input id="hs-reference" name="reference" maxlength="64" autocomplete="off" spellcheck="false" required>') +
        '<label class="hs-remember"><input type="checkbox" id="hs-remember"> Remember it on this device</label>' +
        '<p class="form-error" id="hs-track-error" role="alert" hidden></p><button class="btn btn-primary" type="submit">Check request</button></form>' +
        '<div class="card hs-thread" id="hs-thread" hidden tabindex="-1"></div>' +
        '<div class="card hs-faq"><p class="eyebrow">Common questions</p>' + FAQ.map(function (f) { return "<details><summary>" + esc(f[0]) + "</summary><p class=\"muted small\">" + esc(f[1]) + "</p></details>"; }).join("") + "</div>" +
        "</div></div>";

    var $ = function (id) { return document.getElementById(id); };
    function post(path, data) {
        return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (v) { if (!r.ok) throw new Error(v.error || "That didn’t work. Please try again."); return v; });
        });
    }
    function fail(id, e) { var el = $(id); el.textContent = e.message; el.hidden = false; }
    function remembered() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
    function remember(ref, on) { try { if (on) localStorage.setItem(KEY, ref); else if (remembered() === ref) localStorage.removeItem(KEY); } catch (e) {} }

    var reference = "";
    function draw(r) {
        var t = $("hs-thread");
        t.hidden = false;
        t.innerHTML = '<div class="hs-thread-head"><div><p class="eyebrow">' + esc(r.site) + " · " + esc(r.topic) + "</p><h3>" + esc(r.subject) + '</h3><p class="muted small">Sent ' + esc(when(r.createdAt)) + '</p></div><span class="tag hs-status' + (r.resolved ? " is-done" : "") + '">' + esc(r.status) + "</span></div>" +
            '<ol class="hs-messages">' + r.messages.map(function (m) {
                return '<li class="' + (m.from === "you" ? "from-you" : "from-staff") + '"><p class="small"><strong>' + (m.from === "you" ? "You" : esc(m.byName)) + '</strong> <span class="muted">' + esc(when(m.at)) + "</span></p><p>" + esc(m.text) + "</p></li>";
            }).join("") + "</ol>" +
            '<form id="hs-reply" class="form"><label for="hs-reply-text">' + (r.resolved ? "Still need help? Reply to reopen it" : "Add a reply") + '</label><textarea id="hs-reply-text" rows="4" maxlength="5000" required></textarea><p class="form-error" id="hs-reply-error" role="alert" hidden></p><div class="hs-actions"><button class="btn btn-primary" type="submit">Send reply</button><button class="btn btn-ghost" type="button" id="hs-close">Close</button></div></form>';
        $("hs-reply").addEventListener("submit", function (ev) {
            ev.preventDefault();
            var box = $("hs-reply-text"), button = ev.target.querySelector("[type=submit]");
            if (!box.value.trim() || button.disabled) return;
            button.disabled = true;
            post("/api/public/support/track", { reference: reference, message: box.value }).then(function (v) { draw(v.request); $("hs-thread").focus(); }).catch(function (e) { fail("hs-reply-error", e); button.disabled = false; });
        });
        $("hs-close").addEventListener("click", function () { t.hidden = true; t.innerHTML = ""; reference = ""; });
    }
    function open(ref, focus) {
        return post("/api/public/support/track", { reference: ref }).then(function (v) { reference = ref; draw(v.request); if (focus) { $("hs-thread").focus(); $("hs-thread").scrollIntoView({ block: "nearest" }); } });
    }

    $("hs-new").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var form = ev.target, button = form.querySelector("[type=submit]");
        if (button.disabled) return;
        $("hs-new-error").hidden = true;
        if (!form.checkValidity()) { form.reportValidity(); return; }
        var data = Object.fromEntries(new FormData(form));
        data.site = site;
        button.disabled = true; button.textContent = "Sending…";
        post("/api/public/support", data).then(function (v) {
            form.reset(); form.hidden = true;
            $("hs-ref").textContent = v.reference;
            $("hs-done").hidden = false; $("hs-done").focus();
            $("hs-reference").value = v.reference;
        }).catch(function (e) { fail("hs-new-error", e); }).then(function () { button.disabled = false; button.textContent = "Send request"; });
    });
    $("hs-copy").addEventListener("click", function () {
        var ref = $("hs-ref").textContent, b = $("hs-copy");
        (navigator.clipboard ? navigator.clipboard.writeText(ref) : Promise.reject()).then(function () { b.textContent = "Copied"; }, function () {
            var range = document.createRange(); range.selectNodeContents($("hs-ref")); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); b.textContent = "Selected — press Ctrl+C";
        });
    });
    $("hs-open").addEventListener("click", function () { open($("hs-ref").textContent, true).catch(function (e) { fail("hs-track-error", e); }); });
    $("hs-again").addEventListener("click", function () { $("hs-done").hidden = true; $("hs-new").hidden = false; $("hs-copy").textContent = "Copy reference"; $("hs-name").focus(); });
    $("hs-track").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var ref = $("hs-reference").value.trim().toLowerCase(), button = ev.target.querySelector("[type=submit]");
        $("hs-track-error").hidden = true;
        if (!/^[a-f0-9]{64}$/.test(ref)) return fail("hs-track-error", new Error("A reference is 64 letters and numbers. Check you copied all of it."));
        button.disabled = true;
        open(ref, true).then(function () { remember(ref, $("hs-remember").checked); }).catch(function (e) { fail("hs-track-error", e); }).then(function () { button.disabled = false; });
    });
    var saved = remembered();
    if (/^[a-f0-9]{64}$/.test(saved)) { $("hs-reference").value = saved; $("hs-remember").checked = true; open(saved, false).catch(function () {}); }
    document.dispatchEvent(new CustomEvent("hn:content"));
})();
