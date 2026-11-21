# HN Group IT

https://it.hngroup.org.uk — PM2 `hn-it`, loopback port 5710, `/opt/hn-it`.

Uses the approved shared Staff Portal theme, collapsible navigation, account popover and company branding from the signed-in account's main staff profile. Midnight Lavender is the default; saved theme choices remain.

HN Group Auth client `it` issues a host-only `hn_it_session` scoped to IT. Refresh retains the session. Guest grants and account status are rechecked on requests. IT has a fixed proxy allowlist; no account administration, HR records or Finance APIs are exposed. Other public services strip the trusted IT marker.

- Cases: the existing `helpdesk.json` technology queue, including legacy IT tickets; requesters see their own cases, `helpdesk.manage` handles the queue. HR requests and confidential HR records stay separate. Replies, notes, assignment, status and priority keep existing permissions.
- Operations: existing service monitoring and on-call rotas, with original IT permissions.
- Services: Devices, Secure Access Terminal, Downloads, Bots and HN Account retain their own authorization.
- Live updates: shared `/api/live`, preserving unsent replies and current filters.
- Requests are raised through the Staff Portal's existing guided submission form. Its IT receipt links here; Staff has no case-reading APIs.

All writes remain in the single private Staff backend at 3250 and `/var/lib/hn-staff-portal`. Never start another backend writer for this site.

Install with `sudo bash it-site/install.sh [certificate-email]` after DNS points to the VPS. Integration tests use temporary fixtures and real Auth, backend and proxies: `node --test it-site/integration.test.cjs`. Set `CHROMIUM_EXECUTABLE`, `LD_LIBRARY_PATH` and `FONTCONFIG_FILE` for the installed desktop Chromium if needed. No mobile QA is run.

Account administration lives at `/accounts` and `/staff-accounts` for owner-level accounts and Super Admin members, rechecked on every backend request. Personal HN Account administration APIs are retired. Locks are persistent and account-wide, preserve pre-lock disabled state and revoke active sessions. Two consecutive incorrect password or PIN attempts automatically lock the account; a successful completed sign-in clears the counter. Resetting credentials or enabling an account cannot bypass a lock. Manual locks/unlocks are audited; self-locking is refused.

Service status now reads every public monitor, incident and maintenance update directly from Status via a fixed backend fetch, with 15-second UI refresh and an explicit failure state. No monitor/history data is copied; manage monitors and incidents at the Status site.
