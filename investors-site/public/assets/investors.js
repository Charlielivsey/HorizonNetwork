'use strict';
// HN Group Investors: small helpers. Everything works without JavaScript.
(function () {
  // Forms send once: a second press while sending does nothing.
  document.querySelectorAll('form[data-once]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (f.dataset.sending) { e.preventDefault(); return; }
      f.dataset.sending = '1';
      setTimeout(function () { f.querySelectorAll('button[type=submit]').forEach(function (b) { b.disabled = true; }); }, 0);
    });
  });
  // Confirm before deleting or disabling.
  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) { if (!window.confirm(f.dataset.confirm)) e.preventDefault(); });
  });
  // Copy an invitation link.
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]'); if (!b) return;
    var input = document.querySelector(b.getAttribute('data-copy')); if (!input) return;
    var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1800); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(input.value).then(done, function () { input.select(); });
    else { input.select(); document.execCommand('copy'); done(); }
  });
})();
