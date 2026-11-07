# HN Group: core memory

Full project history and rules (always read and follow):

@AGENTS.md

## Working rules
- Work on `claude/confident-volta-gxjboo`: it is the most up-to-date branch. Other `claude/*` branches (vps-welcome-screen, nifty-hawking, magical-wozniak, sweet-cannon, upbeat-fermi, zealous-babbage, vibrant-knuth) are old.
- **HN Secure Enclave (`hn-terminal/`) is old: ignore it.** The current desktop apps are HN Secure Gateway (formerly HN Secure Network; `mac-vpn-app/`, `windows-vpn-app/` for Windows and Linux), HN Browser (`browser-app/`) and HN Group App Manager (`app-manager/`).
- The old root files from before HN Group (`website/`, `nginx-horizon.conf`, `setup-websites.sh`, `welcome.sh`, `setup-welcome.sh`) are not the current websites or welcome screen; the welcome is `vps-welcome/`.
- VPS: 217.154.34.205 (inside the VPN: 10.88.0.1). Update command: `cd /root/HorizonNetwork && git pull && sudo bash install.sh` (welcome-only changes: `sudo bash vps-welcome/install.sh`).
- Every new website goes, in the same change, into HN Group Sites (`links-site/sites.json`), website control's catalogue (`admin-site/lib/catalog.js`, `admin-site/catalog.json`, `admin-site/integrate-nginx.py`, site count in `admin-site/test.cjs`), the root `install.sh`, HN Group Auth if it signs staff in, and Cloudflare DNS (A record to 217.154.34.205, DNS only).

## Websites (source of truth: `admin-site/catalog.json`)
| Site | Address | PM2 : port | Folder |
|---|---|---|---|
| HN Group | hngroup.org.uk, www | hn-website :3500 | hngroup-site |
| Horizon Network | network.hngroup.org.uk (horizon-network.co.uk, www, horizonetwork.com, www redirect) | hn-network :3600 | horizon-network-site |
| Horizon Media Group | media.hngroup.org.uk | hn-media :3900 | media-site (website-suite) |
| Horizon Development | development.hngroup.org.uk | hn-development :4100 | development-site (website-suite) |
| Careers | careers.hngroup.org.uk | hn-careers :4400 | careers-site (website-suite) |
| News | news.hngroup.org.uk | hn-news :4600 | news-site (website-suite) |
| HN Group Auth | auth.hngroup.org.uk | hn-auth :3400 | auth-site |
| Staff portal | staff.hngroup.org.uk | hn-staff-portal :3200 (private hn-accounts :3250) | staff-portal |
| HN Account | accounts.hngroup.org.uk | hn-account-web :5300 | accounts-site |
| Service status | status.hngroup.org.uk | hn-status :3300 | status-site |
| HN Group Sites | sites.hngroup.org.uk (links.hngroup.org.uk redirects) | hn-links :3700 | links-site |
| HN Group Wiki | wiki.hngroup.org.uk | hn-wiki :3800 | wiki-site |
| HN Group Private Wiki | private.wiki.hngroup.org.uk | hn-private-wiki :5620 | private-wiki-site |
| Company register | companies.hngroup.org.uk | hn-companies :4900 | companies-site |
| Private company register | private.companies.hngroup.org.uk | hn-private-companies :5610 | private-companies-site |
| Brand centre | branding.hngroup.org.uk | hn-branding :4800 | branding-site |
| HN Group Docs | docs.hngroup.org.uk | hn-docs :4500 | docs-site |
| HN Group Contracts | contract.hngroup.org.uk | hn-contracts :5560 | contracts-site |
| HN Group Investors | investors.hngroup.org.uk | hn-investors :5200 | investors-site |
| HN Group VPN | vpn.hngroup.org.uk | hn-vpn :5000 | vpn-site |
| HN Group Devices | devices.hngroup.org.uk | hn-devices :5400 | devices-site |
| Downloads | downloads.hngroup.org.uk | hn-downloads :5100 | downloads-site |
| HN Group Bots | bots.hngroup.org.uk | hn-bots :5600 | bots-site |
| Echo | echo.hngroup.org.uk | hn-echo :5630 | echo-site |
| HN Mail | mail.hngroup.org.uk | hn-mail :5660 | mail-site |
| Website control | admin.hngroup.org.uk | hn-admin :4700 | admin-site |

Removed (don't bring back unless asked): holding.hngroup.org.uk, the client portal, support.hngroup.org.uk (now `/support` sections), the Horizon Advertising website (horizonadvertising.co.uk shows HN-NO-SITE), contracts.hngroup.org.uk (now contract.), documents.hngroup.org.uk / the old docs help site.

## Approved HN Group website theme
- Use `hngroup-site/public/assets/site.css` unchanged (copy it into the site), plus the motion kit `brand/web/hn-motion.css` + `hn-motion.js` (identical copies, listed in `brand/web/copies.json`).
- Plus Jakarta Sans (local); purple `#5514B4` for actions (dark mode `#A47BF0`, text on accent `#12101F`).
- Palette: pink `#E97DE8`, purple `#5514B4`, yellow `#E3E65B`, teal `#3E9BA3`, plum `#7A1F6C`, raspberry `#C2306B`, green `#5FAE7B`, navy `#1C2135`, lavender `#7B52C4`.
- Stripe order/widths: pink 14, purple 14, yellow 6, teal 20, plum 10, raspberry 10, green 13, `#3A4166` 13 (stepped under the wordmark and on page heads).
- 72px blurred header, pill buttons, 18px lifting cards, hero glow + stepped stripe, striped footer (navy in Lavender Dusk, light in the Light theme via hn-theme.js), reduced motion respected.
- Logos: only the originals in `brand/logos/` (see `brand/README.md`); white variants on dark. Tab icon `hngroup-site/public/assets/favicon.svg`.
- Footer: the company logo once; subsidiaries add "A subsidiary of HN Group Limited" once.
- Exception: the Company register (public and private) is styled like Companies House, not the HN theme.
- Always show profile pictures for signed-in people and staff.
- Only two themes everywhere: Light (default) and Lavender Dusk, chosen on the staff portal's Appearance and shared by the `hn_theme` cookie; every page loads `hn-theme.js` (copies in `brand/web/theme-copies.json`). See AGENTS.md.

## Group (latest: 2 November 2026)
CLivsey Holdings → HN Group Limited (→ HN Group Management Limited). HN Group Investments Limited (its own ownership: whatever the register records) → Horizon Network Limited (70%; includes Horizon Development; manages Horizon Advertising) and Horizon Media Group Limited (55%, → Horizon Advertising Limited). Ownership lives on the Company Register; never hard-code or invent it.
