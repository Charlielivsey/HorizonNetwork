# HN Group Staff Portal

Internal staff portal for the whole of HN Group, served at **https://staff.hngroup.org.uk**.

**Default login:** `admin@hngroup.org.uk` / `admin`. Change this straight away under **Settings → Security**. Staff sign in with their work email address.

## Features

- **Home page.** Shows the current date and time on your device, and the time where your profile location is set, with the difference between the two. It also shows the latest announcements, anything you need to acknowledge, your onboarding tasks, what's coming up on the calendar and your status.
- **Dropdown navigation.** People (Staff Directory, Employee Management), Workplace, HR and Support. Sections that aren't built yet are marked *Soon*.
- **Staff Directory.** Every employee with their photo, job title, company, emails, location and live local time. You can search and filter by company. Click someone to see who they report to and who reports to them.
- **About HN Group** (Support → About HN Group). It covers the companies in the group with how many people work at each, the brand colours (click to copy) and every logo, with SVG and PNG downloads. The logo files are in `public/assets/brand/`.
- **Email signature** (Workplace → Email signature, or the menu under your name).
  - Builds a branded signature in the same layout as the brand email signatures: the company logo, name, job title, company, email, optional phone, website, the colour stripe, the parent company line and the confidentiality notice.
  - Pick which company role to use; the logo, colour, email address and website follow it.
  - **Copy signature** pastes straight into Gmail or Outlook. You can also copy the HTML or download it as a file, and there are step-by-step instructions for Gmail, Outlook and Apple Mail.
  - People with *Manage staff* can make a signature for anyone.
  - The logo images load from the portal (`/assets/brand/png/`), so recipients need to be able to reach staff.hngroup.org.uk.
- **Global search.** Use the search box in the top bar, or press **Ctrl+K** (**⌘K** on a Mac) or **/**. It searches people, pages, documents, announcements, events and polls.
- **Status.** Click your name, then the status line, to set Available, Busy, Away or Out of office. You can add a message and a date it clears on. Your status shows on your profile and in the Staff Directory.
- **Employee Management.** Only shown to people with the *Manage staff* permission. Click any row to edit that person.
  - Add employees with their first and last name, display name, job title, company, other companies they work at, supervisor, location, time zone, phone and start date. The start date is used for work anniversaries.
  - **Emails** are generated as `firstname.lastname@domain`. If that address is taken, a number is added (`firstname.42.lastname@domain`).
    - Each address can be overridden with a custom one.
    - Employees can have several addresses on different brand domains.
    - The **primary** address is their login username.
  - After adding someone, you're asked whether to create their login account. A temporary password is shown once on screen, and the employee must create their own password the first time they sign in.
  - You can reset a password, disable or re-enable a login, edit details and delete employees.
- **Settings.** Opened by clicking your name. It has three tabs: **Profile** (picture, banner, display name, phone, location, time zone and birthday), **Appearance** (theme) and **Security** (password, sign-in code, and **Where you're signed in**, where you can sign out other devices). Birthdays are day and month only, and you choose whether colleagues can see yours.
- **Profile banners.** Under **Settings → Profile**, everyone can choose one of eight preset gradient banners or upload their own wide image, which is cropped to 3:1. The banner shows at the top of their profile and on their Staff Directory card.

**Companies:** HN Group, Horizon Network, Horizon Advertising, Horizon Development and Horizon Media Group.

**Email domains:** `hngroup.org.uk`, `horizon-network.co.uk`, `horizonadvertising.co.uk` and `media.hngroup.org.uk`.

Both lists are at the top of `lib/store.js` if you need to change them.

### System owner & System Admin

The **system owner** has access to everything. The owner is whoever has the email `charlie.livsey@hngroup.org.uk`, set in `settings.json` as `ownerEmail`.

The owner's record is locked to everyone else. HR, leadership and the admin account can create the owner's first login, but they can't edit, reset, disable or delete the owner after that.

The owner can open **System Admin** from the menu under their name. It's protected by the master system PIN, which starts as `0103`. It locks itself after 15 minutes of inactivity, and 5 wrong PINs lock it for 15 minutes. It has:

- **Active sessions.** Everyone signed in, with their device, IP address and last activity. You can end one session, **log out everyone else**, or **force log out everyone**, including yourself. Disconnected users are sent back to the sign-in page within about 30 seconds.
- **Log in as.** Open the portal as any user with a login, without their password. A banner shows the whole time with a **Return to my account** button. Passwords can't be changed while you're logged in as someone else.
- **Change System Admin PIN.**
- **Activity log.** Every action across the portal is recorded in `audit.log`. That covers sign-ins (including failed ones), sign-outs, password changes and resets, login accounts being created, disabled or enabled, staff added, edited or deleted (with which fields changed), profile and photo changes, access rule changes and every System Admin action. Actions done through "log in as" are marked with who was really doing them. You can search and filter the log by type.

### Working at more than one company

In the employee form, ticking a company under **Also works at** lets you set a separate **job title** and **supervisor** for that company. Leave either blank to use the main company's details.

Each role is its own profile. Someone who works at three companies has three profiles in the directory and three places in the org chart.

A supervisor is always shown in their role at the same company as the person reporting to them. For example, Jack is VP at Horizon Network, which is his main company, and reports to Charlie. Charlie is CEO of HN Group but also President of Horizon Network, so Jack's profile and the org chart show Charlie as President of Horizon Network. If the supervisor doesn't work at that company, their main role is shown instead.

Staff see their main role under the greeting on the home page, and in a short "Signed in as…" message when they sign in.

### Staff Directory views

- **Cards** for browsing.
- **List** for scanning.
- **Org chart** showing reporting lines for the selected company. Teams can be collapsed.

### Signing in

Signing in has two steps: your **email and password**, then your personal **6-digit sign-in code**.

- **Setting a code.** Everyone sets their code the first time they sign in after this feature was added, or straight after creating their password if they're new. Until they do, nothing else in the portal works for them.
- **Rules.** Codes must be exactly 6 digits. Easy ones like `123456` or `000000` are refused.
- **Changing your code.** Go to **Settings → Security**. You'll need your current password.
- **Forgotten codes.** HR and leadership can use **Reset sign-in code** in Employee Management. The person then chooses a new code at their next sign-in.
- **Wrong codes.** Five wrong codes mean starting again from the password step. Wrong codes count towards the 15-minute lockout on that network address, and they're recorded in the activity log.
- **Log in as.** "Log in as" in System Admin skips both the password and the code.

**How long a sign-in lasts.** Reloading the page or opening a portal address directly signs you out, and so does closing the browser or leaving the portal unused for 12 hours. Moving around inside the portal keeps you signed in. Sign-ins are saved in `sessions.json`, so restarting the app or running the installer doesn't sign anyone out. Only a hash of each sign-in token is stored, so the file can't be used to sign in.

### Workplace

- **Announcements.** Leadership and HR can post announcements to everyone or to particular companies. They can also pin them to the top, mark them as important, and edit or delete them. Everyone else sees the ones meant for them. Unread announcements are counted in the **Workplace** menu. The latest five are shown in full on the home page, and any you haven't seen yet pop up when you open the home page. Closing the pop-up marks them as read.
- **Documents & Policies.** Leadership and HR can upload PDF, Word, Excel, PowerPoint, text, CSV or image files up to 20 MB. Each document has a category (Policies, Handbooks, Forms, Templates, Guides or Other) and can be shared with everyone or with particular companies. Staff can view or download documents, and search or filter them.
  - Ticking **Staff must read and acknowledge this** asks everyone in the document's audience to confirm they've read it. Until they do, it shows under "Needs your attention" on their home page.
  - Managers can see who has and hasn't acknowledged a document. Uploading a new version asks everyone to acknowledge it again.

- **Announcement extras.**
  - Everyone can react with emoji and, unless it's turned off for a post, comment.
  - Posts can ask staff to **acknowledge** them, and managers see how many have.
  - Posts can be **scheduled** to go live later and can **expire** automatically.
- **Calendar.** A month view of company events, UK (England & Wales) bank holidays from 2025 to 2027, company holidays, shared birthdays and work anniversaries. People with *Manage the calendar* can add events for everyone or for particular companies.
- **Polls & surveys.**
  - Questions can be single choice, multiple choice, a 1–5 rating or a written answer.
  - **Anonymous** polls never store who gave which answer.
  - You choose whether staff see the results after answering, and you can set a closing date.
- **Onboarding.**
  - People with *Run onboarding* start a checklist for a new starter from a template. A default "New starter" template is included, and templates can be edited.
  - Each task belongs to the new starter, their supervisor or HR, and each person sees their own tasks on their home page.

### Themes

Everyone can pick a theme under **Settings → Appearance**. Settings is in the menu under their name. The choice is saved to their account, so it follows them to any device, and the sign-in page remembers the last theme used on that browser.

| Theme           | Style                                    |
|-----------------|------------------------------------------|
| Match my device | Switches between HN Light and HN Dark to follow the device's setting |
| HN Light        | The default, in HN Group purple          |
| HN Dark         | Dark, with a lighter purple accent       |
| Lavender        | Soft lavender                            |
| Lavender Dusk   | Dark lavender                            |
| Ocean           | Teal and blue                            |
| Forest          | Green                                    |
| Midnight        | Dark navy with a blue accent             |

The logo colour stripe always stays in the HN Group brand colours. Dark themes use a white version of the logo.

### Roles & permissions

What people can manage is set by **roles**, under **People → Roles & permissions**. Each role switches on any of these permissions:

- Manage staff
- Manage roles
- Post announcements
- Manage documents
- Manage the calendar
- Run polls & surveys
- Run onboarding
- System Admin: open System Admin with the PIN. Only people who already have it can give it out.

You then choose who has each role. Someone with several roles gets every permission from all of them.

- The **system owner** (charlie.livsey@hngroup.org.uk) always has every permission. The built-in **admin account** has every permission except System Admin.
- A **Super Admin** role with every permission, including System Admin, is created automatically.
  - Super admins can use everything in System Admin except changing the PIN.
  - They can't log in as the system owner or end the owner's sessions.
- On the first start after upgrading, three roles are created: **Leadership & HR** (everything), **Communications** and **Documents**. Everyone who previously had access through their job title is given *Leadership & HR*.

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
| `settings.json`   | Roles, the system owner and the system PIN (hashed).            |
| `announcements.json`, `documents.json`, `documents/` | Announcements, the document library and the uploaded files. |
| `sessions.json`   | Signed-in sessions (hashed tokens).                              |
| `events.json`, `polls.json`, `onboarding.json` | Calendar events, polls and their answers, and onboarding checklists. |
| `backups/`        | Automatic and manual backups (`.tar.gz`).                       |
| `audit.log`       | Activity log of every action in the portal.                     |
| `avatars/`        | Profile pictures.                                               |

**Automatic backups.**
- A backup is taken every night at 2am and saved to `backups/`. The latest 14 nightly backups are kept.
- In **System Admin → Backups** you can back up now, download or delete a backup, or restore one.
- Restoring needs the System Admin PIN. It takes a safety backup of the current data first and signs everyone out.
- The activity log is never rolled back.

For an off-server copy, download a backup from System Admin, or run:

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
- **Forgot the admin password.** This resets the login to `admin@hngroup.org.uk` / `admin`, clears its sign-in code so a new one is set at the next sign-in, and leaves every other account and record alone:
  ```bash
  sudo DATA_DIR=/var/lib/hn-staff-portal node /opt/hn-staff-portal/reset-admin.js && pm2 restart hn-staff-portal
  ```
