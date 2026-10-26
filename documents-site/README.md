# HN Group Documents

documents.hngroup.org.uk: staff write documents on the letterhead of HN Group or one of its companies, starting from
a template, and print them or save them as PDF. Staff only.

- **Sign-in:** HN Group Auth, as the registered `documents` application (any enabled staff account). PM2
  `hn-documents`, loopback port 5500, data in `/var/lib/hn-documents/documents.json`.
- **Companies** (`lib/catalog.js`): HN Group, Horizon Network, Horizon Media Group, Horizon Advertising, Horizon
  Development and HN Group Management, each with its approved logo from `brand/logos`, legal name, website and footer.
- **Templates** (every template for every company): Letter, Memo, Report, Policy, Meeting minutes, Press release and
  Blank document. A new document starts with the template's details (date, author, the company's names) filled in.
- **Documents page:** filter by company (with counts), by type, by "Only mine", and search by title or author.
  **Templates page:** every template on each company's letterhead, filtered by company.
- **Editor:** the document is an A4 page as it will print: headings, bold/italic/underline, lists, alignment,
  links, tables and lines; it saves by itself as you type. Change the company (the letterhead changes at once),
  share with all staff or keep it to yourself, mark it final (locked until it goes back to draft), duplicate or
  delete it. **Print or save as PDF** prints only the page, with the company footer and page numbers on every page
  (in Chrome, Edge and HN Browser).
- **Who can do what:** anyone who can see a document can edit it; its author or an owner-level/Super Admin account
  can delete it or change who sees it. Saves carry the version they were based on, so nobody overwrites someone
  else's changes unseen.
- **Safety:** the server rebuilds document HTML from a short list of formatting tags (`lib/sanitize.js`); the page
  has a strict Content Security Policy; changes must come from the site's own origin; only hashes of sign-in tokens
  are stored.

```sh
node --test documents-site/test.cjs        # tests
sudo bash documents-site/install.sh        # install or update this site only
```
