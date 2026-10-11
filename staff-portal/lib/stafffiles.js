// Private documents for each member of staff (contracts, right-to-work checks and so on).
// People with "staff.manage" (HR) upload and manage them; the employee can see the ones HR has
// shared with them. Nobody else can. Files live in DATA_DIR/staff-files, the list in staff-files.json.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");
const workplace = require("./workplace");
const datafile = require("./datafile");

const CATEGORIES = ["Contract", "Right to work", "ID", "Qualifications", "Letters", "Reviews", "Other"];
const MANAGE = "staff.manage";

let db;
let dir;

function init(dataDir) {
  db = datafile.open(dataDir, "staff-files.json", () => ({ files: [] }));
  dir = path.join(dataDir, "staff-files");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function canManage(viewer) {
  return store.can(viewer, MANAGE);
}

function upload(person, meta, buffer, by) {
  if (!person || person.system) throw new store.ValidationError("Choose a member of staff.");
  const fileName = str(meta.fileName, 200);
  const ext = workplace.fileExt(fileName);
  if (!workplace.FILE_TYPES[ext]) throw new store.ValidationError("That file type isn't supported. Upload a PDF, Word, Excel, PowerPoint, text, CSV or image file.");
  if (!buffer.length) throw new store.ValidationError("That file is empty.");
  const title = str(meta.title, 150) || fileName.replace(/\.[^.]+$/, "");
  const f = {
    id: crypto.randomBytes(8).toString("hex"),
    personId: person.id,
    title,
    category: CATEGORIES.includes(meta.category) ? meta.category : "Other",
    note: str(meta.note, 500),
    shared: meta.shared !== false,
    fileName: workplace.cleanFileName(fileName),
    ext,
    size: buffer.length,
    uploadedBy: by.id,
    uploadedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, f.id), buffer, { mode: 0o600 });
  db.data.files.push(f);
  db.save();
  return f;
}

function getFile(id) {
  return db.data.files.find((f) => f.id === id) || null;
}

function canSee(viewer, f) {
  return canManage(viewer) || (f.personId === viewer.id && f.shared);
}

function update(f, input) {
  if ("title" in input) f.title = str(input.title, 150) || f.title;
  if ("category" in input && CATEGORIES.includes(input.category)) f.category = input.category;
  if ("note" in input) f.note = str(input.note, 500);
  if ("shared" in input) f.shared = !!input.shared;
  db.save();
}

function remove(f) {
  db.data.files = db.data.files.filter((x) => x.id !== f.id);
  fs.rmSync(path.join(dir, f.id), { force: true });
  db.save();
}

function fileFor(f) {
  const type = workplace.FILE_TYPES[f.ext] || { mime: "application/octet-stream", inline: false };
  return { path: path.join(dir, f.id), name: f.fileName, mime: type.mime, inline: type.inline };
}

function view(f) {
  const by = store.getPerson(f.uploadedBy);
  return { ...f, uploadedByName: by ? by.displayName : "Former staff", inline: !!(workplace.FILE_TYPES[f.ext] || {}).inline };
}

function forPerson(personId, viewer) {
  return db.data.files.filter((f) => f.personId === personId && canSee(viewer, f))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).map(view);
}

function counts() {
  const out = {};
  for (const f of db.data.files) out[f.personId] = (out[f.personId] || 0) + 1;
  return out;
}

module.exports = { CATEGORIES, init, canManage, upload, getFile, canSee, update, remove, fileFor, forPerson, counts };
