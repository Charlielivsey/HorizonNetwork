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
const leave = require("./lib/leave");
const rotas = require("./lib/rotas");
const funds = require("./lib/funds");
const payslips = require("./lib/payslips");
const helpdesk = require("./lib/helpdesk");
const reviews = require("./lib/reviews");
const stafffiles = require("./lib/stafffiles");
const uptime = require("./lib/uptime");
const expenses = require("./lib/expenses");
const invoices = require("./lib/invoices");
const notifications = require("./lib/notifications");
const training = require("./lib/training");
const cases = require("./lib/cases");
const recruitment = require("./lib/recruitment");
const kudos = require("./lib/kudos");
const ideas = require("./lib/ideas");
const extraRoutes = require("./lib/routes-extra");
const resume = require("./lib/resume");
const bills = require("./lib/bills");
const objectives = require("./lib/objectives");
const feedback = require("./lib/feedback");
const pulse = require("./lib/pulse");
const exitinterviews = require("./lib/exitinterviews");
const flexible = require("./lib/flexible");
const chat = require("./lib/chat");
const qa = require("./lib/qa");
const wiki = require("./lib/wiki");
const mentoring = require("./lib/mentoring");
const oncall = require("./lib/oncall");
const security = require("./lib/security");
const enquiries = require("./lib/enquiries");
const storageAccess = require("./lib/storage-access");
const retention = require("./lib/retention");
const { createStatusSso, loginNext, serviceRequest } = require("./lib/status-sso");
const networkLeadership = require("./lib/network-leadership");
const portalAuthLib = require("./lib/portal-auth");

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
  "/calendar", "/polls", "/onboarding", "/roles", "/about", "/signature",
  "/leave", "/rotas", "/payslips", "/payroll", "/funds", "/helpdesk", "/reviews", "/staff-files", "/status",
  "/expenses", "/invoices", "/notifications", "/training", "/cases", "/jobs", "/kudos", "/ideas", "/team", "/reports", "/bills", "/objectives", "/feedback", "/pulse", "/exit-interview", "/exit-interviews", "/flexible", "/chat", "/questions", "/wiki", "/mentoring", "/on-call", "/enquiries", "/document-storage",
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
leave.init(DATA_DIR);
rotas.init(DATA_DIR);
funds.init(DATA_DIR);
payslips.init(DATA_DIR);
helpdesk.init(DATA_DIR);
reviews.init(DATA_DIR);
stafffiles.init(DATA_DIR);
uptime.init(DATA_DIR, `http://127.0.0.1:${PORT}/healthz`);
uptime.start();
// Outages: tell IT straight away (the status banner shows them too), and record it.
uptime.onAlert((m, state, result, downSince) => {
  const it = store.employees().filter((p) => store.can(p, uptime.MANAGE)).map((p) => p.id);
  const mins = downSince ? Math.max(1, Math.round((Date.now() - Date.parse(downSince)) / 60000)) : 0;
  notifications.notify(it, state === "down"
    ? { type: "status", title: `${m.name} is down`, body: result.error || (result.status ? `HTTP ${result.status}` : "Not responding"), link: "/status" }
    : { type: "status", title: `${m.name} is back up`, body: `It was down for about ${mins} minute${mins === 1 ? "" : "s"}.`, link: "/status" });
  store.audit({ action: state === "down" ? "service-down" : "service-up", actor: "System", target: m.name, detail: state === "down" ? (result.error || `HTTP ${result.status}`) : `Down for about ${mins} min` });
});
backup.init(DATA_DIR);
expenses.init(DATA_DIR);
invoices.init(DATA_DIR);
notifications.init(DATA_DIR);
resume.init(DATA_DIR);
bills.init(DATA_DIR);
for (const mod of [objectives, feedback, pulse, exitinterviews, flexible, chat, qa, wiki, mentoring, oncall, security, enquiries, storageAccess]) mod.init(DATA_DIR);
training.init(DATA_DIR);
cases.init(DATA_DIR);
recruitment.init(DATA_DIR);
kudos.init(DATA_DIR);
ideas.init(DATA_DIR);

// Re-reads every data file, e.g. after a backup is restored.
function reloadAll() {
  store.init(DATA_DIR);
  workplace.init(DATA_DIR);
  calendar.init(DATA_DIR);
  polls.init(DATA_DIR);
  onboarding.init(DATA_DIR);
  leave.init(DATA_DIR);
  rotas.init(DATA_DIR);
  funds.init(DATA_DIR);
  payslips.init(DATA_DIR);
  helpdesk.init(DATA_DIR);
  reviews.init(DATA_DIR);
  stafffiles.init(DATA_DIR);
  uptime.init(DATA_DIR);
  expenses.init(DATA_DIR);
  invoices.init(DATA_DIR);
  notifications.init(DATA_DIR);
  training.init(DATA_DIR);
  cases.init(DATA_DIR);
  recruitment.init(DATA_DIR);
  kudos.init(DATA_DIR);
  ideas.init(DATA_DIR);
  bills.init(DATA_DIR);
  for (const mod of [objectives, feedback, pulse, exitinterviews, flexible, chat, qa, wiki, mentoring, oncall, security, enquiries, storageAccess]) mod.init(DATA_DIR);
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

// Ends sessions for a staff record (every sign-in account acting as one of its profiles) or for one sign-in
// account (pass its session id, from store.sessionIdOf).
function endAllFor(personId, exceptToken) { return endSessionsFor(personId, exceptToken); }
function endSessionsFor(personId, exceptToken) {
  // Remembered browsers ("Resume session") go too: password changes, disabled logins and so on.
  resume.revokeFor(personId, store.principalMatches);
  for (const [token, s] of sessions) {
    if (store.principalMatches(s.personId, personId) && token !== exceptToken) sessions.delete(token);
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
  department: "department",
  company: "company",
  supervisorId: "supervisor",
  supervisorCompany: "supervisor's role",
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
      return reject(httpError(413, `That file is too large (max ${Math.round(limit / 1048576)} MB).`));
    }
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(httpError(413, `That file is too large (max ${Math.round(limit / 1048576)} MB).`));
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

// During maintenance only the system owner gets in; everyone else is shown the message instead
// (after their password is checked, so the message isn't shown to just anyone).
function blockedByMaintenance(person) {
  return store.maintenance().on && !store.hasOwnerAccess(person);
}

function maintenanceReply(req, res, person) {
  logEvent(req, null, "sign-in-maintenance", { actor: store.loginName(person) });
  const m = store.maintenance();
  return sendJson(res, 503, { maintenance: { message: m.message, since: m.since }, error: "The staff portal is in maintenance mode." });
}

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
  if (blockedByMaintenance(person)) return maintenanceReply(req, res, person);
  // Step two: anyone with a sign-in code has to enter it before they're signed in.
  if (store.hasCode(person)) {
    const challenge = crypto.randomBytes(24).toString("hex");
    codeChallenges.set(challenge, { personId: store.sessionIdOf(person), expires: Date.now() + CODE_CHALLENGE_MS, attempts: 0 });
    // An account with Sign in with Google turned on is told so, so Auth offers Continue with Google instead of the PIN.
    return sendJson(res, 200, { codeRequired: true, challenge, google: !!(person.account && person.account.google) });
  }
  completeLogin(req, res, person);
}

// "Sign in with Google" through HN Group Auth: Google has already confirmed who this is (Auth checks the token it
// gets straight from Google), so it signs the person in without their password or PIN (the user's request,
// 27 October 2026). The account must be linked to that Google account by its owner, be enabled and set up (no
// temporary password), and the browser is never remembered.
// "Continue with Discord" (HN Group Auth checked the Discord sign-in): signs straight in, like Google, and never
// remembers the browser.
function discordLogin(req, res, { id, username }) {
  const ip = clientIp(req);
  if (isLockedOut(ip)) {
    logEvent(req, null, "sign-in-blocked", { actor: "(locked out)" });
    return sendJson(res, 429, { error: "Too many failed attempts. Please try again in 15 minutes." });
  }
  const person = store.findByDiscord(id);
  if (!person || !person.account || !person.account.enabled) {
    logEvent(req, null, "sign-in-discord-unknown", { actor: String(username || "").slice(0, 64) || "(unknown)" });
    return sendJson(res, 404, { error: "That Discord account isn’t connected to an HN Group sign-in account. Sign in with your email and password, then connect Discord." });
  }
  if (person.account.passwordTemporary) return sendJson(res, 403, { error: "Finish setting up your account first: sign in with your email and password." });
  if (blockedByMaintenance(person)) return maintenanceReply(req, res, person);
  if (username && person.account.discord.username !== username) store.updateDiscordNames([{ id, username }]);
  completeLogin(req, res, person, "Discord");
}

function googleLogin(req, res, { sub, email }) {
  const ip = clientIp(req);
  if (isLockedOut(ip)) {
    logEvent(req, null, "sign-in-blocked", { actor: "(locked out)" });
    return sendJson(res, 429, { error: "Too many failed attempts. Please try again in 15 minutes." });
  }
  const person = store.findByGoogle(sub);
  if (!person || !person.account || !person.account.enabled) {
    logEvent(req, null, "sign-in-google-unknown", { actor: String(email || "").toLowerCase().slice(0, 100) || "(unknown)" });
    return sendJson(res, 404, { error: "That Google account isn’t connected to an HN Group staff account. Sign in with your email and password, then connect Google." });
  }
  if (!store.ownsEmail(person, email)) {
    logEvent(req, null, "sign-in-google-mismatch", { actor: store.loginName(person) });
    return sendJson(res, 403, { error: "That Google account’s email no longer matches your staff account. Sign in with your email and password and connect Google again." });
  }
  if (person.account.passwordTemporary) {
    return sendJson(res, 403, { error: "Finish setting up your account first: sign in with your email and password." });
  }
  if (blockedByMaintenance(person)) return maintenanceReply(req, res, person);
  completeLogin(req, res, person, "Google");
}

function completeLogin(req, res, person, how) {
  store.recordLogin(person);
  const token = createSession(store.sessionIdOf(person), req, { allowPageLoad: true });
  console.log(`${store.meView(person).username} signed in from ${clientIp(req)}${how ? ` (${how})` : ""}`);
  logEvent(req, null, "signed-in", { actor: store.loginName(person), detail: how || undefined, ua: String(req.headers["user-agent"] || "").slice(0, 300) });
  const cookies = [cookieFor(req, token)];
  // Remember this browser for "Resume session" (only for people with a sign-in code, which it asks for).
  // Auth explicitly requests a separate remembered token for its own browser cookie. Signing in with Google never
  // remembers the account (the user's request, 27 October 2026).
  if (how !== "Google" && how !== "Discord" && store.hasCode(person) && (!serviceRequest(req) || req.headers["x-auth-remember"] === "1")) cookies.push(resume.cookie(req, resume.issue(store.sessionIdOf(person), parseCookies(req)[resume.COOKIE], req.headers["user-agent"])));
  sendJson(res, 200, { user: store.meView(person) }, { "Set-Cookie": cookies });
}

// ----- Resume session: the remembered person on this browser, signing back in with just their code -----
function resumePerson(req) {
  const raw = parseCookies(req)[resume.COOKIE];
  const t = resume.lookup(raw);
  const person = t && t.kind !== "browser" ? store.getPerson(t.personId) : null;
  if (!person || !person.account || !person.account.enabled || !store.hasCode(person)) return { raw, person: null };
  return { raw, person };
}

// What the sign-in page shows for "Welcome back".
function resumeInfo(person) {
  const v = store.publicView(person);
  return { available: true, displayName: person.displayName, firstName: person.firstName || person.displayName.split(" ")[0], username: store.meView(person).username, avatarUrl: v.avatarUrl ? "/api/resume/avatar?v=" + person.avatar.version : null, id: person.id, google: !!(person.account && person.account.google) };
}

// Why signing in through HN Group Auth didn't finish (maintenance, no access, an expired or interrupted sign-in, or
// Auth not answering), with one button to sign in again.
function sendSignInProblem(req, res, params, start, headers) {
  const m = store.maintenance(), error = params.get("auth_error");
  const [title, text] = params.has("maintenance")
    ? ["The staff portal is in maintenance", m.message || "It’s being worked on right now. Please try again later."]
    : error === "denied" ? ["You can’t use the staff portal", "This account isn’t allowed to sign in to the staff portal. If you think it should be, contact the IT team."]
    : error === "unavailable" ? ["HN Group Auth isn’t answering", "Signing in couldn’t finish because HN Group Auth didn’t answer. Please try again in a moment."]
    : ["Let’s try that again", "Your sign-in took too long or was already used. Sign in again to carry on."];
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  fs.readFile(path.join(PUBLIC_DIR, "signin.html"), "utf8", (err, html) => {
    if (err) return send(res, 500, "Server error", { "Content-Type": "text/plain" });
    html = html.replace("{{title}}", esc(title)).replace("{{text}}", esc(text)).replace("{{start}}", esc(start)).replace("{{tone}}", params.has("maintenance") ? "maintenance" : error === "denied" ? "denied" : "retry");
    send(res, 200, html, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...headers });
  });
}

// The sign-in page, with the remembered person (if any) built in, so it opens straight on the
// "Welcome back" step instead of showing the email and password form first.
function sendLoginPage(req, res) {
  fs.readFile(path.join(PUBLIC_DIR, "login.html"), "utf8", (err, html) => {
    if (err) return send(res, 500, "Server error", { "Content-Type": "text/plain" });
    const { person } = resumePerson(req);
    if (person) {
      const json = JSON.stringify(resumeInfo(person)).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
      html = html.replace('<body class="login-page">', `<body class="login-page" data-resume="${json}">`);
    }
    send(res, 200, html, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  });
}

async function handleResume(req, res, pathname) {
  const { raw, person } = resumePerson(req);
  if (req.method === "GET" && pathname === "/api/resume/avatar") {
    const avatar = person && store.avatarFile(person);
    if (!avatar) return send(res, 404, "Not found", { "Content-Type": "text/plain" });
    return sendFile(res, avatar.file, { "Content-Type": avatar.mime, "Cache-Control": "private, max-age=86400" });
  }
  if (req.method === "GET") {
    if (!person) return sendJson(res, 200, { available: false }, raw ? { "Set-Cookie": resume.cookie(req, "", true) } : {});
    return sendJson(res, 200, resumeInfo(person));
  }
  if (pathname === "/api/resume/forget") {
    resume.forget(raw);
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": resume.cookie(req, "", true) });
  }
  const ip = clientIp(req);
  if (isLockedOut(ip)) return sendJson(res, 429, { error: "Too many failed attempts. Please try again in 15 minutes.", restart: true });
  if (!person) return sendJson(res, 401, { error: "This browser doesn't remember you any more. Please sign in with your email and password.", restart: true }, { "Set-Cookie": resume.cookie(req, "", true) });
  const { code } = await readJsonBody(req);
  if (!store.verifyCode(person, String(code || ""))) {
    recordFailure(ip);
    logEvent(req, null, "sign-in-code-failed", { actor: store.loginName(person), detail: "Resume session" });
    if (resume.fail(raw)) {
      return sendJson(res, 401, { error: "Too many wrong codes. Please sign in with your email and password.", restart: true }, { "Set-Cookie": resume.cookie(req, "", true) });
    }
    return sendJson(res, 401, { error: "That code isn't right. Please try again." });
  }
  failedAttempts.delete(ip);
  if (blockedByMaintenance(person)) return maintenanceReply(req, res, person);
  completeLogin(req, res, person, "resumed");
}

// HN Secure Network asks for the person's six-digit PIN each time it connects the VPN; the VPN service
// checks it here. Five wrong PINs lock VPN connections for that person (and the address) for 15 minutes.
function verifyVpnPin(personId, code, ip, client) {
  // The VPN knows people by their profile id; any enabled sign-in account using that profile can confirm with its PIN.
  const candidates = store.loginsForId(String(personId || "")).filter((l) => l.account && l.account.enabled).map((l) => store.loginAsPerson(l));
  const legacy = !candidates.length && store.getPerson(String(personId || ""));
  const usable = candidates.length ? candidates : legacy && legacy.account && legacy.account.enabled ? [legacy] : [];
  if (!usable.length) return { status: 403, error: "This account can’t use the VPN right now." };
  const withPin = usable.filter((p) => store.hasCode(p));
  if (!withPin.length) return { status: 403, error: "Set up your six-digit PIN in HN Group Auth first." };
  const person = withPin.find((p) => /^\d{6}$/.test(String(code || "")) && store.verifyCode(p, String(code))) || withPin[0];
  const key = "vpn:" + person.id, entry = pinFailures.get(key), fresh = entry && Date.now() - entry.first <= LOCKOUT_WINDOW_MS;
  const req = { socket: { remoteAddress: "127.0.0.1" }, headers: { "x-real-ip": ip || "127.0.0.1", "user-agent": client || "HN Secure Network" } };
  if ((fresh && entry.count >= MAX_PIN_ATTEMPTS) || (ip && isLockedOut(ip))) return { status: 429, error: "Too many wrong PINs. Try again in 15 minutes." };
  if (!/^\d{6}$/.test(String(code || "")) || !store.verifyCode(person, String(code))) {
    if (ip) recordFailure(ip);
    if (!fresh) pinFailures.set(key, { count: 1, first: Date.now() }); else entry.count++;
    logEvent(req, null, "sign-in-code-failed", { actor: store.loginName(person), detail: "HN VPN connect" });
    const left = MAX_PIN_ATTEMPTS - pinFailures.get(key).count;
    return { status: left > 0 ? 401 : 429, error: left > 0 ? "That PIN isn’t right. " + left + (left === 1 ? " try" : " tries") + " left." : "Too many wrong PINs. Try again in 15 minutes." };
  }
  pinFailures.delete(key);
  logEvent(req, null, "vpn-pin-confirmed", { actor: store.loginName(person), detail: "HN VPN connect" });
  return null;
}

function verifyBrowserPin(req, person, raw, code) {
  const ip=clientIp(req);
  if(isLockedOut(ip))return {status:429,error:'Too many failed attempts. Please try again in 15 minutes.',restart:true};
  if(!store.verifyCode(person,String(code||''))){recordFailure(ip);logEvent(req,null,'sign-in-code-failed',{actor:store.loginName(person),detail:'HN Browser unlock'});const restart=resume.fail(raw);return {status:401,error:restart?'Too many wrong PINs. Sign in with your email and password again.':"That PIN isn’t right. Please try again.",restart};}
  failedAttempts.delete(ip);resume.resetFailures(raw);store.recordLogin(person);logEvent(req,null,'signed-in',{actor:store.loginName(person),detail:'HN Browser PIN unlock'});return null;
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
  if (blockedByMaintenance(person)) return maintenanceReply(req, res, person);
  completeLogin(req, res, person, entry.how);
}

async function handleSetCode(req, res, session, suppliedBody) {
  if (session.data.impersonatorId) throw httpError(403, "You can't change sign-in codes while logged in as someone else.");
  const person = session.person;
  if (person.account.passwordTemporary) throw httpError(403, "Please create your password first.");
  const { code, currentPassword } = suppliedBody || await readJsonBody(req);
  const changing = store.hasCode(person);
  // Changing an existing code needs the password; setting the first one happens straight after signing in.
  if (changing && !store.verifyPassword(person, currentPassword)) {
    return sendJson(res, 400, { error: "Your current password is incorrect." });
  }
  store.setCode(person, code);
  if (changing) resume.revokeFor(store.sessionIdOf(person), store.principalMatches);
  logEvent(req, session, changing ? "code-changed" : "code-set");
  if (serviceRequest(req)) res.setHeader("Set-Cookie", resume.cookie(req, resume.issue(store.sessionIdOf(person), parseCookies(req)[resume.COOKIE], req.headers["user-agent"])));
  sendJson(res, 200, { user: meResponse(session) });
}

function meResponse(session) {
  const user = store.meView(session.person);
  user.unreadAnnouncements = workplace.unreadAnnouncements(session.person);
  user.pendingAcks = workplace.pendingAcks(session.person) + workplace.pendingAnnouncementAcks(session.person);
  user.openPolls = polls.openForPerson(session.person);
  user.onboardingTasks = onboarding.forPerson(session.person).reduce((n, c) => n + c.tasks.filter((t) => !t.doneAt && t.canTick).length, 0);
  user.leaveApprovals = leave.pendingApprovalCount(session.person);
  user.timesheetApprovals = rotas.pendingApprovalCount(session.person);
  user.helpdeskBadge = helpdesk.badgeCount(session.person);
  user.onLeaveToday = leave.isOffToday(session.person.id);
  user.reviewsDue = reviews.due(session.person).length;
  user.returnToWorkDue = leave.pendingReturnToWork(session.person).length;
  if (store.can(session.person, uptime.MANAGE)) user.servicesDown = uptime.downCount();
  user.serviceAlerts = uptime.alerts(store.can(session.person, uptime.MANAGE));
  if (store.can(session.person, "system.admin")) user.backupStale = backup.health().stale;
  if (store.maintenance().on) user.maintenance = store.maintenance();
  user.expenseApprovals = expenses.approvalCount(session.person);
  user.notificationsUnread = notifications.unreadCount(session.person.id);
  user.trainingDue = training.dueCount(session.person);
  user.feedbackDue = feedback.pendingCount(session.person);
  user.chatUnread = chat.unreadTotal(session.person);
  user.mentoringDue = mentoring.dueCount(session.person);
  // Whether their About me can appear on the Horizon Network website (leadership page).
  user.onNetworkSite = !!networkLeadership.networkRole(session.person);
  user.bioPublic = session.person.bioPublic !== false;
  if (store.can(session.person, enquiries.MANAGE)) user.enquiriesNew = enquiries.newCount();
  user.onCallNow = oncall.current();
  user.pulseDue = !session.person.system && !pulse.hasAnswered(session.person);
  user.flexibleDecisions = flexible.pendingCount(session.person);
  user.exitInterviewDue = !!onboarding.leaverChecklistOf(session.person.id) && !exitinterviews.forPerson(session.person.id);
  user.jobsOpen = recruitment.openCount();
  if (store.can(session.person, cases.MANAGE)) user.casesOpen = cases.openCount();
  if (store.can(session.person, recruitment.MANAGE)) user.newApplicants = recruitment.newApplicantsCount();
  if (store.can(session.person, ideas.MANAGE)) user.newIdeas = ideas.newCount();
  if (store.can(session.person, payslips.MANAGE)) {
    const b = funds.balances();
    user.payrollOverdrawn = b.payroll < 0 || b.main < 0;
    user.budgetWarnings = funds.budgetWarnings().length;
    user.invoicesOverdue = invoices.summary().overdueCount;
    user.billsDue = bills.dueCount();
  }
  if (session.data.impersonatorId) {
    const by = store.getPerson(session.data.impersonatorId);
    user.impersonatedBy = by ? by.displayName : "System owner";
    user.passwordTemporary = false; // the owner can look around without setting the user's password or code
    user.codeSetupRequired = false;
  }
  return user;
}

async function handleChangePassword(req, res, session, suppliedBody) {
  if (session.data.impersonatorId) throw httpError(403, "You can't change passwords while logged in as someone else.");
  const { currentPassword, newPassword } = suppliedBody || await readJsonBody(req);
  const person = session.person;
  // Someone who has just signed in with a temporary (or expired) password doesn't need to type it again.
  const forced = person.account.passwordTemporary || security.passwordExpired(person);
  if (!forced && !store.verifyPassword(person, currentPassword)) {
    return sendJson(res, 400, { error: "Your current password is incorrect." });
  }
  store.validateNewPassword(newPassword, forced ? undefined : currentPassword, person);
  if (forced && store.verifyPassword(person, newPassword)) {
    return sendJson(res, 400, { error: person.account.passwordTemporary ? "Choose a new password rather than reusing the temporary one." : "Choose a different password from your old one." });
  }
  store.setPassword(person, newPassword);
  endSessionsFor(store.sessionIdOf(person), session.token);
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
  if (store.isOwner(person) && !store.hasOwnerAccess(me) && !firstLogin) {
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
  if ((m = /^\/api\/documents\/([a-f0-9]{16})\/versions(?:\/(\d+)\/file)?$/.exec(pathname)) && method === "GET") {
    const doc = workplace.getDocument(m[1]);
    if (!doc || !workplace.canSee(me, doc)) throw httpError(404, "Document not found.");
    if (!m[2]) return sendJson(res, 200, { versions: workplace.versions(doc, me), title: doc.title });
    const file = workplace.versionFile(doc, m[2]);
    if (!file) throw httpError(404, "That version isn't available.");
    const encoded = encodeURIComponent(file.name);
    return fs.readFile(file.path, (err, content) => {
      if (err) return sendJson(res, 404, { error: "The file is missing." });
      res.writeHead(200, { "X-Content-Type-Options": "nosniff", "Content-Type": file.mime, "Content-Length": content.length, "Content-Disposition": `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`, "Content-Security-Policy": "sandbox; default-src 'none'", "Cache-Control": "private, no-store" });
      res.end(content);
    });
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
      const { fileName, note } = headerJson(req, "x-document");
      const buffer = await readRawBody(req, workplace.MAX_FILE_BYTES);
      workplace.replaceFile(doc, fileName, buffer, note, me);
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

// ---------- System Admin (owner and super admins, PIN protected) ----------
// Super admins can do everything here except change the PIN, and they can't act on the owner:
// no logging in as them and no ending their sessions.

async function routeSystem(req, res, pathname, session) {
  const me = session.person;
  const method = req.method;
  const owner = store.hasOwnerAccess(me);
  if (!store.can(me, "system.admin") || session.data.impersonatorId) {
    logEvent(req, session, "system-admin-denied");
    throw httpError(403, "You don't have access to System Admin.");
  }
  const protectedPerson = (personId) => !owner && store.isOwner(store.getPerson(personId));
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
      throw httpError(400, "Incorrect PIN.");
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
  if (await extraRoutes.handleSystem(req, res, pathname, session)) return;
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
        protected: protectedPerson(s.personId),
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
      protected: protectedPerson(p.id),
    }));
    return sendJson(res, 200, {
      sessions: list,
      users,
      isOwner: owner,
      audit: store.readAudit(2000),
      unlockedUntil: new Date(session.data.systemUnlockedUntil).toISOString(),
    });
  }

  let m;
  if (method === "POST" && (m = /^\/api\/system\/sessions\/([a-f0-9]{12})\/end$/.exec(pathname))) {
    for (const [token, s] of sessions) {
      if (s.id === m[1]) {
        if (protectedPerson(s.personId)) throw httpError(403, "Only the system owner can end the system owner's sessions.");
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
    for (const [token, s] of [...sessions]) {
      if (token === session.token && !includeSelf) continue;
      if (protectedPerson(s.personId)) continue;
      sessions.delete(token);
      count++;
    }
    logEvent(req, session, includeSelf ? "force-logout-all" : "force-logout-others", { detail: `${count} session(s)` });
    const headers = includeSelf ? { "Set-Cookie": sessionCookie(req, "", 0) } : {};
    return sendJson(res, 200, { ok: true, count }, headers);
  }

  if (method === "POST" && (m = /^\/api\/system\/impersonate\/([a-f0-9]{16})$/.exec(pathname))) {
    if (store.maintenance().on) throw httpError(403, "“Log in as” is turned off while maintenance mode is on.");
    const target = store.getPerson(m[1]);
    if (!target || target.id === me.id) throw httpError(404, "User not found.");
    if (protectedPerson(target.id)) throw httpError(403, "Only the system owner can log in as the system owner.");
    if (!target.account) throw httpError(400, `${target.displayName} doesn't have a login account yet.`);
    if (!target.account.enabled) throw httpError(400, `${target.displayName}'s login is disabled.`);
    const token = createSession(target.id, req, { impersonatorId: store.sessionIdOf(me), returnKey: session.token, allowPageLoad: true });
    logEvent(req, session, "logged-in-as", { target: store.loginName(target) });
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": cookieFor(req, token) });
  }

  if (method === "POST" && pathname === "/api/system/pin") {
    if (!owner) throw httpError(403, "Only the system owner can change the PIN.");
    const { currentPin, newPin } = await readJsonBody(req);
    if (!store.verifySystemPin(String(currentPin || ""))) throw httpError(400, "The current PIN is incorrect.");
    store.setSystemPin(String(newPin || ""));
    logEvent(req, session, "pin-changed");
    return sendJson(res, 200, { ok: true });
  }

  // ----- Backups -----
  if (method === "GET" && pathname === "/api/system/backups") {
    return sendJson(res, 200, { backups: backup.listBackups(), health: backup.health() });
  }
  if (method === "POST" && pathname === "/api/system/backups") {
    const name = backup.createBackup("manual");
    logEvent(req, session, "backup-created", { target: name, detail: "Manual" });
    return sendJson(res, 201, { name, backups: backup.listBackups() });
  }
  if (method === "GET" && pathname === "/api/system/maintenance") {
    return sendJson(res, 200, { ...store.maintenance(), canChange: owner });
  }
  if (method === "POST" && pathname === "/api/system/maintenance") {
    if (process.env.HN_CONTROL_MANAGED === "1") throw httpError(409, "Maintenance is managed at https://admin.hngroup.org.uk.");
    if (!owner) throw httpError(403, "Only the system owner can turn maintenance mode on or off.");
    const body = await readJsonBody(req);
    // Turning it on needs the separate maintenance PIN, with the same lockout as the System Admin PIN.
    if (body.on && !store.maintenance().on) {
      const entry = pinFailures.get("maint:" + me.id);
      if (entry && entry.count >= MAX_PIN_ATTEMPTS && Date.now() - entry.first < LOCKOUT_WINDOW_MS) throw httpError(429, "Too many wrong PINs. Try again in 15 minutes.");
      if (!store.verifyMaintenancePin(String(body.pin || ""))) {
        if (!entry || Date.now() - entry.first > LOCKOUT_WINDOW_MS) pinFailures.set("maint:" + me.id, { count: 1, first: Date.now() });
        else entry.count++;
        logEvent(req, session, "maintenance-pin-failed");
        throw httpError(400, "That maintenance PIN isn't right.");
      }
      pinFailures.delete("maint:" + me.id);
    }
    const m = store.setMaintenance(!!body.on, body.message, me);
    let ended = 0;
    if (m.on) {
      // Sign out everyone except the owner straight away.
      for (const [token, s] of sessions) {
        const p = store.getPerson(s.personId);
        if (!p || !store.hasOwnerAccess(p)) { sessions.delete(token); ended++; }
      }
    }
    logEvent(req, session, m.on ? "maintenance-on" : "maintenance-off", { detail: m.on ? `${m.message}${ended ? ` (${ended} signed out)` : ""}` : undefined });
    return sendJson(res, 200, { ...m, canChange: true, ended });
  }
  if (method === "POST" && pathname === "/api/system/backups/upload") {
    const buffer = await readRawBody(req, 500 * 1024 * 1024);
    const r = backup.saveUploaded(buffer);
    logEvent(req, session, "backup-uploaded", { target: r.name, detail: `${r.files} files` });
    return sendJson(res, 201, { name: r.name, backups: backup.listBackups(), health: backup.health() });
  }
  if ((m = /^\/api\/system\/backups\/((?:auto|manual|pre-restore|uploaded)-[\d-]+\.tar\.gz)\/(download|restore|delete)$/.exec(pathname))) {
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
    const roles = [{ company: p.company, jobTitle: p.jobTitle, department: p.department || "" }].concat((p.otherRoles || []).map((r) => ({ company: r.company, jobTitle: r.jobTitle || p.jobTitle, department: r.department || p.department || "" })));
    if (!has(p.displayName, p.firstName, p.lastName, p.location, p.emails.map((e) => e.address).join(" "), roles.map((r) => r.jobTitle + " " + r.department + " " + r.company).join(" "), (p.skills || []).join(" "), (p.languages || []).join(" "))) continue;
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
  const pages = wiki.search(q).slice(0, 5).map((p) => ({ slug: p.slug, title: p.title }));
  const questions = qa.search(q).slice(0, 5).map((x) => ({ id: x.id, title: x.title, solved: !!x.acceptedId }));
  return { people, documents, announcements, events, polls: pollList, pages, questions };
}

async function routeApi(req, res, pathname, session) {
  const method = req.method;

  if (method === "POST" && pathname === "/api/login") return handleLogin(req, res);
  if (method === "POST" && pathname === "/api/login/code") return handleLoginCode(req, res);
  if (pathname === "/api/resume" || pathname === "/api/resume/forget" || pathname === "/api/resume/avatar") return handleResume(req, res, pathname);
  if (method === "GET" && pathname === "/api/maintenance") {
    const mt = store.maintenance();
    return sendJson(res, 200, { on: mt.on, message: mt.on ? mt.message : "" });
  }
  // The public website's careers list, job applications and contact form (no sign-in).
  if (await extraRoutes.handlePublic(req, res, pathname)) return;
  if (method === "POST" && pathname === "/api/logout") {
    if (session) {
      sessions.delete(session.token);
      logEvent(req, session, "signed-out");
    }
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
  }

  if (!session) return sendJson(res, 401, { error: "Not signed in." });
  const me = session.person;
  // Maintenance mode signs everyone but the owner out, including "log in as" sessions.
  if (store.maintenance().on && !store.hasOwnerAccess(me)) {
    sessions.delete(session.token);
    return sendJson(res, 503, { error: "The staff portal is in maintenance mode.", code: "MAINTENANCE" }, { "Set-Cookie": sessionCookie(req, "", 0) });
  }

  if (method === "GET" && pathname === "/api/me") {
    return sendJson(res, 200, { user: meResponse(session) });
  }
  if (method === "POST" && pathname === "/api/stop-impersonating") return stopImpersonating(req, res, session);
  if (method === "POST" && pathname === "/api/me/password") return handleChangePassword(req, res, session);
  if (method === "POST" && pathname === "/api/me/code") return handleSetCode(req, res, session);

  // Everything else waits until a temporary password has been replaced.
  if ((me.account.passwordTemporary || security.passwordExpired(me)) && !session.data.impersonatorId) {
    return sendJson(res, 403, { error: "Please create a new password first.", code: "PASSWORD_CHANGE_REQUIRED" });
  }
  // ...and until a sign-in code has been set.
  if (!store.hasCode(me) && !session.data.impersonatorId) {
    return sendJson(res, 403, { error: "Please set your sign-in code first.", code: "CODE_SETUP_REQUIRED" });
  }

  // The owner can turn maintenance mode off from the banner on any page.
  if (method === "POST" && pathname === "/api/maintenance/off") {
    if (!store.hasOwnerAccess(me) || session.data.impersonatorId) throw httpError(403, "Only the system owner can turn maintenance mode off.");
    const mt = store.setMaintenance(false, store.maintenance().message, me);
    logEvent(req, session, "maintenance-off");
    return sendJson(res, 200, { ...mt, user: meResponse(session) });
  }

  if (await extraRoutes.handle(req, res, pathname, session)) return;

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

  // ----- Sign-in accounts (HN Account only) -----
  // The user's request, 28 October 2026: sign-in accounts are made and managed on HN Account. Each has its own
  // password, PIN and permissions (roles), and any number of profiles (a company on a staff record) or none.
  if (pathname.startsWith("/api/logins")) {
    requireManager(session);
    if (session.data.via !== "accounts") throw httpError(403, "Sign-in accounts are managed on HN Account at accounts.hngroup.org.uk.");
    const myLogin = me.__login && me.__login.id;
    // Roles that include a permission only its holders can give out can only be given or taken away by them.
    const guardRoles = (before, after) => {
      const changed = [...before.filter((id) => !after.includes(id)), ...after.filter((id) => !before.includes(id))];
      if (changed.length && !store.can(me, "access.manage")) throw httpError(403, "You need the “Manage roles” permission to change an account’s permissions.");
      for (const id of changed) {
        const role = store.getRole(id);
        for (const key of store.GUARDED_PERMISSIONS) if (role && role.permissions.includes(key) && !store.can(me, key)) {
          throw httpError(403, `Only people with the “${(store.PERMISSIONS.find((x) => x.key === key) || {}).name || key}” permission can give or remove the ${role.name} role.`);
        }
      }
    };
    if (method === "GET" && pathname === "/api/logins") {
      return sendJson(res, 200, { accounts: store.listLogins(), profiles: store.allProfiles(), roles: store.listRoles().map((r) => ({ id: r.id, name: r.name, permissions: r.permissions })), canManageRoles: store.can(me, "access.manage"), ownerLevel: store.hasOwnerAccess(me), systemOwner: store.isOwner(me) });
    }
    if (method === "POST" && pathname === "/api/logins") {
      const body = await readJsonBody(req);
      guardRoles([], Array.isArray(body.roleIds) ? body.roleIds : []);
      const { login, credentials } = store.createLogin(body);
      logEvent(req, session, "login-created", { target: credentials.username, detail: store.loginProfiles(login).map((p) => p.displayName + " (" + p.company + ")").join(", ") || "No staff profile" });
      return sendJson(res, 201, { ...credentials, account: store.loginView(login) });
    }
    if (method === "POST" && (m = /^\/api\/logins\/([a-f0-9]{16})(?:\/(reset|code\/reset|disable|enable|delete))?$/.exec(pathname))) {
      const l = store.getLogin(m[1]), action = m[2];
      if (!l) throw httpError(404, "Account not found.");
      const own = l.primaryFor && store.getPerson(l.primaryFor);
      if (own && store.isOwner(own) && !store.hasOwnerAccess(me)) throw httpError(403, "Only the system owner can change the system owner's account.");
      // Owner-level accounts can do anything, including to their own account (the user's request, 28 October 2026).
      const ownerLevel = store.hasOwnerAccess(me);
      const self = l.id === myLogin && !ownerLevel, label = store.loginView(l).username;
      if (!action) {
        const body = await readJsonBody(req);
        if (body.roleIds !== undefined) {
          const before = (l.roleIds || []).slice().sort().join(), after = (Array.isArray(body.roleIds) ? body.roleIds.map(String) : []).slice().sort().join();
          if (before !== after) {
            if (self) throw httpError(400, "You can't change your own account's permissions.");
            guardRoles(l.roleIds || [], Array.isArray(body.roleIds) ? body.roleIds.map(String) : []);
          }
        }
        if (body.owner !== undefined && String(body.owner) !== String(l.owner || false) && !store.isOwner(me)) throw httpError(403, "Only the system owner can give or remove owner access.");
        store.updateLogin(l, body);
        logEvent(req, session, "login-updated", { target: label });
        return sendJson(res, 200, { account: store.loginView(l) });
      }
      if (self) throw httpError(400, "Change your own password and PIN on your own account page.");
      const sid = "p~" + l.id;
      // Ends this account's sessions, including ones from before sign-in accounts were separate (kept under the record).
      const endSessionsFor = (id) => {
        endAllFor(id);
        if (l.primaryFor) { resume.revokeFor(l.primaryFor); for (const [t, x] of sessions) if (x.personId === l.primaryFor) sessions.delete(t); }
      };
      if (action === "reset") {
        const credentials = store.issueTemporaryPassword(store.loginAsPerson(l));
        endSessionsFor(sid);
        logEvent(req, session, "password-reset", { target: credentials.username });
        return sendJson(res, 200, { ...credentials, account: store.loginView(l) });
      }
      if (!l.account) throw httpError(400, "This account has no password yet.");
      if (action === "code/reset") {
        store.clearCode(store.loginAsPerson(l)); endSessionsFor(sid);
        logEvent(req, session, "code-reset", { target: label });
      } else if (action === "delete") {
        if (l.primaryFor) throw httpError(400, "This is " + (own ? own.displayName : "someone") + "’s own account; disable it, or delete their staff record, instead.");
        endSessionsFor(sid); store.deleteLogin(l);
        logEvent(req, session, "login-deleted", { target: label });
        return sendJson(res, 200, { ok: true });
      } else {
        store.setAccountEnabled(store.loginAsPerson(l), action === "enable");
        if (action === "disable") endSessionsFor(sid);
        logEvent(req, session, action === "enable" ? "login-enabled" : "login-disabled", { target: label });
      }
      return sendJson(res, 200, { account: store.loginView(l) });
    }
    throw httpError(404, "Not found.");
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
      const body = await readJsonBody(req);
      // A new staff record needs its Discord user ID (the user's request, 28 October 2026).
      if (!String(body.discordId || "").trim()) throw httpError(400, "Enter their Discord user ID.");
      const person = store.saveEmployee(body, null);
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
        payslips.removePerson(person.id);
        endSessionsFor(person.id);
        logEvent(req, session, "employee-deleted", { target: person.displayName });
        return sendJson(res, 200, { ok: true });
      }
      if (action === "account") {
        if (person.id === me.id) throw httpError(400, "Use Profile & settings to change your own password.");
        // New sign-in accounts are made on HN Account, not the staff portal (the user's request, 28 October 2026).
        if (!person.account && session.data.via !== "accounts") throw httpError(403, "Sign-in accounts are created on HN Account at accounts.hngroup.org.uk.");
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
      if (!store.principalMatches(s2.personId, store.sessionIdOf(me)) || s2.expires < Date.now()) continue;
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
      if (!store.principalMatches(s2.personId, store.sessionIdOf(me)) || token === session.token) continue;
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
    const items = calendar.itemsBetween(me, from, to).concat(leave.calendarItems(from, to))
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.startTime || "").localeCompare(b.startTime || ""));
    return sendJson(res, 200, { items, canManage: store.can(me, "events.manage"), types: calendar.EVENT_TYPES });
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
      const { templateId, personId, lastDay } = await readJsonBody(req);
      const t = onboarding.getTemplate(templateId);
      const p = store.getPerson(personId);
      if (!t || !p || p.system) throw httpError(400, "Choose a checklist and an employee.");
      onboarding.startChecklist(t, p, me, { lastDay });
      logEvent(req, session, t.kind === "leaver" ? "leaving-started" : "onboarding-started", { target: p.displayName, detail: t.name + (lastDay && t.kind === "leaver" ? `, last day ${lastDay}` : "") });
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
      const leaverPerson = store.getPerson(c.personId);
      if (done && leaverPerson && store.isOwner(leaverPerson)) {
        const t0 = c.tasks.find((x) => x.id === taskId);
        if (t0 && t0.action === "disable-login") throw httpError(403, "The system owner's login can't be disabled.");
      }
      const task = onboarding.setTask(c, taskId, !!done, me);
      logEvent(req, session, done ? "onboarding-task-done" : "onboarding-task-undone", { target: (store.getPerson(c.personId) || {}).displayName, detail: task.title });
      // The leaver checklist's "Disable their login" task switches the login off and signs them out.
      if (task.action === "disable-login" && leaverPerson && leaverPerson.account) {
        store.setAccountEnabled(leaverPerson, !done);
        if (done) endSessionsFor(leaverPerson.id);
        logEvent(req, session, done ? "login-disabled" : "login-enabled", { target: store.loginName(leaverPerson), detail: "From the leaver checklist" });
      }
      return sendJson(res, 200, { checklist: onboarding.view(c, me), user: meResponse(session) });
    }
  }

  // ----- Probation & reviews -----
  if (pathname.startsWith("/api/reviews")) {
    if (method === "GET" && pathname === "/api/reviews") {
      const team = reviews.team(me);
      return sendJson(res, 200, {
        mine: me.system ? [] : reviews.forPerson(me, me),
        myProbation: me.system ? null : reviews.probationOf(me),
        team,
        due: reviews.due(me),
        isManager: team.length > 0,
        types: reviews.TYPES,
        outcomes: reviews.OUTCOMES,
      });
    }
    if ((m = /^\/api\/reviews\/person\/([a-f0-9]{16})(\/probation)?$/.exec(pathname))) {
      const p = store.getPerson(m[1]);
      if (!p || !reviews.canManage(me, p)) throw httpError(404, "Person not found.");
      if (method === "GET" && !m[2]) {
        return sendJson(res, 200, { person: { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, startDate: p.startDate || null }, probation: reviews.probationOf(p), reviews: reviews.forPerson(p, me) });
      }
      if (method === "POST" && m[2]) {
        reviews.setProbation(p, await readJsonBody(req));
        logEvent(req, session, "probation-updated", { target: p.displayName });
        return sendJson(res, 200, { ok: true, user: meResponse(session) });
      }
      if (method === "POST") {
        const r = reviews.saveReview(p, await readJsonBody(req), me);
        logEvent(req, session, "review-added", { target: p.displayName, detail: reviews.TYPES[r.type] + (r.outcome ? " – " + reviews.OUTCOMES[r.outcome] : "") });
        return sendJson(res, 201, { ok: true, user: meResponse(session) });
      }
    }
    if (method === "POST" && (m = /^\/api\/reviews\/([a-f0-9]{16})\/(share|delete)$/.exec(pathname))) {
      const r = reviews.getReview(m[1]);
      const p = r && store.getPerson(r.personId);
      if (!r || !reviews.canManage(me, p)) throw httpError(404, "Review not found.");
      if (m[2] === "delete") {
        reviews.deleteReview(r);
        logEvent(req, session, "review-deleted", { target: p.displayName });
      } else {
        const { shared } = await readJsonBody(req);
        reviews.setShared(r, shared);
        if (shared) notifications.notify([r.personId], { type: "review", title: `${me.displayName} shared a ${reviews.TYPES[r.type].toLowerCase()} with you`, link: "/reviews" }, me);
        logEvent(req, session, shared ? "review-shared" : "review-unshared", { target: p.displayName });
      }
      return sendJson(res, 200, { ok: true });
    }
  }

  // ----- Staff documents -----
  if (pathname.startsWith("/api/staff-files")) {
    const manager = stafffiles.canManage(me);
    if (method === "GET" && pathname === "/api/staff-files") {
      const q = new URL(req.url, "http://localhost").searchParams;
      const personId = manager && q.get("person") ? q.get("person") : me.id;
      const p = store.getPerson(personId);
      if (!p) throw httpError(404, "Person not found.");
      const counts = manager ? stafffiles.counts() : {};
      return sendJson(res, 200, {
        person: { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle },
        files: stafffiles.forPerson(p.id, me),
        canManage: manager,
        categories: stafffiles.CATEGORIES,
        people: manager ? store.employees().map((x) => ({ id: x.id, displayName: x.displayName, jobTitle: x.jobTitle, avatarUrl: store.publicView(x).avatarUrl, count: counts[x.id] || 0 })).sort((a, b) => a.displayName.localeCompare(b.displayName)) : [],
      });
    }
    if (method === "POST" && pathname === "/api/staff-files/upload") {
      if (!manager) throw httpError(403, "Only HR can upload staff documents.");
      const meta = headerJson(req, "x-document");
      const buffer = await readRawBody(req, workplace.MAX_FILE_BYTES);
      const p = store.getPerson(meta.personId);
      const f = stafffiles.upload(p, meta, buffer, me);
      logEvent(req, session, "staff-file-uploaded", { target: p.displayName, detail: `${f.category}: ${f.title}` });
      return sendJson(res, 201, { ok: true });
    }
    if ((m = /^\/api\/staff-files\/([a-f0-9]{16})(?:\/(file|delete))?$/.exec(pathname))) {
      const f = stafffiles.getFile(m[1]);
      if (!f || !stafffiles.canSee(me, f)) throw httpError(404, "Document not found.");
      const who = (store.getPerson(f.personId) || {}).displayName;
      if (method === "GET" && m[2] === "file") {
        const file = stafffiles.fileFor(f);
        const download = new URL(req.url, "http://localhost").searchParams.has("download") || !file.inline;
        const encoded = encodeURIComponent(file.name);
        logEvent(req, session, "staff-file-opened", { target: who, detail: f.title });
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
          if (download) headers["Content-Security-Policy"] = "sandbox; default-src 'none'";
          res.writeHead(200, headers);
          res.end(content);
        });
      }
      if (method === "POST") {
        if (!manager) throw httpError(403, "Only HR can change staff documents.");
        if (m[2] === "delete") {
          stafffiles.remove(f);
          logEvent(req, session, "staff-file-deleted", { target: who, detail: f.title });
        } else {
          stafffiles.update(f, await readJsonBody(req));
          logEvent(req, session, "staff-file-updated", { target: who, detail: f.title });
        }
        return sendJson(res, 200, { ok: true });
      }
    }
  }

  // ----- Service status -----
  if (pathname.startsWith("/api/status")) {
    const it = store.can(me, uptime.MANAGE);
    if (method === "GET" && pathname === "/api/status") {
      return sendJson(res, 200, { monitors: uptime.list(), canManage: it });
    }
    if (method === "POST" && (m = /^\/api\/status\/monitors(?:\/([a-f0-9]{16})(?:\/(delete|check))?)?$/.exec(pathname))) {
      if (!it) throw httpError(403, "Only the IT team can change what's monitored.");
      const mon = m[1] ? uptime.getMonitor(m[1]) : null;
      if (m[1] && !mon) throw httpError(404, "Monitor not found.");
      if (m[2] === "check") {
        await uptime.check(mon);
        return sendJson(res, 200, { monitor: uptime.view(mon) });
      }
      if (m[2] === "delete") {
        uptime.deleteMonitor(mon);
        logEvent(req, session, "monitor-deleted", { target: mon.name });
        return sendJson(res, 200, { ok: true });
      }
      const saved = uptime.saveMonitor(await readJsonBody(req), mon);
      logEvent(req, session, mon ? "monitor-updated" : "monitor-added", { target: saved.name, detail: saved.url });
      if (!mon) await uptime.check(saved);
      return sendJson(res, 200, { monitor: uptime.view(saved) });
    }
  }

  // ----- Leave & absence -----
  if (pathname.startsWith("/api/leave")) {
    const leaveManager = store.can(me, leave.MANAGE);
    if (me.system && !leaveManager) throw httpError(403, "Leave isn't available for this account.");
    if (method === "GET" && pathname === "/api/leave") {
      const q = new URL(req.url, "http://localhost").searchParams;
      const year = /^\d{4}$/.test(q.get("year") || "") ? q.get("year") : String(new Date().getFullYear());
      const t = new Date().toISOString().slice(0, 10);
      return sendJson(res, 200, {
        types: leave.TYPES,
        summary: me.system ? null : leave.summary(me.id, year),
        mine: me.system ? [] : leave.mine(me),
        approvals: leave.approvals(me),
        whosOff: leave.team(me, t, rotas.addDays(t, 60)),
        canManage: leaveManager,
        isApprover: leaveManager || store.employees().some((p) => store.supervises(me, p)),
        people: leaveManager ? store.employees().map((p) => ({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl, summary: leave.summary(p.id, year), absence: leave.absenceStats(p.id) })) : [],
        returnToWork: leave.pendingReturnToWork(me),
        // People this viewer can place on leave with "Set leave": everyone for HR, or their own team.
        setPeople: store.employees().filter((p) => p.id !== me.id && (leaveManager || store.supervises(me, p)))
          .map((p) => ({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle })),
        allowances: leaveManager ? leave.allowances() : null,
      });
    }
    if (method === "POST" && pathname === "/api/leave/working-days") {
      const { startDate, endDate, personId } = await readJsonBody(req);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || "") || endDate < startDate) return sendJson(res, 200, { days: 0 });
      // Also say how much annual leave is left that year, for the person the form is for.
      let who = me.system ? null : me;
      if (personId && personId !== me.id) {
        const p = store.getPerson(personId);
        who = p && !p.system && (leaveManager || store.supervises(me, p)) ? p : null;
      }
      return sendJson(res, 200, { days: who ? leave.workingDaysFor(who.id, startDate, endDate) : leave.workingDays(startDate, endDate), remaining: who ? leave.summary(who.id, startDate.slice(0, 4)).remaining : null });
    }
    if (method === "POST" && pathname === "/api/leave") {
      const body = await readJsonBody(req);
      // HR (or a supervisor) can record leave for someone else.
      let person = me;
      if (body.personId && body.personId !== me.id) {
        person = store.getPerson(body.personId);
        if (!person || person.system || !(leaveManager || store.supervises(me, person))) throw httpError(403, "You can't book leave for that person.");
      }
      const r = leave.createRequest(person, body, me);
      const when = `${r.startDate}${r.endDate !== r.startDate ? " to " + r.endDate : ""}`;
      if (r.status === "pending") {
        // Their supervisor(s) approve; anyone who manages leave if they have none.
        const sups = [person.supervisorId].concat((person.otherRoles || []).map((x) => x.supervisorId)).filter(Boolean);
        const to = sups.length ? sups : store.employees().filter((p) => store.can(p, leave.MANAGE)).map((p) => p.id);
        notifications.notify(to, { type: "leave", title: `${person.displayName} asked for ${leave.TYPES[r.type].toLowerCase()}`, body: `${when} (${r.days} day${r.days === 1 ? "" : "s"})`, link: "/leave" }, me);
      } else if (person.id !== me.id) {
        notifications.notify([person.id], { type: "leave", title: `${me.displayName} booked ${leave.TYPES[r.type].toLowerCase()} for you`, body: when, link: "/leave" }, me);
      } else if (r.type === "sick" && person.supervisorId) {
        notifications.notify([person.supervisorId], { type: "leave", title: `${person.displayName} is off sick`, body: when, link: "/leave" }, me);
      }
      logEvent(req, session, r.type === "sick" ? "absence-reported" : "leave-requested", {
        target: person.id === me.id ? undefined : person.displayName,
        detail: `${leave.TYPES[r.type]}, ${r.startDate}${r.endDate !== r.startDate ? " to " + r.endDate : ""} (${r.days} day${r.days === 1 ? "" : "s"})${r.status === "approved" ? ", recorded" : ""}`,
      });
      return sendJson(res, 201, { ok: true, user: meResponse(session) });
    }
    if (method === "POST" && (m = /^\/api\/leave\/([a-f0-9]{16})\/return-to-work$/.exec(pathname))) {
      const r = leave.getRequest(m[1]);
      if (!r) throw httpError(404, "Absence not found.");
      leave.completeReturnToWork(r, await readJsonBody(req), me);
      logEvent(req, session, "return-to-work-completed", { target: (store.getPerson(r.personId) || {}).displayName, detail: `Absence ${r.startDate}${r.endDate !== r.startDate ? " to " + r.endDate : ""}` });
      return sendJson(res, 200, { ok: true, user: meResponse(session) });
    }
    if (method === "POST" && (m = /^\/api\/leave\/([a-f0-9]{16})\/(approve|decline|cancel)$/.exec(pathname))) {
      const r = leave.getRequest(m[1]);
      if (!r) throw httpError(404, "Request not found.");
      const body = await readJsonBody(req);
      const who = (store.getPerson(r.personId) || {}).displayName;
      if (m[2] === "cancel") {
        if (r.personId !== me.id && !leaveManager) throw httpError(403, "You can't cancel that request.");
        leave.cancel(r, me);
        logEvent(req, session, "leave-cancelled", { target: who, detail: `${leave.TYPES[r.type]}, ${r.startDate}` });
      } else {
        leave.decide(r, m[2] === "approve", me, body.note, body.allowOver === true);
        notifications.notify([r.personId], { type: "leave", title: `Your ${leave.TYPES[r.type].toLowerCase()} was ${m[2] === "approve" ? "approved" : "declined"}`, body: `${r.startDate}${r.endDate !== r.startDate ? " to " + r.endDate : ""}${body.note ? ` · ${body.note}` : ""}`, link: "/leave" }, me);
        logEvent(req, session, m[2] === "approve" ? "leave-approved" : "leave-declined", { target: who, detail: `${leave.TYPES[r.type]}, ${r.startDate}${r.endDate !== r.startDate ? " to " + r.endDate : ""}` });
      }
      return sendJson(res, 200, { ok: true, user: meResponse(session) });
    }
    if (method === "POST" && pathname === "/api/leave/allowances") {
      if (!leaveManager) throw httpError(403, "You don't have permission to change allowances.");
      const body = await readJsonBody(req);
      if ("defaultAllowance" in body) leave.setDefaultAllowance(body.defaultAllowance);
      if ("maxCarryOver" in body) {
        leave.setMaxCarryOver(body.maxCarryOver);
        logEvent(req, session, "leave-allowance-changed", { detail: `Carry-over limit ${body.maxCarryOver} days` });
        return sendJson(res, 200, { ok: true });
      }
      if (body.personId) {
        const p = store.getPerson(body.personId);
        if (!p) throw httpError(404, "Person not found.");
        leave.setAllowance(p.id, body.days);
        logEvent(req, session, "leave-allowance-changed", { target: p.displayName, detail: body.days === "" ? "default" : `${body.days} days` });
      } else {
        logEvent(req, session, "leave-allowance-changed", { detail: `Default ${body.defaultAllowance} days` });
      }
      return sendJson(res, 200, { ok: true });
    }
  }

  // ----- Rotas & timesheets -----
  if (pathname.startsWith("/api/rotas") || pathname.startsWith("/api/timesheets")) {
    const rotaManager = store.can(me, rotas.MANAGE);
    const q = new URL(req.url, "http://localhost").searchParams;
    const requireRotas = () => {
      if (!rotaManager) throw httpError(403, "You don't have permission to edit the rota.");
    };
    if (method === "GET" && pathname === "/api/rotas") {
      const week = rotas.weekStart(q.get("week") || new Date().toISOString().slice(0, 10));
      return sendJson(res, 200, {
        week,
        shifts: rotas.shiftsBetween(week, rotas.addDays(week, 6)),
        people: store.employees().map((p) => ({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, company: p.company, otherCompanies: (p.otherRoles || []).map((r) => r.company), avatarUrl: store.publicView(p).avatarUrl }))
          .sort((a, b) => a.displayName.localeCompare(b.displayName)),
        leave: leave.calendarItems(week, rotas.addDays(week, 6)),
        canManage: rotaManager,
        isApprover: rotas.isApprover(me),
      });
    }
    if (method === "POST" && (m = /^\/api\/rotas\/shifts(?:\/([a-f0-9]{16})(\/delete)?)?$/.exec(pathname))) {
      requireRotas();
      const existing = m[1] ? rotas.getShift(m[1]) : null;
      if (m[1] && !existing) throw httpError(404, "Shift not found.");
      if (m[2]) {
        rotas.deleteShift(existing);
        logEvent(req, session, "shift-deleted", { target: (store.getPerson(existing.personId) || {}).displayName, detail: existing.date });
      } else {
        const sh = rotas.saveShift(await readJsonBody(req), existing);
        logEvent(req, session, existing ? "shift-updated" : "shift-added", { target: (store.getPerson(sh.personId) || {}).displayName, detail: `${sh.date} ${sh.start}–${sh.end}` });
      }
      return sendJson(res, 200, { ok: true });
    }
    if (method === "POST" && pathname === "/api/rotas/copy-week") {
      requireRotas();
      const { from, to } = await readJsonBody(req);
      const added = rotas.copyWeek(from, to);
      logEvent(req, session, "rota-copied", { detail: `Week of ${rotas.weekStart(from)} to week of ${rotas.weekStart(to)} (${added} shifts)` });
      return sendJson(res, 200, { ok: true, added });
    }
    if (method === "GET" && pathname === "/api/timesheets/mine") {
      if (me.system) throw httpError(403, "Timesheets aren't available for this account.");
      const week = rotas.weekStart(q.get("week") || new Date().toISOString().slice(0, 10));
      const sheet = rotas.findSheet(me.id, week);
      return sendJson(res, 200, { sheet: rotas.sheetView(sheet || rotas.blankSheet(me, week), me), recent: rotas.myRecent(me) });
    }
    if (method === "POST" && pathname === "/api/timesheets/mine") {
      if (me.system) throw httpError(403, "Timesheets aren't available for this account.");
      const body = await readJsonBody(req);
      const sheet = rotas.saveSheet(me, body);
      if (body.submit) logEvent(req, session, "timesheet-submitted", { detail: `Week of ${sheet.week}` });
      return sendJson(res, 200, { sheet: rotas.sheetView(sheet, me), user: meResponse(session) });
    }
    if (method === "GET" && pathname === "/api/timesheets/review") {
      return sendJson(res, 200, rotas.forReview(me));
    }
    if (method === "POST" && (m = /^\/api\/timesheets\/([a-f0-9]{16})\/(approve|reject)$/.exec(pathname))) {
      const sheet = rotas.getSheet(m[1]);
      if (!sheet) throw httpError(404, "Timesheet not found.");
      const body = await readJsonBody(req);
      rotas.decide(sheet, m[2] === "approve", me, body.note);
      const who = store.getPerson(sheet.personId);
      logEvent(req, session, m[2] === "approve" ? "timesheet-approved" : "timesheet-rejected", { target: (who || {}).displayName, detail: `Week of ${sheet.week}` });
      // Hours worked on a bank holiday are given back as time off in lieu automatically.
      if (m[2] === "approve" && who) {
        const bhHours = Math.round(sheet.days.filter((d) => calendar.BANK_HOLIDAYS[d.date]).reduce((n, d) => n + rotas.hoursOf(d.start, d.end, d.breakMins), 0) * 100) / 100;
        if (bhHours > 0) {
          const names = sheet.days.filter((d) => calendar.BANK_HOLIDAYS[d.date] && rotas.hoursOf(d.start, d.end, d.breakMins) > 0).map((d) => calendar.BANK_HOLIDAYS[d.date]).join(", ");
          leave.addToil(who, bhHours, `Worked on a bank holiday (${names})`, me, "bank-holiday");
          logEvent(req, session, "toil-added", { target: who.displayName, detail: `${bhHours} hours for working on ${names}` });
        }
      }
      // Extra hours on an approved timesheet can be banked as time off in lieu.
      if (m[2] === "approve" && who && Number(body.toilHours) > 0) {
        leave.addToil(who, Number(body.toilHours), `Extra hours, week of ${sheet.week}`, me, "timesheet");
        logEvent(req, session, "toil-added", { target: who.displayName, detail: `${body.toilHours} hours from the timesheet for the week of ${sheet.week}` });
      }
      notifications.notify([sheet.personId], { type: "timesheet", title: `Your timesheet for the week of ${sheet.week} was ${m[2] === "approve" ? "approved" : "sent back"}`, body: (body.note || "") + (Number(body.toilHours) > 0 ? ` ${body.toilHours} hours added as time off in lieu.` : ""), link: "/rotas" }, me);
      return sendJson(res, 200, { ok: true, user: meResponse(session) });
    }
  }

  // ----- Payslips (your own) -----
  if (method === "GET" && pathname === "/api/payslips") {
    return sendJson(res, 200, { payslips: payslips.mine(me), canRunPayroll: store.can(me, payslips.MANAGE) });
  }
  if (method === "GET" && (m = /^\/api\/payslips\/([a-f0-9]{16})$/.exec(pathname))) {
    const slip = payslips.getPayslip(m[1]);
    const allowed = slip && ((slip.personId === me.id && slip.status === "issued") || store.can(me, payslips.MANAGE));
    if (!allowed) throw httpError(404, "Payslip not found.");
    if (slip.personId === me.id) logEvent(req, session, "payslip-viewed", { detail: payslips.periodLabel(slip.period) });
    return sendJson(res, 200, { payslip: payslips.fullView(slip) });
  }

  // ----- Company funds (Human Resources only) -----
  if (pathname.startsWith("/api/funds")) {
    if (!store.can(me, payslips.MANAGE)) throw httpError(403, "Only Human Resources can see company funds.");
    if (method === "GET" && pathname === "/api/funds") {
      return sendJson(res, 200, { ...fundsSummary(), transactions: funds.history(300), sources: funds.SOURCES });
    }
    if (method === "GET" && pathname === "/api/funds/statement") {
      const period = new URL(req.url, "http://localhost").searchParams.get("period") || new Date().toISOString().slice(0, 7);
      const st = funds.statement(period);
      const thisMonth = new Date().toISOString().slice(0, 7);
      const b = funds.balances();
      st.isCurrent = period === thisMonth;
      st.isFuture = period > thisMonth;
      st.current = { main: b.main, payroll: b.payroll, total: Math.round((b.main + b.payroll) * 100) / 100 };
      // Estimate for the end of the month: what's left now, less the payroll still to run in every
      // month from now up to and including this one.
      const nextMonth = (p) => { const [yy, mm] = p.split("-").map(Number); return new Date(Date.UTC(yy, mm, 1)).toISOString().slice(0, 7); };
      const round = (n) => Math.round(n * 100) / 100;
      if (period >= thisMonth) {
        let before = 0;
        for (let q = thisMonth; q < period; q = nextMonth(q)) before += payslips.remainingForPeriod(q).cost;
        const remaining = payslips.remainingForPeriod(period);
        st.remainingPayroll = remaining;
        st.earlierPayroll = round(before);
        st.estimatedEnd = round(st.current.total - before - remaining.cost);
      } else {
        st.remainingPayroll = { people: 0, cost: 0 };
        st.earlierPayroll = 0;
        st.estimatedEnd = st.closing;
      }
      // A forecast for the month after: it starts where this one ends, less that month's payroll.
      // Money coming in is shown separately, based on the average of the last three months.
      if (period >= thisMonth) {
        const after = nextMonth(period);
        const payroll = payslips.remainingForPeriod(after);
        const avgIn = funds.averageMonthlyIn(thisMonth, 3);
        st.nextMonth = {
          period: after,
          periodLabel: payslips.periodLabel(after),
          start: st.estimatedEnd,
          payroll,
          estimatedEnd: round(st.estimatedEnd - payroll.cost),
          averageIn: avgIn,
          estimatedEndWithIncome: round(st.estimatedEnd - payroll.cost + avgIn),
        };
      }
      st.periodLabel = payslips.periodLabel(period);
      st.generatedAt = new Date().toISOString();
      st.generatedBy = me.displayName;
      st.employer = payslips.EMPLOYER;
      logEvent(req, session, "funds-statement", { detail: st.periodLabel });
      return sendJson(res, 200, { statement: st });
    }
    if (method === "POST" && (m = /^\/api\/funds\/(add|remove|transfer|return)$/.exec(pathname))) {
      const body = await readJsonBody(req);
      const t = m[1] === "add" ? funds.addFunds(body, me) : m[1] === "remove" ? funds.removeFunds(body, me)
        : m[1] === "return" ? funds.transferToMain(body, me) : funds.transferToPayroll(body, me);
      const action = { add: "funds-added", remove: "funds-removed", transfer: "funds-transferred", return: "funds-returned" }[m[1]];
      logEvent(req, session, action, { detail: `${funds.fmt(Math.round(Math.abs(t.amount) * 100))}${m[1] === "add" ? " via " + funds.SOURCES[t.source] : ""}${t.reference ? " (ref " + t.reference + ")" : ""}${t.description ? " – " + t.description : ""}` });
      return sendJson(res, 200, { ...fundsSummary(), transactions: funds.history(300), user: meResponse(session) });
    }
  }

  // ----- Payroll (Human Resources only) -----
  if (pathname.startsWith("/api/payroll")) {
    if (!store.can(me, payslips.MANAGE)) throw httpError(403, "Only Human Resources can run payroll.");
    const q = new URL(req.url, "http://localhost").searchParams;
    if (method === "GET" && pathname === "/api/payroll") {
      const now = new Date();
      const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.get("period") || "") ? q.get("period") : now.toISOString().slice(0, 7);
      return sendJson(res, 200, {
        period,
        periodLabel: payslips.periodLabel(period),
        payslips: payslips.forPeriod(period),
        people: payslips.peopleList(),
        rates: payslips.RATES.label,
        studentLoans: Object.fromEntries(Object.entries(payslips.RATES.studentLoans).map(([k, v]) => [k, v.label])),
        employer: payslips.EMPLOYER,
        standardSalary: payslips.STANDARD_MONTHLY_SALARY,
        funds: fundsSummary(),
        requireApproval: payslips.approvalRequired(),
        payrollPeople: store.employees().filter((p) => store.can(p, payslips.MANAGE)).length,
        meId: me.id,
      });
    }
    if ((m = /^\/api\/payroll\/details\/([a-f0-9]{16})$/.exec(pathname))) {
      const p = store.getPerson(m[1]);
      if (!p || p.system) throw httpError(404, "Person not found.");
      if (method === "GET") return sendJson(res, 200, { details: payslips.payDetails(p.id), person: { id: p.id, displayName: p.displayName, company: p.company } });
      if (method === "POST") {
        payslips.savePayDetails(p.id, await readJsonBody(req), me);
        logEvent(req, session, "pay-details-updated", { target: p.displayName });
        return sendJson(res, 200, { ok: true });
      }
    }
    if (method === "POST" && pathname === "/api/payroll/estimate") {
      const { personId, period, payDate } = await readJsonBody(req);
      return sendJson(res, 200, payslips.estimate(personId, period, payDate));
    }
    // Live tax/NI for the payslip editor as payments change.
    if (method === "POST" && pathname === "/api/payroll/calculate") {
      const { personId, payments, payDate, payslipId } = await readJsonBody(req);
      if (!store.getPerson(personId)) throw httpError(400, "Choose an employee.");
      const clean = (Array.isArray(payments) ? payments : []).map((l) => ({ label: String((l && l.label) || ""), amount: Math.round(Number((l && l.amount) || 0) * 100) / 100 })).filter((l) => isFinite(l.amount));
      const date = /^\d{4}-\d{2}-\d{2}$/.test(payDate || "") ? payDate : new Date().toISOString().slice(0, 10);
      return sendJson(res, 200, payslips.calculate(personId, clean, date, payslipId || null));
    }
    if (method === "POST" && pathname === "/api/payroll/run") {
      const { period, payDate, personIds } = await readJsonBody(req);
      payslips.assertCanRun();
      const made = [];
      const skipped = [];
      for (const id of Array.isArray(personIds) ? personIds : []) {
        try {
          made.push(payslips.createDraft(id, { period, payDate }, me, { deferCharge: true }));
        } catch (err) {
          if (!(err instanceof store.ValidationError)) throw err;
          skipped.push({ name: (store.getPerson(id) || {}).displayName || id, reason: err.message });
        }
      }
      // One payment out of the payroll fund for the whole run.
      const cost = made.reduce((n, s) => n + s.charged, 0);
      let paid = { fromPayroll: 0, fromMain: 0 };
      if (made.length) {
        paid = funds.chargePayroll(cost, `Payroll – ${payslips.periodLabel(period)}, ${made.length} payslip${made.length === 1 ? "" : "s"}`, me) || paid;
        logEvent(req, session, "payroll-drafted", { detail: `${payslips.periodLabel(period)}: ${made.length} payslip${made.length === 1 ? "" : "s"}, ${funds.fmt(cost)} from the payroll fund` });
      }
      return sendJson(res, 200, { made: made.length, skipped, cost: cost / 100, fromPayroll: paid.fromPayroll, fromMain: paid.fromMain, funds: fundsSummary() });
    }
    if (method === "POST" && pathname === "/api/payroll/payslips") {
      const body = await readJsonBody(req);
      const slip = payslips.createDraft(body.personId, body, me);
      logEvent(req, session, "payroll-drafted", { target: (store.getPerson(slip.personId) || {}).displayName, detail: payslips.periodLabel(slip.period) + (slip.additional ? " (additional payslip)" : "") });
      return sendJson(res, 201, { payslip: payslips.fullView(slip) });
    }
    if ((m = /^\/api\/payroll\/payslips\/([a-f0-9]{16})(?:\/(issue|withdraw|delete))?$/.exec(pathname))) {
      const slip = payslips.getPayslip(m[1]);
      if (!slip) throw httpError(404, "Payslip not found.");
      const who = (store.getPerson(slip.personId) || {}).displayName;
      const label = payslips.periodLabel(slip.period);
      if (method === "GET" && !m[2]) return sendJson(res, 200, { payslip: payslips.fullView(slip) });
      if (method === "POST") {
        if (m[2] === "issue" || m[2] === "withdraw") {
          payslips.setIssued(slip, m[2] === "issue", me);
          if (m[2] === "issue") notifications.notify([slip.personId], { type: "payslip", title: `Your payslip for ${label} is ready`, link: "/payslips" }, me);
          logEvent(req, session, m[2] === "issue" ? "payslip-issued" : "payslip-withdrawn", { target: who, detail: label });
        } else if (m[2] === "delete") {
          payslips.deletePayslip(slip, me);
          logEvent(req, session, "payslip-deleted", { target: who, detail: label });
        } else {
          payslips.updateDraft(slip, await readJsonBody(req), me);
          logEvent(req, session, "payslip-edited", { target: who, detail: label });
        }
        return sendJson(res, 200, { ok: true, payslip: m[2] === "delete" ? null : payslips.fullView(slip) });
      }
    }
    if (method === "POST" && pathname === "/api/payroll/issue-all") {
      const { period } = await readJsonBody(req);
      let n = 0;
      let waiting = 0;
      for (const s of payslips.forPeriod(period)) {
        if (s.status !== "draft") continue;
        if (payslips.approvalRequired() && !payslips.getPayslip(s.id).approvedBy) { waiting++; continue; }
        payslips.setIssued(payslips.getPayslip(s.id), true, me);
        notifications.notify([s.personId], { type: "payslip", title: `Your payslip for ${payslips.periodLabel(period)} is ready`, link: "/payslips" }, me);
        n++;
      }
      if (n) logEvent(req, session, "payslip-issued", { detail: `${payslips.periodLabel(period)}: ${n} payslip${n === 1 ? "" : "s"}` });
      return sendJson(res, 200, { issued: n, waiting });
    }
  }

  // ----- IT Helpdesk -----
  if (pathname.startsWith("/api/helpdesk")) {
    if (method === "GET" && pathname === "/api/helpdesk") {
      return sendJson(res, 200, {
        tickets: helpdesk.list(me),
        canManage: helpdesk.isAgent(me),
        agents: helpdesk.agents(),
        categories: helpdesk.CATEGORIES,
        priorities: helpdesk.PRIORITIES,
        statuses: helpdesk.STATUSES,
      });
    }
    if (method === "POST" && pathname === "/api/helpdesk") {
      const t = helpdesk.createTicket(me, await readJsonBody(req));
      logEvent(req, session, "ticket-raised", { target: `#${t.number}`, detail: t.subject });
      notifications.notify(helpdesk.agents().map((a) => a.id), { type: "helpdesk", title: `New IT ticket #${t.number} from ${me.displayName}`, body: t.subject, link: "/helpdesk" }, me);
      return sendJson(res, 201, { ticket: helpdesk.fullView(t, me), user: meResponse(session) });
    }
    if ((m = /^\/api\/helpdesk\/([a-f0-9]{16})(?:\/(reply|update))?$/.exec(pathname))) {
      const t = helpdesk.getTicket(m[1]);
      if (!t || !helpdesk.canSee(me, t)) throw httpError(404, "Ticket not found.");
      if (method === "GET" && !m[2]) return sendJson(res, 200, { ticket: helpdesk.fullView(t, me) });
      if (method === "POST" && m[2] === "reply") {
        const body = await readJsonBody(req);
        helpdesk.reply(t, me, body);
        if (!(body.internal && helpdesk.isAgent(me))) {
          const to = me.id === t.createdBy ? (t.assigneeId ? [t.assigneeId] : helpdesk.agents().map((a) => a.id)) : [t.createdBy];
          notifications.notify(to, { type: "helpdesk", title: `${me.displayName} replied on ticket #${t.number}`, body: t.subject, link: "/helpdesk" }, me);
        }
        logEvent(req, session, body.internal && helpdesk.isAgent(me) ? "ticket-note-added" : "ticket-replied", { target: `#${t.number}` });
        return sendJson(res, 200, { ticket: helpdesk.fullView(t, me), user: meResponse(session) });
      }
      if (method === "POST" && m[2] === "update") {
        const changes = helpdesk.update(t, me, await readJsonBody(req));
        if (changes.length) logEvent(req, session, "ticket-updated", { target: `#${t.number}`, detail: changes.join(", ") });
        return sendJson(res, 200, { ticket: helpdesk.fullView(t, me), user: meResponse(session) });
      }
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
    // Only people who can open System Admin can give that permission out, or change who has it.
    // System Admin and payroll can only be handed out (or changed on a role) by people who have them.
    const guardSystemAdmin = (role, body) => {
      for (const key of store.GUARDED_PERMISSIONS) {
        if (store.can(me, key)) continue;
        const before = role ? role.permissions.includes(key) : false;
        const after = body && Array.isArray(body.permissions) ? body.permissions.includes(key) : before;
        const name = (store.PERMISSIONS.find((x) => x.key === key) || {}).name || key;
        if (before || after) throw httpError(403, `Only people with the “${name}” permission can change roles that include it.`);
      }
    };
    if (method === "POST" && pathname === "/api/roles") {
      const body = await readJsonBody(req);
      guardSystemAdmin(null, body);
      const r = store.saveRole(body, null);
      logEvent(req, session, "role-created", { target: r.name, detail: r.permissions.join(", ") });
      return sendJson(res, 201, { ok: true });
    }
    if (method === "POST" && (m = /^\/api\/roles\/([a-f0-9]{16})(?:\/(delete|members))?$/.exec(pathname))) {
      const r = store.getRole(m[1]);
      if (!r) throw httpError(404, "Role not found.");
      const body = m[2] === "delete" ? null : await readJsonBody(req);
      guardSystemAdmin(r, body);
      if (m[2] === "delete") {
        store.deleteRole(r);
        logEvent(req, session, "role-deleted", { target: r.name });
      } else if (m[2] === "members") {
        store.setRoleMembers(r, body.personIds);
        logEvent(req, session, "role-members-changed", { target: r.name });
      } else {
        store.saveRole(body, r);
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

// Balances, the cost of the next payroll, and any warning. Payroll takes from the payroll fund
// first and the main balance for anything it can't cover, so both count towards the next payroll.
function fundsSummary() {
  const b = funds.balances();
  const nextPayroll = payslips.forecastMonthlyCost();
  const money = (n) => funds.fmt(Math.round(n * 100));
  let warning = null;
  if (b.main < 0 || b.payroll < 0) {
    const parts = [];
    if (b.main < 0) parts.push(`the main balance is overdrawn by ${money(-b.main)}`);
    if (b.payroll < 0) parts.push(`the payroll fund is overdrawn by ${money(-b.payroll)}`);
    const text = parts.join(" and ");
    warning = { level: "danger", message: `${text.charAt(0).toUpperCase() + text.slice(1)}. The next payroll cannot be met until funds are added.` };
  } else if (b.payroll + b.main < nextPayroll) {
    warning = { level: "danger", message: `The next payroll needs about ${money(nextPayroll)}, but there's only ${money(b.payroll + b.main)} across the payroll fund and main balance. It will leave the main balance overdrawn.` };
  } else if (b.payroll < nextPayroll) {
    warning = { level: "warn", message: `The payroll fund has ${money(b.payroll)} and the next payroll needs about ${money(nextPayroll)}. The other ${money(nextPayroll - b.payroll)} will be taken from the main balance.` };
  }
  return { balances: b, nextPayroll, warning, overdrawn: b.main < 0 || b.payroll < 0 };
}

// Data retention: deletes old personal data once a day, as set in System Admin.
function runRetention(run) {
  const r = run((p) => {
    endSessionsFor(p.id);
    store.audit({ action: "leaver-record-deleted", actor: "(automatic)", target: p.displayName, detail: "Data retention" });
  });
  const total = Object.values(r).reduce((a, b) => a + b, 0);
  if (total) store.audit({ action: "retention-cleanup", actor: "(automatic)", detail: `${r.audit} log entries, ${r.applicants} applicants, ${r.chat} chat messages, ${r.tickets} IT tickets, ${r.enquiries} website enquiries, ${r.leavers} leavers` });
  return r;
}
retention.schedule(runRetention);

extraRoutes.init({
  runRetention,
  sendJson, httpError, readJsonBody, readRawBody, headerJson, logEvent, meResponse, endSessionsFor, reloadAll, clientIp,
  notify: (ids, item, from) => notifications.notify(ids, item, from),
  sessions: () => sessions,
});

// ---------- Routing ----------

// A new staff session for an HN Group service acting for this person (HN Account), from where they are.
// Sessions for HN Account (accounts.hngroup.org.uk) are marked: only HN Account makes and manages sign-in accounts.
const issueSession = (personId, ip, userAgent) => createSession(personId, { socket: { remoteAddress: "127.0.0.1" }, headers: { "x-real-ip": ip || "127.0.0.1", "user-agent": userAgent || "HN Account" } }, { via: "accounts" });
const statusSso = createStatusSso({ store, sessions, sendJson, redirect, readJsonBody, logEvent, handleChangePassword, handleSetCode, verifyBrowserPin, verifyVpnPin, issueSession, googleLogin, discordLogin });
const portalAuth = portalAuthLib.createPortalAuth({ store, sessions, resume, createSession, cookieFor, parseCookies, send, redirect, logEvent, loginNext, clientIp });

async function route(req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const session = getSession(req);

  if (await statusSso(req, res, pathname, session)) return;
  if (await portalAuth(req, res, pathname)) return;
  if (pathname === "/api/login/options") return sendJson(res, 200, { auth: portalAuthLib.enabled() });

  if (pathname.startsWith("/api/")) return routeApi(req, res, pathname, session);

  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method not allowed", { Allow: "GET, HEAD" });
  }

  if (pathname === "/healthz") return sendJson(res, 200, { ok: true });
  if (pathname === "/" || pathname === "/dashboard") return redirect(res, session ? "/home" : "/login");

  if (pathname === "/login") {
    const next = loginNext(new URL(req.url, "http://localhost").searchParams.get("next"));
    // Opening the sign-in page always ends any existing sign-in.
    if (session) {
      sessions.delete(session.token);
      return send(res, 302, "", { Location: "/login" + (next ? "?next=" + encodeURIComponent(next) : ""), "Cache-Control": "no-store", "Set-Cookie": sessionCookie(req, "", 0) });
    }
    // With HN Group Auth installed, signing in only ever happens on auth.hngroup.org.uk (password and PIN, its
    // "Welcome back", or Sign in with Google). The portal has no form or PIN step of its own: it goes straight to
    // Auth, or explains why the last sign-in didn't finish with one button to try again (so it can never loop).
    const params = new URL(req.url, "http://localhost").searchParams;
    if (portalAuthLib.enabled()) {
      const raw = parseCookies(req)[resume.COOKIE], clear = raw ? (resume.forget(raw), { "Set-Cookie": resume.cookie(req, "", true) }) : {};
      const start = "/auth/start" + (next ? "?next=" + encodeURIComponent(next) : "");
      if (!params.has("maintenance") && !params.has("auth_error")) return send(res, 302, "", { Location: start, "Cache-Control": "no-store", ...clear });
      return sendSignInProblem(req, res, params, start, clear);
    }
    return sendLoginPage(req, res);
  }

  // Loading or refreshing a portal page signs you out. The only page load allowed is the one
  // straight after signing in (or switching with "log in as"); moving around inside the portal
  // doesn't reload the page, so it isn't affected.
  if (APP_ROUTES.has(pathname)) {
    if (!session) return redirect(res, "/login");
    if (store.maintenance().on && !store.hasOwnerAccess(session.person)) {
      sessions.delete(session.token);
      return send(res, 302, "", { Location: "/login?maintenance=1", "Cache-Control": "no-store", "Set-Cookie": sessionCookie(req, "", 0) });
    }
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
