# HN Group Wiki — wiki.hngroup.org.uk

A Wikipedia-style encyclopedia of HN Group and its companies, in the HN Group brand: Plus Jakarta Sans, the eight-colour stripe, the approved logos from `brand/logos/`, light and dark themes, and layouts that work from small phones up.

## What's on it

- **Company articles, pre-filled.** HN Group, Horizon Network, Horizon Advertising, Horizon Development, Horizon Media Group and Horizon Holding Co, plus a List of HN Group companies. Each has an infobox with the company's logo, its place in the group, its staff email domain, sections, references to the group's public websites and categories.
  - **Horizon Advertising's ownership.** It is shown as a subsidiary of Horizon Media Group that is managed by Horizon Network.
  - **Companies only.** As requested, there are no articles about the websites or online services yet.
  - **Facts only.** Articles only state what the group's public websites and brand guide say. Nothing about dates, figures or people has been invented; Horizon Holding Co's role isn't documented, so its article is a stub that says so.
- **Wikipedia features.** Every article has these:
  - an infobox, a contents box, numbered references and categories;
  - redirects, such as "HNGroup" → HN Group, and a red link to any page that doesn't exist yet;
  - search (an exact title goes straight to the page) and a random article;
  - all pages, a categories list and recent changes;
  - full page history: view any old version and restore it.
- **Main Page.** It has company cards with logos, a featured article, "Did you know…", links to explore the group and how to contribute. It's protected.
- **Help.** `Help:Editing` explains the formatting, and `HN Group Wiki:About` describes the wiki.

## Reading and editing

- **Anyone can read** the wiki. No sign-in is needed.
- **Staff edit** after selecting **Staff sign in**, which goes through HN Group Auth (the registered `wiki` application). Any staff account can edit.
  - **Before publishing.** Editors can preview their changes and add a summary.
  - **Edit conflicts.** If someone else saved the page meanwhile, the second save is stopped, so nobody's changes are overwritten.
- **Wiki administrators** (the system owner and Super Admin members) can also **protect** pages so only administrators can edit them, and **delete** pages. The Main Page is protected.
- **Privacy.** Page histories show editors' names only to signed-in staff; the public sees "Staff editor".
- **Security.**
  - Everything typed is escaped, so typed HTML or scripts can't run.
  - Saving requires a per-session token and a same-site request.
  - Pages use a strict Content Security Policy.

## Content and data

- **Stored pages.** Pages and their full history live in `/var/lib/hn-wiki/pages.json`. Reinstalling or updating never touches them.
- **Starting articles.** The articles in `seed/` are added when a page with that title doesn't exist yet. If a starting article changes in an update and nobody has edited that page on the wiki, the page gets the new version as a new history entry. Edits made on the wiki are never overwritten, and pages an administrator deleted don't come back.
- **Page format.** Articles use simple wikitext: `== Heading ==`, `'''bold'''`, `[[Links]]`, `[https://… text]`, `<ref>…</ref>`, `{{Infobox …}}` and `[[Category:…]]`. See `Help:Editing` on the wiki.

## Install / update

Add an **A** record named **wiki** pointing to `217.154.34.205` in the hngroup.org.uk DNS zone (direct or through Cloudflare). Then, on the VPS:

```bash
cd /root/HorizonNetwork && git pull && sudo bash auth-site/install.sh && sudo bash wiki-site/install.sh
```

The Auth step registers the wiki with HN Group Auth so staff can sign in to edit. The wiki installer:

- copies the app to `/opt/hn-wiki` and runs it in PM2 as `hn-wiki` on loopback port 3800;
- adds its own nginx host (`hn-wiki`) and gets a Let's Encrypt certificate for wiki.hngroup.org.uk, which renews automatically;
- rolls back its nginx change if the check fails, and doesn't touch other sites.

If DNS isn't ready yet, the wiki still installs and the installer tells you to run it again once DNS points at the server.

## Tests

- `node --test wiki-site/test.cjs` covers, using temporary data and a stand-in for HN Group Auth:
  - reading every seeded article, and that no seeded page links to a missing page;
  - redirects, search and the sitemap;
  - staff sign-in and return, preview, publishing and escaping;
  - edit conflicts, history privacy, restoring versions and creating pages;
  - categories, protection, admin-only deleting, the CSRF and cross-site checks, and sign-out;
  - that a restart never overwrites edits.
