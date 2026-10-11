// Training records. Courses and certificates for each person, with the date they were completed
// and (for things that need renewing, like first aid) when they expire. Staff add their own and
// can see them; HR (staff.manage) sees and manages everyone's and can mark records as checked.
// Reminders show when something expires within 30 days. HR can also list required courses that
// everyone (or one company) must hold. Stored in DATA_DIR/training.json, certificates in
// DATA_DIR/training-files.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");
const workplace = require("./workplace");
const datafile = require("./datafile");

const MANAGE = "staff.manage";
const REMIND_DAYS = 30;

let db;
let dir;

function init(dataDir) {
  db = datafile.open(dataDir, "training.json", () => ({ records: [], required: [] }));
  dir = path.join(dataDir, "training-files");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);

function validDay(v, label, optional) {
  const s = str(v, 10);
  if (!s && optional) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) throw new store.ValidationError(`Choose a valid ${label}.`);
  return s;
}

function daysUntil(date) {
  return Math.round((Date.parse(date + "T12:00:00Z") - Date.parse(today() + "T12:00:00Z")) / 86400000);
}

function canManage(viewer) {
  return store.can(viewer, MANAGE);
}

function canEdit(viewer, rec) {
  return canManage(viewer) || rec.personId === viewer.id;
}

function stateOf(rec) {
  if (!rec.expiresOn) return "valid";
  const d = daysUntil(rec.expiresOn);
  return d < 0 ? "expired" : d <= REMIND_DAYS ? "expiring" : "valid";
}

function save(person, meta, buffer, by, existing) {
  if (!person || person.system) throw new store.ValidationError("Choose a member of staff.");
  const course = str(meta.course, 120);
  if (!course) throw new store.ValidationError("Enter the course or qualification.");
  const completedOn = validDay(meta.completedOn, "completion date");
  if (completedOn > today()) throw new store.ValidationError("The completion date can't be in the future.");
  const expiresOn = validDay(meta.expiresOn, "expiry date", true);
  if (expiresOn && expiresOn <= completedOn) throw new store.ValidationError("The expiry date must be after the completion date.");
  const rec = existing || { id: newId(), personId: person.id, createdBy: by.id, createdAt: new Date().toISOString(), certificate: null };
  Object.assign(rec, { course, provider: str(meta.provider, 120), completedOn, expiresOn, note: str(meta.note, 500), updatedAt: new Date().toISOString() });
  // HR adding or editing a record counts as checking it; staff edits need checking again.
  rec.verified = canManage(by) && by.id !== person.id ? true : canManage(by) ? !!meta.verified : false;
  if (buffer && buffer.length) {
    const fileName = str(meta.fileName, 200);
    const ext = workplace.fileExt(fileName);
    if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) throw new store.ValidationError("Certificates can be a PDF, JPG or PNG.");
    fs.writeFileSync(path.join(dir, rec.id), buffer, { mode: 0o600 });
    rec.certificate = { fileName: workplace.cleanFileName(fileName), ext, size: buffer.length };
  }
  if (!existing) db.data.records.push(rec);
  db.save();
  return rec;
}

function get(id) {
  return db.data.records.find((r) => r.id === id) || null;
}

function verify(rec, by) {
  rec.verified = true;
  rec.verifiedBy = by.id;
  db.save();
}

function remove(rec) {
  db.data.records = db.data.records.filter((r) => r.id !== rec.id);
  if (rec.certificate) fs.rmSync(path.join(dir, rec.id), { force: true });
  db.save();
}

function certificateFile(rec) {
  if (!rec.certificate) return null;
  const t = workplace.FILE_TYPES[rec.certificate.ext];
  return { path: path.join(dir, rec.id), name: rec.certificate.fileName, mime: t.mime, inline: t.inline };
}

function view(rec, viewer) {
  const p = store.getPerson(rec.personId);
  return {
    ...rec,
    person: p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl } : { displayName: "Former staff" },
    state: stateOf(rec),
    daysLeft: rec.expiresOn ? daysUntil(rec.expiresOn) : null,
    canEdit: canEdit(viewer, rec),
  };
}

// Required courses: everyone (or one company) should hold a current record with this name.
function saveRequired(input) {
  const course = str(input.course, 120);
  if (!course) throw new store.ValidationError("Enter the course name.");
  const company = store.COMPANIES.includes(input.company) ? input.company : "";
  if (db.data.required.some((r) => r.course.toLowerCase() === course.toLowerCase() && r.company === company)) throw new store.ValidationError("That course is already required.");
  db.data.required.push({ id: newId(), course, company });
  db.save();
}

function deleteRequired(id) {
  db.data.required = db.data.required.filter((r) => r.id !== id);
  db.save();
}

function holds(personId, course) {
  return db.data.records.some((r) => r.personId === personId && r.course.toLowerCase() === course.toLowerCase() && stateOf(r) !== "expired");
}

// Required courses a person is missing (or whose record has expired).
function missingFor(person) {
  const companies = [person.company].concat((person.otherRoles || []).map((r) => r.company));
  return db.data.required.filter((q) => (!q.company || companies.includes(q.company)) && !holds(person.id, q.course)).map((q) => q.course);
}

function forViewer(viewer) {
  const mine = db.data.records.filter((r) => r.personId === viewer.id).sort((a, b) => b.completedOn.localeCompare(a.completedOn)).map((r) => view(r, viewer));
  const out = { mine, myMissing: viewer.system ? [] : missingFor(viewer), required: db.data.required, canManage: canManage(viewer) };
  if (canManage(viewer)) {
    out.all = db.data.records.slice().sort((a, b) => (a.expiresOn || "9999").localeCompare(b.expiresOn || "9999")).map((r) => view(r, viewer));
    out.matrix = store.employees().map((p) => ({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, missing: missingFor(p), records: db.data.records.filter((r) => r.personId === p.id).length }))
      .sort((a, b) => b.missing.length - a.missing.length || a.displayName.localeCompare(b.displayName));
  }
  return out;
}

// Reminders: your own expiring/expired/missing training, and for HR everyone's.
function dueCount(viewer) {
  let n = db.data.records.filter((r) => r.personId === viewer.id && stateOf(r) !== "valid").length + (viewer.system ? 0 : missingFor(viewer).length);
  if (canManage(viewer)) n = db.data.records.filter((r) => stateOf(r) !== "valid").length + store.employees().reduce((t, p) => t + missingFor(p).length, 0);
  return n;
}

// Records expiring in exactly `days` days (for daily reminders).
function expiringOn(days) {
  return db.data.records.filter((r) => r.expiresOn && daysUntil(r.expiresOn) === days);
}

module.exports = { MANAGE, init, canManage, canEdit, save, get, verify, remove, certificateFile, view, saveRequired, deleteRequired, forViewer, dueCount, expiringOn };
