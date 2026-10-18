# HN Group VPN

A staff VPN on the VPS. All of a connected device's internet traffic goes through the server
(217.154.34.205).

- **WireGuard server:** interface `wg-hn`, UDP port **51820**, addresses 10.88.0.0/24 (and
  fd88:88::/64, so IPv6 stays inside the tunnel and can't leak). Set up by `vpn-site/install.sh`
  (`/etc/wireguard/wg-hn.conf`, key `/etc/wireguard/hn-vpn.key`, IPv4 forwarding and NAT through
  the server's internet interface, systemd `wg-quick@wg-hn`).
- **vpn.hngroup.org.uk** (PM2 `hn-vpn`, loopback port 5000, data `/var/lib/hn-vpn/vpn.json`):
  staff sign in through **HN Group Auth** (auth.hngroup.org.uk, registered application `vpn`, callback
  https://vpn.hngroup.org.uk/auth/callback). Each person can register up to 5 devices.
  - The **Mac app** (`mac-vpn-app/`) signs in through Auth in the browser (the browser hands the
    sign-in back with a one-time code via `hngroupvpn://`), makes its own key and registers itself.
  - Phones and PCs: **Add device** on the website gives a WireGuard configuration file (shown once)
    for the official WireGuard app.
  - Administrators (system owner, owner-level accounts, Super Admin) see and remove every device.
  - The Mac app is published automatically: GitHub Actions builds `mac-vpn-app/` and commits the
    zip to `vpn-site/mac-app/`, and this installer puts it on the site. Administrators can also
    upload a zip on the site.
- The service keeps the interface's peers matching the registered devices (on start and every 5
  minutes) and removes devices and sign-ins of staff accounts that are no longer enabled.

## Install or update

`cd /root/HorizonNetwork && git pull && sudo bash install.sh` (runs `vpn-site/install.sh` when this
folder changes). DNS: A `vpn` → 217.154.34.205, DNS only.

**Hosting firewall:** if the VPS provider has its own firewall (such as the IONOS Cloud Panel),
allow incoming **UDP 51820** there, or devices can't connect.

## Checks on the VPS

    systemctl status wg-quick@wg-hn     # the interface
    wg show wg-hn                       # connected devices and last handshakes
    pm2 logs hn-vpn                     # the website and upkeep

Tests: `node --test vpn-site/test.cjs`.
