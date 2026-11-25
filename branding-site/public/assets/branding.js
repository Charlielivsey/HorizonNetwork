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
  const search=document.querySelector('#asset-search'),companies=[...document.querySelectorAll('#logos .company')];
  if(search){const filter=()=>{const query=search.value.trim().toLocaleLowerCase();let shown=0;for(const company of companies){const match=company.querySelector('.company-head h3').textContent.toLocaleLowerCase().includes(query);company.hidden=!match;if(match)shown++;}document.querySelector('#library-results').textContent=shown+' '+(shown===1?'identity':'identities')+' in the library';document.querySelector('#library-empty').hidden=shown!==0;};search.addEventListener('input',filter);filter();}
  const links=[...document.querySelectorAll('.jump a')];
  if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){for(const link of links){const current=link.hash==='#'+entry.target.id;link.classList.toggle('is-current',current);if(current)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}}},{rootMargin:'-10% 0px -70% 0px'});document.querySelectorAll('.block[id]').forEach(section=>observer.observe(section));}
})();
