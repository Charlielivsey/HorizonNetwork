# Additional HN Group websites

Each website has its own configuration, original logo assets, Auth client, PM2 process, loopback port, nginx host, certificate and persistent data directory. `website-suite/` is shared **source**, copied into each application at installation; running websites do not depend on another site's installation directory.

| Site | Domain | PM2 | Port |
| --- | --- | --- | --- |
| Horizon Media Group | media.hngroup.org.uk | hn-media | 3900 |
| HN Group Management | holding.hngroup.org.uk | hn-holding | 4000 |
| Horizon Development | development.hngroup.org.uk | hn-development | 4100 |
| Support | support.hngroup.org.uk | hn-support | 4200 |
| Clients | clients.hngroup.org.uk | hn-clients | 4300 |
| Careers | careers.hngroup.org.uk | hn-careers | 4400 |
| Docs | docs.hngroup.org.uk | hn-docs | 4500 |
| News | news.hngroup.org.uk | hn-news | 4600 |

## Install

Add an A record for each of the eight subdomains pointing to `217.154.34.205`. Use DNS only initially so Let's Encrypt's HTTP challenge reaches nginx directly. Do not add AAAA records unless this VPS has a correctly routed public IPv6 address.

```sh
cd /root/HorizonNetwork && git pull && sudo bash install-expanded-sites.sh
```

The aggregate installer applies the narrow Auth integration, installs the eight independent services, prepares Advertising's dedicated HTTPS host, and updates Links. It continues through individual site failures and returns nonzero if any installer failed. Missing DNS is reported as pending, with services ready locally. Each new host returns a setup message with HTTP 503 until its trusted certificate exists; authentication screens are not served over plain HTTP. Rerun the same command after DNS resolves to issue certificates. Certbot renewal is enabled.

For a single website use `sudo bash support-site/install.sh` (substitute its directory). This updates only that site's runtime, PM2 process and nginx host. Auth must already have the corresponding registered client. On first installation, use the aggregate installer to install Auth too.

The existing Advertising domain must also point to this VPS. If Cloudflare swallows the HTTP certificate challenge, set its `@` A record to DNS only temporarily. The installer checks challenge routing before requesting a certificate. A temporary origin certificate is private to Advertising and is replaced by Let's Encrypt when validation succeeds; it is not a trusted public certificate.

## Staff administration

Use `/admin` or the Staff admin button on each site. Sign-in goes through HN Group Auth with a fixed registered callback; only the system owner and Super Admin members may enter. Auth validates setup and PIN as usual. Company pages provide access to the existing enquiry workflow. Careers vacancies and CV applications use the staff portal's existing public recruitment routes; this site does not create a separate vacancies database.

Support admins can publish help articles, read tickets, reply and change their status. Customers receive a private 64-character reference which they use to read and reply. **Anyone holding the reference can access that ticket.** Email notifications are not sent; the interface says so. Ticket references are stored as hashes, never included in staff lists, and checked via POST rather than URL queries.

Docs and News admins can create, edit, publish/unpublish and delete plain-text articles.

**HN Group News is the newsroom for every site.** Anyone with a role at HN Group (plus owner-level accounts and Super Admin members) can manage it. Each article lists the websites it appears on: HN Group News itself, Horizon Network, Horizon Media Group, Horizon Advertising, Horizon Development, HN Group Management and HN Group Investors. Sites fetch `GET /api/posts?site=<id>` from the News service over loopback (`NEWS_BACKEND`, default `http://127.0.0.1:4600`): Media, Management and Development show a Latest news section on their page, Horizon Network has `/news` and Horizon Advertising a news section. HN Group Investors news is private: only `/api/private/investor-news` returns it, with the service secret and never through nginx. Drafts appear nowhere. Drafts stay private. Seed help/docs articles are installed only once; edits or deleted articles are never overwritten or restored by deployment. News starts without fabricated announcements. No articles are added to the separate company Wiki.

## Client portal

Customers use separate invited accounts, not staff credentials. An authorised staff admin creates an invitation for a name/email and shares its private link manually. The link expires in seven days, is single-use and is stored only as a hash. Issuing a fresh invitation to an existing email resets access, removes its old password and invalidates existing customer sessions. Customers choose passwords of 12–128 characters, stored using scrypt with unique random salts. Disabling an account immediately revokes sessions and invitations.

Staff assign projects to specific customer accounts, publish project updates, upload shared files or invoices, and request approvals. A customer can see/download/approve only their assigned projects. Approvals record a timestamp, and changing an approved update requests approval again. Uploaded documents are attachment downloads (up to 10 MB each, 500 MB total per portal), stored privately on disk; staff can download and remove them. Invoices are shared documents, not a payment processor or accounting integration.

State lives in `/var/lib/hn-<site>/records.json`, files in its `files/` directory. Directories are mode 700, records/files mode 600; installers preserve them. Include the whole data directory in backups. Browser sessions are held in memory, expire, and end on process restart. Staff permissions are checked live through Auth. Mutations require the matching Origin and login/anonymous request endpoints have attempt limits.

## Verification

```sh
node --test website-suite/test.cjs auth-site/test.cjs auth-site/setup.test.cjs auth-site/portal-auth.test.cjs hngroup-site/test.cjs horizon-network-site/admin.test.cjs status-site/test.cjs
PLAYWRIGHT_MODULE=/path/to/playwright node website-suite/browser-smoke.cjs
PLAYWRIGHT_MODULE=/path/to/playwright node links-site/browser-smoke.cjs
```

Tests use temporary data and fixture accounts only. Browser checks exercise layouts in both colour schemes, reduced motion, enquiry submission, CV applications, support tracking/replies, article publication, client activation and approval. No production accounts or staff data are created by these tests.
