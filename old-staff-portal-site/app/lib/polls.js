// Polls & surveys. A poll has one or more questions (single choice, multiple choice, a 1–5 rating
// or a written answer). Anonymous polls never store who gave which answer: who has responded is
// kept separately so nobody can vote twice. Stored in DATA_DIR/polls.json.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");

const QUESTION_TYPES = ["single", "multiple", "rating", "text"];
const MANAGE = "polls.manage";

let pollsFile;
let polls = [];

function init(dataDir) {
  pollsFile = path.join(dataDir, "polls.json");
  polls = fs.existsSync(pollsFile) ? JSON.parse(fs.readFileSync(pollsFile, "utf8")) : [];
}

function save() {
  const tmp = pollsFile + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(polls, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, pollsFile);
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function companiesOf(person) {
  if (person.system) return [];
  return [person.company].concat((person.otherRoles || []).map((r) => r.company));
}

function inAudience(person, poll) {
  if (person.system) return false;
  if (!poll.companies.length) return true;
  return poll.companies.some((c) => companiesOf(person).includes(c));
}

function canSee(person, poll) {
  return store.can(person, MANAGE) || inAudience(person, poll);
}

function isOpen(poll) {
  return !poll.closedAt && (!poll.closesAt || poll.closesAt > new Date().toISOString());
}

function savePoll(input, author, existing) {
  const title = str(input.title, 150);
  if (!title) throw new store.ValidationError("Give the poll a title.");
  const questions = (Array.isArray(input.questions) ? input.questions : []).slice(0, 20).map((q, i) => {
    const text = str(q && q.text, 300);
    const type = QUESTION_TYPES.includes(q && q.type) ? q.type : "single";
    if (!text) throw new store.ValidationError(`Question ${i + 1} needs some text.`);
    let options = [];
    if (type === "single" || type === "multiple") {
      options = (Array.isArray(q.options) ? q.options : []).map((o) => str(o, 120)).filter(Boolean).slice(0, 12);
      if (options.length < 2) throw new store.ValidationError(`Question ${i + 1} needs at least two options.`);
    }
    return { id: (q && q.id) || newId(), text, type, options, required: q.required !== false };
  });
  if (!questions.length) throw new store.ValidationError("Add at least one question.");
  if (existing && existing.responses.length) throw new store.ValidationError("This poll already has answers, so its questions can't be changed.");
  let closesAt = null;
  if (input.closesAt) {
    const t = Date.parse(input.closesAt);
    if (isNaN(t)) throw new store.ValidationError("Enter a valid closing date.");
    closesAt = new Date(t).toISOString();
  }
  const fields = {
    title,
    description: str(input.description, 2000),
    questions,
    anonymous: !!input.anonymous,
    showResults: !!input.showResults,
    companies: (Array.isArray(input.companies) ? input.companies : []).filter((c, i, a) => store.COMPANIES.includes(c) && a.indexOf(c) === i),
    closesAt,
    updatedAt: new Date().toISOString(),
  };
  if (existing) {
    Object.assign(existing, fields);
    save();
    return existing;
  }
  const poll = { id: newId(), ...fields, createdBy: author.id, createdAt: fields.updatedAt, closedAt: null, responses: [], respondents: [] };
  polls.push(poll);
  save();
  return poll;
}

function getPoll(id) {
  return polls.find((p) => p.id === id) || null;
}

function deletePoll(poll) {
  polls = polls.filter((p) => p.id !== poll.id);
  save();
}

function closePoll(poll, closed) {
  poll.closedAt = closed ? new Date().toISOString() : null;
  if (!closed && poll.closesAt && poll.closesAt <= new Date().toISOString()) poll.closesAt = null;
  save();
}

function respond(poll, person, answers) {
  if (!isOpen(poll)) throw new store.ValidationError("This poll has closed.");
  if (!inAudience(person, poll)) throw new store.ValidationError("This poll isn't for you.");
  if (poll.respondents.includes(person.id)) throw new store.ValidationError("You've already answered this poll.");
  const clean = {};
  for (const q of poll.questions) {
    const a = answers ? answers[q.id] : undefined;
    if (q.type === "single") {
      if (!q.options.includes(a)) { if (q.required) throw new store.ValidationError(`Answer “${q.text}”.`); continue; }
      clean[q.id] = a;
    } else if (q.type === "multiple") {
      const picked = (Array.isArray(a) ? a : []).filter((x, i, arr) => q.options.includes(x) && arr.indexOf(x) === i);
      if (!picked.length) { if (q.required) throw new store.ValidationError(`Answer “${q.text}”.`); continue; }
      clean[q.id] = picked;
    } else if (q.type === "rating") {
      const n = Number(a);
      if (!(n >= 1 && n <= 5)) { if (q.required) throw new store.ValidationError(`Rate “${q.text}”.`); continue; }
      clean[q.id] = Math.round(n);
    } else {
      const text = str(a, 2000);
      if (!text) { if (q.required) throw new store.ValidationError(`Answer “${q.text}”.`); continue; }
      clean[q.id] = text;
    }
  }
  // Anonymous answers are stored without a name and in random order, so they can't be matched up.
  const response = { answers: clean, at: poll.anonymous ? null : new Date().toISOString(), personId: poll.anonymous ? null : person.id };
  if (poll.anonymous) poll.responses.splice(crypto.randomInt(poll.responses.length + 1), 0, response);
  else poll.responses.push(response);
  poll.respondents.push(person.id);
  save();
}

function results(poll) {
  return poll.questions.map((q) => {
    const answers = poll.responses.map((r) => ({ value: r.answers[q.id], personId: r.personId })).filter((x) => x.value !== undefined);
    const out = { id: q.id, text: q.text, type: q.type, total: answers.length };
    if (q.type === "single" || q.type === "multiple") {
      out.options = q.options.map((o) => ({
        option: o,
        count: answers.filter((x) => (Array.isArray(x.value) ? x.value.includes(o) : x.value === o)).length,
      }));
    } else if (q.type === "rating") {
      out.average = answers.length ? answers.reduce((s, x) => s + x.value, 0) / answers.length : null;
      out.distribution = [1, 2, 3, 4, 5].map((n) => answers.filter((x) => x.value === n).length);
    } else {
      out.answers = answers.map((x) => {
        const p = x.personId ? store.getPerson(x.personId) : null;
        return { text: x.value, by: p ? p.displayName : null };
      });
    }
    return out;
  });
}

function pollView(poll, person) {
  const manager = store.can(person, MANAGE);
  const responded = poll.respondents.includes(person.id);
  const author = store.getPerson(poll.createdBy);
  const view = {
    id: poll.id,
    title: poll.title,
    description: poll.description,
    questions: poll.questions,
    anonymous: poll.anonymous,
    showResults: poll.showResults,
    companies: poll.companies,
    closesAt: poll.closesAt,
    open: isOpen(poll),
    createdAt: poll.createdAt,
    author: author ? author.displayName : "Former staff",
    responded,
    canRespond: isOpen(poll) && inAudience(person, poll) && !responded,
    responseCount: poll.respondents.length,
    canManage: manager,
  };
  if (manager) {
    view.audienceCount = store.employees().filter((p) => inAudience(p, poll)).length;
  }
  if (manager || (poll.showResults && (responded || !isOpen(poll)))) view.results = results(poll);
  return view;
}

function listPolls(person) {
  return polls.filter((p) => canSee(person, p))
    .sort((a, b) => (isOpen(b) - isOpen(a)) || b.createdAt.localeCompare(a.createdAt))
    .map((p) => pollView(p, person));
}

function openForPerson(person) {
  return polls.filter((p) => isOpen(p) && inAudience(person, p) && !p.respondents.includes(person.id)).length;
}

function allPolls() {
  return polls;
}

module.exports = { QUESTION_TYPES, init, savePoll, getPoll, deletePoll, closePoll, respond, pollView, listPolls, openForPerson, canSee, allPolls };
