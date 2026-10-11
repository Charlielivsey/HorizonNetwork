// Ideas box. Anyone can suggest an improvement (optionally anonymously), vote for ideas and comment.
// Leadership (people who post announcements) set each idea's status — under review, planned, done
// or declined — with a note, and the person who suggested it is told. Stored in DATA_DIR/ideas.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const MANAGE = "announcements.manage";
const STATUSES = { new: "New", review: "Under review", planned: "Planned", progress: "In progress", done: "Done", declined: "Not going ahead" };
const CATEGORIES = { workplace: "Workplace", process: "How we work", tech: "Tech & tools", wellbeing: "Wellbeing", customers: "Customers", other: "Other" };

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "ideas.json", () => ({ ideas: [] }));
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function brief(id) {
  const p = id ? store.getPerson(id) : null;
  return p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl } : { displayName: "Former staff" };
}

function create(person, input) {
  if (person.system) throw new store.ValidationError("The admin account can't post ideas.");
  const title = str(input.title, 150);
  if (!title) throw new store.ValidationError("Give your idea a short title.");
  const now = new Date().toISOString();
  const idea = {
    id: newId(), by: person.id, anonymous: !!input.anonymous, title, body: str(input.body, 3000),
    category: CATEGORIES[input.category] ? input.category : "other",
    status: "new", statusNote: "", statusBy: null, statusAt: null,
    votes: [person.id], comments: [], createdAt: now, updatedAt: now,
  };
  db.data.ideas.push(idea);
  db.save();
  return idea;
}

function get(id) {
  return db.data.ideas.find((i) => i.id === id) || null;
}

function vote(idea, person) {
  if (idea.status === "done" || idea.status === "declined") throw new store.ValidationError("Voting has closed on this idea.");
  const i = idea.votes.indexOf(person.id);
  if (i === -1) idea.votes.push(person.id); else idea.votes.splice(i, 1);
  db.save();
}

function comment(idea, person, text) {
  const t = str(text, 1500);
  if (!t) throw new store.ValidationError("Write a comment first.");
  idea.comments.push({ id: newId(), by: person.id, text: t, at: new Date().toISOString() });
  idea.updatedAt = new Date().toISOString();
  db.save();
}

function setStatus(idea, status, note, by) {
  if (!STATUSES[status]) throw new store.ValidationError("Choose a status.");
  idea.status = status;
  idea.statusNote = str(note, 1000);
  idea.statusBy = by.id;
  idea.statusAt = new Date().toISOString();
  idea.updatedAt = idea.statusAt;
  db.save();
}

function canDelete(viewer, idea) {
  return store.can(viewer, MANAGE) || (idea.by === viewer.id && idea.status === "new");
}

function remove(idea) {
  db.data.ideas = db.data.ideas.filter((i) => i.id !== idea.id);
  db.save();
}

function view(idea, viewer) {
  return {
    id: idea.id, title: idea.title, body: idea.body, category: idea.category, categoryLabel: CATEGORIES[idea.category],
    status: idea.status, statusLabel: STATUSES[idea.status], statusNote: idea.statusNote, statusByName: idea.statusBy ? brief(idea.statusBy).displayName : null, statusAt: idea.statusAt,
    // Anonymous ideas never reveal who posted them, not even to managers.
    author: idea.anonymous ? null : brief(idea.by), mine: idea.by === viewer.id,
    votes: idea.votes.length, voted: idea.votes.includes(viewer.id),
    comments: idea.comments.map((c) => ({ ...c, author: brief(c.by), mine: c.by === viewer.id })),
    createdAt: idea.createdAt, updatedAt: idea.updatedAt,
    canDelete: canDelete(viewer, idea),
  };
}

function list(viewer) {
  return db.data.ideas.map((i) => view(i, viewer));
}

function newCount() {
  return db.data.ideas.filter((i) => i.status === "new").length;
}

function countBetween(from, to) {
  return db.data.ideas.filter((i) => i.createdAt.slice(0, 10) >= from && i.createdAt.slice(0, 10) <= to).length;
}

module.exports = { MANAGE, STATUSES, CATEGORIES, init, create, get, vote, comment, setStatus, canDelete, remove, view, list, newCount, countBetween };
