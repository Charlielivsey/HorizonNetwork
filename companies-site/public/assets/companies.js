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
