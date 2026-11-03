// 360 feedback. Before a review, a manager (or the person themselves) asks colleagues for feedback
// on someone. Each reviewer answers a few questions; answers are anonymous — nobody (including the
// manager) sees who said what, and results only show once at least two people have answered.
// Stored in DATA_DIR/feedback.json. Reviewer identities are kept only to stop double answers.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const QUESTIONS = [
  { key: "rating", label: "Overall, how effective is this person in their role?", type: "rating" },
  { key: "strengths", label: "What do they do really well?", type: "text" },
  { key: "improve", label: "What could they do more of, or differently?", type: "text" },
  { key: "teamwork", label: "How well do they work with others?", type: "rating" },
  { key: "other", label: "Anything else you'd like to add?", type: "text", optional: true },
];
const MIN_RESPONSES = 2;

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "feedback.json", () => ({ requests: [] }));
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);

function canRequest(viewer, subject) {
  if (!subject || subject.system) return false;
  return viewer.id === subject.id || store.can(viewer, "staff.manage") || store.supervises(viewer, subject);
}

function create(subject, input, by) {
  if (!canRequest(by, subject)) throw new store.ValidationError("You can't ask for feedback on that person.");
  const reviewers = [...new Set((Array.isArray(input.reviewers) ? input.reviewers : []).filter((id) => id !== subject.id))]
    .filter((id) => { const p = store.getPerson(id); return p && !p.system; }).slice(0, 20);
  if (reviewers.length < MIN_RESPONSES) throw new store.ValidationError(`Choose at least ${MIN_RESPONSES} colleagues to ask, so answers stay anonymous.`);
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate || "") ? input.dueDate : new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const r = {
    id: newId(), subjectId: subject.id, requestedBy: by.id, reviewers, dueDate, note: str(input.note, 500),
    shareWithSubject: input.shareWithSubject !== false, responses: [], answered: [], createdAt: new Date().toISOString(), closed: false,
  };
  db.data.requests.push(r);
  db.save();
  return r;
}

function get(id) {
  return db.data.requests.find((r) => r.id === id) || null;
}

function respond(r, person, answers) {
  if (r.closed) throw new store.ValidationError("This feedback request has closed.");
  if (!r.reviewers.includes(person.id)) throw new store.ValidationError("You weren't asked for feedback on this person.");
  if (r.answered.includes(person.id)) throw new store.ValidationError("You've already given your feedback.");
  const clean = {};
  for (const q of QUESTIONS) {
    const v = answers && answers[q.key];
    if (q.type === "rating") {
      const n = Number(v);
      if (!(n >= 1 && n <= 5)) throw new store.ValidationError(`Choose a rating for “${q.label}”`);
      clean[q.key] = Math.round(n);
    } else {
      const t = str(v, 2000);
      if (!t && !q.optional) throw new store.ValidationError(`Answer “${q.label}”`);
      clean[q.key] = t;
    }
  }
  // Answers are stored without who wrote them, in a shuffled position.
  r.responses.splice(Math.floor(Math.random() * (r.responses.length + 1)), 0, { ...clean, at: today() });
  r.answered.push(person.id);
  db.save();
}

function close(r) {
  r.closed = true;
  db.save();
}

function remove(r) {
  db.data.requests = db.data.requests.filter((x) => x.id !== r.id);
  db.save();
}

function canSeeResults(viewer, r) {
  const subject = store.getPerson(r.subjectId);
  return r.requestedBy === viewer.id || store.can(viewer, "staff.manage") || (subject && store.supervises(viewer, subject)) || (r.shareWithSubject && viewer.id === r.subjectId);
}

const brief = (id) => { const p = id ? store.getPerson(id) : null; return p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl } : { displayName: "Former staff" }; };

function results(r) {
  if (r.responses.length < MIN_RESPONSES) return null;
  const out = {};
  for (const q of QUESTIONS) {
    if (q.type === "rating") {
      const vals = r.responses.map((x) => x[q.key]);
      out[q.key] = { average: Math.round((vals.reduce((n, v) => n + v, 0) / vals.length) * 10) / 10, counts: [1, 2, 3, 4, 5].map((n) => vals.filter((v) => v === n).length) };
    } else {
      out[q.key] = r.responses.map((x) => x[q.key]).filter(Boolean);
    }
  }
  return out;
}

function view(r, viewer) {
  const seeResults = canSeeResults(viewer, r);
  return {
    id: r.id, subject: brief(r.subjectId), requestedBy: brief(r.requestedBy), dueDate: r.dueDate, note: r.note, closed: r.closed, createdAt: r.createdAt,
    asked: r.reviewers.length, answeredCount: r.answered.length, shareWithSubject: r.shareWithSubject,
    // Who has answered is only shown as a count, never names.
    canSeeResults: seeResults, results: seeResults ? results(r) : null, minResponses: MIN_RESPONSES,
    canManage: r.requestedBy === viewer.id || store.can(viewer, "staff.manage"),
    reviewers: seeResults && r.requestedBy === viewer.id ? r.reviewers.map(brief) : undefined,
  };
}

function forViewer(viewer) {
  const toGive = db.data.requests.filter((r) => !r.closed && r.reviewers.includes(viewer.id) && !r.answered.includes(viewer.id))
    .map((r) => ({ id: r.id, subject: brief(r.subjectId), dueDate: r.dueDate, note: r.note, requestedBy: brief(r.requestedBy) }));
  const visible = db.data.requests.filter((r) => canSeeResults(viewer, r)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => view(r, viewer));
  return { toGive, requests: visible, questions: QUESTIONS };
}

function pendingCount(viewer) {
  return db.data.requests.filter((r) => !r.closed && r.reviewers.includes(viewer.id) && !r.answered.includes(viewer.id)).length;
}

module.exports = { QUESTIONS, MIN_RESPONSES, init, canRequest, create, get, respond, close, remove, forViewer, pendingCount, canSeeResults };
