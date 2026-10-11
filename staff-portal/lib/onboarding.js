// Onboarding checklists for new starters. People with "onboarding.manage" keep checklist templates
// and start a checklist for an employee; each task is done either by the employee or by HR.
// Stored in DATA_DIR/onboarding.json.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");

const OWNERS = ["employee", "hr", "supervisor"];

const DEFAULT_TEMPLATE = {
  name: "New starter",
  tasks: [
    { title: "Read the Staff Handbook", description: "You'll find it under Workplace → Documents & Policies.", owner: "employee" },
    { title: "Add a profile picture and banner", description: "Settings → Profile.", owner: "employee" },
    { title: "Check your details, location and time zone", description: "Settings → Profile.", owner: "employee" },
    { title: "Meet your supervisor", description: "", owner: "employee" },
    { title: "Introductory meeting with the new starter", description: "", owner: "supervisor" },
    { title: "Set up email accounts", description: "", owner: "hr" },
    { title: "Issue equipment", description: "Laptop, phone and anything else they need.", owner: "hr" },
    { title: "Add to payroll", description: "", owner: "hr" },
  ],
};

let file;
let data = { templates: [], checklists: [] };

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function init(dataDir) {
  file = path.join(dataDir, "onboarding.json");
  data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { templates: [], checklists: [] };
  if (!data.templates.length) {
    data.templates.push({ id: newId(), name: DEFAULT_TEMPLATE.name, tasks: DEFAULT_TEMPLATE.tasks.map((t) => ({ id: newId(), ...t })) });
    save();
  }
}

function save() {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function cleanTasks(list) {
  const tasks = (Array.isArray(list) ? list : []).slice(0, 50).map((t) => ({
    id: (t && t.id) || newId(),
    title: str(t && t.title, 150),
    description: str(t && t.description, 500),
    owner: OWNERS.includes(t && t.owner) ? t.owner : "employee",
  })).filter((t) => t.title);
  if (!tasks.length) throw new store.ValidationError("Add at least one task.");
  return tasks;
}

function listTemplates() {
  return data.templates;
}

function saveTemplate(input, existing) {
  const name = str(input.name, 80);
  if (!name) throw new store.ValidationError("Give the checklist a name.");
  const fields = { name, tasks: cleanTasks(input.tasks) };
  if (existing) Object.assign(existing, fields);
  else data.templates.push((existing = { id: newId(), ...fields }));
  save();
  return existing;
}

function getTemplate(id) {
  return data.templates.find((t) => t.id === id) || null;
}

function deleteTemplate(t) {
  data.templates = data.templates.filter((x) => x.id !== t.id);
  save();
}

function startChecklist(template, person, by) {
  if (data.checklists.some((c) => c.personId === person.id && !c.completedAt)) {
    throw new store.ValidationError(`${person.displayName} already has an onboarding checklist in progress.`);
  }
  const c = {
    id: newId(),
    personId: person.id,
    name: template.name,
    tasks: template.tasks.map((t) => ({ ...t, id: newId(), doneAt: null, doneBy: null })),
    startedBy: by.id,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  data.checklists.push(c);
  save();
  return c;
}

function getChecklist(id) {
  return data.checklists.find((c) => c.id === id) || null;
}

// The employee ticks their own tasks; their supervisor ticks supervisor tasks; HR can tick anything.
function canTick(person, checklist, task) {
  if (store.can(person, "onboarding.manage")) return true;
  if (task.owner === "employee") return person.id === checklist.personId;
  if (task.owner === "supervisor") {
    const p = store.getPerson(checklist.personId);
    return !!p && p.supervisorId === person.id;
  }
  return false;
}

function setTask(checklist, taskId, done, by) {
  const task = checklist.tasks.find((t) => t.id === taskId);
  if (!task) throw new store.ValidationError("That task no longer exists.");
  if (!canTick(by, checklist, task)) throw new store.ValidationError("That task is for someone else to complete.");
  task.doneAt = done ? new Date().toISOString() : null;
  task.doneBy = done ? by.id : null;
  checklist.completedAt = checklist.tasks.every((t) => t.doneAt) ? new Date().toISOString() : null;
  save();
  return task;
}

function deleteChecklist(c) {
  data.checklists = data.checklists.filter((x) => x.id !== c.id);
  save();
}

function view(c, viewer) {
  const p = store.getPerson(c.personId);
  return {
    id: c.id,
    name: c.name,
    person: p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, company: p.company, avatarUrl: store.publicView(p).avatarUrl } : { displayName: "Former staff" },
    tasks: c.tasks.map((t) => {
      const by = t.doneBy ? store.getPerson(t.doneBy) : null;
      return { ...t, doneByName: by ? by.displayName : null, canTick: viewer ? canTick(viewer, c, t) : false };
    }),
    done: c.tasks.filter((t) => t.doneAt).length,
    total: c.tasks.length,
    createdAt: c.createdAt,
    completedAt: c.completedAt,
  };
}

function listChecklists(viewer) {
  return data.checklists.slice().sort((a, b) => (!!a.completedAt - !!b.completedAt) || b.createdAt.localeCompare(a.createdAt)).map((c) => view(c, viewer));
}

// Checklists someone needs to act on: their own, and those of people who report to them.
function forPerson(person) {
  return data.checklists
    .filter((c) => !c.completedAt && (c.personId === person.id || (store.getPerson(c.personId) || {}).supervisorId === person.id))
    .map((c) => view(c, person));
}

function removePerson(personId) {
  const before = data.checklists.length;
  data.checklists = data.checklists.filter((c) => c.personId !== personId);
  if (data.checklists.length !== before) save();
}

module.exports = {
  OWNERS, init, listTemplates, saveTemplate, getTemplate, deleteTemplate,
  startChecklist, getChecklist, setTask, deleteChecklist, listChecklists, forPerson, removePerson, view,
};
