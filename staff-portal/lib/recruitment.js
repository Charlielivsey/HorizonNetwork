// Recruitment. People with "recruitment.manage" post job vacancies, which every member of staff
// can see on the Jobs page (and apply for, or refer someone). Applicants move through stages from
// applied to hired; hiring someone creates their employee record and starts their onboarding.
// Stored in DATA_DIR/recruitment.json, CVs in DATA_DIR/cvs.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");
const workplace = require("./workplace");
const onboarding = require("./onboarding");
const datafile = require("./datafile");

const MANAGE = "recruitment.manage";
const STAGES = { applied: "Applied", screening: "Screening", interview: "Interview", offer: "Offer", hired: "Hired", rejected: "Not progressing", withdrawn: "Withdrawn" };
const CONTRACTS = { "full-time": "Full time", "part-time": "Part time", contract: "Contract", temporary: "Temporary", apprenticeship: "Apprenticeship", internship: "Internship" };
const SOURCES = { internal: "Internal applicant", referral: "Staff referral", external: "External", agency: "Agency", website: "Company website" };

let db;
let dir;

function init(dataDir) {
  db = datafile.open(dataDir, "recruitment.json", () => ({ vacancies: [], applicants: [] }));
  dir = path.join(dataDir, "cvs");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);

function canManage(viewer) {
  return store.can(viewer, MANAGE);
}

function saveVacancy(input, by, existing) {
  const title = str(input.title, 120);
  if (!title) throw new store.ValidationError("Enter the job title.");
  if (!store.COMPANIES.includes(input.company)) throw new store.ValidationError("Choose the company.");
  const manager = input.hiringManagerId ? store.getPerson(input.hiringManagerId) : null;
  const v = existing || { id: newId(), status: "open", createdBy: by.id, createdAt: new Date().toISOString() };
  Object.assign(v, {
    title,
    company: input.company,
    description: str(input.description, 6000),
    hiringManagerId: manager && !manager.system ? manager.id : null,
    internalOnly: !!input.internalOnly,
    // Shown on careers.hngroup.org.uk, where anyone can apply.
    publicListing: !!input.publicListing,
    updatedAt: new Date().toISOString(),
  });
  // Vacancies no longer have a location, contract type, salary or closing date (the user's request, 31 October 2026).
  for (const k of ["location", "contract", "salary", "closingDate"]) delete v[k];
  if (!existing) db.data.vacancies.push(v);
  db.save();
  return v;
}

function getVacancy(id) {
  return db.data.vacancies.find((v) => v.id === id) || null;
}

function setVacancyStatus(v, status) {
  if (!["open", "closed", "filled"].includes(status)) throw new store.ValidationError("Choose a status.");
  v.status = status;
  db.save();
}

function deleteVacancy(v) {
  for (const a of db.data.applicants.filter((x) => x.vacancyId === v.id)) if (a.cv) fs.rmSync(path.join(dir, a.id), { force: true });
  db.data.applicants = db.data.applicants.filter((a) => a.vacancyId !== v.id);
  db.data.vacancies = db.data.vacancies.filter((x) => x.id !== v.id);
  db.save();
}

function isOpen(v) {
  return v.status === "open";
}

// Adds an applicant. Staff applying themselves are "internal"; staff referring someone are
// "referral"; recruiters can add anyone.
function addApplicant(v, meta, buffer, by) {
  const manager = canManage(by);
  if (!manager && !isOpen(v)) throw new store.ValidationError("This vacancy is closed.");
  const self = meta.self === true && !by.system;
  if (self && db.data.applicants.some((a) => a.vacancyId === v.id && a.personId === by.id && a.stage !== "withdrawn")) throw new store.ValidationError("You've already applied for this job.");
  const name = self ? by.displayName : str(meta.name, 120);
  if (!name) throw new store.ValidationError("Enter the applicant's name.");
  const email = self ? "" : str(meta.email, 160);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new store.ValidationError("Enter a valid email address.");
  const a = {
    id: newId(),
    vacancyId: v.id,
    personId: self ? by.id : null,
    name,
    email,
    phone: self ? "" : str(meta.phone, 40),
    source: self ? "internal" : manager && SOURCES[meta.source] ? meta.source : "referral",
    referredBy: self ? null : by.id,
    message: str(meta.message, 3000),
    stage: "applied",
    notes: [],
    cv: null,
    createdAt: new Date().toISOString(),
    stageChangedAt: new Date().toISOString(),
  };
  db.data.applicants.push(a);
  db.save();
  return a;
}

// ----- The public website (hngroup.org.uk) -----

// Open vacancies HR have chosen to advertise, with only the details meant for the public.
function publicVacancies() {
  return db.data.vacancies.filter((v) => v.publicListing && isOpen(v))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((v) => ({ id: v.id, title: v.title, company: v.company, description: v.description, postedAt: v.createdAt.slice(0, 10) }));
}

// An application from the website: name and email are required. CVs are no longer taken (the user's request, 31 October 2026).
function addWebsiteApplicant(v, meta, buffer) {
  if (!v || !v.publicListing || !isOpen(v)) throw new store.ValidationError("This job is no longer open.");
  const name = str(meta.name, 120), email = str(meta.email, 160);
  if (!name) throw new store.ValidationError("Enter your name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new store.ValidationError("Enter a valid email address.");
  if (db.data.applicants.some((a) => a.vacancyId === v.id && a.email.toLowerCase() === email.toLowerCase() && a.stage !== "withdrawn")) throw new store.ValidationError("You've already applied for this job. We'll be in touch.");
  const now = new Date().toISOString();
  const a = {
    id: newId(), vacancyId: v.id, personId: null, name, email, phone: str(meta.phone, 40), source: "website", referredBy: null,
    message: str(meta.message, 3000), stage: "applied", notes: [], cv: null, createdAt: now, stageChangedAt: now,
  };
  // A private reference lets the applicant check where their application is on careers.hngroup.org.uk (only its hash is kept).
  const reference = crypto.randomBytes(32).toString("hex");
  a.reference = crypto.createHash("sha256").update(reference).digest("hex");
  db.data.applicants.push(a);
  db.save();
  return Object.assign(Object.create(a), { plainReference: reference });
}

// What a website applicant sees with their reference: the role and a plain-English stage, never notes or names of staff.
const PUBLIC_STAGES = {
  applied: ["Received", "We\u2019ve got your application and will look at it soon."],
  screening: ["Being reviewed", "The hiring team is reviewing your application."],
  interview: ["Interview", "We\u2019d like to meet you. The hiring team will be in touch by email to arrange it."],
  offer: ["Offer", "We\u2019d like to offer you the role. The hiring team will be in touch by email."],
  hired: ["Hired", "Welcome to HN Group! Your onboarding details will follow by email."],
  rejected: ["Not progressing", "Thank you for applying. We won\u2019t be taking your application further this time."],
  withdrawn: ["Withdrawn", "This application was withdrawn."],
};
function applicationStatus(reference) {
  if (!/^[a-f0-9]{64}$/.test(String(reference || ""))) return null;
  const h = crypto.createHash("sha256").update(reference).digest("hex");
  const a = db.data.applicants.find((x) => x.source === "website" && x.reference === h);
  if (!a) return null;
  const v = db.data.vacancies.find((x) => x.id === a.vacancyId);
  const [stage, detail] = PUBLIC_STAGES[a.stage] || PUBLIC_STAGES.applied;
  return { title: v ? v.title : "A role at HN Group", company: v ? v.company : "", appliedAt: a.createdAt, stage, detail, open: !["hired", "rejected", "withdrawn"].includes(a.stage) };
}

function getApplicant(id) {
  return db.data.applicants.find((a) => a.id === id) || null;
}

function cvFile(a) {
  if (!a.cv) return null;
  const t = workplace.FILE_TYPES[a.cv.ext] || { mime: "application/octet-stream", inline: false };
  return { path: path.join(dir, a.id), name: a.cv.fileName, mime: t.mime, inline: t.inline };
}

function setStage(a, stage, by) {
  if (!STAGES[stage] || stage === "hired") throw new store.ValidationError("Choose a stage.");
  if (a.stage === "hired") throw new store.ValidationError("This applicant has already been hired.");
  a.stage = stage;
  a.stageChangedAt = new Date().toISOString();
  a.notes.push({ id: newId(), text: `Moved to ${STAGES[stage]}`, by: by.id, at: a.stageChangedAt, auto: true });
  db.save();
}

function addNote(a, text, by) {
  const t = str(text, 3000);
  if (!t) throw new store.ValidationError("Write a note first.");
  a.notes.push({ id: newId(), text: t, by: by.id, at: new Date().toISOString() });
  db.save();
}

// Hiring: an internal applicant just moves role (HR updates their record); anyone else gets a new
// employee record and the default onboarding checklist.
function hire(a, input, by) {
  if (a.stage === "hired") throw new store.ValidationError("This applicant has already been hired.");
  const v = getVacancy(a.vacancyId);
  let person = a.personId ? store.getPerson(a.personId) : null;
  let checklist = null;
  if (!person) {
    const firstName = str(input.firstName, 60);
    const lastName = str(input.lastName, 60);
    const company = store.COMPANIES.includes(input.company) ? input.company : v.company;
    person = store.saveEmployee({
      firstName, lastName,
      jobTitle: str(input.jobTitle, 100) || v.title,
      company,
      supervisorId: input.supervisorId || v.hiringManagerId || null,
      startDate: input.startDate || null,
      emails: [{ domain: store.COMPANY_DOMAINS[company], auto: true, primary: true }],
    }, null);
    const tpl = onboarding.listTemplates().find((t) => (t.kind || "starter") === "starter");
    if (tpl && input.startOnboarding !== false) {
      try { checklist = onboarding.startChecklist(tpl, person, by); } catch (err) { if (!(err instanceof store.ValidationError)) throw err; }
    }
  }
  a.stage = "hired";
  a.hiredPersonId = person.id;
  a.stageChangedAt = new Date().toISOString();
  a.notes.push({ id: newId(), text: a.personId ? "Hired (internal move)" : `Hired – employee record created${checklist ? " and onboarding started" : ""}`, by: by.id, at: a.stageChangedAt, auto: true });
  if (input.closeVacancy !== false) v.status = "filled";
  db.save();
  return { person, checklist };
}

function deleteApplicant(a) {
  if (a.cv) fs.rmSync(path.join(dir, a.id), { force: true });
  db.data.applicants = db.data.applicants.filter((x) => x.id !== a.id);
  db.save();
}

// Data retention: applicants who weren't taken on (and their CVs) are deleted after a while.
function pruneApplicants(cutoffIso) {
  const old = db.data.applicants.filter((a) => (a.stage === "rejected" || a.stage === "withdrawn") && (a.stageChangedAt || a.createdAt) < cutoffIso);
  for (const a of old) deleteApplicant(a);
  return old.length;
}

const nameOf = (id) => { const p = id ? store.getPerson(id) : null; return p ? p.displayName : id ? "Former staff" : ""; };

function applicantView(a) {
  return {
    ...a,
    stageLabel: STAGES[a.stage], sourceLabel: SOURCES[a.source], referredByName: nameOf(a.referredBy),
    notes: a.notes.slice().reverse().map((n) => ({ ...n, byName: nameOf(n.by) })),
  };
}

function vacancyView(v, viewer) {
  const apps = db.data.applicants.filter((a) => a.vacancyId === v.id);
  const out = {
    ...v,
    hiringManagerName: nameOf(v.hiringManagerId), open: isOpen(v),
    applied: !!viewer && apps.some((a) => a.personId === viewer.id && a.stage !== "withdrawn"),
    myApplication: viewer ? (apps.find((a) => a.personId === viewer.id) || null) : null,
  };
  // Older vacancies may still hold a location, contract type, salary or closing date; they aren't shown any more.
  for (const k of ["location", "contract", "salary", "closingDate"]) delete out[k];
  if (out.myApplication) out.myApplication = { stage: out.myApplication.stage, stageLabel: STAGES[out.myApplication.stage] };
  if (viewer && canManage(viewer)) {
    out.applicants = apps.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(applicantView);
    out.counts = Object.fromEntries(Object.keys(STAGES).map((k) => [k, apps.filter((a) => a.stage === k).length]));
  }
  return out;
}

function forViewer(viewer) {
  const manager = canManage(viewer);
  const list = db.data.vacancies.filter((v) => manager || isOpen(v)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { vacancies: list.map((v) => vacancyView(v, viewer)), canManage: manager, stages: STAGES, contracts: CONTRACTS, sources: SOURCES };
}

function openCount() {
  return db.data.vacancies.filter(isOpen).length;
}

function newApplicantsCount() {
  return db.data.applicants.filter((a) => a.stage === "applied").length;
}

function hiresBetween(from, to) {
  return db.data.applicants.filter((a) => a.stage === "hired" && a.stageChangedAt.slice(0, 10) >= from && a.stageChangedAt.slice(0, 10) <= to).length;
}

module.exports = {
  MANAGE, STAGES, CONTRACTS, SOURCES, init, canManage, saveVacancy, getVacancy, setVacancyStatus, deleteVacancy, addApplicant, getApplicant, cvFile,
  setStage, addNote, hire, deleteApplicant, pruneApplicants, publicVacancies, addWebsiteApplicant, applicationStatus, forViewer, vacancyView, openCount, newApplicantsCount, hiresBetween,
};
