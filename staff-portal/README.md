# HN Group Staff Portal

Internal staff portal for the whole of HN Group, served at **https://staff.hngroup.org.uk**.

**Default login:** `admin@hngroup.org.uk` / `admin`. Change this straight away under **Settings → Security**. Staff sign in with their work email address.

## Features

- **Home page.** Shows the current date and time on your device, and the time where your profile location is set, with the difference between the two. It also shows the latest announcements, anything you need to acknowledge, your onboarding tasks, what's coming up on the calendar and your status.
- **Dropdown navigation.** People, Workplace, HR and Support. Pages you don't have permission for are hidden.
- **Staff Directory.** Every employee with their photo, job title, company, emails, location and live local time. You can search and filter by company. Click someone to see who they report to and who reports to them.
- **About HN Group** (Support → About HN Group). It covers the companies in the group with how many people work at each, the brand colours (click to copy) and every logo, with SVG and PNG downloads. The logo files are in `public/assets/brand/`.
- **Email signature** (Workplace → Email signature, or the menu under your name).
  - Builds a branded signature in the same layout as the brand email signatures: the company logo, name, job title, company, email, optional phone, website, the colour stripe, the parent company line and the confidentiality notice.
  - Pick which company role to use; the logo, colour, email address and website follow it.
  - **Copy signature** pastes straight into Gmail or Outlook. You can also copy the HTML or download it as a file, and there are step-by-step instructions for Gmail, Outlook and Apple Mail.
  - People with *Manage staff* can make a signature for anyone.
  - The logo images load from the portal (`/assets/brand/png/`), so recipients need to be able to reach staff.hngroup.org.uk.
- **Leave & Absence** (HR → Leave & Absence).
  - Staff request annual, compassionate, unpaid or other leave, with half days for single days. Sickness is reported and recorded straight away.
  - Only working days count: weekends and UK bank holidays are skipped. Annual leave comes out of a yearly allowance (January to December, 25 days by default).
  - Requests go to the person's supervisor, or anyone with *Manage leave*. Approved leave shows on the company calendar and the rota (without the reason).
  - Staff can request more leave than they have left. The form warns them, the request is marked "over allowance", and the approver has to confirm before approving it.
  - While approved leave is happening (anything except sickness), the person's status switches to **Out of office** with their return date, e.g. "Annual leave · back Mon 19 Oct". Back-to-back bookings count as one absence. When the leave ends or is cancelled, their previous status comes back. If they change their status themselves during the leave, it's left alone.
  - **Set leave** places someone on leave straight away, with no approval step. People with *Manage leave* can do it for anyone; supervisors can do it for their own team. **Request leave** is always for yourself.
  - People with *Manage leave* can set the default allowance and individual allowances and see everyone's leave.
  - **Carry-over.** Unused annual leave carries into the next year, up to a maximum (5 days by default, set under *Allowances & absence*). It starts from the year this feature was added.
  - **Return to work.** Once approved sickness ends, the person's supervisor (or anyone with *Manage leave*) gets a return-to-work form to fill in, shown on the *Return to work* tab and their home page.
  - **Absence.** *Allowances & absence* shows each person's sickness occurrences, days and **Bradford score** (occurrences² × days over the last 52 weeks).
- **Probation & reviews** (HR → Probation & reviews).
  - Probation ends 3 months after the start date by default and can be changed. Reviews due in the next 14 days, or overdue, are listed and counted in the menu.
  - Supervisors and people with *Manage staff* record probation, annual, one-to-one or other reviews. A probation review's outcome (passed, extended or failed) updates the probation. Reviews can be shared with the employee.
- **Staff documents** (HR → Staff documents). People with *Manage staff* keep contracts, right-to-work checks, ID, qualifications, letters and other files against each person. Files marked *shared* can be seen and downloaded by that person.
- **Rotas & Timesheets** (HR → Rotas & Timesheets).
  - A weekly rota everyone can see. People with *Manage rotas & timesheets* add, edit and delete shifts, and can copy last week's rota.
  - Staff fill in a weekly timesheet, prefilled from their shifts, and submit it. Their supervisor or a rota manager approves it or sends it back with a note.
- **Payslips** (HR → Payslips). Staff see their own issued payslips, with how their pay adds up, year-to-date totals, and an *Employer deductions* section (employer NI and pension paid on top of their pay, and the total cost of their pay), and can print them or save them as a PDF.
- **Run payroll** (HR → Run payroll). Only for people with *Run payroll*, which by default only the **Human Resources** role has.
  - Every payslip is paid by **HN Group Limited**. Everyone's standard pay is **£10 a month**, with a **5% employee and 10% employer pension**, until HR changes it in their pay details. Pay can be a monthly salary or an hourly rate; hourly staff are paid for the hours on their approved timesheets.
  - Pay details also hold the tax code, NI number and category, pension percentages, student loan plan, and any pay and tax earlier in the tax year from a P45 or an older payroll.
  - **Income tax, National Insurance, pension and student loan are worked out automatically** and recalculate as payments change; HR can't type over them. Income tax is cumulative across the tax year (2025/26 rates, rest of UK); emergency W1/M1 codes are worked out month by month. HR can add payments (a bonus, say) and other deductions.
  - **Run payroll** makes a payslip for everyone selected and takes the cost (pay plus employer NI and pension) out of the payroll fund. Changing a payslip adjusts the charge and deleting one refunds it. Payslips are drafts until issued; staff only see issued ones. A **single payslip** for someone who already has one that month needs the "additional payslip" override; it's marked *Additional*, and its tax takes the first one into account.
- **Company funds** (HR → Company funds). Only for people with *Run payroll*.
  - The **main balance**: add money when it reaches the company PayPal (or a bank transfer, or manually), with a reference, or remove money with a reason.
  - The **payroll fund**: separate. Money only moves between it and the main balance ("Move from main balance" and "Move to main balance"). Running payroll takes the cost from the payroll fund first. Anything it can't cover is taken from the **main balance**, which can go negative (the payroll fund stops at £0).
  - While either balance is negative, **payroll can't be run** and a warning says the next payroll cannot be met (on the funds and payroll pages, and on HR's home page). Warnings also show when the payroll fund won't cover the next payroll (the rest will come from the main balance), or when there isn't enough money in total.
  - Every movement is listed with who made it and the balance afterwards.
  - **Statement** makes a branded monthly statement: opening balance, money in, what's been spent (payroll and removals), how much is left, and an **estimated balance at the end of the month** (what's left now, less the payroll still to run that month). A **next month estimate** carries that on: next month's starting point less its payroll, plus what it would be if money comes in like the last three months. It also covers both accounts and every transaction. **Download PDF** opens the print window; choose *Save as PDF*.
- **Service status** (Support → Service status). Checks websites and services every few minutes and shows whether each is up, uptime over 24 hours and 7 days, response time and recent errors. The staff portal itself is checked automatically. People with *Handle IT tickets* add and remove services, and down services are counted in the menu.
- **IT Helpdesk** (Support → IT Helpdesk). Anyone can raise a ticket with a category and urgency and follow the conversation. People with *Handle IT tickets* (the **IT Support** role) see every ticket, reply, add internal notes, assign tickets and change their status.
- **Global search.** Use the search box in the top bar, or press **Ctrl+K** (**⌘K** on a Mac) or **/**. It searches people, pages, documents, announcements, events and polls.
- **Status.** Click your name, then the status line, to set Available, Busy, Away or Out of office. You can add a message and a date it clears on. Your status shows on your profile and in the Staff Directory.
- **Employee Management.** Only shown to people with the *Manage staff* permission. Click any row to edit that person.
  - Add employees with their first and last name, display name, job title, company, other companies they work at, supervisor, location, time zone, phone and start date. The start date is used for work anniversaries.
  - **Emails** are generated as `firstname.lastname@domain`. If that address is taken, a number is added (`firstname.42.lastname@domain`).
    - Each address can be overridden with a custom one.
    - Employees can have several addresses on different brand domains.
    - The **primary** address is their login username.
  - After adding someone, you're asked whether to create their login account. A temporary password is shown once on screen, and the employee must create their own password the first time they sign in.
  - You can reset a password, disable or re-enable a login, edit details and delete employees.
- **Settings.** Opened by clicking your name. It has three tabs: **Profile** (picture, banner, display name, phone, location, time zone, skills, languages and birthday), **Appearance** (theme) and **Security** (password, sign-in code, **Where you're signed in**, where you can sign out other devices, **Sign-in history** and **Download my data**). Birthdays are day and month only, and you choose whether colleagues can see yours.
- **Profile banners.** Under **Settings → Profile**, everyone can choose one of eight preset gradient banners or upload their own wide image, which is cropped to 3:1. The banner shows at the top of their profile and on their Staff Directory card.

**Companies:** HN Group, Horizon Network, Horizon Advertising, Horizon Development and Horizon Media Group.

**Email domains:** `hngroup.org.uk`, `horizon-network.co.uk`, `horizonadvertising.co.uk` and `media.hngroup.org.uk`.

Both lists are at the top of `lib/store.js` if you need to change them.

### Money

- **Expense claims** (HR → Expenses). Anyone claims money back with a receipt photo or PDF. Their supervisor or anyone with *Run payroll & finance* approves it. Payroll then repays it either **now** (taken from the main balance and recorded under its spending category) or **with the next payslip**, where it's added tax free under "Expenses repaid".
- **Invoices** (HR → Invoices, finance only). Branded invoices from any HN Group company with lines, VAT (0, 5 or 20%), due dates and payment details. Mark as sent, paid (the total is added to the main balance) or void, and download a PDF. Overdue invoices are flagged on the home page.
- **Spending categories and budgets** (Company funds → Categories & budgets). Money removed from the main balance is tagged with a category (Hosting, Software, Marketing and so on; you can add your own). Give a category a monthly budget to get a warning at 80% and when it's over. Statements show spending by category.
- **Charts on Company funds.** The last 12 months of money in, money spent and the total balance.
- **Payroll year end** (Run payroll → Year end). Everyone's totals for a tax year, a P60-style end of year certificate for each person (print or save as PDF), and an export of every payslip to a spreadsheet (CSV). Staff can open their own certificate from Payslips → End of year (P60).
- **Scheduled pay changes** (Pay details → Scheduled pay changes). Set a new salary or hourly rate from a future month; payroll uses it automatically from that month.
- **Payroll approval** (Run payroll → Settings). Turn on *Payslips need approving* and a second person with *Run payroll & finance* has to approve each payslip before it can be issued. The person who created or last changed a payslip can't approve it.
- **Pay history and salary bands** (Pay details → Pay history). A timeline of every salary or rate change for a person. Set salary bands (for example "Designer: £24,000 to £32,000") and each person shows whether they're below, within or above their band.
- **Bonuses and commission** (Pay details → Bonuses & commission). Add a one-off bonus for a chosen month, or a monthly commission rate. Both are added to the next payslip automatically.
- **Mileage claims** (Expenses → Claim mileage). Enter the journey and miles; the amount is worked out at HMRC rates (45p a mile for the first 10,000 miles in the tax year, 25p after).
- **Cash-flow forecast** (Company funds → Forecast). The next six months of balance, using upcoming payroll (with scheduled pay changes), bills that are due, unpaid invoices and average monthly spending.
- **Supplier bills** (HR → Bills, finance only). Record bills you need to pay with a due date and category, optionally repeating monthly, quarterly or yearly. Bills due this week are flagged on the home page; marking one paid takes it from the main balance.

### HR

- **Leave calendar** (Leave & Absence → Calendar). A month grid of who's off, filterable by company, with bank holidays shaded. Reasons are never shown, and sickness only shows as "Off" to people who don't manage leave.
- **Clash warnings.** When more than a set number of people from one company would be off at once (3 by default, set under *Allowances & absence*; 0 turns it off), the request shows who else is off for the approver, and the calendar highlights the day.
- **Company shutdown days** (Leave & Absence → Shutdown days). Book the same days off for everyone (or chosen companies), like Christmas closure. Each person gets approved annual leave that comes out of their allowance; anyone already off is skipped and listed. Cancelling a shutdown gives the days back.
- **Time off in lieu (TOIL).** When a timesheet with more hours than the rota planned is approved, the approver can bank the extra hours. Supervisors and HR can also add or take off hours. Staff book it as **Time off in lieu** (7.5 hours a day), which can't go over their balance.
- **Training** (HR → Training). Courses and certificates with completion and expiry dates. Staff add their own; HR sees everyone's, marks them as checked and sets **required courses** for everyone or one company. Expiring (within 30 days), expired and missing required training is flagged.
- **HR cases** (HR → HR cases, *HR cases* permission only). Disciplinary, grievance, capability and investigation records with a timeline of notes and meetings, attached letters, an outcome and, for warnings, when the warning expires (6 or 12 months by default). Opening a case is recorded in the activity log.
- **Goals** (HR → Goals). Quarterly goals with a measure of success. People update their progress and status (on track, at risk, off track, done); supervisors and HR set goals for their team and see everyone's progress.
- **360 feedback** (HR → 360 feedback). Ask at least two colleagues for anonymous feedback about someone. Results (average ratings and comments, never names) only show once at least two people have answered.
- **Pulse** (Workplace → Pulse). A quick anonymous question each week (1 to 5 and an optional comment), shown on the home page until answered. HR sees the trend over time and can change the question.
- **Exit interviews.** Leaver checklists include an exit interview task: the leaver fills in a short form from their home page and the task ticks itself. HR sees the answers and a summary of reasons for leaving under HR → Exit interviews.
- **Policy versions** (Documents & Policies). Uploading a new version of a document keeps the old one in its history with a note of what changed, who acknowledged which version, and a download of each old version. Policies needing acknowledgement ask everyone again.
- **Flexible working requests** (HR → Flexible working). Staff ask for a different pattern (changed or compressed hours, part time, different start and finish times, or working from home); their supervisor or HR approves it, approves it as a trial with an end date, or declines it with a reason.
- **Work patterns and bank holidays.** Set the days each part-time or shift worker works (Leave & Absence → Allowances & absence). Leave only counts their working days, and their allowance is adjusted for bank holidays that fall on days they do or don't work, so everyone is treated fairly.
- **Jobs** (People → Jobs). Recruiters (*Recruitment* permission) post vacancies, which everyone is told about and can apply for or refer someone to, with a CV. Applicants move through Applied → Screening → Interview → Offer → Hired. Hiring someone new creates their employee record with a work email address and starts their onboarding checklist.

### People

- **Notifications bell** (top bar). Leave requests and decisions, expense decisions, payslips issued, shared reviews, IT ticket replies, kudos, idea updates, new vacancies, timesheet decisions and service outages (for IT). Click one to go straight to it. **See all notifications** shows the last 90 days.
- **Kudos** (People → Kudos). Thank colleagues publicly with a value such as Teamwork or Above and beyond; others react. The most thanked people this month are listed, and the latest kudos show on the home page.
- **Staff milestones.** Birthdays (for people who share theirs), work anniversaries and new starters are worked out automatically and show on the home page, the Kudos page and team pages, with a 🎉 button to send congratulations.
- **Ideas** (Workplace → Ideas). Anyone shares an idea (optionally anonymously, hidden even from leadership), votes and comments. People who post announcements set the status (under review, planned, in progress, done, not going ahead) with a note, and the author and voters are told.
- **Chat** (People → Chat). An *Everyone* channel, a channel for each company (for the people who work there) and direct messages between two people. New messages appear every few seconds, unread counts show in the menu, and there's a **Message** button on each profile.
- **Q&A** (People → Q&A). Ask a question, answer other people's, mark answers as helpful, and the person who asked picks the best answer. Questions and answers show in the search box.
- **Knowledge base** (People → Knowledge base). How-to pages anyone can write and edit, with headings, lists, bold text, links and `[[Page title]]` links between pages. Every edit is kept in the page history and old versions can be restored. People who manage documents can delete pages.
- **Mentoring** (People → Mentoring). Ask someone to be your mentor (people's skills show when choosing), agree goals and how often to catch up, log each catch-up and keep a shared notebook only the two of you can see. HR can pair people directly. A reminder shows when a catch-up is due.
- **Skills and languages.** Add them under Settings → Profile. They show on your profile, and the directory and search box find people by them.
- **On call** (Support → On call). Who's on call each week (Monday to Sunday) for each rota, such as IT support. IT set the rota week by week or fill it automatically with **Take turns**. Whoever's on call this week shows on everyone's home page.
- **Team pages** (People → Teams). A page for each company: its people and their status, who's off, news posted for that company, kudos, celebrations, leave and events in the next 30 days, and open roles.

### IT

- **Outage alerts.** When a monitored service fails two checks in a row, IT get a notification and a red banner on every page until it's back up (they're told then too). Tick *Show a banner to all staff* on a service everyone uses to show the banner to everyone.
- **Activity reports** (Support → Activity reports, *Activity reports* permission). A monthly summary: headcount, starters and leavers, sign-ins each day, leave by type, IT tickets, outages and uptime, kudos, ideas and other activity, plus payroll, expenses, invoices and funds for people who run payroll. **Download PDF** saves it.
- **Sign-in history** (Settings → Security). Your recent sign-ins and failed attempts, with the device and IP address. **This wasn't me** signs you out on every other device, forgets remembered browsers, raises an urgent IT ticket and asks you to change your password and code.
- **Password rules** (System Admin → Password rules). Set the minimum length (8 to 32), block common and leaked passwords (and ones based on the person's name), and optionally make people change their password every 90 days, 180 days or year. Expiry counts from when it's turned on, so nobody is forced to change straight away; when a password expires the person must choose a new one after signing in.
- **Download my data** (Settings → Security → Your data). Everyone can download the personal data the portal holds about them as a JSON file: profile, sign-ins, leave, payslips, expenses, timesheets, training, goals, reviews, messages, Q&A and more.
- **Data retention** (System Admin → Data retention). Choose how long to keep the activity log, unsuccessful job applicants and their CVs, chat messages, closed IT tickets and (optionally, after 6 or 7 years) leavers' records. Older data is deleted automatically every night at about 3am, or straight away with **Run clean-up now**.
- **Announcement schedule** (Announcements → Schedule, for people who post announcements). A month calendar of when each announcement goes out and comes down, with a list of what's coming up. Click a day to schedule one for 9am that day.
- **Customise your home page.** **Customise this page** at the bottom of the home page lets everyone choose which side panels show (including the optional *Leave balance* and *Unanswered questions*) and put them in their own order.
- **Backups.** System Admin → Backups now shows when the last backup was taken (with a warning, also on the home page, if it's more than 36 hours ago) and lets you **upload a backup** file (for example one downloaded from another server) to restore it.

### System owner & System Admin

The **system owner** has access to everything. The owner is whoever has the email `charlie.livsey@hngroup.org.uk`, set in `settings.json` as `ownerEmail`.

The owner's record is locked to everyone else. HR, leadership and the admin account can create the owner's first login, but they can't edit, reset, disable or delete the owner after that.

The owner can open **System Admin** from the menu under their name. It's protected by the master system PIN, which starts as `0103`. It locks itself after 15 minutes of inactivity, and 5 wrong PINs lock it for 15 minutes. It has:

- **Active sessions.** Everyone signed in, with their device, IP address and last activity. You can end one session, **log out everyone else**, or **force log out everyone**, including yourself. Disconnected users are sent back to the sign-in page within about 30 seconds.
- **Log in as.** Open the portal as any user with a login, without their password. A banner shows the whole time with a **Return to my account** button. Passwords can't be changed while you're logged in as someone else.
- **Change System Admin PIN.**
- **Activity log.** Every action across the portal is recorded in `audit.log`. That covers sign-ins (including failed ones), sign-outs, password changes and resets, login accounts being created, disabled or enabled, staff added, edited or deleted (with which fields changed), profile and photo changes, access rule changes and every System Admin action. Actions done through "log in as" are marked with who was really doing them. You can search and filter the log by type.

### Working at more than one company

In the employee form, ticking a company under **Also works at** lets you set a separate **job title** and **supervisor** for that company. Leave either blank to use the main company's details.

Each role is its own profile. Someone who works at three companies has three profiles in the directory and three places in the org chart.

A supervisor is always shown in their role at the same company as the person reporting to them. For example, Jack is VP at Horizon Network, which is his main company, and reports to Charlie. Charlie is CEO of HN Group but also President of Horizon Network, so Jack's profile and the org chart show Charlie as President of Horizon Network. If the supervisor doesn't work at that company, their main role is shown instead.

Staff see their main role under the greeting on the home page, and in a short "Signed in as…" message when they sign in.

### Staff Directory views

- **Cards** for browsing.
- **List** for scanning.
- **Org chart** showing reporting lines for the selected company. Teams can be collapsed.

### Signing in

- **Resume session.** After a full sign-in, the browser remembers who signed in (for 30 days). Next time the sign-in page shows **Welcome back** with the person's photo and only asks for their 6-digit sign-in code; **Resume session** also appears above the email box. "Not you?" signs in as someone else and **Forget me on this browser** removes it. It stops working after 5 wrong codes, or when the person's password or code changes, their login is disabled or they're signed out everywhere. Only a hash of the remembered token is stored (`resume.json`, not included in backups).
- **Maintenance mode** (System Admin → Maintenance mode, system owner only). Turning it on needs a second, separate **maintenance PIN** (default `1101`; 5 wrong tries locks it for 15 minutes). While it's on, everyone except the system owner is signed out straight away, including anyone being "logged in as", and **Log in as** is turned off. When they sign in (after their password, or their code for Resume session) they see the HN Group logo and your maintenance message instead of the portal. The owner sees a purple reminder banner until it's turned off.

Signing in has two steps: your **email and password**, then your personal **6-digit sign-in code**.

- **Setting a code.** Everyone sets their code the first time they sign in after this feature was added, or straight after creating their password if they're new. Until they do, nothing else in the portal works for them.
- **Rules.** Codes must be exactly 6 digits. Easy ones like `123456` or `000000` are refused.
- **Changing your code.** Go to **Settings → Security**. You'll need your current password.
- **Forgotten codes.** HR and leadership can use **Reset sign-in code** in Employee Management. The person then chooses a new code at their next sign-in.
- **Wrong codes.** Five wrong codes mean starting again from the password step. Wrong codes count towards the 15-minute lockout on that network address, and they're recorded in the activity log.
- **Log in as.** "Log in as" in System Admin skips both the password and the code.

**How long a sign-in lasts.** Reloading the page or opening a portal address directly signs you out, and so does closing the browser or leaving the portal unused for 12 hours. Moving around inside the portal keeps you signed in. Sign-ins are saved in `sessions.json`, so restarting the app or running the installer doesn't sign anyone out. Only a hash of each sign-in token is stored, so the file can't be used to sign in.

### Workplace

- **Announcements.** Leadership and HR can post announcements to everyone or to particular companies. They can also pin them to the top, mark them as important, and edit or delete them. Everyone else sees the ones meant for them. Unread announcements are counted in the **Workplace** menu. The latest five are shown in full on the home page, and any you haven't seen yet pop up when you open the home page. Closing the pop-up marks them as read.
- **Documents & Policies.** Leadership and HR can upload PDF, Word, Excel, PowerPoint, text, CSV or image files up to 20 MB. Each document has a category (Policies, Handbooks, Forms, Templates, Guides or Other) and can be shared with everyone or with particular companies. Staff can view or download documents, and search or filter them.
  - Ticking **Staff must read and acknowledge this** asks everyone in the document's audience to confirm they've read it. Until they do, it shows under "Needs your attention" on their home page.
  - Managers can see who has and hasn't acknowledged a document. Uploading a new version asks everyone to acknowledge it again.

- **Announcement extras.**
  - Everyone can react with emoji and, unless it's turned off for a post, comment.
  - Posts can ask staff to **acknowledge** them, and managers see how many have.
  - Posts can be **scheduled** to go live later and can **expire** automatically.
- **Calendar.** A month view of company events, UK (England & Wales) bank holidays from 2025 to 2027, company holidays, shared birthdays and work anniversaries. People with *Manage the calendar* can add events for everyone or for particular companies.
- **Polls & surveys.**
  - Questions can be single choice, multiple choice, a 1–5 rating or a written answer.
  - **Anonymous** polls never store who gave which answer.
  - You choose whether staff see the results after answering, and you can set a closing date.
- **Joiners & leavers.**
  - People with *Run onboarding* start a checklist for a new starter from a template. A default "New starter" template is included, and templates can be edited.
  - **Start leaving process** starts a leaver checklist with the person's last day, from the default "Leaver" template. Its final task, ticked by HR, **disables their login** (unticking it turns it back on). The owner's login can't be disabled.
  - Each task belongs to the employee, their supervisor or HR, and each person sees their own tasks on their home page.

### Themes

Everyone can pick a theme under **Settings → Appearance**. Settings is in the menu under their name. The choice is saved to their account, so it follows them to any device, and the sign-in page remembers the last theme used on that browser.

| Theme           | Style                                    |
|-----------------|------------------------------------------|
| Match my device | Switches between HN Light and HN Dark to follow the device's setting |
| HN Light        | The default, in HN Group purple          |
| HN Dark         | Dark, with a lighter purple accent       |
| Lavender        | Soft lavender                            |
| Lavender Dusk   | Dark lavender                            |
| Ocean           | Teal and blue                            |
| Forest          | Green                                    |
| Midnight        | Dark navy with a blue accent             |

The logo colour stripe always stays in the HN Group brand colours. Dark themes use a white version of the logo.

### Roles & permissions

What people can manage is set by **roles**, under **People → Roles & permissions**. Each role switches on any of these permissions:

- Manage staff
- Manage roles
- Post announcements
- Manage documents
- Manage the calendar
- Run polls & surveys
- Run onboarding
- Manage leave
- Manage rotas & timesheets
- Handle IT tickets
- Run payroll & finance (payroll, funds, expenses and invoices): only people who already have it can give it out.
- HR cases
- Recruitment
- Activity reports
- System Admin: open System Admin with the PIN. Only people who already have it can give it out.

You then choose who has each role. Someone with several roles gets every permission from all of them.

- The **system owner** (charlie.livsey@hngroup.org.uk) always has every permission.
- A **Super Admin** role with every permission except *Run payroll*, including System Admin, is created automatically.
- *HR cases*, *Recruitment* and *Activity reports* are given to the Super Admin, Leadership & HR and Human Resources roles the first time this version starts.
- A **Human Resources** role (staff, onboarding, leave, rotas and payroll) is created and given to everyone whose job title mentions Human Resources or HR. An empty **IT Support** role (helpdesk) is created too.
- The built-in admin account gets every permission except System Admin and *Run payroll*.
  - Super admins can use everything in System Admin except changing the PIN.
  - They can't log in as the system owner or end the owner's sessions.
- On the first start after upgrading, three roles are created: **Leadership & HR** (everything), **Communications** and **Documents**. Everyone who previously had access through their job title is given *Leadership & HR*.

## Install on the VPS

### 1. Point the domain at the VPS (one-off)

Wherever `hngroup.org.uk`'s DNS is managed, add this record:

| Type | Name / Host | Value             |
|------|-------------|-------------------|
| A    | `staff`     | `217.154.34.205`  |

If you use Cloudflare, set the record to **DNS only** (grey cloud) for the first install so the HTTPS certificate can be issued.

To check it has taken effect, run `getent hosts staff.hngroup.org.uk`. It should print `217.154.34.205`.

### 2. Get the code and run the installer

As root on the VPS:

```bash
if [ -d /root/HorizonNetwork/.git ]; then
  cd /root/HorizonNetwork && git fetch origin
else
  git clone https://github.com/Charlielivsey/HorizonNetwork.git /root/HorizonNetwork && cd /root/HorizonNetwork
fi
git checkout claude/confident-volta-gxjboo
git pull origin claude/confident-volta-gxjboo
sudo bash staff-portal/install.sh staff.hngroup.org.uk you@hngroup.org.uk
```

The email is only used by Let's Encrypt for certificate expiry notices.

The installer:
1. Installs nginx, certbot, Node.js and PM2 if they are missing.
2. Copies the app to `/opt/hn-staff-portal`.
3. Keeps staff data in `/var/lib/hn-staff-portal`, so updates never wipe it.
4. Runs the app under PM2 as `hn-staff-portal`, listening on `127.0.0.1:3200` only.
5. Adds an nginx site for the domain. The existing Horizon Network sites are left alone.
6. Opens ports 80 and 443 if `ufw` is active.
7. Gets a free HTTPS certificate that renews automatically.

## Updating

```bash
cd /root/HorizonNetwork && git pull && sudo bash staff-portal/install.sh
```

Re-running the installer is safe. Staff records, accounts, photos and the HTTPS certificate are all kept.

When you update from an earlier version, existing logins are carried over automatically. The old `admin` login is renamed to `admin@hngroup.org.uk` and keeps its password.

## Data & backups

Everything lives in `/var/lib/hn-staff-portal`:

| Path              | Contents                                                        |
|-------------------|-----------------------------------------------------------------|
| `people.json`     | Employees and login accounts. Passwords are stored as scrypt hashes. |
| `settings.json`   | Roles, the system owner and the system PIN (hashed).            |
| `announcements.json`, `documents.json`, `documents/` | Announcements, the document library and the uploaded files. |
| `sessions.json`   | Signed-in sessions (hashed tokens).                              |
| `events.json`, `polls.json`, `onboarding.json` | Calendar events, polls and their answers, and onboarding checklists. |
| `leave.json`, `rotas.json`, `helpdesk.json` | Leave requests and allowances, shifts and timesheets, and IT tickets. |
| `payslips.json`, `funds.json` | Pay details, payslips, and the company balances with their history. Only Human Resources can see these in the portal. |
| `backups/`        | Automatic and manual backups (`.tar.gz`).                       |
| `audit.log`       | Activity log of every action in the portal.                     |
| `security.json`   | Password rules, data retention settings and reported sign-ins.  |
| `chat.json`, `qa.json`, `wiki.json`, `mentoring.json`, `oncall.json` | Chat messages, Q&A, knowledge base pages (with history), mentoring and on-call rotas. |
| `expenses.json`, `invoices.json`, `bills.json` and the other `.json` files | One file for each of the newer features. All are included in backups. |
| `avatars/`        | Profile pictures.                                               |

**Automatic backups.**
- A backup is taken every night at 2am and saved to `backups/`. The latest 14 nightly backups are kept.
- In **System Admin → Backups** you can back up now, download or delete a backup, or restore one.
- Restoring needs the System Admin PIN. It takes a safety backup of the current data first and signs everyone out.
- The activity log is never rolled back.

For an off-server copy, download a backup from System Admin, or run:

```bash
sudo tar czf ~/staff-portal-backup-$(date +%F).tgz -C /var/lib hn-staff-portal
```

## Useful commands

```bash
pm2 logs hn-staff-portal          # logs, including sign-ins and staff changes
pm2 restart hn-staff-portal
sudo certbot renew --dry-run      # test certificate renewal
```

## Troubleshooting

- **The installer says DNS doesn't point at this server.** Wait for the A record to propagate, then re-run the installer.
- **The site shows the main Horizon Network page.** Check that `/etc/nginx/sites-enabled/hn-staff-portal` exists, then run `sudo nginx -t && sudo systemctl reload nginx`.
- **502 Bad Gateway.** The app isn't running. Check `pm2 status` and `pm2 logs hn-staff-portal`.
- **Forgot the admin password.** This resets the login to `admin@hngroup.org.uk` / `admin`, clears its sign-in code so a new one is set at the next sign-in, and leaves every other account and record alone:
  ```bash
  sudo DATA_DIR=/var/lib/hn-staff-portal node /opt/hn-staff-portal/reset-admin.js && pm2 restart hn-staff-portal
  ```
