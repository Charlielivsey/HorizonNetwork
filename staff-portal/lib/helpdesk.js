// IT Helpdesk. Anyone can raise a ticket and follow it; people with "helpdesk.manage" (the IT
// team) see every ticket, reply, add internal notes, assign tickets and change their status.
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
const PRIORITIES = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
const STATUSES = { open: "Open", "in-progress": "In progress", waiting: "Waiting on you", resolved: "Resolved", closed: "Closed" };

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "helpdesk.json", () => ({ tickets: [], nextNumber: 1001 }));
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function isAgent(person) {
  return store.can(person, MANAGE);
}

function canSee(person, t) {
  return isAgent(person) || t.createdBy === person.id;
}

function createTicket(person, input) {
  const subject = str(input.subject, 150);
  const body = str(input.body, 5000);
  if (!subject) throw new store.ValidationError("Add a short summary of the problem.");
  if (!body) throw new store.ValidationError("Describe the problem so the IT team can help.");
  const now = new Date().toISOString();
  const t = {
    id: newId(),
    number: db.data.nextNumber++,
    subject,
    category: CATEGORIES[input.category] ? input.category : "other",
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
  const agent = isAgent(person);
  const internal = agent && !!input.internal;
  t.messages.push({ id: newId(), authorId: person.id, body, internal, at: new Date().toISOString() });
  if (!internal) {
    // The requester replying puts it back with IT; IT replying to an open ticket means they're on it.
    if (person.id === t.createdBy && !agent && (t.status === "waiting" || t.status === "resolved")) t.status = "open";
    else if (agent && person.id !== t.createdBy && t.status === "open") t.status = "in-progress";
  }
  if (agent && !t.assigneeId && !internal) t.assigneeId = person.id;
  t.updatedAt = new Date().toISOString();
  db.save();
}

// IT can change everything; the person who raised it can mark it resolved/closed or reopen it.
function update(t, person, input) {
  const agent = isAgent(person);
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
    if (input.assigneeId && (!a || !isAgent(a))) throw new store.ValidationError("Choose someone on the IT team.");
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

function summary(t) {
  const last = t.messages[t.messages.length - 1];
  return {
    id: t.id,
    number: t.number,
    subject: t.subject,
    category: t.category,
    categoryLabel: CATEGORIES[t.category],
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
  const agent = isAgent(viewer);
  return {
    ...summary(t),
    messages: t.messages.filter((m) => agent || !m.internal).map((m) => ({ ...m, author: brief(m.authorId), fromIt: isAgent(store.getPerson(m.authorId) || {}) && m.authorId !== t.createdBy })),
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
    .map(summary);
}

function agents() {
  return store.employees().filter(isAgent).map((p) => brief(p.id));
}

// Badge counts: tickets waiting on the person, plus (for IT) new tickets nobody has picked up.
function badgeCount(person) {
  let n = db.data.tickets.filter((t) => t.createdBy === person.id && t.status === "waiting").length;
  if (isAgent(person)) n += db.data.tickets.filter((t) => t.status === "open" && !t.assigneeId).length;
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

function statsBetween(from, to) {
  const inRange = (iso) => iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
  return { opened: db.data.tickets.filter((t) => inRange(t.createdAt)).length, closed: db.data.tickets.filter((t) => inRange(t.closedAt)).length, open: db.data.tickets.filter((t) => t.status !== "resolved" && t.status !== "closed").length };
}

module.exports = { pruneClosed, statsBetween, MANAGE, CATEGORIES, PRIORITIES, STATUSES, init, isAgent, canSee, createTicket, getTicket, reply, update, fullView, list, agents, badgeCount };
