# HN Secure Access Terminal

Renamed from HN Secure Gateway on 14 November 2026. The new mark combines a terminal prompt and
secure-access padlock, using Midnight Lavender, teal and the approved HN colour stripe. The company
wordmark in product-logo exports is the unaltered approved HN Group SVG.

- `app-icon.svg` / `.png`: 1024px source artwork for desktop apps and website cards.
- `hn-secure-access-terminal-logo.svg` / `.png`: transparent product logo for light surfaces.
- `hn-secure-access-terminal-logo-white.svg` / `.png`: transparent product logo for dark surfaces.
- `tray.svg`: simplified terminal/lock mark for small system-tray sizes.
- `build.cjs`: renders PNGs and updates copies in Mac/Windows apps, App Manager, VPN/Downloads and Brand centre.
  Run with `node brand/secure-access-terminal/build.cjs` after installing Browser's development dependencies.
  Product SVGs embed the existing OFL Plus Jakarta Sans font; PNG rendering uses the bundled static bold font.

Bundle IDs, existing executable names, data folders, deep links and updater feed IDs stay compatible with
installed apps. App Manager recognises prior Gateway/Network names; the Windows installer removes their
old shortcuts. Mac updates replace the older .app name automatically. The website remains vpn.hngroup.org.uk.

Release versions: Mac 2.7.0, Windows/Linux 2.3.0, App Manager 3.3.0 and Browser 1.3.7. Website branding and
Brand centre downloads are deployed independently of desktop update availability. Tests use fixture
accounts, in-memory VPN controllers and a local SSH server; no production VPN connection was changed.

Published and verified: Mac 2.7.0 build 27 (`secure-network-v2.7.0-27`), Windows 2.3.0 build 10,
Linux 2.3.0 build 6, App Manager 3.3.0 build 18 and Browser 1.3.7 build 62. Source rebrand commit
`d23e7461163db69d3be706f85e04ff592626655c` on the existing app release branch. All five build workflows
completed successfully; App Manager's interrupted download checks passed on retry. Public Downloads
feeds and ranged installer requests were verified; the legacy Mac update ZIP was replaced only after
checking its exact SHA-256 and new bundle name. Local checks: 54 unit regressions, VPN regression after
updating the download filename, and Windows/Linux/App Manager desktop fixture workflows. No mobile QA.
