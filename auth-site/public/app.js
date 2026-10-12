'use strict';
const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
const client = query.get('client_id'), state = query.get('state');
const connecting = client === 'status' && /^[a-f0-9]{64}$/.test(state || '');
$('year').textContent = new Date().getFullYear();
$('destination').hidden = !connecting;
async function api(route, data) {
  const response = await fetch('/api/' + route, { method: data ? 'POST' : 'GET', headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined, credentials: 'same-origin' });
  const value = await response.json(); if (!response.ok) { const e = new Error(value.error || 'Please try again.'); e.status = response.status; throw e; } return value;
}
function message(text) { $('message').textContent = text; $('message').hidden = !text; }
function view(id) { for (const section of ['login','pin','account','loading']) $(section).hidden = section !== id; }
function account(user) {
  view('account'); $('card-title').textContent = 'You’re signed in'; $('subtitle').textContent = 'Connected with your HN Group account.';
  $('name').textContent = user.displayName; $('email').textContent = user.email; $('job').textContent = user.jobTitle || 'Not provided'; $('company').textContent = user.company || 'Not provided';
  $('initials').textContent = user.displayName.split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('');
  $('avatar').hidden = true; $('initials').hidden = false;
  if (user.avatarUrl) { $('avatar').onload = () => { $('avatar').hidden = false; $('initials').hidden = true; }; $('avatar').src = user.avatarUrl; }
  $('continue').hidden = !connecting;
  $('account-note').textContent = connecting && !user.statusAdminAllowed ? 'Your account does not have access to status administration. Only the system owner and Super Admin members can access it.' : 'You’re signed in and ready to connect.';
}
async function busy(button, action) { button.disabled = true; button.setAttribute('aria-busy','true'); message(''); try { await action(); } catch(e) { message(e.message); } finally { button.disabled = false; button.removeAttribute('aria-busy'); } }
$('login').addEventListener('submit', event => { event.preventDefault(); busy(event.submitter, async () => {
  const data = await api('login', { username: $('username').value.trim(), password: $('password').value }); $('password').value = '';
  if (data.codeRequired) { view('pin'); $('card-title').textContent = 'One more step'; $('subtitle').textContent = 'Confirm it’s you to finish signing in.'; $('code').focus(); } else account(data.user);
}); });
$('pin').addEventListener('submit', event => { event.preventDefault(); busy(event.submitter, async () => { const data = await api('login/code', { code: $('code').value }); $('code').value = ''; account(data.user); }); });
async function logout() { await api('logout', {}); view('login'); $('card-title').textContent = 'Welcome back'; $('subtitle').textContent = 'Sign in with your staff account.'; $('code').value=''; $('password').value=''; $('username').focus(); }
for(const id of ['logout','back']) $(id).onclick = () => busy($(id),logout);
$('show-password').onclick = () => { const show = $('password').type === 'password'; $('password').type = show ? 'text' : 'password'; $('show-password').textContent = show ? 'Hide' : 'Show'; $('show-password').setAttribute('aria-pressed',String(show)); };
$('continue').onclick = () => busy($('continue'), async () => { const result = await api('continue',{ client_id: client, state }); location.assign(result.redirect); });
api('me').then(data => account(data.user)).catch(e => { view('login'); if (e.status !== 401) message(e.message); });
