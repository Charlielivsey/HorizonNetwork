'use strict';
// Shows "You've signed out" after signing out (inline scripts aren't allowed by the security policy).
if (new URLSearchParams(location.search).get('signed-out')) document.getElementById('flash').innerHTML = '<p class="flash ok" role="status">You’ve signed out of HN Account.</p>';
// Sign-in keeps the place a link pointed to (the part after #, e.g. #staff/create/<id> from the staff portal).
const back = location.hash && /^#[\w/-]{1,80}$/.test(location.hash) ? '?return=' + encodeURIComponent('/' + location.hash) : '';
for (const a of document.querySelectorAll('a[href="/auth/login"]')) a.href = '/auth/login' + back;
if (new URLSearchParams(location.search).get('continue')) location.replace('/auth/login' + back);
