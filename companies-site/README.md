# Company Register — companies.hngroup.org.uk

A register of the group's companies in the style of Companies House, branded as **Horizon Holding Co** and kept entirely separate from the other HN Group websites (its own look, staff accounts and customer accounts; no HN Group Auth). It says clearly that it isn't the UK government's Companies House register.

## Public (no account needed)
- Search by company name, number, previous name, division or officer.
- Each company has an **Overview**, **Filing history** (PDFs, filter by type), **People** (officers; persons with significant control with type and share percentage), **Charges** and **Related companies** (parent, subsidiaries, fellow subsidiaries, management, significant control and shared officers).
- Unknown details show as "Not recorded". Nothing is invented. The register starts with HN Group and Horizon Network only.

## Customer accounts (anyone can register)
Request documents or certificates, report mistakes, and **file changes** for a company: a new registered office address, appointing or removing an officer, notifying or ceasing a person with significant control, a change of name or nature of business, a confirmation statement, or any other filing as a PDF (up to 15 MB). Staff review each one; accepting it updates the company's record and adds the filing (the customer's PDF, or one generated from the details). Staff reply on the site; no emails are sent.

Customers and staff stay signed in (across refreshes, restarts and updates) until they sign out, their cookies are cleared, or 30 days pass without a visit.

## Staff
- Sign in at **/staff/login** (the "Staff sign in" link). A new register starts with **admin@hngroup.org.uk / admin**; you must choose a new password the first time you sign in.
- Staff manage companies, officers, persons with significant control, charges, filings, submissions, requests and customers.
- Administrators also add and remove staff, change roles and set temporary passwords (Administration → Staff). Staff choose their own password at first sign-in.

## Generated filings
Recording a company's incorporation date files an **Incorporation** filing, recording an officer with an appointment date files an **Appointment** filing, and recording a person with significant control with a notified date files a **PSC notification** filing, each with a generated PDF. Changing a company's registered name also keeps the old name and files a **Change of name**. Each is created once.

A new company has to be added with its first officer and first person with significant control; if their dates are left blank, the incorporation date is used.

## Data
`/var/lib/hn-companies/register.json` and PDFs in `/var/lib/hn-companies/files/`. Updates never touch them.

## Install or update
```
cd /root/HorizonNetwork && git pull && sudo bash install.sh
```

## Tests
```
node --test companies-site/test.cjs
```
