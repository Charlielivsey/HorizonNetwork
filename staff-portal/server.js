// HN Group Staff Portal — zero-dependency Node.js server.
// Handles authentication (scrypt-hashed passwords, cookie sessions), the staff API and the portal pages.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./lib/store");

const PORT = parseInt(process.env.PORT || "3200", 10);
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");

const SESSION_COOKIE = "hn_staff_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_AVATAR_BODY_BYTES = 2 * 1024 * 1024;

// Pages of the single-page app; the browser handles routing between them.
const APP_ROUTES = new Set(["/home", "/directory", "/employees", "/settings"]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

store.init(DATA_DIR);

// ---------- Sessions & rate limiting ----------

const sessions = new Map(); // token -> { personId, expires }
const failedAttempts = new Map(); // ip -> { count, first }

function createSession(personId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { personId, expires: Date.now() + SESSION_TTL_MS });
  return token;
}

function getSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  const person = store.getPerson(session.personId);
  if (!person || !person.account || !person.account.enabled) {
    sessions.delete(token);
    return null;
  }
  session.expires = Date.now() + SESSION_TTL_MS; // sliding expiry
  return { token, person };
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

function sessionCookie(req, token, maxAgeSeconds) {
  const parts = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAgeSeconds}`];
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

// ---------- API handlers ----------

async function handleLogin(req, res) {
  const ip = clientIp(req);
  if (isLockedOut(ip)) {
    return sendJson(res, 429, { error: "Too many failed attempts. Please try again in 15 minutes." });
  }
  const { username, password } = await readJsonBody(req);
  const person = store.findByLogin(username);
  if (!person || !store.verifyPassword(person, password)) {
    recordFailure(ip);
    console.warn(`Failed login for "${String(username).slice(0, 64)}" from ${ip}`);
    return sendJson(res, 401, { error: "Incorrect email or password." });
  }
  failedAttempts.delete(ip);
  store.recordLogin(person);
  const token = createSession(person.id);
  console.log(`${store.meView(person).username} signed in from ${ip}`);
  sendJson(res, 200, { user: store.meView(person) }, {
    "Set-Cookie": sessionCookie(req, token, SESSION_TTL_MS / 1000),
  });
}

async function handleChangePassword(req, res, session) {
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
  sendJson(res, 200, { user: store.meView(person) });
}

function requireManager(session) {
  if (!store.canManage(session.person)) throw httpError(403, "You don't have access to employee management.");
}

function requireEmployee(id) {
  const person = store.getPerson(id);
  if (!person || person.system) throw httpError(404, "Employee not found.");
  return person;
}

async function routeApi(req, res, pathname, session) {
  const method = req.method;

  if (method === "POST" && pathname === "/api/login") return handleLogin(req, res);
  if (method === "POST" && pathname === "/api/logout") {
    if (session) sessions.delete(session.token);
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
  }

  if (!session) return sendJson(res, 401, { error: "Not signed in." });
  const me = session.person;

  if (method === "GET" && pathname === "/api/me") return sendJson(res, 200, { user: store.meView(me) });
  if (method === "POST" && pathname === "/api/me/password") return handleChangePassword(req, res, session);

  // Everything else waits until a temporary password has been replaced.
  if (me.account.passwordTemporary) {
    return sendJson(res, 403, { error: "Please create a new password first.", code: "PASSWORD_CHANGE_REQUIRED" });
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
    store.updateOwnProfile(me, await readJsonBody(req));
    return sendJson(res, 200, { user: store.meView(me) });
  }
  if (method === "POST" && pathname === "/api/me/avatar") {
    const { image } = await readJsonBody(req, MAX_AVATAR_BODY_BYTES);
    store.saveAvatar(me, image);
    return sendJson(res, 200, { user: store.meView(me) });
  }
  if (method === "POST" && pathname === "/api/me/avatar/remove") {
    store.removeAvatar(me);
    return sendJson(res, 200, { user: store.meView(me) });
  }

  let m;
  if (method === "GET" && (m = /^\/api\/avatars\/([a-f0-9]{16})$/.exec(pathname))) {
    const avatar = store.avatarFile(store.getPerson(m[1]));
    if (!avatar) return send(res, 404, "Not found", { "Content-Type": "text/plain" });
    return sendFile(res, avatar.file, { "Content-Type": avatar.mime, "Cache-Control": "private, max-age=86400" });
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
      console.log(`${store.meView(me).username} added employee ${person.displayName}`);
      return sendJson(res, 201, { employee: store.manageView(person) });
    }
    if (method === "POST" && (m = /^\/api\/employees\/([a-f0-9]{16})(?:\/(delete|account|account\/disable|account\/enable))?$/.exec(pathname))) {
      const person = requireEmployee(m[1]);
      const action = m[2];

      if (!action) {
        store.saveEmployee(await readJsonBody(req), person);
        return sendJson(res, 200, { employee: store.manageView(person) });
      }
      if (action === "delete") {
        if (person.id === me.id) throw httpError(400, "You can't delete your own record.");
        store.deleteEmployee(person);
        endSessionsFor(person.id);
        console.log(`${store.meView(me).username} deleted employee ${person.displayName}`);
        return sendJson(res, 200, { ok: true });
      }
      if (action === "account") {
        if (person.id === me.id) throw httpError(400, "Use Profile & settings to change your own password.");
        const credentials = store.issueTemporaryPassword(person);
        endSessionsFor(person.id);
        console.log(`${store.meView(me).username} issued a temporary password for ${credentials.username}`);
        return sendJson(res, 200, { ...credentials, employee: store.manageView(person) });
      }
      if (!person.account) throw httpError(400, "This employee doesn't have a login account.");
      if (person.id === me.id) throw httpError(400, "You can't disable your own account.");
      store.setAccountEnabled(person, action === "account/enable");
      if (action === "account/disable") endSessionsFor(person.id);
      return sendJson(res, 200, { employee: store.manageView(person) });
    }
  }

  // ----- Access rules (system admin only) -----
  if (pathname === "/api/settings/access") {
    if (!me.system) throw httpError(403, "Only the system administrator can change access rules.");
    if (method === "POST") store.setManagementTitles((await readJsonBody(req)).managementTitles);
    if (method === "GET" || method === "POST") {
      return sendJson(res, 200, {
        managementTitles: store.getManagementTitles(),
        managers: store.employees().filter(store.canManage).map((p) => ({ displayName: p.displayName, jobTitle: p.jobTitle })),
      });
    }
  }

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
    if (session) return redirect(res, "/home");
    return sendFile(res, path.join(PUBLIC_DIR, "login.html"), { "Cache-Control": "no-store" });
  }

  if (APP_ROUTES.has(pathname)) {
    if (!session) return redirect(res, "/login");
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
