// HR cases: disciplinary, grievance, capability and investigation records. Private to people with
// "cases.manage" — the employee and their supervisor can't see them here (letters are shared with
// the employee through Staff documents if needed). Each case has a timeline of notes and meetings,
// attached files, an outcome, and for warnings the date the warning expires.
// Stored in DATA_DIR/cases.json, files in DATA_DIR/case-files.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");
const workplace = require("./workplace");
const datafile = require("./datafile");

const MANAGE = "cases.manage";
const TYPES = { disciplinary: "Disciplinary", grievance: "Grievance", capability: "Capability", investigation: "Investigation" };
const OUTCOMES = {
  "": "No outcome yet",
  "no-action": "No further action",
  "informal": "Informal warning / words of advice",
  "first-written": "First written warning",
  "final-written": "Final written warning",
  "dismissal": "Dismissal",
  "upheld": "Upheld",
  "partly-upheld": "Partly upheld",
  "not-upheld": "Not upheld",
  "improvement-plan": "Improvement plan",
};
const ENTRY_KINDS = { note: "Note", meeting: "Meeting", letter: "Letter sent", appeal: "Appeal" };
// How long warnings stay live by default (months).
const WARNING_MONTHS = { informal: 6, "first-written": 6, "final-written": 12 };

let db;
let dir;

function init(dataDir) {
  db = datafile.open(dataDir, "cases.json", () => ({ cases: [], nextNumber: 1 }));
  dir = path.join(dataDir, "case-files");
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

function addMonths(date, n) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

function create(input, by) {
  const person = store.getPerson(input.personId);
  if (!person || person.system) throw new store.ValidationError("Choose the employee the case is about.");
  if (store.isOwner(person) && !store.hasOwnerAccess(by)) throw new store.ValidationError("Only the system owner can open a case about the system owner.");
  const title = str(input.title, 150);
  if (!title) throw new store.ValidationError("Give the case a short title.");
  const c = {
    id: newId(),
    number: "HR-" + String(db.data.nextNumber).padStart(3, "0"),
    personId: person.id,
    type: TYPES[input.type] ? input.type : "disciplinary",
    title,
    summary: str(input.summary, 3000),
    openedOn: validDay(input.openedOn || today(), "date opened"),
    status: "open",
    outcome: "",
    outcomeDate: null,
    warningExpires: null,
    entries: [],
    files: [],
    createdBy: by.id,
    createdAt: new Date().toISOString(),
  };
  db.data.nextNumber++;
  db.data.cases.push(c);
  db.save();
  return c;
}

function get(id) {
  return db.data.cases.find((c) => c.id === id) || null;
}

function addEntry(c, input, by) {
  const text = str(input.text, 5000);
  if (!text) throw new store.ValidationError("Write something first.");
  c.entries.push({ id: newId(), kind: ENTRY_KINDS[input.kind] ? input.kind : "note", date: validDay(input.date || today(), "date"), text, by: by.id, at: new Date().toISOString() });
  db.save();
}

function update(c, input) {
  if ("title" in input) c.title = str(input.title, 150) || c.title;
  if ("summary" in input) c.summary = str(input.summary, 3000);
  if ("type" in input && TYPES[input.type]) c.type = input.type;
  db.save();
}

function close(c, input) {
  const outcome = OUTCOMES[input.outcome] !== undefined && input.outcome ? input.outcome : null;
  if (!outcome) throw new store.ValidationError("Choose the outcome.");
  c.status = "closed";
  c.outcome = outcome;
  c.outcomeDate = validDay(input.outcomeDate || today(), "outcome date");
  c.warningExpires = WARNING_MONTHS[outcome] ? validDay(input.warningExpires || addMonths(c.outcomeDate, WARNING_MONTHS[outcome]), "warning expiry date") : null;
  db.save();
}

function reopen(c) {
  c.status = "open";
  db.save();
}

function addFile(c, meta, buffer, by) {
  const fileName = str(meta.fileName, 200);
  const ext = workplace.fileExt(fileName);
  if (!workplace.FILE_TYPES[ext]) throw new store.ValidationError("That file type isn't supported.");
  if (!buffer.length) throw new store.ValidationError("That file is empty.");
  const f = { id: newId(), title: str(meta.title, 150) || fileName.replace(/\.[^.]+$/, ""), fileName: workplace.cleanFileName(fileName), ext, size: buffer.length, by: by.id, at: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, f.id), buffer, { mode: 0o600 });
  c.files.push(f);
  db.save();
  return f;
}

function fileFor(c, fileId) {
  const f = c.files.find((x) => x.id === fileId);
  if (!f) return null;
  const t = workplace.FILE_TYPES[f.ext];
  return { path: path.join(dir, f.id), name: f.fileName, mime: t.mime, inline: t.inline };
}

function remove(c) {
  for (const f of c.files) fs.rmSync(path.join(dir, f.id), { force: true });
  db.data.cases = db.data.cases.filter((x) => x.id !== c.id);
  db.save();
}

const nameOf = (id) => { const p = id ? store.getPerson(id) : null; return p ? p.displayName : id ? "Former staff" : ""; };

function view(c, full) {
  const p = store.getPerson(c.personId);
  const live = c.warningExpires && c.warningExpires >= today();
  const out = {
    id: c.id, number: c.number, type: c.type, typeLabel: TYPES[c.type], title: c.title, status: c.status, openedOn: c.openedOn,
    outcome: c.outcome, outcomeLabel: OUTCOMES[c.outcome] || "", outcomeDate: c.outcomeDate, warningExpires: c.warningExpires, liveWarning: !!live,
    person: p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, company: p.company, avatarUrl: store.publicView(p).avatarUrl } : { displayName: "Former staff" },
    entryCount: c.entries.length, fileCount: c.files.length, createdByName: nameOf(c.createdBy),
  };
  if (full) {
    out.summary = c.summary;
    out.entries = c.entries.slice().sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at)).map((e) => ({ ...e, kindLabel: ENTRY_KINDS[e.kind], byName: nameOf(e.by) }));
    out.files = c.files.map((f) => ({ ...f, byName: nameOf(f.by) }));
  }
  return out;
}

function list() {
  return db.data.cases.slice().sort((a, b) => (a.status === b.status ? b.openedOn.localeCompare(a.openedOn) : a.status === "open" ? -1 : 1)).map((c) => view(c));
}

function openCount() {
  return db.data.cases.filter((c) => c.status === "open").length;
}

module.exports = { MANAGE, TYPES, OUTCOMES, ENTRY_KINDS, init, create, get, addEntry, update, close, reopen, addFile, fileFor, remove, view, list, openCount };
