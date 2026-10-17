'use strict';
// Ask before destructive actions, and apply filing-history filters as soon as they change.
document.addEventListener('click', function (e) {
  const b = e.target.closest('[data-confirm]');
  if (b && !window.confirm(b.getAttribute('data-confirm'))) e.preventDefault();
});
document.addEventListener('change', function (e) {
  if (e.target.matches('[data-autosubmit]')) e.target.form.submit();
});
