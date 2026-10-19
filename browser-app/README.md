# HN Browser · preview

A Chromium browser built with Electron, for macOS (Apple silicon and Intel) and Windows x64. The browser and installers are separate from the VPS websites. Downloads: https://downloads.hngroup.org.uk.

## Included

- HN site shortcuts in both search boxes: names such as “staff portal”, “wiki” and “Horizon Development” open the canonical site. Case, spaces, common one-character typos/transpositions (including “staff portak”) and phrases such as “go to staff portal” are recognised. Ambiguous/unrelated text still searches the web; explicit URLs are preserved. The fixed public-site list lives in `src/sites.cjs` and is tested against website control’s catalog.
- Downloads manager in the toolbar and browser menu: live progress, speed/size, pause/resume, cancel, retry, reveal saved files and clear finished history. Save dialogs remain native. History is private to this device; clearing it keeps the files. Interrupted transfers after an app restart can be retried. Resume support depends on the source server; Electron may restart non-resumable transfers.
- Real Chromium tabs, back/forward, reload/stop, address/search bar, new-tab page, per-device browsing cookies and a native save dialog for downloads.
- **Midnight Lavender** by default. Daylight, Deep Ocean, Forest and Rose Quartz can be chosen in the toolbar; the theme is remembered on this device.
- Integrated title bar with native macOS/Windows window controls, draggable tab strip, animated menus and new-tab page, keyboard navigation and reduced-motion support.
- HN account sign-in using the existing Auth password/PIN/setup/remembered-account screens. The browser account panel shows the person's display name, staff profile picture, email, role and company. The toolbar also shows their profile picture; missing/unavailable pictures fall back to initials. When the browser account is unlocked, HN Group Auth recognises it on website sign-in and asks for the six-digit PIN. Each website still enforces its own permissions. “mail” and “gmail” open Gmail.
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

Electron is pinned to the latest checked 43.x patch so both Intel and Apple-silicon Mac builds are available. Keep its security patches current and review platform support before moving to a new major version. Official references: https://www.electronjs.org/docs/latest/tutorial/security and https://www.electronjs.org/docs/latest/api/web-contents-view.

## Boundaries

The trusted browser toolbar has a sandboxed, context-isolated preload exposing only fixed browser actions. Every IPC call checks the sender and main frame. Remote websites have no preload, Node or access to browser identity. Navigation blocks file:, javascript:, arbitrary custom schemes and credential-bearing URLs. The browser carries only a one-use, 60-second, request-bound account offer in a header on top-level https://auth.hngroup.org.uk/authorize requests; the persistent credential never enters web contents, cookies, URLs or visited pages. Auth exchanges that offer for its normal staff-backed remembered-account cookie and still verifies the PIN before issuing an application code. Offers honour account switching, live revocation and existing application ACLs. Wrong PINs across the desktop and offered website flows count against the same remembered browser credential; five wrong attempts revoke it.

Native account sign-in uses a separate Auth partition and an HTTP listener bound only to 127.0.0.1 on an OS-assigned port. State, one-use codes and S256 PKCE bind the callback to the initiating app. Only the Auth server knows the staff integration secret; bearer tokens stay in the main process.

Camera/microphone, location and notification requests require an explicit native prompt from the active HTTPS tab. Certificate verification is never disabled for browsing. There is no custom shell execution or unprompted external-app launching.
