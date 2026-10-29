'use strict';
// The companies documents can be branded as, and the starting templates. Every template is available for every
// company: the company decides the logo, names and footer; the template decides the layout and starting text.
// Logos are the approved original files from brand/logos (light and white versions).

const COMPANIES = [
  { id: 'hn-group', name: 'HN Group', legal: 'HN Group Limited', logo: 'hn-group-wordmark', website: 'hngroup.org.uk', note: '',
    about: 'HN Group brings together Horizon Network and Horizon Media Group.' },
  { id: 'horizon-network', name: 'Horizon Network', legal: 'Horizon Network Limited', logo: 'horizon-network-wordmark', website: 'horizon-network.co.uk', note: 'A subsidiary of HN Group Limited',
    about: 'Horizon Network is part of HN Group.' },
  { id: 'horizon-media-group', name: 'Horizon Media Group', legal: 'Horizon Media Group Limited', logo: 'horizon-media-group-logo', website: 'media.hngroup.org.uk', note: 'A subsidiary of HN Group Limited',
    about: 'Horizon Media Group is part of HN Group.' },
  { id: 'horizon-advertising', name: 'Horizon Advertising', legal: 'Horizon Advertising Limited', logo: 'horizon-advertising-logo', website: 'horizonadvertising.co.uk', note: 'A subsidiary of Horizon Media Group Limited, managed by Horizon Network',
    about: 'Horizon Advertising is part of HN Group.' },
  { id: 'horizon-development', name: 'Horizon Development', legal: 'Horizon Network Limited', logo: 'horizon-development-logo', website: 'development.hngroup.org.uk', note: 'Horizon Development is part of Horizon Network Limited',
    about: 'Horizon Development is part of Horizon Network, an HN Group company.' },
  { id: 'hn-group-management', name: 'HN Group Management', legal: 'HN Group Management Limited', logo: 'hn-group-management-logo', website: 'holding.hngroup.org.uk', note: 'A subsidiary of HN Group Limited',
    about: 'HN Group Management is part of HN Group.' },
];

// Head fields sit at the top of the page (`area`: left/right for a letter's address block, otherwise a table of
// details); foot fields come after the body. `value` is the starting text: "today" is today's date, "me" the author's
// full name (first and last name from their staff profile), "jobTitle" their job title, and {company}/{legal}/{about}/
// {jobTitle} are filled in from the company and the author. Letter-style templates share the letter layout.
const letterHead = (reference = 'Our reference') => [{ key: 'recipient', label: 'Recipient name and address', multiline: true, area: 'left' }, { key: 'date', label: 'Date', area: 'right', value: 'today' }, { key: 'reference', label: reference, area: 'right' }];
const signOff = (closing, withCompany = true) => [{ key: 'closing', label: 'Closing', value: closing }, { key: 'senderName', label: 'Your name', value: 'me', gap: true },
  { key: 'senderRole', label: 'Your job title', value: 'jobTitle' }, ...(withCompany ? [{ key: 'senderCompany', label: 'Company', value: '{legal}' }] : [])];
const TEMPLATES = [
  { id: 'letter', group: 'General', layout: 'letter', name: 'Letter', blurb: 'A formal letter on company letterhead, with the address, date, reference and sign-off.', label: '', title: 'subject', titleHint: 'Subject',
    head: letterHead(), foot: signOff('Yours sincerely,'),
    body: '<p>Dear [name],</p><p>[Write your letter here.]</p><p>[If you need anything else, let us know.]</p>' },
  { id: 'memo', group: 'General', name: 'Memo', blurb: 'A short internal note to a person or team.', label: 'Memo', title: 'heading', titleHint: 'Subject',
    head: [{ key: 'to', label: 'To' }, { key: 'from', label: 'From', value: 'me' }, { key: 'date', label: 'Date', value: 'today' }, { key: 'copy', label: 'Copy to' }],
    foot: [], body: '<p>[What this memo is about, in a sentence or two.]</p><h2>Details</h2><p>[The details.]</p><h2>What happens next</h2><ul><li>[Action, who and when]</li></ul>' },
  { id: 'report', group: 'General', name: 'Report', blurb: 'A structured report with a summary, findings and recommendations.', label: 'Report', title: 'heading', titleHint: 'Report title',
    head: [{ key: 'subtitle', label: 'Subtitle' }, { key: 'author', label: 'Prepared by', value: 'me' }, { key: 'date', label: 'Date', value: 'today' }, { key: 'version', label: 'Version', value: '1.0' }],
    foot: [], body: '<h2>Summary</h2><p>[The main points in a short paragraph.]</p><h2>Background</h2><p>[Why this report was written.]</p><h2>Findings</h2><p>[What was found.]</p><h2>Recommendations</h2><ol><li>[Recommendation]</li></ol>' },
  { id: 'policy', group: 'General', name: 'Policy', blurb: 'A company policy with its owner, dates and a version history that updates itself each time a changed policy is marked final.', label: 'Policy', title: 'heading', titleHint: 'Policy name',
    head: [{ key: 'owner', label: 'Policy owner', value: 'me' }, { key: 'effective', label: 'Effective from', value: 'today' }, { key: 'review', label: 'Next review' }, { key: 'version', label: 'Version', value: '1.0' }],
    versions: true,
    foot: [], body: '<h2>1. Purpose</h2><p>[What this policy is for.]</p><h2>2. Scope</h2><p>[Who and what it applies to at {legal}.]</p><h2>3. Policy</h2><p>[The rules.]</p><h2>4. Responsibilities</h2><p>[Who is responsible for what.]</p><h2>5. Review</h2><p>[When and how this policy is reviewed.]</p>' },
  { id: 'minutes', group: 'General', name: 'Meeting minutes', blurb: 'A record of a meeting: who attended, what was discussed and the actions.', label: 'Minutes', title: 'heading', titleHint: 'Meeting name',
    head: [{ key: 'date', label: 'Date', value: 'today' }, { key: 'location', label: 'Location' }, { key: 'chair', label: 'Chair' }, { key: 'attendees', label: 'Attendees', multiline: true }, { key: 'apologies', label: 'Apologies' }],
    foot: [], body: '<h2>1. Welcome</h2><p>[Notes]</p><h2>2. [Agenda item]</h2><p>[Notes and decisions]</p><h2>Actions</h2><table><thead><tr><th>Action</th><th>Owner</th><th>Due</th></tr></thead><tbody><tr><td>[Action]</td><td>[Name]</td><td>[Date]</td></tr></tbody></table>' },
  { id: 'press', group: 'General', name: 'Press release', blurb: 'An announcement for publication, with notes to editors.', label: 'Press release', title: 'heading', titleHint: 'Headline',
    head: [{ key: 'release', label: 'Release', value: 'For immediate release' }, { key: 'date', label: 'Date', value: 'today' }, { key: 'contact', label: 'Media contact', value: 'me' }],
    foot: [], body: '<p><strong>[Place], [date]</strong> – [The announcement in one or two sentences.]</p><p>[More detail.]</p><blockquote><p>“[A quote.]” – [Name, job title]</p></blockquote><h2>Notes to editors</h2><p><strong>About {company}</strong><br>{about}</p>' },
  { id: 'welcome', group: 'HR letters', layout: 'letter', name: 'Welcome letter', blurb: 'Welcome someone to the team before they start, from their manager or the company.', label: '', title: 'subject', titleHint: 'Subject', defaultTitle: 'Welcome to {company}',
    head: letterHead(), foot: signOff('Best wishes,'),
    body: '<p>Dear [name],</p><p>On behalf of everyone at {company}, welcome to the team. We’re delighted that you’re joining us as [job title], and we’re looking forward to working with you.</p><p>[A few words about the team they’re joining and what they’ll be working on.]</p><p>Your manager will be [manager’s name], and [buddy’s name] will be your buddy for your first few weeks: they’re there to answer any questions, however small.</p><p>We’ll send you everything you need to know about your first day separately. In the meantime, if there’s anything we can help with, please get in touch.</p><p>We look forward to seeing you on [start date].</p>' },
  { id: 'onboarding', group: 'HR letters', layout: 'letter', name: 'Onboarding letter', blurb: 'What a new starter needs to know about their first day and first weeks.', label: '', title: 'subject', titleHint: 'Subject', defaultTitle: 'Your first day at {company}',
    head: letterHead(), foot: signOff('Yours sincerely,'),
    body: '<p>Dear [name],</p><p>We’re looking forward to you joining {legal} as [job title] on [start date]. This letter explains what to expect on your first day and in your first few weeks.</p><h2>Your first day</h2><ul><li>Start time: [time]</li><li>Where: [address, or how to join online]</li><li>Ask for: [name]</li><li>What to bring: [for example, proof of your right to work in the UK and your bank details]</li></ul><h2>Before you start</h2><ul><li>Sign and return your contract of employment</li><li>Complete your new starter details in the staff portal</li><li>[Anything else they need to do]</li></ul><h2>Your first few weeks</h2><p>[Introductions, training, the equipment and accounts they’ll be given, and who to go to for help.]</p><p>If you have any questions before you start, please contact [name] at [email address or phone number].</p>' },
  { id: 'resignation', group: 'HR letters', layout: 'letter', name: 'Resignation letter', blurb: 'Formal notice of resignation from a member of staff to their manager.', label: '', title: 'subject', titleHint: 'Subject', defaultTitle: 'Resignation', confidential: true,
    head: letterHead('Reference'), foot: signOff('Yours sincerely,', false),
    body: '<p>Dear [manager’s name],</p><p>Please accept this letter as formal notice of my resignation from my role as {jobTitle} at {legal}.</p><p>In line with my notice period of [notice period], my last working day will be [date].</p><p>During my notice period I will do everything I can to make sure my work is handed over smoothly. [Mention anything specific you’ll hand over.]</p><p>Thank you for the support and opportunities I have had during my time with {company}.</p>' },
  { id: 'termination', group: 'HR letters', layout: 'letter', name: 'Termination letter', blurb: 'Confirms the end of someone’s employment: the reason, notice, final pay, company property and the right to appeal.', label: '', confidential: true, title: 'subject', titleHint: 'Subject', defaultTitle: 'Termination of your employment',
    head: letterHead(), foot: signOff('Yours sincerely,'),
    body: '<p>Dear [name],</p><p>I am writing to confirm that your employment with {legal} as [job title] will end.</p><p>[Explain the reason for the decision and the process followed, for example: Following our meeting on [date], where you were accompanied by [name], …]</p><h2>Notice and your last day</h2><p>Your notice period is [length], in line with your contract of employment, and your last day of employment will be [date]. [Say whether they will work their notice, be placed on garden leave or receive pay in lieu of notice.]</p><h2>Final pay</h2><p>Your final pay will include your salary up to your last day, [any holiday you have accrued but not taken] and [any other payments]. Your P45 will be sent to you after your final payment.</p><h2>Company property</h2><p>Please return all company property, including [laptop, keys, access cards and any documents], by [date].</p><h2>Your right to appeal</h2><p>You have the right to appeal against this decision. If you wish to appeal, please write to [name and job title] within [number] working days of receiving this letter, explaining why.</p><p>[If appropriate, thank them for their work.]</p>' },
  // The user's staff contract (29 October 2026), based on their Employee Agreement: HN Group Limited is always the
  // employer, whichever company the document is branded as; staff work at a group company and can be moved to another.
  { id: 'contract', group: 'HR documents', name: 'Contract of employment', blurb: 'The HN Group employee agreement: HN Group Limited employs, staff work at a group company and can be moved, 64 days’ leave, two weeks’ notice.', label: 'Contract of employment', confidential: true, title: 'heading', titleHint: 'Title', defaultTitle: 'Employee Agreement',
    head: [{ key: 'employee', label: 'Employee', value: '[Employee full name]' }, { key: 'role', label: 'Job title', value: '[Job title]' }, { key: 'deployedTo', label: 'Place of work', value: '{legal}' },
      { key: 'start', label: 'Start date', value: '[Start date]' }, { key: 'date', label: 'Date of agreement', value: 'today' }],
    foot: [],
    body: '<p>This Employment Agreement (“Agreement”) is made between <strong>HN Group Limited</strong> (“HN Group” or the “Employer”) and the employee named above (the “Employee”), on the date of agreement shown above.</p>' +
      '<h2>1. Employer and place of work</h2><p>1.1 The Employee’s employer is HN Group Limited, whichever HN Group company they work for.</p><p>1.2 The Employee will start work at the HN Group company shown above as their “Place of work”. If the Employee works at more than one HN Group company, their place of work is shown as HN Group: they are an HN Group employee and work across those companies as needed.</p><p>1.3 HN Group may move the Employee to work at another HN Group company, or into a different role, when the business needs it. The Employee will be told in writing before any move.</p><p>1.4 Moving to another HN Group company does not change who employs the Employee. Their employment continues without a break, and this Agreement still applies unless both parties agree changes in writing.</p>' +
      '<h2>2. Position and duties</h2><p>2.1 The Employee’s role is the job title shown above, with the responsibilities assigned by the Employer.</p><p>2.2 A specific job description can be requested from the Human Resources Team.</p><p>2.3 The Employee agrees to follow all HN Group policies and procedures, and those of the company they work at. Copies can be requested from the Human Resources Team.</p>' +
      '<h2>3. Commencement and term</h2><p>3.1 The Employee’s employment begins on the start date shown above.</p><p>3.2 This Agreement continues until it is ended in line with section 9 (Termination).</p>' +
      '<h2>4. Availability</h2><p>4.1 The Employee may be asked to adjust their availability as reasonably requested by the Employer.</p>' +
      '<h2>5. Holiday and leave</h2><p>5.1 The Employee is entitled to 64 days’ paid holiday in each holiday year, pro-rated for the part of the year in which they start or leave.</p><p>5.2 Holiday requests must be made in advance and approved by the Human Resources Team.</p><p>5.3 Unauthorised absence may result in disciplinary action.</p>' +
      '<h2>6. Sickness and absence</h2><p>6.1 If the Employee cannot work because of illness or injury, they must tell the Employer as soon as possible.</p>' +
      '<h2>7. Confidentiality</h2><p>7.1 The Employee acknowledges that during their employment they may have access to confidential information about HN Group and its companies.</p><p>7.2 The Employee agrees not to disclose or use any confidential information for personal gain or for the benefit of any third party, both during and after their employment.</p><p>7.3 Confidential information includes, but is not limited to, client information, pricing, internal processes, employee information, supplier information, systems and business plans.</p>' +
      '<h2>8. Intellectual property</h2><p>8.1 All work, inventions and intellectual property created by the Employee in connection with their employment belong solely to HN Group.</p><p>8.2 The Employee agrees to sign any documents reasonably required to confirm HN Group’s ownership of that intellectual property.</p>' +
      '<h2>9. Termination</h2><p>9.1 The Employee may resign by giving the Employer two weeks’ written notice.</p><p>9.2 The Employer may end this Agreement by giving the Employee two weeks’ written notice.</p><p>9.3 The Employer may end this Agreement immediately, without notice, in a case of gross misconduct. Gross misconduct includes, but is not limited to, dishonesty, theft or fraud, violence or threats, harassment, a serious breach of this Agreement or of confidentiality, and serious negligence.</p><p>9.4 When employment ends, the Employee must immediately return all property belonging to HN Group or the company they work at, including devices, keys, documents, login access and any confidential materials.</p>' +
      '<h2>10. Probation period</h2><p>10.1 The Employee will have a probation period of 15 days from the start date.</p><p>10.2 During probation the Employee’s performance and suitability will be reviewed, and employment may be ended after the first week.</p>' +
      '<h2>11. Conduct and disciplinary rules</h2><p>11.1 The Employee must behave professionally and respectfully at all times.</p><p>11.2 Harassment, bullying, discrimination, violence, threats or abusive behaviour will not be tolerated.</p><p>11.3 Gross misconduct may result in termination without notice, as set out in section 9.3.</p>' +
      '<h2>12. Use of company property and systems</h2><p>12.1 Any equipment, accounts or systems provided remain the property of HN Group or the company the Employee works at.</p><p>12.2 The Employee must not misuse company systems, share passwords or access data they are not authorised to see.</p><p>12.3 The Employer may monitor the use of its systems where the law allows.</p>' +
      '<h2>13. Data protection</h2><p>13.1 The Employee agrees to comply with all applicable data protection laws and HN Group’s data policies.</p><p>13.2 The Employee must handle personal data securely and only for authorised business purposes.</p>' +
      '<h2>14. Suspension of sections</h2><p>14.1 Any director of HN Group Limited, as listed on the Company Register at companies.hngroup.org.uk, may suspend sections of this Agreement at their discretion.</p><p>14.2 A suspended section does not apply to the Employee while it is suspended, and any such director may reinstate it at any time.</p><p>14.3 The Employee will be told of any suspension or reinstatement, and every suspension is recorded in the Suspended Sections Record below.</p>' +
      '<h2>15. Suspended Sections Record</h2><table><thead><tr><th>Section number</th><th>Section title</th><th>Date suspended</th><th>Notes</th></tr></thead><tbody><tr><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td></tr></tbody></table>' +
      '<h2>16. Governing law</h2><p>16.1 This Agreement is governed by and interpreted in accordance with the laws of the United Kingdom of Great Britain and Northern Ireland.</p>' +
      '<h2>Signatures</h2><table><thead><tr><th>On behalf of HN Group Limited</th><th>The Employee</th></tr></thead><tbody><tr><td>Name:</td><td>Name:</td></tr><tr><td>Signature:</td><td>Signature:</td></tr><tr><td>Date:</td><td>Date:</td></tr></tbody></table>' },
  { id: 'blank', group: 'General', name: 'Blank document', blurb: 'Company letterhead and an empty page.', label: '', title: 'heading', titleHint: 'Title', head: [], foot: [], body: '<p></p>' },
];

// The same contract with the branded company itself as the employer (the user's request, 29 October 2026: "make the
// contracts for the other companies, however they will probably not be used"). Made from the approved HN Group
// contract so the two never drift apart; a wording change there that a line below no longer matches stops startup.
const groupContract = TEMPLATES.find((t) => t.id === 'contract');
const COMPANY_EMPLOYER = [
  ['<strong>HN Group Limited</strong> (“HN Group” or the “Employer”)', '<strong>{legal}</strong> (the “Employer”), a member of HN Group,'],
  [groupContract.body.slice(groupContract.body.indexOf('<h2>1. Employer and place of work</h2>'), groupContract.body.indexOf('<h2>2. Position and duties</h2>')),
    '<h2>1. Employer and place of work</h2><p>1.1 The Employee’s employer is {legal}, part of HN Group.</p><p>1.2 The Employee will work at {legal}, shown above as their “Place of work”.</p><p>1.3 The Employer may ask the Employee to work with other HN Group companies when the business needs it. The Employee will be told in writing before this happens.</p><p>1.4 Working with another HN Group company does not change who employs the Employee, and this Agreement still applies unless both parties agree changes in writing.</p>'],
  ['and those of the company they work at.', 'and those of the Employer.'],
  ['belong solely to HN Group.', 'belong solely to the Employer.'],
  ['to confirm HN Group’s ownership', 'to confirm the Employer’s ownership'],
  ['all property belonging to HN Group or the company they work at,', 'all property belonging to the Employer or any other HN Group company,'],
  ['remain the property of HN Group or the company the Employee works at.', 'remain the property of the Employer or the HN Group company that provided them.'],
  ['HN Group’s data policies', 'the Employer’s and HN Group’s data policies'],
  ['Any director of HN Group Limited, as listed', 'Any director of {legal}, as listed'],
  ['On behalf of HN Group Limited', 'On behalf of {legal}'],
];
TEMPLATES.splice(TEMPLATES.indexOf(groupContract) + 1, 0, { ...groupContract, id: 'contract-company', name: 'Contract of employment (company as employer)',
  blurb: 'The same employee agreement, but the company you choose is the employer instead of HN Group Limited.',
  body: COMPANY_EMPLOYER.reduce((b, [from, to]) => { if (!from || !b.includes(from)) throw new Error('contract-company: the HN Group contract no longer contains “' + from.slice(0, 60) + '”'); return b.split(from).join(to); }, groupContract.body) });

const company = (id) => COMPANIES.find((c) => c.id === id) || null;
const template = (id) => TEMPLATES.find((t) => t.id === id) || null;

function longDate(d) { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }).format(d); }
const escText = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fill(text, c, user, html) {
  const sub = (v) => (html ? escText(v) : v);
  return String(text).replace(/\{company\}/g, sub(c.name)).replace(/\{legal\}/g, sub(c.legal)).replace(/\{about\}/g, sub(c.about))
    .replace(/\{jobTitle\}/g, sub((user && user.jobTitle) || '[your job title]'));
}
// The starting fields, body and title of a new document for `user` (their full name and job title fill the sign-off).
function start(t, c, user, now = new Date()) {
  const fields = {}, name = (user && (user.fullName || user.displayName)) || '';
  for (const f of [...t.head, ...t.foot]) fields[f.key] = f.value === 'today' ? longDate(now) : f.value === 'me' ? name : f.value === 'jobTitle' ? (user && user.jobTitle) || '' : fill(f.value || '', c, user, false);
  return { fields, body: fill(t.body, c, user, true), title: t.defaultTitle ? fill(t.defaultTitle, c, user, false) : '' };
}
// What the browser needs to draw the pages (no starting text: that's made on the server when a document is created).
const publicCatalog = () => ({
  companies: COMPANIES.map(({ id, name, legal, logo, website, note }) => ({ id, name, legal, logo, website, note })),
  templates: TEMPLATES.map(({ id, group, layout, name, blurb, label, title, titleHint, head, foot, versions, confidential }) => ({ id, group, layout: layout || '', name, blurb, label, title, titleHint, head, foot, versions: !!versions, confidential: !!confidential })),
});

module.exports = { COMPANIES, TEMPLATES, company, template, start, publicCatalog, longDate };
