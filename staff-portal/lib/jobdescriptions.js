// Job descriptions (the user's request, 6 November 2026: "under people on the Staff Portal add a Job Description page …
// include role, company, who or what the position reports to, Job Description and authority"). Everyone signed in can
// read them; people with "Manage job descriptions" (or "Manage staff") post, edit and delete them.
// Stored in DATA_DIR/job-descriptions.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const MANAGE = "jobdescriptions.manage";

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "job-descriptions.json", () => ({ items: [] }));
}

const str = (v, max) => String(v == null ? "" : v).replace(/\r\n?/g, "\n").trim().slice(0, max);
const line = (v, max) => str(v, max).replace(/\s+/g, " ");

function canManage(person) {
  return store.can(person, MANAGE) || store.can(person, "staff.manage");
}

function view(d) {
  return { id: d.id, role: d.role, company: d.company, reportsTo: d.reportsTo, description: d.description, authority: d.authority, createdAt: d.createdAt, updatedAt: d.updatedAt, updatedBy: d.updatedBy || "" };
}

function list() {
  const order = store.COMPANIES;
  return db.data.items.slice()
    .sort((a, b) => order.indexOf(a.company) - order.indexOf(b.company) || a.role.localeCompare(b.role))
    .map(view);
}

function get(id) {
  return db.data.items.find((d) => d.id === id) || null;
}

function save(input, existing, by) {
  const role = line(input.role, 120);
  const company = line(input.company, 80);
  const reportsTo = line(input.reportsTo, 160);
  const description = str(input.description, 20000);
  const authority = str(input.authority, 10000);
  const errors = [];
  if (!role) errors.push("Give the role a name.");
  if (!store.COMPANIES.includes(company)) errors.push("Choose a company.");
  if (!reportsTo) errors.push("Say who or what the position reports to.");
  if (!description) errors.push("Write the job description.");
  if (!authority) errors.push("Say what authority the role has.");
  if (errors.length) throw new store.ValidationError(errors.join(" "));
  const clash = db.data.items.find((d) => d !== existing && d.company === company && d.role.toLowerCase() === role.toLowerCase());
  if (clash) throw new store.ValidationError(`There's already a job description for ${role} at ${company}.`);
  const now = new Date().toISOString();
  const fields = { role, company, reportsTo, description, authority, updatedAt: now, updatedBy: by ? by.displayName : "" };
  if (existing) Object.assign(existing, fields);
  else db.data.items.push((existing = { id: crypto.randomBytes(8).toString("hex"), createdAt: now, ...fields }));
  db.save();
  return existing;
}

function remove(d) {
  db.data.items = db.data.items.filter((x) => x.id !== d.id);
  db.save();
}

module.exports = { init, list, get, save, remove, canManage, view, MANAGE };
