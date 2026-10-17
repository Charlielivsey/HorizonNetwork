# HN Group Company Register — companies.hngroup.org.uk

A register of HN Group companies, in the style of Companies House but run by HN Group for its own group. It is not the UK government register.

## Public (no account needed)
- Search by company name, number, previous name, division or officer name.
- Each company has an **Overview** (registered office, status, type, incorporation, SIC codes, accounts and confirmation statement dates, group structure), **Filing history** with PDFs and a type filter, **People** (officers, and persons with significant control) and **Charges**.
- Details that haven't been entered show as "Not recorded". Nothing is invented.

## Customer accounts (anyone can register)
- Create an account with a name, email and password (at least 10 characters, stored with scrypt). Repeated wrong passwords pause sign-in for 15 minutes.
- **Request a document**: a copy of a filing, a certificate or something else.
- **Report a mistake** on a company record.
- **Submit a filing** as a PDF (up to 15 MB). Staff review it; accepted filings are published in the company's filing history and rejected ones are deleted.
- Staff reply on the site. The register doesn't send emails.
- Customers only ever see their own requests and submissions, and never get into administration.

## Staff administration (/admin)
- Sign in through HN Group Auth as the `companies` application. Only the system owner, owner-level accounts and Super Admin members are allowed.
- Add, edit, hide or delete companies; manage officers, persons with significant control, charges and filings (with PDFs).
- Review submitted filings, reply to requests, disable customer accounts, and see recent activity.

## Data
Everything is stored in `/var/lib/hn-companies/register.json`, with PDFs in `/var/lib/hn-companies/files/`. Updates never touch it. For now the register starts with HN Group and Horizon Network only; seed companies are added once and staff edits are never overwritten.

## Install or update
On the VPS:
```
cd /root/HorizonNetwork && git pull && sudo bash install.sh
```
DNS: `A companies → 217.154.34.205` (DNS only) in the hngroup.org.uk zone.

## Tests
```
node --test companies-site/test.cjs
```
