# HN Group Staff Portal

Internal staff portal for the whole of HN Group, served at **https://staff.hngroup.org.uk**.

**Default login:** `admin@hngroup.org.uk` / `admin`. Change this straight away under **Profile & settings**. Staff sign in with their work email address.

## Features

- **Home page.** Shows the current date and time on your device, and the time where your profile location is set, with the difference between the two. It also has quick-access tiles, your details and company news.
- **Dropdown navigation.** People (Staff Directory, Employee Management), Workplace, HR and Support. Sections that aren't built yet are marked *Soon*.
- **Staff Directory.** Every employee with their photo, job title, company, emails, location and live local time. You can search and filter by company. Click someone to see who they report to and who reports to them.
- **Employee Management.** Only shown to the leadership and HR teams.
  - Add employees with their first and last name, display name, job title, company, other companies they work at, supervisor, location, time zone and phone.
  - **Emails** are generated as `firstname.lastname@domain`. If that address is taken, a number is added (`firstname.42.lastname@domain`).
    - Each address can be overridden with a custom one.
    - Employees can have several addresses on different brand domains.
    - The **primary** address is their login username.
  - After adding someone, you're asked whether to create their login account. A temporary password is shown once on screen, and the employee must create their own password the first time they sign in.
  - You can reset a password, disable or re-enable a login, edit details and delete employees.
- **Profile & settings.** Opened by clicking your name. Upload or remove a profile picture, change your display name, phone, location and time zone, and change your password.

**Companies:** HN Group Limited, Horizon Network Limited, Horizon Advertising, Horizon Development and Horizon Media Group.

**Email domains:** `hngroup.org.uk`, `horizon-network.co.uk`, `horizonadvertising.co.uk` and `media.hngroup.org.uk`.

Both lists are at the top of `lib/store.js` if you need to change them.

### Who can see Employee Management

Access is decided by **job title**. Anyone whose title contains one of the listed words or phrases gets access. The defaults are *Chief, Director, Head of, Founder, Leadership, Human Resources* and *HR*.

The admin account (`admin@hngroup.org.uk`) can change the list in the portal under **Employee Management → Access rules**. That screen also shows who currently has access. The admin account always has access.

## Install on the VPS

### 1. Point the domain at the VPS (one-off)

Wherever `hngroup.org.uk`'s DNS is managed, add this record:

| Type | Name / Host | Value             |
|------|-------------|-------------------|
| A    | `staff`     | `217.154.34.205`  |

If you use Cloudflare, set the record to **DNS only** (grey cloud) for the first install so the HTTPS certificate can be issued.

To check it has taken effect, run `getent hosts staff.hngroup.org.uk`. It should print `217.154.34.205`.

### 2. Get the code and run the installer

As root on the VPS:

```bash
if [ -d /root/HorizonNetwork/.git ]; then
  cd /root/HorizonNetwork && git fetch origin
else
  git clone https://github.com/Charlielivsey/HorizonNetwork.git /root/HorizonNetwork && cd /root/HorizonNetwork
fi
git checkout claude/confident-volta-gxjboo
git pull origin claude/confident-volta-gxjboo
sudo bash staff-portal/install.sh staff.hngroup.org.uk you@hngroup.org.uk
```

The email is only used by Let's Encrypt for certificate expiry notices.

The installer:
1. Installs nginx, certbot, Node.js and PM2 if they are missing.
2. Copies the app to `/opt/hn-staff-portal`.
3. Keeps staff data in `/var/lib/hn-staff-portal`, so updates never wipe it.
4. Runs the app under PM2 as `hn-staff-portal`, listening on `127.0.0.1:3200` only.
5. Adds an nginx site for the domain. The existing Horizon Network sites are left alone.
6. Opens ports 80 and 443 if `ufw` is active.
7. Gets a free HTTPS certificate that renews automatically.

## Updating

```bash
cd /root/HorizonNetwork && git pull && sudo bash staff-portal/install.sh
```

Re-running the installer is safe. Staff records, accounts, photos and the HTTPS certificate are all kept.

When you update from an earlier version, existing logins are carried over automatically. The old `admin` login is renamed to `admin@hngroup.org.uk` and keeps its password.

## Data & backups

Everything lives in `/var/lib/hn-staff-portal`:

| Path              | Contents                                                        |
|-------------------|-----------------------------------------------------------------|
| `people.json`     | Employees and login accounts. Passwords are stored as scrypt hashes. |
| `settings.json`   | Access rules.                                                   |
| `avatars/`        | Profile pictures.                                               |

To back it up:

```bash
sudo tar czf ~/staff-portal-backup-$(date +%F).tgz -C /var/lib hn-staff-portal
```

## Useful commands

```bash
pm2 logs hn-staff-portal          # logs, including sign-ins and staff changes
pm2 restart hn-staff-portal
sudo certbot renew --dry-run      # test certificate renewal
```

## Troubleshooting

- **The installer says DNS doesn't point at this server.** Wait for the A record to propagate, then re-run the installer.
- **The site shows the main Horizon Network page.** Check that `/etc/nginx/sites-enabled/hn-staff-portal` exists, then run `sudo nginx -t && sudo systemctl reload nginx`.
- **502 Bad Gateway.** The app isn't running. Check `pm2 status` and `pm2 logs hn-staff-portal`.
- **Forgot the admin password.** This resets the login to `admin@hngroup.org.uk` / `admin` and leaves every other account and record alone:
  ```bash
  sudo DATA_DIR=/var/lib/hn-staff-portal node /opt/hn-staff-portal/reset-admin.js && pm2 restart hn-staff-portal
  ```
