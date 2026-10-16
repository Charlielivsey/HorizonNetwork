'use strict';
// Copy a colour's hex code when its swatch is selected.
(function () {
  const toast = document.querySelector('.toast');
  let timer;
  function show(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(function () { toast.hidden = true; }, 1800);
  }
  document.addEventListener('click', function (e) {
    const button = e.target.closest('[data-copy]');
    if (!button) return;
    const value = button.getAttribute('data-copy');
    const done = function () { show('Copied ' + value); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(done, function () { show(value); });
    } else {
      show(value);
    }
  });
})();
