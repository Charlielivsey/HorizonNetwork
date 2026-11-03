// Website enquiries: messages sent from the contact form on hngroup.org.uk. People with
// "enquiries.manage" see them under Support → Website enquiries, assign them, add notes and mark
// them as dealt with. Replies are sent from people's own email, so nothing is emailed from here.
// Stored in DATA_DIR/enquiries.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const MANAGE = "enquiries.manage";
const TOPICS = {
  general: "General enquiry",
  services: "Working with us",
  advertising: "Advertising",
  development: "Software development",
  hosting: "Hosting & infrastructure",
  media: "Media & press",
  careers: "Careers",
  other: "Something else",
};
const STATUSES = { new: "New", open: "In progress", done: "Dealt with", spam: "Spam" };

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "enquiries.json", () => ({ enquiries: [] }));
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const nameOf = (id) => { const p = id ? store.getPerson(id) : null; return p ? p.displayName : null; };

// Simple spam signals: lots of links, or the hidden "website" field (only bots fill it in).
function looksLikeSpam(input, message) {
  if (str(input.website, 200)) return true;
  return (message.match(/https?:\/\//g) || []).length > 3;
}

function create(input, ip) {
  const name = str(input.name, 120);
  const email = str(input.email, 160);
  const message = str(input.message, 5000);
  if (!name) throw new store.ValidationError("Please enter your name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new store.ValidationError("Please enter a valid email address.");
  if (message.length < 10) throw new store.ValidationError("Please write a little more about what you need.");
  const e = {
    id: newId(), name, email, phone: str(input.phone, 40), organisation: str(input.organisation, 120),
    topic: TOPICS[input.topic] ? input.topic : "general",
    company: store.COMPANIES.includes(input.company) ? input.company : "",
    message, status: looksLikeSpam(input, message) ? "spam" : "new", assigneeId: null, notes: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ip: str(ip, 60),
  };
  db.data.enquiries.push(e);
  if (db.data.enquiries.length > 5000) db.data.enquiries.splice(0, db.data.enquiries.length - 5000);
  db.save();
  return e;
}

function get(id) {
  return db.data.enquiries.find((e) => e.id === id) || null;
}

function update(e, input, by) {
  if (input.status && STATUSES[input.status]) e.status = input.status;
  if ("assigneeId" in input) {
    const p = input.assigneeId ? store.getPerson(input.assigneeId) : null;
    e.assigneeId = p && store.can(p, MANAGE) ? p.id : null;
    if (e.assigneeId && e.status === "new") e.status = "open";
  }
  const note = str(input.note, 3000);
  if (note) {
    e.notes.push({ id: newId(), by: by.id, text: note, at: new Date().toISOString() });
    if (e.status === "new") e.status = "open";
  }
  e.updatedAt = new Date().toISOString();
  db.save();
}

function remove(e) {
  db.data.enquiries = db.data.enquiries.filter((x) => x.id !== e.id);
  db.save();
}

function view(e) {
  return {
    ...e, topicLabel: TOPICS[e.topic], statusLabel: STATUSES[e.status], assigneeName: nameOf(e.assigneeId),
    notes: e.notes.map((n) => ({ ...n, byName: nameOf(n.by) || "Former staff" })),
  };
}

function list() {
  return db.data.enquiries.slice().reverse().map(view);
}

function newCount() {
  return db.data.enquiries.filter((e) => e.status === "new").length;
}

// Data retention: enquiries that were dealt with (or spam) are deleted after a while.
function prune(cutoffIso) {
  const before = db.data.enquiries.length;
  db.data.enquiries = db.data.enquiries.filter((e) => !((e.status === "done" || e.status === "spam") && e.updatedAt < cutoffIso));
  const n = before - db.data.enquiries.length;
  if (n) db.save();
  return n;
}

module.exports = { MANAGE, TOPICS, STATUSES, init, create, get, update, remove, view, list, newCount, prune };
