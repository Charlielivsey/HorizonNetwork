// Q&A board. Anyone asks a question, anyone answers, people vote answers up, and the person who
// asked (or a moderator) marks the best one, which is pinned to the top. Over time it builds a
// searchable list of answers. Stored in DATA_DIR/qa.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const MODERATE = "announcements.manage";

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "qa.json", () => ({ questions: [] }));
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const brief = (id) => { const p = id ? store.getPerson(id) : null; return p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl } : { displayName: "Former staff" }; };

function tagsOf(v) {
  return [...new Set(String(v || "").split(/[,#]/).map((t) => t.trim().toLowerCase().replace(/[^a-z0-9 \-]/g, "").slice(0, 30)).filter(Boolean))].slice(0, 5);
}

function ask(person, input) {
  if (person.system) throw new store.ValidationError("The admin account can't ask questions.");
  const title = str(input.title, 200);
  if (title.length < 8) throw new store.ValidationError("Write your question (at least a few words).");
  const q = { id: newId(), by: person.id, title, body: str(input.body, 5000), tags: tagsOf(input.tags), answers: [], acceptedId: null, createdAt: new Date().toISOString(), views: 0 };
  db.data.questions.push(q);
  db.save();
  return q;
}

function get(id) {
  return db.data.questions.find((q) => q.id === id) || null;
}

function answer(q, person, body) {
  if (person.system) throw new store.ValidationError("The admin account can't answer.");
  const t = str(body, 5000);
  if (!t) throw new store.ValidationError("Write your answer first.");
  const a = { id: newId(), by: person.id, body: t, votes: [], at: new Date().toISOString() };
  q.answers.push(a);
  db.save();
  return a;
}

function vote(q, answerId, person) {
  const a = q.answers.find((x) => x.id === answerId);
  if (!a) throw new store.ValidationError("That answer has gone.");
  if (a.by === person.id) throw new store.ValidationError("You can't vote for your own answer.");
  const i = a.votes.indexOf(person.id);
  if (i === -1) a.votes.push(person.id); else a.votes.splice(i, 1);
  db.save();
}

function accept(q, answerId, person) {
  if (q.by !== person.id && !store.can(person, MODERATE)) throw new store.ValidationError("Only the person who asked can pick the best answer.");
  q.acceptedId = q.acceptedId === answerId ? null : answerId;
  db.save();
}

function canEdit(person, item) {
  return item.by === person.id || store.can(person, MODERATE);
}

function removeQuestion(q, person) {
  if (!canEdit(person, q)) throw new store.ValidationError("You can't delete that.");
  db.data.questions = db.data.questions.filter((x) => x.id !== q.id);
  db.save();
}

function removeAnswer(q, answerId, person) {
  const a = q.answers.find((x) => x.id === answerId);
  if (!a || !canEdit(person, a)) throw new store.ValidationError("You can't delete that.");
  q.answers = q.answers.filter((x) => x.id !== answerId);
  if (q.acceptedId === answerId) q.acceptedId = null;
  db.save();
}

function view(q, viewer, full) {
  const out = {
    id: q.id, title: q.title, tags: q.tags, author: brief(q.by), createdAt: q.createdAt, answerCount: q.answers.length, solved: !!q.acceptedId,
    mine: q.by === viewer.id, canDelete: canEdit(viewer, q), canAccept: q.by === viewer.id || store.can(viewer, MODERATE),
    snippet: q.body.slice(0, 160),
  };
  if (full) {
    out.body = q.body;
    out.answers = q.answers.map((a) => ({ id: a.id, body: a.body, at: a.at, author: brief(a.by), votes: a.votes.length, voted: a.votes.includes(viewer.id), accepted: a.id === q.acceptedId, mine: a.by === viewer.id, canDelete: canEdit(viewer, a) }))
      .sort((a, b) => b.accepted - a.accepted || b.votes - a.votes || a.at.localeCompare(b.at));
  }
  return out;
}

function list(viewer) {
  return db.data.questions.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((q) => view(q, viewer));
}

function search(text) {
  const t = String(text || "").toLowerCase();
  return db.data.questions.filter((q) => (q.title + " " + q.body + " " + q.tags.join(" ") + " " + q.answers.map((a) => a.body).join(" ")).toLowerCase().includes(t));
}

module.exports = { init, ask, get, answer, vote, accept, removeQuestion, removeAnswer, view, list, search };
