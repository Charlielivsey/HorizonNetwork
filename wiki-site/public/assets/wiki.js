// HN Group Wiki: small enhancements. Everything works without JavaScript.
(function () {
  'use strict';
  // Colour swatches (inline styles aren't allowed by the security policy).
  document.querySelectorAll('.swatch[data-colour]').forEach(function (el) {
    if (/^#[0-9A-F]{6}$/i.test(el.dataset.colour)) el.style.background = el.dataset.colour;
  });
  // Mobile menu
  var toggle = document.querySelector('.menu-toggle'), sidebar = document.getElementById('sidebar');
  if (toggle && sidebar) toggle.addEventListener('click', function () {
    var open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    sidebar.classList.toggle('open', open);
  });
  // "/" jumps to search, like Wikipedia.
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || /input|textarea|select/i.test(document.activeElement.tagName)) return;
    var s = document.querySelector('.search input');
    if (s) { e.preventDefault(); s.focus(); }
  });
  // Confirm before deleting a page.
  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) { if (!window.confirm(f.dataset.confirm)) e.preventDefault(); });
  });
  // Warn before leaving the editor with unsaved changes.
  var box = document.getElementById('wpTextbox');
  if (box && !box.readOnly) {
    var original = box.value, submitting = false;
    box.closest('form').addEventListener('submit', function () { submitting = true; });
    window.addEventListener('beforeunload', function (e) { if (!submitting && box.value !== original) { e.preventDefault(); e.returnValue = ''; } });
  }
})();
