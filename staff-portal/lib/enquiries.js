// Website enquiries: messages sent from the contact forms on the group's websites. People with
// "enquiries.manage" see them under Support → Website enquiries, assign them, add notes and mark
// them as dealt with. Replies are sent from people's own email, so nothing is emailed from here.
// Support requests (the user's request, 30 October 2026: support moved from support.hngroup.org.uk
// into hngroup.org.uk, network.hngroup.org.uk, media and development) are enquiries of kind "support":
// the person gets a private reference (only its hash is kept) to read replies and answer on the website.
// Stored in DATA_DIR/enquiries.json.

const fs = require("fs");
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
// What the person sees on the website for each status.
const PUBLIC_STATUS = { new: "Received", open: "In progress", done: "Resolved" };
// Where a support request was sent from.
const SITES = { website: "HN Group", network: "Horizon Network", media: "Horizon Media Group", development: "Horizon Development", careers: "HN Group Careers" };
const SUPPORT_TOPICS = {
  account: "My HN Group account or sign-in",
  website: "A website or online service",
  apps: "HN Browser, Secure Network or App Manager",
  project: "A project or service we provide",
  billing: "Invoices and payments",
  other: "Something else",
};
const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "enquiries.json", () => ({ enquiries: [] }));
  importOldSupport();
}

// Once: requests from the retired support.hngroup.org.uk keep working with their existing references
// (that site stored the same SHA-256 hash of each reference).
function importOldSupport() {
  const file = process.env.SUPPORT_IMPORT_FILE || "/var/lib/hn-support/records.json";
  if (db.data.supportImported) return;
  let old;
  try { old = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return; }
  for (const t of Array.isArray(old.tickets) ? old.tickets : []) {
    if (!/^[a-f0-9]{64}$/.test(t.tracking || "") || db.data.enquiries.some((e) => e.reference === t.tracking)) continue;
    const messages = (Array.isArray(t.messages) ? t.messages : []).map((m) => ({ id: newId(), from: m.by === "customer" ? "customer" : "staff", byName: m.by === "customer" ? "" : "HN Group support", text: str(m.body, 5000), at: m.at }));
    db.data.enquiries.push({
      id: newId(), kind: "support", reference: t.tracking, name: str(t.name, 120), email: str(t.email, 160), phone: "", organisation: "",
      topic: "other", subject: str(t.subject, 160), site: "website", company: "", message: messages[0] ? messages[0].text : "",
      messages: messages.slice(1), status: t.status === "resolved" ? "done" : t.status === "in-progress" ? "open" : "new",
      assigneeId: null, notes: [], createdAt: t.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), ip: "",
    });
  }
  db.data.supportImported = new Date().toISOString();
  db.save();
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

// A support request from one of the websites. Returns the request and its private reference (shown once).
function createSupport(input, ip) {
  const name = str(input.name, 120), email = str(input.email, 160), subject = str(input.subject, 160), message = str(input.message, 5000);
  if (!name) throw new store.ValidationError("Please enter your name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new store.ValidationError("Please enter a valid email address.");
  if (!subject) throw new store.ValidationError("Please give your request a subject.");
  if (message.length < 10) throw new store.ValidationError("Please tell us a little more about what you need.");
  const reference = crypto.randomBytes(32).toString("hex");
  const e = {
    id: newId(), kind: "support", reference: hash(reference), name, email, phone: str(input.phone, 40), organisation: str(input.organisation, 120),
    topic: SUPPORT_TOPICS[input.topic] ? input.topic : "other", subject, site: SITES[input.site] ? input.site : "website", company: "",
    message, messages: [], status: looksLikeSpam(input, message) ? "spam" : "new", assigneeId: null, notes: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ip: str(ip, 60),
  };
  db.data.enquiries.push(e);
  if (db.data.enquiries.length > 5000) db.data.enquiries.splice(0, db.data.enquiries.length - 5000);
  db.save();
  return { request: e, reference };
}

function byReference(reference) {
  if (!/^[a-f0-9]{64}$/.test(String(reference || ""))) return null;
  const h = hash(reference);
  return db.data.enquiries.find((e) => e.kind === "support" && e.reference && e.reference.length === h.length && crypto.timingSafeEqual(Buffer.from(e.reference), Buffer.from(h)) && e.status !== "spam") || null;
}

// What the person sees with their reference: never staff notes, assignees or anything internal.
function publicView(e) {
  return {
    subject: e.subject, topic: SUPPORT_TOPICS[e.topic] || "Support request", site: SITES[e.site] || "HN Group", status: PUBLIC_STATUS[e.status] || "Received",
    resolved: e.status === "done", createdAt: e.createdAt,
    messages: [{ from: "you", text: e.message, at: e.createdAt }].concat((e.messages || []).map((m) => ({ from: m.from === "customer" ? "you" : "staff", byName: m.from === "customer" ? "" : m.byName || "HN Group support", text: m.text, at: m.at }))),
  };
}

function customerReply(e, text) {
  text = str(text, 5000);
  if (!text) throw new store.ValidationError("Write your reply first.");
  if ((e.messages || []).length >= 200) throw new store.ValidationError("This request is too long to add to. Please start a new one.");
  e.messages = e.messages || [];
  e.messages.push({ id: newId(), from: "customer", text, at: new Date().toISOString() });
  if (e.status === "done") e.status = "open";
  e.updatedAt = new Date().toISOString();
  db.save();
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
  const reply = str(input.reply, 5000);
  if (reply && e.kind === "support") {
    e.messages = e.messages || [];
    e.messages.push({ id: newId(), from: "staff", by: by.id, byName: by.displayName, text: reply, at: new Date().toISOString() });
    if (e.status === "new") e.status = "open";
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
  const { reference, ...rest } = e;
  return {
    ...rest, kind: e.kind || "enquiry", topicLabel: e.kind === "support" ? SUPPORT_TOPICS[e.topic] || "Support request" : TOPICS[e.topic], statusLabel: STATUSES[e.status], assigneeName: nameOf(e.assigneeId),
    siteLabel: SITES[e.site] || "", messages: (e.messages || []).map((m) => ({ ...m, byName: m.from === "customer" ? e.name : m.byName || nameOf(m.by) || "HN Group support" })),
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

module.exports = { MANAGE, TOPICS, STATUSES, SITES, SUPPORT_TOPICS, init, create, createSupport, byReference, publicView, customerReply, get, update, remove, view, list, newCount, prune };
