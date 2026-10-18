# HN Browser · first preview

A Chromium browser built with Electron, for macOS (Apple silicon and Intel) and Windows x64. The browser and installers are separate from the VPS websites. Downloads: https://downloads.hngroup.org.uk.

## Included

- Real Chromium tabs, back/forward, reload/stop, address/search bar, new-tab page, per-device browsing cookies and a native save dialog for downloads.
- **Midnight Lavender** by default. Daylight, Deep Ocean, Forest and Rose Quartz can be chosen in the toolbar; the theme is remembered on this device.
- HN account sign-in using the existing Auth password/PIN/setup/remembered-account screens. The browser account panel shows the person's display name, email, role and company. Browser identity does not grant website permissions or automatically sign into other sites.
- Ctrl/Command+T, W, L and R, plus the standard Edit menu and full-screen controls.

This first preview does not include Chrome extensions, a password manager, browser-data/account sync, default-browser registration or automatic application updates. Native identity is held in memory and rechecked each minute; the app asks for sign-in after restart. Auth can remember the browser's account but still requires its existing PIN. Normal website cookies remain in the browsing partition.

## Run and build

Use Node.js 22.12+ (CI uses 24). On a Mac or Windows PC:

```sh
cd browser-app
npm ci
npm start
```

`npm test` runs URL and native sign-in tests. `npm run test:desktop` launches a real Electron app through Playwright with a temporary browser profile. Linux tests need a graphical display or `xvfb-run -a npm run test:desktop`; the VPS does not run a public browser GUI. `npm run icons` renders the approved existing HN favicon to app icons. Build with `npm run build:mac` on macOS or `npm run build:win` on Windows.

The GitHub Actions workflow uses native macOS and Windows runners. All tests and all platform builds must pass before it creates a `browser-vVERSION-RUN` preview release with the installers and SHA256SUMS.txt. The downloads site discovers those releases without GitHub credentials. No binaries or secrets are committed to the source repository.

The current preview uses ad-hoc macOS signing for local bundle integrity, not an Apple Developer identity or notarisation, and Windows installers have no publisher certificate. OS security warnings are expected. Trusted public distribution needs Apple Developer signing/notarisation and Windows code signing configured separately. No credentials are assumed or invented.

Electron is pinned to the latest checked 43.x patch so both Intel and Apple-silicon Mac builds are available. Keep its security patches current and review platform support before moving to a new major version. Official references: https://www.electronjs.org/docs/latest/tutorial/security and https://www.electronjs.org/docs/latest/api/web-contents-view.

## Boundaries

The trusted browser toolbar has a sandboxed, context-isolated preload exposing only fixed browser actions. Every IPC call checks the sender and main frame. Remote websites have no preload, Node or access to browser identity. Navigation blocks file:, javascript:, arbitrary custom schemes and credential-bearing URLs. Native account sign-in uses a separate Auth partition and an HTTP listener bound only to 127.0.0.1 on an OS-assigned port. State, one-use codes and S256 PKCE bind the callback to the initiating app. Only the Auth server knows the staff integration secret; bearer tokens stay in the main process.

Camera/microphone, location and notification requests require an explicit native prompt from the active HTTPS tab. Certificate verification is never disabled for browsing. There is no custom shell execution or unprompted external-app launching.
