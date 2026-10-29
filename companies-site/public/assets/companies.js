'use strict';
// Ask before destructive actions, and apply filing-history filters as soon as they change.
document.addEventListener('click', function (e) {
  const b = e.target.closest('[data-confirm]');
  if (b && !window.confirm(b.getAttribute('data-confirm'))) e.preventDefault();
});
document.addEventListener('change', function (e) {
  if (e.target.matches('[data-autosubmit]')) e.target.form.submit();
});

// Move to the error summary so screen reader and keyboard users hear what needs fixing.
document.addEventListener('DOMContentLoaded', function () {
  const summary = document.querySelector('[data-focus]');
  if (summary) summary.focus();
  // Show how many characters are left in longer text boxes.
  document.querySelectorAll('textarea[data-count][maxlength]').forEach(function (box) {
    const max = Number(box.getAttribute('maxlength'));
    const note = document.createElement('p');
    note.className = 'counter';
    note.setAttribute('aria-live', 'polite');
    box.insertAdjacentElement('afterend', note);
    const update = function () {
      const left = max - box.value.length;
      note.textContent = 'You have ' + left.toLocaleString('en-GB') + ' character' + (left === 1 ? '' : 's') + ' remaining';
      note.classList.toggle('over', left < 20);
    };
    box.addEventListener('input', update);
    update();
  });
});

// Forms that send something for review are sent once: a second click or Enter while the first is
// on its way is ignored, and the button shows that it's sending.
document.addEventListener('submit', function (e) {
  const form = e.target;
  if (!form.matches('form[data-once]')) return;
  if (form.dataset.sending) { e.preventDefault(); return; }
  form.dataset.sending = '1';
  form.querySelectorAll('button[type=submit]').forEach(function (b) { b.setAttribute('aria-disabled', 'true'); b.classList.add('is-sending'); if (!b.dataset.label) b.dataset.label = b.textContent; b.textContent = 'Sending…'; });
});
// Coming back to the page with the browser's back button shows the form ready to use again.
window.addEventListener('pageshow', function () {
  document.querySelectorAll('form[data-sending]').forEach(function (form) {
    delete form.dataset.sending;
    form.querySelectorAll('button.is-sending').forEach(function (b) { b.removeAttribute('aria-disabled'); b.classList.remove('is-sending'); b.textContent = b.dataset.label; });
  });
});

// Voting power preview on person-with-significant-control forms: works out this holder's share of the
// votes from the share or share classes being entered and the company's other holdings, using the
// register's rules (Class A one vote, B half, C two; the holder with the most Class C shares, if more
// than 10% of them, holds 51% or more). The register works out the real figure when the change is saved.
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('[data-vote-preview]').forEach(function (box) {
    const form = box.closest('form'), out = box.querySelector('.vote-after');
    const others = JSON.parse(box.getAttribute('data-others') || '[]');
    const threshold = Number(box.getAttribute('data-threshold')), controlVotes = Number(box.getAttribute('data-control'));
    const input = function (name) { return form.querySelector('[name="' + name + '"], [name="psc_' + name + '"]'); };
    const num = function (name) { const el = input(name); const v = el ? String(el.value).trim() : ''; return v === '' ? null : Number(v); };
    // The matching "Ownership of …" option for a percentage, or null at 25% or less.
    const band = function (kind, v) { return v >= 75 ? 'Ownership of ' + kind + ' – 75% or more' : v > 50 ? 'Ownership of ' + kind + ' – more than 50% but less than 75%' : v > 25 ? 'Ownership of ' + kind + ' – more than 25% but not more than 50%' : null; };
    const boxes = function (kind) { return Array.prototype.filter.call(form.querySelectorAll('input[type=checkbox][name$="control"]'), function (cb) { return cb.value.indexOf('Ownership of ' + kind) === 0; }); };
    function shares() {
      const A = num('classA'), B = num('classB'), C = num('classC'), share = num('share');
      return A !== null || B !== null || C !== null ? (A || 0) + (B || 0) + (C || 0) : share;
    }
    function votes() {
      const A = num('classA'), B = num('classB'), C = num('classC'), share = num('share');
      const split = A !== null || B !== null || C !== null;
      if (!split && share === null) return null;
      const self = split ? [A || 0, B || 0, C || 0] : [share, 0, 0];
      const all = others.concat([self]), w = function (k) { return k[0] + k[1] * 0.5 + k[2] * 2; };
      const W = all.reduce(function (n, k) { return n + w(k); }, 0), totalC = all.reduce(function (n, k) { return n + k[2]; }, 0);
      if (!W) return { votes: 0, control: false };
      const over = totalC > 0 ? all.filter(function (k) { return k[2] / totalC * 100 > threshold; }) : [];
      const most = over.length ? Math.max.apply(null, over.map(function (k) { return k[2]; })) : 0;
      const ctrl = over.filter(function (k) { return Math.abs(k[2] - most) < 1e-9; });
      if (!ctrl.length) return { votes: w(self) / W * 100, control: false };
      const wc = ctrl.reduce(function (n, k) { return n + w(k); }, 0), rest = W - wc, own = rest > 0 ? Math.max(controlVotes, wc / W * 100) : 100;
      return ctrl.indexOf(self) >= 0 ? { votes: own * w(self) / wc, control: ctrl.length === 1, shared: ctrl.length > 1 } : { votes: rest > 0 ? (100 - own) * w(self) / rest : 0, control: false };
    }
    function update() {
      const v = votes(), sh = shares();
      boxes('').forEach(function (cb) { cb.closest('.check').classList.remove('suggested'); });
      if (!v) { out.textContent = 'Enter the shareholding or share classes to see the voting power.'; return; }
      const pct = Math.round(v.votes * 100) / 100;
      out.textContent = '';
      const strong = document.createElement('strong'); strong.textContent = pct + '% of the votes';
      out.append('With these details: ', strong, v.control ? ' (voting control through Class C shares)' : v.shared ? ' (voting control shared with the other largest Class C holder)' : '', ' and ' + (Math.round(sh * 100) / 100) + '% of the shares. ');
      // Suggest the matching shares and voting rights options, and offer to tick them.
      const picks = [['shares', band('shares', sh)], ['voting rights', band('voting rights', pct)]];
      const wanted = picks.map(function (x) { return x[1]; }).filter(Boolean);
      out.append(wanted.length ? 'Choose ' + wanted.map(function (x) { return '“' + x + '”'; }).join(' and ') + ' below. ' : 'Both are 25% or less, so none of the ownership options apply. ');
      let needed = false;
      picks.forEach(function (x) {
        boxes(x[0]).forEach(function (cb) {
          const right = cb.value === x[1];
          if (right) cb.closest('.check').classList.add('suggested');
          if (right !== cb.checked) needed = true;
        });
      });
      if (needed) {
        const use = document.createElement('button'); use.type = 'button'; use.className = 'link-button'; use.textContent = wanted.length ? 'Tick ' + (wanted.length === 1 ? 'it' : 'them') + ' for me' : 'Untick the ownership options';
        use.addEventListener('click', function () { picks.forEach(function (x) { boxes(x[0]).forEach(function (cb) { cb.checked = cb.value === x[1]; }); }); update(); });
        out.append(use);
      }
    }
    form.addEventListener('input', function (e) { if (/(^|_)(share|classA|classB|classC)$/.test(e.target.name || '')) update(); });
    form.addEventListener('change', function (e) { if (e.target.type === 'checkbox') update(); });
    update();
  });
});
