# HN Group Private Wiki

**private.wiki.hngroup.org.uk** — a second, completely separate wiki (the user's request, 30 October 2026). It runs
the same code as the public wiki (`wiki-site/`) in private mode (`WIKI_PRIVATE=1`) with its own pages, images, history,
sign-ins, process and port.

| | |
| --- | --- |
| PM2 process | `hn-private-wiki` |
| Port | 5620 (loopback) |
| Data | `/var/lib/hn-private-wiki` (kept on updates; sign-ins in `sessions.json`, hashed) |
| Starting pages | `private-wiki-site/seed/` (added once, never overwriting edits) |
| HN Group Auth client | `private-wiki` |

- Every page, image and the sitemap need an HN Group Auth sign-in; any enabled HN Group account can read.
- Only the system owner, owner-level accounts and Super Admin members can edit, upload images, set company logos and
  protect or delete pages (never while logged in as someone else). Others see it read-only.
- Company articles, infoboxes, ownership, trees and lists come only from the **Private Company Register**
  (`http://127.0.0.1:5610/api/public/companies`); nothing comes from the public wiki or public register.
- Sign-ins last 30 days and survive restarts.

Install or update: `sudo bash private-wiki-site/install.sh` (the root `install.sh` runs it when `wiki-site/` or this
folder changes; install the private register first). Test: `node --test wiki-site/private.test.cjs`.
