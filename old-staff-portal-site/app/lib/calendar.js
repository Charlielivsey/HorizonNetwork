// Company calendar: events added by staff with the "events.manage" permission, UK bank holidays,
// company holidays, and celebrations (shared birthdays and work anniversaries).
// Events are kept in DATA_DIR/events.json.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");

const EVENT_TYPES = ["event", "meeting", "social", "training", "holiday"];

// Bank holidays in England & Wales (gov.uk), including substitute days.
const BANK_HOLIDAYS = {
  "2025-01-01": "New Year's Day",
  "2025-04-18": "Good Friday",
  "2025-04-21": "Easter Monday",
  "2025-05-05": "Early May bank holiday",
  "2025-05-26": "Spring bank holiday",
  "2025-08-25": "Summer bank holiday",
  "2025-12-25": "Christmas Day",
  "2025-12-26": "Boxing Day",
  "2026-01-01": "New Year's Day",
  "2026-04-03": "Good Friday",
  "2026-04-06": "Easter Monday",
  "2026-05-04": "Early May bank holiday",
  "2026-05-25": "Spring bank holiday",
  "2026-08-31": "Summer bank holiday",
  "2026-12-25": "Christmas Day",
  "2026-12-28": "Boxing Day (substitute day)",
  "2027-01-01": "New Year's Day",
  "2027-03-26": "Good Friday",
  "2027-03-29": "Easter Monday",
  "2027-05-03": "Early May bank holiday",
  "2027-05-31": "Spring bank holiday",
  "2027-08-30": "Summer bank holiday",
  "2027-12-27": "Christmas Day (substitute day)",
  "2027-12-28": "Boxing Day (substitute day)",
};

let eventsFile;
let events = [];

function init(dataDir) {
  eventsFile = path.join(dataDir, "events.json");
  events = fs.existsSync(eventsFile) ? JSON.parse(fs.readFileSync(eventsFile, "utf8")) : [];
}

function save() {
  const tmp = eventsFile + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(events, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, eventsFile);
}

function str(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function companiesOf(person) {
  if (person.system) return [];
  return [person.company].concat((person.otherRoles || []).map((r) => r.company));
}

function canSee(person, e) {
  if (!e.companies.length || store.can(person, "events.manage")) return true;
  const mine = companiesOf(person);
  return e.companies.some((c) => mine.includes(c));
}

function validDay(value, label) {
  const v = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v + "T00:00:00Z"))) throw new store.ValidationError(`Enter a valid ${label}.`);
  return v;
}

function validTime(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new store.ValidationError("Enter a valid time.");
  return v;
}

function saveEvent(input, author, existing) {
  const title = str(input.title, 150);
  if (!title) throw new store.ValidationError("Give the event a title.");
  const startDate = validDay(input.startDate, "start date");
  const endDate = input.endDate ? validDay(input.endDate, "end date") : startDate;
  if (endDate < startDate) throw new store.ValidationError("The end date can't be before the start date.");
  const allDay = !!input.allDay || !input.startTime;
  const fields = {
    title,
    description: str(input.description, 2000),
    location: str(input.location, 150),
    type: EVENT_TYPES.includes(input.type) ? input.type : "event",
    startDate,
    endDate,
    allDay,
    startTime: allDay ? null : validTime(input.startTime),
    endTime: allDay ? null : validTime(input.endTime),
    companies: (Array.isArray(input.companies) ? input.companies : []).filter((c, i, a) => store.COMPANIES.includes(c) && a.indexOf(c) === i),
    updatedAt: new Date().toISOString(),
  };
  if (existing) {
    Object.assign(existing, fields);
    save();
    return existing;
  }
  const e = { id: crypto.randomBytes(8).toString("hex"), ...fields, createdBy: author.id, createdAt: fields.updatedAt };
  events.push(e);
  save();
  return e;
}

function getEvent(id) {
  return events.find((e) => e.id === id) || null;
}

function deleteEvent(e) {
  events = events.filter((x) => x.id !== e.id);
  save();
}

function dayList(from, to) {
  const out = [];
  for (let d = new Date(from + "T00:00:00Z"); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// Everything on the calendar between two dates (inclusive, YYYY-MM-DD), for one person.
function itemsBetween(person, from, to) {
  const items = [];
  const manager = store.can(person, "events.manage");

  for (const e of events) {
    if (e.endDate < from || e.startDate > to || !canSee(person, e)) continue;
    items.push({
      kind: "event",
      id: e.id,
      type: e.type,
      title: e.title,
      description: e.description,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
      allDay: e.allDay,
      startTime: e.startTime,
      endTime: e.endTime,
      companies: e.companies,
      canEdit: manager,
    });
  }

  for (const [date, name] of Object.entries(BANK_HOLIDAYS)) {
    if (date >= from && date <= to) items.push({ kind: "bank-holiday", id: "bh-" + date, title: name, startDate: date, endDate: date, allDay: true });
  }

  // Celebrations: birthdays people have chosen to share, and work anniversaries.
  const days = dayList(from, to);
  for (const p of store.employees()) {
    const view = store.publicView(p);
    for (const date of days) {
      const [y, m, d] = date.split("-").map(Number);
      if (view.birthday && view.birthday.month === m && view.birthday.day === d) {
        items.push({ kind: "birthday", id: "bd-" + p.id + "-" + date, title: p.displayName + "’s birthday", personId: p.id, startDate: date, endDate: date, allDay: true });
      }
      if (view.startDate) {
        const [sy, sm, sd] = view.startDate.split("-").map(Number);
        if (sm === m && sd === d && y > sy) {
          const years = y - sy;
          items.push({
            kind: "anniversary", id: "an-" + p.id + "-" + date,
            title: p.displayName + " – " + years + (years === 1 ? " year" : " years") + " at HN Group",
            personId: p.id, years, startDate: date, endDate: date, allDay: true,
          });
        }
      }
    }
  }

  return items.sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.startTime || "").localeCompare(b.startTime || ""));
}

function allEvents() {
  return events;
}

module.exports = { EVENT_TYPES, BANK_HOLIDAYS, init, saveEvent, getEvent, deleteEvent, itemsBetween, canSee, allEvents };
