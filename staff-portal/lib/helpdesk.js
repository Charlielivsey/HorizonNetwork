// Requests share the existing ticket store. Team-specific permissions protect private queues;
// existing tickets with no team remain Internal Technology tickets.
// Stored in DATA_DIR/helpdesk.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const MANAGE = "helpdesk.manage";
const CATEGORIES = {
  hardware: "Hardware",
  software: "Software",
  access: "Accounts & access",
  email: "Email",
  network: "Network & VPN",
  phone: "Phones",
  other: "Something else",
};
const TEAMS = {
  leadership: {label:"Leadership Team",permission:"requests.leadership",icon:"building",description:"Direction, decisions, escalations and support from leadership.",examples:["A decision","An escalation","Group direction"]},
  hr: {label:"Human Resources Team",permission:"requests.hr",icon:"users",description:"Your role, employment, wellbeing or a workplace concern.",examples:["My role","Wellbeing","A workplace concern"]},
  technology: {label:"Internal Technology Team",permission:MANAGE,icon:"lifebuoy",description:"Accounts, devices, software, access and technical problems.",examples:["Account access","A device","Something broken"]},
  compliance: {label:"Compliance Team",permission:"requests.compliance",icon:"shield",description:"Policies, data protection, conflicts of interest and compliance concerns.",examples:["Personal data","A policy","A conflict of interest"]},
};
const TEAM_CATEGORIES = {
  technology:CATEGORIES,
  leadership:{decision:"Decision or guidance",escalation:"Escalation",proposal:"Proposal",other:"Something else"},
  hr:{employment:"Employment or role",leave:"Leave or working arrangements",wellbeing:"Wellbeing",concern:"Workplace concern",other:"Something else"},
  compliance:{data:"Data protection",policy:"Policy or compliance",conflict:"Conflict of interest",concern:"Report a concern",other:"Something else"},
};
const teamOf = t => t && t.team || "technology";
const companyOf = t => t.company || null;
const denied = () => { throw Object.assign(new Error("You cannot handle this request."),{status:403}); };
const PRIORITIES = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
const STATUSES = { open: "Open", "in-progress": "In progress", waiting: "Waiting on you", resolved: "Resolved", closed: "Closed" };

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "helpdesk.json", () => ({ tickets: [], nextNumber: 1001 }));
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function isAgent(person, ticket) {
  const team = TEAMS[teamOf(ticket)];
  return !!team && store.can(person,team.permission);
}
function canHandleAny(person) { return Object.keys(TEAMS).some(team=>isAgent(person,{team})); }
function canSee(person, t) { return !!person && (t.createdBy === person.id || isAgent(person,t)); }
function routing() { return Object.fromEntries(Object.entries(TEAMS).map(([key,t])=>[key,{label:t.label,icon:t.icon,description:t.description,examples:t.examples,categories:TEAM_CATEGORIES[key]}])); }
function visibleAgents(viewer) {
  const allowed = Object.keys(TEAMS).filter(team=>isAgent(viewer,{team}));
  const out = new Map();
  for(const team of allowed)for(const agent of agents({team}))out.set(agent.id,agent);
  return [...out.values()];
}
function recipients(t) { return agents(t).map(a=>a.id); }
function replyRecipients(t,viewer) {
  if(viewer.id!==t.createdBy)return [t.createdBy];
  const allowed=recipients(t);return t.assigneeId && allowed.includes(t.assigneeId) ? [t.assigneeId] : allowed;
}

function createTicket(person, input) {
  if(!input || typeof input!=="object" || Array.isArray(input))throw new store.ValidationError("Send valid request details.");
  const subject = str(input.subject, 150);
  const body = str(input.body, 5000);
  if (!subject) throw new store.ValidationError("Add a short summary of the problem.");
  if (!body) throw new store.ValidationError("Add details so the selected team can help.");
  const team = input.team === undefined ? "technology" : input.team;
  if(typeof team!=="string" || !Object.hasOwn(TEAMS,team))throw new store.ValidationError("Choose one of the four request teams.");
  const company = input.company === undefined && input.team === undefined ? (store.COMPANIES.includes(person.company) ? person.company : store.COMPANIES[0]) : input.company;
  if(typeof company!=="string" || !store.COMPANIES.includes(company))throw new store.ValidationError("Choose a valid brand or company.");
  const categories = TEAM_CATEGORIES[team];
  if(input.category!==undefined && !Object.hasOwn(categories,input.category))throw new store.ValidationError("Choose a category for this team.");
  if(input.priority!==undefined && !Object.hasOwn(PRIORITIES,input.priority))throw new store.ValidationError("Choose a valid priority.");
  const now = new Date().toISOString();
  const t = {
    id: newId(),
    number: db.data.nextNumber++,
    subject,
    team, company,
    category: input.category || "other",
    priority: PRIORITIES[input.priority] ? input.priority : "normal",
    status: "open",
    createdBy: person.id,
    assigneeId: null,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    messages: [{ id: newId(), authorId: person.id, body, internal: false, at: now }],
  };
  db.data.tickets.push(t);
  db.save();
  return t;
}

function getTicket(id) {
  return db.data.tickets.find((t) => t.id === id) || null;
}

function reply(t, person, input) {
  const body = str(input.body, 5000);
  if (!body) throw new store.ValidationError("Write a reply first.");
  if(!canSee(person,t))denied();
  const agent = isAgent(person,t);
  if(input.internal && !agent)denied();
  const internal = agent && !!input.internal;
  t.messages.push({ id: newId(), authorId: person.id, body, internal, at: new Date().toISOString() });
  if (!internal) {
    // A requester reply returns it to the selected team; handler replies start progress.
    if (person.id === t.createdBy && !agent && (t.status === "waiting" || t.status === "resolved")) t.status = "open";
    else if (agent && person.id !== t.createdBy && t.status === "open") t.status = "in-progress";
  }
  if (agent && !t.assigneeId && !internal) t.assigneeId = person.id;
  t.updatedAt = new Date().toISOString();
  db.save();
}

// Authorized team handlers manage the queue; requesters may resolve, close or reopen their own requests.
function update(t, person, input) {
  if(!canSee(person,t))denied();
  const agent = isAgent(person,t);
  if(("team" in input && input.team!==teamOf(t)) || ("company" in input && input.company!==companyOf(t)))throw new store.ValidationError("The request team and company cannot be changed here.");
  if(!agent && ("priority" in input || "assigneeId" in input))denied();
  if(agent && input.assigneeId){
    const candidate=store.getPerson(input.assigneeId);
    if(!candidate || !agents(t).some(a=>a.id===candidate.id))throw new store.ValidationError("Choose an authorized handler for this request team.");
  }
  if(input.status!==undefined && !Object.hasOwn(STATUSES,input.status))throw new store.ValidationError("Choose a valid status.");
  if(input.priority!==undefined && !Object.hasOwn(PRIORITIES,input.priority))throw new store.ValidationError("Choose a valid priority.");
  const changes = [];
  if (input.status && STATUSES[input.status] && input.status !== t.status) {
    if (!agent && !["resolved", "closed", "open"].includes(input.status)) throw new store.ValidationError("You can't set that status.");
    t.status = input.status;
    t.closedAt = input.status === "closed" || input.status === "resolved" ? new Date().toISOString() : null;
    changes.push("status: " + STATUSES[t.status]);
  }
  if (agent && input.priority && PRIORITIES[input.priority] && input.priority !== t.priority) {
    t.priority = input.priority;
    changes.push("priority: " + PRIORITIES[t.priority]);
  }
  if (agent && "assigneeId" in input) {
    const a = input.assigneeId ? store.getPerson(input.assigneeId) : null;
    if ((a ? a.id : null) !== t.assigneeId) {
      t.assigneeId = a ? a.id : null;
      changes.push("assigned to " + (a ? a.displayName : "nobody"));
    }
  }
  if (changes.length) {
    t.updatedAt = new Date().toISOString();
    db.save();
  }
  return changes;
}

function brief(id) {
  const p = id ? store.getPerson(id) : null;
  if (!p) return id ? { id, displayName: "Former staff" } : null;
  return { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl };
}

function summary(t, viewer) {
  const visible = t.messages.filter(m=>isAgent(viewer,t)||!m.internal);
  const last = visible[visible.length - 1];
  return {
    id: t.id,
    number: t.number,
    subject: t.subject,
    team:teamOf(t),teamLabel:(TEAMS[teamOf(t)] || {}).label || "Unknown team",company:companyOf(t),
    category: t.category,
    categoryLabel: (TEAM_CATEGORIES[teamOf(t)] || CATEGORIES)[t.category] || t.category,
    priority: t.priority,
    status: t.status,
    requester: brief(t.createdBy),
    assignee: brief(t.assigneeId),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    replies: t.messages.filter((m) => !m.internal).length - 1,
    lastBy: last ? (brief(last.authorId) || {}).displayName : "",
  };
}

function fullView(t, viewer) {
  if(!canSee(viewer,t))denied();
  const agent = isAgent(viewer,t), handlers=agents(t);
  return {
    ...summary(t,viewer),
    agents:agent?handlers:[],
    messages: t.messages.filter((m) => agent || !m.internal).map((m) => ({ ...m, author: brief(m.authorId), fromIt: handlers.some(a=>a.id===m.authorId) && m.authorId !== t.createdBy })),
    canManage: agent,
    isRequester: t.createdBy === viewer.id,
  };
}

const ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

function list(viewer) {
  return db.data.tickets.filter((t) => canSee(viewer, t))
    .sort((a, b) => {
      const doneA = a.status === "resolved" || a.status === "closed";
      const doneB = b.status === "resolved" || b.status === "closed";
      return (doneA - doneB) || (ORDER[a.priority] - ORDER[b.priority]) || b.updatedAt.localeCompare(a.updatedAt);
    })
    .map(t=>summary(t,viewer));
}

function agents(ticket) {
  const found = new Map();
  for(const person of store.allPeople())if(person.system && person.account && person.account.enabled && isAgent(person,ticket))found.set(person.id,brief(person.id));
  // Permissions belong to sign-in accounts. A linked company profile may have a
  // handler account other than the staff record's primary account.
  for(const info of store.listLogins()){
    const login=store.getLogin(info.id);
    if(!login.account || !login.account.enabled || (login.guest && !login.guest.sites.includes('portal')))continue;
    for(const profile of store.loginProfiles(login)){
      const viewer=store.viewOf(login,profile);
      if(viewer && !viewer.leftAt && isAgent(viewer,ticket))found.set(viewer.id,brief(viewer.id));
    }
  }
  return [...found.values()];
}

// Badge counts: tickets waiting on the person, plus (for IT) new tickets nobody has picked up.
function badgeCount(person) {
  let n = db.data.tickets.filter((t) => t.createdBy === person.id && t.status === "waiting").length;
  n += db.data.tickets.filter(t=>isAgent(person,t) && t.createdBy!==person.id && t.status === "open" && !t.assigneeId).length;
  return n;
}

// Data retention: closed or resolved tickets are deleted a while after they were closed.
function pruneClosed(cutoffIso) {
  const before = db.data.tickets.length;
  db.data.tickets = db.data.tickets.filter((t) => !((t.status === "closed" || t.status === "resolved") && (t.closedAt || t.updatedAt) < cutoffIso));
  const n = before - db.data.tickets.length;
  if (n) db.save();
  return n;
}

function statsBetween(from, to, viewer) {
  const inRange = (iso) => iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
  const visible=db.data.tickets.filter(t=>viewer ? canSee(viewer,t) : teamOf(t)==="technology");
  return { opened: visible.filter((t) => inRange(t.createdAt)).length, closed: visible.filter((t) => inRange(t.closedAt)).length, open: visible.filter((t) => t.status !== "resolved" && t.status !== "closed").length };
}

module.exports = { pruneClosed, statsBetween, MANAGE, TEAMS, TEAM_CATEGORIES, routing, canHandleAny, visibleAgents, recipients, replyRecipients, CATEGORIES, PRIORITIES, STATUSES, init, isAgent, canSee, createTicket, getTicket, reply, update, fullView, list, agents, badgeCount };
