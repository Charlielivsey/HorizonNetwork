'use strict';
// Storage for the HN Group company register. Everything lives in one JSON file in the data
// directory (written atomically, owner-only), plus uploaded PDFs in data/files/.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const pdf = require('./pdf');

let dir, file, filesDir, db;

const STATUSES = ['Active', 'Dormant', 'Liquidation', 'In administration', 'Dissolved'];
const FILING_CATEGORIES = ['Accounts', 'Confirmation statement', 'Officers', 'Persons with significant control', 'Address', 'Incorporation', 'Capital', 'Change of name', 'Mortgage and charges', 'Resolution', 'Other'];
const OFFICER_ROLES = ['Director', 'Secretary', 'Managing director', 'Chair'];
const PSC_KINDS = ['Individual', 'Parent company', 'Relevant legal entity'];

// Only facts the group has confirmed. Everything else (numbers, dates, addresses, officers) is
// left blank for staff to fill in: the register must not invent details.
const SEED = [
  { slug: 'hn-group', name: 'HN Group', legalName: 'HN Group Limited', website: 'hngroup.org.uk', emailDomain: 'hngroup.org.uk',
    description: 'The parent company of the group. HN Group brings together Horizon Network and Horizon Media Group.' },
  { slug: 'horizon-network', name: 'Horizon Network', legalName: 'Horizon Network Limited', website: 'horizon-network.co.uk', emailDomain: 'horizon-network.co.uk', parent: 'hn-group',
    description: 'A wholly owned subsidiary of HN Group Limited. Horizon Development is part of Horizon Network Limited.',
    divisions: ['Horizon Development'],
    psc: [{ name: 'HN Group Limited', kind: 'Parent company', share: '100', control: ['Ownership of shares – 75% or more'] }] },
];

const id = () => crypto.randomBytes(12).toString('hex');
const now = () => new Date().toISOString();

function blankCompany(o) {
  return {
    slug: o.slug, name: o.name, legalName: o.legalName || o.name, number: '', status: '', type: '', incorporated: '', dissolved: '',
    registeredOffice: '', sic: [], description: o.description || '', website: o.website || '', emailDomain: o.emailDomain || '',
    parent: o.parent || '', managedBy: o.managedBy || '', divisions: o.divisions || [], previousNames: [],
    accountsMadeUpTo: '', accountsNextDue: '', confirmationMadeUpTo: '', confirmationNextDue: '',
    officers: [], psc: (o.psc || []).map((p) => ({ id: id(), name: p.name, kind: p.kind, share: p.share || '', control: p.control, notified: '', ceased: '' })), charges: [],
    hidden: false, createdAt: now(), updatedAt: now(),
  };
}

function init(dataDir) {
  dir = dataDir; file = path.join(dir, 'register.json'); filesDir = path.join(dir, 'files');
  fs.mkdirSync(filesDir, { recursive: true, mode: 0o700 });
  if (fs.existsSync(file)) db = JSON.parse(fs.readFileSync(file, 'utf8'));
  else db = { version: 1, companies: [], filings: [], customers: [], requests: [], submissions: [], audit: [], seeded: [] };
  for (const key of ['companies', 'filings', 'customers', 'requests', 'submissions', 'audit', 'seeded']) db[key] = db[key] || [];
  // Seed companies are added once; after that staff edits and deletions are kept.
  // Entries saved before share percentages existed have no share field. The original seed entry
  // for HN Group Limited (Horizon Network's wholly owning parent) becomes a 100% parent company.
  for (const c of db.companies) for (const p of c.psc) if (p.share === undefined) {
    if (c.slug === 'horizon-network' && p.name === 'HN Group Limited' && p.kind === 'Relevant legal entity') { p.kind = 'Parent company'; p.share = '100'; } else p.share = '';
  }
  for (const c of db.companies) generateFilings(c);
  for (const s of SEED) if (!db.seeded.includes(s.slug)) { if (!db.companies.some((c) => c.slug === s.slug)) db.companies.push(blankCompany(s)); db.seeded.push(s.slug); }
  save();
}

function save() {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function audit(actor, action, detail) {
  db.audit.push({ at: now(), actor, action, detail: detail || '' });
  if (db.audit.length > 5000) db.audit.splice(0, db.audit.length - 5000);
}

// ---------- Companies ----------
const companies = (all) => db.companies.filter((c) => all || !c.hidden).sort((a, b) => a.legalName.localeCompare(b.legalName));
const company = (slug) => db.companies.find((c) => c.slug === slug) || null;
const children = (slug) => companies().filter((c) => c.parent === slug);

function search(q) {
  const terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return { companies: [], officers: [] };
  const match = (text) => terms.every((t) => text.toLowerCase().includes(t));
  const found = companies().filter((c) => match([c.name, c.legalName, c.number, ...c.previousNames.map((p) => p.name), ...c.divisions].join(' ')));
  const officers = [];
  for (const c of companies()) for (const o of c.officers) if (match(o.name)) officers.push({ ...o, company: c });
  return { companies: found, officers };
}

function slugify(s) { return String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }

// A new company must be added with its first officer and first person with significant control
// (opts.officer and opts.psc). Both are checked before anything is saved; their appointment and
// notification dates default to the incorporation date.
function saveCompany(slug, input, actor, opts) {
  const existing = slug ? company(slug) : null;
  const legalName = String(input.legalName || '').trim().slice(0, 160);
  if (!legalName) throw Object.assign(new Error('Enter the company name.'), { status: 400 });
  let firstOfficer = null, firstPsc = null;
  if (!existing) {
    if (!opts || !opts.officer || !opts.psc) throw Object.assign(new Error('Add the company’s first officer and person with significant control.'), { status: 400 });
    const incorporated = d(input.incorporated);
    firstOfficer = LISTS.officers({ ...opts.officer, appointed: opts.officer.appointed || incorporated });
    firstPsc = LISTS.psc({ ...opts.psc, notified: opts.psc.notified || incorporated });
  }
  const c = existing || blankCompany({ slug: '', name: legalName, legalName });
  if (!existing) {
    let base = slugify(input.name || legalName) || 'company', s = base, n = 2;
    while (company(s)) s = base + '-' + n++;
    c.slug = s;
  }
  const text = (k, max) => { c[k] = String(input[k] == null ? '' : input[k]).trim().slice(0, max); };
  c.legalName = legalName;
  text('name', 120); if (!c.name) c.name = legalName;
  text('number', 20); text('type', 80); text('incorporated', 10); text('dissolved', 10); text('registeredOffice', 300);
  text('description', 1000); text('website', 120); text('emailDomain', 80);
  text('accountsMadeUpTo', 10); text('accountsNextDue', 10); text('confirmationMadeUpTo', 10); text('confirmationNextDue', 10);
  c.status = STATUSES.includes(input.status) ? input.status : '';
  c.parent = input.parent && company(input.parent) && input.parent !== c.slug ? input.parent : '';
  c.managedBy = input.managedBy && company(input.managedBy) && input.managedBy !== c.slug ? input.managedBy : '';
  c.sic = String(input.sic || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 4).map((x) => x.slice(0, 160));
  c.divisions = String(input.divisions || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 10).map((x) => x.slice(0, 100));
  c.hidden = input.hidden === 'on' || input.hidden === true;
  c.updatedAt = now();
  if (!existing) { c.officers.push({ id: id(), ...firstOfficer }); c.psc.push({ id: id(), ...firstPsc }); db.companies.push(c); }
  generateFilings(c);
  audit(actor, existing ? 'company.update' : 'company.create', c.slug);
  save();
  return c;
}

function deleteCompany(slug, actor) {
  const c = company(slug);
  if (!c) return;
  for (const f of db.filings.filter((x) => x.company === slug)) removeFile(f.file);
  db.filings = db.filings.filter((x) => x.company !== slug);
  db.companies = db.companies.filter((x) => x.slug !== slug);
  for (const o of db.companies) { if (o.parent === slug) o.parent = ''; if (o.managedBy === slug) o.managedBy = ''; }
  audit(actor, 'company.delete', slug);
  save();
}

// Officers, PSCs and charges are lists on the company record.
const LISTS = {
  officers: (i) => ({ name: req(i.name, 'Enter the officer’s name.', 120), role: OFFICER_ROLES.includes(i.role) ? i.role : 'Director', appointed: d(i.appointed), resigned: d(i.resigned), occupation: t(i.occupation, 80), nationality: t(i.nationality, 60), countryOfResidence: t(i.countryOfResidence, 60) }),
  psc: (i) => ({ name: req(i.name, 'Enter the name.', 160), kind: PSC_KINDS.includes(i.kind) ? i.kind : 'Individual', share: percent(i.share), control: String(i.control || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6).map((x) => x.slice(0, 160)), notified: d(i.notified), ceased: d(i.ceased) }),
  charges: (i) => ({ code: t(i.code, 40), created: d(i.created), delivered: d(i.delivered), status: ['Outstanding', 'Satisfied', 'Part satisfied'].includes(i.status) ? i.status : 'Outstanding', entitled: req(i.entitled, 'Enter who is entitled to the charge.', 200), description: t(i.description, 600), satisfied: d(i.satisfied) }),
};
// A shareholding between 0 and 100, to at most two decimal places, or blank when not given.
function percent(v) {
  const s = String(v == null ? '' : v).trim().replace(/%$/, '');
  if (!s) return '';
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw Object.assign(new Error('Enter a share percentage between 0 and 100.'), { status: 400 });
  return String(Math.round(n * 100) / 100);
}
function t(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
function d(v) { const s = t(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
function req(v, message, max) { const s = t(v, max); if (!s) throw Object.assign(new Error(message), { status: 400 }); return s; }

function saveItem(slug, list, itemId, input, actor) {
  const c = company(slug);
  if (!c || !LISTS[list]) throw Object.assign(new Error('Not found.'), { status: 404 });
  const value = LISTS[list](input);
  const existing = itemId && c[list].find((x) => x.id === itemId);
  if (existing) Object.assign(existing, value); else c[list].push({ id: id(), ...value });
  c.updatedAt = now();
  generateFilings(c);
  audit(actor, list + (existing ? '.update' : '.add'), slug);
  save();
}
function deleteItem(slug, list, itemId, actor) {
  const c = company(slug);
  if (!c || !LISTS[list]) return;
  c[list] = c[list].filter((x) => x.id !== itemId);
  audit(actor, list + '.delete', slug);
  save();
}

// ---------- Generated filings ----------
// When a company's incorporation date is first recorded, an officer is recorded with an appointment
// date, or a person with significant control with a notified date, the register files the matching
// document itself (incorporation, appointment or PSC notification), each with a generated PDF. Each is created once; the link is kept on the
// record so later edits don't duplicate it. Deleting a generated filing doesn't recreate it.
const FOOTER = 'Generated automatically by the Company Register run by Horizon Holding Co Limited from the details recorded at the time. This is a group register document, not a filing with the UK government\'s Companies House.';
function generateFilings(c) {
  if (c.incorporated && !c.incorporationFiling) {
    const doc = pdf.build({ heading: 'Incorporation of a company', subheading: c.legalName, footer: FOOTER, rows: [
      ['Company name', c.legalName], ['Company number', c.number], ['Company type', c.type], ['Incorporated on', longDate(c.incorporated)],
      ['Registered office', c.registeredOffice.replace(/\n/g, ', ')], ['Nature of business', c.sic.join('; ')], ['Parent company', c.parent ? (company(c.parent) || {}).legalName : 'None recorded']] });
    c.incorporationFiling = pushGenerated(c, c.incorporated, 'Incorporation', 'Incorporation of ' + c.legalName, doc);
  }
  for (const o of c.officers) if (o.appointed && !o.appointmentFiling) {
    const role = o.role.toLowerCase();
    const doc = pdf.build({ heading: 'Appointment of ' + (/^[aeiou]/.test(role) ? 'an ' : 'a ') + role, subheading: c.legalName + (c.number ? ' (company number ' + c.number + ')' : ''), footer: FOOTER, rows: [
      ['Name', o.name], ['Role', o.role], ['Appointed on', longDate(o.appointed)], ['Occupation', o.occupation], ['Nationality', o.nationality], ['Country of residence', o.countryOfResidence], ['Company', c.legalName]] });
    o.appointmentFiling = pushGenerated(c, o.appointed, 'Officers', 'Appointment of ' + o.name + ' as ' + (/^[aeiou]/.test(role) ? 'an ' : 'a ') + role + ' on ' + longDate(o.appointed), doc);
  }
  for (const p of c.psc || []) if (p.notified && !p.notificationFiling) {
    const doc = pdf.build({ heading: 'Notification of a person with significant control', subheading: c.legalName + (c.number ? ' (company number ' + c.number + ')' : ''), footer: FOOTER, rows: [
      ['Name', p.name], ['Type', p.kind], ['Shareholding', p.share ? p.share + '%' : ''], ['Nature of control', (p.control || []).join('; ')], ['Notified on', longDate(p.notified)], ['Company', c.legalName]] });
    p.notificationFiling = pushGenerated(c, p.notified, 'Persons with significant control', 'Notification of ' + p.name + ' as a person with significant control on ' + longDate(p.notified), doc);
  }
}
function pushGenerated(c, date, category, description, buffer) {
  const f = { id: id(), company: c.slug, date, category, description, file: storeFile(buffer), pages: 1, createdAt: now(), source: 'generated' };
  db.filings.push(f);
  audit('system', 'filing.generated', c.slug + ' ' + description);
  return f.id;
}
function longDate(iso) {
  const d = new Date(String(iso) + 'T12:00:00Z');
  return isNaN(d) ? String(iso || '') : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ---------- Filings ----------
const filings = (slug) => db.filings.filter((f) => f.company === slug).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
const filing = (fid) => db.filings.find((f) => f.id === fid) || null;

function storeFile(buffer) {
  const name = id() + '.pdf';
  fs.writeFileSync(path.join(filesDir, name), buffer, { mode: 0o600 });
  return name;
}
function removeFile(name) { if (name && /^[a-f0-9]{24}\.pdf$/.test(name)) fs.rmSync(path.join(filesDir, name), { force: true }); }
const filePath = (name) => (/^[a-f0-9]{24}\.pdf$/.test(name || '') ? path.join(filesDir, name) : null);

function addFiling(slug, input, pdf, actor) {
  if (!company(slug)) throw Object.assign(new Error('Company not found.'), { status: 404 });
  const f = { id: id(), company: slug, date: d(input.date) || now().slice(0, 10), category: FILING_CATEGORIES.includes(input.category) ? input.category : 'Other',
    description: req(input.description, 'Describe the filing.', 300), file: pdf ? storeFile(pdf) : '', pages: pdf ? countPages(pdf) : 0, createdAt: now(), source: input.source || 'staff' };
  db.filings.push(f);
  audit(actor, 'filing.add', slug + ' ' + f.description);
  save();
  return f;
}
function deleteFiling(fid, actor) {
  const f = filing(fid);
  if (!f) return;
  removeFile(f.file);
  db.filings = db.filings.filter((x) => x.id !== fid);
  audit(actor, 'filing.delete', f.company + ' ' + f.description);
  save();
}
function countPages(buf) { const m = buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g); return m ? m.length : 0; }

// ---------- Customers ----------
function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) { return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') }; }
const customerByEmail = (email) => db.customers.find((c) => c.email === String(email || '').trim().toLowerCase()) || null;
const customer = (cid) => db.customers.find((c) => c.id === cid) || null;

function createCustomer(input) {
  const email = String(input.email || '').trim().toLowerCase();
  const name = t(input.name, 80);
  const errors = [];
  if (!name) errors.push('Enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) errors.push('Enter a valid email address.');
  const pw = String(input.password || '');
  if (pw.length < 10) errors.push('Choose a password of at least 10 characters.');
  if (pw.length > 200) errors.push('That password is too long.');
  if (pw !== String(input.confirm || '')) errors.push('The passwords don’t match.');
  if (!errors.length && customerByEmail(email)) errors.push('An account already uses that email address. Sign in instead.');
  if (errors.length) throw Object.assign(new Error(errors.join(' ')), { status: 400 });
  if (db.customers.length >= 100000) throw Object.assign(new Error('Registration is unavailable right now.'), { status: 503 });
  const c = { id: id(), email, name, ...hashPassword(pw), createdAt: now(), lastLoginAt: null, disabled: false };
  db.customers.push(c);
  audit('customer:' + email, 'customer.register');
  save();
  return c;
}
function checkPassword(c, pw) {
  const { hash } = hashPassword(String(pw || ''), c.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(c.hash, 'hex'));
}
function changePassword(c, current, next) {
  if (!checkPassword(c, current)) throw Object.assign(new Error('Your current password is wrong.'), { status: 400 });
  if (String(next || '').length < 10 || String(next).length > 200) throw Object.assign(new Error('Choose a new password of at least 10 characters.'), { status: 400 });
  Object.assign(c, hashPassword(String(next)));
  audit('customer:' + c.email, 'customer.password');
  save();
}
function touchLogin(c) { c.lastLoginAt = now(); save(); }
function setCustomerDisabled(cid, disabled, actor) {
  const c = customer(cid); if (!c) return;
  c.disabled = !!disabled; audit(actor, disabled ? 'customer.disable' : 'customer.enable', c.email); save();
}

// ---------- Requests (documents, certificates, mistakes) and submissions ----------
const REQUEST_KINDS = { copy: 'Copy of a filing', certificate: 'Certificate', mistake: 'Report a mistake', other: 'Other question' };

function addRequest(cust, slug, input) {
  if (!company(slug)) throw Object.assign(new Error('Company not found.'), { status: 404 });
  const kind = Object.hasOwn(REQUEST_KINDS, input.kind) ? input.kind : 'other';
  const open = db.requests.filter((r) => r.customer === cust.id && r.status === 'Open').length;
  if (open >= 20) throw Object.assign(new Error('You have 20 open requests. Please wait for replies before sending more.'), { status: 429 });
  const r = { id: id(), ref: 'R' + crypto.randomBytes(4).toString('hex').toUpperCase(), customer: cust.id, company: slug, kind, filing: input.filing && filing(input.filing)?.company === slug ? input.filing : '',
    status: 'Open', createdAt: now(), updatedAt: now(), messages: [{ from: 'customer', name: cust.name, text: req(input.message, 'Tell us what you need.', 3000), at: now() }] };
  db.requests.push(r);
  audit('customer:' + cust.email, 'request.add', r.ref);
  save();
  return r;
}
const request = (rid) => db.requests.find((r) => r.id === rid) || null;
function replyRequest(r, from, name, text, status) {
  if (r.messages.length >= 200) throw Object.assign(new Error('This conversation is full.'), { status: 400 });
  r.messages.push({ from, name, text: req(text, 'Write a reply.', 3000), at: now() });
  if (['Open', 'Answered', 'Closed'].includes(status)) r.status = status;
  else r.status = from === 'staff' ? 'Answered' : 'Open';
  r.updatedAt = now();
  save();
}

function addSubmission(cust, slug, input, pdf) {
  if (!company(slug)) throw Object.assign(new Error('Company not found.'), { status: 404 });
  if (!pdf) throw Object.assign(new Error('Attach the filing as a PDF.'), { status: 400 });
  const pending = db.submissions.filter((s) => s.customer === cust.id && s.status === 'Pending').length;
  if (pending >= 10) throw Object.assign(new Error('You have 10 filings waiting for review. Please wait before submitting more.'), { status: 429 });
  const s = { id: id(), ref: 'S' + crypto.randomBytes(4).toString('hex').toUpperCase(), customer: cust.id, company: slug,
    category: FILING_CATEGORIES.includes(input.category) ? input.category : 'Other', description: req(input.description, 'Describe the filing.', 300),
    note: t(input.note, 2000), file: storeFile(pdf), pages: countPages(pdf), status: 'Pending', staffNote: '', createdAt: now(), decidedAt: null, filing: '' };
  db.submissions.push(s);
  audit('customer:' + cust.email, 'submission.add', s.ref);
  save();
  return s;
}
const submission = (sid) => db.submissions.find((s) => s.id === sid) || null;
function decideSubmission(s, accept, note, actor) {
  if (s.status !== 'Pending') throw Object.assign(new Error('This filing has already been reviewed.'), { status: 409 });
  s.status = accept ? 'Accepted' : 'Rejected';
  s.staffNote = t(note, 1000);
  s.decidedAt = now();
  if (accept) {
    // The accepted document becomes a public filing; the customer's copy is moved, not duplicated.
    const f = { id: id(), company: s.company, date: now().slice(0, 10), category: s.category, description: s.description, file: s.file, pages: s.pages, createdAt: now(), source: 'customer' };
    db.filings.push(f);
    s.filing = f.id;
  } else {
    removeFile(s.file); s.file = '';
  }
  audit(actor, 'submission.' + (accept ? 'accept' : 'reject'), s.ref);
  save();
}

module.exports = {
  init, STATUSES, FILING_CATEGORIES, OFFICER_ROLES, PSC_KINDS, REQUEST_KINDS,
  companies, company, children, search, saveCompany, deleteCompany, saveItem, deleteItem,
  filings, filing, addFiling, deleteFiling, filePath,
  customer, customerByEmail, createCustomer, checkPassword, changePassword, touchLogin, setCustomerDisabled,
  addRequest, request, replyRequest, addSubmission, submission, decideSubmission,
  get db() { return db; }, audit, save,
};
