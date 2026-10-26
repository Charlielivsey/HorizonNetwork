# HN Group Docs

docs.hngroup.org.uk: staff write documents on the letterhead of HN Group or one of its companies, starting from a
template, keep their own private storage, and print or save documents as PDF. Staff only. It replaced the old public
help-article site on this domain (the user's request, 26 October 2026); the installer stops that site once and keeps
its data in `/var/lib/hn-docs/old-help-site-<time>/`.

- **Sign-in:** HN Group Auth, as the registered `docs` application (any enabled staff account). PM2 `hn-docs`,
  loopback port 4500, data in `/var/lib/hn-docs` (`documents.json`, `files/`, `avatars/`).
- **Your profile:** your staff profile picture is shown (fetched from Auth and kept up to date), and new documents are
  signed with your first and last name and your job title from the staff portal.
- **Companies** (`lib/catalog.js`): HN Group, Horizon Network, Horizon Media Group, Horizon Advertising, Horizon
  Development and HN Group Management, each with its approved logo, legal name, website and footer.
- **Templates** (every template for every company): Letter, Memo, Report, Policy, Meeting minutes, Press release,
  Blank document, and the HR letters: Welcome letter, Onboarding letter, Resignation letter and Termination letter.
  Letter-style templates share the letter layout (address, date, reference, sign-off).
- **Shared** (all staff can see and edit) and **My storage** (private: your documents and uploaded files: PDF, Word,
  Excel, PowerPoint, pictures, text and CSV, up to 25 MB each, checked by content). New documents go to your storage
  unless you choose Shared with staff. Filter by company and type, and search.
- **Other people's storage:** nobody else can open your storage, except anyone with the "Access staff document
  storage" permission (Super Admin and the system owner have it) and anyone given an individual, timed grant to one
  person's storage in the staff portal (Workplace → Document storage). They find it on the **Staff storage** page here
  (everyone, from the staff list via `/api/auth/staff-directory`, or just the storage they've been given) or view it
  inside the staff portal itself (the portal asks `/api/service/*` over loopback with the service secret, never through
  nginx, naming who is looking). They see it at `/storage/<person>`,
  view only (open, print, download; never change or delete), and every visit is logged. Grants arrive with every
  Auth check, so a removed or expired grant stops working within a minute.
- **Editor:** an A4 page as it will be in the PDF, with headings, lists, alignment, links, tables and lines; it saves
  by itself and refuses to overwrite someone else's newer changes. Mark final (locked until it goes back to draft),
  move between Shared and My storage, duplicate or delete. No website address appears on documents.
- **Download PDF** (`lib/pdf.js`): the server makes the PDF itself, so no print dialog opens and the browser adds
  nothing. It embeds Plus Jakarta Sans (static TrueType files in `lib/pdf-assets/`, OFL) and a PNG of the company's
  approved logo (rendered from the SVG), and lays out the details, version history, text (headings, lists, quotes,
  tables, links, alignment) and sign-off, with the company footer and "Page x of y" on every page.
- **Document settings** (the "…" menu): **Private & confidential** (also offered when creating a document, and on by
  default for termination and resignation letters) shows "Private & confidential" on the document and at the top of
  every PDF page; **Protect from deletion** (author, or owner-level/Super Admin for shared documents) means nobody can
  ever delete the document, and can't be undone.
- **Select** (on Shared and My storage) picks several documents and files to delete at once; anything protected or
  not yours is left alone and counted.
- **Policy versions:** a policy's Version history sits under its details. Marking a policy final records its first
  version; after that, each time it's changed and marked final again, the version goes up (1.0 → 1.1, or a number
  you typed, such as 2.0) and the changes are listed (sections added, updated or removed, a new title, a changed
  owner, effective date or review date), with the date and who made it.
- **Seeded files:** `seed/index.json` puts files in someone's private storage once (held by email until they first
  sign in): the HN Group merger agreement in Charlie Livsey's and catnap@hngroup.org.uk's storage.
- **Safety:** document HTML is rebuilt from a short list of formatting tags (`lib/sanitize.js`); strict Content
  Security Policy; uploads are served as downloads or sandboxed; changes must come from the site's own origin; only
  hashes of sign-in tokens are stored.

```sh
node --test docs-site/test.cjs        # tests
sudo bash docs-site/install.sh        # install or update this site only
```
