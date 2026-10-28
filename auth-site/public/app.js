'use strict';
const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
// Coming back from Google: the result is collected below; the address is tidied so a refresh starts afresh.
const googleReturn = query.get('google') === '1';
if (googleReturn) { query.delete('google'); history.replaceState(null, '', location.pathname + (query.toString() ? '?' + query : '')); }
const client = query.get('client_id'), state = query.get('state');
// Must match the applications registered in server.js.
const APPS = {
  browser: {name:'HN Browser',short:'HN Browser',allowed:()=>true,granted:'Your HN account is ready for the browser.',restricted:''},
  media: { name: 'Horizon Media Group administration', short: 'Horizon Media Group', allowed: user => user.statusAdminAllowed, granted: 'You can manage this website.', restricted: 'Only the system owner and Super Admin members can manage this website.' },
  holding: { name: 'HN Group Management administration', short: 'HN Group Management', allowed: user => user.statusAdminAllowed, granted: 'You can manage this website.', restricted: 'Only the system owner and Super Admin members can manage this website.' },
  development: { name: 'Horizon Development administration', short: 'Horizon Development', allowed: user => user.statusAdminAllowed, granted: 'You can manage this website.', restricted: 'Only the system owner and Super Admin members can manage this website.' },
  support: { name: 'HN Group Support administration', short: 'HN Group Support', allowed: user => user.statusAdminAllowed, granted: 'You can manage this website.', restricted: 'Only the system owner and Super Admin members can manage this website.' },
  clients: { name: 'HN Group Clients administration', short: 'HN Group Clients', allowed: user => user.statusAdminAllowed, granted: 'You can manage this website.', restricted: 'Only the system owner and Super Admin members can manage this website.' },
  careers: { name: 'HN Group Careers administration', short: 'HN Group Careers', allowed: user => user.statusAdminAllowed, granted: 'You can manage this website.', restricted: 'Only the system owner and Super Admin members can manage this website.' },
  news: { name: 'HN Group News', short: 'HN Group News', allowed: user => !!(user.statusAdminAllowed || user.ownerAccess || (Array.isArray(user.companies) ? user.companies : [user.company]).includes('HN Group')), granted: 'You can write and publish news for every HN Group website.', restricted: 'Only staff with a role at HN Group can manage HN Group News.' },
  network: { name: 'Horizon Network website configuration', short: 'Horizon Network configuration', allowed: user => user.statusAdminAllowed, granted: 'You can manage the Horizon Network website and maintenance mode.', restricted: 'Only the system owner and Super Admin members can configure Horizon Network.' },
  status: { name: 'Status administration', short: 'Status', allowed: user => user.statusAdminAllowed,
    granted: 'You have permission to manage services and publish incident updates.',
    restricted: 'Only the system owner and Super Admin members can manage status. Contact your system owner if you need access.' },
  website: { name: 'HN Group website configuration', short: 'website configuration', allowed: user => user.statusAdminAllowed, granted: 'You can manage the HN Group website and maintenance mode.', restricted: 'Only the system owner and Super Admin members can configure this website.' },
  portal: { name: 'Staff portal', short: 'the staff portal', allowed: (user) => !user.standalone,
    granted: 'Your staff portal account is ready.', restricted: 'This account has no staff profile, so it can’t use the staff portal.' },
  wiki: { name: 'HN Group Wiki', short: 'the wiki', allowed: () => true, granted: 'You can edit HN Group Wiki articles.', restricted: '' },
  branding: { name: 'HN Group brand centre', short: 'the brand centre', allowed: () => true, granted: 'You can use the HN Group brand centre.', restricted: '' },
  accounts: { name: 'HN Account', short: 'HN Account', allowed: () => true, granted: 'You can manage your HN account.', restricted: '' },
  investors: { name: 'HN Group Investors', short: 'the investors website', allowed: user => !!user.ownerAccess || (Array.isArray(user.companies) ? user.companies : [user.company]).includes('HN Group'), granted: 'You can manage investors, valuations and investor news.', restricted: 'Only staff with a role at HN Group can sign in to the investors website.' },
  vpn: { name: 'HN Group VPN', short: 'the VPN', allowed: () => true, granted: 'You can use the HN Group VPN.', restricted: '' },
  devices: { name: 'HN Group Devices', short: 'HN Group Devices', allowed: () => true, granted: 'You can add and manage your computers.', restricted: '' },
  docs: { name: 'HN Group Docs', short: 'HN Group Docs', allowed: () => true, granted: 'You can write and print company documents.', restricted: '' },
  'app-manager': { name: 'HN Group App Manager', short: 'App Manager', allowed: () => true, granted: 'Your HN account is ready for App Manager.', restricted: '' },
};
const app = Object.prototype.hasOwnProperty.call(APPS, client) ? APPS[client] : null;
const connecting = !!app && /^[a-f0-9]{64}$/.test(state || '');
// Signing in to an app on this computer (HN Browser, App Manager) always uses the password and PIN: the app is unlocked
// with the PIN afterwards, so Sign in with Google isn't offered there (the user's request, 28 October 2026).
const pinApp = connecting && (client === 'browser' || client === 'app-manager');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let working = false, transitioning = false, pendingPinSubmit = false;
let remembered = null, resumeMode = false;
$('year').textContent = new Date().getFullYear();
$('destination').hidden = !connecting;
if (connecting) { $('destination-name').textContent = app.name; $('application-name').textContent = app.name; $('continue-label').textContent = 'Continue to ' + app.short; }
async function api(route, data) {
  const response = await fetch('/api/' + route, { method: data ? 'POST' : 'GET', headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined, credentials: 'same-origin' });
  const value = await response.json(); if (!response.ok) { const e = new Error(value.error || 'Please try again.'); e.status = response.status; e.restart = !!value.restart; throw e; } return value;
}
async function animate(element, frames, options) {
  if (reducedMotion.matches || !element.animate) return;
  try { await element.animate(frames, options).finished; } catch {}
}
function message(text, ok = false) {
  $('message').textContent = text; $('message').hidden = !text; $('message').classList.toggle('ok', !!text && ok);
  if (text) {
    animate($('message'), [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220 });
    if (!$('pin').hidden) { $('code').setAttribute('aria-invalid','true'); animate(document.querySelector('.pin-boxes'), [{transform:'translateX(0)'},{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(-3px)'},{transform:'translateX(0)'}],{duration:280}); }
  }
}
async function view(id, focus) {
  const stage = $('auth-stage');
  const previous = ['login','pin','change-password','setup-code','profiles','account','loading'].find(name => !$(name).hidden);
  transitioning = true;
  const oldHeight = stage.getBoundingClientRect().height;
  if (previous && previous !== id) await animate($(previous), [{ opacity:1, transform:'translateY(0)' },{opacity:0,transform:'translateY(-8px)'}],{duration:130,easing:'ease-in'});
  for (const name of ['login','pin','change-password','setup-code','profiles','account','loading']) $(name).hidden = name !== id;
  const nextHeight = stage.getBoundingClientRect().height;
  stage.classList.add('transitioning');
  await Promise.all([
    animate(stage,[{height:oldHeight+'px'},{height:nextHeight+'px'}],{duration:300,easing:'cubic-bezier(.2,.8,.2,1)'}),
    animate($(id),[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,easing:'cubic-bezier(.2,.8,.2,1)'})
  ]);
  stage.classList.remove('transitioning'); transitioning = false;
  if (focus) $(focus).focus({preventScroll:true});
  // Typing can complete during the entry animation; verify as soon as it finishes.
  maybeVerifyPin();
}
function resetPin() { pendingPinSubmit = false; $('code').value = ''; $('code').removeAttribute('aria-invalid'); syncPin(); }
let profileChosen = false;
async function chooseProfile(user) {
  const list = (user.profiles || []).slice().sort((a, b) => (b.default - a.default));
  $('card-title').textContent = 'Choose a profile';
  $('subtitle').textContent = 'You can use this account as any of these. Your default is first.';
  const box = $('profile-list');
  box.replaceChildren(...list.map((p) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'profile-option' + (p.default ? ' default' : '');
    const initials = document.createElement('span'); initials.className = 'profile-initials'; initials.setAttribute('aria-hidden', 'true');
    initials.textContent = (p.company || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    const text = document.createElement('span'); text.className = 'profile-text';
    const name = document.createElement('strong'); name.textContent = p.company;
    const sub = document.createElement('small'); sub.textContent = [p.displayName, p.jobTitle].filter(Boolean).join(' · ');
    text.append(name, sub);
    b.append(initials, text);
    if (p.default) { const tag = document.createElement('span'); tag.className = 'profile-default'; tag.textContent = 'Default'; b.append(tag); }
    b.onclick = () => busy(b, async () => {
      const data = await api('profile/select', { key: p.key });
      profileChosen = true; await account(data.user);
    }, 'Opening…');
    return b;
  }));
  await view('profiles');
  const first = box.querySelector('button'); if (first) first.focus({ preventScroll: true });
}
async function account(user) {
  if (user.passwordChangeRequired) {
    $('card-title').textContent = 'Create your password';
    $('subtitle').textContent = 'A fresh password, just for you.';
    $('password-requirements').textContent = 'At least ' + (user.passwordMinLength || 12) + ' characters. Follow your staff account’s password requirements.';
    $('new-password').minLength = user.passwordMinLength || 12;
    $('new-password').value = ''; $('confirm-password').value = '';
    return await view('change-password', 'new-password');
  }
  if (user.codeSetupRequired) {
    $('card-title').textContent = 'Set your sign-in PIN';
    $('subtitle').textContent = 'Six digits. One familiar way to sign in.';
    for (const id of ['new-code','confirm-code']) { $(id).value = ''; syncSetupPin($(id)); }
    return await view('setup-code', 'new-code');
  }
  // Several profiles (each company someone works at, or more on one account): ask which one, every sign-in
  // (the user's request, 28 October 2026), with the default first and focused.
  if ((user.profiles || []).length > 1 && !profileChosen) return await chooseProfile(user);
  $('card-title').textContent = 'You’re in.'; $('subtitle').textContent = 'One identity. Everything connected.';
  $('name').textContent = user.displayName; $('email').textContent = user.email; $('job').textContent = user.jobTitle || 'Not provided'; $('company').textContent = user.company || 'Not provided';
  $('initials').textContent = user.displayName.split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('');
  $('avatar').hidden = true; $('initials').hidden = false;
  $('avatar').onerror = () => { $('avatar').hidden = true; $('initials').hidden = false; };
  if (user.avatarUrl) { $('avatar').onload = () => { $('avatar').hidden = false; $('initials').hidden = true; }; $('avatar').src = user.avatarUrl; }
  $('destination').hidden = true;
  await googleReady; showGoogle(user);
  $('application-panel').hidden = !connecting; $('root-account-note').hidden = connecting;
  const allowed = connecting && app.allowed(user);
  $('continue').hidden = !allowed;
  $('access-badge').textContent = allowed ? 'Access granted' : 'Restricted';
  $('access-badge').classList.toggle('restricted',!allowed);
  $('account-note').textContent = connecting ? (allowed ? app.granted : app.restricted) : '';
  await view('account');
  $('card-title').setAttribute('tabindex','-1'); $('card-title').focus({preventScroll:true});
  if (connecting) {
    $('account-note').textContent = allowed ? 'Signed in. Taking you to ' + app.name + '…' : 'Checking your access to ' + app.name + '…';
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
  finally { if (label) button.innerHTML = previous; button.removeAttribute('aria-busy'); controls.forEach(b=>b.disabled=false); $('code').readOnly = false; working=false; maybeVerifyPin(); }
}
$('login').addEventListener('submit', event => { event.preventDefault(); busy(event.submitter, async () => {
  resumeMode = false; googleOnly(false); $('resume-portrait').hidden = true; $('forget').hidden = true; $('google-resume').hidden = true;
  const identity = $('username').value.trim();
  const data = await api('login', { username: identity, password: $('password').value, ...(pinApp ? { pin: true } : {}) }); $('password').value = '';
  $('password').type = 'password'; $('show-password').textContent = 'Show'; $('show-password').setAttribute('aria-pressed','false');
  if (data.googleRequired) {
    await googleReady; googleOnly(true); $('pin-identity').textContent = identity;
    $('card-title').textContent = 'One more step'; $('subtitle').textContent = 'Your account signs in with Google. No PIN needed.';
    await view('pin','google-resume');
  } else if (data.codeRequired) {
    googleOnly(false); resetPin(); $('pin').querySelector('[type=submit]').innerHTML = 'Verify &amp; sign in <span aria-hidden="true">→</span>'; $('pin-identity').textContent = identity;
    $('card-title').textContent = 'One more step'; $('subtitle').textContent = 'A little extra security. The same familiar PIN.';
    await view('pin','code');
  } else await account(data.user);
}, 'Signing in…'); });
$('pin').addEventListener('submit', event => { event.preventDefault(); pendingPinSubmit = false; busy(event.submitter, async () => {
  let data;
  try { data = await api(resumeMode ? 'resume' : 'login/code', { code: $('code').value, ...(pinApp ? { pin: true } : {}) }); }
  catch (e) { if (e.restart) { clearRemembered(); await logout(); } throw e; }
  document.querySelector('.pin-entry').classList.add('verified');
  $('pin-help').textContent = 'Verified. Welcome to HN Group.';
  await animate(document.querySelector('.pin-boxes'),[{transform:'scale(1)'},{transform:'scale(1.025)'},{transform:'scale(1)'}],{duration:350});
  resetPin(); await account(data.user); document.querySelector('.pin-entry').classList.remove('verified');
}, 'Verifying…'); });
async function logout() {
  await api('logout', {}); $('new-code').value = ''; $('confirm-code').value = ''; $('new-password').value = ''; $('confirm-password').value = ''; resetPin(); $('password').value=''; $('destination').hidden = !connecting;
  $('card-title').textContent = 'Welcome back'; $('subtitle').textContent = 'Sign in with your staff account.';
  await view('login','username');
}
$('logout').onclick = () => busy($('logout'), async () => { await logout(); await loadRemembered(true); });
$('profiles-signout').onclick = () => busy($('profiles-signout'), async () => { await logout(); profileChosen = false; await view('login', 'username'); });
$('back').onclick = () => busy($('back'), async () => { await logout(); resumeMode = false; googleOnly(false); $('resume-portrait').hidden = true; $('forget').hidden = true; });
$('forget').onclick = () => busy($('forget'), async () => { await api('resume/forget', {}); clearRemembered(); await logout(); });
$('resume-offer').onclick = () => busy($('resume-offer'), startResume);
$('change-password').addEventListener('submit', event => {
  event.preventDefault();
  busy(event.submitter, async () => {
    if ($('new-password').value !== $('confirm-password').value) throw new Error('Your passwords do not match.');
    const data = await api('password', { newPassword: $('new-password').value });
    $('new-password').value = ''; $('confirm-password').value = '';
    await account(data.user);
  }, 'Saving password…');
});
function syncSetupPin(input) {
  input.value = input.value.replace(/[^0-9]/g, '').slice(0,6);
  const position = input.selectionStart ?? input.value.length;
  [...input.parentElement.querySelectorAll('.pin-boxes span')].forEach((box,index) => {
    box.classList.toggle('filled', index < input.value.length);
    box.classList.toggle('active', document.activeElement === input && index === position);
  });
}
for (const id of ['new-code','confirm-code']) {
  for (const event of ['input','focus','blur','keyup','click','select']) $(id).addEventListener(event, () => syncSetupPin($(id)));
}
$('setup-code').addEventListener('submit', event => {
  event.preventDefault(); busy(event.submitter, async () => {
    if ($('new-code').value !== $('confirm-code').value) throw new Error('Your PINs do not match.');
    const data = await api('setup-code', { code: $('new-code').value });
    $('new-code').value = ''; $('confirm-code').value = '';
    await account(data.user);
  }, 'Saving PIN…');
});
$('code-cancel').onclick = () => busy($('code-cancel'), logout);
$('password-cancel').onclick = () => busy($('password-cancel'), logout);
$('show-password').onclick = () => { const show = $('password').type === 'password'; $('password').type = show ? 'text' : 'password'; $('show-password').textContent = show ? 'Hide' : 'Show'; $('show-password').setAttribute('aria-pressed',String(show)); };
async function connectToStatus() {
  const result = await api('continue', { client_id: client, state,...(['browser','app-manager'].includes(client)?Object.fromEntries(['redirect_uri','code_challenge','code_challenge_method'].map(k=>[k,query.get(k)])): {}) });
  location.replace(result.redirect);
}
$('continue').onclick = () => busy($('continue'), connectToStatus, 'Connecting…');
// ---------- Sign in with Google (optional for each person; no password or PIN, and nothing is remembered) ----------
let googleEnabled = false;
const googleReady = api('google').then(v => { googleEnabled = !!v.enabled && !pinApp; $('google-or').hidden = $('google-login').hidden = !googleEnabled; $('google-resume').hidden = !googleEnabled || !resumeMode; }).catch(() => {});
async function startGoogle(mode) {
  const result = await api('google/start', { mode, next: location.pathname + location.search });
  location.assign(result.url);
  await new Promise(() => {}); // Leaving for Google.
}
// An account with Sign in with Google turned on gets only Continue with Google on this step: no PIN (the user's request).
function googleOnly(on) {
  $('pin').classList.toggle('google-only', on);
  if (on) $('google-resume').hidden = false;
  $('google-resume').querySelector('span').textContent = on ? 'Continue with Google' : 'Continue with Google instead';
}
$('google-login').onclick = () => busy($('google-login'), () => startGoogle('login'), 'Opening Google…');
$('google-resume').onclick = () => busy($('google-resume'), () => startGoogle('login'), 'Opening Google…');
// The signed-in panel: turn Sign in with Google on (a trip to Google) or off.
function showGoogle(user) {
  $('google-row').hidden = !googleEnabled && !user.google;
  $('google-status').textContent = user.google ? 'On for ' + user.google.email + '. Continue with Google signs you straight in, and this browser won’t remember you.' : 'Sign in with your Google account instead of your password and PIN.';
  $('google-toggle').textContent = user.google ? 'Turn off' : 'Turn on';
  $('google-toggle').classList.toggle('off', !!user.google);
  $('google-toggle').onclick = () => busy($('google-toggle'), async () => {
    if (!user.google) return startGoogle('link');
    const data = await api('google/unlink', {}); showGoogle(data.user); message('Sign in with Google is off.', true);
  });
}
async function googleResult() {
  if (!googleReturn) return null;
  try { return await api('google/result', {}); } catch (e) { return { error: e.message }; }
}
function maybeVerifyPin() {
  if (!pendingPinSubmit || working || transitioning || $('pin').hidden || $('code').value.length !== 6) return;
  pendingPinSubmit = false; $('pin').requestSubmit($('pin').querySelector('[type=submit]'));
}
const boxes = [...$('pin').querySelectorAll('.pin-boxes span')];
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
function clearRemembered() {
  remembered = null; resumeMode = false; googleOnly(false); $('resume-offer').hidden = true; $('resume-portrait').hidden = true; $('forget').hidden = true; $('google-resume').hidden = true;
  $('resume-avatar').removeAttribute('src'); $('resume-avatar').hidden = true;
  $('offer-avatar').removeAttribute('src'); $('offer-avatar').hidden = true; $('offer-initials').hidden = false;
}
async function startResume() {
  if (!remembered) return;
  await googleReady;
  const viaGoogle = !!remembered.google && googleEnabled;
  resumeMode = true; resetPin(); googleOnly(viaGoogle); $('resume-portrait').hidden = false; $('forget').hidden = false; $('google-resume').hidden = !googleEnabled;
  $('card-title').textContent = 'Welcome back, ' + (remembered.displayName || remembered.firstName);
  $('subtitle').textContent = viaGoogle ? 'Your account signs in with Google. No PIN needed.' : 'Enter your six-digit PIN to resume your session.';
  $('pin-identity').textContent = remembered.username;
  $('pin').querySelector('[type=submit]').innerHTML = 'Resume session <span aria-hidden="true">→</span>';
  await view('pin', viaGoogle ? 'google-resume' : 'code');
}
async function loadRemembered(start, pending) {
  const data = await (pending || api('resume'));
  if (!data.available) { clearRemembered(); return; }
  remembered = data;
  const initials = data.displayName.split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('');
  $('offer-initials').textContent = initials; $('resume-initials').textContent = initials;
  $('offer-name').textContent = data.displayName; $('resume-offer').hidden = false;
  $('resume-avatar').hidden = true; $('resume-initials').hidden = false;
  $('resume-avatar').onload = () => { $('resume-avatar').hidden = false; $('resume-initials').hidden = true; };
  $('resume-avatar').onerror = () => { $('resume-avatar').hidden = true; $('resume-initials').hidden = false; };
  $('offer-avatar').hidden = true; $('offer-initials').hidden = false;
  $('offer-avatar').onload = () => { $('offer-avatar').hidden = false; $('offer-initials').hidden = true; };
  $('offer-avatar').onerror = () => { $('offer-avatar').hidden = true; $('offer-initials').hidden = false; };
  if (data.avatarUrl) {
    const avatar = data.avatarUrl + '?v=' + Date.now();
    $('resume-avatar').src = avatar; $('offer-avatar').src = avatar;
  }
  if (start) await startResume();
}
// Ask "who's signed in?" and "does this browser remember someone?" together, and only then show a
// screen, so a remembered browser goes straight from "Checking your session…" to "Welcome back"
// without the email and password form flashing up first.
const rememberedRequest = api('resume');
rememberedRequest.catch(() => {});
(async () => {
  // Back from Google: signed straight in (no PIN), or a message about what happened.
  const google = await googleResult();
  if (google && google.user) return await account(google.user);
  const note = google && (google.error ? [google.error, false] : google.linked ? ['Sign in with Google is on for ' + google.linked + '. From now on, Continue with Google signs you in, with no PIN.', true] : null);
  try {
    const data = await api('me'); await account(data.user);
  } catch (e) {
    if (e.status !== 401) { await view('login'); return message(e.message); }
    const resume = query.get('switch') !== '1' && query.get('account') !== 'other';
    try { await loadRemembered(false, rememberedRequest); } catch (error) { await view('login'); return message(error.message); }
    if (remembered && resume) await startResume(); else {
      $('card-title').textContent = 'Welcome back'; $('subtitle').textContent = 'Sign in with your staff account.';
      await view('login');
    }
  }
  if (note) message(note[0], note[1]);
})();
