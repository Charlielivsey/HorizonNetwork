# HN Group Bots

`https://bots.hngroup.org.uk` · `bots-site/` · PM2 `hn-bots` · loopback port 5600 · data `/var/lib/hn-bots`.

Uses the original HN wordmarks, favicon, Plus Jakarta Sans and the **unchanged HN Group website stylesheet**, with a responsive management workspace, light/dark mode and reduced-motion support. Sign-in is through HN Group Auth's registered `bots` client. Only owner-level accounts and Super Admins are admitted; impersonated sessions are refused. Auth validates the underlying account again for every bot API request. Credential replacement additionally requires owner-level access. Persistent server-held sessions have hashed browser tokens and private 0600 files; no Discord token/client secret is sent back to the browser. Changes require same-origin JSON, and destructive actions have HN-design confirmation cards.

## Controls

- Overview: live gateway connection, heartbeat latency, connected time, sync results and credential readiness.
- Presence: online/idle/do-not-disturb/invisible, playing/listening/watching/competing activity; start, stop or reconnect the bot without stopping Auth. Stopping the bot pauses gateway presence and automatic profile sync; Continue with Discord stays available.
- Bot profile: username, avatar and banner; remove artwork. Application description, tags, icon and cover. Image type is checked by content; max 2 MB each. Discord enforces permissions and rate limits.
- Servers: membership, permission values/administrator flag, nickname, confirmed leave-server, invitation builder. Guild lists paginate up to 1,000 servers. Discord's own consent screen chooses the destination server and grants the requested permissions.
- Messages: channel selection, last 25 messages, confirmed sends and deletion of this bot's messages. The composer suppresses mentions. Discord can withhold other messages or their content when the bot lacks permissions/intents.
- Global commands: JSON definitions plus a required `response` and optional `ephemeral` flag. `{user}` and `{username}` are substituted. Auth's gateway answers application-command interactions with those configured replies and suppresses mentions. Publishing explicitly replaces the global list. Existing guild-specific commands can be managed using the API console; commands without a configured reply get an explanatory response.
- Account sync: connected Discord IDs, manual refresh, automatic refresh interval and enable/disable, recorded success/failure. HN account connections and staff Discord IDs remain managed through HN Account and the staff portal.
- Activity: latest 2,000 management, connection and synchronisation events, with actor and time. No credentials, interaction tickets or message bodies are logged.
- Credentials: application ID and write-only replacement bot token/OAuth secret; blank means keep existing. Replacement bot credentials must match the application ID.
- Advanced API console: GET/POST/PATCH/PUT/DELETE for allowlisted Discord users, guilds, channels and this application's routes, enabling additional roles, moderation, channel, application and command management. Changes require confirmation. Fixed `discord.com/api/v10` origin, no redirects or arbitrary URL fetching, serialized mutations and Discord rate-limit handling. The bot's existing Discord permissions apply.

Discord requires its **Developer Portal** for token resets, application ownership/name, OAuth redirect registration, public/private installation, verification and privileged-intent approvals. Those controls link directly to the application rather than pretending the bot API can change them. This dashboard never changes these settings automatically or grants itself more Discord permissions.

## Runtime and installation

The bot remains inside `hn-auth`. `auth-site/bot-manager.js` owns controls and audit/settings in `/var/lib/hn-auth/discord-bot.json`, preserving existing credentials in `/var/lib/hn-auth/discord.json`. Its bridge `POST /api/service/bots` requires loopback, rejects nginx's X-Real-IP, requires the root-only shared service secret, and checks an active `bots` application session plus current owner/Super Admin permission. The website forwards authenticated operations; it cannot proxy arbitrary paths to Auth. Gateway restarts are generation-bound, so a stale socket close cannot disconnect a replacement connection. Existing Discord sign-in and staff profile refresh are retained.

`sudo bash bots-site/install.sh` installs **only this website**. Auth's changed files also need deployment through its isolated installer. Standard coordinated update: `cd /root/HorizonNetwork && git pull && sudo bash install.sh`. Certificates already present are reused unless `HN_RENEW_SSL=1`. The site is registered on Links (Staff services), website control, the root installer, Auth and HN Account; Status inherits its monitor from the catalogue. DNS must point `bots` to 217.154.34.205, DNS only.

Checks: `node --test bots-site/test.cjs auth-site/bot-manager.test.cjs auth-site/discord.test.cjs auth-site/clients.test.cjs admin-site/test.cjs`. Browser check: `node --test bots-site/browser.test.cjs` (Playwright from browser-app, optional `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE`). Tests use local fixtures and never send messages to real Discord servers. Browser screenshots are ignored under `.test-results/`.
