// The notifications bell. Things that happen to you (a leave decision, a reply on your IT ticket,
// a payslip, kudos, an idea's status changing...) are stored here per person until read.
// The newest 100 per person are kept, and anything older than 90 days is dropped.
// Stored in DATA_DIR/notifications.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const KEEP = 100;
const MAX_AGE_DAYS = 90;

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "notifications.json", () => ({ items: {} }));
  prune();
}

function prune() {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86400000).toISOString();
  let changed = false;
  for (const [id, list] of Object.entries(db.data.items)) {
    const kept = list.filter((n) => n.at >= cutoff).slice(-KEEP);
    if (kept.length !== list.length) { db.data.items[id] = kept; changed = true; }
  }
  if (changed) db.save();
}

// Sends a notification to each person in `personIds` (duplicates and the sender are skipped).
function notify(personIds, item, from) {
  const ids = [...new Set((personIds || []).filter(Boolean))];
  if (!ids.length) return;
  const at = new Date().toISOString();
  for (const id of ids) {
    const p = store.getPerson(id);
    if (!p || p.system || (from && from.id === id)) continue;
    const list = db.data.items[id] || (db.data.items[id] = []);
    list.push({
      id: crypto.randomBytes(8).toString("hex"),
      type: String(item.type || "info").slice(0, 30),
      title: String(item.title || "").slice(0, 200),
      body: String(item.body || "").slice(0, 300),
      link: /^\/[a-z0-9\-/?=&#]*$/i.test(item.link || "") ? item.link : "",
      at,
      read: false,
    });
    if (list.length > KEEP) list.splice(0, list.length - KEEP);
  }
  db.save();
}

function forPerson(personId) {
  return (db.data.items[personId] || []).slice().reverse();
}

function unreadCount(personId) {
  return (db.data.items[personId] || []).filter((n) => !n.read).length;
}

function markRead(personId, id) {
  let changed = false;
  for (const n of db.data.items[personId] || []) {
    if ((!id || n.id === id) && !n.read) { n.read = true; changed = true; }
  }
  if (changed) db.save();
}

function clear(personId) {
  db.data.items[personId] = [];
  db.save();
}

module.exports = { init, notify, forPerson, unreadCount, markRead, clear };
