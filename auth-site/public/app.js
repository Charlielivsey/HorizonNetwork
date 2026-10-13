'use strict';
const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
const client = query.get('client_id'), state = query.get('state');
const connecting = client === 'status' && /^[a-f0-9]{64}$/.test(state || '');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let working = false, transitioning = false, pendingPinSubmit = false;
$('year').textContent = new Date().getFullYear();
$('destination').hidden = !connecting;
async function api(route, data) {
  const response = await fetch('/api/' + route, { method: data ? 'POST' : 'GET', headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined, credentials: 'same-origin' });
  const value = await response.json(); if (!response.ok) { const e = new Error(value.error || 'Please try again.'); e.status = response.status; throw e; } return value;
}
async function animate(element, frames, options) {
  if (reducedMotion.matches || !element.animate) return;
  try { await element.animate(frames, options).finished; } catch {}
}
function message(text) {
  $('message').textContent = text; $('message').hidden = !text;
  if (text) {
    animate($('message'), [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220 });
    if (!$('pin').hidden) { $('code').setAttribute('aria-invalid','true'); animate(document.querySelector('.pin-boxes'), [{transform:'translateX(0)'},{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(-3px)'},{transform:'translateX(0)'}],{duration:280}); }
  }
}
async function view(id, focus) {
  const stage = $('auth-stage');
  const previous = ['login','pin','account','loading'].find(name => !$(name).hidden);
  transitioning = true;
  const oldHeight = stage.getBoundingClientRect().height;
  if (previous && previous !== id) await animate($(previous), [{ opacity:1, transform:'translateY(0)' },{opacity:0,transform:'translateY(-8px)'}],{duration:130,easing:'ease-in'});
  for (const name of ['login','pin','account','loading']) $(name).hidden = name !== id;
  const nextHeight = stage.getBoundingClientRect().height;
  stage.classList.add('transitioning');
  await Promise.all([
    animate(stage,[{height:oldHeight+'px'},{height:nextHeight+'px'}],{duration:300,easing:'cubic-bezier(.2,.8,.2,1)'}),
    animate($(id),[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,easing:'cubic-bezier(.2,.8,.2,1)'})
  ]);
  stage.classList.remove('transitioning'); transitioning = false;
  if (focus) $(focus).focus({preventScroll:true});
}
function resetPin() { pendingPinSubmit = false; $('code').value = ''; $('code').removeAttribute('aria-invalid'); syncPin(); }
async function account(user) {
  $('card-title').textContent = 'You’re in.'; $('subtitle').textContent = 'One identity. Everything connected.';
  $('name').textContent = user.displayName; $('email').textContent = user.email; $('job').textContent = user.jobTitle || 'Not provided'; $('company').textContent = user.company || 'Not provided';
  $('initials').textContent = user.displayName.split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('');
  $('avatar').hidden = true; $('initials').hidden = false;
  $('avatar').onerror = () => { $('avatar').hidden = true; $('initials').hidden = false; };
  if (user.avatarUrl) { $('avatar').onload = () => { $('avatar').hidden = false; $('initials').hidden = true; }; $('avatar').src = user.avatarUrl; }
  $('destination').hidden = true;
  $('application-panel').hidden = !connecting; $('root-account-note').hidden = connecting;
  $('continue').hidden = !connecting || !user.statusAdminAllowed;
  $('access-badge').textContent = user.statusAdminAllowed ? 'Access granted' : 'Restricted';
  $('access-badge').classList.toggle('restricted',!user.statusAdminAllowed);
  $('account-note').textContent = !user.statusAdminAllowed ? 'Only the system owner and Super Admin members can manage status. Contact your system owner if you need access.' : 'You have permission to manage services and publish incident updates.';
  await view('account');
  $('card-title').setAttribute('tabindex','-1'); $('card-title').focus({preventScroll:true});
  if (connecting) {
    $('account-note').textContent = user.statusAdminAllowed ? 'Signed in. Taking you to Status administration…' : 'Checking your access to Status administration…';
    await connectToStatus();
  }
}
async function busy(button, action, label) {
  if (working || transitioning) return;
  working = true; const controls = [...document.querySelectorAll('.card button')];
  const verifyingPin = button === $('pin').querySelector('[type=submit]');
  if (verifyingPin) $('code').readOnly = true;
  controls.forEach(b=>b.disabled=true); button.setAttribute('aria-busy','true'); message('');
  const previous = button.innerHTML;
  if (label) button.textContent = label;
  try { await action(); } catch(e) { message(e.message); }
  finally { button.innerHTML = previous; button.removeAttribute('aria-busy'); controls.forEach(b=>b.disabled=false); $('code').readOnly = false; working=false; maybeVerifyPin(); }
}
$('login').addEventListener('submit', event => { event.preventDefault(); busy(event.submitter, async () => {
  const identity = $('username').value.trim();
  const data = await api('login', { username: identity, password: $('password').value }); $('password').value = '';
  $('password').type = 'password'; $('show-password').textContent = 'Show'; $('show-password').setAttribute('aria-pressed','false');
  if (data.codeRequired) {
    resetPin(); $('pin-identity').textContent = identity;
    $('card-title').textContent = 'One more step'; $('subtitle').textContent = 'A little extra security. The same familiar PIN.';
    await view('pin','code');
  } else await account(data.user);
}, 'Signing in…'); });
$('pin').addEventListener('submit', event => { event.preventDefault(); pendingPinSubmit = false; busy(event.submitter, async () => {
  const data = await api('login/code', { code: $('code').value });
  document.querySelector('.pin-entry').classList.add('verified');
  $('pin-help').textContent = 'Verified. Welcome to HN Group.';
  await animate(document.querySelector('.pin-boxes'),[{transform:'scale(1)'},{transform:'scale(1.025)'},{transform:'scale(1)'}],{duration:350});
  resetPin(); await account(data.user); document.querySelector('.pin-entry').classList.remove('verified');
}, 'Verifying…'); });
async function logout() {
  await api('logout', {}); resetPin(); $('password').value=''; $('destination').hidden = !connecting;
  $('card-title').textContent = 'Welcome back'; $('subtitle').textContent = 'Sign in with your staff account.';
  await view('login','username');
}
for(const id of ['logout','back']) $(id).onclick = () => busy($(id),logout);
$('show-password').onclick = () => { const show = $('password').type === 'password'; $('password').type = show ? 'text' : 'password'; $('show-password').textContent = show ? 'Hide' : 'Show'; $('show-password').setAttribute('aria-pressed',String(show)); };
async function connectToStatus() {
  const result = await api('continue', { client_id: client, state });
  location.replace(result.redirect);
}
$('continue').onclick = () => busy($('continue'), connectToStatus, 'Connecting to Status…');
function maybeVerifyPin() {
  if (!pendingPinSubmit || working || transitioning || $('pin').hidden || $('code').value.length !== 6) return;
  pendingPinSubmit = false; $('pin').requestSubmit($('pin').querySelector('[type=submit]'));
}
const boxes = [...document.querySelectorAll('.pin-boxes span')];
let pinLength = 0;
function syncPin() {
  const input = $('code'), length = input.value.length;
  const position = input.selectionStart ?? length;
  boxes.forEach((box,index)=>{
    const wasFilled = box.classList.contains('filled');
    box.classList.toggle('filled',index<length);
    box.classList.toggle('active',document.activeElement===input && index===position);
    if(!wasFilled && index<length) animate(box,[{transform:'scale(.94)'},{transform:'scale(1.045)'},{transform:'scale(1)'}],{duration:230,easing:'ease-out'});
  });
  document.querySelector('.pin-entry').classList.toggle('complete',length===6);
  $('pin-help').textContent = length===6 ? 'PIN entered. Checking your sign-in…' : 'Use the same PIN as your staff portal.';
  if(length!==pinLength) input.removeAttribute('aria-invalid');
  pinLength = length;
}
$('code').addEventListener('input',()=>{ const input=$('code'); const caret=input.selectionStart; const clean=input.value.replace(/[^0-9]/g,'').slice(0,6); if(clean!==input.value){input.value=clean;input.setSelectionRange(Math.min(caret,clean.length),Math.min(caret,clean.length));} syncPin(); pendingPinSubmit = clean.length === 6; maybeVerifyPin(); });
for(const event of ['focus','blur','keyup','click','select']) $('code').addEventListener(event,syncPin);
// A single native password field preserves paste, autofill, editing and screen-reader behaviour.
// The decorative boxes contain only dots, never copies of the PIN digits.
document.querySelector('.pin-entry').addEventListener('pointerdown',event=>{
  const bounds=event.currentTarget.getBoundingClientRect();const index=Math.min(5,Math.max(0,Math.floor((event.clientX-bounds.left)/bounds.width*6)));
  event.preventDefault();$('code').focus();const position=Math.min(index,$('code').value.length);$('code').setSelectionRange(position,Math.min(position+1,$('code').value.length));syncPin();
});
for(const id of ['username','password']) $(id).addEventListener('input',()=>{ const input=$(id); input.classList.toggle('has-value',!!input.value); animate(input,[{boxShadow:'0 0 0 3px var(--soft)'},{boxShadow:'0 0 0 5px transparent'}],{duration:320}); });
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
api('me').then(data => account(data.user)).catch(async e => { await view('login'); if (e.status !== 401) message(e.message); });
