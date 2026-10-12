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
const SOURCES = { internal: "Internal applicant", referral: "Staff referral", external: "External", agency: "Agency" };

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
  const closingDate = str(input.closingDate, 10);
  if (closingDate && !/^\d{4}-\d{2}-\d{2}$/.test(closingDate)) throw new store.ValidationError("Choose a valid closing date.");
  const manager = input.hiringManagerId ? store.getPerson(input.hiringManagerId) : null;
  const v = existing || { id: newId(), status: "open", createdBy: by.id, createdAt: new Date().toISOString() };
  Object.assign(v, {
    title,
    company: input.company,
    location: str(input.location, 120),
    contract: CONTRACTS[input.contract] ? input.contract : "full-time",
    salary: str(input.salary, 80),
    description: str(input.description, 6000),
    closingDate: closingDate || null,
    hiringManagerId: manager && !manager.system ? manager.id : null,
    internalOnly: !!input.internalOnly,
    updatedAt: new Date().toISOString(),
  });
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
  return v.status === "open" && (!v.closingDate || v.closingDate >= today());
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
  if (buffer && buffer.length) {
    const fileName = str(meta.fileName, 200);
    const ext = workplace.fileExt(fileName);
    if (!["pdf", "doc", "docx", "odt", "txt", "rtf"].includes(ext)) throw new store.ValidationError("CVs can be a PDF or Word document.");
    fs.writeFileSync(path.join(dir, a.id), buffer, { mode: 0o600 });
    a.cv = { fileName: workplace.cleanFileName(fileName), ext, size: buffer.length };
  }
  db.data.applicants.push(a);
  db.save();
  return a;
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
    contractLabel: CONTRACTS[v.contract], hiringManagerName: nameOf(v.hiringManagerId), open: isOpen(v),
    applied: !!viewer && apps.some((a) => a.personId === viewer.id && a.stage !== "withdrawn"),
    myApplication: viewer ? (apps.find((a) => a.personId === viewer.id) || null) : null,
  };
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
  setStage, addNote, hire, deleteApplicant, pruneApplicants, forViewer, vacancyView, openCount, newApplicantsCount, hiresBetween,
};
