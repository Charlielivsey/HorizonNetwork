# Staff Portal workspace

The remaining portal uses a persistent navigation rail, a compact command bar and an overview built around live announcements, colleagues, calendar and community tools. HR, Finance, Docs and HN Account are linked as separate services. The non-dismissible deprecation notice remains below the header.

`public/assets/portal-ui.js` provides the portal shell and dashboard; `portal-ui.css` styles the retained screens and shared components. Both are loaded by `app.html`. The script exits immediately when `data-hn-app` identifies HR or Finance. All new CSS is scoped to `html[data-portal-ui]`, so the services that share portal assets retain their own rendering. The small hooks in `app.js` use the existing permission-filtered navigation, API client, announcement actions, profile data, clocks and home layout preferences. No new account or data store is introduced.

Navigation includes only retained portal routes. Service links and search send staff to the separate applications. All authorization stays on the existing backend. Startup and route failures offer retry; keyboard navigation, mobile drawer focus, dialog focus and reduced motion are supported.

## Validation

Run `node --test staff-portal/portal-redesign.test.cjs` with Playwright Chromium installed. `CHROMIUM_EXECUTABLE` selects an existing Chromium binary. `HN_PORTAL_QA_ROLE=manager` or `employee` runs one role's browser pass. The test creates an isolated data directory and real Auth/private-backend/public-proxy stack, signs in two fixture accounts, and checks retained pages, permissions, refresh, theme persistence, menu/search/dialog behavior, support ticket submission, mobile overflow and failure recovery. Screenshots are ignored under `.test-results/portal-redesign/`.

Also run the existing HR/Finance migration suites and portal dropdown/staff document regressions when changing the shared entry points. Deploy the four frontend assets plus `app.html` together. Backend restarts and data migrations are unnecessary for this UI release.
