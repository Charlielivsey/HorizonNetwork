// Mentoring. Anyone can ask someone to be their mentor; the mentor accepts or declines. HR
// (staff.manage) can also pair people directly. Each pairing has goals, a catch-up frequency and a
// shared notebook that only the two of them can read. A reminder shows when a catch-up is due.
// Stored in DATA_DIR/mentoring.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const STATUSES = { requested: "Waiting for the mentor", active: "Active", declined: "Declined", ended: "Ended" };

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "mentoring.json", () => ({ pairs: [] }));
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);
const brief = (id) => { const p = id ? store.getPerson(id) : null; return p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl } : { displayName: "Former staff" }; };

function addDays(date, n) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function create(input, by) {
  const hr = store.can(by, "staff.manage");
  const menteeId = hr && input.menteeId ? input.menteeId : by.id;
  const mentor = store.getPerson(input.mentorId), mentee = store.getPerson(menteeId);
  if (!mentor || mentor.system || !mentee || mentee.system) throw new store.ValidationError("Choose a mentor.");
  if (mentor.id === mentee.id) throw new store.ValidationError("Someone can't mentor themselves.");
  if (db.data.pairs.some((p) => p.mentorId === mentor.id && p.menteeId === mentee.id && (p.status === "active" || p.status === "requested"))) throw new store.ValidationError("They're already paired.");
  const weeks = [1, 2, 4, 6, 8].includes(Number(input.everyWeeks)) ? Number(input.everyWeeks) : 4;
  const pair = {
    id: newId(), mentorId: mentor.id, menteeId: mentee.id, goals: str(input.goals, 2000), everyWeeks: weeks,
    status: hr && input.menteeId ? "active" : "requested", requestedBy: by.id, createdAt: new Date().toISOString(),
    startedAt: hr && input.menteeId ? today() : null, nextCatchUp: hr && input.menteeId ? addDays(today(), weeks * 7) : null, notes: [], meetings: [],
  };
  db.data.pairs.push(pair);
  db.save();
  return pair;
}

function get(id) {
  return db.data.pairs.find((p) => p.id === id) || null;
}

const inPair = (p, person) => p.mentorId === person.id || p.menteeId === person.id;

function respond(p, accept, by) {
  if (p.status !== "requested" || p.mentorId !== by.id) throw new store.ValidationError("Only the mentor can answer this request.");
  p.status = accept ? "active" : "declined";
  if (accept) { p.startedAt = today(); p.nextCatchUp = addDays(today(), p.everyWeeks * 7); }
  db.save();
}

// A catch-up happened: record it and set the next one.
function logMeeting(p, input, by) {
  if (!inPair(p, by) || p.status !== "active") throw new store.ValidationError("You can't add to this mentoring.");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date || "") ? input.date : today();
  p.meetings.push({ id: newId(), date, by: by.id, summary: str(input.summary, 3000), actions: str(input.actions, 1000) });
  p.nextCatchUp = /^\d{4}-\d{2}-\d{2}$/.test(input.next || "") ? input.next : addDays(date, p.everyWeeks * 7);
  db.save();
}

function addNote(p, text, by) {
  if (!inPair(p, by)) throw new store.ValidationError("You can't add to this mentoring.");
  const t = str(text, 3000);
  if (!t) throw new store.ValidationError("Write a note first.");
  p.notes.push({ id: newId(), by: by.id, text: t, at: new Date().toISOString() });
  db.save();
}

function update(p, input, by) {
  if (!inPair(p, by) && !store.can(by, "staff.manage")) throw new store.ValidationError("You can't change this mentoring.");
  if ("goals" in input) p.goals = str(input.goals, 2000);
  if ([1, 2, 4, 6, 8].includes(Number(input.everyWeeks))) p.everyWeeks = Number(input.everyWeeks);
  if (input.end) p.status = "ended";
  db.save();
}

function view(p, viewer) {
  const member = inPair(p, viewer);
  return {
    id: p.id, mentor: brief(p.mentorId), mentee: brief(p.menteeId), status: p.status, statusLabel: STATUSES[p.status], goals: p.goals, everyWeeks: p.everyWeeks,
    startedAt: p.startedAt, nextCatchUp: p.nextCatchUp, due: p.status === "active" && p.nextCatchUp && p.nextCatchUp <= today(),
    role: p.mentorId === viewer.id ? "mentor" : p.menteeId === viewer.id ? "mentee" : null,
    // The notebook and meeting notes are private to the two of them.
    notes: member ? p.notes.map((n) => ({ ...n, author: brief(n.by) })).reverse() : null,
    meetings: member ? p.meetings.slice().reverse().map((m) => ({ ...m, byName: brief(m.by).displayName })) : null,
    meetingCount: p.meetings.length,
    canRespond: p.status === "requested" && p.mentorId === viewer.id,
  };
}

function forViewer(viewer) {
  const mine = db.data.pairs.filter((p) => inPair(p, viewer) && p.status !== "declined").map((p) => view(p, viewer));
  const all = store.can(viewer, "staff.manage") ? db.data.pairs.filter((p) => !inPair(p, viewer) && p.status !== "declined").map((p) => view(p, viewer)) : [];
  return { mine, all, statuses: STATUSES };
}

function dueCount(viewer) {
  return db.data.pairs.filter((p) => inPair(p, viewer) && ((p.status === "active" && p.nextCatchUp && p.nextCatchUp <= today()) || (p.status === "requested" && p.mentorId === viewer.id))).length;
}

module.exports = { STATUSES, init, create, get, respond, logMeeting, addNote, update, view, forViewer, dueCount };
