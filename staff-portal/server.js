// HN Group Staff Portal — zero-dependency Node.js server.
// Handles authentication (scrypt-hashed passwords, cookie sessions), the staff API and the portal pages.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./lib/store");
const workplace = require("./lib/workplace");
const calendar = require("./lib/calendar");
const polls = require("./lib/polls");
const onboarding = require("./lib/onboarding");
const backup = require("./lib/backup");

const PORT = parseInt(process.env.PORT || "3200", 10);
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");

const SESSION_COOKIE = "hn_staff_session";
// A sign-in ends when the browser closes, or after 12 hours without using the portal.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_AVATAR_BODY_BYTES = 2 * 1024 * 1024;

// Pages of the single-page app; the browser handles routing between them.
const APP_ROUTES = new Set([
  "/home", "/directory", "/employees", "/settings", "/system", "/announcements", "/documents",
  "/calendar", "/polls", "/onboarding", "/roles",
]);
const SYSTEM_UNLOCK_MS = 15 * 60 * 1000; // System Admin stays unlocked for 15 minutes of inactivity
const MAX_PIN_ATTEMPTS = 5;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

store.init(DATA_DIR);
workplace.init(DATA_DIR);
calendar.init(DATA_DIR);
polls.init(DATA_DIR);
onboarding.init(DATA_DIR);
backup.init(DATA_DIR);

// Re-reads every data file, e.g. after a backup is restored.
function reloadAll() {
  store.init(DATA_DIR);
  workplace.init(DATA_DIR);
  calendar.init(DATA_DIR);
  polls.init(DATA_DIR);
  onboarding.init(DATA_DIR);
}

backup.scheduleNightly((err, name) => {
  if (err) {
    console.error("Nightly backup failed:", err);
    store.audit({ action: "backup-failed", actor: "System", detail: String(err.message || err) });
  } else {
    store.audit({ action: "backup-created", actor: "System", target: name, detail: "Nightly" });
  }
});

// ---------- Sessions & rate limiting ----------

// Sessions are kept on disk (sessions.json) so people stay signed in across restarts and updates.
// They're stored under a SHA-256 hash of the cookie token, so the file can't be used to sign in.
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

class SessionStore extends Map {
  constructor(file) {
    super();
    this.file = file;
    this.timer = null;
    try {
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      const now = Date.now();
      for (const [key, s] of Object.entries(saved)) {
        // Sign-ins from the old "keep me signed in" option are cut back to the normal limit.
        if (s.remember) {
          delete s.remember;
          s.expires = Math.min(s.expires, s.lastSeen + SESSION_TTL_MS);
        }
        if (s.expires > now) super.set(key, s);
      }
    } catch {
      /* no saved sessions yet */
    }
  }
  set(key, value) { super.set(key, value); this.save(); return this; }
  delete(key) { const had = super.delete(key); if (had) this.save(); return had; }
  // Writes are batched; a crash loses at most a couple of seconds of "last active" times.
  save(delay = 1000) {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const tmp = this.file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this)), { mode: 0o600 });
      fs.renameSync(tmp, this.file);
    }, delay);
    this.timer.unref();
  }
  flush() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this)), { mode: 0o600 });
  }
}

const sessions = new SessionStore(SESSIONS_FILE); // tokenHash -> { id, personId, expires, ip, userAgent, createdAt, lastSeen, impersonatorId?, returnKey? }
const failedAttempts = new Map(); // ip -> { count, first }
const pinFailures = new Map(); // personId -> { count, first }
const codeChallenges = new Map(); // challenge -> { personId, expires, attempts } (password accepted, waiting for the code)
const CODE_CHALLENGE_MS = 5 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    sessions.flush();
    process.exit(0);
  });
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function createSession(personId, req, extra = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const data = {
    id: crypto.randomBytes(6).toString("hex"),
    personId,
    ip: clientIp(req),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 200),
    createdAt: now,
    lastSeen: now,
    ...extra,
  };
  data.expires = now + SESSION_TTL_MS;
  sessions.set(hashToken(token), data);
  return token;
}

function getSession(req) {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (!raw) return null;
  const key = hashToken(raw);
  const session = sessions.get(key);
  if (!session || session.expires < Date.now()) {
    sessions.delete(key);
    return null;
  }
  const person = store.getPerson(session.personId);
  if (!person || !person.account || !person.account.enabled) {
    sessions.delete(key);
    return null;
  }
  const now = Date.now();
  session.expires = now + SESSION_TTL_MS; // sliding expiry
  if (now - session.lastSeen > 30 * 1000) {
    session.lastSeen = now;
    sessions.save(60 * 1000);
  }
  return { token: key, raw, person, data: session };
}

function endSessionsFor(personId, exceptToken) {
  for (const [token, s] of sessions) {
    if (s.personId === personId && token !== exceptToken) sessions.delete(token);
  }
}

function isLockedOut(ip) {
  const entry = failedAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > LOCKOUT_WINDOW_MS) {
    failedAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailure(ip) {
  const entry = failedAttempts.get(ip);
  if (!entry || Date.now() - entry.first > LOCKOUT_WINDOW_MS) {
    failedAttempts.set(ip, { count: 1, first: Date.now() });
  } else {
    entry.count++;
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [token, s] of sessions) if (s.expires < now) sessions.delete(token);
  for (const [ip, e] of failedAttempts) if (now - e.first > LOCKOUT_WINDOW_MS) failedAttempts.delete(ip);
  for (const [id, e] of pinFailures) if (now - e.first > LOCKOUT_WINDOW_MS) pinFailures.delete(id);
  for (const [c, e] of codeChallenges) if (e.expires < now) codeChallenges.delete(c);
}, 10 * 60 * 1000).unref();

// ---------- HTTP helpers ----------

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function clientIp(req) {
  // Only trust X-Real-IP when the request came through the local nginx proxy.
  const remote = req.socket.remoteAddress || "";
  if ((remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1") && req.headers["x-real-ip"]) {
    return req.headers["x-real-ip"];
  }
  return remote;
}

// Lax (not Strict) so arriving from a link in an email or another site keeps you signed in.
// Cross-site POSTs are still blocked by the JSON content-type check.
// No Max-Age: the browser forgets the sign-in when it closes.
function cookieFor(req, token) {
  return sessionCookie(req, token, null);
}

function sessionCookie(req, token, maxAgeSeconds) {
  const parts = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (maxAgeSeconds != null) parts.push(`Max-Age=${maxAgeSeconds}`);
  if (req.headers["x-forwarded-proto"] === "https") parts.push("Secure");
  return parts.join("; ");
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; form-action 'self'",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function sendJson(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
}

function redirect(res, location) {
  send(res, 302, "", { Location: location, "Cache-Control": "no-store" });
}

function sendFile(res, filePath, extraHeaders = {}) {
  fs.readFile(filePath, (err, content) => {
    if (err) return send(res, 404, "Not found", { "Content-Type": "text/plain" });
    const type = MIME_TYPES[path.extname(filePath)] || "application/octet-stream";
    send(res, 200, content, { "Content-Type": type, ...extraHeaders });
  });
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function readJsonBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    // Requiring a JSON content type blocks cross-site form posts (CSRF) on top of SameSite=Strict.
    if (!String(req.headers["content-type"] || "").startsWith("application/json")) {
      return reject(httpError(415, "Expected JSON"));
    }
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(httpError(413, "That upload is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        resolve(body && typeof body === "object" ? body : {});
      } catch {
        reject(httpError(400, "Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

// ---------- Activity log ----------

// Records an action in the activity log shown in System Admin. When the owner is using
// "log in as", the entry is recorded against the user, with `via` naming the owner.
function logEvent(req, session, action, extra = {}) {
  const entry = { action, ...extra, ip: clientIp(req) };
  if (session && !entry.actor) {
    entry.actor = store.loginName(session.person);
    if (session.data.impersonatorId) {
      const by = store.getPerson(session.data.impersonatorId);
      entry.via = by ? store.loginName(by) : "system owner";
    }
  }
  store.audit(entry);
}

const TRACKED_FIELDS = {
  firstName: "first name",
  lastName: "last name",
  displayName: "display name",
  jobTitle: "job title",
  company: "company",
  supervisorId: "supervisor",
  otherRoles: "other companies",
  emails: "email addresses",
  phone: "phone",
  location: "location",
  timezone: "time zone",
};

function snapshot(person) {
  const out = {};
  for (const k of Object.keys(TRACKED_FIELDS)) out[k] = JSON.stringify(person[k] == null ? null : person[k]);
  return out;
}

function changedFields(before, person) {
  const after = snapshot(person);
  return Object.keys(TRACKED_FIELDS).filter((k) => before[k] !== after[k]).map((k) => TRACKED_FIELDS[k]);
}

// Reads an uploaded file sent as the raw request body. Requiring application/octet-stream means a
// cross-site form can't send it (browsers would need a CORS preflight, which this server never allows).
function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers["content-type"] || "").startsWith("application/octet-stream")) {
      return reject(httpError(415, "Expected a file upload."));
    }
    if (Number(req.headers["content-length"] || 0) > limit) {
      req.resume();
      return reject(httpError(413, "That file is too large (max 20 MB)."));
    }
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(httpError(413, "That file is too large (max 20 MB)."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function headerJson(req, name) {
  try {
    return JSON.parse(decodeURIComponent(String(req.headers[name] || "")));
  } catch {
    throw httpError(400, "Missing upload details.");
  }
}

// ---------- API handlers ----------

async function handleLogin(req, res) {
  const ip = clientIp(req);
  if (isLockedOut(ip)) {
    logEvent(req, null, "sign-in-blocked", { actor: "(locked out)" });
    return sendJson(res, 429, { error: "Too many failed attempts. Please try again in 15 minutes." });
  }
  const { username, password } = await readJsonBody(req);
  const person = store.findByLogin(username);
  if (!person || !store.verifyPassword(person, password)) {
    recordFailure(ip);
    console.warn(`Failed login for "${String(username).slice(0, 64)}" from ${ip}`);
    logEvent(req, null, "sign-in-failed", { actor: String(username || "").trim().toLowerCase().slice(0, 100) || "(blank)" });
    return sendJson(res, 401, { error: "Incorrect email or password." });
  }
  failedAttempts.delete(ip);
  // Step two: anyone with a sign-in code has to enter it before they're signed in.
  if (store.hasCode(person)) {
    const challenge = crypto.randomBytes(24).toString("hex");
    codeChallenges.set(challenge, { personId: person.id, expires: Date.now() + CODE_CHALLENGE_MS, attempts: 0 });
    return sendJson(res, 200, { codeRequired: true, challenge });
  }
  completeLogin(req, res, person);
}

function completeLogin(req, res, person) {
  store.recordLogin(person);
  const token = createSession(person.id, req, { allowPageLoad: true });
  console.log(`${store.meView(person).username} signed in from ${clientIp(req)}`);
  logEvent(req, null, "signed-in", { actor: store.loginName(person) });
  sendJson(res, 200, { user: store.meView(person) }, { "Set-Cookie": cookieFor(req, token) });
}

async function handleLoginCode(req, res) {
  const ip = clientIp(req);
  if (isLockedOut(ip)) {
    logEvent(req, null, "sign-in-blocked", { actor: "(locked out)" });
    return sendJson(res, 429, { error: "Too many failed attempts. Please try again in 15 minutes.", restart: true });
  }
  const { challenge, code } = await readJsonBody(req);
  const entry = codeChallenges.get(String(challenge || ""));
  const person = entry && entry.expires > Date.now() ? store.getPerson(entry.personId) : null;
  if (!person || !person.account || !person.account.enabled) {
    codeChallenges.delete(String(challenge || ""));
    return sendJson(res, 401, { error: "Your sign-in timed out. Please enter your email and password again.", restart: true });
  }
  if (!store.verifyCode(person, String(code || ""))) {
    recordFailure(ip);
    entry.attempts++;
    logEvent(req, null, "sign-in-code-failed", { actor: store.loginName(person) });
    if (entry.attempts >= MAX_CODE_ATTEMPTS) {
      codeChallenges.delete(challenge);
      return sendJson(res, 401, { error: "Too many wrong codes. Please sign in again.", restart: true });
    }
    return sendJson(res, 401, { error: "That code isn't right. Please try again." });
  }
  codeChallenges.delete(challenge);
  failedAttempts.delete(ip);
  completeLogin(req, res, person);
}

async function handleSetCode(req, res, session) {
  if (session.data.impersonatorId) throw httpError(403, "You can't change sign-in codes while logged in as someone else.");
  const person = session.person;
  if (person.account.passwordTemporary) throw httpError(403, "Please create your password first.");
  const { code, currentPassword } = await readJsonBody(req);
  const changing = store.hasCode(person);
  // Changing an existing code needs the password; setting the first one happens straight after signing in.
  if (changing && !store.verifyPassword(person, currentPassword)) {
    return sendJson(res, 400, { error: "Your current password is incorrect." });
  }
  store.setCode(person, code);
  logEvent(req, session, changing ? "code-changed" : "code-set");
  sendJson(res, 200, { user: meResponse(session) });
}

function meResponse(session) {
  const user = store.meView(session.person);
  user.unreadAnnouncements = workplace.unreadAnnouncements(session.person);
  user.pendingAcks = workplace.pendingAcks(session.person) + workplace.pendingAnnouncementAcks(session.person);
  user.openPolls = polls.openForPerson(session.person);
  user.onboardingTasks = onboarding.forPerson(session.person).reduce((n, c) => n + c.tasks.filter((t) => !t.doneAt && t.canTick).length, 0);
  if (session.data.impersonatorId) {
    const by = store.getPerson(session.data.impersonatorId);
    user.impersonatedBy = by ? by.displayName : "System owner";
    user.passwordTemporary = false; // the owner can look around without setting the user's password or code
    user.codeSetupRequired = false;
  }
  return user;
}

async function handleChangePassword(req, res, session) {
  if (session.data.impersonatorId) throw httpError(403, "You can't change passwords while logged in as someone else.");
  const { currentPassword, newPassword } = await readJsonBody(req);
  const person = session.person;
  // Someone who has just signed in with a temporary password doesn't need to type it again.
  if (!person.account.passwordTemporary && !store.verifyPassword(person, currentPassword)) {
    return sendJson(res, 400, { error: "Your current password is incorrect." });
  }
  store.validateNewPassword(newPassword, person.account.passwordTemporary ? undefined : currentPassword);
  if (person.account.passwordTemporary && store.verifyPassword(person, newPassword)) {
    return sendJson(res, 400, { error: "Choose a new password rather than reusing the temporary one." });
  }
  store.setPassword(person, newPassword);
  endSessionsFor(person.id, session.token);
  console.log(`${store.meView(person).username} changed their password`);
  logEvent(req, session, "password-changed");
  sendJson(res, 200, { user: meResponse(session) });
}

function requireManager(session) {
  if (!store.canManage(session.person)) throw httpError(403, "You don't have access to employee management.");
}

function requireEmployee(id, me, action) {
  const person = store.getPerson(id);
  if (!person || person.system) throw httpError(404, "Employee not found.");
  // The owner's record is locked to everyone else, except for setting up their first login.
  const firstLogin = action === "account" && !person.account;
  if (store.isOwner(person) && !store.isOwner(me) && !firstLogin) {
    throw httpError(403, "Only the system owner can change the system owner's record.");
  }
  return person;
}

// ---------- Workplace: announcements, documents & policies ----------

async function routeWorkplace(req, res, pathname, session) {
  const me = session.person;
  const method = req.method;
  const annManager = store.can(me, "announcements.manage");
  const docManager = store.can(me, "documents.manage");
  const requireAnn = () => {
    if (!annManager) throw httpError(403, "You don't have permission to manage announcements.");
  };
  const requireDocs = () => {
    if (!docManager) throw httpError(403, "You don't have permission to manage documents.");
  };
  let m;

  // Announcements
  if (method === "GET" && pathname === "/api/announcements") {
    return sendJson(res, 200, { announcements: workplace.listAnnouncements(me), canPost: annManager, reactions: workplace.REACTIONS });
  }
  if (method === "POST" && (m = /^\/api\/announcements\/([a-f0-9]{16})\/(react|comments|ack|comments\/([a-f0-9]{16})\/delete)$/.exec(pathname))) {
    const a = workplace.getAnnouncement(m[1]);
    if (!a || !workplace.canReach(me, a)) throw httpError(404, "Announcement not found.");
    const body = await readJsonBody(req);
    if (m[2] === "react") workplace.toggleReaction(a, me, body.emoji);
    else if (m[2] === "comments") {
      workplace.addComment(a, me, body.body);
      logEvent(req, session, "announcement-commented", { target: a.title });
    } else if (m[2] === "ack") {
      workplace.acknowledgeAnnouncement(a, me);
      logEvent(req, session, "announcement-acknowledged", { target: a.title });
    } else {
      workplace.deleteComment(a, me, m[3]);
      logEvent(req, session, "announcement-comment-deleted", { target: a.title });
    }
    return sendJson(res, 200, { announcement: workplace.listAnnouncements(me).find((x) => x.id === a.id), user: meResponse(session) });
  }
  if (method === "GET" && (m = /^\/api\/announcements\/([a-f0-9]{16})\/acks$/.exec(pathname))) {
    requireAnn();
    const a = workplace.getAnnouncement(m[1]);
    if (!a) throw httpError(404, "Announcement not found.");
    return sendJson(res, 200, { people: workplace.announcementAcks(a) });
  }
  if (method === "POST" && pathname === "/api/announcements/seen") {
    store.markAnnouncementsSeen(me);
    return sendJson(res, 200, { user: meResponse(session) });
  }
  if (method === "POST" && pathname === "/api/announcements") {
    requireAnn();
    const a = workplace.saveAnnouncement(await readJsonBody(req), me, null);
    logEvent(req, session, "announcement-posted", { target: a.title, detail: a.companies.length ? a.companies.join(", ") : "Everyone" });
    return sendJson(res, 201, { ok: true });
  }
  if (method === "POST" && (m = /^\/api\/announcements\/([a-f0-9]{16})(\/delete)?$/.exec(pathname))) {
    requireAnn();
    const a = workplace.getAnnouncement(m[1]);
    if (!a) throw httpError(404, "Announcement not found.");
    if (m[2]) {
      workplace.deleteAnnouncement(a);
      logEvent(req, session, "announcement-deleted", { target: a.title });
    } else {
      workplace.saveAnnouncement(await readJsonBody(req), me, a);
      logEvent(req, session, "announcement-updated", { target: a.title });
    }
    return sendJson(res, 200, { ok: true });
  }

  // Documents & policies
  if (method === "GET" && pathname === "/api/documents") {
    return sendJson(res, 200, { documents: workplace.listDocuments(me), canManage: docManager, categories: workplace.CATEGORIES });
  }
  if (method === "POST" && pathname === "/api/documents/upload") {
    requireDocs();
    const meta = headerJson(req, "x-document");
    const buffer = await readRawBody(req, workplace.MAX_FILE_BYTES);
    const doc = workplace.createDocument(meta, meta.fileName, buffer, me);
    logEvent(req, session, "document-uploaded", { target: doc.title, detail: `${doc.category} · ${doc.file.name}` });
    return sendJson(res, 201, { document: workplace.documentView(doc, me) });
  }
  if ((m = /^\/api\/documents\/([a-f0-9]{16})(?:\/(file|delete|acknowledge|acknowledgements))?$/.exec(pathname))) {
    const doc = workplace.getDocument(m[1]);
    if (!doc || !workplace.canSee(me, doc)) throw httpError(404, "Document not found.");
    const action = m[2];

    if (method === "GET" && action === "file") {
      const file = workplace.fileFor(doc);
      const download = new URL(req.url, "http://localhost").searchParams.has("download") || !file.inline;
      const encoded = encodeURIComponent(file.name);
      return fs.readFile(file.path, (err, content) => {
        if (err) return sendJson(res, 404, { error: "The file is missing." });
        const headers = {
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "same-origin",
          "Content-Type": file.mime,
          "Content-Length": content.length,
          "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encoded}"; filename*=UTF-8''${encoded}`,
          "Cache-Control": "private, no-store",
        };
        // Only PDFs, images and plain text ever open in the browser (none can run scripts);
        // anything else is a download and is sandboxed as well, just in case.
        if (download) headers["Content-Security-Policy"] = "sandbox; default-src 'none'";
        res.writeHead(200, headers);
        res.end(content);
      });
    }
    if (method === "GET" && action === "acknowledgements") {
      requireDocs();
      return sendJson(res, 200, { people: workplace.acknowledgements(doc), version: doc.version });
    }
    if (method === "POST" && action === "acknowledge") {
      workplace.acknowledge(doc, me);
      logEvent(req, session, "document-acknowledged", { target: doc.title });
      return sendJson(res, 200, { document: workplace.documentView(doc, me), user: meResponse(session) });
    }
    if (method === "POST" && action === "file") {
      requireDocs();
      const { fileName } = headerJson(req, "x-document");
      const buffer = await readRawBody(req, workplace.MAX_FILE_BYTES);
      workplace.replaceFile(doc, fileName, buffer);
      logEvent(req, session, "document-replaced", { target: doc.title, detail: `Version ${doc.version} · ${doc.file.name}` });
      return sendJson(res, 200, { document: workplace.documentView(doc, me) });
    }
    if (method === "POST" && action === "delete") {
      requireDocs();
      workplace.deleteDocument(doc);
      logEvent(req, session, "document-deleted", { target: doc.title });
      return sendJson(res, 200, { ok: true });
    }
    if (method === "POST" && !action) {
      requireDocs();
      workplace.updateDocument(doc, await readJsonBody(req));
      logEvent(req, session, "document-updated", { target: doc.title });
      return sendJson(res, 200, { document: workplace.documentView(doc, me) });
    }
  }

  sendJson(res, 404, { error: "Not found." });
}

// ---------- System Admin (owner only, PIN protected) ----------

async function routeSystem(req, res, pathname, session) {
  const me = session.person;
  const method = req.method;
  if (!store.isOwner(me) || session.data.impersonatorId) {
    logEvent(req, session, "system-admin-denied");
    throw httpError(403, "Only the system owner can use System Admin.");
  }
  if (method === "POST" && pathname === "/api/system/unlock") {
    const entry = pinFailures.get(me.id);
    if (entry && entry.count >= MAX_PIN_ATTEMPTS && Date.now() - entry.first < LOCKOUT_WINDOW_MS) {
      throw httpError(429, "Too many wrong PINs. Try again in 15 minutes.");
    }
    const { pin } = await readJsonBody(req);
    if (!store.verifySystemPin(String(pin || ""))) {
      if (!entry || Date.now() - entry.first > LOCKOUT_WINDOW_MS) pinFailures.set(me.id, { count: 1, first: Date.now() });
      else entry.count++;
      logEvent(req, session, "pin-failed");
      throw httpError(401, "Incorrect PIN.");
    }
    pinFailures.delete(me.id);
    session.data.systemUnlockedUntil = Date.now() + SYSTEM_UNLOCK_MS;
    logEvent(req, session, "panel-unlocked");
    return sendJson(res, 200, { ok: true });
  }

  if (method === "POST" && pathname === "/api/system/lock") {
    session.data.systemUnlockedUntil = 0;
    return sendJson(res, 200, { ok: true });
  }

  if (!session.data.systemUnlockedUntil || session.data.systemUnlockedUntil < Date.now()) {
    return sendJson(res, 403, { error: "Enter the system PIN to continue.", code: "PIN_REQUIRED" });
  }
  session.data.systemUnlockedUntil = Date.now() + SYSTEM_UNLOCK_MS;

  if (method === "GET" && pathname === "/api/system/overview") {
    const list = [];
    for (const [token, s] of sessions) {
      if (s.expires < Date.now()) continue;
      const p = store.getPerson(s.personId);
      const by = s.impersonatorId ? store.getPerson(s.impersonatorId) : null;
      list.push({
        id: s.id,
        displayName: p ? p.displayName : "Unknown",
        username: p ? store.loginName(p) : "",
        avatarUrl: p ? store.publicView(p).avatarUrl : null,
        personId: s.personId,
        ip: s.ip,
        userAgent: s.userAgent,
        createdAt: new Date(s.createdAt).toISOString(),
        lastSeen: new Date(s.lastSeen).toISOString(),
        current: token === session.token,
        impersonatedBy: by ? by.displayName : null,
      });
    }
    list.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
    const users = store.allPeople().filter((p) => p.id !== me.id).map((p) => ({
      id: p.id,
      displayName: p.displayName,
      username: store.loginName(p),
      jobTitle: p.jobTitle,
      company: p.company,
      system: !!p.system,
      avatarUrl: store.publicView(p).avatarUrl,
      account: p.account ? (p.account.enabled ? "active" : "disabled") : "none",
    }));
    return sendJson(res, 200, {
      sessions: list,
      users,
      audit: store.readAudit(2000),
      unlockedUntil: new Date(session.data.systemUnlockedUntil).toISOString(),
    });
  }

  let m;
  if (method === "POST" && (m = /^\/api\/system\/sessions\/([a-f0-9]{12})\/end$/.exec(pathname))) {
    for (const [token, s] of sessions) {
      if (s.id === m[1]) {
        const p = store.getPerson(s.personId);
        sessions.delete(token);
        logEvent(req, session, "session-ended", { target: p ? store.loginName(p) : s.personId });
      }
    }
    return sendJson(res, 200, { ok: true });
  }

  if (method === "POST" && pathname === "/api/system/force-logout") {
    const { includeSelf } = await readJsonBody(req);
    let count = 0;
    for (const token of [...sessions.keys()]) {
      if (token === session.token && !includeSelf) continue;
      sessions.delete(token);
      count++;
    }
    logEvent(req, session, includeSelf ? "force-logout-all" : "force-logout-others", { detail: `${count} session(s)` });
    const headers = includeSelf ? { "Set-Cookie": sessionCookie(req, "", 0) } : {};
    return sendJson(res, 200, { ok: true, count }, headers);
  }

  if (method === "POST" && (m = /^\/api\/system\/impersonate\/([a-f0-9]{16})$/.exec(pathname))) {
    const target = store.getPerson(m[1]);
    if (!target || target.id === me.id) throw httpError(404, "User not found.");
    if (!target.account) throw httpError(400, `${target.displayName} doesn't have a login account yet.`);
    if (!target.account.enabled) throw httpError(400, `${target.displayName}'s login is disabled.`);
    const token = createSession(target.id, req, { impersonatorId: me.id, returnKey: session.token, allowPageLoad: true });
    logEvent(req, session, "logged-in-as", { target: store.loginName(target) });
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": cookieFor(req, token) });
  }

  if (method === "POST" && pathname === "/api/system/pin") {
    const { currentPin, newPin } = await readJsonBody(req);
    if (!store.verifySystemPin(String(currentPin || ""))) throw httpError(400, "The current PIN is incorrect.");
    store.setSystemPin(String(newPin || ""));
    logEvent(req, session, "pin-changed");
    return sendJson(res, 200, { ok: true });
  }

  // ----- Backups -----
  if (method === "GET" && pathname === "/api/system/backups") {
    return sendJson(res, 200, { backups: backup.listBackups() });
  }
  if (method === "POST" && pathname === "/api/system/backups") {
    const name = backup.createBackup("manual");
    logEvent(req, session, "backup-created", { target: name, detail: "Manual" });
    return sendJson(res, 201, { name, backups: backup.listBackups() });
  }
  if ((m = /^\/api\/system\/backups\/((?:auto|manual|pre-restore)-[\d-]+\.tar\.gz)\/(download|restore|delete)$/.exec(pathname))) {
    const file = backup.backupPath(m[1]);
    if (!file) throw httpError(404, "Backup not found.");
    if (method === "GET" && m[2] === "download") {
      logEvent(req, session, "backup-downloaded", { target: m[1] });
      return fs.readFile(file, (err, content) => {
        if (err) return sendJson(res, 404, { error: "Backup not found." });
        res.writeHead(200, {
          "X-Content-Type-Options": "nosniff",
          "Content-Type": "application/gzip",
          "Content-Length": content.length,
          "Content-Disposition": `attachment; filename="hn-staff-portal-${m[1]}"`,
          "Cache-Control": "private, no-store",
        });
        res.end(content);
      });
    }
    if (method === "POST" && m[2] === "delete") {
      backup.deleteBackup(m[1]);
      logEvent(req, session, "backup-deleted", { target: m[1] });
      return sendJson(res, 200, { backups: backup.listBackups() });
    }
    if (method === "POST" && m[2] === "restore") {
      const { pin } = await readJsonBody(req);
      if (!store.verifySystemPin(String(pin || ""))) throw httpError(400, "Enter the system PIN to confirm the restore.");
      const actor = store.loginName(me);
      const safety = backup.restoreBackup(m[1]);
      reloadAll();
      // Everyone (including you) signs in again against the restored data.
      for (const token of [...sessions.keys()]) sessions.delete(token);
      store.audit({ action: "backup-restored", actor, target: m[1], detail: `Safety backup: ${safety}`, ip: clientIp(req) });
      return sendJson(res, 200, { ok: true, redirect: "/login" }, { "Set-Cookie": sessionCookie(req, "", 0) });
    }
  }

  sendJson(res, 404, { error: "Not found." });
}

// Ends a "log in as" session and puts the owner back into their own session.
function stopImpersonating(req, res, session) {
  const { impersonatorId, returnKey } = session.data;
  if (!impersonatorId) throw httpError(400, "You're not logged in as someone else.");
  sessions.delete(session.token);
  const back = returnKey && sessions.get(returnKey);
  const owner = store.getPerson(impersonatorId);
  logEvent(req, null, "returned-from", { actor: owner ? store.loginName(owner) : impersonatorId, target: store.loginName(session.person) });
  if (back && back.expires > Date.now() && back.personId === impersonatorId) {
    // Only a hash of the owner's original token is kept, so hand them a fresh token for the same session.
    const token = crypto.randomBytes(32).toString("hex");
    sessions.delete(returnKey);
    back.allowPageLoad = true;
    sessions.set(hashToken(token), back);
    return sendJson(res, 200, { ok: true, redirect: "/system" }, { "Set-Cookie": cookieFor(req, token) });
  }
  sendJson(res, 200, { ok: true, redirect: "/login" }, { "Set-Cookie": sessionCookie(req, "", 0) });
}

// Searches people, documents, announcements, events and polls that the person can see.
function search(me, query) {
  const q = String(query).trim().toLowerCase().slice(0, 100);
  if (q.length < 2) return { people: [], documents: [], announcements: [], events: [], polls: [] };
  const has = (...fields) => fields.join(" ").toLowerCase().includes(q);
  const people = [];
  for (const p of store.employees()) {
    const roles = [{ company: p.company, jobTitle: p.jobTitle }].concat((p.otherRoles || []).map((r) => ({ company: r.company, jobTitle: r.jobTitle || p.jobTitle })));
    if (!has(p.displayName, p.firstName, p.lastName, p.location, p.emails.map((e) => e.address).join(" "), roles.map((r) => r.jobTitle + " " + r.company).join(" "))) continue;
    people.push({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, company: p.company, avatarUrl: store.publicView(p).avatarUrl });
    if (people.length >= 6) break;
  }
  const documents = workplace.listDocuments(me).filter((d) => has(d.title, d.description, d.category, d.file.name)).slice(0, 5)
    .map((d) => ({ id: d.id, title: d.title, category: d.category, ext: d.file.ext }));
  const announcements = workplace.listAnnouncements(me).filter((a) => has(a.title, a.body)).slice(0, 5)
    .map((a) => ({ id: a.id, title: a.title, publishAt: a.publishAt }));
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const events = calendar.allEvents().filter((e) => e.endDate >= today && e.startDate <= until && calendar.canSee(me, e) && has(e.title, e.description, e.location))
    .sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 5).map((e) => ({ id: e.id, title: e.title, startDate: e.startDate }));
  const pollList = polls.listPolls(me).filter((p) => has(p.title, p.description)).slice(0, 5).map((p) => ({ id: p.id, title: p.title, open: p.open }));
  return { people, documents, announcements, events, polls: pollList };
}

async function routeApi(req, res, pathname, session) {
  const method = req.method;

  if (method === "POST" && pathname === "/api/login") return handleLogin(req, res);
  if (method === "POST" && pathname === "/api/login/code") return handleLoginCode(req, res);
  if (method === "POST" && pathname === "/api/logout") {
    if (session) {
      sessions.delete(session.token);
      logEvent(req, session, "signed-out");
    }
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
  }

  if (!session) return sendJson(res, 401, { error: "Not signed in." });
  const me = session.person;

  if (method === "GET" && pathname === "/api/me") {
    return sendJson(res, 200, { user: meResponse(session) });
  }
  if (method === "POST" && pathname === "/api/stop-impersonating") return stopImpersonating(req, res, session);
  if (method === "POST" && pathname === "/api/me/password") return handleChangePassword(req, res, session);
  if (method === "POST" && pathname === "/api/me/code") return handleSetCode(req, res, session);

  // Everything else waits until a temporary password has been replaced.
  if (me.account.passwordTemporary && !session.data.impersonatorId) {
    return sendJson(res, 403, { error: "Please create a new password first.", code: "PASSWORD_CHANGE_REQUIRED" });
  }
  // ...and until a sign-in code has been set.
  if (!store.hasCode(me) && !session.data.impersonatorId) {
    return sendJson(res, 403, { error: "Please set your sign-in code first.", code: "CODE_SETUP_REQUIRED" });
  }

  if (method === "GET" && pathname === "/api/meta") {
    return sendJson(res, 200, {
      companies: store.COMPANIES,
      domains: store.DOMAINS,
      companyDomains: store.COMPANY_DOMAINS,
      defaultTimezone: store.DEFAULT_TIMEZONE,
    });
  }

  if (method === "POST" && pathname === "/api/me/profile") {
    const before = snapshot(me);
    store.updateOwnProfile(me, await readJsonBody(req));
    const changed = changedFields(before, me);
    if (changed.length) logEvent(req, session, "profile-updated", { detail: changed.join(", ") });
    return sendJson(res, 200, { user: meResponse(session) });
  }
  if (method === "POST" && pathname === "/api/me/theme") {
    const { theme } = await readJsonBody(req);
    if (theme !== me.theme) {
      store.setTheme(me, theme);
      logEvent(req, session, "theme-changed", { target: theme });
    }
    return sendJson(res, 200, { user: meResponse(session) });
  }
  if (method === "POST" && pathname === "/api/me/avatar") {
    const { image } = await readJsonBody(req, MAX_AVATAR_BODY_BYTES);
    store.saveAvatar(me, image);
    logEvent(req, session, "photo-updated");
    return sendJson(res, 200, { user: meResponse(session) });
  }
  if (method === "POST" && pathname === "/api/me/banner") {
    const { image, preset } = await readJsonBody(req, MAX_AVATAR_BODY_BYTES * 2);
    if (preset) store.setBannerPreset(me, preset);
    else store.saveBanner(me, image);
    logEvent(req, session, "banner-updated", { detail: preset || "uploaded image" });
    return sendJson(res, 200, { user: meResponse(session) });
  }
  if (method === "POST" && pathname === "/api/me/banner/remove") {
    store.removeBanner(me);
    logEvent(req, session, "banner-removed");
    return sendJson(res, 200, { user: meResponse(session) });
  }
  if (method === "POST" && pathname === "/api/me/avatar/remove") {
    store.removeAvatar(me);
    logEvent(req, session, "photo-removed");
    return sendJson(res, 200, { user: meResponse(session) });
  }

  let m;
  if (method === "GET" && (m = /^\/api\/avatars\/([a-f0-9]{16})$/.exec(pathname))) {
    const avatar = store.avatarFile(store.getPerson(m[1]));
    if (!avatar) return send(res, 404, "Not found", { "Content-Type": "text/plain" });
    return sendFile(res, avatar.file, { "Content-Type": avatar.mime, "Cache-Control": "private, max-age=86400" });
  }

  if (method === "GET" && (m = /^\/api\/banners\/([a-f0-9]{16})$/.exec(pathname))) {
    const banner = store.bannerFile(store.getPerson(m[1]));
    if (!banner) return send(res, 404, "Not found", { "Content-Type": "text/plain" });
    return sendFile(res, banner.file, { "Content-Type": banner.mime, "Cache-Control": "private, max-age=86400" });
  }

  if (method === "GET" && pathname === "/api/directory") {
    return sendJson(res, 200, { people: store.employees().map(store.publicView) });
  }

  // ----- Employee management (leadership & HR) -----
  if (pathname.startsWith("/api/employees")) {
    requireManager(session);

    if (method === "GET" && pathname === "/api/employees") {
      return sendJson(res, 200, { employees: store.employees().map(store.manageView) });
    }
    if (method === "POST" && pathname === "/api/employees/preview-emails") {
      const body = await readJsonBody(req);
      return sendJson(res, 200, store.resolveEmails(body.firstName, body.lastName, body.emails, body.excludeId));
    }
    if (method === "POST" && pathname === "/api/employees") {
      const person = store.saveEmployee(await readJsonBody(req), null);
      logEvent(req, session, "employee-added", { target: person.displayName, detail: `${person.jobTitle}, ${person.company}` });
      return sendJson(res, 201, { employee: store.manageView(person) });
    }
    if (method === "POST" && (m = /^\/api\/employees\/([a-f0-9]{16})(?:\/(delete|account|account\/disable|account\/enable|code\/reset))?$/.exec(pathname))) {
      const action = m[2];
      const person = requireEmployee(m[1], me, action);

      if (!action) {
        const before = snapshot(person);
        store.saveEmployee(await readJsonBody(req), person);
        const changed = changedFields(before, person);
        if (changed.length) logEvent(req, session, "employee-updated", { target: person.displayName, detail: changed.join(", ") });
        return sendJson(res, 200, { employee: store.manageView(person) });
      }
      if (action === "delete") {
        if (person.id === me.id) throw httpError(400, "You can't delete your own record.");
        store.deleteEmployee(person);
        onboarding.removePerson(person.id);
        endSessionsFor(person.id);
        logEvent(req, session, "employee-deleted", { target: person.displayName });
        return sendJson(res, 200, { ok: true });
      }
      if (action === "account") {
        if (person.id === me.id) throw httpError(400, "Use Profile & settings to change your own password.");
        const hadAccount = !!person.account;
        const credentials = store.issueTemporaryPassword(person);
        endSessionsFor(person.id);
        logEvent(req, session, hadAccount ? "password-reset" : "login-created", { target: credentials.username });
        return sendJson(res, 200, { ...credentials, employee: store.manageView(person) });
      }
      if (!person.account) throw httpError(400, "This employee doesn't have a login account.");
      if (action === "code/reset") {
        if (person.id === me.id) throw httpError(400, "Change your own code under Settings → Security.");
        store.clearCode(person);
        endSessionsFor(person.id);
        logEvent(req, session, "code-reset", { target: store.loginName(person) });
        return sendJson(res, 200, { employee: store.manageView(person) });
      }
      if (person.id === me.id) throw httpError(400, "You can't disable your own account.");
      store.setAccountEnabled(person, action === "account/enable");
      logEvent(req, session, action === "account/enable" ? "login-enabled" : "login-disabled", { target: store.loginName(person) });
      if (action === "account/disable") endSessionsFor(person.id);
      return sendJson(res, 200, { employee: store.manageView(person) });
    }
  }

  if (method === "POST" && pathname === "/api/me/status") {
    store.setStatus(me, await readJsonBody(req));
    logEvent(req, session, "status-changed", { detail: me.status ? me.status.type + (me.status.message ? " \u2013 " + me.status.message : "") : "cleared" });
    return sendJson(res, 200, { user: meResponse(session) });
  }

  // ----- Your own sessions -----
  if (method === "GET" && pathname === "/api/me/sessions") {
    const list = [];
    for (const [token, s2] of sessions) {
      if (s2.personId !== me.id || s2.expires < Date.now()) continue;
      list.push({
        id: s2.id, ip: s2.ip, userAgent: s2.userAgent, current: token === session.token,
        createdAt: new Date(s2.createdAt).toISOString(), lastSeen: new Date(s2.lastSeen).toISOString(),
        impersonated: !!s2.impersonatorId,
      });
    }
    list.sort((a, b) => b.current - a.current || b.lastSeen.localeCompare(a.lastSeen));
    return sendJson(res, 200, { sessions: list });
  }
  if (method === "POST" && (m = /^\/api\/me\/sessions\/(?:([a-f0-9]{12})\/end|(end-others))$/.exec(pathname))) {
    let count = 0;
    for (const [token, s2] of sessions) {
      if (s2.personId !== me.id || token === session.token) continue;
      if (m[2] || s2.id === m[1]) { sessions.delete(token); count++; }
    }
    logEvent(req, session, "own-sessions-ended", { detail: `${count} session(s)` });
    return sendJson(res, 200, { ok: true, count });
  }

  // ----- Search across the portal -----
  if (method === "GET" && pathname === "/api/search") {
    return sendJson(res, 200, search(me, new URL(req.url, "http://localhost").searchParams.get("q") || ""));
  }

  // ----- Calendar -----
  if (pathname === "/api/calendar" && method === "GET") {
    const q = new URL(req.url, "http://localhost").searchParams;
    const from = q.get("from") || new Date().toISOString().slice(0, 10);
    const to = q.get("to") || from;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw httpError(400, "Choose a valid date range.");
    if ((Date.parse(to) - Date.parse(from)) / 86400000 > 120) throw httpError(400, "Choose a shorter date range.");
    return sendJson(res, 200, { items: calendar.itemsBetween(me, from, to), canManage: store.can(me, "events.manage"), types: calendar.EVENT_TYPES });
  }
  if (pathname.startsWith("/api/events")) {
    if (!store.can(me, "events.manage")) throw httpError(403, "You don't have permission to manage the calendar.");
    if (method === "POST" && pathname === "/api/events") {
      const e = calendar.saveEvent(await readJsonBody(req), me, null);
      logEvent(req, session, "event-added", { target: e.title, detail: e.startDate });
      return sendJson(res, 201, { ok: true });
    }
    if (method === "POST" && (m = /^\/api\/events\/([a-f0-9]{16})(\/delete)?$/.exec(pathname))) {
      const e = calendar.getEvent(m[1]);
      if (!e) throw httpError(404, "Event not found.");
      if (m[2]) {
        calendar.deleteEvent(e);
        logEvent(req, session, "event-deleted", { target: e.title });
      } else {
        calendar.saveEvent(await readJsonBody(req), me, e);
        logEvent(req, session, "event-updated", { target: e.title });
      }
      return sendJson(res, 200, { ok: true });
    }
  }

  // ----- Polls & surveys -----
  if (pathname.startsWith("/api/polls")) {
    const pollManager = store.can(me, "polls.manage");
    const requirePolls = () => {
      if (!pollManager) throw httpError(403, "You don't have permission to manage polls.");
    };
    if (method === "GET" && pathname === "/api/polls") {
      return sendJson(res, 200, { polls: polls.listPolls(me), canManage: pollManager });
    }
    if (method === "POST" && pathname === "/api/polls") {
      requirePolls();
      const p = polls.savePoll(await readJsonBody(req), me, null);
      logEvent(req, session, "poll-created", { target: p.title });
      return sendJson(res, 201, { ok: true });
    }
    if (method === "POST" && (m = /^\/api\/polls\/([a-f0-9]{16})(?:\/(respond|close|reopen|delete))?$/.exec(pathname))) {
      const p = polls.getPoll(m[1]);
      if (!p || !polls.canSee(me, p)) throw httpError(404, "Poll not found.");
      if (m[2] === "respond") {
        polls.respond(p, me, (await readJsonBody(req)).answers);
        logEvent(req, session, "poll-answered", { target: p.title, detail: p.anonymous ? "Anonymous" : "" });
        return sendJson(res, 200, { poll: polls.pollView(p, me), user: meResponse(session) });
      }
      requirePolls();
      if (m[2] === "close" || m[2] === "reopen") {
        polls.closePoll(p, m[2] === "close");
        logEvent(req, session, m[2] === "close" ? "poll-closed" : "poll-reopened", { target: p.title });
      } else if (m[2] === "delete") {
        polls.deletePoll(p);
        logEvent(req, session, "poll-deleted", { target: p.title });
      } else {
        polls.savePoll(await readJsonBody(req), me, p);
        logEvent(req, session, "poll-updated", { target: p.title });
      }
      return sendJson(res, 200, { ok: true });
    }
  }

  // ----- Onboarding -----
  if (pathname.startsWith("/api/onboarding")) {
    const obManager = store.can(me, "onboarding.manage");
    const requireOb = () => {
      if (!obManager) throw httpError(403, "You don't have permission to manage onboarding.");
    };
    if (method === "GET" && pathname === "/api/onboarding/mine") {
      return sendJson(res, 200, { checklists: onboarding.forPerson(me) });
    }
    if (method === "GET" && pathname === "/api/onboarding") {
      requireOb();
      return sendJson(res, 200, {
        checklists: onboarding.listChecklists(me),
        templates: onboarding.listTemplates(),
        people: store.employees().map((p) => ({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle })),
      });
    }
    if (method === "POST" && pathname === "/api/onboarding/start") {
      requireOb();
      const { templateId, personId } = await readJsonBody(req);
      const t = onboarding.getTemplate(templateId);
      const p = store.getPerson(personId);
      if (!t || !p || p.system) throw httpError(400, "Choose a checklist and an employee.");
      onboarding.startChecklist(t, p, me);
      logEvent(req, session, "onboarding-started", { target: p.displayName, detail: t.name });
      return sendJson(res, 201, { ok: true });
    }
    if (method === "POST" && (m = /^\/api\/onboarding\/templates(?:\/([a-f0-9]{16})(\/delete)?)?$/.exec(pathname))) {
      requireOb();
      const t = m[1] ? onboarding.getTemplate(m[1]) : null;
      if (m[1] && !t) throw httpError(404, "Checklist not found.");
      if (m[2]) {
        onboarding.deleteTemplate(t);
        logEvent(req, session, "onboarding-template-deleted", { target: t.name });
      } else {
        const saved = onboarding.saveTemplate(await readJsonBody(req), t);
        logEvent(req, session, t ? "onboarding-template-updated" : "onboarding-template-added", { target: saved.name });
      }
      return sendJson(res, 200, { ok: true });
    }
    if (method === "POST" && (m = /^\/api\/onboarding\/([a-f0-9]{16})\/(task|delete)$/.exec(pathname))) {
      const c = onboarding.getChecklist(m[1]);
      if (!c) throw httpError(404, "Checklist not found.");
      if (m[2] === "delete") {
        requireOb();
        onboarding.deleteChecklist(c);
        logEvent(req, session, "onboarding-removed", { target: (store.getPerson(c.personId) || {}).displayName });
        return sendJson(res, 200, { ok: true });
      }
      const { taskId, done } = await readJsonBody(req);
      const task = onboarding.setTask(c, taskId, !!done, me);
      logEvent(req, session, done ? "onboarding-task-done" : "onboarding-task-undone", { target: (store.getPerson(c.personId) || {}).displayName, detail: task.title });
      return sendJson(res, 200, { checklist: onboarding.view(c, me), user: meResponse(session) });
    }
  }

  // ----- Roles & permissions -----
  if (pathname.startsWith("/api/roles")) {
    if (!store.can(me, "access.manage")) throw httpError(403, "You don't have permission to manage roles.");
    if (method === "GET" && pathname === "/api/roles") {
      return sendJson(res, 200, {
        permissions: store.PERMISSIONS,
        roles: store.listRoles(),
        people: store.employees().map((p) => ({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl, isOwner: store.isOwner(p) })),
      });
    }
    if (method === "POST" && pathname === "/api/roles") {
      const r = store.saveRole(await readJsonBody(req), null);
      logEvent(req, session, "role-created", { target: r.name, detail: r.permissions.join(", ") });
      return sendJson(res, 201, { ok: true });
    }
    if (method === "POST" && (m = /^\/api\/roles\/([a-f0-9]{16})(?:\/(delete|members))?$/.exec(pathname))) {
      const r = store.getRole(m[1]);
      if (!r) throw httpError(404, "Role not found.");
      if (m[2] === "delete") {
        store.deleteRole(r);
        logEvent(req, session, "role-deleted", { target: r.name });
      } else if (m[2] === "members") {
        store.setRoleMembers(r, (await readJsonBody(req)).personIds);
        logEvent(req, session, "role-members-changed", { target: r.name });
      } else {
        store.saveRole(await readJsonBody(req), r);
        logEvent(req, session, "role-updated", { target: r.name, detail: r.permissions.join(", ") });
      }
      return sendJson(res, 200, { ok: true });
    }
  }

  if (pathname.startsWith("/api/announcements") || pathname.startsWith("/api/documents")) {
    return routeWorkplace(req, res, pathname, session);
  }

  if (pathname.startsWith("/api/system/")) return routeSystem(req, res, pathname, session);

  sendJson(res, 404, { error: "Not found." });
}

// ---------- Routing ----------

async function route(req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const session = getSession(req);

  if (pathname.startsWith("/api/")) return routeApi(req, res, pathname, session);

  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method not allowed", { Allow: "GET, HEAD" });
  }

  if (pathname === "/healthz") return sendJson(res, 200, { ok: true });
  if (pathname === "/" || pathname === "/dashboard") return redirect(res, session ? "/home" : "/login");

  if (pathname === "/login") {
    // Opening the sign-in page always ends any existing sign-in.
    if (session) {
      sessions.delete(session.token);
      return send(res, 302, "", { Location: "/login", "Cache-Control": "no-store", "Set-Cookie": sessionCookie(req, "", 0) });
    }
    return sendFile(res, path.join(PUBLIC_DIR, "login.html"), { "Cache-Control": "no-store" });
  }

  // Loading or refreshing a portal page signs you out. The only page load allowed is the one
  // straight after signing in (or switching with "log in as"); moving around inside the portal
  // doesn't reload the page, so it isn't affected.
  if (APP_ROUTES.has(pathname)) {
    if (!session) return redirect(res, "/login");
    if (!session.data.allowPageLoad) {
      sessions.delete(session.token);
      logEvent(req, session, "signed-out-refresh");
      return send(res, 302, "", { Location: "/login", "Cache-Control": "no-store", "Set-Cookie": sessionCookie(req, "", 0) });
    }
    session.data.allowPageLoad = false;
    sessions.save();
    return sendFile(res, path.join(PUBLIC_DIR, "app.html"), { "Cache-Control": "no-store" });
  }

  if (pathname.startsWith("/assets/")) {
    const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
    if (!filePath.startsWith(path.join(PUBLIC_DIR, "assets") + path.sep)) {
      return send(res, 404, "Not found", { "Content-Type": "text/plain" });
    }
    return sendFile(res, filePath, { "Cache-Control": "no-cache" });
  }

  send(res, 404, "Not found", { "Content-Type": "text/plain" });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((err) => {
    if (!err.status) console.error(err);
    if (!res.headersSent) sendJson(res, err.status || 500, { error: err.status ? err.message : "Server error." });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`HN Group Staff Portal running on http://${HOST}:${PORT}`);
});
