# HN Group HR

https://hr.hngroup.org.uk — PM2 `hn-hr`, loopback 5680, `/opt/hn-hr`. Install with `sudo bash hr-site/install.sh <certificate-email>`.

Dedicated HN Auth client `hr`, independent host-only staff session. The site uses the established leave screens, theme and dropdowns, with a restricted proxy to the private staff service at 3250. The public Staff Portal blocks leave APIs and redirects `/leave` here. Existing leave data remains in `/var/lib/hn-staff-portal/leave.json`, written by one backend only. No separate accounts or leave data are copied.

All existing annual leave, sickness, other absence, TOIL, work patterns, return-to-work forms, team calendar, shutdown days and management settings remain available. Default annual allowance is 74 days. Additional days require the staff member’s request, reason and current direct supervisor’s decision. Pending plus approved extra requests are capped at 10 days per person per calendar year; approved extras apply only to that year, subject to the existing carry-over rules. No self-approval or HR-only substitute approval for supervisor requests. Where no direct supervisor is assigned, an explicit staff request automatically tops up approved additional days to 10 for the selected year; repeated requests cannot grant more. Pending requests for that year are replaced and retained as cancelled history.
