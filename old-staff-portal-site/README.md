# Old staff portal (oldstaffportal.hngroup.org.uk)

The oldest staff portal in this repository: commit `563ad67` from 8 October 2026 ("Add HN Group Staff Portal with login
and landing page"). `app/` is that version exactly, unchanged (its original README is `app/ORIGINAL-README.md`); only
the files around it are new.

- Runs on its own: `/opt/hn-old-staff-portal`, PM2 `hn-old-staff-portal`, loopback port 5640, data in
  `/var/lib/hn-old-staff-portal`. It shares no data, sign-ins or cookies with the real staff portal.
- Deliberately not on website control, Links, Status, HN Browser or anywhere else (the user's request, 3 November 2026).
  It's only in the root `install.sh`, so the normal update installs it.
- The old portal would create `admin` / `admin` on first start. The installer creates that account first with a random
  password and prints it once; the first sign-in asks for a new one. To set a new random one, delete
  `/var/lib/hn-old-staff-portal/users.json` and rerun the installer.

Install or update: `cd /root/HorizonNetwork && git pull && sudo bash install.sh` (or `sudo bash old-staff-portal-site/install.sh`).
DNS: A `oldstaffportal` → 217.154.34.205 (DNS only).
