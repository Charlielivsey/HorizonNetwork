# Old staff portal (oldstaffportal.hngroup.org.uk)

The staff portal as it was just before its sign-in moved to HN Group Auth: commit `68caec7` from 13 October 2026 (the
commit before `ade6f6d`, "Send staff portal sign-ins through HN Group Auth"). It still has its own email, password and
six-digit PIN sign-in. `app/` is that version exactly, unchanged (its original README is `app/ORIGINAL-README.md`); only
the files around it are new. Until 3 November 2026 this folder held the 8 October version (`563ad67`); the user asked
for the pre-Auth version instead.

- Runs on its own: `/opt/hn-old-staff-portal` (replaced as a whole on each install), PM2 `hn-old-staff-portal`, loopback
  port 5640, data in `/var/lib/hn-old-staff-portal`. It shares no data, sign-ins or cookies with the real staff portal,
  and its Status sign-on bridge is off (`STATUS_SSO_SECRET_FILE` points at a file that doesn't exist).
- Deliberately not on website control, Links, Status, HN Browser or anywhere else (the user's request, 3 November 2026).
  It's only in the root `install.sh`, so the normal update installs it.
- This version would create `admin@hngroup.org.uk` / `admin` on first start. The installer creates that account first
  with a random password and prints it once; the first sign-in asks for a new password and a PIN. To set a new random
  one, delete `/var/lib/hn-old-staff-portal/people.json` and rerun the installer (this starts the old portal empty).

Install or update: `cd /root/HorizonNetwork && git pull && sudo bash install.sh` (or `sudo bash old-staff-portal-site/install.sh`).
DNS: A `oldstaffportal` → 217.154.34.205 (DNS only).
