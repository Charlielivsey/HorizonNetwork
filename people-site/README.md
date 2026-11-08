# HN Group People

https://people.hngroup.org.uk: the public staff list for every HN Group company, an org chart per company, one org
chart with the whole group, and each person's profile with their About me.

- PM2 `hn-people`, loopback port **5670**, files in `/opt/hn-people`. No data folder and no sign-in: the site is public.
- Everything comes live from the staff portal: `server.js` asks the staff backend for `/api/auth/people-public` and
  `/api/auth/people-avatar` with the service secret (`/var/lib/hn-status-sso/secret`, never sent to browsers), keeps the
  list for 5 seconds and pictures for 10 minutes; pages check again every 15 seconds and when returning to the tab.
- What's published (`staff-portal/lib/people-public.js`): display name, every role (company, position, department and who
  it reports to), About me, skills, languages and the profile picture. Never emails, phone numbers, locations or anything
  else. People whose sign-in accounts are all switched off are left out.
- About me is written on the staff portal (My profile → About me). "Show my About me on HN Group People" is on by default;
  unticking it hides only the About me.
- Reporting lines follow each role’s saved Reports to on Employee Management; vacant positions use the position default. Holders with different supervisors appear in separate branches. Changes to positions alone also redraw open charts.

Install or update: `sudo bash people-site/install.sh` (the root `install.sh` runs it when this folder changes).
DNS: A `people` → 217.154.34.205 (DNS only). Test: `node --test people-site/test.cjs`.
