# HN Group App Manager

The desktop app that installs, updates, repairs and looks after HN Browser and HN Secure Network, for macOS
(Apple silicon and Intel; HN Browser itself needs Apple silicon) and Windows 10/11 x64.

Version 2.0.0 is a rebuild on the original's safe core (the user's request, 23 October 2026: "completely rebuild
the app manager, i like the base it has made, but it can heavily be improved").

Version 2.1.0 (the user's request, 23 October 2026, on a Mac: "it is far too buggy", "there needs to be a way to
update the app manager without having to redownload it every time", "add in HN Group Authentication", and a
device must be authorised to use, update or reinstall the apps):

- **This device is not authorised:** it only opens on a computer approved on devices.hngroup.org.uk (the shared
  `src/device.cjs`/`device-gate.cjs`/`ui/device.*`, identical in HN Browser and HN Secure Network for Windows).
  Installs, updates, reinstalls and its own update are refused on an unapproved computer, and it hides behind the
  "not authorised" window if the computer is revoked while open.
- **HN Group Authentication:** sign in through HN Group Auth in the default browser (Auth's public `app-manager`
  client, S256 PKCE, one-use loopback callback; `src/account.cjs`). The account is remembered with an encrypted,
  revocable token (`src/vault.cjs`, `account.enc`) and App Manager opens locked on the six-digit PIN every time
  (and locks after 15 minutes hidden in the menu bar or tray). Nothing but the theme can change until it's unlocked.
- **Mac fixes:** app settings go to the apps' real data folders (`HN Browser`, `HN Secure Network`, Electron's
  productName; 2.0 wrote to the wrong folders); new Mac installs go in /Applications when it's writable.
- **Updates itself reliably:** the Mac update runs from a private folder, copies and swaps after App Manager
  quits, asks for an administrator only when the folder needs one, always reopens (the old copy if the swap
  failed), and a copy running from the disk image or Downloads (translocated) offers **Move to Applications**
  first. Settings has **Check for App Manager updates** and **Keep App Manager up to date by itself** (on by
  default: its own update installs while you're not using it), and the overview shows a one-click banner.
- It follows the standard HN Group theme throughout, sign-in, PIN and device screens included.

## What it does

- **Overview:** what's installed and what has an update, with **Update all**, a card per app and **Check for updates**.
- **A page for each app:** install, update, reinstall a fresh copy, open, show in folder and remove; the installed
  and latest versions (with release date and size), whether it's open, where it is, and its **settings** grouped
  as in the app (saved while the app is closed; they apply when it next opens; unknown keys are kept).
- **One change at a time** from a queue, shown in a dock with progress, speed and what's next. A change for an
  app that's open **waits until you quit it** (App Manager never stops another app) and can be cancelled.
- **Activity:** a history of installs, updates, settings changes, removals and problems, kept between runs (200 entries).
- **Settings:** light/dark/match the computer; check automatically (at start and every six hours); notify when
  updates are ready; install app updates by themselves (only apps that are closed); keep running in the menu bar
  or system tray; open at sign-in (it starts quietly in the background).
- **Updates itself in place:** the verified installer runs silently on Windows (`/S --force-run`); on a Mac the
  checked app is staged next to the running one and swapped in after it quits, then reopened (the old copy is put
  back if the swap fails). If its folder can't be changed, it says so and points to downloads.hngroup.org.uk.
- Every question (install, reinstall, remove, clear history, update App Manager, closing while busy) is a card in
  the window in the HN design: never a plain system box. The safe choice has focus; Escape cancels.

## Safety

Only strictly validated assets from `https://downloads.hngroup.org.uk/api/releases` are used (exact app, platform,
file name and download route). Downloads are size- and SHA-256-checked, and checked again just before they run.
Mac zips are checked for unsafe paths and links, exactly one app, the bundle id and version, and the code
signature, then staged beside the target with backup and rollback; protected Applications folders use macOS's
administrator prompt. On Windows the verified NSIS installer runs, and removal only uses an `Uninstall….exe`
inside the app's registered folder. Removing a Mac app moves it to the Bin; account data, settings and VPN set-up
are always kept. It never reads account tokens, browser data, SSH secrets or WireGuard keys. The window has no
Node access: `src/preload.cjs` exposes a fixed list of requests and the main process checks each sender.

## Code

- `src/main.cjs`: state, queue, waiting, notifications, tray, window and requests.
- `src/system.cjs`: finding apps, whether they're running, waiting for them to close, installing, removing, settings.
- `src/releases.cjs`: the release feed and checked downloads. `src/settings.cjs`: each app's settings.
- `src/store.cjs`: App Manager's preferences and activity. `src/self-update.cjs`: updating itself and Move to Applications.
- `src/account.cjs`, `src/vault.cjs`: the HN Group account. `src/device.cjs`, `src/device-gate.cjs`, `src/device-preload.cjs`, `ui/device.*`: the device check (shared copies).
- `ui/index.html`, `ui/app.js`, `ui/style.css`: the window (built once and updated in place).
- `src/fake-system.cjs`: a pretend Windows PC for the desktop test only (left out of builds).

## Testing and releasing

```sh
cd app-manager && npm ci && npm test && xvfb-run -a npm run test:desktop
```

The desktop test drives the real app on the pretend PC with a local release feed (overview, an update waiting for
the app to be quit, installing, settings, reinstalling, cancelling, removing, activity, preferences, its own update
and isolation) and saves light and dark screenshots in `screenshots/`. Bump `version` in `package.json` and push:
`.github/workflows/app-manager.yml` builds the universal Mac zip/DMG and the Windows installer, publishes a preview
release and records `downloads-site/app-manager-mac.json` and `app-manager-windows.json`. Preview builds aren't
developer-signed or notarised. Real installs, removals, login items and the self-update swap need checking on a
real Mac and PC; the Linux tests don't exercise those operating-system services.
