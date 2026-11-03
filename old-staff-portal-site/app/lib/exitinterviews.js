// Exit interviews. Someone with a leaving checklist in progress fills in a short form about why
// they're leaving and what could be better. Only HR (staff.manage) can read the answers. Sending
// it ticks the "exit interview" task on their leaver checklist. Stored in DATA_DIR/exit-interviews.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const REASONS = {
  career: "Career progression", pay: "Pay and benefits", manager: "Relationship with manager", workload: "Workload or stress",
  flexibility: "Flexibility or hours", relocation: "Moving away", personal: "Personal or family reasons", culture: "Culture or team",
  redundancy: "Redundancy or end of contract", other: "Something else",
};
const QUESTIONS = [
  { key: "reasons", label: "Why are you leaving? (choose any that apply)", type: "reasons" },
  { key: "enjoyed", label: "What did you enjoy most about working here?", type: "text" },
  { key: "improve", label: "What could we have done better?", type: "text" },
  { key: "manager", label: "How well were you supported by your manager?", type: "rating" },
  { key: "recommend", label: "How likely are you to recommend HN Group as a place to work?", type: "rating" },
  { key: "return", label: "Would you consider coming back in the future?", type: "choice", options: ["Yes", "Maybe", "No"] },
  { key: "other", label: "Anything else you'd like us to know?", type: "text", optional: true },
];

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "exit-interviews.json", () => ({ interviews: [] }));
}

const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function forPerson(personId) {
  return db.data.interviews.find((i) => i.personId === personId) || null;
}

function submit(person, answers) {
  if (forPerson(person.id)) throw new store.ValidationError("You've already sent your exit interview. Thank you.");
  const clean = {};
  for (const q of QUESTIONS) {
    const v = answers && answers[q.key];
    if (q.type === "reasons") {
      const list = (Array.isArray(v) ? v : []).filter((k) => REASONS[k]);
      if (!list.length) throw new store.ValidationError("Choose at least one reason for leaving.");
      clean[q.key] = list;
    } else if (q.type === "rating") {
      const n = Number(v);
      if (!(n >= 1 && n <= 5)) throw new store.ValidationError(`Choose a rating for “${q.label}”`);
      clean[q.key] = Math.round(n);
    } else if (q.type === "choice") {
      if (!q.options.includes(v)) throw new store.ValidationError(`Answer “${q.label}”`);
      clean[q.key] = v;
    } else {
      const t = str(v, 3000);
      if (!t && !q.optional) throw new store.ValidationError(`Answer “${q.label}”`);
      clean[q.key] = t;
    }
  }
  const i = { id: crypto.randomBytes(8).toString("hex"), personId: person.id, name: person.displayName, jobTitle: person.jobTitle, company: person.company, answers: clean, at: new Date().toISOString() };
  db.data.interviews.push(i);
  db.save();
  return i;
}

function list() {
  return db.data.interviews.slice().sort((a, b) => b.at.localeCompare(a.at));
}

// Reasons people gave, most common first (for HR's summary).
function reasonSummary() {
  const counts = {};
  for (const i of db.data.interviews) for (const r of i.answers.reasons || []) counts[r] = (counts[r] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, label: REASONS[key], count }));
}

module.exports = { REASONS, QUESTIONS, init, forPerson, submit, list, reasonSummary };
