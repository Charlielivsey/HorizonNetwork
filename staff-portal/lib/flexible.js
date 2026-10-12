// Flexible working requests. Staff ask for a change to how they work — different hours, remote
// days, compressed hours or anything else. HR (staff.manage) or the person's supervisor decide,
// and must give a reason when saying no. In the UK employers have two months to decide, so the
// decision date is shown. Stored in DATA_DIR/flexible.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const TYPES = {
  hours: "Change of hours",
  remote: "Working from home / hybrid",
  compressed: "Compressed hours",
  parttime: "Part time",
  times: "Different start and finish times",
  other: "Something else",
};
const STATUSES = { pending: "Waiting for a decision", approved: "Approved", trial: "Agreed on trial", declined: "Declined", withdrawn: "Withdrawn" };
const DECIDE_WITHIN_DAYS = 61;

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "flexible.json", () => ({ requests: [] }));
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function canDecide(viewer, r) {
  const p = store.getPerson(r.personId);
  if (viewer.id === r.personId) return store.isOwner(viewer);
  return store.can(viewer, "staff.manage") || (p && store.supervises(viewer, p));
}

function create(person, input) {
  if (person.system) throw new store.ValidationError("The admin account can't make requests.");
  const requested = str(input.requested, 2000);
  if (!requested) throw new store.ValidationError("Describe the working pattern you'd like.");
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(input.startDate || "") ? input.startDate : null;
  if (!startDate) throw new store.ValidationError("Choose when you'd like it to start.");
  const createdAt = new Date().toISOString();
  const r = {
    id: newId(), personId: person.id, type: TYPES[input.type] ? input.type : "other",
    current: str(input.current, 1000), requested, reason: str(input.reason, 2000), impact: str(input.impact, 2000), startDate,
    status: "pending", createdAt, decideBy: new Date(Date.now() + DECIDE_WITHIN_DAYS * 86400000).toISOString().slice(0, 10),
    decidedBy: null, decidedAt: null, decisionNote: "", trialUntil: null, comments: [],
  };
  db.data.requests.push(r);
  db.save();
  return r;
}

function get(id) {
  return db.data.requests.find((r) => r.id === id) || null;
}

function decide(r, input, by) {
  if (r.status !== "pending") throw new store.ValidationError("That request has already been decided.");
  if (!canDecide(by, r)) throw new store.ValidationError("You can't decide this request.");
  const status = ["approved", "trial", "declined"].includes(input.status) ? input.status : null;
  if (!status) throw new store.ValidationError("Choose a decision.");
  const note = str(input.note, 2000);
  if (status === "declined" && !note) throw new store.ValidationError("Give the business reason for declining.");
  if (status === "trial") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.trialUntil || "")) throw new store.ValidationError("Choose when the trial ends.");
    r.trialUntil = input.trialUntil;
  }
  Object.assign(r, { status, decisionNote: note, decidedBy: by.id, decidedAt: new Date().toISOString() });
  db.save();
}

function withdraw(r, by) {
  if (r.personId !== by.id) throw new store.ValidationError("Only the person who asked can withdraw it.");
  if (r.status !== "pending") throw new store.ValidationError("Only requests waiting for a decision can be withdrawn.");
  r.status = "withdrawn";
  db.save();
}

function comment(r, by, text) {
  const t = str(text, 1500);
  if (!t) throw new store.ValidationError("Write a comment first.");
  r.comments.push({ by: by.id, text: t, at: new Date().toISOString() });
  db.save();
}

const brief = (id) => { const p = id ? store.getPerson(id) : null; return p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl } : { displayName: "Former staff" }; };

function view(r, viewer) {
  return {
    ...r, typeLabel: TYPES[r.type], statusLabel: STATUSES[r.status], person: brief(r.personId),
    decidedByName: r.decidedBy ? brief(r.decidedBy).displayName : null,
    comments: r.comments.map((c) => ({ ...c, author: brief(c.by) })),
    canDecide: r.status === "pending" && canDecide(viewer, r), mine: r.personId === viewer.id,
    overdue: r.status === "pending" && r.decideBy < new Date().toISOString().slice(0, 10),
  };
}

function canSee(viewer, r) {
  return r.personId === viewer.id || canDecide(viewer, r) || store.can(viewer, "staff.manage");
}

function forViewer(viewer) {
  const mine = db.data.requests.filter((r) => r.personId === viewer.id).map((r) => view(r, viewer));
  const others = db.data.requests.filter((r) => r.personId !== viewer.id && canSee(viewer, r)).map((r) => view(r, viewer));
  return { mine: mine.reverse(), others: others.reverse(), types: TYPES, statuses: STATUSES };
}

function pendingCount(viewer) {
  return db.data.requests.filter((r) => r.status === "pending" && r.personId !== viewer.id && canDecide(viewer, r)).length;
}

module.exports = { TYPES, STATUSES, init, create, get, decide, withdraw, comment, view, canSee, forViewer, pendingCount };
