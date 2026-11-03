// On-call rotas. Each rota (e.g. "IT support") has a person on call each week, Monday to Sunday.
// People who handle IT tickets manage the rotas; everyone can see who's on call, and it shows on
// the home page. A rota can be filled automatically by taking turns. Stored in DATA_DIR/oncall.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const MANAGE = "helpdesk.manage";

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "oncall.json", () => ({ rotas: [] }));
  if (!db.data.rotas.length && !db.data.seeded) {
    db.data.rotas.push({ id: crypto.randomBytes(8).toString("hex"), name: "IT support", description: "Out-of-hours help with logins, the portal and company websites.", contact: "", weeks: {} });
    db.data.seeded = true;
    db.save();
  }
}

const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function weekStart(date) {
  const d = new Date((date || new Date().toISOString().slice(0, 10)) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function addWeeks(week, n) {
  const d = new Date(week + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function saveRota(input, existing) {
  const name = str(input.name, 80);
  if (!name) throw new store.ValidationError("Give the rota a name.");
  const fields = { name, description: str(input.description, 300), contact: str(input.contact, 120) };
  if (existing) Object.assign(existing, fields);
  else db.data.rotas.push((existing = { id: crypto.randomBytes(8).toString("hex"), ...fields, weeks: {} }));
  db.save();
  return existing;
}

function getRota(id) {
  return db.data.rotas.find((r) => r.id === id) || null;
}

function deleteRota(r) {
  db.data.rotas = db.data.rotas.filter((x) => x.id !== r.id);
  db.save();
}

function assign(r, week, personId) {
  const w = weekStart(week);
  if (!personId) delete r.weeks[w];
  else {
    const p = store.getPerson(personId);
    if (!p || p.system) throw new store.ValidationError("Choose someone.");
    r.weeks[w] = p.id;
  }
  db.save();
}

// Fills the next `count` weeks by taking turns through the chosen people, starting after whoever
// was on call last.
function rotate(r, personIds, fromWeek, count) {
  const people = (Array.isArray(personIds) ? personIds : []).filter((id) => { const p = store.getPerson(id); return p && !p.system; });
  if (people.length < 1) throw new store.ValidationError("Choose who takes turns.");
  let w = weekStart(fromWeek);
  const before = r.weeks[addWeeks(w, -1)];
  let i = Math.max(0, people.indexOf(before) + 1);
  for (let n = 0; n < Math.min(52, Math.max(1, Number(count) || 8)); n++) {
    r.weeks[w] = people[i % people.length];
    i++;
    w = addWeeks(w, 1);
  }
  db.save();
}

const brief = (id) => { const p = id ? store.getPerson(id) : null; return p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl, phone: p.phone || "" } : null; };

function view(r, from, weeks) {
  const start = weekStart(from);
  const list = [];
  for (let n = 0; n < (weeks || 8); n++) {
    const w = addWeeks(start, n);
    list.push({ week: w, person: brief(r.weeks[w]) });
  }
  return { id: r.id, name: r.name, description: r.description, contact: r.contact, now: brief(r.weeks[weekStart()]), next: brief(r.weeks[addWeeks(weekStart(), 1)]), weeks: list };
}

function list(from, weeks) {
  return db.data.rotas.map((r) => view(r, from, weeks));
}

// Who's on call this week on every rota (for the home page).
function current() {
  return db.data.rotas.map((r) => ({ name: r.name, contact: r.contact, person: brief(r.weeks[weekStart()]) })).filter((x) => x.person);
}

function isOnCall(personId) {
  return db.data.rotas.some((r) => r.weeks[weekStart()] === personId);
}

module.exports = { MANAGE, init, weekStart, addWeeks, saveRota, getRota, deleteRota, assign, rotate, list, current, isOnCall };
