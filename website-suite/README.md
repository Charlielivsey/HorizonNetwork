# Media, Development, Careers and News

Each website has its own configuration, original logo assets, Auth client, PM2 process, loopback port, nginx host, certificate and persistent data directory. `website-suite/` is shared **source**, copied into each application at installation; running websites do not depend on another site's installation directory.

| Site | Domain | PM2 | Port |
| --- | --- | --- | --- |
| Horizon Media Group | media.hngroup.org.uk | hn-media | 3900 |
| Horizon Development | development.hngroup.org.uk | hn-development | 4100 |
| HN Group Careers | careers.hngroup.org.uk | hn-careers | 4400 |
| HN Group News | news.hngroup.org.uk | hn-news | 4600 |

The HN Group Management (holding), Support and Client portal websites were removed on 30 October 2026 at the user's request. The root `install.sh` stops `hn-holding`, `hn-support` and `hn-clients` and removes their nginx hosts once; their data stays in `/var/lib/hn-<site>`.

## Look

Pages use the HN Group website theme: `public/assets/site.css` is an unchanged copy of `hngroup-site/public/assets/site.css`, with `suite.css` for the extra pieces, the motion kit (`hn-motion.*`) and the support section (`hn-support.*`) copied from `brand/web` (checked by `brand/web/test.cjs`). `server.js` fills the header and footer of `public/index.html` from `config.json`: `logo`, `company`, `subsidiaryOf` (the footer shows the company's logo, its name and what it's a subsidiary of) and `legal`.

## Company websites (Media, Development)

Home page (about, news from HN Group News, a contact form that goes to the staff portal's Website enquiries) and `/support`. The support section (`brand/web/hn-support.js`) sends requests to the staff portal through `/api/public/support`; the person gets a private reference to read replies and answer through `/api/public/support/track`. Staff answer them in Website enquiries (Support requests tab, "Reply on the website"). The same section is on hngroup.org.uk/support and network.hngroup.org.uk/support. Requests from the retired support.hngroup.org.uk are copied in once (`SUPPORT_IMPORT_FILE`, default `/var/lib/hn-support/records.json`) and keep their references.

## HN Group Careers

Vacancies come from the staff portal's Jobs page: a role ticked "Advertise on HN Group Careers" appears here at once. The home page has open roles (search, company and type filters), the group's companies, how hiring works and links for staff (internal vacancies) and questions. Each role has its own page (`/jobs/<id>`) with the details and the application form (CV up to 10 MB, PDF or Word). Applying gives a private reference; `/application` shows the stage the hiring team set on the staff portal (Received, Being reviewed, Interview, Offer, Hired, or Not progressing). hngroup.org.uk/careers redirects here. Only the jobs, apply, application status and enquiry routes reach the staff portal.

## HN Group News

**HN Group News is the newsroom for every site.** Anyone with a role at HN Group (plus owner-level accounts and Super Admin members) can manage it at `/admin`. Each article lists the websites it appears on: HN Group News itself, Horizon Network, Horizon Media Group, Horizon Development and HN Group Investors. Sites fetch `GET /api/posts?site=<id>` over loopback (`NEWS_BACKEND`, default `http://127.0.0.1:4600`). Investor news is private: only `/api/private/investor-news` returns it, with the service secret and never through nginx. Drafts appear nowhere.

## Install

```sh
cd /root/HorizonNetwork && git pull && sudo bash install.sh
```

For a single website use `sudo bash media-site/install.sh` (substitute its directory).

## Verification

```sh
node --test website-suite/test.cjs website-suite/integration.test.cjs brand/web/test.cjs
```

`integration.test.cjs` runs the real staff portal with Media and Careers: a support request, a staff reply seen with the reference, an imported old reference, and a job application with a CV whose stage is then checked.

## Announcements (HN Group News)

An announcement can ship with the News site in `news-site/announcements/` (a JSON file with a fixed `id` and `key`, optionally with a PDF beside it). The server publishes it once at startup and remembers its key, so later edits or a deletion on the site are kept. An attached PDF is served at `/api/posts/<id>/document` and linked from the article on News, the company websites and investor news.
