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
  // Carry-over and return-to-work forms only apply from the year/date they were switched on, so
  // years before the portal was used don't carry holiday forward.
  let changed = false;
  if (db.data.maxCarryOver === undefined) { db.data.maxCarryOver = 5; changed = true; }
  if (!db.data.carryOverFrom) { db.data.carryOverFrom = new Date().getFullYear(); changed = true; }
  if (!db.data.rtwFrom) { db.data.rtwFrom = new Date().toISOString().slice(0, 10); changed = true; }
  if (!db.data.rtw) { db.data.rtw = {}; changed = true; }
  if (changed) db.save();
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

// The base allowance for a year (custom or the default), before any carry-over.
function baseAllowance(personId) {
  const a = db.data.allowances[personId];
  return typeof a === "number" ? a : db.data.defaultAllowance;
}

// Unused annual leave from the year before, up to the carry-over limit.
function carriedInto(personId, year) {
  const prev = Number(year) - 1;
  if (prev < db.data.carryOverFrom || !db.data.maxCarryOver) return 0;
  const used = usedIn(personId, prev);
  const left = allowanceFor(personId, prev) - used.approved - used.pending;
  return Math.max(0, Math.min(db.data.maxCarryOver, left));
}

function allowanceFor(personId, year) {
  return baseAllowance(personId) + carriedInto(personId, year || new Date().getFullYear());
}

function usedIn(personId, year) {
  const y = String(year);
  const annual = db.data.requests.filter((r) => r.personId === personId && r.type === "annual" && r.startDate.startsWith(y));
  const total = (list) => list.reduce((n, r) => n + r.days, 0);
  return { approved: total(annual.filter((r) => r.status === "approved")), pending: total(annual.filter((r) => r.status === "pending")) };
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
  const allowance = allowanceFor(personId, y);
  const carried = carriedInto(personId, y);
  const taken = sum(approved.filter((r) => r.endDate < today()));
  const booked = sum(approved.filter((r) => r.endDate >= today()));
  const pending = sum(annual.filter((r) => r.status === "pending"));
  const sickDays = sum(db.data.requests.filter((r) => r.personId === personId && r.type === "sick" && r.status === "approved" && r.startDate.startsWith(y)));
  return { year: Number(y), allowance, base: allowance - carried, carried, taken, booked, pending, remaining: allowance - taken - booked - pending, sickDays };
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
  // Going over the allowance is allowed, but it always needs approving by hand (see decide).
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

// How many days of an active annual leave request go beyond the person's allowance for that year.
function overBy(r) {
  if (r.type !== "annual" || (r.status !== "pending" && r.status !== "approved")) return 0;
  const s = summary(r.personId, r.startDate.slice(0, 4));
  return Math.min(r.days, Math.max(0, -s.remaining));
}

function decide(request, approve, approver, note, allowOver) {
  if (request.status !== "pending") throw new store.ValidationError("That request has already been dealt with.");
  if (!canApprove(approver, request)) throw new store.ValidationError("You can't approve that request.");
  const over = approve ? overBy(request) : 0;
  if (over && !allowOver) throw new store.ValidationError(`This takes them ${over} ${over === 1 ? "day" : "days"} over their allowance. Confirm to approve it anyway.`);
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
    overBy: own || manager ? overBy(r) : 0,
    canApprove: r.status === "pending" && canApprove(viewer, r),
    canCancel: (r.status === "pending" || r.status === "approved") && (store.can(viewer, MANAGE) || (own && (r.status === "pending" || r.startDate > today()))),
    // Return-to-work forms: the details are for managers; the person just sees it was done.
    returnToWork: r.type === "sick" && db.data.rtw[r.id] ? (manager && !own ? returnToWorkFor(r.id) : { done: true }) : null,
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
  return { defaultAllowance: db.data.defaultAllowance, custom: db.data.allowances, maxCarryOver: db.data.maxCarryOver };
}

function setMaxCarryOver(days) {
  const n = Number(days);
  if (!(n >= 0 && n <= 50)) throw new store.ValidationError("Enter a carry-over limit between 0 and 50 days.");
  db.data.maxCarryOver = Math.round(n * 2) / 2;
  db.save();
}

// ---------- Return to work ----------

// Sickness that has ended and still needs a return-to-work form, for people the viewer looks after.
function pendingReturnToWork(viewer) {
  const t = today();
  return db.data.requests
    // Anything recorded since forms were switched on (or ending after), so old absences don't flood in.
    .filter((r) => r.type === "sick" && r.status === "approved" && r.endDate < t && (r.endDate >= db.data.rtwFrom || r.createdAt.slice(0, 10) >= db.data.rtwFrom) && !db.data.rtw[r.id])
    .filter((r) => { const p = store.getPerson(r.personId); return p && r.personId !== viewer.id && (store.can(viewer, MANAGE) || store.supervises(viewer, p)); })
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .map((r) => view(r, viewer));
}

function completeReturnToWork(request, input, by) {
  if (request.type !== "sick" || request.status !== "approved") throw new store.ValidationError("Return-to-work forms are only for sickness.");
  const p = store.getPerson(request.personId);
  if (!p || request.personId === by.id || !(store.can(by, MANAGE) || store.supervises(by, p))) throw new store.ValidationError("You can't complete this form.");
  const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
  if (!str(input.reason, 300)) throw new store.ValidationError("Say briefly what the absence was for.");
  db.data.rtw[request.id] = {
    meetingDate: /^\d{4}-\d{2}-\d{2}$/.test(input.meetingDate || "") ? input.meetingDate : today(),
    reason: str(input.reason, 300),
    workRelated: !!input.workRelated,
    fitForWork: input.fitForWork !== false,
    fitNote: !!input.fitNote,
    adjustments: str(input.adjustments, 1000),
    notes: str(input.notes, 2000),
    by: by.id,
    at: new Date().toISOString(),
  };
  db.save();
}

function returnToWorkFor(requestId) {
  const f = db.data.rtw[requestId];
  if (!f) return null;
  const by = store.getPerson(f.by);
  return { ...f, byName: by ? by.displayName : "Former staff" };
}

// Sickness over the last 52 weeks: occurrences (separate absences), days, and the Bradford Factor
// (occurrences² × days), which weights frequent short absences more heavily.
function absenceStats(personId) {
  const from = new Date(Date.now() - 364 * 86400000).toISOString().slice(0, 10);
  const list = db.data.requests.filter((r) => r.personId === personId && r.type === "sick" && r.status === "approved" && r.endDate >= from);
  const days = list.reduce((n, r) => n + r.days, 0);
  return { occurrences: list.length, days, bradford: list.length * list.length * days };
}

module.exports = {
  TYPES, MANAGE, init, workingDays, summary, createRequest, getRequest, decide, cancel, mine, approvals,
  pendingApprovalCount, team, calendarItems, isOffToday, allowances, setAllowance, setDefaultAllowance, allowanceFor,
  setMaxCarryOver, pendingReturnToWork, completeReturnToWork, returnToWorkFor, absenceStats,
};
