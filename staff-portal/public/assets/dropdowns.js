/* Shared Staff Portal dropdowns. The original select remains the form control:
   values, labels, validation, disabled fields and existing change handlers stay native. */
(function () {
    'use strict';
    let active = null, serial = 0;
    const eligible = el => el instanceof HTMLSelectElement && !el.multiple && el.size <= 1;
    const enabled = option => !option.disabled && !option.hidden && !option.parentElement.disabled && !option.parentElement.hidden;
    const normal = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
    function label(select) {
        return select.getAttribute('aria-label') || (select.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() || Array.from(select.labels || []).map(l => l.textContent).join(' ').trim() || 'Choose an option';
    }
    function close(focus) {
        const state = active;
        if (!state) return;
        active = null;
        state.observer.disconnect(); state.treeObserver.disconnect(); clearInterval(state.timer);
        state.select.removeAttribute('data-dropdown-open');
        state.select.setAttribute('aria-expanded', 'false');
        state.select.removeAttribute('aria-controls'); state.select.removeAttribute('aria-activedescendant');
        if (typeof state.popup.hidePopover === 'function' && state.popup.matches(':popover-open')) state.popup.hidePopover();
        state.popup.remove();
        if (focus && state.select.isConnected) state.select.focus({ preventScroll: true });
    }
    function position() {
        const s = active; if (!s) return;
        if (!s.select.isConnected || s.select.matches(':disabled') || !s.select.getClientRects().length) return close(false);
        const r = s.select.getBoundingClientRect(), viewport = window.visualViewport;
        const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
        const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
        const below = top + height - r.bottom - 12, above = r.top - top - 12;
        const up = below < 220 && above > below;
        s.popup.style.width = Math.min(Math.max(r.width, 260), width - 24) + 'px';
        s.popup.style.maxHeight = Math.max(80, Math.min(390, up ? above : below)) + 'px';
        s.popup.style.left = Math.max(left + 12, Math.min(r.left, left + width - s.popup.offsetWidth - 12)) + 'px';
        s.popup.style.top = (up ? Math.max(top + 8, r.top - s.popup.offsetHeight - 7) : r.bottom + 7) + 'px';
        s.popup.dataset.direction = up ? 'up' : 'down';
    }
    function highlight(index, scroll) {
        const s = active; if (!s) return;
        s.highlight = index;
        for (const row of s.list.querySelectorAll('[role="option"]')) row.classList.toggle('is-active', Number(row.dataset.index) === index);
        const row = s.list.querySelector('[data-index="' + index + '"]');
        for (const control of [s.select, s.search]) {
            if (row) control.setAttribute('aria-activedescendant', row.id); else control.removeAttribute('aria-activedescendant');
        }
        if (scroll && row) row.scrollIntoView({ block: 'nearest' });
    }
    function render() {
        const s = active; if (!s) return;
        if (!eligible(s.select) || s.select.matches(':disabled') || !s.select.isConnected) return close(false);
        s.search.hidden = s.select.options.length < 10 && !s.search.value;
        const query = normal(s.search.value.trim()), previous = s.highlight;
        s.list.replaceChildren(); s.visible = []; let group = null;
        s.selectOptions = Array.from(s.select.options);
        s.selectOptions.forEach((option, index) => {
            if (option.hidden || option.parentElement.hidden || (query && !normal(option.textContent).includes(query))) return;
            const parent = option.parentElement;
            if (parent.tagName === 'OPTGROUP' && group !== parent) {
                const heading = document.createElement('div'); heading.className = 'hn-dropdown-group'; heading.textContent = parent.label;
                s.list.append(heading); group = parent;
            }
            const row = document.createElement('div'); row.className = 'hn-dropdown-option'; row.id = s.id + '-' + index;
            row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(option.selected)); row.setAttribute('aria-disabled', String(!enabled(option)));
            row.dataset.index = index;
            const text = document.createElement('span'); text.textContent = option.textContent || '—'; row.append(text);
            const check = document.createElement('span'); check.className = 'hn-dropdown-check'; check.setAttribute('aria-hidden', 'true'); row.append(check);
            if (enabled(option)) s.visible.push(index);
            s.list.append(row);
        });
        if (!s.list.childElementCount) { const empty = document.createElement('p'); empty.className = 'hn-dropdown-empty'; empty.textContent = 'No matching options'; empty.setAttribute('role', 'status'); s.list.append(empty); }
        const selected = s.select.selectedIndex;
        highlight(s.visible.includes(previous) ? previous : s.visible.includes(selected) ? selected : s.visible[0] ?? -1, false);
        s.selected = selected; position();
    }
    function choose(index) {
        const s = active, option = s?.select.options[index];
        if (!option || !enabled(option) || s.select.matches(':disabled')) return;
        const select = s.select, changed = select.selectedIndex !== index;
        select.selectedIndex = index; close(true);
        if (changed) { select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    function open(select, searchFocus) {
        if (!eligible(select) || select.matches(':disabled')) return;
        close(false); select.focus({ preventScroll: true });
        const popup = document.createElement('div'), search = document.createElement('input'), list = document.createElement('div'), id = 'hn-dropdown-' + (++serial);
        popup.className = 'hn-dropdown'; popup.id = id; popup.setAttribute('popover', 'manual'); popup.dataset.open = '';
        list.className = 'hn-dropdown-options'; list.id = id + '-options'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', label(select));
        search.type = 'search'; search.className = 'hn-dropdown-search'; search.placeholder = 'Search options…'; search.autocomplete = 'off'; search.setAttribute('aria-label', 'Search ' + label(select)); search.setAttribute('role', 'combobox'); search.setAttribute('aria-autocomplete', 'list'); search.setAttribute('aria-expanded', 'true'); search.setAttribute('aria-controls', list.id);
        search.hidden = select.options.length < 10;
        popup.append(search, list);
        (select.closest('dialog[open]') || document.body).append(popup);
        const state = { select, popup, search, list, id, highlight: select.selectedIndex, visible: [], buffer: '', typedAt: 0 };
        active = state;
        select.dataset.dropdownOpen = ''; select.setAttribute('aria-expanded', 'true'); select.setAttribute('aria-controls', list.id);
        if (typeof popup.showPopover === 'function') popup.showPopover();
        state.observer = new MutationObserver(render); state.observer.observe(select, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'label', 'selected', 'value', 'multiple', 'size'] });
        state.treeObserver = new MutationObserver(() => { if (!select.isConnected) close(false); }); state.treeObserver.observe(document.body, { childList: true, subtree: true });
        state.timer = setInterval(() => { if (!select.isConnected || select.matches(':disabled')) close(false); else if (select.selectedIndex !== state.selected) render(); }, 150);
        search.addEventListener('input', render);
        popup.addEventListener('pointerdown', event => { if (event.target.closest('[role="option"]')) event.preventDefault(); });
        popup.addEventListener('pointermove', event => { const row = event.target.closest('[role="option"]'); if (row && row.getAttribute('aria-disabled') === 'false') highlight(Number(row.dataset.index), false); });
        popup.addEventListener('click', event => { const row = event.target.closest('[role="option"]'); if (row) { event.stopPropagation(); choose(Number(row.dataset.index)); } });
        render(); highlight(state.highlight, true);
        if (searchFocus && !search.hidden) search.focus({ preventScroll: true });
    }
    document.addEventListener('pointerdown', event => {
        const select = event.target.closest('select');
        if (eligible(select) && !select.matches(':disabled') && event.button === 0) {
            event.preventDefault(); if (active?.select === select) close(true); else open(select, true);
        } else if (active && !active.popup.contains(event.target)) close(false);
    }, true);
    document.addEventListener('click', event => {
        const select = event.target.closest('select'); if (!eligible(select) || select.matches(':disabled')) return;
        event.preventDefault(); if (event.detail === 0 && active?.select !== select) open(select, true);
    }, true);
    document.addEventListener('keydown', event => {
        const s = active, select = event.target.closest('select'), searching = s && event.target === s.search;
        if (s && (event.target === s.select || searching)) {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
            if (event.key === 'Tab') { close(searching); return; }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && (!searching || event.key.startsWith('Arrow'))) {
                event.preventDefault(); event.stopPropagation(); const rows = s.visible, i = rows.indexOf(s.highlight);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1)));
                highlight(rows[next] ?? -1, true); return;
            }
            if (event.key === 'Enter' || (!searching && event.key === ' ')) { event.preventDefault(); event.stopPropagation(); choose(s.highlight); return; }
            if (!searching && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault(); const key = normal(event.key); s.buffer = Date.now() - s.typedAt > 800 ? key : s.buffer + key; s.typedAt = Date.now();
                const match = s.visible.find(index => normal(s.select.options[index].textContent).startsWith(s.buffer));
                if (match !== undefined) highlight(match, true); return;
            }
        } else if (eligible(select) && !select.matches(':disabled') && !event.ctrlKey && !event.metaKey && (['ArrowDown', 'ArrowUp', ' ', 'Enter', 'Home', 'End', 'F4'].includes(event.key) || (event.key.length === 1 && !event.altKey))) {
            event.preventDefault(); event.stopPropagation(); open(select, false);
            if (event.key === 'Home') highlight(active.visible[0] ?? -1, true);
            else if (event.key === 'End') highlight(active.visible.at(-1) ?? -1, true);
            else if (event.key.length === 1 && event.key !== ' ') {
                if (!active.search.hidden) { active.search.value = event.key; active.search.focus({ preventScroll: true }); render(); }
                else { active.buffer = normal(event.key); active.typedAt = Date.now(); const match = active.visible.find(index => normal(select.options[index].textContent).startsWith(active.buffer)); if (match !== undefined) highlight(match, true); }
            }
        }
    }, true);
    document.addEventListener('focusin', event => { if (active && event.target !== active.select && !active.popup.contains(event.target)) close(false); });
    document.addEventListener('change', event => { if (active?.select === event.target) render(); }, true);
    document.addEventListener('scroll', event => { if (active && !active.popup.contains(event.target)) close(false); }, true);
    window.addEventListener('resize', position); window.visualViewport?.addEventListener('resize', position);
    window.addEventListener('popstate', () => close(false));
})();
