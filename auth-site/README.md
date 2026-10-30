# HN Group Auth — auth.hngroup.org.uk

Authentication-only service backed by the existing staff portal. No duplicate accounts, passwords or PINs. Uses the portal's real login handlers, including account blocking, password rate limits and the configured six-digit sign-in PIN. A narrow service-authenticated bridge provides only the signed-in person's name, email, job title, company, avatar and status access decision.

`sudo bash auth-site/install.sh` installs only Auth and the necessary staff bridge, with PM2 `hn-auth`, loopback port 3400 and a dedicated nginx/Let's Encrypt configuration. `sudo bash status-site/install.sh` updates both Auth and status. Other website installers and nginx hosts are untouched. Existing staff portal installation and PM2 `hn-staff-portal` on port 3200 are required. Set the auth DNS record to the VPS first. An existing Let's Encrypt registration is reused; otherwise append your email. The installer stops if trusted SSL cannot be issued, before status switches to Auth.

Registered applications:

- `status`, fixed callback `https://status.hngroup.org.uk/auth/callback`, for the system owner and Super Admin members. Start through that site's Admin button.
- `portal`, fixed callback `https://staff.hngroup.org.uk/auth/callback`, for any enabled staff account. The staff portal signs in only through Auth (the user's request, 27 October 2026): `/login` always goes straight to Auth, and Auth returns the browser to the portal's `/home` (or the status return route it started from). The portal has no form, PIN step or "Resume session" of its own: remembering the account, the PIN and Sign in with Google all happen here. The portal exchanges the one-time code server-to-server with the shared secret, starts its own session and ends the temporary session Auth used; any old portal Resume session token on the browser is forgotten and cleared. When a sign-in doesn't finish (expired, denied, Auth not answering, maintenance), `/login` shows a page with one **Sign in with HN Group Auth** button rather than looping. If the shared secret isn't installed, the portal keeps its own email and password form. A complete six-digit PIN verifies automatically, once per edit, and a successful application sign-in returns automatically to the fixed callback; failed PINs do not repeat without another input or submission. The Auth root page also allows signing in and viewing your own connected identity. Future clients must be registered server-side with fixed callbacks and explicit access rules; arbitrary return URLs are rejected.

Authentication cookies are Secure, HttpOnly, SameSite=Lax and host-only. One-time authorization codes expire in 60 seconds and are bound to the client and browser state. All application writes require the Auth origin; backend exchanges require the root-only service secret. Staff session tokens are hashed before Auth keeps them; passwords and PINs are never retained. Auth session/grant state is held in memory, so PM2 restarts sign users out. Every Auth document navigation (including refresh) revokes that browser’s session and pending PIN challenge on the server; assets and API requests do not. Refresh also revokes connected status access. Browser back/forward cache restoration reloads the document to enforce the same rule. Staff session validity, role membership and profile data are fetched afresh; central sign-out revokes access for connected status sessions.

Production settings: `HOST=127.0.0.1`, `PORT=3400`, `STAFF_PORTAL_BACKEND=http://127.0.0.1:3200`, `STATUS_SSO_SECRET_FILE=/var/lib/hn-status-sso/secret`. No browser redirects or callbacks are derived from request headers.

Verification: `node --test auth-site/test.cjs auth-site/portal-auth.test.cjs status-site/test.cjs status-site/portal-smoke.test.cjs`. The interface has masked six-box PIN entry, paste/autofill and keyboard editing, a centred focus cursor and correctly framed profile pictures, restrained field and screen transitions, verification feedback, and a connected identity/application panel. Reduced-motion preferences disable motion. Tests use temporary staff data, including a real password, PIN and avatar; production staff records are never used or changed.

Optional full browser regression: `node auth-site/browser-smoke.cjs` with Playwright and Chromium installed (or set `PLAYWRIGHT_MODULE` to an existing Playwright module). It runs the real password/PIN and Auth-to-Status flow using temporary staff data through a loopback HTTPS proxy, including automatic verification/return, wrong-PIN retries, private profile/avatar rendering, mobile menus and refresh sign-out. It does not sign in to production accounts.

Registered client `website` uses `https://hngroup.org.uk/auth/callback` for HN Group website configuration. It requires the same system-owner / Super Admin membership as status administration and retains a live Auth session for access rechecks. Application exchange, session and avatar requests carry `client_id: "website"`; codes cannot be exchanged as a different application. The existing portal client continues using its own session exchange.

## Remembered browsers and PIN resume

After a successful password and PIN sign-in, Auth keeps a separate secure, HttpOnly cookie for that browser, just like the staff portal. Returning to Auth shows the remembered name and profile picture and asks for the same six-digit PIN. Auth checks for a remembered account before showing any form, so a remembered browser goes straight from “Checking your session…” to “Welcome back” without the email and password form flashing up first. Refresh still ends the active Auth session: remembering the account never grants access without verifying the PIN. Six digits verify automatically, then return to the registered application with fresh permission checks.

The staff portal issues and validates these independent remembered tokens, stores only their hashes, rotates them after successful resume, and applies its existing attempt limits, account checks, expiry and password/PIN-change revocation. Auth never stores passwords or PINs. Remembering lasts up to 30 days, matching the portal. “Not you?” opens full sign-in while retaining the resume offer; “Forget me on this browser” revokes that browser’s remembered token. Other browsers remain independent. The narrow integration helper updates the portal’s token issuance condition; other portal sign-in behaviour is unchanged.

Update this service with `cd /root/HorizonNetwork && git pull && sudo bash auth-site/install.sh`.

The `network` application has fixed callback `https://network.hngroup.org.uk/auth/callback` and admits the system owner and Super Admin members to Horizon Network’s website configuration. The former addresses (horizon-network.co.uk, horizonetwork.com) redirect to network.hngroup.org.uk.

## Required account setup, including direct Auth visits

Auth checks the staff account’s actual `passwordTemporary` and missing-PIN flags. Signing in directly at auth.hngroup.org.uk follows the same setup flow as an application sign-in: replace a temporary password, then set and confirm a masked six-digit PIN if the account does not have one. Accounts with a permanent password and an existing PIN skip both steps. Password expiry alone does not trigger this temporary-password screen. The staff portal currently clears the PIN during a password reset; Auth requests a replacement PIN whenever it is missing.

The protected staff bridge delegates changes to the portal’s existing password/PIN handlers, retaining its password policy, weak-PIN validation, audit events and session revocation. Auth blocks application continuations and session exchanges until required setup is complete. First PIN setup also remembers that browser for future PIN resume. Remembered-account tiles and the PIN screen both display the staff profile picture with initials as fallback.

Checks: `node --test auth-site/setup.test.cjs` verifies new/temporary accounts, existing-PIN accounts, normal sign-ins, policy enforcement and server-side application gating. `PLAYWRIGHT_MODULE=/path/to/playwright node auth-site/setup-browser-smoke.cjs` checks the direct Auth setup and subsequent PIN resume with isolated fixture accounts.

## Independent website control

With the latest central-control installation, the one private staff backend runs as `hn-accounts` on loopback 3250 and Auth runs only the broker on 3400. `admin.hngroup.org.uk` has its own staff-backed sign-in and can manage Auth maintenance and power. The legacy `control` and `maintenance` SSO clients are retired. Auth shutdown does not shut down the account service or control-panel login; other applications still need Auth for their SSO flow. `/var/lib/hn-control/accounts-independent` selects this topology. Auth installers preserve its saved stopped state and nginx gate includes.

## HN Browser desktop client

`browser` uses a public native-client flow, not the server-to-server SSO secret. `/authorize` requires a hexadecimal state, S256 challenge and `http://127.0.0.1:PORT/callback` redirect; all other origins/paths, credentials, query strings and fragments are rejected. `/api/continue` binds a one-use 60-second code to those values only after password/PIN setup completes. `/api/native/exchange` requires the corresponding verifier, state and redirect URI, then issues a memory-only browser bearer token. `/api/native/session`, `/api/native/avatar` and `/api/native/logout` use that token and recheck the existing staff session. Native grants cannot be exchanged through the SSO endpoints. Auth page refresh still ends its web session; the desktop grant has its own staff-backed lifetime. No server secret is shipped in the desktop app. Tests: `node --test auth-site/native.test.cjs`.

### Remembered HN Browser accounts

Native browser exchanges issue a revocable staff-backed `kind: browser` credential in hashed resume storage, separate from normal remembered web cookies. The app encrypts it with OS safeStorage and requires the PIN on every reopen. `/api/native/unlock` delegates PIN checks to the private account backend with existing IP/credential attempt limits. `/api/native/session` and avatar requests check account readiness/revocation live. No browser grant creates a staff or website session automatically.

For website sign-in, `/api/native/offer` creates a one-use 60-second ticket bound to the exact registered non-native authorize URL (or Auth’s direct home page). Only the native main process sends it, in `X-HN-Browser-Offer` to Auth. The authorize document consumes it and issues the usual HttpOnly remembered-account cookie; the existing PIN flow and registered-client ACL still apply, including on refresh. Child remembered tokens depend on the browser grant, share its five-failure budget and stop working after browser sign-out. Switching accounts opts out of offers. Restart tests: `node --test auth-site/browser-session.test.cjs`.

## Continue with Discord (optional for each sign-in account)

Added at the user's request (28 October 2026), next to Sign in with Google (`discord.js`).

- **Staff records need a Discord user ID**: the staff portal's Add employee form requires it (15–22 digits; Discord → Settings → Advanced → Developer Mode, then right-click the person → Copy User ID). It's kept on the record (`discord: {id, username}`) and shown on their profile.
- **The bot** (bot token in the config) looks up every Discord ID on staff records and connected accounts every 30 minutes (first 20 s after Auth starts) and stores the current username on the record and account.
- **Online in Discord**: `discord-gateway.js` keeps the bot connected to Discord's gateway (no intents, so it receives no messages) with the status "Watching HN Group sign-ins". It runs inside `hn-auth`, starts as soon as `bot_token` is in `discord.json` (checked every minute) and reconnects by itself; `pm2 logs hn-auth` shows "Discord bot online as …". Set `HN_DISCORD_PRESENCE=0` to turn it off.
- **Connecting**: signed in with their password and PIN, people choose Connect under Continue with Discord. An account with staff profiles can only connect the Discord account whose ID is on one of those records (an account with no profile can connect any).
- **Signing in**: Continue with Discord signs straight in, no password and no PIN, and never remembers the browser (like Google). Sign-ins to HN Browser and App Manager don't offer it.
- **Config**: `/var/lib/hn-auth/discord.json` (root, `chmod 600`): `{"client_id","client_secret","bot_token"}`; redirect `https://auth.hngroup.org.uk/discord/callback`, scope `identify`. Read when needed; the button stays hidden until the client id and secret are there. The bot token is never stored in the repository.
- Test: `node --test auth-site/discord.test.cjs`. Bot artwork: `brand/discord-bot/`.

## Sign in with Google (optional for each person)

Added at the user's request (27 October 2026). A **Continue with Google** button sits under the password form, and
signed-in people see a **Sign in with Google** row with **Turn on / Turn off**. It's only shown once the owner has set
up a Google OAuth client.

- **Turning it on:** sign in here with your email, password and PIN, choose Turn on, and pick your Google account. Only
  a Google account with one of your own HN Group email addresses can be connected. The staff account stores Google's
  permanent account id (`account.google` in staff data: `findByGoogle`/`setGoogle` in staff-portal/lib/store.js).
  Afterwards you sign in again with Google, because a page load always ends the Auth session.
- **Signing in:** Continue with Google signs you straight in, with no password and no PIN (the user's request, 27 October 2026).
- **No PIN while it's on** (the user's request, 27 October 2026): for an account with Google turned on, Auth never shows
  the PIN. A correct email and password leads to Continue with Google (`googleRequired`), the remembered "Welcome back"
  shows only Continue with Google, and a PIN resume is refused. If the Google client file is removed, the PIN comes back
  so nobody is locked out. Signing in to HN Browser or App Manager always uses the password and PIN, with no Google
  option, because those apps are unlocked with the PIN afterwards (the page sends `pin: true`). The PIN screen still offers Continue with Google as an alternative for everyone else.
- **No remembering:** a Google sign-in never makes the browser remember the account (no "Welcome back" resume token),
  and leaves any account that was already remembered on that browser as it was. This is enforced in Auth and in the
  staff service (`completeLogin` skips remembering when `how === "Google"`).
- **Refusals:** a Google account that isn't connected, an email that no longer matches, an account that is disabled,
  or one that still needs its temporary password replaced or a PIN set. Maintenance mode applies as usual. The
  activity log records `sign-in-google`, `google-connected` and `google-disconnected`.
- **How it works** (`google.js`):
  - authorization-code flow with PKCE (S256);
  - a state bound to the browser by a cookie, and a nonce;
  - the ID token is read straight from Google's token endpoint over TLS, then the issuer, audience, expiry, nonce and
    verified email are checked;
  - the return trip is a page load, which ends Auth sessions, so the callback leaves a 5-minute result ticket that the
    page collects through `/api/google/result`;
  - the PIN step then uses the normal `/api/login/code`.
- **Set-up (owner):**
  1. In Google Cloud Console create an OAuth client of type *Web application*, with the authorised redirect URI
     `https://auth.hngroup.org.uk/google/callback`.
  2. On the OAuth consent screen choose *Internal* if all staff use the hngroup.org.uk Google Workspace. Scopes:
     `openid`, `email`, `profile`.
  3. On the VPS, save `{"client_id":"…apps.googleusercontent.com","client_secret":"…"}` as
     `/var/lib/hn-auth/google-oauth.json` (`chmod 600`). It's read when needed, so no restart is required.
  4. Delete the file to switch the button off.
- **Tests:** `node --test auth-site/google.test.cjs`. It runs the real staff service and Auth, with a stand-in for
  Google's token endpoint.
