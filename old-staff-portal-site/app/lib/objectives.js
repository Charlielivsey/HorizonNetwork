// Objectives (goals). Each person has goals for a quarter, set by themselves or their manager
// (their supervisor, or anyone with "staff.manage"). The person updates progress as they go and
// the goals show up alongside their reviews. Stored in DATA_DIR/objectives.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const STATUSES = { "on-track": "On track", "at-risk": "At risk", "off-track": "Off track", done: "Done", dropped: "Dropped" };

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "objectives.json", () => ({ objectives: [] }));
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function quarterOf(date) {
  const d = date || new Date().toISOString().slice(0, 10);
  return `${d.slice(0, 4)}-Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`;
}

function quarterLabel(q) {
  const [y, n] = q.split("-Q");
  return `Q${n} ${y} (${["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"][Number(n) - 1]})`;
}

function shiftQuarter(q, by) {
  let [y, n] = q.split("-Q").map(Number);
  n += by;
  while (n > 4) { n -= 4; y++; }
  while (n < 1) { n += 4; y--; }
  return `${y}-Q${n}`;
}

function canManage(viewer, person) {
  if (!person || person.system) return false;
  if (viewer.id === person.id) return true;
  return store.can(viewer, "staff.manage") || store.supervises(viewer, person);
}

function save(person, input, by, existing) {
  if (!canManage(by, person)) throw new store.ValidationError("You can't set goals for that person.");
  const title = str(input.title, 150);
  if (!title) throw new store.ValidationError("Give the goal a title.");
  const quarter = /^\d{4}-Q[1-4]$/.test(input.quarter || "") ? input.quarter : quarterOf();
  const o = existing || { id: newId(), personId: person.id, createdBy: by.id, createdAt: new Date().toISOString(), updates: [], progress: 0, status: "on-track" };
  Object.assign(o, { title, description: str(input.description, 2000), measure: str(input.measure, 300), quarter, updatedAt: new Date().toISOString() });
  if (!existing) db.data.objectives.push(o);
  db.save();
  return o;
}

function get(id) {
  return db.data.objectives.find((o) => o.id === id) || null;
}

// A progress update: new percentage and status, with an optional comment.
function update(o, input, by) {
  const progress = Math.max(0, Math.min(100, Math.round(Number(input.progress))));
  if (isNaN(progress)) throw new store.ValidationError("Enter the progress as a percentage.");
  const status = STATUSES[input.status] ? input.status : progress >= 100 ? "done" : o.status;
  o.progress = progress;
  o.status = status;
  o.updates.push({ id: newId(), by: by.id, at: new Date().toISOString(), progress, status, note: str(input.note, 1000) });
  o.updatedAt = new Date().toISOString();
  db.save();
}

function remove(o) {
  db.data.objectives = db.data.objectives.filter((x) => x.id !== o.id);
  db.save();
}

const nameOf = (id) => { const p = id ? store.getPerson(id) : null; return p ? p.displayName : "Former staff"; };

function view(o, viewer) {
  const p = store.getPerson(o.personId);
  return {
    ...o, statusLabel: STATUSES[o.status], quarterLabel: quarterLabel(o.quarter),
    person: p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl } : { displayName: "Former staff" },
    updates: o.updates.slice().reverse().map((u) => ({ ...u, byName: nameOf(u.by), statusLabel: STATUSES[u.status] })),
    canEdit: canManage(viewer, p),
  };
}

function forPerson(personId, viewer, quarter) {
  return db.data.objectives.filter((o) => o.personId === personId && (!quarter || o.quarter === quarter)).map((o) => view(o, viewer));
}

// Everyone the viewer manages (their team, or everyone for HR) with their goals for a quarter.
function team(viewer, quarter) {
  const all = store.can(viewer, "staff.manage");
  return store.employees().filter((p) => p.id !== viewer.id && (all || store.supervises(viewer, p))).map((p) => {
    const list = db.data.objectives.filter((o) => o.personId === p.id && o.quarter === quarter);
    return {
      id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl,
      count: list.length, average: list.length ? Math.round(list.reduce((n, o) => n + o.progress, 0) / list.length) : null,
      atRisk: list.filter((o) => o.status === "at-risk" || o.status === "off-track").length,
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

module.exports = { STATUSES, init, quarterOf, quarterLabel, shiftQuarter, canManage, save, get, update, remove, forPerson, team };
