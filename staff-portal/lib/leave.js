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
  toil: "Time off in lieu",
};
// TOIL is earned in hours and taken in days of this length.
const TOIL_HOURS_PER_DAY = 7.5;
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
  if (db.data.maxOffPerCompany === undefined) { db.data.maxOffPerCompany = 3; changed = true; }
  if (!db.data.shutdowns) { db.data.shutdowns = []; changed = true; }
  if (!db.data.toil) { db.data.toil = {}; changed = true; }
  if (!db.data.patterns) { db.data.patterns = {}; changed = true; }
  if (changed) db.save();
  // Leave starts and ends at midnight, so check statuses regularly as well as on every change.
  if (!statusTimer) {
    statusTimer = setInterval(() => { try { syncStatuses(); } catch (e) { console.error("Leave status sync failed:", e.message); } }, 5 * 60 * 1000);
    statusTimer.unref();
  }
  syncStatuses();
}

let statusTimer = null;
const isWorkingDay = (iso) => {
  const day = new Date(iso + "T12:00:00Z").getUTCDay();
  return day !== 0 && day !== 6 && !calendar.BANK_HOLIDAYS[iso];
};
function addDay(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function nextWorkingDay(iso) {
  let d = addDay(iso, 1);
  while (!isWorkingDay(d)) d = addDay(d, 1);
  return d;
}
const shortDate = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// Approved leave (not sickness) puts the person "Out of office" with their return date, and puts
// back whatever status they had before once it ends or is cancelled. If they change their status
// themselves during the leave, that's left alone.
function syncStatuses(personId) {
  const t = today();
  const people = personId ? [store.getPerson(personId)].filter(Boolean) : store.employees();
  for (const p of people) {
    if (p.system) continue;
    const mineActive = db.data.requests.filter((r) => r.personId === p.id && r.status === "approved" && r.type !== "sick");
    const now = mineActive.filter((r) => r.startDate <= t && r.endDate >= t).sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
    const st = p.status;
    const ours = st && st.auto === "leave";
    if (now) {
      // Back-to-back bookings count as one absence: follow them to the real return date.
      let end = now.endDate;
      for (let next; (next = mineActive.find((r) => r.startDate > end && r.startDate <= nextWorkingDay(end) && r.endDate > end));) end = next.endDate;
      const half = now.halfDay && now.startDate === now.endDate && end === now.endDate;
      const message = half ? `${TYPES[now.type]} this ${now.halfDay === "am" ? "morning" : "afternoon"}` : `${TYPES[now.type]} \u00b7 back ${shortDate(nextWorkingDay(end))}`;
      if (ours) {
        if (st.message !== message || st.until !== end || st.leaveId !== now.id) {
          now.statusSet = true;
          db.save();
          store.setLeaveStatus(p, Object.assign({}, st, { message, until: end, leaveId: now.id }));
        }
      } else if (!now.statusSet) {
        now.statusSet = true;
        db.save();
        const prev = store.currentStatus(p) ? { type: st.type, message: st.message || "", until: st.until || null } : null;
        store.setLeaveStatus(p, { type: "ooo", message, until: end, auto: "leave", leaveId: now.id, previous: prev });
      }
    } else if (ours) {
      const prev = st.previous;
      store.setLeaveStatus(p, prev && (!prev.until || prev.until >= t) ? prev : null);
    }
  }
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
  return baseAllowance(personId) + carriedInto(personId, year || new Date().getFullYear()) + bankHolidayAdjustment(personId, year || new Date().getFullYear()).adjustment;
}

// ---------- Work patterns and bank holidays ----------
// Most people work Monday to Friday. Part-time and shift staff can have their own working days.
// Bank holidays are shared out fairly: everyone gets bank holidays in proportion to the days they
// work (a 3-day week gets 3/5 of them). The ones that fall on their working days they get off
// anyway; the difference is added to (or taken from) their holiday allowance.

const FULL_WEEK = [1, 2, 3, 4, 5];

function patternOf(personId) {
  const p = db.data.patterns[personId];
  return Array.isArray(p) && p.length ? p : FULL_WEEK;
}

function setPattern(personId, days) {
  const clean = [...new Set((Array.isArray(days) ? days : []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
  if (!clean.length) throw new store.ValidationError("Choose at least one working day.");
  if (clean.join() === FULL_WEEK.join()) delete db.data.patterns[personId];
  else db.data.patterns[personId] = clean;
  db.save();
}

function bankHolidaysIn(year) {
  return Object.keys(calendar.BANK_HOLIDAYS).filter((d) => d.startsWith(String(year)));
}

function bankHolidayAdjustment(personId, year) {
  const pattern = patternOf(personId);
  const holidays = bankHolidaysIn(year);
  if (pattern.join() === FULL_WEEK.join() || !holidays.length) return { entitled: holidays.length, onWorkingDays: holidays.length, adjustment: 0 };
  const entitled = Math.round((holidays.length * pattern.length / 5) * 2) / 2;
  const onWorkingDays = holidays.filter((d) => pattern.includes(new Date(d + "T12:00:00Z").getUTCDay())).length;
  return { entitled, onWorkingDays, adjustment: Math.round((entitled - onWorkingDays) * 2) / 2 };
}

// Working days in a range for one person: their pattern, less bank holidays.
function workingDaysFor(personId, from, to) {
  const pattern = patternOf(personId);
  let n = 0;
  for (let d = new Date(from + "T12:00:00Z"); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    if (pattern.includes(d.getUTCDay()) && !calendar.BANK_HOLIDAYS[d.toISOString().slice(0, 10)]) n++;
  }
  return n;
}

function patternLabel(personId) {
  const p = patternOf(personId);
  if (p.join() === FULL_WEEK.join()) return "Mon–Fri";
  return p.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ");
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
  const bh = bankHolidayAdjustment(personId, y);
  return { year: Number(y), allowance, base: allowance - carried - bh.adjustment, carried, bankHolidayAdjustment: bh.adjustment, bankHolidays: bh, pattern: patternOf(personId), patternLabel: patternLabel(personId), taken, booked, pending, remaining: allowance - taken - booked - pending, sickDays, toilHours: toilBalance(personId) };
}

function canApprove(approver, request) {
  const person = store.getPerson(request.personId);
  if (!person) return store.can(approver, MANAGE);
  if (approver.id === person.id) return store.isOwner(approver); // only the owner can approve their own
  return store.can(approver, MANAGE) || store.supervises(approver, person);
}

function createRequest(person, input, by, opts) {
  const type = TYPES[input.type] ? input.type : "annual";
  const startDate = validDay(input.startDate, "start date");
  const endDate = input.endDate ? validDay(input.endDate, "end date") : startDate;
  if (endDate < startDate) throw new store.ValidationError("The end date can't be before the start date.");
  if ((Date.parse(endDate) - Date.parse(startDate)) / 86400000 > 366) throw new store.ValidationError("Requests can be at most a year long.");
  const halfDay = startDate === endDate && (input.halfDay === "am" || input.halfDay === "pm") ? input.halfDay : "";
  let days = workingDaysFor(person.id, startDate, endDate);
  if (halfDay && days) days = 0.5;
  if (!days) throw new store.ValidationError("Those dates are all weekends or bank holidays, so there's nothing to book.");
  const overlap = db.data.requests.find((r) => r.personId === person.id && (r.status === "pending" || r.status === "approved") && r.startDate <= endDate && r.endDate >= startDate);
  if (overlap) throw new store.ValidationError(`That overlaps ${overlap.status === "pending" ? "a pending request" : "leave already booked"} (${overlap.startDate} to ${overlap.endDate}).`);
  // Going over the allowance is allowed, but it always needs approving by hand (see decide).
  if (type === "toil") {
    const bal = toilBalance(person.id);
    if (days * TOIL_HOURS_PER_DAY > bal + 0.001) throw new store.ValidationError(`That's ${days * TOIL_HOURS_PER_DAY} hours of time off in lieu, but ${bal} ${bal === 1 ? "hour is" : "hours are"} available.`);
  }
  // Sickness is a record rather than a request; HR or a supervisor recording leave for someone approves it too.
  const autoApprove = type === "sick" || !!(opts && opts.shutdownId) || (by && by.id !== person.id && canApprove(by, { personId: person.id }));
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
  if (opts && opts.shutdownId) r.shutdownId = opts.shutdownId;
  db.data.requests.push(r);
  db.save();
  syncStatuses(person.id);
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
  syncStatuses(request.personId);
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
  syncStatuses(request.personId);
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
    clash: manager && (r.status === "pending" || r.status === "approved") && r.type !== "sick" ? clashFor(r) : null,
    shutdown: r.shutdownId ? true : undefined,
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
  return { defaultAllowance: db.data.defaultAllowance, custom: db.data.allowances, maxCarryOver: db.data.maxCarryOver, maxOffPerCompany: db.data.maxOffPerCompany };
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

// ---------- Clashes: too many people from one company off at once ----------

function companiesOf(p) {
  return [p.company].concat((p.otherRoles || []).map((r) => r.company));
}

function datesOf(r) {
  const out = [];
  for (let d = r.startDate; d <= r.endDate; d = addDay(d, 1)) if (isWorkingDay(d)) out.push(d);
  return out;
}

// The busiest working day of a request: how many others from the same company are off then
// (approved or waiting), if that reaches the limit.
function clashFor(r) {
  const max = db.data.maxOffPerCompany;
  const person = store.getPerson(r.personId);
  if (!max || !person || r.shutdownId) return null;
  const mineCo = companiesOf(person);
  const others = db.data.requests.filter((x) => x.id !== r.id && x.personId !== r.personId && x.type !== "sick" && !x.shutdownId && (x.status === "approved" || x.status === "pending") && x.endDate >= r.startDate && x.startDate <= r.endDate);
  let worst = null;
  for (const d of datesOf(r)) {
    for (const company of mineCo) {
      const names = new Set();
      for (const x of others) {
        if (x.startDate > d || x.endDate < d) continue;
        const p = store.getPerson(x.personId);
        if (p && companiesOf(p).includes(company)) names.add(p.displayName);
      }
      if (names.size >= max && (!worst || names.size > worst.count)) worst = { date: d, company, count: names.size, names: [...names].slice(0, 6) };
    }
  }
  return worst;
}

function setMaxOffPerCompany(n) {
  const v = Number(n);
  if (!(v >= 0 && v <= 100)) throw new store.ValidationError("Enter a number between 0 and 100 (0 turns the warning off).");
  db.data.maxOffPerCompany = Math.round(v);
  db.save();
}

// A month grid of who's off: everyone (or one company), each working day. Reasons are never
// shown; sickness shows as plain "Off" unless the viewer manages leave.
function grid(viewer, month, company) {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const days = [];
  for (let d = first; d <= last; d = addDay(d, 1)) days.push({ date: d, weekend: [0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay()), bankHoliday: calendar.BANK_HOLIDAYS[d] || null });
  const manager = store.can(viewer, MANAGE);
  const people = store.employees().filter((p) => !company || companiesOf(p).includes(company))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const ids = new Set(people.map((p) => p.id));
  const reqs = db.data.requests.filter((r) => ids.has(r.personId) && (r.status === "approved" || r.status === "pending") && r.endDate >= first && r.startDate <= last);
  const rows = people.map((p) => {
    const cells = {};
    for (const r of reqs) {
      if (r.personId !== p.id) continue;
      for (let d = r.startDate < first ? first : r.startDate; d <= (r.endDate > last ? last : r.endDate); d = addDay(d, 1)) {
        if (!isWorkingDay(d)) continue;
        const hidden = r.type === "sick" && !manager && r.personId !== viewer.id;
        cells[d] = { type: hidden ? "off" : r.type, label: hidden ? "Off" : TYPES[r.type], pending: r.status === "pending", half: r.halfDay || "", shutdown: !!r.shutdownId };
      }
    }
    const v = store.publicView(p);
    return { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, company: p.company, avatarUrl: v.avatarUrl, cells };
  });
  // Days where a company hits the limit.
  const clashes = {};
  const max = db.data.maxOffPerCompany;
  if (max) {
    for (const d of days) {
      if (d.weekend || d.bankHoliday) continue;
      for (const c of store.COMPANIES) {
        if (company && c !== company) continue;
        const n = rows.filter((row) => row.cells[d.date] && row.cells[d.date].type !== "sick" && !row.cells[d.date].shutdown && companiesOf(store.getPerson(row.id)).includes(c)).length;
        if (n > max) (clashes[d.date] = clashes[d.date] || []).push({ company: c, count: n });
      }
    }
  }
  return { month, days, rows, clashes, maxOffPerCompany: max, shutdowns: db.data.shutdowns.filter((s) => s.endDate >= first && s.startDate <= last).map(shutdownView) };
}

// ---------- Company shutdown days ----------

// Books the same days off for everyone (or chosen companies) in one go. Each person gets an
// approved annual leave booking, so it comes out of their allowance. People who already have
// leave on those days are skipped and listed.
function createShutdown(input, by) {
  const name = String(input.name || "").trim().slice(0, 80);
  if (!name) throw new store.ValidationError("Give the shutdown a name, like “Christmas closure”.");
  const startDate = validDay(input.startDate, "first day");
  const endDate = input.endDate ? validDay(input.endDate, "last day") : startDate;
  if (endDate < startDate) throw new store.ValidationError("The last day can't be before the first day.");
  if (workingDays(startDate, endDate) === 0) throw new store.ValidationError("Those dates are all weekends or bank holidays.");
  const companies = (Array.isArray(input.companies) ? input.companies : []).filter((c) => store.COMPANIES.includes(c));
  const s = { id: newId(), name, startDate, endDate, companies, createdBy: by.id, createdAt: new Date().toISOString(), requestIds: [], skipped: [] };
  for (const p of store.employees()) {
    if (companies.length && !companiesOf(p).some((c) => companies.includes(c))) continue;
    try {
      const r = createRequest(p, { type: "annual", startDate, endDate, note: name }, by, { shutdownId: s.id });
      s.requestIds.push(r.id);
    } catch (err) {
      if (!(err instanceof store.ValidationError)) throw err;
      s.skipped.push({ personId: p.id, displayName: p.displayName, reason: err.message });
    }
  }
  db.data.shutdowns.push(s);
  db.save();
  return s;
}

function deleteShutdown(id) {
  const s = db.data.shutdowns.find((x) => x.id === id);
  if (!s) throw new store.ValidationError("That shutdown doesn't exist.");
  const people = new Set();
  for (const r of db.data.requests) {
    if (r.shutdownId === s.id && r.status !== "cancelled") { r.status = "cancelled"; r.decidedAt = new Date().toISOString(); people.add(r.personId); }
  }
  db.data.shutdowns = db.data.shutdowns.filter((x) => x.id !== id);
  db.save();
  for (const p of people) syncStatuses(p);
  return s;
}

function shutdownView(s) {
  const by = store.getPerson(s.createdBy);
  return { ...s, days: workingDays(s.startDate, s.endDate), people: s.requestIds.length, byName: by ? by.displayName : "Former staff" };
}

function shutdowns() {
  return db.data.shutdowns.slice().sort((a, b) => b.startDate.localeCompare(a.startDate)).map(shutdownView);
}

// ---------- Time off in lieu ----------

// Hours earned (from extra hours on approved timesheets, or added by a manager) less the hours
// of TOIL taken or waiting for approval.
function toilBalance(personId) {
  const earned = (db.data.toil[personId] || []).reduce((n, t) => n + t.hours, 0);
  const used = db.data.requests.filter((r) => r.personId === personId && r.type === "toil" && (r.status === "approved" || r.status === "pending"))
    .reduce((n, r) => n + r.days * TOIL_HOURS_PER_DAY, 0);
  return Math.round((earned - used) * 100) / 100;
}

function addToil(person, hours, reason, by, source) {
  const h = Number(hours);
  if (!(h !== 0 && h >= -500 && h <= 500)) throw new store.ValidationError("Enter a number of hours.");
  if (h < 0 && toilBalance(person.id) + h < 0) throw new store.ValidationError("That would take their TOIL balance below zero.");
  const list = db.data.toil[person.id] || (db.data.toil[person.id] = []);
  list.push({ id: newId(), hours: Math.round(h * 100) / 100, reason: String(reason || "").trim().slice(0, 200) || (h > 0 ? "Extra hours" : "Adjustment"), source: source || "manual", by: by ? by.id : null, at: new Date().toISOString() });
  db.save();
}

function toilHistory(personId) {
  return (db.data.toil[personId] || []).slice().reverse().map((t) => {
    const p = t.by ? store.getPerson(t.by) : null;
    return { ...t, byName: p ? p.displayName : "System" };
  });
}

function leaveBetween(from, to) {
  const out = {};
  for (const r of db.data.requests) {
    if (r.status !== "approved" || r.endDate < from || r.startDate > to) continue;
    out[r.type] = (out[r.type] || 0) + r.days;
  }
  return out;
}

module.exports = {
  patternOf, setPattern, bankHolidayAdjustment, workingDaysFor, patternLabel,
  TOIL_HOURS_PER_DAY, clashFor, setMaxOffPerCompany, grid, createShutdown, deleteShutdown, shutdowns, toilBalance, addToil, toilHistory, leaveBetween,
  syncStatuses,
  TYPES, MANAGE, init, workingDays, summary, createRequest, getRequest, decide, cancel, mine, approvals,
  pendingApprovalCount, team, calendarItems, isOffToday, allowances, setAllowance, setDefaultAllowance, allowanceFor,
  setMaxCarryOver, pendingReturnToWork, completeReturnToWork, returnToWorkFor, absenceStats,
};
