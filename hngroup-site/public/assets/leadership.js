'use strict';
// HN Group's leadership team on /about (the user's request, 7 November 2026), drawn the same way as Horizon Network's.
// Live from the staff records: names, positions, photos and what each person chose to publish. The server already
// orders them by HN Group's positions (Board Chairman first).
(async function () {
    const target = document.getElementById('leadership');
    if (!target) return;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    function notice(text) {
        const p = document.createElement('p');
        p.className = 'leadership-notice muted'; p.textContent = text;
        target.replaceChildren(p);
    }
    try {
        const response = await fetch('/api/leadership');
        if (!response.ok) throw Error();
        const data = await response.json();
        const people = data.leaders.slice();
        target.style.setProperty('--leader-count', Math.max(people.length, 1));
        target.classList.toggle('is-compact', people.length > 3);
        target.replaceChildren();
        if (!people.length) return notice('Our leadership team will be introduced here soon.');
        const observer = !reducedMotion.matches && 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.remove('leader-awaiting');
                entry.target.classList.add('leader-entering');
                entry.target.addEventListener('animationend', () => entry.target.classList.remove('leader-entering'), { once: true });
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.12 }) : null;
        people.forEach((person, index) => {
            const card = document.createElement('article');
            card.className = 'leader leader-tone-' + (index % 3);
            card.style.setProperty('--entry-delay', Math.min(index, 5) * 90 + 'ms');
            const banner = document.createElement('div'); banner.className = 'leader-banner'; banner.setAttribute('aria-hidden', 'true');
            const logo = document.createElement('img'); logo.src = '/assets/brand/hn-group-wordmark-white.svg'; logo.alt = ''; logo.className = 'leader-brand';
            const orbit = document.createElement('span'); orbit.className = 'leader-orbit';
            banner.append(logo, orbit);
            const body = document.createElement('div'); body.className = 'leader-body';
            const portrait = document.createElement('div'); portrait.className = 'leader-portrait';
            const initials = document.createElement('span'); initials.className = 'leader-initials'; initials.setAttribute('aria-hidden', 'true');
            initials.textContent = person.name.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join('');
            portrait.append(initials);
            if (person.avatarUrl) {
                const photo = document.createElement('img'); photo.className = 'leader-photo'; photo.alt = ''; photo.hidden = true;
                photo.onload = () => { photo.hidden = false; initials.hidden = true; };
                photo.onerror = () => { photo.hidden = true; initials.hidden = false; };
                photo.src = person.avatarUrl; portrait.append(photo);
            }
            const name = document.createElement('h3'); name.textContent = person.name;
            const job = document.createElement('p'); job.className = 'leader-role'; job.textContent = person.jobTitle;
            // "About me" from their staff profile (plain text; line breaks become paragraphs).
            const bio = document.createElement('div'); bio.className = 'leader-bio';
            String(person.bio || '').split(/\n{2,}/).map(t => t.trim()).filter(Boolean).forEach(t => { const para = document.createElement('p'); para.textContent = t; bio.append(para); });
            const details = document.createElement('dl'); details.className = 'leader-details';
            [['Phone', person.phone], ['Location', person.location], ['Time zone', person.timezone]].forEach(([label, value]) => {
                if (!value) return;
                const row = document.createElement('div');
                const term = document.createElement('dt'); term.textContent = label;
                const description = document.createElement('dd');
                const telephone = String(value).replace(/[^+0-9]/g, '');
                if (label === 'Phone' && /^\+?[0-9]+$/.test(telephone)) {
                    const link = document.createElement('a'); link.href = 'tel:' + telephone; link.textContent = value; description.append(link);
                } else description.textContent = value;
                row.append(term, description); details.append(row);
            });
            const tags = document.createElement('div'); tags.className = 'leader-tags';
            [['Skills', person.skills], ['Languages', person.languages]].forEach(([label, values]) => {
                if (!Array.isArray(values) || !values.length) return;
                const group = document.createElement('div'); group.className = 'leader-tag-group';
                const heading = document.createElement('h4'); heading.textContent = label;
                const list = document.createElement('ul');
                values.forEach(value => { const item = document.createElement('li'); item.textContent = value; list.append(item); });
                group.append(heading, list); tags.append(group);
            });
            const footer = document.createElement('div'); footer.className = 'leader-footer';
            const dot = document.createElement('span'); dot.className = 'leader-team-dot'; dot.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span'); label.textContent = 'HN Group leadership';
            footer.append(dot, label); body.append(portrait, name, job); if (bio.childElementCount) { job.classList.add('has-bio'); body.append(bio); } if (details.childElementCount) body.append(details); if (tags.childElementCount) body.append(tags); body.append(footer); card.append(banner, body); target.append(card);
            if (observer) { card.classList.add('leader-awaiting'); observer.observe(card); }
        });
    } catch {
        notice('Our leadership team couldn’t be loaded just now. Please try again shortly.');
    } finally {
        target.setAttribute('aria-busy', 'false');
    }
})();
