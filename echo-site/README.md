# Echo

Private character and artwork library at **https://echo.hngroup.org.uk**. PM2 `hn-echo`, loopback port **5630**, independent installation `/opt/hn-echo`, private data `/var/lib/hn-echo`.

Uses the **unchanged main HN Group website stylesheet**, approved original HN Group wordmarks and favicon, locally hosted Plus Jakarta Sans, 72px header, purple pill actions, hero glow, shared stepped-stripe motion kit, lifting 18px cards and the navy footer. Responsive light/dark layouts, reduced motion, keyboard-accessible dialogs and gallery navigation.

## Access and identity

HN Group Auth client `echo`, fixed callback `/auth/callback`. **Only the actual sign-in account `catnap@hngroup.org.uk` may enter**, case-insensitive. Both Auth and Echo enforce `user.username` (not a selected staff profile's email), and refuse impersonated sessions. Other owner-level/Super Admin accounts have no access. No separate login, passwords or local profile editor. Name, sign-in account, chosen profile, company/job and profile picture come from Auth. The signed-in header opens an account card; changes go through HN Account.

The callback is bound to a random state in an HttpOnly/Secure/SameSite cookie. Private server sessions are keyed by hashed browser tokens, kept in private 0600 files and follow Auth's 30-day expiry. Every private page, API and image request refreshes the Auth identity; unavailable Auth fails closed. Artwork URLs are **not public**, have `Cache-Control: no-store` and require the same authorised session. Changes require the exact site Origin. Original artwork is never served from the public assets folder. Active SVG uploads are refused.

## Library

- Create as many characters as needed, each with name and species; edit or permanently delete a character (with confirmation), including its artwork.
- Categories: **Reference Sheets, Profile Pictures, Banners, Stickers, General Art**, and **View all** within every character. Category counts, title search and newest-first galleries.
- Multi-image uploads, drag/drop, title previews, per-file results and retry of failed files; PNG/JPEG/GIF/WebP, max **40 MB each**, max 100 files per batch. Files are checked by content; animated GIF/WebP originals are preserved.
- Full-size viewer, previous/next and arrow keys, original download, rename or recategorise, use any piece as the character's cover, and confirmed deletion.
- Character search by name/species and sorting by recent activity/name/oldest.

Records are in `library.json`; artwork bytes are in `art/<random id>`. Sessions are in `sessions.json`. Preserve this entire data directory on installation and include it in normal VPS backups. There is no public feed or staff-storage integration. Deletion is permanent; confirmation explains the effect.

## Installation and checks

Standard coordinated update:

```sh
cd /root/HorizonNetwork && git pull && sudo bash install.sh
```

`sudo bash echo-site/install.sh` installs only Echo. Deploy the Auth client registration too when first adding the site. The root installer, website control, Links, HN Account, HN Browser directory and the Status catalogue include Echo. DNS: `A echo → 217.154.34.205` (DNS only). Existing certificates/data are retained. Production test fixtures are not copied by the installer.

```sh
node --test echo-site/test.cjs auth-site/clients.test.cjs auth-site/website-session.test.cjs brand/web/test.cjs admin-site/test.cjs
node --test echo-site/browser.test.cjs
```

Browser tests use Playwright from `browser-app/node_modules/playwright` or `PLAYWRIGHT_MODULE`; `CHROMIUM_EXECUTABLE` can choose an existing Chromium binary. Local fixtures only; screenshots under ignored `.test-results/`. Tests cover exact account versus profile email, other owners/Super Admins, impersonation, revocation, CSRF, private original downloads, persistence and deletion, and the complete gallery UI at desktop/phone widths.
