# HN Group Auth — auth.hngroup.org.uk

HN Utilities `/network` commands are available to everyone in a server, with public branded replies and mentions suppressed:

- `/network create name:<name> appeals:<invite> acronym:<acronym> staff-server:<id> hq:<id>` collects all five values directly in Discord’s slash-command input. It generates a random join code and enrols the current server. Staff/HQ IDs are reference metadata; those servers enrol separately.
- `/network list [page]` lists every saved network, including its join code, appeals link, Staff/HQ IDs and member-server count (five networks per page).
- `/network join code:<code>` takes the join code inline and enrols the current server. A server can belong to one network at a time.
- `/network leave admin-code:0103` takes the required system admin code inline and removes only the current server's membership. The network and join code remain recorded, even when no member servers remain. This does not make the bot leave Discord.

- `/network delete code:<join-code> admin-code:0103` permanently deletes the selected network, invalidates its join code and clears all its server memberships. It also works for empty networks and does not remove the bot from any Discord server.

Network records share the existing private `discord-bot.json` database; no additional service or writer is introduced. No popup forms are used. Codes are omitted from audit details. The built-in command registers on READY and survives dashboard command replacement. `network.js` ships with the Auth installer. Regression: `node auth-site/network.test.cjs` (mocked Discord only).

HN Logs sends Charlie Livsey / Echo (`1256504335110635531`, confirmed by the user) **one separate readable branded DM per Discord activity event**: kicks, bans/unbans, timeouts and voice mutes, server audit changes (roles/channels/permissions/messages/invites and similar), server setup/invitation actions and `/network` create/list/join/leave/delete/refusals. `server-audit.js` consumes Discord's audit gateway events where View Audit Log is granted, with persisted event-ID deduplication; kick events use the existing moderation handler so they are not reported twice. The central sender replaces the former extra Echo kick DM. Utilities still collects the same events; only owner-log delivery uses the registered HN Logs application (`1571216218449248377`). Existing message contents (including their HN Utilities source titles), recipient and queue are unchanged. Missing Logs credentials retain events for retry and never fall back to sending from Utilities. Member moderation notices still use Utilities.

Technical/terminal logs, REST requests, command transport, ordinary help/ping replies, heartbeats, connection/presence events and sync diagnostics are excluded from owner DMs. The earlier broad implementation is superseded; any undelivered technical events are removed from the outbox on startup. `owner-audit.js` keeps the remaining event queue in the existing `discord-bot.json`, with separate sends, rate-limit/blocked-DM retries, restart persistence and stable Discord nonces. Log delivery never logs itself. Credentials and invite/join/admin codes stay out of DMs. This logs future events and does not replay historical audits. Tests: `node auth-site/owner-audit.test.cjs` and `node auth-site/server-audit.test.cjs` (mocked Discord).

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


### HN Utilities help, stats and VP roles

`/help` shows the command menu, required/optional arguments, permissions and setup warnings.
`/stats` reports gateway status/ping, process uptime, connection time, reconnects, RSS memory,
and profile/staff-role sync status and times. Both use public HN embeds, suppress mentions,
register on gateway READY, and survive dashboard command replacement. Stats never exposes
credentials, raw sync errors or member information.

The four servers in `hn-roles.json` use **Vice President (Relations)** then
**Vice President (Systems)** directly below President and above Executive Assistant.
Both retain the VP colour `#9674D4`, NPL 5 and Network Administration grants.
Normal staff sync (also `/force-sync`) performs the explicitly requested VP migration:
it creates only missing VP replacements, copies the existing VP role settings and channel
permission overwrites, and verifies role order. Other missing layout roles still require
`/setup-server`; the VP migration never invokes the full rebuild or deletes server roles.
The bot must be above President. Existing unrelated roles and unlinked members are preserved.
The old VP role remains for holders whose staff title has not yet been updated; linked
Relations/Systems holders move to their matching role automatically. Fresh `/setup-server`
installations use only the two new VP roles.

Validation: `node auth-site/server-setup.test.cjs` and the bot-manager, moderation,
server-invite and presence-rotation suites. The process-signal test in bot-manager hangs in this environment and was excluded from
the completed regression run.

### Independent offline page

Auth's TLS nginx host serves `offline/index.html` with the approved HN wordmark/font from
`/var/www/hn-auth-offline` when upstream or gate failures produce 500/502/503/504. Returns 503,
`Cache-Control: no-store` and `Retry-After: 60`; retry preserves the current address. Fallback
assets bypass the central gate and need no PM2 service. The installer updates these static files.
Check with `python3 auth-site/offline.test.py`: isolated real nginx, upstream failure/recovery,
connection refusal, unavailable gate and independent assets. No live service shutdown required.

### Staff list

`/staff-list [page]` publicly lists all current non-system staff records, including staff without a linked Discord account. Each company role shows its configured Network Permission Level and resolved supervisor; linked account permission-role names and owner-level labels are included. Missing levels/supervisors are explicitly labelled. The command fetches fresh minimal data through the secret-authenticated private `/api/auth/discord-staff-list` endpoint, suppresses mentions and paginates long lists. It remains built-in after dashboard republishing and registers on READY. No staff or Discord roles are changed.

Validation: `node --test auth-site/staff-list.test.cjs staff-portal/discord-profiles.test.cjs`.


### Server welcomes and bot invitations (17 November 2026)

`/welcome setup channel:<welcome channel> rules:<rules channel> [message:<template>]` configures each Discord server independently. Manage Server or Administrator is required. Templates accept `{user}`, `{server}`, `{count}` and `{rules}`. `/welcome show`, `/welcome disable` and `/welcome test` inspect, disable or explicitly send a test. Automatic joins require Server Members Intent; the application flag is checked before enabling the gateway intent. Settings and the retry/deduplication queue remain in `discord-bot.json`.

`/bot-invite` publicly provides Utilities and Logs OAuth invitations without requesting Administrator. The retired `/server-setup apply`, `preview` and `layouts` commands are removed. `/setup-server roles:HN administration roles` keeps the existing administrator restrictions and destructive-role warning, but checks live network membership rather than the old fixed server list.

### Setup pacing and recovery

Setup and role sync share a serial request lane: mutations wait at least 1.5 seconds after the previous response and reads at least 350 ms. Discord bucket headers and the full `retry_after` override these intervals, including waits over a minute. Interaction acknowledgements remain separate. Slow/unresponsive requests time out after 20 seconds; an inactive worker is also checked every 5 seconds with a 2-minute stale threshold. Legitimate cooldown waits are excluded from the stale check.

A setup snapshots its original removal IDs and stores checkpoints/progress in the existing `discord-bot.json` writer. Automatic recovery has at most two retries and preserves already-created roles; stopped process recovery resumes only jobs marked running. Repeated failures pause the saved job for a later `/setup-server` retry. Repeated commands during a live setup report its stage, recent activity and cooldown. Explicitly cancelled runs are cleared and never automatically resumed.

### Utilities tickets

Ticket replies and selectors are public embeds. Busy notices identify the running action, ticket and logging stage. Successful claim/close/reopen/transfer/log/delete actions clear their interaction acknowledgement instead of posting an extra completion message; the ticket embed and meaningful action notices provide the result. Ticket embeds omit the HN Group author/logo; the footer reads HN Utilities. The panel picker labels each option with its panel key/name and shows its embed title and button count beneath it.

All ticket commands use `/ticket`. Configure a panel with Manage Server (or Administrator):

1. `/ticket create` includes `panel`, `title`, `description`, shared `closed-category` and `log-channel`, plus `button-1`, `category-1` and `roles-1` for the first button. Add optional groups `button-2/category-2/roles-2` through `button-4/category-4/roles-4` in the same command. Each used group needs all three values. Role mentions/IDs are space- or comma-separated; each button's roles get its ping and ticket access. A panel has at most four buttons.
2. `/ticket send [channel]` displays a public dropdown of all saved panels in this server (with pages when needed). Select a panel to publish it to the chosen channel, or the current channel if omitted. Sending the same panel to the same channel updates its existing message; sending elsewhere retires its old location.
3. `/ticket edit` changes panel text, the shared closed category and log destination. `/ticket button panel:support key:button-1 label:Human Resources category:<HR category> roles:@HR @Managers` edits a button or adds one within the four-button limit. Optional `department` uses an exact name from `/ticket departments`. `/ticket remove-button` removes a draft button. Use `/ticket send` to publish edits; `/ticket show panel:support [page:2]` inspects settings. Existing tickets retain their saved categories and log destination. Older panels retain their previous shared open-category fallback until their buttons are edited.

Ticket channel names use the button label plus the existing server ticket number, for example `hr-0001` or `general-support-0002` (lowercase, spaces/punctuation become hyphens). The opening embed includes the server's ticket number, opener and team response message. Claim, Close, Reopen, Transfer, Log and Delete buttons sit under it; equivalent slash commands work inside the ticket. Only the assigned team or server managers can operate them. Claim announces the claimant and makes other staff read-only while retaining opener replies. Only the claimant or managers can then operate controls. Discord Administrator and server owner permissions bypass channel restrictions. Close makes the conversation read-only and moves it to the closed category; Reopen restores the open category and clears prior log authorization. Thread creation is disabled in ticket channels so normal conversations remain in the channel transcript.

Transfer presents fresh company/department names from the secret-authenticated Staff Portal directory, including additional appointments. `/ticket department name:<exact company / department> roles:@Role @OtherRole` sets explicit server-specific ping/access roles. Otherwise department-name roles or job-title roles unique to that department are matched; ambiguous/missing roles require an explicit mapping. Transfer removes previous team access, clears the claim, grants the destination roles and linked staff access, then pings only those roles. No Staff Portal or Discord role membership is changed.

Log requires the application's Message Content access, freezes the conversation, reads every history page and sends numbered transcript embeds to the saved log channel. Transcripts read as a conversation: bold display names/usernames, Europe/London date/time, message text, named replies and edit markers. Embed titles/descriptions/fields are rendered as readable text; attachments have labelled download links, and stickers/polls have readable labels. Message links preserve reference IDs without displaying raw JSON or button payloads. Long messages repeat the sender/time with a continued marker in numbered transcript parts. It records each delivered part in the existing `discord-bot.json`; a failed send resumes from the unsent part on another Log click. Messages already deleted from Discord cannot be recovered; attachment URLs are references rather than permanent file copies. Use Close → Log → Delete; a closed ticket can be logged or re-logged without reopening. A failed/incomplete transcript never enables Delete. Bot-owned interaction replies (including temporary thinking messages, busy replies and errors) are excluded from the conversation snapshot and change checks; meaningful notices remain included. If the actual conversation or saved transcript changes, Log is re-enabled while the ticket stays closed. Reopening invalidates the previous transcript. Delete rechecks saved log messages and the channel history, rejecting new/edited messages until re-logged. Utilities needs View Channel, Send Messages, Embed Links, Read Message History, Manage Channels and Manage Roles in the configured locations, and permission to mention configured roles. It does not request Administrator.

Configuration, per-server counters, tickets, claims, transfer menus and transcript progress share the existing bot writer; no new service or persistent store. Permission checks fetch current guild membership/roles, interactions are acknowledged publicly before work, and overlapping ticket operations ask the user to retry. Published panels remain usable after Auth restarts. Tests: `node --test auth-site/tickets.test.cjs auth-site/bot-manager.test.cjs staff-portal/discord-profiles.test.cjs` (mock Discord and isolated staff data).

### NPL overrides and help pages

`/npl-override set member level [reason]` fixes a server member at NPL 1–5 until `/npl-override clear member` restores normal HR role sync. `/npl-override show member` displays the current override. Server administrators and existing authorised bot administrators can use these commands; Utilities must be above the member and NPL roles. Overrides use the existing bot state writer and do not create roles. `/help` uses public button-controlled pages. HN Logs statistics omit Utilities-only profile and role sync fields.

## Sign-in policy — 20 November 2026

HN Auth accepts username/password and the existing PIN flow only. Google and Discord sign-in/link endpoints and OAuth callbacks are retired (410); availability endpoints report disabled, and linked accounts follow the same password/PIN path. The private account service also rejects provider sign-in/link calls. Existing Google mailbox metadata, Discord staff identities and the Discord bot manager remain intact; they do not enable external-provider sign-in. Terminal account-lock recovery is available through `sudo horizon unlock-account`; see `vps-welcome/README.md`.

Auth and its merged Account Centre use the same fixed charcoal grey / lavender theme as Roster and Staff Portal. Shared account theme choices remain stored for other sites; only the local presentation changes.

Position roles now change only on an explicit /force-sync or /setup-server command, or a changed Staff Portal membership/position catalogue. The minute watcher only compares a persisted source fingerprint; elapsed time, startup/reconnect, role drift, policy colour changes and list reordering never cause reconciliation by themselves. Existing role IDs are reused and edited, historical role names alone do not authorise deletion, and removed staff lose managed position grants. Server setup uses the same non-destructive role reconciliation. HN Logs resolves and caches the source server’s name for audit embeds. Account tests must use isolated Auth data; node:test refuses live credential paths.
