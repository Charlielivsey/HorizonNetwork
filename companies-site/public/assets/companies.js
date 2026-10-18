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
