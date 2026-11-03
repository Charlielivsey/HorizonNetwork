// Team chat. Channels: "Everyone", one per company (for the people who work there) and direct
// messages between two people. The browser polls for new messages every few seconds. The newest
// 2,000 messages per channel are kept. Stored in DATA_DIR/chat.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const KEEP = 2000;
const MODERATE = "announcements.manage";

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "chat.json", () => ({ messages: {}, reads: {} }));
}

const newId = () => crypto.randomBytes(8).toString("hex");

function companiesOf(p) {
  return [p.company].concat((p.otherRoles || []).map((r) => r.company));
}

// Channel ids: "everyone", "co-<index of company>", "dm-<personId>-<personId>" (ids sorted).
function dmId(a, b) {
  return "dm-" + [a, b].sort().join("-");
}

function parse(channel) {
  if (channel === "everyone") return { kind: "everyone", name: "Everyone" };
  let m = /^co-(\d)$/.exec(channel);
  if (m && store.COMPANIES[Number(m[1])]) return { kind: "company", company: store.COMPANIES[Number(m[1])], name: store.COMPANIES[Number(m[1])] };
  m = /^dm-([a-f0-9]{16})-([a-f0-9]{16})$/.exec(channel);
  if (m && m[1] < m[2]) return { kind: "dm", people: [m[1], m[2]] };
  return null;
}

function canAccess(person, channel) {
  const c = parse(channel);
  if (!c || person.system) return false;
  if (c.kind === "everyone") return true;
  if (c.kind === "company") return companiesOf(person).includes(c.company);
  const other = store.getPerson(c.people.find((id) => id !== person.id));
  return c.people.includes(person.id) && !!other && !other.system;
}

function brief(id) {
  const p = store.getPerson(id);
  return p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl } : { id, displayName: "Former staff" };
}

function post(person, channel, text) {
  if (!canAccess(person, channel)) throw new store.ValidationError("You can't post there.");
  const t = String(text || "").trim().slice(0, 4000);
  if (!t) throw new store.ValidationError("Write a message first.");
  const list = db.data.messages[channel] || (db.data.messages[channel] = []);
  const msg = { id: newId(), by: person.id, text: t, at: new Date().toISOString() };
  list.push(msg);
  if (list.length > KEEP) list.splice(0, list.length - KEEP);
  markRead(person, channel, msg.at, true);
  db.save();
  return msg;
}

function remove(person, channel, id) {
  const list = db.data.messages[channel] || [];
  const msg = list.find((x) => x.id === id);
  if (!msg) throw new store.ValidationError("That message has gone.");
  if (msg.by !== person.id && !store.can(person, MODERATE)) throw new store.ValidationError("You can only delete your own messages.");
  msg.deleted = true;
  msg.text = "";
  db.save();
}

function markRead(person, channel, at, noSave) {
  const r = db.data.reads[person.id] || (db.data.reads[person.id] = {});
  r[channel] = at || new Date().toISOString();
  if (!noSave) db.save();
}

function messages(person, channel, after) {
  if (!canAccess(person, channel)) throw new store.ValidationError("You can't see that conversation.");
  const list = db.data.messages[channel] || [];
  const out = after ? list.filter((x) => x.at > after) : list.slice(-150);
  return out.map((x) => ({ id: x.id, at: x.at, text: x.deleted ? "" : x.text, deleted: !!x.deleted, by: brief(x.by), mine: x.by === person.id, canDelete: !x.deleted && (x.by === person.id || store.can(person, MODERATE)) }));
}

function unreadIn(person, channel) {
  const since = (db.data.reads[person.id] || {})[channel] || "";
  return (db.data.messages[channel] || []).filter((x) => x.at > since && x.by !== person.id && !x.deleted).length;
}

// Every channel the person can see, with unread counts and the latest message.
function channels(person, extra) {
  if (person.system) return [];
  const ids = ["everyone"].concat(store.COMPANIES.map((c, i) => "co-" + i).filter((id) => canAccess(person, id)));
  const dms = Object.keys(db.data.messages).filter((id) => id.startsWith("dm-") && id.includes(person.id) && canAccess(person, id));
  // A conversation that's just been opened shows in the list before anyone has written in it.
  if (extra && /^dm-/.test(extra) && !dms.includes(extra) && canAccess(person, extra)) dms.push(extra);
  return ids.concat(dms).map((id) => {
    const c = parse(id);
    const list = db.data.messages[id] || [];
    const last = list.filter((x) => !x.deleted).slice(-1)[0];
    const other = c.kind === "dm" ? brief(c.people.find((p) => p !== person.id)) : null;
    return { id, kind: c.kind, name: other ? other.displayName : c.name, other, unread: unreadIn(person, id), last: last ? { text: last.text.slice(0, 80), at: last.at, by: brief(last.by).displayName } : null };
  }).sort((a, b) => (a.kind === "dm") - (b.kind === "dm") || (a.kind === "dm" ? (b.last ? b.last.at : "").localeCompare(a.last ? a.last.at : "") : 0));
}

// Data retention: deletes messages older than the cutoff.
function prune(cutoffIso) {
  let n = 0;
  for (const [id, list] of Object.entries(db.data.messages)) {
    const kept = list.filter((m) => m.at >= cutoffIso);
    n += list.length - kept.length;
    if (kept.length) db.data.messages[id] = kept; else delete db.data.messages[id];
  }
  if (n) db.save();
  return n;
}

// Everything someone has written, for "Download my data".
function writtenBy(personId) {
  const out = [];
  for (const [id, list] of Object.entries(db.data.messages)) {
    const c = parse(id);
    for (const m of list) if (m.by === personId && !m.deleted) out.push({ channel: c ? (c.kind === "dm" ? "Direct message" : c.name) : id, text: m.text, at: m.at });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

function unreadTotal(person) {
  return channels(person).reduce((n, c) => n + c.unread, 0);
}

module.exports = { prune, writtenBy, init, dmId, canAccess, post, remove, markRead, messages, channels, unreadTotal };
