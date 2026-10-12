// Engagement pulse: one quick anonymous question a week ("How's work this week?", 1–5 and an
// optional comment). Scores are stored as counts only, never against a person; a keyed hash of
// who has answered stops people answering twice. Leadership (people who post announcements or
// manage staff) see the trend, overall and per company (when 3 or more people from it answered).
// Stored in DATA_DIR/pulse.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const QUESTIONS = [
  "How are you feeling about work this week?",
  "How manageable has your workload been this week?",
  "How supported do you feel by your team?",
  "How clear are you on what's expected of you?",
  "How likely are you to recommend HN Group as a place to work?",
  "How well is communication working across the company?",
];
const MIN_GROUP = 3;

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "pulse.json", () => ({ weeks: {}, secret: crypto.randomBytes(32).toString("hex"), custom: {} }));
}

function canSeeResults(viewer) {
  return store.can(viewer, "announcements.manage") || store.can(viewer, "staff.manage");
}

// ISO week, e.g. 2026-W42.
function weekOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function currentWeek() {
  return weekOf(new Date());
}

function questionFor(week) {
  if (db.data.custom[week]) return db.data.custom[week];
  const n = Number(week.slice(-2)) + Number(week.slice(0, 4));
  return QUESTIONS[n % QUESTIONS.length];
}

function marker(personId, week) {
  return crypto.createHmac("sha256", db.data.secret).update(personId + ":" + week).digest("hex").slice(0, 24);
}

function weekData(week) {
  return db.data.weeks[week] || (db.data.weeks[week] = { question: questionFor(week), counts: [0, 0, 0, 0, 0], byCompany: {}, answered: [], comments: [] });
}

function hasAnswered(person, week) {
  const w = db.data.weeks[week || currentWeek()];
  return !!w && w.answered.includes(marker(person.id, week || currentWeek()));
}

function answer(person, input) {
  if (person.system) throw new store.ValidationError("The admin account can't answer the pulse.");
  const week = currentWeek();
  if (hasAnswered(person, week)) throw new store.ValidationError("You've already answered this week. Thank you!");
  const score = Math.round(Number(input.score));
  if (!(score >= 1 && score <= 5)) throw new store.ValidationError("Choose a score from 1 to 5.");
  const w = weekData(week);
  w.counts[score - 1]++;
  const c = w.byCompany[person.company] || (w.byCompany[person.company] = [0, 0, 0, 0, 0]);
  c[score - 1]++;
  w.answered.push(marker(person.id, week));
  const comment = String(input.comment || "").trim().slice(0, 500);
  // Comments are kept in a random order so they can't be matched to when someone answered.
  if (comment) w.comments.splice(Math.floor(Math.random() * (w.comments.length + 1)), 0, comment);
  db.save();
}

function setQuestion(text) {
  const t = String(text || "").trim().slice(0, 200);
  const week = currentWeek();
  const w = db.data.weeks[week];
  if (w && w.answered.length) throw new store.ValidationError("People have already answered this week's question, so it can't be changed now.");
  if (t) db.data.custom[week] = t; else delete db.data.custom[week];
  if (w) w.question = questionFor(week);
  db.save();
}

const avg = (counts) => {
  const n = counts.reduce((a, b) => a + b, 0);
  return n ? Math.round((counts.reduce((s, c, i) => s + c * (i + 1), 0) / n) * 10) / 10 : null;
};

function results(weeks) {
  const keys = Object.keys(db.data.weeks).sort().slice(-(weeks || 12));
  return keys.map((k) => {
    const w = db.data.weeks[k];
    const n = w.counts.reduce((a, b) => a + b, 0);
    return {
      week: k, question: w.question, responses: n, average: avg(w.counts), counts: w.counts,
      byCompany: Object.entries(w.byCompany).filter(([, c]) => c.reduce((a, b) => a + b, 0) >= MIN_GROUP).map(([company, c]) => ({ company, average: avg(c), responses: c.reduce((a, b) => a + b, 0) })),
      comments: n >= MIN_GROUP ? w.comments : [],
    };
  });
}

function forViewer(viewer) {
  const week = currentWeek();
  const out = { week, question: questionFor(week), answered: viewer.system ? true : hasAnswered(viewer, week), canSeeResults: canSeeResults(viewer), minGroup: MIN_GROUP };
  if (out.canSeeResults) out.results = results(12);
  return out;
}

module.exports = { QUESTIONS, init, currentWeek, answer, setQuestion, forViewer, hasAnswered, canSeeResults };
