// HN Group public website: menu, scroll effects, open roles (from the staff portal) and the
// contact form. Talks to /api/public/ on this domain, which nginx passes to the staff portal.
(function () {
    "use strict";
    document.documentElement.classList.add("js");

    const $ = function (sel, root) { return (root || document).querySelector(sel); };
    const esc = function (s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
    };
    const fmtDate = function (iso) {
        return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    };

    async function post(path, body, headers) {
        const res = await fetch(path, { method: "POST", headers: headers || { "Content-Type": "application/json" }, body: body });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
        return data;
    }

    // ----- Header: border once scrolled, mobile menu -----
    const header = $(".site-header");
    const onScroll = function () { header.classList.toggle("scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const toggle = $(".menu-toggle"), nav = $("#site-nav");
    toggle.addEventListener("click", function () {
        const open = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", String(open));
        nav.classList.toggle("open", open);
    });
    nav.addEventListener("click", function (e) {
        if (e.target.closest("a")) { toggle.setAttribute("aria-expanded", "false"); nav.classList.remove("open"); }
    });

    // Links that pick a contact topic, e.g. "Media and press enquiries".
    document.addEventListener("click", function (e) {
        const a = e.target.closest("[data-topic]");
        if (a && $("#cf-topic")) $("#cf-topic").value = a.dataset.topic;
    });

    // ----- Fade sections in as they scroll into view -----
    const reveals = document.querySelectorAll(".reveal");
    if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
        }, { rootMargin: "0px 0px -8% 0px" });
        reveals.forEach(function (el) { io.observe(el); });
    } else {
        reveals.forEach(function (el) { el.classList.add("in"); });
    }

    document.querySelectorAll(".site-nav a").forEach(a=>{if(a.pathname===location.pathname&&a.origin===location.origin)a.setAttribute("aria-current","page");});
    const year = $("#year");
    if (year) year.textContent = new Date().getFullYear();

    // ----- Careers: roles HR have chosen to advertise in the staff portal -----
    const jobsBox = $("#jobs");
    let jobs = [];
    function noJobs(message) {
        jobsBox.innerHTML = '<div class="jobs-empty"><h3>' + esc(message) + "</h3>" +
            '<p class="muted">We’re always happy to hear from talented people. Send us a message with a little about yourself and the kind of role you’re looking for.</p>' +
            '<p><a class="link-arrow" href="/contact?topic=careers">Get in touch about careers</a></p></div>';
    }
    if (jobsBox) {
        fetch("/api/public/jobs").then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (d) {
            jobs = d.jobs || [];
            if (!jobs.length) return noJobs("There are no open roles right now.");
            jobsBox.innerHTML = jobs.map(function (j) {
                return '<article class="job"><div><h3>' + esc(j.title) + '</h3><div class="job-meta"><span>' + esc(j.company) + "</span>" +
                    (j.location ? "<span>" + esc(j.location) + "</span>" : "") + "<span>" + esc(j.contract) + "</span>" +
                    (j.salary ? "<span>" + esc(j.salary) + "</span>" : "") + (j.closingDate ? "<span>Closes " + esc(fmtDate(j.closingDate)) + "</span>" : "") + "</div></div>" +
                    '<button class="btn btn-primary btn-small" type="button" data-job="' + esc(j.id) + '">View and apply</button></article>';
            }).join("");
        }).catch(function () { noJobs("Open roles couldn’t be loaded just now."); });

        jobsBox.addEventListener("click", function (e) {
            const b = e.target.closest("[data-job]");
            if (b) openApply(jobs.find(function (j) { return j.id === b.dataset.job; }));
        });
    }

    const dialog = $("#apply-dialog");
    function openApply(job) {
        if (!job) return;
        const body = $("#apply-body");
        body.innerHTML = '<p class="eyebrow">' + esc(job.company) + "</p><h2 id=\"apply-title\">" + esc(job.title) + "</h2>" +
            '<div class="job-meta">' + (job.location ? "<span>" + esc(job.location) + "</span>" : "") + "<span>" + esc(job.contract) + "</span>" +
            (job.salary ? "<span>" + esc(job.salary) + "</span>" : "") + (job.closingDate ? "<span>Closes " + esc(fmtDate(job.closingDate)) + "</span>" : "") + "</div>" +
            (job.description ? '<div class="job-desc">' + esc(job.description) + "</div>" : "") +
            '<form id="apply-form" novalidate><h3>Apply for this role</h3>' +
            '<div class="grid-2"><div><label for="ap-name">Your name</label><input id="ap-name" autocomplete="name" maxlength="120" required></div>' +
            '<div><label for="ap-email">Email</label><input id="ap-email" type="email" autocomplete="email" maxlength="160" required></div></div>' +
            '<label for="ap-phone">Phone <span class="optional">(optional)</span></label><input id="ap-phone" type="tel" autocomplete="tel" maxlength="40">' +
            '<label for="ap-cv">Your CV <span class="optional">(PDF or Word, up to 10 MB)</span></label><input id="ap-cv" type="file" accept=".pdf,.doc,.docx,.odt,.rtf,.txt" required>' +
            '<label for="ap-msg">Why you’re interested <span class="optional">(optional)</span></label><textarea id="ap-msg" rows="4" maxlength="3000"></textarea>' +
            '<p class="small muted">Your application goes to our recruitment team. See our <a href="/privacy">privacy notice</a> for how we use it.</p>' +
            '<p class="form-error" id="ap-error" role="alert" hidden></p>' +
            '<button class="btn btn-primary" type="submit" id="ap-send">Send application</button></form>';
        $("#apply-form").addEventListener("submit", async function (e) {
            e.preventDefault();
            const err = $("#ap-error");
            err.hidden = true;
            const file = $("#ap-cv").files[0];
            const fail = function (m) { err.textContent = m; err.hidden = false; };
            if (!$("#ap-name").value.trim()) return fail("Please enter your name.");
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test($("#ap-email").value.trim())) return fail("Please enter a valid email address.");
            if (!file) return fail("Please attach your CV.");
            if (file.size > 10 * 1024 * 1024) return fail("Your CV is too large. The limit is 10 MB.");
            const send = $("#ap-send");
            send.disabled = true;
            send.textContent = "Sending…";
            try {
                const meta = { name: $("#ap-name").value, email: $("#ap-email").value, phone: $("#ap-phone").value, message: $("#ap-msg").value, fileName: file.name };
                await post("/api/public/jobs/" + job.id + "/apply", file, { "Content-Type": "application/octet-stream", "X-Application": encodeURIComponent(JSON.stringify(meta)) });
                body.innerHTML = '<div class="form-done"><div class="done-mark" aria-hidden="true"></div><h2>Application sent</h2>' +
                    '<p class="muted">Thanks for applying for ' + esc(job.title) + ". Our recruitment team will be in touch by email.</p>" +
                    '<form method="dialog"><button class="btn btn-ghost">Close</button></form></div>';
            } catch (ex) {
                fail(ex.message);
                send.disabled = false;
                send.textContent = "Send application";
            }
        });
        if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
        $("#ap-name").focus();
    }
    if (dialog) dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });

    // ----- Contact form: lands in the staff portal under Website enquiries -----
    const form = $("#contact-form");
    if (form) {
        const topic = new URLSearchParams(location.search).get("topic");
        if (topic && [...$("#cf-topic").options].some(o => o.value === topic)) $("#cf-topic").value = topic;
        form.addEventListener("submit", async function (e) {
            e.preventDefault();
            const err = $("#cf-error");
            err.hidden = true;
            const fail = function (m, field) { err.textContent = m; err.hidden = false; if (field) field.focus(); };
            const v = function (id) { return $(id).value.trim(); };
            if (!v("#cf-name")) return fail("Please enter your name.", $("#cf-name"));
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v("#cf-email"))) return fail("Please enter a valid email address.", $("#cf-email"));
            if (v("#cf-message").length < 10) return fail("Please write a little more about what you need.", $("#cf-message"));
            const send = $("#cf-send");
            send.disabled = true;
            send.textContent = "Sending…";
            try {
                const data = {};
                new FormData(form).forEach(function (value, key) { data[key] = value; });
                await post("/api/public/enquiry", JSON.stringify(data));
                form.hidden = true;
                form.reset();
                $("#contact-done").hidden = false;
                $("#contact-done").focus();
            } catch (ex) {
                fail(ex.message);
            }
            send.disabled = false;
            send.textContent = "Send message";
        });
        $("#cf-again").addEventListener("click", function () {
            $("#contact-done").hidden = true;
            form.hidden = false;
            $("#cf-name").focus();
        });
    }
})();

(async function(){const target=document.getElementById('leadership');if(!target)return;try{const response=await fetch('/api/leadership');if(!response.ok)throw Error();const data=await response.json();target.replaceChildren();if(!data.leaders.length){const p=document.createElement('p');p.className='leadership-notice muted';p.textContent='Our leadership team will be introduced here soon.';target.append(p);return;}for(const person of data.leaders){const card=document.createElement('article');card.className='leader';const initials=document.createElement('span');initials.className='leader-initials';initials.setAttribute('aria-hidden','true');initials.textContent=person.name.split(/\s+/).slice(0,2).map(n=>n[0]).join('');card.append(initials);if(person.avatarUrl){const photo=document.createElement('img');photo.className='leader-photo';photo.alt='';photo.hidden=true;photo.onload=()=>{photo.hidden=false;initials.hidden=true;};photo.onerror=()=>{photo.hidden=true;initials.hidden=false;};photo.src=person.avatarUrl;card.append(photo);}const name=document.createElement('h3');name.textContent=person.name;const job=document.createElement('p');job.textContent=person.jobTitle;card.append(name,job);target.append(card);}}catch{target.replaceChildren();const p=document.createElement('p');p.className='leadership-notice muted';p.textContent='Our leadership team couldn’t be loaded just now. Please try again shortly.';target.append(p);}})();
