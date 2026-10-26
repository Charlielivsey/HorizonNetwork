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
  { id: 'resignation', group: 'HR letters', layout: 'letter', name: 'Resignation letter', blurb: 'Formal notice of resignation from a member of staff to their manager.', label: '', title: 'subject', titleHint: 'Subject', defaultTitle: 'Resignation',
    head: letterHead('Reference'), foot: signOff('Yours sincerely,', false),
    body: '<p>Dear [manager’s name],</p><p>Please accept this letter as formal notice of my resignation from my role as {jobTitle} at {legal}.</p><p>In line with my notice period of [notice period], my last working day will be [date].</p><p>During my notice period I will do everything I can to make sure my work is handed over smoothly. [Mention anything specific you’ll hand over.]</p><p>Thank you for the support and opportunities I have had during my time with {company}.</p>' },
  { id: 'termination', group: 'HR letters', layout: 'letter', name: 'Termination letter', blurb: 'Confirms the end of someone’s employment: the reason, notice, final pay, company property and the right to appeal.', label: 'Private & confidential', title: 'subject', titleHint: 'Subject', defaultTitle: 'Termination of your employment',
    head: letterHead(), foot: signOff('Yours sincerely,'),
    body: '<p>Dear [name],</p><p>I am writing to confirm that your employment with {legal} as [job title] will end.</p><p>[Explain the reason for the decision and the process followed, for example: Following our meeting on [date], where you were accompanied by [name], …]</p><h2>Notice and your last day</h2><p>Your notice period is [length], in line with your contract of employment, and your last day of employment will be [date]. [Say whether they will work their notice, be placed on garden leave or receive pay in lieu of notice.]</p><h2>Final pay</h2><p>Your final pay will include your salary up to your last day, [any holiday you have accrued but not taken] and [any other payments]. Your P45 will be sent to you after your final payment.</p><h2>Company property</h2><p>Please return all company property, including [laptop, keys, access cards and any documents], by [date].</p><h2>Your right to appeal</h2><p>You have the right to appeal against this decision. If you wish to appeal, please write to [name and job title] within [number] working days of receiving this letter, explaining why.</p><p>[If appropriate, thank them for their work.]</p>' },
  { id: 'blank', group: 'General', name: 'Blank document', blurb: 'Company letterhead and an empty page.', label: '', title: 'heading', titleHint: 'Title', head: [], foot: [], body: '<p></p>' },
];

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
  templates: TEMPLATES.map(({ id, group, layout, name, blurb, label, title, titleHint, head, foot, versions }) => ({ id, group, layout: layout || '', name, blurb, label, title, titleHint, head, foot, versions: !!versions })),
});

module.exports = { COMPANIES, TEMPLATES, company, template, start, publicCatalog, longDate };
