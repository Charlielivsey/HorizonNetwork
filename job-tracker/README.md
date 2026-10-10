# Job Application Tracker (Google Apps Script)

A Google Sheets add-on script that tracks job applications across job sites.

## Install

1. Open your Google Sheet → **Extensions → Apps Script**.
2. Replace the contents of `Code.gs` with [`Code.gs`](Code.gs) from this folder and save.
3. (Optional) **Project Settings → Show "appsscript.json"** and paste [`appsscript.json`](appsscript.json) so dates and emails use UK time.
4. Reload the spreadsheet. A **💼 Job Tracker** menu appears.
5. Click **Job Tracker → Set Up Sheet** and approve the permissions prompt
   (Google will warn the app is unverified because you wrote it: *Advanced → Go to project*).

## Menu

| Item | What it does |
|---|---|
| **Set Up Sheet** | Creates/formats `MAIN`, `Indeed`, `CV-Library`, `GOV.UK`, `OTHER`, trims spare rows/columns, and schedules the hourly email. Safe to re-run; it keeps your data. |
| **Archive Sheet** | Copies the open sheet into a new `<name> Archive <date>` tab, then clears and reformats it. Archiving a job-site sheet also removes those jobs from `MAIN`; archiving `MAIN` clears every tracker sheet. |
| **New Job** | Form for Job Title, Company, Location, Salary, Date Applied and job site. The job is added to its job-site sheet and to `MAIN`. |
| **Update Job** | Pick a job (pre-selects the row you're on) and tick Phone Interview / Video Recording (for one-way recorded video interviews) / Interview / Job Offer / Rejected, plus a rejection reason. |
| **Send Update Email Now** | Sends the summary email immediately (handy for testing). |

## Columns

Job Title · Company · Location · Salary · Date Applied · Phone Interview ☐ · Video Recording ☐ · Interview ☐ · Job Offer ☐ · Rejected ☐ · Reason for Rejection

Rows are coloured by status (green offer, red rejected, amber interview, purple video recording, blue phone interview).
Columns L–N (Source, ID, Last Emailed Status) are hidden helpers – don't delete them.
Edits made directly in a sheet are mirrored between the job-site sheet and `MAIN`.

## Hourly email

Every hour, an email goes to the addresses in `EMAIL_RECIPIENTS` listing:

- applications with **no status yet**, and
- applications whose status **changed since the last email**.

If there's nothing to report, no email is sent. Note: personal Gmail accounts can send to
100 recipients per day; 3 recipients × 24 hours = 72, so this fits.
