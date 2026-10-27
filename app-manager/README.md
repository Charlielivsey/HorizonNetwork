# HN Group App Manager

The desktop app that installs, updates, repairs and looks after HN Browser and HN Secure Network, for macOS
(Apple silicon and Intel; HN Browser itself needs Apple silicon) and Windows 10/11 x64.

## Linux (Bazzite) — 3.1.0

App Manager 3.1.0 also runs on Linux x64 as an AppImage (`HN-Group-App-Manager-<version>-linux-x86_64.AppImage`),
built for Bazzite (the user's request, 27 October 2026) and working on Fedora and other desktops
(`src/core/linux.cjs`):

- **Installing** puts the checked AppImage in `~/Applications` under a fixed name (`HN-Browser.AppImage`,
  `HN-Secure-Network.AppImage`) in one step, and adds it to the app menu (`~/.local/share/applications/<id>.desktop`
  with its icon). Copies kept in `~/AppImages` or `~/.local/bin` (also with the version in the name) are found too.
- **Versions** come from App Manager's own record (`linux-apps.json`), the release's SHA-256 (so an app that updated
  itself is recognised), the file name, or the AppImage's desktop entry, read without running the app.
- **Open apps** are found from `/proc` (the AppImage's runtime, or a process started from it); changes wait until
  they're quit, as on Mac and Windows.
- **Removing** moves the AppImage to the Bin (restorable) and takes it out of the app menu; HN Secure Network's
  autostart entry goes too. `~/.config/<app>` is never touched.
- **Settings** go to the apps' own `~/.config/HN Browser` and `~/.config/HN Secure Network`; turning on HN Secure
  Network's "Open when I sign in" also writes its autostart entry.
- **Itself:** run from a download, it offers **Install** (copies itself to `~/Applications`, adds itself to the menu
  and reopens); its own updates are staged, verified and swapped in after it quits. "Open at sign-in" is
  `~/.config/autostart/hn-group-app-manager.desktop`.
- **Tests:** `test/linux.test.cjs` (pretend home folder). CI builds the AppImage on Ubuntu alongside Mac and Windows,
  self-checks it under Xvfb, and the publish step records `downloads-site/app-manager-linux.json`.

Version 3.0.0 is a rebuild from scratch (the user's request, 26 October 2026: "completely rebuild the app manager
from scratch. it is buggy and doesnt work right. it also needs to have its own in app updates"). Only the shared
pieces were kept: HN Group sign-in (`src/account.cjs`, `src/vault.cjs`) and the device check (`src/device*.cjs`,
`ui/device.*`, identical in HN Browser and HN Secure Network for Windows). Earlier versions: 2.0.0 (queue, a page
per app) and 2.1.0 (HN Group Auth, device authorisation, Mac self-update fixes).

## What it does

- **Apps:** each app with its installed and latest version, whether it's open, and one clear button (Install,
  Update, Open); the "…" menu has Reinstall, Show in folder and Remove. **Update all** and **Check for updates**.
- **A page for each app:** versions (with release date and size), where it is, its **settings** grouped as in the
  app with a save bar (saved while the app is closed; unknown keys are kept), and a danger zone for removal.
- **One change at a time** from a queue, shown in a dock with progress and what's next. A change for an app that's
  open **waits until you quit it** (App Manager never stops another app) and can be cancelled; automatic updates
  skip open apps.
- **Updates page:** App Manager's own update (below) and the app updates, with **Keep App Manager up to date by
  itself** (on by default), **Check automatically** (at start and every six hours) and **Install app updates by
  themselves** (off by default).
- **Activity:** installs, updates, settings changes, removals, sign-ins and problems, kept between runs.
- **Settings:** account (sign out, lock), this device, light/dark/match the computer, keep running in the menu bar
  or tray, open at sign-in, notifications, and **Diagnostics**: **Run a check** (downloads service, release
  records, finding each app, reading settings), **Copy diagnostics** (versions, location, the check and the last
  log lines, with secrets removed) and **Open the log folder**.
- Every question is a card in the window in the HN design, never a plain system box. The safe choice has focus;
  Escape cancels. It follows the standard HN Group theme throughout.
- Sign-in through HN Group Auth in the default browser (Auth's `app-manager` client, S256 PKCE, one-use loopback
  callback), remembered with an encrypted revocable token; it opens locked on the six-digit PIN and locks after
  15 minutes hidden. It only opens on a computer approved on devices.hngroup.org.uk.

## Its own in-app updates

`src/core/updater.cjs` checks the downloads feed for `app-manager-mac`/`app-manager-windows` with every check.
When there's a newer build it downloads it in the background (size + SHA-256, checked again before use), stages it
(Mac: unpacked into a private folder and checked for bundle id, version and signature; Windows: the verified
installer) and records it in `updates/staged.json`, so it survives a restart. The sidebar, tray and Updates page
then offer **Restart to update**; with **Keep App Manager up to date by itself** on, it also installs when you quit.
On Windows the installer runs silently (`/S`, `--force-run` to reopen). On a Mac a detached script waits for App
Manager to quit, copies the new app beside the installed one and swaps them (an administrator prompt only when the
folder needs one), puts the old copy back if anything fails, and reopens it. A copy running from the disk image or
Downloads offers **Move to Applications**, and its update installs into Applications. A staged update that's no
longer newer is tidied away at start.

## Safety

Only strictly validated assets from `https://downloads.hngroup.org.uk/api/releases` are used (exact app, platform,
file name and download route). Mac zips are checked for unsafe paths and links, exactly one app, the bundle id and
version and the code signature before they're swapped in with backup and rollback. On Windows the verified NSIS
installer runs, and removal only uses an `Uninstall….exe` inside the app's registered folder. Removing a Mac app
moves it to the Bin; account data, settings and VPN set-up are always kept. It never reads account tokens, browser
data, SSH secrets or WireGuard keys, and the log removes anything that looks like a code, PIN, token or secret.
The window has no Node access: `src/preload.cjs` exposes one request channel, and the main process checks the
sender and allows only a fixed list of requests (most need the account unlocked).

## Code

- `src/main.cjs`: the window, tray, notifications, questions, sign-in/lock and the request list.
- `src/core/manager.cjs`: app state, checks, the queue, waiting for apps to close, settings.
- `src/core/updater.cjs`: App Manager's own update. `src/core/feed.cjs`: the release feed and checked downloads.
- `src/core/macos.cjs`, `src/core/windows.cjs`: everything that touches the computer.
- `src/core/catalog.cjs`, `settings.cjs`, `store.cjs`, `log.cjs`, `self-check.cjs`.
- `src/core/fake.cjs`, `src/core/test-fixtures.cjs`: a pretend PC and release feed for the tests (left out of builds).
- `ui/index.html`, `ui/app.js`, `ui/style.css`: the window (built once and updated in place).

## Testing and releasing

```sh
cd app-manager && npm ci && npm test && xvfb-run -a npm run test:desktop
```

The desktop test drives the real app on the pretend PC with a local feed (not-authorised window, sign-in and PIN,
an update waiting for the app to be quit, install, settings, the "…" menu, removal, its own update, activity,
preferences, diagnostics, locking) and saves light and dark screenshots in `screenshots/`. Bump `version` in
`package.json` and push: `.github/workflows/app-manager.yml` runs the tests, runs the real Mac swap scripts on a
Mac (`npm run test:mac-swap`), builds the universal Mac zip/DMG and the Windows installer, then runs the **built
app** with `--self-check=<file>` on the Mac and Windows runners (downloads service, release records, finding apps,
reading settings, and downloading and staging its own update exactly as a real update would). Only then does it
publish a preview release and record `downloads-site/app-manager-mac.json` and `app-manager-windows.json`. Preview
builds aren't developer-signed or notarised.
