# Staff Portal workspace

The remaining portal uses a persistent navigation rail, a compact command bar and an overview built around live announcements, colleagues, calendar and community tools. HR, Finance, Docs and HN Account are linked as separate services. The former deprecation notice has been removed. A compact identity button opens the sidebar’s account controls: availability, HN Account, Settings, permitted System Admin access, Sign out and Sites. The account popover sits beside the sidebar on desktop, with separate status/reason/return-date lines and an aligned edit action. Outside click dismisses it; Escape closes it and returns focus to the identity button.

`public/assets/portal-ui.js` provides the portal shell and dashboard; `portal-ui.css` styles the retained screens and shared components. Both are loaded by `app.html`. The script exits immediately when `data-hn-app` identifies HR or Finance. All new CSS is scoped to `html[data-portal-ui]`, so the services that share portal assets retain their own rendering. The small hooks in `app.js` use the existing permission-filtered navigation, API client, announcement actions, profile data, clocks and home layout preferences. No new account or data store is introduced.

Navigation includes only retained portal routes. Service links and search send staff to the separate applications. All authorization stays on the existing backend. Startup and route failures offer retry; keyboard navigation, mobile drawer focus, dialog focus and reduced motion are supported.

## Validation

Run `node --test staff-portal/portal-redesign.test.cjs` with Playwright Chromium installed. `CHROMIUM_EXECUTABLE` selects an existing Chromium binary. `HN_PORTAL_QA_ROLE=manager` or `employee` runs one role's browser pass. The test creates an isolated data directory and real Auth/private-backend/public-proxy stack, signs in two fixture accounts, and checks retained pages, permissions, refresh, theme persistence, menu/search/dialog behavior, support ticket submission, mobile overflow and failure recovery. Screenshots are ignored under `.test-results/portal-redesign/`.

Also run the existing HR/Finance migration suites and portal dropdown/staff document regressions when changing the shared entry points. Deploy the four frontend assets plus `app.html` together. The calendar access update requires restarting the existing private backend; no data migration or additional writer is introduced.


## Personal calendar and privacy

`lib/personal-calendar.js` projects the existing HR leave records and group events for the requested scope. The default is the signed-in profile’s own calendar. Owners/owner-level accounts and `system.admin` may choose a staff member’s full calendar. Reporting-line managers see approved annual leave for direct reports across all of their saved company roles and linked account profiles, including both supervisor and subordinate secondary roles. Removing a linked profile revokes its availability access on the next request. The sign-in company selection does not narrow this availability view. Staff and leave items are deduplicated while each reporting relationship remains eligible. Team Leader/Team Lead titles introduce a calendar-only availability rule for the matching company and department; without a department, the existing company team is used. Other people’s sickness and events never enter availability responses. Permissions and relationships are resolved afresh on every request; client-selected IDs do not grant access.

`personal-calendar.js` renders month/agenda views, type filters, authorized scope controls and automatic refresh. Private events use attendee IDs in the existing events file, and leave remains in the single HR file. Existing company events, public celebrations, event-management permissions and half-day/pending leave are preserved. The profile dialog has explicit size and grid constraints, wrapping long content and stacking its independently scrollable sections on narrow windows. Management-company branding is excluded from portal presentation; stored staff/company identifiers are unchanged.

Additional checks: `personal-calendar.test.cjs` and `calendar-workspace.integration.test.cjs` cover projection privacy, forged scopes, live relationships, HTTP permissions and desktop/mobile/large-text browser QA.


## Position chart

The directory’s Org chart tab embeds an adaptation of the People site renderer and its scoped styles. `/api/org-chart` requires a portal session and calls the same `people-public.publicPeople(store)` projection as People, including saved reporting-position overrides, vacant positions and split multi-holder reporting branches. It polls every 15 seconds, retains filters/collapse/zoom, and opens current directory profiles. No reporting lines are edited by rendering or filtering. The sidebar stays in place; company branding excluded from the portal remains excluded from this chart. `position-chart.browser.test.cjs` checks filters, multi-holders, vacancies, connector geometry, live reporting changes, zoom and mobile fit.

## Feedback release

The deprecation notice is absent from the HTML source and installed runtime. Page heading icons and text form an adjacent group; the sticky header cannot shrink or cover anchored content. System Admin explicitly focuses its dynamically inserted PIN input; its existing submission and protection remain. Staff-facing support navigation, search and ticket controls read exactly “Raise a issue”, using the original helpdesk routes, APIs and records. Versioned asset URLs change together.

Current validation is desktop only at the user’s request. `HN_PORTAL_DESKTOP_ONLY=1` skips mobile passes in the broad regression suite. `HN_PORTAL_DEPLOYED_ASSETS=1` runs the calendar/workspace fixture against the exact installed HTML/assets, with isolated accounts/data.
