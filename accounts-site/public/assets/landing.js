'use strict';
// Shows "You've signed out" after signing out (inline scripts aren't allowed by the security policy).
if (new URLSearchParams(location.search).get('signed-out')) document.getElementById('flash').innerHTML = '<p class="flash ok" role="status">You’ve signed out of HN Account.</p>';
