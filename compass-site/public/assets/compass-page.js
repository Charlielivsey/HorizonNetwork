'use strict';
(function () {
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('open', !open);
    });
  }

  const ua = navigator.userAgent || '';
  const detected = /Mac OS X|Macintosh/i.test(ua) ? 'mac' : /Windows/i.test(ua) ? 'win' : /Linux/i.test(ua) ? 'linux' : null;
  if (detected) {
    const card = document.querySelector(`.platform-card[data-platform="${detected}"]`);
    if (card) card.classList.add('is-detected');
  }
})();
