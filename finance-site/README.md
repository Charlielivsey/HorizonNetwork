# HN Group Finance

`https://finance.hngroup.org.uk` · PM2 `hn-finance` · loopback 5690 · `/opt/hn-finance`.

Payslips (including P60s and PDF printing), expenses and mileage, payroll and approvals, company funds and budgets/statements/forecasting, invoices and bills use the existing financial service in the single private staff backend on 3250. Existing records remain in `/var/lib/hn-staff-portal`; there is no migration or second writer. The public Staff Portal redirects old finance pages and refuses finance APIs.

The dedicated `finance` Auth client requires a staff profile. Finance uses a host-only `hn_finance_session` cookie; sessions survive refresh and backend restarts and recheck enabled accounts and guest site grants. Finance sessions cannot be used as Staff Portal sessions. Staff see their own issued payslips and eligible expense claims; existing supervisor checks and `payroll.manage` permission checks remain unchanged. Guests need Finance ticked in IT account administration. Only the narrow Finance API allowlist is relayed; POST requires the exact Finance Origin. Public staff and HR proxies strip the trusted Finance marker.

The rebuilt Finance workspace uses `public/assets/finance-ui.js` and `finance-ui.css` for a collapsible sidebar, Your money / Company finance section overviews and top navigation, account disclosure menu, searchable records, compact financial cards, tables and centred forms. The overview reads real payslip, expense, balance, invoice and bill data; unavailable sources never show an invented zero. Company branding follows the signed-in person’s main staff record. `/` redirects to `/home` with query parameters preserved.

The authenticated `/api/live` change marker enables the shared three-second refresh loop. Current filters and search survive updates; a focused record search keeps its cursor and selection; open forms and unsaved drafts defer replacement. Account permissions and guest grants remain checked by the private backend.

Shared portal assets retain the approved HN Group logos, Plus Jakarta Sans, motion kit, themed controls and account-synced Midnight Lavender / Light / Lavender Dusk themes. Finance has its own overview, navigation and footer. Assets remain served with `no-cache` and versioned URLs.

Install after updating the staff backend and Auth: `sudo bash finance-site/install.sh <certificate-email>` (or the selective root installer). DNS: A `finance` → `217.154.34.205`, DNS only. Installer keeps central maintenance/power includes and reconciles only Finance's saved power state. Status discovers it through the central catalogue.

Checks: `node --test finance-site/test.cjs finance-site/integration.test.cjs`. Browser QA: `HN_FINANCE_BROWSER=1 node --test finance-site/integration.test.cjs` with the repository's Playwright Chromium installed. Browser QA is desktop-only while mobile QA is paused. It uses temporary fixture data and saves screenshots under `.test-results/`.
