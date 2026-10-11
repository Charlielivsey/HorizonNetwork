// Leave & absence. Staff request time off, which their supervisor (or anyone with "leave.manage")
// approves. Sickness is recorded straight away. Annual leave comes out of a yearly allowance
// (January to December) counted in working days: weekends and bank holidays don't count.
// Stored in DATA_DIR/leave.json.

const crypto = require("crypto");
const store = require("./store");
const calendar = require("./calendar");
const datafile = require("./datafile");

const TYPES = {
  annual: "Annual leave",
  sick: "Sickness",
  compassionate: "Compassionate leave",
  unpaid: "Unpaid leave",
  other: "Other absence",
};
const MANAGE = "leave.manage";
const DEFAULT_ALLOWANCE = 25;

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "leave.json", () => ({ requests: [], allowances: {}, defaultAllowance: DEFAULT_ALLOWANCE }));
}

const newId = () => crypto.randomBytes(8).toString("hex");
const today = () => new Date().toISOString().slice(0, 10);

function validDay(v, label) {
  const s = String(v || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s + "T00:00:00Z"))) throw new store.ValidationError(`Choose a valid ${label}.`);
  return s;
}

// Working days between two dates (inclusive): Monday to Friday, not bank holidays.
function workingDays(from, to) {
  let n = 0;
  for (let d = new Date(from + "T12:00:00Z"); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6 && !calendar.BANK_HOLIDAYS[d.toISOString().slice(0, 10)]) n++;
  }
  return n;
}

function allowanceFor(personId) {
  const a = db.data.allowances[personId];
  return typeof a === "number" ? a : db.data.defaultAllowance;
}

function setAllowance(personId, days) {
  if (days === "" || days === null || days === undefined) delete db.data.allowances[personId];
  else {
    const n = Number(days);
    if (!(n >= 0 && n <= 100)) throw new store.ValidationError("Enter an allowance between 0 and 100 days.");
    db.data.allowances[personId] = Math.round(n * 2) / 2;
  }
  db.save();
}

function setDefaultAllowance(days) {
  const n = Number(days);
  if (!(n >= 0 && n <= 100)) throw new store.ValidationError("Enter an allowance between 0 and 100 days.");
  db.data.defaultAllowance = Math.round(n * 2) / 2;
  db.save();
}

// Annual leave used in a year: approved and pending requests that start in that year.
function summary(personId, year) {
  const y = String(year || new Date().getFullYear());
  const annual = db.data.requests.filter((r) => r.personId === personId && r.type === "annual" && r.startDate.startsWith(y));
  const sum = (list) => list.reduce((n, r) => n + r.days, 0);
  const approved = annual.filter((r) => r.status === "approved");
  const allowance = allowanceFor(personId);
  const taken = sum(approved.filter((r) => r.endDate < today()));
  const booked = sum(approved.filter((r) => r.endDate >= today()));
  const pending = sum(annual.filter((r) => r.status === "pending"));
  const sickDays = sum(db.data.requests.filter((r) => r.personId === personId && r.type === "sick" && r.status === "approved" && r.startDate.startsWith(y)));
  return { year: Number(y), allowance, taken, booked, pending, remaining: allowance - taken - booked - pending, sickDays };
}

function canApprove(approver, request) {
  const person = store.getPerson(request.personId);
  if (!person) return store.can(approver, MANAGE);
  if (approver.id === person.id) return store.isOwner(approver); // only the owner can approve their own
  return store.can(approver, MANAGE) || store.supervises(approver, person);
}

function createRequest(person, input, by) {
  const type = TYPES[input.type] ? input.type : "annual";
  const startDate = validDay(input.startDate, "start date");
  const endDate = input.endDate ? validDay(input.endDate, "end date") : startDate;
  if (endDate < startDate) throw new store.ValidationError("The end date can't be before the start date.");
  if ((Date.parse(endDate) - Date.parse(startDate)) / 86400000 > 366) throw new store.ValidationError("Requests can be at most a year long.");
  const halfDay = startDate === endDate && (input.halfDay === "am" || input.halfDay === "pm") ? input.halfDay : "";
  let days = workingDays(startDate, endDate);
  if (halfDay && days) days = 0.5;
  if (!days) throw new store.ValidationError("Those dates are all weekends or bank holidays, so there's nothing to book.");
  const overlap = db.data.requests.find((r) => r.personId === person.id && (r.status === "pending" || r.status === "approved") && r.startDate <= endDate && r.endDate >= startDate);
  if (overlap) throw new store.ValidationError(`That overlaps ${overlap.status === "pending" ? "a pending request" : "leave already booked"} (${overlap.startDate} to ${overlap.endDate}).`);
  if (type === "annual") {
    const s = summary(person.id, startDate.slice(0, 4));
    if (days > s.remaining) throw new store.ValidationError(`That's ${days} days, but only ${s.remaining} ${s.remaining === 1 ? "day is" : "days are"} left for ${startDate.slice(0, 4)}.`);
  }
  // Sickness is a record rather than a request; HR or a supervisor recording leave for someone approves it too.
  const autoApprove = type === "sick" || (by && by.id !== person.id && canApprove(by, { personId: person.id }));
  const r = {
    id: newId(),
    personId: person.id,
    type,
    startDate,
    endDate,
    halfDay,
    days,
    note: String(input.note || "").trim().slice(0, 500),
    status: autoApprove ? "approved" : "pending",
    createdBy: by ? by.id : person.id,
    createdAt: new Date().toISOString(),
    decidedBy: autoApprove ? (by ? by.id : person.id) : null,
    decidedAt: autoApprove ? new Date().toISOString() : null,
    decisionNote: "",
  };
  db.data.requests.push(r);
  db.save();
  return r;
}

function getRequest(id) {
  return db.data.requests.find((r) => r.id === id) || null;
}

function decide(request, approve, approver, note) {
  if (request.status !== "pending") throw new store.ValidationError("That request has already been dealt with.");
  if (!canApprove(approver, request)) throw new store.ValidationError("You can't approve that request.");
  if (approve && request.type === "annual") {
    const s = summary(request.personId, request.startDate.slice(0, 4));
    // `remaining` already counts this pending request, so it only fails if the allowance was lowered since.
    if (s.remaining < 0) throw new store.ValidationError("Approving this would take them over their allowance.");
  }
  request.status = approve ? "approved" : "declined";
  request.decidedBy = approver.id;
  request.decidedAt = new Date().toISOString();
  request.decisionNote = String(note || "").trim().slice(0, 500);
  db.save();
}

// People can cancel their own pending requests, and approved leave that hasn't started yet.
// Managers can cancel anything.
function cancel(request, by) {
  const own = request.personId === by.id;
  if (request.status === "cancelled" || request.status === "declined") throw new store.ValidationError("That request is no longer active.");
  if (!store.can(by, MANAGE) && !(own && (request.status === "pending" || request.startDate > today()))) {
    throw new store.ValidationError("Leave that has already started can only be cancelled by HR.");
  }
  request.status = "cancelled";
  request.decidedBy = by.id;
  request.decidedAt = new Date().toISOString();
  db.save();
}

function personBrief(id) {
  const p = store.getPerson(id);
  if (!p) return { id, displayName: "Former staff" };
  const v = store.publicView(p);
  return { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, company: p.company, avatarUrl: v.avatarUrl };
}

function view(r, viewer) {
  const own = r.personId === viewer.id;
  const manager = store.can(viewer, MANAGE) || canApprove(viewer, r);
  return {
    id: r.id,
    person: personBrief(r.personId),
    type: r.type,
    typeLabel: TYPES[r.type],
    startDate: r.startDate,
    endDate: r.endDate,
    halfDay: r.halfDay,
    days: r.days,
    // Notes can be personal (especially for sickness), so only the person and their approvers see them.
    note: own || manager ? r.note : "",
    status: r.status,
    createdAt: r.createdAt,
    decidedBy: r.decidedBy ? personBrief(r.decidedBy).displayName : null,
    decidedAt: r.decidedAt,
    decisionNote: own || manager ? r.decisionNote : "",
    canApprove: r.status === "pending" && canApprove(viewer, r),
    canCancel: (r.status === "pending" || r.status === "approved") && (store.can(viewer, MANAGE) || (own && (r.status === "pending" || r.startDate > today()))),
  };
}

const newestFirst = (a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt.localeCompare(a.createdAt);

function mine(person) {
  return db.data.requests.filter((r) => r.personId === person.id).sort(newestFirst).map((r) => view(r, person));
}

// Requests the viewer can approve, and (for approvers) recent decisions on their team.
function approvals(viewer) {
  return db.data.requests.filter((r) => r.status === "pending" && canApprove(viewer, r))
    .sort((a, b) => a.startDate.localeCompare(b.startDate)).map((r) => view(r, viewer));
}

function pendingApprovalCount(viewer) {
  return db.data.requests.filter((r) => r.status === "pending" && canApprove(viewer, r)).length;
}

// Everyone's leave for the team view: what the viewer manages in full, everyone else's approved leave without details.
function team(viewer, from, to) {
  const manager = store.can(viewer, MANAGE);
  return db.data.requests
    .filter((r) => r.status === "approved" && r.endDate >= from && r.startDate <= to)
    .filter((r) => manager || r.personId === viewer.id || store.supervises(viewer, store.getPerson(r.personId)))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((r) => view(r, viewer));
}

// For the company calendar: approved leave for everyone, without the reason.
function calendarItems(from, to) {
  return db.data.requests
    .filter((r) => r.status === "approved" && r.endDate >= from && r.startDate <= to && store.getPerson(r.personId))
    .map((r) => {
      const p = store.getPerson(r.personId);
      return {
        kind: "leave",
        id: "lv-" + r.id,
        title: p.displayName + (r.type === "annual" ? " – on holiday" : " – out of office"),
        personId: p.id,
        startDate: r.startDate,
        endDate: r.endDate,
        allDay: true,
        halfDay: r.halfDay,
      };
    });
}

function isOffToday(personId) {
  const t = today();
  return db.data.requests.some((r) => r.personId === personId && r.status === "approved" && r.startDate <= t && r.endDate >= t);
}

function allowances() {
  return { defaultAllowance: db.data.defaultAllowance, custom: db.data.allowances };
}

module.exports = {
  TYPES, MANAGE, init, workingDays, summary, createRequest, getRequest, decide, cancel, mine, approvals,
  pendingApprovalCount, team, calendarItems, isOffToday, allowances, setAllowance, setDefaultAllowance, allowanceFor,
};
