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
// details); foot fields come after the body. `value` is the starting text: "today" is today's date, "me" the
// author's name, and {company}/{legal}/{about} are filled in from the company.
const TEMPLATES = [
  { id: 'letter', name: 'Letter', blurb: 'A formal letter on company letterhead, with the address, date, reference and sign-off.', label: '', title: 'subject', titleHint: 'Subject',
    head: [{ key: 'recipient', label: 'Recipient name and address', multiline: true, area: 'left' }, { key: 'date', label: 'Date', area: 'right', value: 'today' }, { key: 'reference', label: 'Our reference', area: 'right' }],
    foot: [{ key: 'closing', label: 'Closing', value: 'Yours sincerely,' }, { key: 'senderName', label: 'Your name', value: 'me', gap: true }, { key: 'senderRole', label: 'Your job title' }, { key: 'senderCompany', label: 'Company', value: '{legal}' }],
    body: '<p>Dear [name],</p><p>[Write your letter here.]</p><p>[If you need anything else, let us know.]</p>' },
  { id: 'memo', name: 'Memo', blurb: 'A short internal note to a person or team.', label: 'Memo', title: 'heading', titleHint: 'Subject',
    head: [{ key: 'to', label: 'To' }, { key: 'from', label: 'From', value: 'me' }, { key: 'date', label: 'Date', value: 'today' }, { key: 'copy', label: 'Copy to' }],
    foot: [], body: '<p>[What this memo is about, in a sentence or two.]</p><h2>Details</h2><p>[The details.]</p><h2>What happens next</h2><ul><li>[Action, who and when]</li></ul>' },
  { id: 'report', name: 'Report', blurb: 'A structured report with a summary, findings and recommendations.', label: 'Report', title: 'heading', titleHint: 'Report title',
    head: [{ key: 'subtitle', label: 'Subtitle' }, { key: 'author', label: 'Prepared by', value: 'me' }, { key: 'date', label: 'Date', value: 'today' }, { key: 'version', label: 'Version', value: '1.0' }],
    foot: [], body: '<h2>Summary</h2><p>[The main points in a short paragraph.]</p><h2>Background</h2><p>[Why this report was written.]</p><h2>Findings</h2><p>[What was found.]</p><h2>Recommendations</h2><ol><li>[Recommendation]</li></ol>' },
  { id: 'policy', name: 'Policy', blurb: 'A company policy with its owner, effective and review dates.', label: 'Policy', title: 'heading', titleHint: 'Policy name',
    head: [{ key: 'owner', label: 'Policy owner', value: 'me' }, { key: 'effective', label: 'Effective from', value: 'today' }, { key: 'review', label: 'Next review' }, { key: 'version', label: 'Version', value: '1.0' }],
    foot: [], body: '<h2>1. Purpose</h2><p>[What this policy is for.]</p><h2>2. Scope</h2><p>[Who and what it applies to at {legal}.]</p><h2>3. Policy</h2><p>[The rules.]</p><h2>4. Responsibilities</h2><p>[Who is responsible for what.]</p><h2>5. Review</h2><p>[When and how this policy is reviewed.]</p>' },
  { id: 'minutes', name: 'Meeting minutes', blurb: 'A record of a meeting: who attended, what was discussed and the actions.', label: 'Minutes', title: 'heading', titleHint: 'Meeting name',
    head: [{ key: 'date', label: 'Date', value: 'today' }, { key: 'location', label: 'Location' }, { key: 'chair', label: 'Chair' }, { key: 'attendees', label: 'Attendees', multiline: true }, { key: 'apologies', label: 'Apologies' }],
    foot: [], body: '<h2>1. Welcome</h2><p>[Notes]</p><h2>2. [Agenda item]</h2><p>[Notes and decisions]</p><h2>Actions</h2><table><thead><tr><th>Action</th><th>Owner</th><th>Due</th></tr></thead><tbody><tr><td>[Action]</td><td>[Name]</td><td>[Date]</td></tr></tbody></table>' },
  { id: 'press', name: 'Press release', blurb: 'An announcement for publication, with notes to editors.', label: 'Press release', title: 'heading', titleHint: 'Headline',
    head: [{ key: 'release', label: 'Release', value: 'For immediate release' }, { key: 'date', label: 'Date', value: 'today' }, { key: 'contact', label: 'Media contact', value: 'me' }],
    foot: [], body: '<p><strong>[Place], [date]</strong> – [The announcement in one or two sentences.]</p><p>[More detail.]</p><blockquote><p>“[A quote.]” – [Name, job title]</p></blockquote><h2>Notes to editors</h2><p><strong>About {company}</strong><br>{about}</p>' },
  { id: 'blank', name: 'Blank document', blurb: 'Company letterhead and an empty page.', label: '', title: 'heading', titleHint: 'Title', head: [], foot: [], body: '<p></p>' },
];

const company = (id) => COMPANIES.find((c) => c.id === id) || null;
const template = (id) => TEMPLATES.find((t) => t.id === id) || null;

function longDate(d) { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }).format(d); }
const escText = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fill(text, c, author, html) {
  const sub = (v) => (html ? escText(v) : v);
  return String(text).replace(/\{company\}/g, sub(c.name)).replace(/\{legal\}/g, sub(c.legal)).replace(/\{about\}/g, sub(c.about));
}
// The starting fields and body of a new document.
function start(t, c, author, now = new Date()) {
  const fields = {};
  for (const f of [...t.head, ...t.foot]) fields[f.key] = f.value === 'today' ? longDate(now) : f.value === 'me' ? author : fill(f.value || '', c, author, false);
  return { fields, body: fill(t.body, c, author, true) };
}
// What the browser needs to draw the pages (no starting text: that's made on the server when a document is created).
const publicCatalog = () => ({
  companies: COMPANIES.map(({ id, name, legal, logo, website, note }) => ({ id, name, legal, logo, website, note })),
  templates: TEMPLATES.map(({ id, name, blurb, label, title, titleHint, head, foot }) => ({ id, name, blurb, label, title, titleHint, head, foot })),
});

module.exports = { COMPANIES, TEMPLATES, company, template, start, publicCatalog, longDate };
