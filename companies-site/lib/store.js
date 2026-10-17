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
    managers: [], hidden: false, createdAt: now(), updatedAt: now(),
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
  runMigrations();
  for (const c of db.companies) { if (!Array.isArray(c.managers)) c.managers = []; generateFilings(c); }
  for (const s of SEED) if (!db.seeded.includes(s.slug)) { if (!db.companies.some((c) => c.slug === s.slug)) db.companies.push(blankCompany(s)); db.seeded.push(s.slug); }
  save();
}

// One-off corrections to saved data, each applied once.
function runMigrations() {
  if (!Array.isArray(db.migrations)) db.migrations = [];
  const once = (name, fn) => { if (db.migrations.includes(name)) return; fn(); db.migrations.push(name); };
  // The user's request (17 October 2026): the officer is recorded as Charlie Livsey on every company. Nothing else changes.
  once('officer-charlie-livsey', () => {
    for (const c of db.companies) for (const o of c.officers) if (/^charlie\s+dean\s+livsey$/i.test(String(o.name).trim())) { o.name = 'Charlie Livsey'; audit('system', 'officer.rename', c.slug + ' Charlie Dean Livsey → Charlie Livsey'); }
  });
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
  const oldName = existing ? c.legalName : '';
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
  if (existing && oldName && oldName !== legalName) recordNameChange(c, oldName);
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
// A change to the registered name keeps the old name and files a change of name automatically.
function recordNameChange(c, oldName) {
  const date = now().slice(0, 10);
  c.previousNames.push({ name: oldName, until: date });
  const doc = pdf.build({ heading: 'Change of company name', subheading: c.legalName + (c.number ? ' (company number ' + c.number + ')' : ''), footer: FOOTER,
    rows: [['Previous name', oldName], ['New name', c.legalName], ['Changed on', longDate(date)]] });
  pushGenerated(c, date, 'Change of name', 'Change of name from ' + oldName + ' to ' + c.legalName, doc);
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

// Changes customers can file for a company. Each is checked when it's filed and again when staff
// accept it; accepting applies the change to the record and adds the matching filing.
const CHANGE_TYPES = {
  address: { label: 'Change of registered office address', category: 'Address' },
  appoint: { label: 'Appoint an officer', category: 'Officers' },
  terminate: { label: 'An officer has resigned or been removed', category: 'Officers' },
  psc_add: { label: 'Notify a person with significant control', category: 'Persons with significant control' },
  psc_change: { label: 'Change the details of a person with significant control', category: 'Persons with significant control' },
  psc_cease: { label: 'A person with significant control has ceased', category: 'Persons with significant control' },
  name: { label: 'Change of company name', category: 'Change of name' },
  sic: { label: 'Change of nature of business (SIC)', category: 'Other' },
  confirmation: { label: 'Confirmation statement', category: 'Confirmation statement' },
  document: { label: 'Another filing (upload a PDF)', category: 'Other' },
};
const bad = (message) => Object.assign(new Error(message), { status: 400 });

// Checks a change against the company as it is now and returns the details to store.
function checkChange(c, kind, input) {
  switch (kind) {
    case 'address': { const v = req(input.registeredOffice, 'Enter the new registered office address.', 300); if (v === c.registeredOffice) throw bad('That is already the registered office address.'); return { registeredOffice: v }; }
    case 'appoint': { const o = LISTS.officers(input); if (!o.appointed) throw bad('Enter the date of appointment.'); o.resigned = ''; return { officer: o }; }
    case 'terminate': { const o = c.officers.find((x) => x.id === input.officer && !x.resigned); if (!o) throw bad('Choose a current officer.'); const date = d(input.resigned); if (!date) throw bad('Enter the date they stopped being an officer.'); return { officer: o.id, name: o.name, role: o.role, resigned: date }; }
    case 'psc_add': { const x = LISTS.psc(input.item || input); if (!x.notified) throw bad('Enter the date they became a person with significant control.'); x.ceased = ''; return { psc: x }; }
    case 'psc_change': {
      const x = c.psc.find((y) => y.id === input.psc && !y.ceased); if (!x) throw bad('Choose a current person with significant control.');
      const date = d(input.changed); if (!date) throw bad('Enter the date the details changed.');
      const next = LISTS.psc({ ...(input.item || {}), notified: x.notified });
      const pick = (y) => ({ name: y.name, kind: y.kind, share: y.share || '', control: [...(y.control || [])] });
      const before = pick(x), after = pick(next);
      if (JSON.stringify(before) === JSON.stringify(after)) throw bad('Nothing has changed. Update at least one detail.');
      return { psc: x.id, name: x.name, changed: date, before, after };
    }
    case 'psc_cease': { const x = c.psc.find((y) => y.id === input.psc && !y.ceased); if (!x) throw bad('Choose a current person with significant control.'); const date = d(input.ceased); if (!date) throw bad('Enter the date they ceased.'); return { psc: x.id, name: x.name, ceased: date }; }
    case 'name': {
      // The registered (legal) name, the trading name it's known by, or both. A blank trading name means it trades under its registered name.
      const newName = req(input.newName, 'Enter the registered name.', 160);
      const oldTrading = c.name && c.name !== c.legalName ? c.name : '';
      const trading = t(input.tradingName, 120);
      const newTrading = trading && trading.toLowerCase() !== newName.toLowerCase() ? trading : '';
      const legalChanged = newName !== c.legalName, tradingChanged = newTrading !== oldTrading;
      if (!legalChanged && !tradingChanged) throw bad('Nothing has changed. Enter a new registered name or trading name.');
      if (legalChanged && newName.toLowerCase() !== c.legalName.toLowerCase() && companies(true).some((x) => x.slug !== c.slug && x.legalName.toLowerCase() === newName.toLowerCase())) throw bad('Another company on the register already uses that name.');
      return { newName, oldName: c.legalName, legalChanged, tradingName: newTrading, oldTradingName: oldTrading, tradingChanged };
    }
    case 'sic': { const v = String(input.sic || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 4).map((x) => x.slice(0, 160)); if (!v.length) throw bad('Enter at least one nature of business (SIC) line.'); return { sic: v }; }
    case 'confirmation': { const date = d(input.madeUpTo); if (!date) throw bad('Enter the date the statement is made up to.'); return { madeUpTo: date }; }
    default: return {};
  }
}
function changeDescription(kind, ch) {
  switch (kind) {
    case 'address': return 'Change of registered office address to ' + ch.registeredOffice.replace(/\n/g, ', ');
    case 'appoint': return 'Appointment of ' + ch.officer.name + ' as ' + article(ch.officer.role) + ' on ' + longDate(ch.officer.appointed);
    case 'terminate': return 'Termination of appointment of ' + ch.name + ' as ' + article(ch.role) + ' on ' + longDate(ch.resigned);
    case 'psc_add': return 'Notification of ' + ch.psc.name + ' as a person with significant control on ' + longDate(ch.psc.notified);
    case 'psc_change': return 'Change of details of ' + ch.name + ' as a person with significant control on ' + longDate(ch.changed);
    case 'psc_cease': return 'Cessation of ' + ch.name + ' as a person with significant control on ' + longDate(ch.ceased);
    case 'name': {
      const trading = (ch.tradingName ? 'trading name to ' + ch.tradingName : 'no separate trading name');
      if (ch.legalChanged === false) return ch.oldTradingName ? 'Change of trading name from ' + ch.oldTradingName + ' to ' + (ch.tradingName || ch.newName) : 'Change of trading name to ' + ch.tradingName;
      return 'Change of name from ' + ch.oldName + ' to ' + ch.newName + (ch.tradingChanged ? ', with ' + trading : '');
    }
    case 'sic': return 'Change of nature of business';
    case 'confirmation': return 'Confirmation statement made up to ' + longDate(ch.madeUpTo);
    default: return '';
  }
}
const article = (role) => { const r = String(role || 'officer').toLowerCase(); return (/^[aeiou]/.test(r) ? 'an ' : 'a ') + r; };

function addSubmission(cust, slug, input, pdf) {
  const c = company(slug);
  if (!c) throw Object.assign(new Error('Company not found.'), { status: 404 });
  if (input.kind === 'claim') return addClaim(cust, c, input, pdf);
  // Only customers who manage the company (or a company above it) can file changes for it.
  if (!canManage(c, cust.id)) throw Object.assign(new Error('Only people who manage this company can file changes for it. Request to manage it first.'), { status: 403 });
  const kind = Object.hasOwn(CHANGE_TYPES, input.kind) ? input.kind : 'document';
  if (kind === 'document' && !pdf) throw bad('Attach the filing as a PDF.');
  const pending = db.submissions.filter((s) => s.customer === cust.id && s.status === 'Pending').length;
  if (pending >= 10) throw Object.assign(new Error('You have 10 filings waiting for review. Please wait before submitting more.'), { status: 429 });
  const change = checkChange(c, kind, input);
  const description = kind === 'document' ? req(input.description, 'Describe the filing.', 300) : changeDescription(kind, change);
  const s = { id: id(), ref: 'S' + crypto.randomBytes(4).toString('hex').toUpperCase(), customer: cust.id, company: slug, kind, change,
    category: kind === 'document' ? (FILING_CATEGORIES.includes(input.category) ? input.category : 'Other') : CHANGE_TYPES[kind].category, description,
    note: t(input.note, 2000), file: pdf ? storeFile(pdf) : '', pages: pdf ? countPages(pdf) : 0, status: 'Pending', staffNote: '', createdAt: now(), decidedAt: null, filing: '' };
  db.submissions.push(s);
  audit('customer:' + cust.email, 'submission.add', s.ref + ' ' + description);
  save();
  return s;
}

// ---------- Group reports ----------
// A company and every company below it, in order, with each one's depth (0 for the company itself).
function groupOf(slug, all) {
  const out = [], seen = new Set();
  const walk = (c, depth) => { if (!c || seen.has(c.slug) || depth > 20) return; seen.add(c.slug); out.push({ company: c, depth }); for (const k of companies(all).filter((x) => x.parent === c.slug)) walk(k, depth + 1); };
  walk(company(slug), 0);
  return out;
}
// A PDF report on a company and (optionally) all its subsidiaries, from the public record.
function groupReport(slug, opts) {
  const o = { subsidiaries: true, officers: true, psc: true, charges: true, filings: true, ...(opts || {}) };
  const root = company(slug);
  const group = o.subsidiaries ? groupOf(slug, false) : [{ company: root, depth: 0 }];
  const today = now().slice(0, 10);
  const nameOf = (s2) => (company(s2) || {}).legalName || '';
  const sections = [{ title: 'Summary', rows: [['Report date', longDate(today)], ['Company', root.legalName + (root.number ? ' (' + root.number + ')' : '')], ['Companies included', String(group.length)], ['Includes', [o.officers && 'officers', o.psc && 'persons with significant control', o.charges && 'charges', o.filings && 'recent filings'].filter(Boolean).join(', ') || 'company details only']] }];
  if (group.length > 1) sections.push({ title: 'Group structure', level: 2, lines: group.map((g) => '  '.repeat(g.depth) + (g.depth ? '- ' : '') + g.company.legalName + (g.company.number ? ' (' + g.company.number + ')' : '') + (g.company.status ? ', ' + g.company.status : '')) });
  group.forEach(({ company: c, depth }, i) => {
    sections.push({ title: c.legalName, subtitle: (depth ? 'Subsidiary of ' + nameOf(c.parent) + '. ' : '') + 'Company number ' + (c.number || 'not recorded') + '.', newPage: i > 0, rows: [
      ['Trading name', c.name && c.name !== c.legalName ? c.name : 'Same as registered name'], ['Status', c.status], ['Company type', c.type], ['Incorporated on', longDate(c.incorporated)],
      ...(c.dissolved ? [['Dissolved on', longDate(c.dissolved)]] : []), ['Registered office', (c.registeredOffice || '').replace(/\n/g, ', ')], ['Nature of business', c.sic.join('; ')],
      ['Parent company', c.parent ? nameOf(c.parent) : 'None recorded'], ...(c.managedBy ? [['Managed by', nameOf(c.managedBy)]] : []),
      ['Subsidiaries', companies().filter((x) => x.parent === c.slug).map((x) => x.legalName).join('; ') || 'None recorded'],
      ['Previous names', c.previousNames.map((p) => p.name).join('; ') || 'None'],
      ['Accounts next due', longDate(c.accountsNextDue)], ['Last accounts made up to', longDate(c.accountsMadeUpTo)], ['Confirmation next due', longDate(c.confirmationNextDue)], ['Last statement dated', longDate(c.confirmationMadeUpTo)],
    ] });
    if (o.officers) { const cur = c.officers.filter((x) => !x.resigned); const past = c.officers.filter((x) => x.resigned);
      sections.push({ title: 'Officers', level: 2, lines: cur.length ? cur.map((x) => x.name + ' - ' + x.role + (x.appointed ? ', appointed ' + longDate(x.appointed) : '')).concat(past.length ? [past.length + ' former officer' + (past.length === 1 ? '' : 's') + ': ' + past.map((x) => x.name + ' (' + x.role + ', to ' + longDate(x.resigned) + ')').join('; ')] : []) : ['No current officers recorded.'] }); }
    if (o.psc) { const cur = c.psc.filter((x) => !x.ceased);
      sections.push({ title: 'Persons with significant control', level: 2, lines: cur.length ? cur.map((x) => x.name + ' - ' + x.kind + (x.share ? ', ' + x.share + '%' : '') + (x.control.length ? '. ' + x.control.join('; ') : '') + (x.notified ? '. Notified ' + longDate(x.notified) : '')) : ['None recorded.'] }); }
    if (o.charges) { const out = c.charges.filter((x) => x.status !== 'Satisfied');
      sections.push({ title: 'Charges', level: 2, lines: c.charges.length ? [c.charges.length + ' registered, ' + out.length + ' outstanding.'].concat(out.map((x) => (x.code ? x.code + ': ' : '') + x.status + ', in favour of ' + x.entitled + (x.created ? ', created ' + longDate(x.created) : ''))) : ['No charges registered.'] }); }
    if (o.filings) { const list = filings(c.slug).slice(0, 10);
      sections.push({ title: 'Recent filings', level: 2, lines: list.length ? list.map((f) => longDate(f.date) + ' - ' + f.category + ': ' + f.description) : ['No filings on the register.'] }); }
  });
  return { buffer: pdf.report({ heading: o.subsidiaries && group.length > 1 ? 'Group report' : 'Company report', subheading: root.legalName + (o.subsidiaries && group.length > 1 ? ' and its subsidiaries' : ''), footer: REPORT_FOOTER, sections }), count: group.length };
}
const REPORT_FOOTER = 'Produced by the Company Register from the public record on the date shown. Unknown details show as "Not recorded". This is a group register document, not a document from the UK government\'s Companies House.';

// ---------- Company ownership ----------
// A customer manages a company if they're one of its managers, or manage any company above it
// (its parent, the parent's parent and so on). Managers can file changes and register subsidiaries.
function canManage(c, customerId) {
  for (let cur = c, depth = 0; cur && depth < 20; cur = cur.parent ? company(cur.parent) : null, depth++) {
    if ((cur.managers || []).includes(customerId)) return true;
  }
  return false;
}
const managedCompanies = (customerId) => companies(true).filter((c) => canManage(c, customerId));
const pendingLimit = (cust) => {
  if (db.submissions.filter((s) => s.customer === cust.id && s.status === 'Pending').length >= 10) throw Object.assign(new Error('You have 10 filings waiting for review. Please wait before submitting more.'), { status: 429 });
};
const newRef = () => 'S' + crypto.randomBytes(4).toString('hex').toUpperCase();

// Asking to manage an existing company. Staff decide; there's nothing to file publicly.
function addClaim(cust, c, input, pdf) {
  if (canManage(c, cust.id)) throw bad('You already manage this company.');
  if (db.submissions.some((s) => s.kind === 'claim' && s.company === c.slug && s.customer === cust.id && s.status === 'Pending')) throw bad('You’ve already asked to manage this company. Please wait for our reply.');
  pendingLimit(cust);
  const s = { id: id(), ref: newRef(), customer: cust.id, company: c.slug, kind: 'claim', change: {}, category: 'Other', description: 'Request to manage ' + c.legalName,
    note: req(input.note, 'Tell us why you should manage this company (for example, your role in it).', 2000), file: pdf ? storeFile(pdf) : '', pages: pdf ? countPages(pdf) : 0, status: 'Pending', staffNote: '', createdAt: now(), decidedAt: null, filing: '' };
  db.submissions.push(s);
  audit('customer:' + cust.email, 'submission.add', s.ref + ' ' + s.description);
  save();
  return s;
}

// Applying to register a new company, optionally as a subsidiary of a company the customer manages.
// The application holds everything needed to create the company once staff accept it.
function addApplication(cust, input, officerInput, pscInput) {
  pendingLimit(cust);
  const legalName = req(input.legalName, 'Enter the company name.', 160);
  if (companies(true).some((c) => c.legalName.toLowerCase() === legalName.toLowerCase())) throw bad('A company with that name is already on the register.');
  let parent = '';
  if (input.parent) {
    const pc = company(input.parent);
    if (!pc || !canManage(pc, cust.id)) throw Object.assign(new Error('You can only register subsidiaries of companies you manage.'), { status: 403 });
    parent = pc.slug;
  }
  const incorporated = d(input.incorporated);
  const details = { legalName, name: t(input.name, 120), type: t(input.type, 80), registeredOffice: req(input.registeredOffice, 'Enter the registered office address.', 300),
    sic: String(input.sic || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 4).map((x) => x.slice(0, 160)).join('\n'), incorporated, parent, website: t(input.website, 120), description: t(input.description, 1000) };
  // Checked now so problems are reported straight away; they're checked again when staff accept.
  const officer = LISTS.officers(officerInput || {});
  const psc = LISTS.psc(pscInput || {});
  const s = { id: id(), ref: newRef(), customer: cust.id, company: '', kind: 'incorporate', change: { details, officer, psc }, category: 'Incorporation',
    description: 'Application to register ' + legalName + (parent ? ' as a subsidiary of ' + company(parent).legalName : ''),
    note: t(input.note, 2000), file: '', pages: 0, status: 'Pending', staffNote: '', createdAt: now(), decidedAt: null, filing: '' };
  db.submissions.push(s);
  audit('customer:' + cust.email, 'submission.add', s.ref + ' ' + s.description);
  save();
  return s;
}

function addManager(slug, email, actor) {
  const c = company(slug), cust = customerByEmail(email);
  if (!c) throw bad('Company not found.');
  if (!cust) throw bad('There’s no customer account with that email address.');
  if (!c.managers.includes(cust.id)) c.managers.push(cust.id);
  audit(actor, 'company.manager.add', slug + ' ' + cust.email);
  save();
}
function removeManager(slug, customerId, actor) {
  const c = company(slug);
  if (!c) return;
  c.managers = c.managers.filter((x) => x !== customerId);
  audit(actor, 'company.manager.remove', slug + ' ' + ((customer(customerId) || {}).email || customerId));
  save();
}

// Applies an accepted change to the company and returns the filing that records it.
function applyChange(s) {
  if (s.kind === 'incorporate') {
    const ch = s.change;
    const c = saveCompany('', { ...ch.details, status: 'Active', incorporated: ch.details.incorporated || now().slice(0, 10) }, 'customer-application:' + s.ref, { officer: ch.officer, psc: { ...ch.psc, control: (ch.psc.control || []).join('\n') } });
    c.managers = [s.customer];
    s.company = c.slug;
    return c.incorporationFiling || '';
  }
  if (s.kind === 'claim') {
    const c = company(s.company);
    if (c && !c.managers.includes(s.customer)) c.managers.push(s.customer);
    return '';
  }
  const c = company(s.company);
  if (!c) throw bad('The company is no longer on the register.');
  const kind = s.kind || 'document';
  const ch = s.change || {};
  const date = now().slice(0, 10);
  // A customer's PDF becomes the filing's document; otherwise the register generates one.
  const filing = (when, rows) => {
    const file = s.file || storeFile(pdf.build({ heading: CHANGE_TYPES[kind].label, subheading: c.legalName + (c.number ? ' (company number ' + c.number + ')' : ''), footer: FOOTER, rows }));
    const f = { id: id(), company: c.slug, date: when || date, category: s.category, description: s.description, file, pages: s.file ? s.pages : 1, createdAt: now(), source: s.file ? 'customer' : 'generated' };
    db.filings.push(f);
    return f.id;
  };
  switch (kind) {
    case 'address': { const old = c.registeredOffice; c.registeredOffice = ch.registeredOffice; return filing(date, [['Company', c.legalName], ['Old address', old.replace(/\n/g, ', ')], ['New address', ch.registeredOffice.replace(/\n/g, ', ')]]); }
    case 'appoint': case 'psc_add': {
      const list = kind === 'appoint' ? c.officers : c.psc;
      const item = { id: id(), ...(kind === 'appoint' ? ch.officer : ch.psc) };
      const fid = filing(kind === 'appoint' ? item.appointed : item.notified, kind === 'appoint'
        ? [['Name', item.name], ['Role', item.role], ['Appointed on', longDate(item.appointed)], ['Occupation', item.occupation], ['Nationality', item.nationality], ['Country of residence', item.countryOfResidence]]
        : [['Name', item.name], ['Type', item.kind], ['Shareholding', item.share ? item.share + '%' : ''], ['Nature of control', (item.control || []).join('; ')], ['Notified on', longDate(item.notified)]]);
      item[kind === 'appoint' ? 'appointmentFiling' : 'notificationFiling'] = fid;
      list.push(item);
      return fid;
    }
    case 'terminate': { const o = c.officers.find((x) => x.id === ch.officer); if (!o || o.resigned) throw bad('That officer is no longer current, so this change can’t be applied.'); o.resigned = ch.resigned; return filing(ch.resigned, [['Name', o.name], ['Role', o.role], ['Appointed on', longDate(o.appointed)], ['Appointment ended on', longDate(ch.resigned)]]); }
    case 'psc_change': {
      const x = c.psc.find((y) => y.id === ch.psc); if (!x || x.ceased) throw bad('That person is no longer a current person with significant control, so this change can’t be applied.');
      const show = (y) => [y.name, y.kind, y.share ? y.share + '%' : 'Shareholding not recorded', (y.control || []).join('; ')].filter(Boolean).join(' · ');
      Object.assign(x, ch.after);
      return filing(ch.changed, [['Person with significant control', ch.name], ['Previous details', show(ch.before)], ['New details', show(ch.after)], ['Changed on', longDate(ch.changed)]]);
    }
    case 'psc_cease': { const x = c.psc.find((y) => y.id === ch.psc); if (!x || x.ceased) throw bad('That person is no longer a current person with significant control, so this change can’t be applied.'); x.ceased = ch.ceased; return filing(ch.ceased, [['Name', x.name], ['Type', x.kind], ['Ceased on', longDate(ch.ceased)]]); }
    case 'name': {
      const old = c.legalName, oldTrading = c.name && c.name !== c.legalName ? c.name : '';
      // Older submissions only changed the registered name and kept any separate trading name.
      const legalChanged = ch.legalChanged !== false, tradingChanged = !!ch.tradingChanged;
      if (legalChanged) { c.previousNames.push({ name: old, until: date }); c.legalName = ch.newName; }
      c.name = tradingChanged ? (ch.tradingName || c.legalName) : (oldTrading || c.legalName);
      return filing(date, [['Previous registered name', old], ['New registered name', legalChanged ? ch.newName : 'Unchanged'], ['Previous trading name', oldTrading || 'Same as registered name'], ['New trading name', c.name === c.legalName ? 'Same as registered name' : c.name], ['Changed on', longDate(date)]]);
    } // a customer's PDF is used if given
    case 'sic': { const old = c.sic.join('; '); c.sic = ch.sic; return filing(date, [['Previous nature of business', old], ['New nature of business', ch.sic.join('; ')]]); }
    case 'confirmation': { c.confirmationMadeUpTo = ch.madeUpTo; return filing(ch.madeUpTo, [['Company', c.legalName], ['Statement made up to', longDate(ch.madeUpTo)], ['Registered office', c.registeredOffice.replace(/\n/g, ', ')], ['Current officers', c.officers.filter((o) => !o.resigned).map((o) => o.name + ' (' + o.role + ')').join('; ')], ['Persons with significant control', c.psc.filter((p) => !p.ceased).map((p) => p.name).join('; ')]]); }
    default: { const f = { id: id(), company: s.company, date, category: s.category, description: s.description, file: s.file, pages: s.pages, createdAt: now(), source: 'customer' }; db.filings.push(f); return f.id; }
  }
}
// A change filed earlier may no longer fit the record (for example the officer has since resigned).
function checkStillValid(s) {
  if (s.kind === 'incorporate') {
    const ch = s.change;
    if (companies(true).some((c) => c.legalName.toLowerCase() === ch.details.legalName.toLowerCase())) throw bad('A company with that name is now on the register. Reject this application instead.');
    if (ch.details.parent && !company(ch.details.parent)) throw bad('The parent company is no longer on the register. Reject this application instead.');
    if (!customer(s.customer)) throw bad('The applicant’s account no longer exists. Reject this application instead.');
    return;
  }
  const c = company(s.company);
  if (!c) throw bad('The company is no longer on the register.');
  const ch = s.change || {};
  if (s.kind === 'terminate' && !c.officers.some((o) => o.id === ch.officer && !o.resigned)) throw bad('That officer is no longer current, so this change can’t be applied. Reject it instead.');
  if ((s.kind === 'psc_cease' || s.kind === 'psc_change') && !c.psc.some((p) => p.id === ch.psc && !p.ceased)) throw bad('That person is no longer a current person with significant control, so this change can’t be applied. Reject it instead.');
}
const submission = (sid) => db.submissions.find((s) => s.id === sid) || null;
function decideSubmission(s, accept, note, actor) {
  if (s.status !== 'Pending') throw Object.assign(new Error('This filing has already been reviewed.'), { status: 409 });
  if (accept && s.kind && s.kind !== 'document') checkStillValid(s);
  s.status = accept ? 'Accepted' : 'Rejected';
  s.staffNote = t(note, 1000);
  s.decidedAt = now();
  if (accept) {
    // Applying the change updates the record and adds its filing (the customer's PDF is moved, not copied).
    s.filing = applyChange(s);
    const c = company(s.company); if (c) c.updatedAt = now();
  } else {
    removeFile(s.file); s.file = '';
  }
  audit(actor, 'submission.' + (accept ? 'accept' : 'reject'), s.ref);
  save();
}

module.exports = {
  init, STATUSES, FILING_CATEGORIES, OFFICER_ROLES, PSC_KINDS, REQUEST_KINDS, CHANGE_TYPES,
  canManage, managedCompanies, groupOf, groupReport, addApplication, addManager, removeManager,
  companies, company, children, search, saveCompany, deleteCompany, saveItem, deleteItem,
  filings, filing, addFiling, deleteFiling, filePath,
  customer, customerByEmail, createCustomer, checkPassword, changePassword, touchLogin, setCustomerDisabled,
  addRequest, request, replyRequest, addSubmission, submission, decideSubmission,
  get db() { return db; }, audit, save,
};
