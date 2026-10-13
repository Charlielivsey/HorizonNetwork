# HN Group project preferences

- Use the approved original logo assets in `brand/logos/` whenever a logo is needed. These are the user's supplied HN-Group-Logos 2.zip assets. Choose the matching company and light/dark variant; preserve the artwork, colours, proportions, and clear space. Do not substitute a text imitation or redraw an available logo.
- Read `brand/README.md` for logo names and shared design references. Copy required assets into each site's own public directory so deployments stay independent.
- Match the existing public website and staff portal design language for HN Group sites: Plus Jakarta Sans, the HN palette and multicolour stripe, purple actions, rounded cards, and responsive layouts.
- Include an appropriate browser tab icon. The approved existing HN Group favicon is `hngroup-site/public/assets/favicon.svg`.
- Keep each website's installation isolated. When making changes to the status site, do not edit or invoke the other website installers. The user requested a dedicated auth.hngroup.org.uk service backed by staff accounts; its narrowly scoped integration helper may update the necessary portal authentication bridge files and restart that portal when those files change, while leaving the main public website alone. The status installer may invoke the isolated auth installer to set up both requested services. Status admin must authenticate through auth.hngroup.org.uk and admit only the system owner and Super Admin role members.
- Provide a single-line VPS update/install command when delivering website changes.

- Auth must end the browser session on refresh, matching the staff portal. Keep PIN entry masked; use the six-box HN design with smooth transitions and reduced-motion support. Completing six digits verifies automatically once; successful application sign-ins return automatically to the registered site. Status shows the signed-in user’s profile privately.

- The main website has a protected configuration panel at /admin for the system owner and Super Admin members, using HN Group Auth. Maintenance must hide all public pages and public APIs while retaining Auth login and protected configuration access. Preserve maintenance settings across deployments and default new installations to off. Use hngroup-site/install-admin.sh for isolated updates to this feature.

- Auth remembers the last account independently in each browser, matching staff Resume session: require the same masked PIN after refresh/navigation, verify six digits automatically, show the remembered name/avatar, and offer account switching and Forget me. Use staff-backed rotating remembered tokens and existing revocation/attempt limits; remembering must never bypass PIN or application permissions.
