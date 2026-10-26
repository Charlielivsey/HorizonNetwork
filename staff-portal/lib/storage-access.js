// Document storage on docs.hngroup.org.uk: everyone has their own private storage there that nobody else can open,
// except people with the "Access staff document storage" permission (Super Admin and the system owner have it), and
// people given access to one person's storage for a while (an individual grant, made on the Document storage page
// by someone with the permission). HN Group Auth passes both to the docs site with every sign-in check, so a grant
// that's removed or runs out stops working within a minute. Stored in DATA_DIR/storage-access.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const ACCESS = "storage.access";
const DOCS = "https://docs.hngroup.org.uk";
const MAX_DAYS = 365;
let db;

function init(dataDir) {
  db = datafile.open(dataDir, "storage-access.json", () => ({ grants: [] }));
  tidy();
}
const nameOf = (id) => { const p = id ? store.getPerson(id) : null; return p ? p.displayName : "A former member of staff"; };
const live = (g) => Date.parse(g.until) > Date.now();
// Grants that ran out more than 30 days ago are cleared away.
function tidy() {
  const before = db.data.grants.length;
  db.data.grants = db.data.grants.filter((g) => Date.parse(g.until) > Date.now() - 30 * 86400000);
  if (db.data.grants.length !== before) db.save();
}

// May this person open anyone's storage? (The permission; the owner and owner-level accounts have every permission.)
const canAccessAll = (p) => !!p && store.can(p, ACCESS);

// What HN Group Auth hands the docs site about a person (see status-sso.js identity()).
// Never stops a sign-in: if anything about storage can't be worked out, the person simply gets no extra access.
function forIdentity(p) {
  try {
    return {
      storageAccess: canAccessAll(p),
      storageGrants: db ? db.data.grants.filter((g) => g.granteeId === p.id && live(g)).map((g) => ({ personId: g.ownerId, name: nameOf(g.ownerId), until: g.until })) : [],
    };
  } catch { return { storageAccess: false, storageGrants: [] }; }
}

const view = (g) => ({ id: g.id, granteeId: g.granteeId, granteeName: nameOf(g.granteeId), ownerId: g.ownerId, ownerName: nameOf(g.ownerId), until: g.until, reason: g.reason || "",
  grantedByName: nameOf(g.grantedBy), createdAt: g.createdAt, active: live(g) });

function list() {
  tidy();
  return db.data.grants.slice().sort((a, b) => (live(b) - live(a)) || Date.parse(a.until) - Date.parse(b.until)).map(view);
}

function add(input, me) {
  const grantee = store.getPerson(String(input.granteeId || "")), owner = store.getPerson(String(input.ownerId || ""));
  if (!grantee || grantee.system) throw Object.assign(new Error("Choose who should get access."), { status: 400 });
  if (!owner || owner.system) throw Object.assign(new Error("Choose whose storage they can open."), { status: 400 });
  if (grantee.id === owner.id) throw Object.assign(new Error("Everyone can already open their own storage."), { status: 400 });
  const until = new Date(String(input.until || ""));
  if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) throw Object.assign(new Error("Choose when the access ends (a date in the future)."), { status: 400 });
  if (until.getTime() > Date.now() + MAX_DAYS * 86400000) throw Object.assign(new Error("Access can be given for up to a year at a time."), { status: 400 });
  // One grant per pair: giving access again replaces the old end date.
  db.data.grants = db.data.grants.filter((g) => !(g.granteeId === grantee.id && g.ownerId === owner.id));
  const g = { id: crypto.randomBytes(8).toString("hex"), granteeId: grantee.id, ownerId: owner.id, until: until.toISOString(), reason: String(input.reason || "").trim().slice(0, 300), grantedBy: me.id, createdAt: new Date().toISOString() };
  db.data.grants.push(g);
  db.save();
  return view(g);
}

function remove(id) {
  const g = db.data.grants.find((x) => x.id === id);
  if (!g) throw Object.assign(new Error("That access has already been removed."), { status: 404 });
  db.data.grants = db.data.grants.filter((x) => x.id !== id);
  db.save();
  return view(g);
}

// The staff list for the Document storage page.
function people() {
  return store.employees().filter((p) => !p.system).map((p) => ({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle || "", company: p.company || "", storageUrl: DOCS + "/storage/" + encodeURIComponent(p.id) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

module.exports = { ACCESS, init, canAccessAll, forIdentity, list, add, remove, people };
