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

// Leavers: the same kind of checklist, for when someone leaves. Ticking a task with the
// "disable-login" action switches their login off.
const KINDS = { starter: "New starter", leaver: "Leaver" };
const ACTIONS = { "disable-login": "Disables their login when ticked", "exit-interview": "Ticked automatically when they send their exit interview" };

const LEAVER_TEMPLATE = {
  name: "Leaver",
  kind: "leaver",
  tasks: [
    { title: "Confirm their last working day", description: "", owner: "hr" },
    { title: "Hand over work and passwords", description: "Pass on anything others will need.", owner: "employee" },
    { title: "Exit interview", description: "A short chat about their time here.", owner: "supervisor" },
    { title: "Return laptop, phone and other equipment", description: "", owner: "employee" },
    { title: "Final payslip, including any holiday owed", description: "Check their leave balance before running it.", owner: "hr" },
    { title: "Remove from roles and shared accounts", description: "", owner: "hr" },
    { title: "Disable their login", description: "Do this on or after their last day.", owner: "hr", action: "disable-login" },
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
    data.templates.push({ id: newId(), name: DEFAULT_TEMPLATE.name, kind: "starter", tasks: DEFAULT_TEMPLATE.tasks.map((t) => ({ id: newId(), ...t })) });
    save();
  }
  if (!data.leaverTemplateAdded) {
    data.templates.push({ id: newId(), name: LEAVER_TEMPLATE.name, kind: "leaver", tasks: LEAVER_TEMPLATE.tasks.map((t) => ({ id: newId(), ...t })) });
    data.leaverTemplateAdded = true;
    save();
  }
  // Leaver checklists get an exit interview task (added once to existing leaver templates).
  if (!data.exitInterviewAdded) {
    for (const t of data.templates) {
      if ((t.kind || "starter") !== "leaver" || t.tasks.some((x) => x.action === "exit-interview")) continue;
      t.tasks.splice(Math.max(0, t.tasks.length - 1), 0, { id: newId(), title: "Fill in your exit interview", description: "A short form about your time here. Only HR see your answers. Open it from the Exit interview page.", owner: "employee", action: "exit-interview" });
    }
    data.exitInterviewAdded = true;
    save();
  }
}

// The person's leaving checklist in progress, if they have one.
function leaverChecklistOf(personId) {
  return data.checklists.find((c) => c.personId === personId && !c.completedAt && (c.kind || "starter") === "leaver") || null;
}

// Ticks a task with a given automatic action (e.g. the exit interview being sent).
function completeAction(personId, action) {
  const c = leaverChecklistOf(personId);
  const task = c && c.tasks.find((t) => t.action === action && !t.doneAt);
  if (!task) return;
  task.doneAt = new Date().toISOString();
  task.doneBy = personId;
  c.completedAt = c.tasks.every((t) => t.doneAt) ? new Date().toISOString() : null;
  save();
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
    action: t && ACTIONS[t.action] ? t.action : undefined,
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
  const fields = { name, kind: KINDS[input.kind] ? input.kind : "starter", tasks: cleanTasks(input.tasks) };
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

function startChecklist(template, person, by, extra) {
  const kind = template.kind || "starter";
  if (data.checklists.some((c) => c.personId === person.id && !c.completedAt && (c.kind || "starter") === kind)) {
    throw new store.ValidationError(`${person.displayName} already has a ${kind === "leaver" ? "leaving" : "onboarding"} checklist in progress.`);
  }
  const lastDay = extra && /^\d{4}-\d{2}-\d{2}$/.test(extra.lastDay || "") ? extra.lastDay : null;
  if (kind === "leaver" && !lastDay) throw new store.ValidationError("Choose their last working day.");
  const c = {
    id: newId(),
    personId: person.id,
    name: template.name,
    kind,
    lastDay,
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
    kind: c.kind || "starter",
    lastDay: c.lastDay || null,
    person: p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, company: p.company, avatarUrl: store.publicView(p).avatarUrl } : { displayName: "Former staff" },
    tasks: c.tasks.map((t) => {
      const by = t.doneBy ? store.getPerson(t.doneBy) : null;
      return { ...t, doneByName: by ? by.displayName : null, canTick: viewer ? canTick(viewer, c, t) : false, actionLabel: t.action ? ACTIONS[t.action] : null };
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

// The last working day from someone's leaver checklist, if they have one.
function leavingDateOf(personId) {
  return data.checklists.filter((c) => c.personId === personId && c.kind === "leaver" && c.lastDay).map((c) => c.lastDay).sort().pop() || null;
}

function removePerson(personId) {
  const before = data.checklists.length;
  data.checklists = data.checklists.filter((c) => c.personId !== personId);
  if (data.checklists.length !== before) save();
}

module.exports = {
  leavingDateOf,
  KINDS,
  ACTIONS,
  leaverChecklistOf,
  completeAction,
  OWNERS, init, listTemplates, saveTemplate, getTemplate, deleteTemplate,
  startChecklist, getChecklist, setTask, deleteChecklist, listChecklists, forPerson, removePerson, view,
};
