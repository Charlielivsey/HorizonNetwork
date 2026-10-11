// Workplace: announcements and the documents & policies library.
// Stored as JSON in DATA_DIR (announcements.json, documents.json) with uploaded files in DATA_DIR/documents.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");

const CATEGORIES = ["Policies", "Handbooks", "Forms", "Templates", "Guides", "Other"];
const MAX_FILE_BYTES = 20 * 1024 * 1024;

// Allowed uploads, by extension. `inline` files open in the browser; the rest download.
const FILE_TYPES = {
  pdf: { mime: "application/pdf", inline: true },
  png: { mime: "image/png", inline: true },
  jpg: { mime: "image/jpeg", inline: true },
  jpeg: { mime: "image/jpeg", inline: true },
  txt: { mime: "text/plain; charset=utf-8", inline: true },
  csv: { mime: "text/csv; charset=utf-8", inline: false },
  rtf: { mime: "application/rtf", inline: false },
  doc: { mime: "application/msword", inline: false },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", inline: false },
  xls: { mime: "application/vnd.ms-excel", inline: false },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", inline: false },
  ppt: { mime: "application/vnd.ms-powerpoint", inline: false },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", inline: false },
  odt: { mime: "application/vnd.oasis.opendocument.text", inline: false },
  ods: { mime: "application/vnd.oasis.opendocument.spreadsheet", inline: false },
  odp: { mime: "application/vnd.oasis.opendocument.presentation", inline: false },
};

let announcementsFile;
let documentsFile;
let filesDir;
let announcements = [];
let documents = [];

function init(dataDir) {
  announcementsFile = path.join(dataDir, "announcements.json");
  documentsFile = path.join(dataDir, "documents.json");
  filesDir = path.join(dataDir, "documents");
  fs.mkdirSync(filesDir, { recursive: true, mode: 0o700 });
  announcements = fs.existsSync(announcementsFile) ? JSON.parse(fs.readFileSync(announcementsFile, "utf8")) : [];
  documents = fs.existsSync(documentsFile) ? JSON.parse(fs.readFileSync(documentsFile, "utf8")) : [];
  // Update audiences saved under old company names.
  const rename = (items, save) => {
    let changed = false;
    for (const item of items) {
      const next = item.companies.map((c) => store.RENAMED_COMPANIES[c] || c);
      if (next.join() !== item.companies.join()) { item.companies = next; changed = true; }
    }
    if (changed) save();
  };
  rename(announcements, () => writeJson(announcementsFile, announcements));
  rename(documents, () => writeJson(documentsFile, documents));
}

function writeJson(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const saveAnnouncements = () => writeJson(announcementsFile, announcements);
const saveDocuments = () => writeJson(documentsFile, documents);

function str(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

// ---------- Audience ----------

function companiesOf(person) {
  if (person.system) return [];
  return [person.company].concat((person.otherRoles || []).map((r) => r.company));
}

// An item with no companies is for the whole group. People who manage that kind of item see
// everything so they can maintain it.
function canSee(person, item, permission) {
  if (!item.companies.length || store.can(person, permission || "documents.manage")) return true;
  const mine = companiesOf(person);
  return item.companies.some((c) => mine.includes(c));
}

function inAudience(person, item) {
  if (person.system) return false;
  if (!item.companies.length) return true;
  const mine = companiesOf(person);
  return item.companies.some((c) => mine.includes(c));
}

function cleanCompanies(list) {
  return (Array.isArray(list) ? list : []).filter((c, i, arr) => store.COMPANIES.includes(c) && arr.indexOf(c) === i);
}

function authorView(id) {
  const p = id ? store.getPerson(id) : null;
  return p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl } : { displayName: "Former staff" };
}

// ---------- Announcements ----------

const REACTIONS = ["\u{1F44D}", "\u2764\uFE0F", "\u{1F389}", "\u{1F602}", "\u{1F62E}", "\u{1F44F}"];
const MANAGE_ANN = "announcements.manage";

function publishedAt(a) {
  return a.publishAt || a.createdAt;
}

// Scheduled announcements appear at their publish time; expiring ones disappear afterwards.
function annState(a) {
  const now = new Date().toISOString();
  if (publishedAt(a) > now) return "scheduled";
  if (a.expiresAt && a.expiresAt <= now) return "expired";
  return "live";
}

function announcementView(a, person) {
  const manager = store.can(person, MANAGE_ANN);
  const reactions = a.reactions || {};
  const view = {
    id: a.id,
    title: a.title,
    body: a.body,
    companies: a.companies,
    pinned: a.pinned,
    important: a.important,
    allowComments: a.allowComments !== false,
    requireAck: !!a.requireAck,
    author: authorView(a.authorId),
    createdAt: a.createdAt,
    publishAt: publishedAt(a),
    expiresAt: a.expiresAt || null,
    state: annState(a),
    updatedAt: a.updatedAt,
    unread: a.authorId !== person.id && publishedAt(a) > (person.announcementsSeenAt || ""),
    reactions: REACTIONS.map((emoji) => ({
      emoji,
      count: (reactions[emoji] || []).length,
      mine: (reactions[emoji] || []).includes(person.id),
    })),
    comments: (a.comments || []).map((c) => ({
      id: c.id,
      author: authorView(c.authorId),
      body: c.body,
      createdAt: c.createdAt,
      canDelete: c.authorId === person.id || manager,
    })),
    acknowledgedAt: (a.acks || {})[person.id] || null,
    needsAck: !!a.requireAck && inAudience(person, a) && !(a.acks || {})[person.id] && annState(a) === "live",
  };
  if (manager && a.requireAck) {
    const audience = store.employees().filter((p) => inAudience(p, a));
    view.ackCount = audience.filter((p) => (a.acks || {})[p.id]).length;
    view.audienceCount = audience.length;
  }
  return view;
}

function listAnnouncements(person) {
  const manager = store.can(person, MANAGE_ANN);
  return announcements
    .filter((a) => canSee(person, a, MANAGE_ANN) && (manager || annState(a) === "live"))
    .sort((a, b) => (b.pinned - a.pinned) || publishedAt(b).localeCompare(publishedAt(a)))
    .map((a) => announcementView(a, person));
}

function unreadAnnouncements(person) {
  const seen = person.announcementsSeenAt || "";
  return announcements.filter((a) =>
    inAudience(person, a) && annState(a) === "live" && publishedAt(a) > seen && a.authorId !== person.id
  ).length;
}

function optionalTime(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  const t = Date.parse(v);
  if (isNaN(t)) throw new store.ValidationError("Enter a valid date and time.");
  return new Date(t).toISOString();
}

function saveAnnouncement(input, author, existing) {
  const title = str(input.title, 150);
  const body = str(input.body, 10000);
  if (!title) throw new store.ValidationError("Give the announcement a title.");
  if (!body) throw new store.ValidationError("Write the announcement.");
  const now = new Date().toISOString();
  const publishAt = optionalTime(input.publishAt);
  const expiresAt = optionalTime(input.expiresAt);
  if (expiresAt && expiresAt <= (publishAt || now)) throw new store.ValidationError("The expiry time must be after it's published.");
  const fields = {
    title,
    body,
    companies: cleanCompanies(input.companies),
    pinned: !!input.pinned,
    important: !!input.important,
    allowComments: input.allowComments !== false,
    requireAck: !!input.requireAck,
    publishAt: publishAt || (existing ? existing.publishAt || existing.createdAt : now),
    expiresAt,
    updatedAt: now,
  };
  if (existing) {
    Object.assign(existing, fields);
    saveAnnouncements();
    return existing;
  }
  const a = { id: newId(), ...fields, authorId: author.id, createdAt: now, reactions: {}, comments: [], acks: {} };
  announcements.push(a);
  saveAnnouncements();
  return a;
}

function getAnnouncement(id) {
  return announcements.find((a) => a.id === id) || null;
}

// Whether someone (who isn't managing announcements) can see and interact with it right now.
function canReach(person, a) {
  return canSee(person, a, MANAGE_ANN) && (store.can(person, MANAGE_ANN) || annState(a) === "live");
}

function deleteAnnouncement(a) {
  announcements = announcements.filter((x) => x.id !== a.id);
  saveAnnouncements();
}

function toggleReaction(a, person, emoji) {
  if (!REACTIONS.includes(emoji)) throw new store.ValidationError("Pick one of the reactions.");
  a.reactions = a.reactions || {};
  const list = a.reactions[emoji] || [];
  a.reactions[emoji] = list.includes(person.id) ? list.filter((id) => id !== person.id) : list.concat(person.id);
  saveAnnouncements();
}

function addComment(a, person, body) {
  if (a.allowComments === false) throw new store.ValidationError("Comments are turned off for this announcement.");
  const text = str(body, 2000);
  if (!text) throw new store.ValidationError("Write a comment first.");
  a.comments = a.comments || [];
  a.comments.push({ id: newId(), authorId: person.id, body: text, createdAt: new Date().toISOString() });
  saveAnnouncements();
}

function deleteComment(a, person, commentId) {
  const c = (a.comments || []).find((x) => x.id === commentId);
  if (!c) throw new store.ValidationError("That comment no longer exists.");
  if (c.authorId !== person.id && !store.can(person, MANAGE_ANN)) throw new store.ValidationError("You can only delete your own comments.");
  a.comments = a.comments.filter((x) => x.id !== commentId);
  saveAnnouncements();
}

function acknowledgeAnnouncement(a, person) {
  a.acks = a.acks || {};
  a.acks[person.id] = new Date().toISOString();
  saveAnnouncements();
}

function pendingAnnouncementAcks(person) {
  return announcements.filter((a) => a.requireAck && inAudience(person, a) && annState(a) === "live" && !(a.acks || {})[person.id]).length;
}

function announcementAcks(a) {
  return store.employees().filter((p) => inAudience(p, a)).map((p) => ({
    id: p.id,
    displayName: p.displayName,
    jobTitle: p.jobTitle,
    avatarUrl: store.publicView(p).avatarUrl,
    acknowledgedAt: (a.acks || {})[p.id] || null,
  })).sort((x, y) => (!!x.acknowledgedAt - !!y.acknowledgedAt) || x.displayName.localeCompare(y.displayName));
}

// ---------- Documents ----------

function fileExt(name) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(name || ""));
  return m ? m[1].toLowerCase() : "";
}

function cleanFileName(name) {
  return String(name || "document").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 150) || "document";
}

function documentView(d, person) {
  const ack = d.acks[person.id];
  const view = {
    id: d.id,
    title: d.title,
    description: d.description,
    category: d.category,
    companies: d.companies,
    requiresAck: d.requiresAck,
    file: { name: d.file.name, size: d.file.size, ext: d.file.ext, inline: !!(FILE_TYPES[d.file.ext] || {}).inline },
    version: d.version,
    author: authorView(d.authorId),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    acknowledgedAt: ack && ack.version === d.version ? ack.at : null,
    needsAck: d.requiresAck && inAudience(person, d) && !(ack && ack.version === d.version),
  };
  if (store.can(person, "documents.manage") && d.requiresAck) {
    const audience = store.employees().filter((p) => inAudience(p, d));
    view.ackCount = audience.filter((p) => d.acks[p.id] && d.acks[p.id].version === d.version).length;
    view.audienceCount = audience.length;
  }
  return view;
}

function listDocuments(person) {
  return documents
    .filter((d) => canSee(person, d))
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((d) => documentView(d, person));
}

function pendingAcks(person) {
  return documents.filter((d) => {
    const ack = d.acks[person.id];
    return d.requiresAck && inAudience(person, d) && !(ack && ack.version === d.version);
  }).length;
}

function getDocument(id) {
  return documents.find((d) => d.id === id) || null;
}

function validateMeta(input) {
  const title = str(input.title, 150);
  if (!title) throw new store.ValidationError("Give the document a title.");
  const category = CATEGORIES.includes(input.category) ? input.category : "Other";
  return {
    title,
    description: str(input.description, 1000),
    category,
    companies: cleanCompanies(input.companies),
    requiresAck: !!input.requiresAck,
  };
}

function checkFile(fileName, buffer) {
  const ext = fileExt(fileName);
  if (!FILE_TYPES[ext]) {
    throw new store.ValidationError("That file type isn't supported. Upload a PDF, Word, Excel, PowerPoint, text, CSV or image file.");
  }
  if (!buffer.length) throw new store.ValidationError("That file is empty.");
  if (buffer.length > MAX_FILE_BYTES) throw new store.ValidationError("That file is too large (max 20 MB).");
  return ext;
}

function writeFile(doc, buffer, fileName, ext) {
  fs.writeFileSync(path.join(filesDir, doc.id), buffer, { mode: 0o600 });
  doc.file = { name: cleanFileName(fileName), size: buffer.length, ext, uploadedAt: new Date().toISOString() };
}

function createDocument(meta, fileName, buffer, author) {
  const fields = validateMeta(meta);
  const ext = checkFile(fileName, buffer);
  const now = new Date().toISOString();
  const doc = { id: newId(), ...fields, version: 1, acks: {}, authorId: author.id, createdAt: now, updatedAt: now };
  writeFile(doc, buffer, fileName, ext);
  documents.push(doc);
  saveDocuments();
  return doc;
}

function updateDocument(doc, meta) {
  const fields = validateMeta(meta);
  // Turning on "must acknowledge" for an existing document starts a fresh round of sign-offs.
  if (fields.requiresAck && !doc.requiresAck) doc.version++;
  Object.assign(doc, fields, { updatedAt: new Date().toISOString() });
  saveDocuments();
  return doc;
}

// A new file is a new version: everyone has to acknowledge it again.
function replaceFile(doc, fileName, buffer) {
  const ext = checkFile(fileName, buffer);
  writeFile(doc, buffer, fileName, ext);
  doc.version++;
  doc.updatedAt = new Date().toISOString();
  saveDocuments();
  return doc;
}

function deleteDocument(doc) {
  documents = documents.filter((d) => d.id !== doc.id);
  fs.rmSync(path.join(filesDir, doc.id), { force: true });
  saveDocuments();
}

function acknowledge(doc, person) {
  doc.acks[person.id] = { at: new Date().toISOString(), version: doc.version };
  saveDocuments();
}

function acknowledgements(doc) {
  return store.employees().filter((p) => inAudience(p, doc)).map((p) => {
    const ack = doc.acks[p.id];
    return {
      id: p.id,
      displayName: p.displayName,
      jobTitle: p.jobTitle,
      avatarUrl: store.publicView(p).avatarUrl,
      acknowledgedAt: ack && ack.version === doc.version ? ack.at : null,
    };
  }).sort((a, b) => (!!a.acknowledgedAt - !!b.acknowledgedAt) || a.displayName.localeCompare(b.displayName));
}

function fileFor(doc) {
  const type = FILE_TYPES[doc.file.ext] || { mime: "application/octet-stream", inline: false };
  return { path: path.join(filesDir, doc.id), name: doc.file.name, mime: type.mime, inline: type.inline };
}

module.exports = {
  CATEGORIES,
  MAX_FILE_BYTES,
  FILE_TYPES,
  init,
  canSee,
  REACTIONS,
  inAudience,
  annState,
  canReach,
  toggleReaction,
  addComment,
  deleteComment,
  acknowledgeAnnouncement,
  pendingAnnouncementAcks,
  announcementAcks,
  listAnnouncements,
  unreadAnnouncements,
  saveAnnouncement,
  getAnnouncement,
  deleteAnnouncement,
  listDocuments,
  pendingAcks,
  getDocument,
  createDocument,
  updateDocument,
  replaceFile,
  deleteDocument,
  acknowledge,
  acknowledgements,
  fileFor,
  documentView,
};
