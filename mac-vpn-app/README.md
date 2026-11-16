# HN Secure Access Terminal (macOS)

The HN Group VPN app for Mac, renamed Secure Access Terminal: it connects this Mac to HN Group's server over
the VPN (all of the Mac's traffic goes through it; the server is 10.88.0.1 inside it) and opens SSH sessions to the server from its
SSH page, with the address and username filled in and only the password asked for.


A menu bar app for HN Group staff. It signs in with your HN Group staff account through HN Group
Auth in your browser, registers this Mac on the HN Group VPN with a key made on the Mac (the private key
never leaves it), and connects with one switch. All internet traffic then goes through HN Group's
server (217.154.34.205).

## Getting the app

- **Built for you:** every push that changes `mac-vpn-app/` builds the app on GitHub's Mac runners
  (Actions → "Build HN Secure Access Terminal for Mac" → artifact `HN-Secure-Network-macOS`). An administrator then
  publishes the zip on https://vpn.hngroup.org.uk (All devices → Publish the Mac app), and staff
  download it from there.
- **Build it yourself** on a Mac with Xcode or the Command Line Tools: `bash mac-vpn-app/build.sh`.

The app isn't notarised by Apple, so the first time you open it, right-click it and choose **Open**.

## This device must be approved

Since 2.5.0 the app only opens, and only updates, on a Mac approved on devices.hngroup.org.uk
(`Sources/Device.swift`, sharing the identity files with HN Browser and HN Group App Manager in
`~/Library/Application Support/HN Group/Device`). Until then the window and the menu bar show "This device is not
authorised" with the code to add the Mac; it opens by itself once approved, and turns the VPN off if the Mac is revoked.

## Using it

1. Open **HN Secure Access Terminal**; a shield appears in the menu bar.
2. Choose **Sign in with HN Group Auth**, sign in in your browser, and allow it to open HN Secure Access Terminal.
3. If asked, choose **Install WireGuard tools** (uses Homebrew: `brew install wireguard-tools`).
4. Choose **Set up this Mac** and enter your Mac password once. This installs a small helper
   (`/usr/local/libexec/hn-vpn/hn-vpn-ctl`), this Mac's VPN configuration (root-only, in
   `/usr/local/etc/hn-vpn/`) and a rule that lets you connect without a password each time.
5. Use the switch to connect or disconnect. Every connection asks for your six-digit HN Group PIN first
   (in the window or the menu bar); vpn.hngroup.org.uk checks it with the staff backend, which locks
   after five wrong tries for 15 minutes. **Sign out** disconnects and removes this Mac from the VPN.

Requires macOS 13 (Ventura) or later, on Apple silicon or Intel.

## Versions and updates

The version is in `VERSION` (for example 1.1.0); each GitHub Actions build gets the run number as its
build number. The app checks vpn.hngroup.org.uk for a newer build when it starts and every six hours
(or from **Settings → Check for updates**). **Update now** downloads the new build, checks its SHA-256
and signature, swaps it in place and reopens the app: there's no need to download it again from the
website. To release a new version, bump `VERSION` and push; CI builds and publishes it, and the VPS
update command makes it available.

### 3.0 Mac workspace redesign

The Connection, SSH, Profile, Settings, sign-in and setup screens use compact HN staff-theme cards and flat actions. The fixed-size menu panel switches between connection controls, SSH and the VPN PIN without resizing; it remains beneath the menu bar. Connection labels report WireGuard state and SSH reachability, rather than treating the VPN website’s source IP as proof of an Internet exit address.

The red close button removes the app from the Dock while the menu-bar controls and VPN stay running. Open Secure Access Terminal from the menu bar or reopen the app to restore the main window and Dock icon. Quit still exits the app. VPN connections continue to require the HN Group PIN. SSH passwords are used once, cleared from the forms and never saved.

Mac CI runs `--test-window-lifecycle` against real AppKit windows and captures every page in light/dark appearance. Tunnel connectivity still requires validation on a real connected Mac.

### 3.1 Mac app presentation

Replaces the website-style sidebar and card dashboard with a compact Mac app frame, navigation rail and integrated toolbar. A purpose-drawn private-route illustration and focused connection controls share the main screen. SSH has a dedicated terminal preview and credential form; Profile has Devices, Sign-ins and Activity tabs; Settings uses grouped preference rows. Matching actions, typography and menu-bar presentation retain the approved HN wordmark and palette.

Every main screen is captured at the normal 980×680 window size; Connection and SSH also at the minimum 880×620. CI checks the profile tabs, both appearances and the existing Dock/menu-window lifecycle. VPN, identity, PIN, one-use password and updater behaviour are unchanged.

### 3.1.1 Manual connection and interaction polish

PIN entry now requires an explicit Connect/Return action; typing the sixth digit never starts verification or the VPN. Launch/sign-in/status refresh do not start the tunnel. Shared confirmation controls in the main window and menu bar use the current app typography and surfaces. The menu panel uses matching compact chrome and explicit connection/terminal controls.

Connection buttons wait only for the helper operation and local state, without the old fixed delay or redundant public-IP requests. Server diagnostics run independently, duplicate refresh/probe work is coalesced, route artwork renders asynchronously, bundled artwork is decoded once, and animated avatars are not restarted on unrelated view updates. Broad navigation/PIN spring animations are removed. A native macOS toolbar aligns branding with the standard window controls; CI captures the actual Window scene as well as page fixtures and types six digits into the real secure field to verify manual confirmation.
