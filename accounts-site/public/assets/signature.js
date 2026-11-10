"use strict";
// Branded signature maker moved from the Staff Portal. Values stay local to this page.
(function () {
    const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const icon = () => "";
    const copyText = async (value) => {
        try { await navigator.clipboard.writeText(value); }
        catch { const input = document.createElement("textarea"); input.value = value; document.body.append(input); input.select(); document.execCommand("copy"); input.remove(); }
    };
    // ================= Email signature generator =================

    // Same layout as the signatures in brand/email-signature: logo on the left, details on the right,
    // the eight-colour stripe, the parent company line and the confidentiality notice.
    const SIGNATURE_COMPANIES = {
        "HN Group": { logo: "hn-group-email-logo", accent: "#5514B4", web: "hngroup.org.uk", domain: "hngroup.org.uk", legal: "HN Group Limited" },
        "Horizon Network": { logo: "horizon-network-email-logo", accent: "#5514B4", web: "network.hngroup.org.uk", domain: "horizon-network.co.uk", legal: "Horizon Network Limited", parent: "HN Group", parentLegal: "HN Group Limited" },
        "Horizon Advertising": { logo: "horizon-advertising-email-logo", accent: "#7B52C4", web: "horizonadvertising.co.uk", domain: "horizonadvertising.co.uk", legal: "Horizon Advertising Limited", parent: "Horizon Media Group", parentLegal: "Horizon Media Group Limited" },
        "Horizon Development": { logo: "horizon-development-email-logo", accent: "#5514B4", web: "development.hngroup.org.uk", legal: "Horizon Development", parent: "Horizon Network", parentLegal: "Horizon Network Limited" },
        "Horizon Media Group": { logo: "horizon-media-group-email-logo", accent: "#5514B4", web: "hngroup.org.uk", domain: "media.hngroup.org.uk", legal: "Horizon Media Group Limited", parent: "HN Group", parentLegal: "HN Group Limited" },
    };
    const SIG_STRIPE = [["#E97DE8", 14], ["#5514B4", 14], ["#E3E65B", 6], ["#3E9BA3", 20], ["#7A1F6C", 10], ["#C2306B", 10], ["#5FAE7B", 13], ["#1C2235", 13]];

    function signatureHtml(v) {
        const c = SIGNATURE_COMPANIES[v.company] || SIGNATURE_COMPANIES["HN Group"];
        const web = v.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
        const href = "https://" + web;
        const logo = window.location.origin + "/assets/brand/png/" + c.logo + ".png";
        const line = function (letter, inner) { return '<span style="color:#1A1A1A;font-weight:bold;">' + letter + "</span>&nbsp; " + inner; };
        const lines = [];
        if (v.email) lines.push(line("E", '<a href="mailto:' + esc(v.email) + '" style="color:#4A4A4A;text-decoration:none;">' + esc(v.email) + "</a>"));
        if (v.phone) lines.push(line("T", '<a href="tel:' + esc(v.phone.replace(/[^\d+]/g, "")) + '" style="color:#4A4A4A;text-decoration:none;">' + esc(v.phone) + "</a>"));
        if (web) lines.push(line("W", '<a href="' + esc(href) + '" style="color:#4A4A4A;text-decoration:none;">' + esc(web) + "</a>"));
        return '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;max-width:560px;">' +
            "<tr>" +
            '<td valign="middle" style="padding:0 20px 0 0;width:200px;border-right:2px solid ' + c.accent + ';">' +
            '<a href="' + esc(href) + '" style="text-decoration:none;"><img src="' + esc(logo) + '" width="200" height="100" alt="' + esc(v.company) + '" style="display:block;border:0;width:200px;height:100px;"></a></td>' +
            '<td valign="middle" style="padding:0 0 0 20px;">' +
            '<p style="margin:0;font-size:17px;line-height:22px;font-weight:bold;color:#1A1A1A;">' + esc(v.name) + "</p>" +
            '<p style="margin:4px 0 10px;font-size:12px;line-height:18px;"><span style="color:' + c.accent + ';font-weight:bold;">' + esc(v.title) + "</span> &nbsp;" +
            '<span style="color:#4A4A4A;">' + esc(c.legal) + "</span></p>" +
            '<p style="margin:0;font-size:12px;line-height:19px;color:#4A4A4A;">' + lines.join("<br>") + "</p>" +
            "</td></tr>" +
            '<tr><td colspan="2" style="padding:14px 0 0;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="border-collapse:collapse;"><tr>' +
            SIG_STRIPE.map(function (s) { return '<td height="3" width="' + s[1] + '%" bgcolor="' + s[0] + '" style="font-size:0;line-height:0;">&nbsp;</td>'; }).join("") +
            "</tr></table></td></tr>" +
            (c.parent ? '<tr><td colspan="2" style="padding:10px 0 0;font-size:11px;line-height:18px;color:#1A1A1A;">A <strong>' + esc(c.parent) + "</strong> company</td></tr>" : "") +
            '<tr><td colspan="2" style="padding:12px 0 0;font-size:10px;line-height:14px;color:#9A9A9A;">' +
            "This email and any attachments are confidential and intended only for the named recipient. If you have received it in error, please tell the sender and delete it." +
            (c.parent ? " " + esc(v.company) + " is a subsidiary of " + esc(c.parentLegal) + "." : "") +
            "</td></tr></table>";
    }

    // The same signature drawn as a PNG image (2x for sharp text), matching signatureHtml's layout.
    async function signaturePng(v) {
        const c = SIGNATURE_COMPANIES[v.company] || SIGNATURE_COMPANIES["HN Group"];
        const web = v.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
        const logo = await new Promise(function (resolve) {
            const img = new Image();
            img.onload = function () { resolve(img); };
            img.onerror = function () { resolve(null); };
            img.src = "/assets/brand/png/" + c.logo + ".png";
        });
        const W = 560, PAD = 24, SCALE = 2, FONT = "Arial, Helvetica, sans-serif";
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const font = function (size, bold) { ctx.font = (bold ? "bold " : "") + size + "px " + FONT; };
        // Wrap the notice to the signature width.
        const notice = "This email and any attachments are confidential and intended only for the named recipient. If you have received it in error, please tell the sender and delete it." +
            (c.parent ? " " + v.company + " is a subsidiary of " + c.parentLegal + "." : "");
        font(10, false);
        const noticeLines = [];
        notice.split(" ").forEach(function (word) {
            const last = noticeLines[noticeLines.length - 1];
            if (last !== undefined && ctx.measureText(last + " " + word).width <= W) noticeLines[noticeLines.length - 1] = last + " " + word;
            else noticeLines.push(word);
        });
        const details = [];
        if (v.email) details.push(["E", v.email]);
        if (v.phone) details.push(["T", v.phone]);
        if (web) details.push(["W", web]);
        const textH = 22 + 4 + 18 + 10 + details.length * 19;
        const topH = Math.max(100, textH);
        const H = PAD + topH + 14 + 3 + (c.parent ? 10 + 18 : 0) + 12 + noticeLines.length * 14 + PAD;
        canvas.width = (W + PAD * 2) * SCALE;
        canvas.height = H * SCALE;
        ctx.scale(SCALE, SCALE);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, W + PAD * 2, H);
        ctx.textBaseline = "middle";
        if (logo) ctx.drawImage(logo, PAD, PAD + (topH - 100) / 2, 200, 100);
        ctx.fillStyle = c.accent;
        ctx.fillRect(PAD + 220, PAD, 2, topH);
        const x = PAD + 242;
        let y = PAD + (topH - textH) / 2;
        font(17, true); ctx.fillStyle = "#1A1A1A"; ctx.fillText(v.name, x, y + 11); y += 22 + 4;
        font(12, true); ctx.fillStyle = c.accent; ctx.fillText(v.title, x, y + 9);
        const titleW = v.title ? ctx.measureText(v.title + "  ").width : 0;
        font(12, false); ctx.fillStyle = "#4A4A4A"; ctx.fillText(c.legal, x + titleW, y + 9); y += 18 + 10;
        details.forEach(function (d) {
            font(12, true); ctx.fillStyle = "#1A1A1A"; ctx.fillText(d[0], x, y + 9.5);
            const w = ctx.measureText(d[0] + "  ").width;
            font(12, false); ctx.fillStyle = "#4A4A4A"; ctx.fillText(d[1], x + w, y + 9.5);
            y += 19;
        });
        y = PAD + topH + 14;
        let sx = PAD;
        SIG_STRIPE.forEach(function (s) { const w = W * s[1] / 100; ctx.fillStyle = s[0]; ctx.fillRect(sx, y, w + 0.5, 3); sx += w; });
        y += 3;
        if (c.parent) {
            y += 10;
            font(11, false); ctx.fillStyle = "#1A1A1A"; ctx.fillText("A ", PAD, y + 9);
            let px = PAD + ctx.measureText("A ").width;
            font(11, true); ctx.fillText(c.parent, px, y + 9); px += ctx.measureText(c.parent + " ").width;
            font(11, false); ctx.fillText("company", px, y + 9);
            y += 18;
        }
        y += 12;
        font(10, false); ctx.fillStyle = "#9A9A9A";
        noticeLines.forEach(function (l) { ctx.fillText(l, PAD, y + 7); y += 14; });
        return new Promise(function (resolve) { canvas.toBlob(resolve, "image/png"); });
    }

    // The site's security policy blocks style attributes in page markup, so the preview is parsed
    // separately and each element's styles are applied through the DOM (which is allowed).
    function renderSignaturePreview(box, html) {
        // Our own markup, with attribute values escaped, so renaming style="…" is safe.
        box.innerHTML = html.replace(/ style="/g, ' data-sig-style="');
        box.querySelectorAll("[data-sig-style]").forEach(function (el) {
            el.style.cssText = el.getAttribute("data-sig-style");
            el.removeAttribute("data-sig-style");
        });
    }

    window.HNSignature = async function ({ me, api, toast }) {
        const root = document.createElement("div");
        const $ = (s) => root.querySelector(s);
        const $$ = (s, base = root) => Array.from(base.querySelectorAll(s));
        const manager = (me.permissions || []).includes("staff.manage");
        let people = [];
        if (manager) {
            try { people = (await api("/api/signature-people")).people; } catch (e) { people = []; }
        }
        const self = me;
        if (!people.some(p => p.id === me.id)) people.unshift(me);
        let person = me.system && people.length > 1 ? people[1] : self;

        root.innerHTML =
            '<div class="page-head"><div><h1>Email signature</h1><p class="muted">Your branded signature, built from your staff profile. Copy it straight into Gmail or Outlook.</p></div></div>' +
            '<div class="sig-layout">' +
            '<section class="card sig-form"><h2 class="panel-title">' + icon("edit") + "Details</h2>" +
            (manager ? '<label for="sig-person">Person</label><select id="sig-person">' + people.map(function (p) {
                return '<option value="' + p.id + '"' + (p.id === person.id ? " selected" : "") + ">" + esc(p.displayName) + (p.id === me.id ? " (you)" : "") + "</option>";
            }).join("") + "</select>" : "") +
            '<label for="sig-role">Company</label><select id="sig-role"></select>' +
            '<label for="sig-name">Name</label><input type="text" id="sig-name" maxlength="80">' +
            '<label for="sig-title">Job title</label><input type="text" id="sig-title" maxlength="100">' +
            '<label for="sig-email">Email</label><select id="sig-email"></select>' +
            '<div class="sig-contact"><div><label for="sig-phone">Phone <span class="muted small">(optional)</span></label><input type="tel" id="sig-phone" maxlength="40"></div>' +
            '<div><label for="sig-web">Website</label><input type="text" id="sig-web" maxlength="80"></div></div>' +
            '<p class="hint">Changes here only affect the signature, not the staff profile.</p>' +
            "</section>" +
            '<section class="sig-right">' +
            '<div class="card sig-preview-panel"><div class="panel-head"><h2 class="panel-title">' + icon("eye") + "Preview</h2>" +
            '<div class="btn-row"><button type="button" class="button secondary small" id="sig-download">' + icon("download") + "Download PNG</button>" +
            '<button type="button" class="button secondary small" id="sig-copy-code">' + icon("copy") + "Copy HTML</button>" +
            '<button type="button" class="button small" id="sig-copy">' + icon("copy") + "Copy signature</button></div></div>" +
            '<div class="sig-mail"><div class="sig-mail-bar"><span></span><span></span><span></span></div>' +
            '<div class="sig-mail-body"><p class="sig-mail-text">Kind regards,</p><div id="sig-preview"></div></div></div></div>' +
            '<div class="card sig-help"><h2 class="panel-title">' + icon("lifebuoy") + "Adding it to your email</h2>" +
            '<div class="segmented sig-tabs" role="tablist"><button type="button" data-help="gmail" class="active">Gmail</button><button type="button" data-help="outlook">Outlook</button><button type="button" data-help="apple">Apple Mail</button></div>' +
            '<ol class="sig-steps" data-steps="gmail"><li>Click <strong>Copy signature</strong> above.</li><li>In Gmail, open <strong>Settings</strong> (the cog) → <strong>See all settings</strong>.</li><li>Under <strong>Signature</strong>, click <strong>Create new</strong>, name it, and paste into the box.</li><li>Set it as the default for new emails and replies, then click <strong>Save changes</strong> at the bottom.</li></ol>' +
            '<ol class="sig-steps" data-steps="outlook" hidden><li>Click <strong>Copy signature</strong> above.</li><li>In Outlook, go to <strong>Settings</strong> → <strong>Mail</strong> (or <strong>Accounts</strong>) → <strong>Signatures</strong>.</li><li>Click <strong>New signature</strong>, name it, and paste into the box.</li><li>Choose it as the default for new messages and replies, then <strong>Save</strong>.</li></ol>' +
            '<ol class="sig-steps" data-steps="apple" hidden><li>Click <strong>Copy signature</strong> above.</li><li>In Mail, open <strong>Settings</strong> → <strong>Signatures</strong>, click <strong>+</strong> and paste.</li><li>Untick <strong>Always match my default message font</strong>.</li></ol>' +
            "</div></section></div>";

        const f = function (id) { return $("#" + id); };

        function rolesOf(p) {
            const list = [{ company: p.company, jobTitle: p.jobTitle }];
            (p.otherRoles || []).forEach(function (r) { list.push({ company: r.company, jobTitle: r.jobTitle || p.jobTitle }); });
            return list;
        }

        function pickEmail(p, company) {
            const domain = (SIGNATURE_COMPANIES[company] || {}).domain;
            const emails = p.emails || [];
            const match = domain && emails.find(function (e) { return e.address.toLowerCase().endsWith("@" + domain); });
            return (match || emails.find(function (e) { return e.primary; }) || emails[0] || {}).address || "";
        }

        function fillRole() {
            const role = rolesOf(person)[f("sig-role").selectedIndex] || rolesOf(person)[0];
            f("sig-title").value = role.jobTitle || "";
            const emails = person.emails || [];
            f("sig-email").innerHTML = emails.map(function (e) { return '<option value="' + esc(e.address) + '">' + esc(e.address) + "</option>"; }).join("") +
                '<option value="">No email</option>';
            f("sig-email").value = pickEmail(person, role.company);
            f("sig-web").value = (SIGNATURE_COMPANIES[role.company] || SIGNATURE_COMPANIES["HN Group"]).web;
        }

        function fillPerson() {
            const roles = rolesOf(person);
            f("sig-role").innerHTML = roles.map(function (r, i) {
                return '<option value="' + i + '">' + esc(r.company) + " — " + esc(r.jobTitle) + "</option>";
            }).join("");
            // Signatures use the full legal-style name, not the display name.
            f("sig-name").value = [person.firstName, person.lastName].filter(Boolean).join(" ").trim() || person.displayName || "";
            f("sig-phone").value = person.phone || "";
            fillRole();
        }

        function values() {
            const role = rolesOf(person)[f("sig-role").selectedIndex] || rolesOf(person)[0];
            return {
                company: role.company,
                name: f("sig-name").value.trim(),
                title: f("sig-title").value.trim(),
                email: f("sig-email").value,
                phone: f("sig-phone").value.trim(),
                website: f("sig-web").value.trim(),
            };
        }

        function draw() {
            renderSignaturePreview(f("sig-preview"), signatureHtml(values()));
        }

        fillPerson();
        draw();

        if (manager) f("sig-person").addEventListener("change", function (e) {
            person = people.find(function (p) { return p.id === e.target.value; });
            fillPerson();
            draw();
        });
        f("sig-role").addEventListener("change", function () { fillRole(); draw(); });
        $(".sig-form").addEventListener("input", draw);
        $(".sig-form").addEventListener("change", draw);

        f("sig-copy").addEventListener("click", async function () {
            const html = signatureHtml(values());
            try {
                await navigator.clipboard.write([new ClipboardItem({
                    "text/html": new Blob([html], { type: "text/html" }),
                    "text/plain": new Blob([f("sig-preview").innerText], { type: "text/plain" }),
                })]);
            } catch (e) {
                // Older browsers: copy the rendered preview as a selection.
                const range = document.createRange();
                range.selectNodeContents(f("sig-preview"));
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                document.execCommand("copy");
                sel.removeAllRanges();
            }
            toast("Signature copied. Paste it into your email signature settings.");
        });
        f("sig-copy-code").addEventListener("click", function () { copyText(signatureHtml(values())); });
        f("sig-download").addEventListener("click", async function () {
            const v = values();
            const png = await signaturePng(v);
            if (!png) { toast("The image couldn't be created. Try again."); return; }
            const a = document.createElement("a");
            a.href = URL.createObjectURL(png);
            a.download = (v.name || "signature").toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + v.company.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-signature.png";
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        });
        $(".sig-tabs").addEventListener("click", function (e) {
            const b = e.target.closest("[data-help]");
            if (!b) return;
            $$(".sig-tabs [data-help]").forEach(function (x) { x.classList.toggle("active", x === b); });
            $$("[data-steps]").forEach(function (o) { o.hidden = o.dataset.steps !== b.dataset.help; });
        });
        return [root];
    };


})();
