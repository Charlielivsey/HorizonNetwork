// Probation and reviews. Each employee's probation ends three months after their start date
// unless HR sets another date; supervisors and HR record reviews (probation, annual, 1-to-1),
// and can share them with the employee. Reminders show when a probation end or next review is
// coming up. Stored in DATA_DIR/reviews.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const TYPES = { probation: "Probation review", annual: "Annual review", "one-to-one": "1-to-1", other: "Other" };
const OUTCOMES = { passed: "Passed probation", extended: "Probation extended", failed: "Did not pass probation" };
const PROBATION_MONTHS = 3;
const REMIND_DAYS = 14;

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "reviews.json", () => ({ probation: {}, reviews: [] }));
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);

function validDay(v, label, optional) {
  const s = String(v || "").trim();
  if (!s && optional) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s + "T00:00:00Z"))) throw new store.ValidationError(`Choose a valid ${label}.`);
  return s;
}

function addMonths(date, n) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

function daysUntil(date) {
  return Math.round((Date.parse(date + "T12:00:00Z") - Date.parse(today() + "T12:00:00Z")) / 86400000);
}

// HR (staff managers) and the person's supervisor can see and write their reviews.
function canManage(viewer, person) {
  if (!person || person.system) return false;
  if (viewer.id === person.id) return store.isOwner(viewer);
  return store.can(viewer, "staff.manage") || store.supervises(viewer, person);
}

function probationOf(person) {
  const saved = db.data.probation[person.id];
  const start = person.startDate || null;
  const endDate = saved && saved.endDate ? saved.endDate : start ? addMonths(start, PROBATION_MONTHS) : null;
  const status = saved && saved.status ? saved.status : endDate ? (endDate < today() ? "due" : "in-progress") : "unknown";
  return { endDate, status, custom: !!(saved && saved.endDate), startDate: start };
}

function setProbation(person, input) {
  const status = ["in-progress", "passed", "extended", "failed", "none"].includes(input.status) ? input.status : "in-progress";
  db.data.probation[person.id] = { endDate: validDay(input.endDate, "probation end date", status === "none"), status, updatedAt: new Date().toISOString() };
  db.save();
}

function saveReview(person, input, by) {
  const type = TYPES[input.type] ? input.type : "one-to-one";
  const review = {
    id: newId(),
    personId: person.id,
    type,
    date: validDay(input.date || today(), "review date"),
    reviewerId: by.id,
    summary: str(input.summary, 3000),
    strengths: str(input.strengths, 2000),
    improvements: str(input.improvements, 2000),
    rating: input.rating ? Math.max(1, Math.min(5, Math.round(Number(input.rating)) || 0)) || null : null,
    outcome: type === "probation" && OUTCOMES[input.outcome] ? input.outcome : null,
    nextReviewDate: validDay(input.nextReviewDate, "next review date", true),
    shared: !!input.shared,
    createdAt: new Date().toISOString(),
  };
  if (!review.summary) throw new store.ValidationError("Write a summary of the review.");
  // A probation review's outcome updates the probation record.
  if (review.outcome) {
    const current = probationOf(person);
    const ext = review.outcome === "extended" ? validDay(input.extendTo, "new probation end date") : current.endDate;
    db.data.probation[person.id] = { endDate: ext, status: review.outcome, updatedAt: review.createdAt };
  }
  db.data.reviews.push(review);
  db.save();
  return review;
}

function getReview(id) {
  return db.data.reviews.find((r) => r.id === id) || null;
}

function deleteReview(r) {
  db.data.reviews = db.data.reviews.filter((x) => x.id !== r.id);
  db.save();
}

function setShared(r, shared) {
  r.shared = !!shared;
  db.save();
}

function brief(p) {
  return p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl } : { displayName: "Former staff" };
}

function reviewView(r) {
  return { ...r, typeLabel: TYPES[r.type], outcomeLabel: r.outcome ? OUTCOMES[r.outcome] : null, reviewer: brief(store.getPerson(r.reviewerId)) };
}

function nextReview(personId) {
  const list = db.data.reviews.filter((r) => r.personId === personId).sort((a, b) => b.date.localeCompare(a.date));
  return list.length ? list[0].nextReviewDate : null;
}

// Everyone the viewer manages, with their probation and review dates.
function team(viewer) {
  return store.employees().filter((p) => canManage(viewer, p)).map((p) => {
    const prob = probationOf(p);
    const next = nextReview(p.id);
    const last = db.data.reviews.filter((r) => r.personId === p.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    return { person: brief(p), probation: prob, nextReviewDate: next, lastReview: last ? { date: last.date, typeLabel: TYPES[last.type] } : null, reviewCount: db.data.reviews.filter((r) => r.personId === p.id).length };
  }).sort((a, b) => a.person.displayName.localeCompare(b.person.displayName));
}

// Probations ending and reviews due within two weeks (or overdue), for people the viewer manages.
function due(viewer) {
  const out = [];
  for (const t of team(viewer)) {
    const p = t.probation;
    if (p.endDate && (p.status === "in-progress" || p.status === "due" || p.status === "extended") && daysUntil(p.endDate) <= REMIND_DAYS) {
      out.push({ kind: "probation", person: t.person, date: p.endDate, days: daysUntil(p.endDate) });
    }
    if (t.nextReviewDate && daysUntil(t.nextReviewDate) <= REMIND_DAYS) out.push({ kind: "review", person: t.person, date: t.nextReviewDate, days: daysUntil(t.nextReviewDate) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function forPerson(person, viewer) {
  const manager = canManage(viewer, person);
  return db.data.reviews.filter((r) => r.personId === person.id && (manager || r.shared))
    .sort((a, b) => b.date.localeCompare(a.date)).map(reviewView);
}

module.exports = { TYPES, OUTCOMES, init, canManage, probationOf, setProbation, saveReview, getReview, deleteReview, setShared, team, due, forPerson };
