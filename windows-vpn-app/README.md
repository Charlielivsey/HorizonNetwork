# HN Secure Network (Windows)

The HN Group VPN and SSH app for Windows 10 and 11 (64-bit), matching HN Secure Network for Mac. It
connects this PC to HN Group's server over the VPN: all of the PC's internet traffic goes through it,
and the server is 10.88.0.1 inside it. It also opens SSH sessions to that server.

## Using it

1. Download it from https://downloads.hngroup.org.uk (HN Secure Network → Download for Windows) and run
   the installer. Preview builds aren't code-signed yet: if SmartScreen asks, choose **More info → Run anyway**.
2. **Sign in with HN Group Auth.** Your browser opens HN Group Auth (password and six-digit PIN). The
   one-time code comes straight back to the app on this PC (a loopback address); nothing is pasted.
3. **Install WireGuard for Windows** if asked. The app downloads the official installer, checks it is
   signed by WireGuard LLC and runs it (Windows asks first).
4. **Set up this PC.** This makes a key on this PC (it never leaves it), registers the PC on the VPN
   and installs the connection as the `WireGuardTunnel$hn-vpn` service. Windows asks for permission
   once. After that, connecting and disconnecting need no prompt. HN Browser on the same PC controls
   the same connection.
5. Use the big button (or the tray icon) to connect. **SSH** signs in to the server inside the app:
   the username is filled in and remembered (root by default), and you type the server password,
   which is used once and never saved. It signs in with the password only: SSH keys on this PC
   (such as one made for another tool) are never read or offered. The first time, the app shows the
   server's SHA-256 fingerprint to check, and it refuses to connect if that key ever changes.

Closing the window keeps the app in the system tray. **Settings** has: open when you sign in to Windows,
connect automatically, light/dark/match Windows, check for updates, reinstall the configuration,
remove this PC and sign out. Signing out disconnects and removes this PC from the VPN.

## How it works

- Electron app: `src/main.cjs` (window, tray, VPN, SSH, WireGuard, updates), `src/preload.cjs` (the
  only bridge), `ui/` (screens; `ui/terminal.js` is the pinned xterm terminal, copied into `ui/vendor` on install).
- `src/vpn.cjs`, `src/vault.cjs` and `src/ssh.cjs` are **identical copies** of `browser-app/src/…`
  (`test/shared.test.cjs` checks this). Change both together. Sign-ins say `X-HN-VPN-Client: secure-network`,
  so the VPN website shows them as HN Secure Network.
- Only the VPN sign-in token is stored, encrypted with Windows DPAPI (`vpn.enc` in the app's data folder).
  The device's private key lives only in `C:\ProgramData\HN Group\VPN\hn-vpn.conf`
  (SYSTEM and Administrators only).
- Updates: the app checks https://downloads.hngroup.org.uk/api/releases at start-up and every six hours.
  The record is `apps['secure-network-windows']`, with version, build, size and SHA-256. The installer
  is downloaded, checked twice, then run silently (`/S --force-run`), and the app reopens.

## Releasing

Bump `version` in `package.json` and push. `.github/workflows/windows-vpn-app.yml` builds the installer
on GitHub's Windows runner (build number = run number). It publishes a `secure-network-windows-vX.Y.Z-N`
preview release and commits `downloads-site/secure-network-windows.json`. The downloads site and the
in-app updater pick that up within a few minutes. The workflow only builds and publishes; run the tests first:

```sh
cd windows-vpn-app && npm ci && npm test && xvfb-run -a npm run test:desktop
```

The desktop test drives the real app (sign-in, setup, connect, SSH against a real local SSH server with
a check that no key is offered, profile, settings, a verified update, sign-out) against stand-ins and saves light/dark screenshots in `screenshots/`. Real WireGuard
control and the silent installer need checking on a real Windows PC.
