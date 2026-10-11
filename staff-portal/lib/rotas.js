// Rotas & timesheets. People with "rotas.manage" plan shifts week by week; everyone can see the
// rota. Staff fill in a weekly timesheet (prefilled from their shifts) and submit it to their
// supervisor or anyone with "rotas.manage" for approval. Stored in DATA_DIR/rotas.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const MANAGE = "rotas.manage";

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "rotas.json", () => ({ shifts: [], timesheets: [] }));
}

const newId = () => crypto.randomBytes(8).toString("hex");

function validDay(v, label) {
  const s = String(v || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s + "T00:00:00Z"))) throw new store.ValidationError(`Choose a valid ${label || "date"}.`);
  return s;
}

function validTime(v, label) {
  const s = String(v || "").trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new store.ValidationError(`Enter a valid ${label} time.`);
  return s;
}

// The Monday of the week containing a date.
function weekStart(date) {
  const d = new Date(validDay(date) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function addDays(date, n) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

// Hours between two times, less the break; a finish earlier than the start runs past midnight.
function hoursOf(start, end, breakMins) {
  if (!start || !end) return 0;
  let span = minutes(end) - minutes(start);
  if (span <= 0) span += 24 * 60;
  return Math.max(0, Math.round(((span - (Number(breakMins) || 0)) / 60) * 100) / 100);
}

function cleanBreak(v) {
  const n = Number(v || 0);
  if (!(n >= 0 && n <= 600)) throw new store.ValidationError("Enter a break between 0 and 600 minutes.");
  return Math.round(n);
}

// ---------- Shifts ----------

function saveShift(input, existing) {
  const person = store.getPerson(input.personId);
  if (!person || person.system) throw new store.ValidationError("Choose who the shift is for.");
  const fields = {
    personId: person.id,
    date: validDay(input.date, "date"),
    start: validTime(input.start, "start"),
    end: validTime(input.end, "finish"),
    breakMins: cleanBreak(input.breakMins),
    note: String(input.note || "").trim().slice(0, 120),
  };
  if (existing) Object.assign(existing, fields);
  else db.data.shifts.push((existing = { id: newId(), ...fields }));
  db.save();
  return existing;
}

function getShift(id) {
  return db.data.shifts.find((s) => s.id === id) || null;
}

function deleteShift(shift) {
  db.data.shifts = db.data.shifts.filter((s) => s.id !== shift.id);
  db.save();
}

function shiftView(s) {
  return { ...s, hours: hoursOf(s.start, s.end, s.breakMins) };
}

function shiftsBetween(from, to, personId) {
  return db.data.shifts
    .filter((s) => s.date >= from && s.date <= to && (!personId || s.personId === personId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .map(shiftView);
}

// Copies one week's shifts onto another, skipping any that would duplicate one already there.
function copyWeek(fromWeek, toWeek) {
  const from = weekStart(fromWeek);
  const to = weekStart(toWeek);
  if (from === to) throw new store.ValidationError("Choose a different week to copy to.");
  const offset = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
  let added = 0;
  for (const s of db.data.shifts.filter((x) => x.date >= from && x.date <= addDays(from, 6))) {
    const date = addDays(s.date, offset);
    if (db.data.shifts.some((x) => x.personId === s.personId && x.date === date && x.start === s.start)) continue;
    db.data.shifts.push({ ...s, id: newId(), date });
    added++;
  }
  db.save();
  return added;
}

// ---------- Timesheets ----------

function canApprove(viewer, sheet) {
  const person = store.getPerson(sheet.personId);
  if (!person) return store.can(viewer, MANAGE);
  if (viewer.id === person.id) return store.isOwner(viewer);
  return store.can(viewer, MANAGE) || store.supervises(viewer, person);
}

function blankSheet(person, week) {
  const shifts = shiftsBetween(week, addDays(week, 6), person.id);
  return {
    id: null,
    personId: person.id,
    week,
    status: "draft",
    days: [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const date = addDays(week, i);
      const s = shifts.find((x) => x.date === date);
      return { date, start: s ? s.start : "", end: s ? s.end : "", breakMins: s ? s.breakMins : 0, note: "" };
    }),
    fromRota: shifts.length > 0,
  };
}

function findSheet(personId, week) {
  return db.data.timesheets.find((t) => t.personId === personId && t.week === week) || null;
}

function getSheet(id) {
  return db.data.timesheets.find((t) => t.id === id) || null;
}

function saveSheet(person, input) {
  const week = weekStart(input.week);
  let sheet = findSheet(person.id, week);
  if (sheet && (sheet.status === "submitted" || sheet.status === "approved")) {
    throw new store.ValidationError(sheet.status === "approved" ? "This timesheet has been approved, so it can't be changed." : "This timesheet is waiting for approval. Ask your approver to send it back if it needs changing.");
  }
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const date = addDays(week, i);
    const d = (Array.isArray(input.days) ? input.days : []).find((x) => x && x.date === date) || {};
    const start = d.start ? validTime(d.start, "start") : "";
    const end = d.end ? validTime(d.end, "finish") : "";
    if (!!start !== !!end) throw new store.ValidationError(`Enter both a start and finish time for ${new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long" })}, or leave both empty.`);
    return { date, start, end, breakMins: start ? cleanBreak(d.breakMins) : 0, note: String(d.note || "").trim().slice(0, 200) };
  });
  const submit = !!input.submit;
  if (submit && !days.some((d) => d.start)) throw new store.ValidationError("Add the hours you worked before submitting.");
  const now = new Date().toISOString();
  if (!sheet) {
    sheet = { id: newId(), personId: person.id, week, createdAt: now };
    db.data.timesheets.push(sheet);
  }
  Object.assign(sheet, {
    days,
    status: submit ? "submitted" : "draft",
    submittedAt: submit ? now : null,
    updatedAt: now,
    decidedBy: null,
    decidedAt: null,
    decisionNote: submit ? "" : sheet.decisionNote || "",
  });
  db.save();
  return sheet;
}

function decide(sheet, approve, viewer, note) {
  if (sheet.status !== "submitted") throw new store.ValidationError("That timesheet isn't waiting for approval.");
  if (!canApprove(viewer, sheet)) throw new store.ValidationError("You can't approve that timesheet.");
  sheet.status = approve ? "approved" : "rejected";
  sheet.decidedBy = viewer.id;
  sheet.decidedAt = new Date().toISOString();
  sheet.decisionNote = String(note || "").trim().slice(0, 500);
  db.save();
}

function totalHours(sheet) {
  return Math.round(sheet.days.reduce((n, d) => n + hoursOf(d.start, d.end, d.breakMins), 0) * 100) / 100;
}

function sheetView(sheet, viewer) {
  const p = store.getPerson(sheet.personId);
  const by = sheet.decidedBy ? store.getPerson(sheet.decidedBy) : null;
  return {
    ...sheet,
    person: p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl } : { displayName: "Former staff" },
    days: sheet.days.map((d) => ({ ...d, hours: hoursOf(d.start, d.end, d.breakMins) })),
    totalHours: totalHours(sheet),
    decidedByName: by ? by.displayName : null,
    canApprove: sheet.status === "submitted" && !!viewer && canApprove(viewer, sheet),
  };
}

function myRecent(person) {
  return db.data.timesheets.filter((t) => t.personId === person.id).sort((a, b) => b.week.localeCompare(a.week)).slice(0, 12).map((t) => sheetView(t, person));
}

function forReview(viewer) {
  const mine = db.data.timesheets.filter((t) => t.status !== "draft" && canApprove(viewer, t));
  return {
    waiting: mine.filter((t) => t.status === "submitted").sort((a, b) => a.week.localeCompare(b.week)).map((t) => sheetView(t, viewer)),
    recent: mine.filter((t) => t.status !== "submitted").sort((a, b) => (b.decidedAt || "").localeCompare(a.decidedAt || "")).slice(0, 20).map((t) => sheetView(t, viewer)),
  };
}

function pendingApprovalCount(viewer) {
  return db.data.timesheets.filter((t) => t.status === "submitted" && canApprove(viewer, t)).length;
}

function isApprover(viewer) {
  return store.can(viewer, MANAGE) || store.employees().some((p) => store.supervises(viewer, p));
}

module.exports = {
  MANAGE, init, weekStart, addDays, hoursOf, saveShift, getShift, deleteShift, shiftsBetween, copyWeek,
  blankSheet, findSheet, getSheet, saveSheet, decide, sheetView, myRecent, forReview, pendingApprovalCount, isApprover,
};
