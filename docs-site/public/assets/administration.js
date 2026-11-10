(() => {
'use strict';
let readOnly = false, rootNode, generation = 0;
const state = { meta: { companies: [] } };
async function api(url, data) {
  if (!readOnly) url = url.replace('/api/administration/policies', '/api/administration/documents');
  const r = await fetch(url, { method: data === undefined ? 'GET' : 'POST', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const v = await r.json();
  if (r.status === 401) location.href = '/auth/login?next=' + encodeURIComponent(location.pathname + location.search);
  if (!r.ok) throw new Error(v.error || 'Please try again.');
  return v;
}
function toast(message) { const e = document.getElementById('toast'); e.textContent = message; e.hidden = false; setTimeout(() => { e.hidden = true; }, 3500); }
function initials(name) { return String(name || '?').split(/\s+/).slice(0, 2).map(s => s[0]).join(''); }
function avatar(p) { return '<span class="avatar">' + esc(initials(p.displayName)) + '</span>'; }
function closeMenus() { document.querySelectorAll('.docs-admin .menu').forEach(e => e.hidden = true); }
document.addEventListener('click', e => {
 const button = e.target.closest('.docs-admin [data-menu]');
 if (button) { const menu = button.nextElementSibling; const open = menu.hidden; closeMenus(); menu.hidden = !open; button.setAttribute('aria-expanded', String(open)); }
 else closeMenus();
});
async function render() {
  const currentGeneration = ++generation;
  const current = () => currentGeneration === generation;
  const root = document.createElement('div'); root.className = 'docs-admin'; rootNode.replaceChildren(root);
  const path = location.pathname;
  readOnly = path === '/policies';
  try {
    const tools = await api('/api/administration/tools');
    if (!current()) return;
    state.meta.companies = tools.companies;
    const allowed = path === '/administration/storage' ? tools.storage : path === '/administration/documents' ? tools.documents : tools.storage || tools.documents;
    if (!readOnly && !allowed) { root.innerHTML = '<h1>Access denied</h1><p>You do not have permission to use this administration tool.</p>'; return; }
    if (path === '/administration') {
      const toolCard = (href, glyph, title, description, action, colour) => '<a class="admin-tool-card ' + colour + '" href="' + href + '" data-link>' +
        '<span class="admin-tool-icon">' + icon(glyph) + '</span><div class="admin-tool-copy"><h2>' + title + '</h2><p>' + description + '</p></div>' +
        '<span class="admin-tool-action">' + action + icon('chevronRight') + '</span></a>';
      root.innerHTML = '<div class="admin-heading"><a class="admin-breadcrumb" href="/" data-link>' + icon('chevronLeft') + 'Back to Docs</a><div class="admin-heading-row"><span class="admin-heading-icon">' + icon('shield') + '</span><div><p class="eyebrow">HN Group Docs</p><h1>Administration</h1><p class="muted">Manage documents, policies and access to staff storage.</p></div></div></div>' +
        '<section class="admin-tool-section" aria-labelledby="admin-tools-title"><div class="admin-section-heading"><h2 id="admin-tools-title">Document management</h2><span class="admin-section-note">Tools available to you</span></div><div class="admin-tools">' +
        (tools.storage ? toolCard('/administration/storage', 'lock', 'Document storage', 'View staff storage and give or remove temporary access to private documents.', 'Manage storage', 'admin-tool-teal') : '') +
        (tools.documents ? toolCard('/administration/documents', 'file', 'Documents &amp; Policies', 'Upload policies, manage versions and audiences, and track staff acknowledgements.', 'Manage documents', 'admin-tool-purple') : '') +
        '</div></section><div class="admin-access-note">' + icon('shield') + '<p>Each tool follows your account permissions. Private storage access is recorded.</p></div>';

    } else {
      root.innerHTML = '<p>Loading…</p>';
      if (path === '/administration/storage') await viewDocumentStorage(root, current);
      else await viewDocuments(root, current);
      if (!readOnly && current()) { const a = document.createElement('a'); a.href = '/administration'; a.dataset.link = ''; a.textContent = '← Administration'; root.prepend(a); }
    }
  } catch (e) { if (current()) { root.replaceChildren(); const p = document.createElement('p'); p.textContent = e.message; root.append(p); } }
}
window.HNDocsAdministration = { render(root) { rootNode = root; return render(); }, close() { generation++; closeModal(); } };
    const ICONS = {
        home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
        users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
        bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
        calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
        clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        card: '<rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/>',
        lifebuoy: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.93 4.93 4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24"/>',
        user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
        chevron: '<path d="m6 9 6 6 6-6"/>',
        chevronLeft: '<path d="m15 18-6-6 6-6"/>',
        chevronRight: '<path d="m9 18 6-6-6-6"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
        more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
        mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="m22 6-10 7L2 6"/>',
        pin: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
        phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
        x: '<path d="M18 6 6 18M6 6l12 12"/>',
        copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
        menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
        monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
        camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
        edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
        trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
        key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
        ban: '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/>',
        check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
        upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
        download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
        pinned: '<path d="M12 17v5M9 10.76V4h6v6.76l3 4.24H6z"/><path d="M7 2h10"/>',
        eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
        alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>',
        palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.75 1.5-1.6 0-.42-.16-.8-.42-1.08-.26-.28-.41-.65-.41-1.07 0-.88.71-1.6 1.6-1.6H16c3.31 0 6-2.69 6-6 0-4.96-4.48-9-10-9z"/>',
        tick: '<path d="M20 6 9 17l-5-5"/>',
        chart: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
        smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
        book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
        help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
        message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
        gift: '<path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
        archive: '<path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>',
        refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
        thermometer: '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>',
        heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
        wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M16 14h.01"/>',
        pound: '<path d="M17 7.5A3.5 3.5 0 0 0 10 7v12"/><path d="M6 13h8M6 19h12"/>',
        printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
        flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
        star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
        chevronLeft: '<path d="m15 18-6-6 6-6"/>',
        chevronRight: '<path d="m9 18 6-6-6-6"/>',
        grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
        list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
        tree: '<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-2.5a1.5 1.5 0 0 1 1.5-1.5h11a1.5 1.5 0 0 1 1.5 1.5V17"/>',
        login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5M15 12H3"/>',
        power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><path d="M12 2v10"/>',
        activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
        building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    };

    function icon(name, cls) {
        return '<svg class="icon ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + "</svg>";
    }

    function esc(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    const $ = function (sel, root) { return (root || document).querySelector(sel); };
    const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

    let activeModal = null, modalFocus = null;

    function openModal(html, opts) {
        closeModal();
        opts = opts || {};
        modalFocus = document.activeElement;
        const backdrop = document.createElement("div");
        backdrop.className = "modal-backdrop";
        backdrop.innerHTML = '<div class="modal' + (opts.wide ? " modal-wide" : "") + (opts.cls ? " " + opts.cls : "") + '" role="dialog" aria-modal="true">' +
            '<button type="button" class="icon-btn modal-close" aria-label="Close" data-close>' + icon("x") + "</button>" + html + "</div>";
        $("#modal-root").appendChild(backdrop);
        document.body.classList.add("modal-open");

        const modal = { el: backdrop.firstChild, onClose: opts.onClose };
        backdrop.addEventListener("mousedown", function (e) { if (e.target === backdrop) closeModal(); });
        backdrop.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) closeModal(); });
        activeModal = modal;
        const heading = modal.el.querySelector(".modal-title");
        if (heading) { heading.id = "docs-admin-dialog-title"; modal.el.setAttribute("aria-labelledby", heading.id); }
        const focusable = modal.el.querySelector("input:not([type=hidden]):not([readonly]), select, textarea, .btn-primary");
        if (focusable) focusable.focus();
        return modal;
    }

    function closeModal() {
        if (!activeModal) return;
        const m = activeModal;
        activeModal = null;
        m.el.parentNode.remove();
        document.body.classList.remove("modal-open");
        if (modalFocus && modalFocus.isConnected) modalFocus.focus();
        if (m.onClose) m.onClose();
    }

    document.addEventListener("keydown", function (e) {
        if (e.key === 'Tab' && activeModal) {
            const controls = Array.from(activeModal.el.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]')).filter(e => !e.disabled && e.getClientRects().length);
            const first = controls[0], last = controls[controls.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        if (e.key === "Escape" && activeModal) {
            if ($(".menu:not([hidden])", activeModal.el)) return closeMenus();
            closeModal();
        }
    });

    function confirmDialog(opts) {
        return new Promise(function (resolve) {
            let answered = false;
            const m = openModal(
                '<h2 class="modal-title">' + esc(opts.title) + '</h2><p class="muted">' + esc(opts.message) + "</p>" +
                '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
                '<button type="button" class="btn ' + (opts.danger ? "btn-danger" : "btn-primary") + '" data-ok>' + esc(opts.confirmLabel || "Confirm") + "</button></div>",
                { onClose: function () { if (!answered) resolve(false); } }
            );
            $("[data-ok]", m.el).addEventListener("click", function () {
                answered = true;
                closeModal();
                resolve(true);
            });
        });
    }

    function formError(el, message) {
        el.textContent = message || "";
        el.hidden = !message;
    }

    function fmtDate(iso) {
        return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }

    function fmtDateTime(iso) {
        return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    function fileSize(bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
        return (bytes / 1024 / 1024).toFixed(1) + " MB";
    }

    // Escapes text, keeps line breaks and turns web addresses into links.
    function richText(text) {
        return esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g, "<br>");
    }

    function audienceChips(companies) {
        return companies.length
            ? companies.map(function (c) { return '<span class="chip">' + esc(c) + "</span>"; }).join("")
            : '<span class="chip chip-all">Everyone</span>';
    }

    // Audience picker used by the announcement and document forms. Nothing ticked = everyone.
    function audienceField(selected) {
        return '<label>Who can see this</label><div class="check-chips audience">' +
            state.meta.companies.map(function (c) {
                return '<label class="check-chip"><input type="checkbox" value="' + esc(c) + '"' + (selected.indexOf(c) !== -1 ? " checked" : "") + "><span>" + esc(c) + "</span></label>";
            }).join("") + '</div><p class="hint">Leave all unticked to share with everyone in HN Group.</p>';
    }

    function readAudience(el) {
        return $$(".audience input:checked", el).map(function (cb) { return cb.value; });
    }

    const FILE_KINDS = {
        pdf: "PDF", doc: "Word", docx: "Word", odt: "Doc", rtf: "Doc", txt: "Text", csv: "CSV",
        xls: "Excel", xlsx: "Excel", ods: "Sheet", ppt: "PowerPoint", pptx: "PowerPoint", odp: "Slides",
        png: "Image", jpg: "Image", jpeg: "Image",
    };
    const ACCEPT = ".pdf,.doc,.docx,.odt,.rtf,.txt,.csv,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.png,.jpg,.jpeg";

    function fileBadge(ext) {
        return '<span class="file-badge file-' + esc(ext) + '">' + esc((ext || "file").toUpperCase()) + "</span>";
    }

    async function viewDocuments(root, current) {
        const data = await api("/api/administration/policies");
        if (!current()) return;
        const docs = data.documents;
        let category = "";
        const pending = docs.filter(function (d) { return d.needsAck; });

        root.innerHTML =
            '<div class="page-head"><div><h1>Documents &amp; Policies</h1><p class="muted">Handbooks, policies, forms and templates for HN Group staff.</p></div>' +
            (data.canManage ? '<div class="page-actions"><button type="button" class="btn btn-primary" id="upload-doc">' + icon("upload") + "Upload document</button></div>" : "") +
            "</div>" +
            (pending.length ? '<div class="banner banner-warn"><div>' + icon("alert") + " <strong>" + pending.length +
                (pending.length === 1 ? " document needs" : " documents need") + " your acknowledgement.</strong> Please read " + (pending.length === 1 ? "it" : "them") + " and confirm.</div>" +
                '<button type="button" class="btn btn-small btn-dark" id="show-pending">Show me</button></div>' : "") +
            '<div class="company-tabs" id="admin-doc-cats">' +
            '<button type="button" data-cat="">All <span class="tab-count">' + docs.length + "</span></button>" +
            data.categories.map(function (c) {
                const n = docs.filter(function (d) { return d.category === c; }).length;
                return n || data.canManage ? '<button type="button" data-cat="' + esc(c) + '">' + esc(c) + ' <span class="tab-count">' + n + "</span></button>" : "";
            }).join("") +
            (pending.length ? '<button type="button" data-cat="__pending">To acknowledge <span class="tab-count">' + pending.length + "</span></button>" : "") +
            "</div>" +
            '<div class="toolbar"><label class="search">' + icon("search") + '<input type="search" id="admin-doc-search" placeholder="Search documents" aria-label="Search documents"></label></div>' +
            '<div id="admin-doc-list"></div>';

        function draw() {
            $$("#admin-doc-cats [data-cat]").forEach(function (b) { b.classList.toggle("active", b.dataset.cat === category); });
            const q = $("#admin-doc-search").value.trim().toLowerCase();
            const list = docs.filter(function (d) {
                if (category === "__pending" && !d.needsAck) return false;
                if (category && category !== "__pending" && d.category !== category) return false;
                return !q || [d.title, d.description, d.category, d.file.name].join(" ").toLowerCase().indexOf(q) !== -1;
            });
            $("#admin-doc-list").innerHTML = list.length ? '<div class="admin-doc-list">' + list.map(function (d) {
                const status = d.requiresAck
                    ? (d.acknowledgedAt
                        ? '<span class="badge badge-green">' + icon("tick") + "Acknowledged " + esc(fmtDate(d.acknowledgedAt)) + "</span>"
                        : d.needsAck ? '<button type="button" class="btn btn-small btn-primary" data-act="ack">Read &amp; acknowledge</button>' : "")
                    : "";
                const progress = data.canManage && d.requiresAck
                    ? '<button type="button" class="admin-ack-progress" data-act="acks" title="See who has acknowledged"><span class="admin-ack-bar"><span data-pct="' +
                        (d.audienceCount ? Math.round(d.ackCount / d.audienceCount * 100) : 0) + '"></span></span>' + d.ackCount + "/" + d.audienceCount + " acknowledged</button>"
                    : "";
                return '<div class="admin-doc-row' + (d.needsAck ? " needs-ack" : "") + '" data-id="' + d.id + '">' +
                    fileBadge(d.file.ext) +
                    '<div class="admin-doc-main"><div class="admin-doc-title">' + esc(d.title) + (d.requiresAck ? ' <span class="badge">Must read</span>' : "") + "</div>" +
                    (d.description ? '<div class="admin-doc-desc muted small">' + esc(d.description) + "</div>" : "") +
                    '<div class="admin-doc-meta muted small">' + esc(d.category) + " · " + esc(FILE_KINDS[d.file.ext] || d.file.ext) + " · " + fileSize(d.file.size) +
                    " · Updated " + esc(fmtDate(d.updatedAt)) + (d.version > 1 ? ' · <button type="button" class="link-btn" data-act="versions">Version ' + d.version + " \u00b7 history</button>" : "") + "</div>" +
                    '<div class="chips">' + audienceChips(d.companies) + "</div></div>" +
                    '<div class="admin-doc-side">' + status + progress +
                    '<div class="btn-row">' +
                    (d.file.inline ? '<a class="btn btn-ghost btn-small" href="/api/administration/policies/' + d.id + '/file" target="_blank" rel="noopener">' + icon("eye") + "View</a>" : "") +
                    '<a class="btn btn-ghost btn-small" href="/api/administration/policies/' + d.id + '/file?download=1">' + icon("download") + "Download</a>" +
                    (data.canManage ? '<div class="nav-item row-menu"><button type="button" class="icon-btn" data-menu aria-haspopup="true" aria-expanded="false" aria-label="Document options">' + icon("more") + "</button>" +
                        '<div class="menu menu-right menu-row" role="menu" hidden>' +
                        '<button type="button" class="menu-item compact" data-act="edit">' + icon("edit") + "<span>Edit details</span></button>" +
                        '<button type="button" class="menu-item compact" data-act="replace">' + icon("upload") + "<span>Upload new version</span></button>" +
                        (d.requiresAck ? '<button type="button" class="menu-item compact" data-act="acks">' + icon("users") + "<span>Who has acknowledged</span></button>" : "") +
                        '<div class="menu-sep"></div><button type="button" class="menu-item compact danger" data-act="delete">' + icon("trash") + "<span>Delete</span></button></div></div>" : "") +
                    "</div></div></div>";
            }).join("") + "</div>"
                : '<div class="empty-page">' + icon("file", "big") + "<h2>" + (docs.length ? "No matching documents" : "No documents yet") + "</h2>" +
                  '<p class="muted">' + (docs.length ? "Try a different search or category." : data.canManage ? "Upload the first one with <strong>Upload document</strong>." : "Check back soon.") + "</p></div>";
            $$(".admin-ack-bar [data-pct]").forEach(function (b) { b.style.width = b.dataset.pct + "%"; });
        }

        root.addEventListener("click", async function (e) {
            const cat = e.target.closest("[data-cat]");
            if (cat) { category = cat.dataset.cat; return draw(); }
            if (e.target.closest("#show-pending")) { category = "__pending"; return draw(); }
            if (e.target.closest("#upload-doc")) return openDocumentForm(null, data.categories);
            const btn = e.target.closest("[data-act]");
            if (!btn) return;
            closeMenus();
            const d = docs.find(function (x) { return x.id === btn.closest("[data-id]").dataset.id; });
            const act = btn.dataset.act;
            if (act === "ack") return openAcknowledge(d);
            if (act === "edit") return openDocumentForm(d, data.categories);
            if (act === "replace") return openReplaceFile(d);
            if (act === "acks") return openAcknowledgements(d);
            if (act === "versions") return openVersions(d);
            if (act === "delete") {
                if (!(await confirmDialog({ title: "Delete “" + d.title + "”?", message: "The document and its acknowledgements will be removed for everyone.", confirmLabel: "Delete", danger: true }))) return;
                try {
                    await api("/api/administration/policies/" + d.id + "/delete", {});
                    toast("Document deleted.");
                    render();
                } catch (err) { toast(err.message); }
            }
        });
        $("#admin-doc-search").addEventListener("input", draw);
        if (state.pendingDocSearch) {
            $("#admin-doc-search").value = state.pendingDocSearch;
            state.pendingDocSearch = null;
        }
        draw();
    }

    // Sends a file as the raw request body, with progress.
    function uploadFile(url, file, meta, onProgress) {
        return new Promise(function (resolve, reject) {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", url.replace("/policies", "/documents"));
            xhr.setRequestHeader("Content-Type", "application/octet-stream");
            xhr.setRequestHeader("X-Document", encodeURIComponent(JSON.stringify(Object.assign({ fileName: file.name }, meta))));
            xhr.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
            xhr.onload = function () {
                let body = {};
                try { body = JSON.parse(xhr.responseText); } catch (e) { /* ignore */ }
                if (xhr.status === 401) { window.location.href = "/auth/login"; return; }
                if (xhr.status >= 200 && xhr.status < 300) resolve(body);
                else reject(new Error(body.error || "Upload failed. Please try again."));
            };
            xhr.onerror = function () { reject(new Error("Upload failed. Check your connection and try again.")); };
            xhr.send(file);
        });
    }

    function fileDropField(id) {
        return '<label class="drop-zone" for="' + id + '">' + icon("upload") +
            '<span class="dz-text"><strong>Choose a file</strong> or drag it here</span>' +
            '<span class="muted small dz-hint">PDF, Word, Excel, PowerPoint, text, CSV or image · up to 20 MB</span>' +
            '<input type="file" id="' + id + '" accept="' + ACCEPT + '" hidden></label>' +
            '<div class="upload-progress" hidden><span></span></div>';
    }

    function wireDropZone(el, input, onFile) {
        const zone = $(".drop-zone", el);
        ["dragenter", "dragover"].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.add("dragging"); }); });
        ["dragleave", "drop"].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.remove("dragging"); }); });
        zone.addEventListener("drop", function (e) { if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });
        input.addEventListener("change", function () { if (input.files[0]) onFile(input.files[0]); });
    }

    function showProgress(el, pct) {
        const bar = $(".upload-progress", el);
        bar.hidden = false;
        $("span", bar).style.width = pct + "%";
    }

    function openDocumentForm(d, categories) {
        const v = d || { title: "", description: "", category: "Policies", companies: [], requiresAck: false };
        let file = null;
        const m = openModal(
            '<h2 class="modal-title">' + (d ? "Edit document" : "Upload document") + "</h2>" +
            '<form novalidate id="admin-doc-form">' +
            (d ? "" : fileDropField("admin-doc-file")) +
            '<label for="admin-doc-title">Title</label><input type="text" id="admin-doc-title" maxlength="150" value="' + esc(v.title) + '">' +
            '<label for="admin-doc-desc">Description <span class="muted small">(optional)</span></label><textarea id="admin-doc-desc" rows="3" maxlength="1000">' + esc(v.description) + "</textarea>" +
            '<label for="admin-doc-cat">Category</label><select id="admin-doc-cat">' + categories.map(function (c) {
                return '<option' + (c === v.category ? " selected" : "") + ">" + esc(c) + "</option>";
            }).join("") + "</select>" +
            audienceField(v.companies) +
            '<label class="inline-check option-row"><input type="checkbox" id="admin-doc-ack"' + (v.requiresAck ? " checked" : "") +
            "> Staff must read and acknowledge this</label>" +
            '<p class="hint">They\'ll see it on their home page until they confirm they\'ve read it. Uploading a new version asks everyone again.</p>' +
            '<div class="form-error" id="admin-doc-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
            '<button type="submit" class="btn btn-primary" id="admin-doc-save">' + (d ? "Save changes" : "Upload") + "</button></div></form>",
            { wide: true }
        );
        if (!d) {
            wireDropZone(m.el, $("#admin-doc-file", m.el), function (f) {
                file = f;
                $(".dz-text", m.el).innerHTML = "<strong>" + esc(f.name) + "</strong> · " + fileSize(f.size);
                if (!$("#admin-doc-title", m.el).value.trim()) $("#admin-doc-title", m.el).value = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
            });
        }
        $("#admin-doc-form", m.el).addEventListener("submit", async function (e) {
            e.preventDefault();
            formError($("#admin-doc-error", m.el), "");
            const meta = {
                title: $("#admin-doc-title", m.el).value,
                description: $("#admin-doc-desc", m.el).value,
                category: $("#admin-doc-cat", m.el).value,
                companies: readAudience(m.el),
                requiresAck: $("#admin-doc-ack", m.el).checked,
            };
            if (!d && !file) return formError($("#admin-doc-error", m.el), "Choose a file to upload.");
            if (!meta.title.trim()) return formError($("#admin-doc-error", m.el), "Give the document a title.");
            $("#admin-doc-save", m.el).disabled = true;
            try {
                if (d) await api("/api/administration/policies/" + d.id, meta);
                else await uploadFile("/api/administration/policies/upload", file, meta, function (pct) { showProgress(m.el, pct); });
                closeModal();
                toast(d ? "Document updated." : "Document uploaded.");
                render();
            } catch (err) {
                formError($("#admin-doc-error", m.el), err.message);
                $("#admin-doc-save", m.el).disabled = false;
            }
        });
    }

    async function openVersions(d) {
        let r;
        try { r = await api("/api/administration/policies/" + d.id + "/versions"); } catch (err) { return toast(err.message); }
        openModal(
            '<h2 class="modal-title">Version history</h2><p class="muted">' + esc(r.title) + "</p>" +
            '<ol class="version-list">' + r.versions.map(function (v) {
                return '<li class="' + (v.current ? "current" : "") + '"><div class="vl-head"><strong>Version ' + v.version + "</strong>" + (v.current ? ' <span class="badge badge-green">Current</span>' : "") +
                    '<span class="muted small">' + esc(fmtDate(v.uploadedAt)) + (v.uploadedByName ? " \u00b7 " + esc(v.uploadedByName) : "") + (v.replacedAt ? " \u00b7 replaced " + esc(fmtDate(v.replacedAt)) : "") + "</span>" +
                    (v.current ? '<a class="btn btn-ghost btn-small" href="/api/administration/policies/' + d.id + '/file?download=1">' + icon("download") + "</a>" : '<a class="btn btn-ghost btn-small" href="/api/administration/policies/' + d.id + "/versions/" + v.version + '/file">' + icon("download") + "</a>") + "</div>" +
                    (v.note ? '<p class="vl-note">' + esc(v.note) + "</p>" : "") +
                    '<div class="muted small">' + esc(v.file.name) + " \u00b7 " + fileSize(v.file.size) + (d.requiresAck ? " \u00b7 acknowledged by " + v.ackCount + (v.acknowledgedByMe ? " (including you)" : "") : "") + "</div>" +
                    (v.acks && v.acks.length ? '<details class="vl-acks"><summary>Who acknowledged version ' + v.version + "</summary><ul>" + v.acks.map(function (a) { return "<li>" + esc(a.name) + ' <span class="muted small">' + esc(fmtDateTime(a.at)) + "</span></li>"; }).join("") + "</ul></details>" : "") +
                    "</li>";
            }).join("") + "</ol>" +
            '<div class="modal-actions"><button type="button" class="btn btn-primary" data-close>Done</button></div>'
        );
    }

    function openReplaceFile(d) {
        let file = null;
        const m = openModal(
            '<h2 class="modal-title">Upload a new version</h2>' +
            '<p class="muted">Replaces the file for “' + esc(d.title) + "” (currently " + esc(d.file.name) + ")." +
            (d.requiresAck ? " Everyone will be asked to acknowledge the new version." : "") + "</p>" +
            fileDropField("admin-rep-file") +
            '<label for="admin-rep-note">What\u2019s changed? <span class="muted small">(shown in the version history)</span></label><input type="text" id="admin-rep-note" maxlength="300" placeholder="e.g. Updated the holiday section for 2027">' +
            '<div class="form-error" id="admin-rep-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
            '<button type="button" class="btn btn-primary" id="admin-rep-save">Upload new version</button></div>'
        );
        wireDropZone(m.el, $("#admin-rep-file", m.el), function (f) {
            file = f;
            $(".dz-text", m.el).innerHTML = "<strong>" + esc(f.name) + "</strong> · " + fileSize(f.size);
        });
        $("#admin-rep-save", m.el).addEventListener("click", async function () {
            if (!file) return formError($("#admin-rep-error", m.el), "Choose a file to upload.");
            $("#admin-rep-save", m.el).disabled = true;
            try {
                await uploadFile("/api/administration/policies/" + d.id + "/file", file, { note: $("#admin-rep-note", m.el).value }, function (pct) { showProgress(m.el, pct); });
                closeModal();
                toast("New version uploaded.");
                render();
            } catch (err) {
                formError($("#admin-rep-error", m.el), err.message);
                $("#admin-rep-save", m.el).disabled = false;
            }
        });
    }

    function openAcknowledge(d) {
        const m = openModal(
            '<div class="success-mark">' + icon("file") + "</div>" +
            '<h2 class="modal-title center">' + esc(d.title) + "</h2>" +
            '<p class="muted center">Please read this document in full, then confirm below.</p>' +
            '<div class="center btn-row admin-ack-open">' +
            (d.file.inline ? '<a class="btn btn-ghost" href="/api/administration/policies/' + d.id + '/file" target="_blank" rel="noopener">' + icon("eye") + "Open document</a>" : "") +
            '<a class="btn btn-ghost" href="/api/administration/policies/' + d.id + '/file?download=1">' + icon("download") + "Download</a></div>" +
            '<label class="inline-check admin-ack-confirm"><input type="checkbox" id="admin-ack-check"> I have read and understood this document.</label>' +
            '<div class="form-error" id="admin-ack-error" hidden></div>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Not yet</button>' +
            '<button type="button" class="btn btn-primary" id="admin-ack-go" disabled>Acknowledge</button></div>'
        );
        $("#admin-ack-check", m.el).addEventListener("change", function (e) { $("#admin-ack-go", m.el).disabled = !e.target.checked; });
        $("#admin-ack-go", m.el).addEventListener("click", async function () {
            try {
                const r = await api("/api/administration/policies/" + d.id + "/acknowledge", {});

                closeModal();
                toast("Thanks — acknowledgement recorded.");
                render();
            } catch (err) { formError($("#admin-ack-error", m.el), err.message); }
        });
    }

    async function openAcknowledgements(d) {
        const data = await api("/api/administration/policies/" + d.id + "/acknowledgements");
        const done = data.people.filter(function (p) { return p.acknowledgedAt; });
        const waiting = data.people.filter(function (p) { return !p.acknowledgedAt; });
        const row = function (p) {
            return '<li class="admin-ack-row">' + avatar(p, "sm") + '<div class="admin-ack-who"><div class="emp-name">' + esc(p.displayName) + '</div><div class="muted small">' + esc(p.jobTitle) + "</div></div>" +
                (p.acknowledgedAt ? '<span class="badge badge-green">' + esc(fmtDate(p.acknowledgedAt)) + "</span>" : '<span class="badge badge-yellow">Not yet</span>') + "</li>";
        };
        openModal(
            '<h2 class="modal-title">Who has acknowledged</h2>' +
            '<p class="muted">' + esc(d.title) + (data.version > 1 ? " · version " + data.version : "") + " · " + done.length + " of " + data.people.length + " people</p>" +
            (waiting.length ? '<h3 class="detail-head">Still to acknowledge (' + waiting.length + ")</h3><ul class=\"admin-ack-list\">" + waiting.map(row).join("") + "</ul>" : "") +
            (done.length ? '<h3 class="detail-head">Acknowledged (' + done.length + ")</h3><ul class=\"admin-ack-list\">" + done.map(row).join("") + "</ul>" : "") +
            (data.people.length ? "" : '<p class="muted">No staff are in this document\'s audience yet.</p>') +
            '<div class="modal-actions"><button type="button" class="btn btn-primary" data-close>Done</button></div>'
        );
    }

    async function viewDocumentStorage(root, current) {
        let d = await api("/api/administration/document-storage");
        if (!current()) return;
        const DOCS = "https://docs.hngroup.org.uk";
        const day = function (iso) { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)); };
        const inDays = function (n) { const t = new Date(Date.now() + n * 86400000); return t.toISOString().slice(0, 10); };
        let viewing = new URLSearchParams(window.location.search).get("view"), viewData = null, viewError = "";
        const size = function (b) { return b < 1024 ? b + " bytes" : b < 1048576 ? Math.round(b / 1024) + " KB" : (b / 1048576).toFixed(1) + " MB"; };
        // Someone's storage, shown here: their private documents (download as PDF) and files. View only; Docs records it.
        function viewer() {
            if (!viewing) return "";
            if (!viewData) return '<section class="panel" id="admin-ds-viewer"><p class="muted">' + (viewError ? esc(viewError) : "Opening their storage…") + '</p><button type="button" class="btn btn-ghost btn-small" data-close-view>Close</button></section>';
            const base = "/api/administration/document-storage/people/" + encodeURIComponent(viewing);
            const p = viewData.person, docs = viewData.documents, files = viewData.files;
            return '<section class="panel" id="admin-ds-viewer"><div class="panel-head"><div><h2 class="panel-title">' + esc(p.name) + "’s storage</h2>" +
                '<p class="muted small">' + (p.jobTitle ? esc(p.jobTitle) + " · " : "") + "View only. Opening and downloading are recorded on HN Group Docs.</p></div>" +
                '<div class="admin-ds-view-actions"><a class="btn btn-ghost btn-small" href="' + DOCS + "/storage/" + encodeURIComponent(viewing) + '" target="_blank" rel="noopener">Open in HN Group Docs ↗</a><button type="button" class="btn btn-ghost btn-small" data-close-view>Close</button></div></div>' +
                '<h3 class="detail-head">Documents</h3>' +
                (docs.length ? '<div class="table-card flat"><table class="table"><thead><tr><th>Title</th><th>Status</th><th>Last edited</th><th class="col-actions"></th></tr></thead><tbody>' +
                    docs.map(function (x) { return "<tr><td>" + esc(x.title) + (x.confidential ? ' <span class="badge badge-red">Confidential</span>' : "") + "</td><td>" + (x.status === "final" ? "Final" : "Draft") + "</td><td>" + esc(fmtDateTime(new Date(x.updatedAt).toISOString())) + '</td><td class="col-actions"><a class="btn btn-ghost btn-small" href="' + base + "/documents/" + x.id + '/pdf">Download PDF</a></td></tr>'; }).join("") + "</tbody></table></div>"
                    : '<p class="muted">No private documents.</p>') +
                '<h3 class="detail-head">Files</h3>' +
                (files.length ? '<div class="table-card flat"><table class="table"><thead><tr><th>Name</th><th>Size</th><th>Added</th><th class="col-actions"></th></tr></thead><tbody>' +
                    files.map(function (f) { return "<tr><td>" + esc(f.name) + "</td><td>" + esc(size(f.size)) + "</td><td>" + esc(fmtDateTime(new Date(f.createdAt).toISOString())) + '</td><td class="col-actions"><a class="btn btn-ghost btn-small" href="' + base + "/files/" + f.id + '" target="_blank" rel="noopener">Open</a> <a class="btn btn-ghost btn-small" href="' + base + "/files/" + f.id + '?download=1">Download</a></td></tr>'; }).join("") + "</tbody></table></div>"
                    : '<p class="muted">No files.</p>') + "</section>";
        }
        async function openView(id) {
            viewing = id; viewData = null; viewError = "";
            history.replaceState({}, "", "/administration/storage?view=" + encodeURIComponent(id));
            draw(); if ($("#admin-ds-viewer")) $("#admin-ds-viewer").scrollIntoView({ behavior: "smooth", block: "start" });
            try { viewData = await api("/api/administration/document-storage/people/" + encodeURIComponent(id)); } catch (err) { viewError = err.message; }
            if (current() && viewing === id) draw();
        }
        function draw() {
            const mine = '<section class="panel"><h2 class="panel-title">Storage you can open</h2>' +
                (d.myGrants.length ? '<div class="table-card flat"><table class="table"><thead><tr><th>Whose storage</th><th>Until</th><th class="col-actions"></th></tr></thead><tbody>' +
                    d.myGrants.map(function (g) { return "<tr><td>" + esc(g.name) + "</td><td>" + esc(day(g.until)) + '</td><td class="col-actions"><button type="button" class="btn btn-ghost btn-small" data-view="' + esc(g.personId) + '">View documents</button></td></tr>'; }).join("") + "</tbody></table></div>"
                    : '<p class="muted">' + (d.manage ? "You can open anyone’s storage from the list below." : "Nobody has given you access to anyone else’s storage. Your own storage is at " + '<a href="' + DOCS + '/storage" target="_blank" rel="noopener">docs.hngroup.org.uk</a>.') + "</p>") + "</section>";
            if (!d.manage) { root.innerHTML = head + viewer() + mine; return; }
            const options = function (sel) { return '<option value="">Choose…</option>' + d.people.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === sel ? " selected" : "") + ">" + esc(p.displayName) + (p.jobTitle ? " – " + esc(p.jobTitle) : "") + "</option>"; }).join(""); };
            root.innerHTML = head + viewer() + (d.myGrants.length ? mine : "") +
                '<section class="panel"><div class="panel-head"><h2 class="panel-title">Everyone’s storage</h2><label class="search">' + icon("search") + '<input type="search" id="admin-ds-search" placeholder="Search staff"></label></div>' +
                '<p class="muted small">Opening someone’s storage shows their private documents and files, view only. Every visit is recorded.</p>' +
                '<div class="table-card flat"><table class="table"><thead><tr><th>Name</th><th>Job title</th><th>Company</th><th class="col-actions"></th></tr></thead><tbody id="admin-ds-people"></tbody></table></div></section>' +
                '<section class="panel" id="admin-ds-give"><h2 class="panel-title">Give someone access to one person’s storage</h2>' +
                '<p class="muted small">For temporary access, for example while someone covers for a colleague. It ends by itself on the date you choose, or remove it below.</p>' +
                '<form id="admin-ds-form" class="grid-2">' +
                '<div><label for="admin-ds-grantee">Who gets access</label><select id="admin-ds-grantee" required>' + options("") + "</select></div>" +
                '<div><label for="admin-ds-owner">Whose storage they can open</label><select id="admin-ds-owner" required>' + options(state.dsOwner || "") + "</select></div>" +
                '<div><label for="admin-ds-until">Until the end of</label><input type="date" id="admin-ds-until" required min="' + inDays(0) + '" max="' + inDays(365) + '" value="' + inDays(7) + '"></div>' +
                '<div><label for="admin-ds-reason">Reason <span class="muted small">(optional)</span></label><input type="text" id="admin-ds-reason" maxlength="300" placeholder="e.g. Covering while they’re on leave"></div>' +
                '<div class="form-actions"><button type="submit" class="btn btn-primary">' + icon("lock") + "Give access</button></div></form>" +
                '<h3 class="detail-head">Access given</h3>' +
                (d.grants.length ? '<div class="table-card flat"><table class="table"><thead><tr><th>Who</th><th>Can open</th><th>Until</th><th>Given by</th><th class="col-actions"></th></tr></thead><tbody>' +
                    d.grants.map(function (g) {
                        return "<tr><td>" + esc(g.granteeName) + "</td><td>" + esc(g.ownerName) + "’s storage" + (g.reason ? '<div class="muted small">' + esc(g.reason) + "</div>" : "") + "</td><td>" + esc(day(g.until)) + (g.active ? "" : ' <span class="badge">Ended</span>') + "</td><td>" + esc(g.grantedByName) + '</td><td class="col-actions"><button type="button" class="btn btn-ghost btn-small" data-remove="' + esc(g.id) + '">Remove</button></td></tr>';
                    }).join("") + "</tbody></table></div>" : '<p class="muted">Nobody has been given individual access.</p>') + "</section>";
            drawPeople();
        }
        const head = '<div class="page-head"><div><h1>Document storage</h1><p class="muted">Everyone has private storage on <a href="' + DOCS + '" target="_blank" rel="noopener">HN Group Docs</a> that nobody else can open, except people with the “Access staff document storage” permission and anyone given access below.</p></div></div>';
        function drawPeople() {
            const q = ($("#admin-ds-search") ? $("#admin-ds-search").value : "").trim().toLowerCase();
            const list = d.people.filter(function (p) { return !q || [p.displayName, p.jobTitle, p.company].join(" ").toLowerCase().indexOf(q) !== -1; });
            $("#admin-ds-people").innerHTML = list.map(function (p) {
                return "<tr><td>" + esc(p.displayName) + "</td><td>" + esc(p.jobTitle) + "</td><td>" + esc(p.company) + '</td><td class="col-actions"><button type="button" class="btn btn-ghost btn-small" data-view="' + esc(p.id) + '">View documents</button> <button type="button" class="btn btn-ghost btn-small" data-give="' + esc(p.id) + '">Give access…</button></td></tr>';
            }).join("") || '<tr><td colspan="4" class="muted">Nobody matches.</td></tr>';
        }
        async function reload() { d = await api("/api/administration/document-storage"); if (current()) draw(); }
        root.addEventListener("input", function (ev) { if (ev.target.id === "admin-ds-search") drawPeople(); });
        root.addEventListener("click", async function (ev) {
            const view = ev.target.closest("[data-view]");
            if (view) return openView(view.dataset.view);
            if (ev.target.closest("[data-close-view]")) { viewing = null; viewData = null; history.replaceState({}, "", "/administration/storage"); return draw(); }
            const give = ev.target.closest("[data-give]");
            if (give) { $("#admin-ds-owner").value = give.dataset.give; $("#admin-ds-give").scrollIntoView({ behavior: "smooth", block: "start" }); $("#admin-ds-grantee").focus(); return; }
            const rm = ev.target.closest("[data-remove]");
            if (rm && await confirmDialog({ title: "Remove this access?", message: "They won’t be able to open that storage any more (within a minute).", confirmLabel: "Remove", danger: true })) {
                try { await api("/api/administration/document-storage/grants/" + rm.dataset.remove + "/delete", {}); toast("Access removed."); reload(); } catch (err) { toast(err.message); }
            }
        });
        root.addEventListener("submit", async function (ev) {
            if (ev.target.id !== "admin-ds-form") return;
            ev.preventDefault();
            const until = $("#admin-ds-until").value;
            try {
                await api("/api/administration/document-storage/grants", { granteeId: $("#admin-ds-grantee").value, ownerId: $("#admin-ds-owner").value, until: until ? until + "T23:59:59" : "", reason: $("#admin-ds-reason").value });
                toast("Access given.");
                reload();
            } catch (err) { toast(err.message); }
        });
        if (viewing) openView(viewing); else draw();
    }


})();
