# HN Secure Network (Windows)

The HN Group VPN and SSH app for Windows 10 and 11 (64-bit), matching HN Secure Network for Mac. It
connects this PC to HN Group's server over the VPN: all of the PC's internet traffic goes through it,
and the server is 10.88.0.1 inside it. It also opens SSH sessions to that server in their own terminal
window, like the Mac app opens Terminal.

## HN Secure Network for Linux (Bazzite) — 2.1.0

The same app also runs on Linux x64 as an AppImage (`HN-Secure-Network-<version>-linux-x86_64.AppImage`), built for
Bazzite (the user's request, 27 October 2026) and working on Fedora and other NetworkManager desktops. Same window,
same PIN before every connection; the Linux parts:

- **Wording:** "computer" instead of "PC", "Match the system", "Open when I sign in" (`data-linux` attributes in
  `ui/index.html`, `pc()` in `ui/app.js`, from the state's `platform`).
- **VPN:** NetworkManager's built-in WireGuard (`LinuxController` in the shared `src/vpn.cjs`): the first step is ticked
  when NetworkManager is there; setting up imports the `hn-vpn` connection (your password at most once) and makes it
  your own, so connecting needs no prompt. Devices are named "<hostname> (Linux)".
- **SSH** (`src/linux-ssh.cjs`): opens in the desktop's own terminal (Konsole on KDE, Ptyxis/Console/GNOME Terminal
  on GNOME, then Xfce, MATE, Tilix, Alacritty, kitty, foot, WezTerm, xterm) running the system's OpenSSH with
  `-F /dev/null`, `PubkeyAuthentication=no`, `IdentityAgent=none`, `IdentityFile=none`: password only, never keys,
  agents or ~/.ssh/config. The server's key is fetched with `ssh-keyscan`, its SHA-256 fingerprint confirmed in the
  app the first time and then pinned (`StrictHostKeyChecking=yes` with a known-hosts file for that one key); a
  changed key is refused before any window opens. The password goes to ssh once through a self-deleting
  `SSH_ASKPASS` file in your private runtime folder (`$XDG_RUNTIME_DIR`, memory-backed), never a command line; it's
  deleted after two minutes even if unused. The app follows the session (signed in via ssh's `LocalCommand`, or how
  it ended). Needs `openssh-clients` (included in Bazzite and Fedora).
- **Open when I sign in:** `~/.config/autostart/hn-secure-network.desktop` (AppImage only).
- **Updates:** from `apps['secure-network-linux']` on downloads.hngroup.org.uk, verified, then the AppImage is swapped
  in place after the app quits and reopened (`src/appimage.cjs`).
- **Build:** `.github/workflows/secure-network-linux.yml` runs `npm test`, builds the AppImage on Ubuntu, publishes a
  `secure-network-linux-vX.Y.Z-N` release and commits `downloads-site/secure-network-linux.json`.
- **Tests:** `test/linux-ssh.test.cjs` drives the real OpenSSH client against a local SSH server (skipped without
  OpenSSH); `test/linux-desktop.cjs` runs the whole desktop journey as the Linux app (screenshots `screenshots/linux-*`).

Version 2.0.0 is a rebuild from the ground up (the user's request, 23 October 2026: "completely rebuild
it"): a new interface that is built once and updated in place, every question asked in the window in the
HN Group design (never a plain Windows box), the PIN before every connection, and SSH in a terminal window.

## Using it

1. Download it from https://downloads.hngroup.org.uk (HN Secure Network → Download for Windows) and run
   the installer. Preview builds aren't code-signed yet: if SmartScreen asks, choose **More info → Run anyway**.
2. **Sign in with HN Group Auth.** Your browser opens HN Group Auth (password and six-digit PIN). The
   one-time code comes straight back to the app on this PC (a loopback address); nothing is pasted.
3. **Install WireGuard for Windows** if asked. The app downloads the official installer, checks it is
   signed by WireGuard LLC and runs it (Windows asks first).
4. **Set up this PC.** This makes a key on this PC (it never leaves it), registers the PC on the VPN
   and installs the connection as the `WireGuardTunnel$hn-vpn` service. Windows asks for permission once.
   HN Browser on the same PC controls the same connection.
5. **Connect** with the big button (or **Connect…** in the tray). Every connection asks for your six-digit
   HN Group PIN: vpn.hngroup.org.uk checks it with the staff backend (`/api/app/verify-pin` →
   `/api/auth/vpn-pin`), which locks after five wrong tries for 15 minutes. A wrong PIN shakes and clears.
6. **SSH**: the username is filled in and remembered (root by default); type the server password and
   choose **Open in a terminal window** (if the VPN is off, the PIN comes first and it connects). The
   session opens in Windows Terminal or the console, whichever Windows uses. The password is handed once
   to that window and never saved; it signs in with the password only, and SSH keys on this PC (such as
   the one made for ChatGPT/Codex) are never read or offered. The first time, the app shows the server's
   SHA-256 fingerprint to check; after that the window refuses to connect if it ever changes.

Closing the window keeps the app in the system tray. **Settings** has: open when you sign in to Windows,
ask to connect when the app opens (it opens on the PIN), light/dark/match Windows, check for updates,
reinstall the configuration, remove this PC and sign out (both asked first, in the window).

## How it works

- `src/main.cjs`: window (its own title bar; Windows draws the buttons), tray, VPN, PIN, WireGuard,
  updates, and the questions it asks in the window (`ask()` → `sn:dialog`). `src/preload.cjs` is the only
  bridge. `ui/index.html` holds every screen; `ui/app.js` keeps it up to date from the state, so nothing
  is redrawn while you type and animations (transform/opacity only, off with reduce motion) play only
  when something changes.
- `src/vpn.cjs` and `src/vault.cjs` are **identical copies** of `browser-app/src/…` (`test/shared.test.cjs`
  checks this). Change both together. Sign-ins say `X-HN-VPN-Client: secure-network`.
- The PIN is a check by the server before the app turns the tunnel on; it isn't enforced inside WireGuard
  itself (an administrator on the PC could still start the service by hand).
- SSH: `src/terminal.cjs` opens a one-time loopback address and starts `HN Secure Network SSH.exe`
  (`src/ssh-console.cjs`, built by `scripts/ssh-helper.cjs` into a Node single executable with ssh2
  bundled, shipped in `resources/ssh`). The window proves itself with a single-use ticket, receives the
  server, username and password once, and asks the app to confirm the server's fingerprint the first time.
  The app keeps only the username and fingerprint (`ssh.json`).
- Only the VPN sign-in token is stored, encrypted with Windows DPAPI (`vpn.enc` in the app's data folder).
  The device's private key lives only in `C:\ProgramData\HN Group\VPN\hn-vpn.conf`
  (SYSTEM and Administrators only).
- Updates: the app checks https://downloads.hngroup.org.uk/api/releases at start-up and every six hours.
  The record is `apps['secure-network-windows']`, with version, build, size and SHA-256. The installer
  is downloaded, checked twice, then run silently (`/S --force-run`), and the app reopens.

## Releasing

Bump `version` in `package.json` and push. `.github/workflows/windows-vpn-app.yml` builds the SSH window
and the installer on GitHub's Windows runner (build number = run number). It publishes a
`secure-network-windows-vX.Y.Z-N` preview release and commits `downloads-site/secure-network-windows.json`.
The downloads site and the in-app updater pick that up within a few minutes. The workflow only builds and
publishes; run the tests first:

```sh
cd windows-vpn-app && npm ci && npm test && xvfb-run -a npm run test:desktop
# Optional: the same SSH checks against the built SSH window
npm run ssh-helper && HN_SSH_HELPER="$PWD/build/ssh/hn-secure-network-ssh" node --test test/terminal.test.cjs
```

The desktop test drives the real app (sign-in, setup, a wrong and a right PIN, SSH in its own window
against a real local SSH server with checks that no key is offered and the server is confirmed in the
app, a wrong SSH password, profile, settings, a verified update, the tray's Connect, sign-out, and no
plain Windows boxes) against stand-ins and saves light/dark screenshots in `screenshots/`. Real WireGuard
control, the silent installer and the SSH window in Windows Terminal need checking on a real Windows PC.
