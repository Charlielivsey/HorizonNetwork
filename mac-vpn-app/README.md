# HN Group Secure Terminal (macOS)

The HN Group VPN app for Mac, renamed Secure Terminal: it connects this Mac to HN Group's server over
the VPN (only traffic to the server, 10.88.0.1, uses it) and opens SSH sessions to the server from its
SSH page, with the address and username filled in and only the password asked for.


A menu bar app for HN Group staff. It signs in with your HN Group staff account through HN Group
Auth in your browser, registers this Mac on the HN Group VPN with a key made on the Mac (the private key
never leaves it), and connects with one switch. All internet traffic then goes through HN Group's
server (217.154.34.205).

## Getting the app

- **Built for you:** every push that changes `mac-vpn-app/` builds the app on GitHub's Mac runners
  (Actions → "Build HN Group VPN for Mac" → artifact `HN-Group-VPN-macOS`). An administrator then
  publishes the zip on https://vpn.hngroup.org.uk (All devices → Publish the Mac app), and staff
  download it from there.
- **Build it yourself** on a Mac with Xcode or the Command Line Tools: `bash mac-vpn-app/build.sh`.

The app isn't notarised by Apple, so the first time you open it, right-click it and choose **Open**.

## Using it

1. Open **HN Group VPN**; a shield appears in the menu bar.
2. Choose **Sign in with HN Group Auth**, sign in in your browser, and allow it to open HN Group VPN.
3. If asked, choose **Install WireGuard tools** (uses Homebrew: `brew install wireguard-tools`).
4. Choose **Set up this Mac** and enter your Mac password once. This installs a small helper
   (`/usr/local/libexec/hn-vpn/hn-vpn-ctl`), this Mac's VPN configuration (root-only, in
   `/usr/local/etc/hn-vpn/`) and a rule that lets you connect without a password each time.
5. Use the switch to connect or disconnect. **Sign out** disconnects and removes this Mac from the VPN.

Requires macOS 13 (Ventura) or later, on Apple silicon or Intel.

## Versions and updates

The version is in `VERSION` (for example 1.1.0); each GitHub Actions build gets the run number as its
build number. The app checks vpn.hngroup.org.uk for a newer build when it starts and every six hours
(or from **Settings → Check for updates**). **Update now** downloads the new build, checks its SHA-256
and signature, swaps it in place and reopens the app: there's no need to download it again from the
website. To release a new version, bump `VERSION` and push; CI builds and publishes it, and the VPS
update command makes it available.
