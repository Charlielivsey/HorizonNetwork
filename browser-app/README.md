# HN Browser · preview

A Chromium browser built with Electron, for macOS (Apple silicon) and Windows x64. Intel Macs are no longer supported (the user's decision, 19 October 2026). The browser and installers are separate from the VPS websites. Downloads: https://downloads.hngroup.org.uk.

## Included

Version 0.7.2 uses Electron 44.9.0 / Chromium 152.0.7977.167. Settings → About shows the running engine versions. Google can restrict sign-in from embedded browsers regardless of engine version.

- Right-click tabs to create, duplicate, reload, pin/unpin, mute/unmute, close other tabs, close tabs to the right or reopen a closed tab. Pinned tabs are preserved by bulk close actions; middle-click closes a tab.
- Full-page local settings with searchable sections for the account, appearance, Google/Bing/DuckDuckGo search, default zoom, bookmarks bar, HN website theme integration, download folder/save prompts, browsing-data controls and version/updates. Changes persist locally.
- Themes update open new-tab pages and HTTPS HN sites immediately, without reloading or losing form input. Only the fixed HN destination allowlist receives a CSS theme; external pages have no browser bridge. The menu’s blurred page preview refreshes after a theme change.
- Startup focuses the masked PIN field, then transfers focus to the address bar after unlock.
- Downloads opens a dedicated internal manager, including the bookmarks-bar Downloads button. Search, filter, pause/resume, cancel/retry, open with confirmation, show in folder, remove individual records and clear finished history. Removing records never deletes files.

- A grouped new-tab shortcut directory links to every HN company and service plus Gmail, using original company artwork.
- HN site shortcuts in both search boxes: names such as “staff portal”, “wiki” and “Horizon Development” open the canonical site. Case, spaces, common one-character typos/transpositions (including “staff portak”) and phrases such as “go to staff portal” are recognised. Ambiguous/unrelated text still searches the web; explicit URLs are preserved. The fixed public-site list lives in `src/sites.cjs` and is tested against website control’s catalog.
- Downloads manager in the toolbar and browser menu: live progress, speed/size, pause/resume, cancel, retry, reveal saved files and clear finished history. Save dialogs remain native. History is private to this device; clearing it keeps the files. Interrupted transfers after an app restart can be retried. Resume support depends on the source server; Electron may restart non-resumable transfers.
- Real Chromium tabs, back/forward, reload/stop, address/search bar, new-tab page, per-device browsing cookies and a native save dialog for downloads.
- **Midnight Lavender** by default. Daylight, Deep Ocean, Forest and Rose Quartz can be chosen in the toolbar; the theme is remembered on this device.
- Integrated title bar with native macOS/Windows window controls, draggable tab strip, animated menus and new-tab page, keyboard navigation and reduced-motion support.
- HN account sign-in using the existing Auth password/PIN/setup/remembered-account screens. The browser account panel shows the person's display name, staff profile picture, email, role and company. The toolbar also shows their profile picture; missing/unavailable pictures fall back to initials. When the browser account is unlocked, HN Group Auth recognises it on website sign-in and asks for the six-digit PIN. Each website still enforces its own permissions. “mail” and “gmail” open Gmail.
- **HN VPN** built in (0.6.0): the shield in the toolbar (or the bookmarks bar, menu, Settings → HN VPN, Ctrl/Command+Shift+V) opens the VPN panel. It walks through unlocking the HN account, signing in to the VPN (HN Group Auth in a tab; an unlocked browser only needs the PIN; the VPN site hands a one-time code to a loopback address, swapped with a secret only the browser holds), installing WireGuard (Homebrew wireguard-tools on a Mac, WireGuard for Windows) and setting up this computer (a key made locally; one Mac password or Windows prompt). Then one button connects and disconnects, with the toolbar shield showing the state and whether the HN Group server (10.88.0.1) answers. It is a full tunnel: all of the computer's traffic goes through the VPN (0.7.2; computers set up for the earlier split tunnel are offered a one-step update). Optional connect-on-open after unlocking; manage devices on the web; sign out of the VPN; remove this computer. On a Mac it shares the helper, configuration and sudo rule with HN Secure Network. On Windows the configuration lives in an Administrators-only folder and signed-in users may start/stop only the HN VPN service. The VPN sign-in token is encrypted like the account (`vpn.enc`); device keys stay in the system configuration, never in browser storage or the renderer.
- **0.7.0 — your profile, history, bookmarks and more.**
  - Settings → Your profile: change your display name, phone, location, time zone, skills, languages, About me (and whether it shows on public HN Group websites), birthday, status and profile picture, and see your work details. Changes go to your staff profile through HN Group Auth (`/api/native/account*`) and only work while HN Browser is unlocked: the PIN (or a full sign-in) gives the browser an unlock key, held in memory only and cancelled when the browser locks; the staff service checks it (`resume.unlocked`).
  - Lock HN Browser (menu, Settings, Ctrl/Command+Shift+L), automatically after 5–60 minutes away, or when the computer sleeps or locks. Tabs stay open behind the PIN screen.
  - History (Ctrl+H / Command+Y) with search, per-day groups and clearing by time range; bookmarks (star in the address bar or Ctrl/Command+D) in the bookmarks bar and a bookmarks manager (rename, reorder, remove); address bar suggestions from bookmarks, history and HN shortcuts. All stored only on this device (`history.json`, `bookmarks.json`).
  - Continue where you left off, a greeting and your most visited sites on the new tab page, a right-click menu on webpages (links, images, copy/paste, search), print, a page-loading bar, a zoom indicator, download notifications, pop-up control, a home-button toggle, reset settings and a keyboard shortcut list. Settings now has 13 searchable sections.
  - Smoother motion throughout: springy menus that animate away, tab open/close animations, staggered menus, settings cards and lists, a circular theme reveal, toasts, PIN shake and a reduce-motion setting.
- Find in page (Ctrl/Command+F; Enter/Shift+Enter for next/previous, Esc to close), website icons in tabs, and more shortcuts: Ctrl/Command+1–9 to pick a tab, Ctrl+Tab/Ctrl+Shift+Tab to cycle, Ctrl/Command+Shift+T to reopen a closed tab, Command+[ / ] (Mac) or Alt+←/→ (Windows) for back/forward, F5 to reload.
- Opening HN Browser again brings the existing window forward instead of starting a second copy.
- Ctrl/Command+T, W, L and R, plus the standard Edit menu and full-screen controls.

This preview does not include Chrome extensions, a password manager, browser-data/account sync, default-browser registration or silent application replacement. The remembered browser credential is encrypted with Electron safeStorage (macOS Keychain / Windows DPAPI) and rechecked each minute. On every app restart the last account opens straight on a masked six-digit PIN screen; it stays locked until the staff backend verifies the PIN. It expires after 30 days of inactivity or on sign-out, password/PIN reset or account revocation. No PIN/password is saved. There is no plaintext fallback when OS secure storage is unavailable. Auth can also remember its own account but still requires the PIN. Normal website cookies remain in the browsing partition.

## Updates and version

The footer and **Browser menu → About & updates** show the app version; About also shows the GitHub Actions build number. The app checks downloads.hngroup.org.uk at startup (after 15 seconds) and every six hours. Staff can check manually, download the correct Mac/Windows installer, and open it from that screen. A badge appears when an update is available.

Downloads are restricted to the fixed downloads-site routes, version/build comparisons prevent downgrades, and the expected byte count and SHA-256 are checked before the installer becomes available and again before opening. Downloads stay in the private app-data updates folder, and incomplete or invalid downloads are removed. Opening requires confirmation and quits the browser. On Mac, drag the app from the disk image to Applications and replace it; on Windows, complete the installer. This is an installer-assisted update, not a silent bundle swap. Browser data is preserved.

The original 0.1.0 app predates this feature, so download 0.2.0 once from the downloads site to receive it.

## Run and build

Use Node.js 22.12+ (CI uses 24). On a Mac or Windows PC:

```sh
cd browser-app
npm ci
npm start
```

`npm test` runs URL and native sign-in tests. `npm run test:desktop` launches a real Electron app through Playwright with a temporary browser profile. The second desktop test streams real downloads through Electron and tests both search boxes with isolated website fixtures. Linux tests need a graphical display or `xvfb-run -a npm run test:desktop`; the VPS does not run a public browser GUI. `npm run icons` renders the approved existing HN favicon to app icons. Build with `npm run build:mac` on macOS or `npm run build:win` on Windows.

The GitHub Actions workflow uses native macOS and Windows runners. All tests and all platform builds must pass before it creates a `browser-vVERSION-RUN` preview release with the installers and SHA256SUMS.txt. The downloads site discovers those releases without GitHub credentials. No binaries or secrets are committed to the source repository.

The current preview uses ad-hoc macOS signing for local bundle integrity, not an Apple Developer identity or notarisation, and Windows installers have no publisher certificate. OS security warnings are expected. Trusted public distribution needs Apple Developer signing/notarisation and Windows code signing configured separately. No credentials are assumed or invented. macOS may ask for Keychain access again after updating an ad-hoc-signed preview build.

Electron is pinned to the latest checked stable release, 44.9.0 (19 October 2026), including native Intel and Apple-silicon Mac builds. Keep its security patches current and review platform support before moving to a new major version. Official references: https://www.electronjs.org/docs/latest/tutorial/security and https://www.electronjs.org/docs/latest/api/web-contents-view.

## Boundaries

The trusted browser toolbar has a sandboxed, context-isolated preload exposing only fixed browser actions. Every IPC call checks the sender and main frame. Remote websites have no preload, Node or access to browser identity. Navigation blocks file:, javascript:, arbitrary custom schemes and credential-bearing URLs. The browser carries only a one-use, 60-second, request-bound account offer in a header on top-level HN Auth home/authorize requests; the persistent credential never enters web contents, cookies, URLs or visited pages. Auth exchanges that offer for its normal staff-backed remembered-account cookie and still verifies the PIN before issuing an application code. Offers honour account switching, live revocation and existing application ACLs. Wrong PINs across the desktop and offered website flows count against the same remembered browser credential; five wrong attempts revoke it.

Native account sign-in uses a separate Auth partition and an HTTP listener bound only to 127.0.0.1 on an OS-assigned port. State, one-use codes and S256 PKCE bind the callback to the initiating app. Only the Auth server knows the staff integration secret; bearer tokens stay in the main process.

Camera/microphone, location and notification requests require an explicit native prompt from the active HTTPS tab. Certificate verification is never disabled for browsing. There is no custom shell execution or unprompted external-app launching.
