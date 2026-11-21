// Job descriptions (the user's request, 6 November 2026: "under people on the Staff Portal add a Job Description page …
// include role, company, who or what the position reports to, Job Description and authority"). Everyone signed in can
// read them; people with "Manage job descriptions" (or "Manage staff") post, edit and delete them.
// Stored in DATA_DIR/job-descriptions.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const MANAGE = "jobdescriptions.manage";

let db, directory;

// The user's own job descriptions (7 November 2026), added once each (never again after they're edited or deleted).
const SEED = require("./job-descriptions-seed.json");

function init(dataDir) {
  directory = dataDir;
  db = datafile.open(dataDir, "job-descriptions.json", () => ({ items: [], seeded: [] }));
  let changed = false;
  for (const d of SEED) {
    if (db.data.seeded.includes(d.seed)) continue;
    db.data.seeded.push(d.seed);
    changed = true;
    if (db.data.items.some((x) => x.company === d.company && x.role.toLowerCase() === d.role.toLowerCase())) continue;
    const now = new Date().toISOString();
    db.data.items.push({ id: crypto.randomBytes(8).toString("hex"), role: d.role, company: d.company, reportsTo: d.reportsTo, description: d.description, authority: d.authority, createdAt: now, updatedAt: now, updatedBy: "" });
  }
  if(!db.data.networkBoardPositions20261117){
    for(const role of ['Board Chairman','Board Director','Board Member'])if(!db.data.items.some(d=>d.company==='Horizon Network'&&d.role===role)){
      const stamp=new Date().toISOString();db.data.items.push({id:crypto.randomBytes(8).toString('hex'),role,company:'Horizon Network',reportsTo:role==='Board Chairman'?'Board of HN Group':'Board Chairman (Horizon Network)',description:role==='Board Chairman'?'Chairs Horizon Network’s board, coordinates its collective decisions and reports on its work to the Board of HN Group.':'Participates in the collective work and decisions of the Board of Horizon Network.',authority:'Acts through collective board decisions and any separately recorded delegation. This position does not confer the authority of the whole board on an individual.',createdAt:stamp,updatedAt:stamp,updatedBy:'HN Group'});
    }
    db.data.networkBoardPositions20261117=true;changed=true;
  }
  if (!db.data.collectiveBoards20261117) {
    for(const d of db.data.items)if((d.company==='HN Group'&&d.role==='Board Chairman')||(d.company==='Horizon Network'&&['President','Board Chairman'].includes(d.role))){
      d.reportsTo='Board of '+(d.company==='Horizon Network'&&d.role==='Board Chairman'?'HN Group':d.company);
      d.description=String(d.description||'')+'\n\nAccountability: this position reports to the '+d.reportsTo+' collectively, rather than to an individual board member.';
      d.updatedAt=new Date().toISOString();d.updatedBy='HN Group';
    }
    db.data.collectiveBoards20261117=true;changed=true;
  }
  if (changed) db.save();
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
  else if (role && !(store.positions()[company] || []).some((t) => t.toLowerCase() === role.toLowerCase()) && !(existing && existing.role === role && existing.company === company)) errors.push(`${role} isn't one of ${company}'s positions. Add it under Positions first.`);
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

function positionRenamePlan(dataDir, company, previous, name, actor) {
  if(!db || directory !== dataDir) return null;
  const same = (a,b) => String(a||"").trim().toLowerCase() === String(b||"").trim().toLowerCase();
  if(db.data.items.some(d=>d.company===company&&same(d.role,name)&&!same(d.role,previous))) throw new store.ValidationError("A job description already uses that position name.");
  const value = JSON.parse(JSON.stringify(db.data));
  for(const item of value.items){
    let changed=false;
    if(item.company===company&&same(item.role,previous)){item.role=name;changed=true;}
    if(item.company===company&&same(item.reportsTo,previous)){item.reportsTo=name;changed=true;}
    if(changed){item.updatedAt=new Date().toISOString();item.updatedBy=actor?.displayName||"";}
  }
  return {value,apply(){Object.assign(db.data,value);}};
}

function remove(d) {
  db.data.items = db.data.items.filter((x) => x.id !== d.id);
  db.save();
}

module.exports = { init, list, get, save, remove, canManage, view, MANAGE, positionRenamePlan };
