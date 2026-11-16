(function () {
  'use strict';
  document.getElementById('year').textContent = new Date().getFullYear();
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');
  function closeMenu() { toggle.setAttribute('aria-expanded','false'); nav.classList.remove('open'); }
  toggle.addEventListener('click',function () {
    var open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded',String(open)); nav.classList.toggle('open',open);
  });
  nav.addEventListener('click',function (event) { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown',function (event) { if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { closeMenu(); toggle.focus(); } });
})();
