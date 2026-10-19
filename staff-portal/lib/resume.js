// "Resume session" on the sign-in page. After a full sign-in (password and code), the browser is
// given a separate long-lived cookie that remembers who signed in. Next time, the sign-in page can
// offer "Resume as Charlie" and only ask for the 6-digit sign-in code.
//
// Only a hash of the token is stored. A token stops working after 30 days, after 5 wrong codes,
// when the person's password or code changes, when their login is disabled, or when they choose
// "Not you?". Stored in DATA_DIR/resume.json (left out of backups, like sessions).

const crypto = require("crypto");
const datafile = require("./datafile");

const COOKIE = "hn_staff_resume";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FAILURES = 5;

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "resume.json", () => ({ tokens: {} }));
  prune();
}

const hash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

function prune() {
  const now = Date.now();
  let changed = false;
  for (const [k, t] of Object.entries(db.data.tokens)) if (t.expires < now) { delete db.data.tokens[k]; changed = true; }
  if (changed) db.save();
}

// Makes a new token for a person, replacing the one this browser had (if any).
function issue(personId, oldRaw, userAgent, options = {}) {
  const previous = lookup(oldRaw);
  const parent = options.parent ? hash(options.parent) : previous?.personId === personId ? previous.parent : null;
  if (previous?.personId === personId && previous.parent && db.data.tokens[previous.parent]) db.data.tokens[previous.parent].failures = 0;
  if (oldRaw) delete db.data.tokens[hash(oldRaw)];
  const raw = crypto.randomBytes(32).toString("hex");
  db.data.tokens[hash(raw)] = { personId, createdAt: Date.now(), expires: Date.now() + TTL_MS, failures: 0, kind: options.kind || "resume", ...(parent ? { parent } : {}), userAgent: String(userAgent || "").slice(0, 200) };
  db.save();
  return raw;
}

function lookup(raw) {
  if (!raw) return null;
  const t = db.data.tokens[hash(raw)];
  if (!t || t.expires < Date.now()) return null;
  if (t.parent) { const parent = db.data.tokens[t.parent]; if (!parent || parent.kind !== "browser" || parent.personId !== t.personId || parent.expires < Date.now()) return null; }
  return t;
}

// A wrong code: counts against the token, which is cancelled after too many.
function fail(raw) {
  const t = lookup(raw);
  if (!t) return true;
  if (t.parent) { const parent = db.data.tokens[t.parent]; if (parent && ++parent.failures >= MAX_FAILURES) { delete db.data.tokens[t.parent]; delete db.data.tokens[hash(raw)]; db.save(); return true; } }
  t.failures++;
  const gone = t.failures >= MAX_FAILURES;
  if (gone) delete db.data.tokens[hash(raw)];
  db.save();
  return gone;
}

function resetFailures(raw) { const t=lookup(raw); if(t&&t.failures){t.failures=0;db.save();} }

function touch(raw) {
  const t = lookup(raw); if (t && t.kind === "browser" && t.expires < Date.now() + TTL_MS - 86400000) { t.expires = Date.now() + TTL_MS; db.save(); }
}

function forget(raw) {
  if (raw && db.data.tokens[hash(raw)]) {
    delete db.data.tokens[hash(raw)];
    db.save();
  }
}

// Cancels every remembered browser for a person (password changed, login disabled...).
function revokeFor(personId) {
  let changed = false;
  for (const [k, t] of Object.entries(db.data.tokens)) if (t.personId === personId) { delete db.data.tokens[k]; changed = true; }
  if (changed) db.save();
}

function cookie(req, raw, clear) {
  const parts = [`${COOKIE}=${clear ? "" : raw}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${clear ? 0 : Math.floor(TTL_MS / 1000)}`];
  if (req.headers["x-forwarded-proto"] === "https") parts.push("Secure");
  return parts.join("; ");
}

module.exports = { COOKIE, MAX_FAILURES, init, issue, lookup, fail, forget, revokeFor, cookie, touch, resetFailures };
