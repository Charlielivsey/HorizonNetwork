# HN Group Devices — devices.hngroup.org.uk

The list of computers allowed to use HN Group's desktop apps: HN Browser, HN Secure Network (Mac and Windows)
and HN Group App Manager (the user's request, 23 October 2026: "a device must be authorised to be able to
download and use the apps").

- **The apps** ask `POST /api/device/check` with the computer's id, secret and hardware fingerprint (made and kept
  on the computer by the shared `device.cjs` / the Mac app's `Device.swift`; only hashes are stored here). A new
  computer is registered as *unlinked* and gets a pairing code (`ABCD-2345`). The answer is `unlinked`,
  `pending`, `authorised`, `revoked` or `mismatch` (the identity was copied to other hardware). Apps trust an
  `authorised` answer for 7 days while they can't reach this site; anything else shows "This device is not
  authorised", and App Manager won't install, update or reinstall anything. Checks are limited per address.
- **Staff** sign in through HN Group Auth (registered client `devices`, callback
  https://devices.hngroup.org.uk/auth/callback) and add a computer with its code (the app's link,
  `/link?code=…`, fills it in). It then waits for approval. They can rename or remove their own computers.
- **Owner-level and Super Admin accounts** approve, revoke, rename and remove every computer, see what's waiting
  and recent activity; computers they add themselves are approved at once. Approving a computer flagged as
  *mismatch* trusts its new hardware instead.
- Data: `/var/lib/hn-devices/devices.json` (devices, website sign-ins, activity). PM2 `hn-devices`, loopback
  port 5400. Install or update on its own with `sudo bash devices-site/install.sh` (the root `install.sh` runs it
  when this folder changes). Tests: `node --test devices-site/test.cjs`.
