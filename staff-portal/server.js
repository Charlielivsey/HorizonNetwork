// HN Group Staff Portal — zero-dependency Node.js server.
// Handles authentication (scrypt-hashed passwords, cookie sessions) and serves the portal pages.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = parseInt(process.env.PORT || "3200", 10);
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const SESSION_COOKIE = "hn_staff_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// ---------- Users ----------

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.hash, "hex"));
}

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    const users = [
      {
        username: "admin",
        displayName: "Administrator",
        role: "Administrator",
        company: "HN Group",
        mustChangePassword: true,
        ...hashPassword("admin"),
      },
    ];
    saveUsers(users);
    console.log("Created default user admin/admin — change this password after first login.");
    return users;
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

function saveUsers(users) {
  const tmp = USERS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, USERS_FILE);
}

let users = loadUsers();

function findUser(username) {
  const name = String(username || "").trim().toLowerCase();
  return users.find((u) => u.username.toLowerCase() === name);
}

function publicUser(user) {
  return {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    company: user.company,
    mustChangePassword: !!user.mustChangePassword,
  };
}

// ---------- Sessions & rate limiting ----------

const sessions = new Map(); // token -> { username, expires }
const failedAttempts = new Map(); // ip -> { count, first }

function createSession(username) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { username, expires: Date.now() + SESSION_TTL_MS });
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
  const user = findUser(session.username);
  if (!user) return null;
  session.expires = Date.now() + SESSION_TTL_MS; // sliding expiry
  return { token, user };
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

function isHttps(req) {
  return req.headers["x-forwarded-proto"] === "https";
}

function sessionCookie(req, token, maxAgeSeconds) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isHttps(req)) parts.push("Secure");
  return parts.join("; ");
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; form-action 'self'",
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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    // Requiring a JSON content type blocks cross-site form posts (CSRF) on top of SameSite=Strict.
    if (!String(req.headers["content-type"] || "").startsWith("application/json")) {
      return reject(Object.assign(new Error("Expected JSON"), { status: 415 }));
    }
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

// ---------- Routes ----------

async function handleLogin(req, res) {
  const ip = clientIp(req);
  if (isLockedOut(ip)) {
    return sendJson(res, 429, { error: "Too many failed attempts. Please try again in 15 minutes." });
  }
  const { username, password } = await readJsonBody(req);
  const user = findUser(username);
  if (!user || typeof password !== "string" || !verifyPassword(password, user)) {
    recordFailure(ip);
    console.warn(`Failed login for "${String(username).slice(0, 64)}" from ${ip}`);
    return sendJson(res, 401, { error: "Incorrect username or password." });
  }
  failedAttempts.delete(ip);
  const token = createSession(user.username);
  console.log(`User ${user.username} signed in from ${ip}`);
  sendJson(res, 200, { user: publicUser(user) }, {
    "Set-Cookie": sessionCookie(req, token, SESSION_TTL_MS / 1000),
  });
}

function handleLogout(req, res) {
  const session = getSession(req);
  if (session) sessions.delete(session.token);
  sendJson(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
}

async function handleChangePassword(req, res, session) {
  const { currentPassword, newPassword } = await readJsonBody(req);
  if (typeof currentPassword !== "string" || !verifyPassword(currentPassword, session.user)) {
    return sendJson(res, 400, { error: "Your current password is incorrect." });
  }
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return sendJson(res, 400, { error: "New password must be at least 8 characters." });
  }
  if (newPassword === currentPassword) {
    return sendJson(res, 400, { error: "New password must be different from the current one." });
  }
  Object.assign(session.user, hashPassword(newPassword), { mustChangePassword: false });
  saveUsers(users);
  // Sign out every other session for this user.
  for (const [token, s] of sessions) {
    if (s.username === session.user.username && token !== session.token) sessions.delete(token);
  }
  console.log(`User ${session.user.username} changed their password`);
  sendJson(res, 200, { user: publicUser(session.user) });
}

async function route(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;
  const session = getSession(req);

  if (req.method === "POST") {
    if (pathname === "/api/login") return handleLogin(req, res);
    if (pathname === "/api/logout") return handleLogout(req, res);
    if (pathname === "/api/change-password") {
      if (!session) return sendJson(res, 401, { error: "Not signed in." });
      return handleChangePassword(req, res, session);
    }
    return sendJson(res, 404, { error: "Not found." });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method not allowed", { Allow: "GET, HEAD, POST" });
  }

  if (pathname === "/api/me") {
    if (!session) return sendJson(res, 401, { error: "Not signed in." });
    return sendJson(res, 200, { user: publicUser(session.user) });
  }

  if (pathname === "/healthz") return sendJson(res, 200, { ok: true });

  if (pathname === "/") return redirect(res, session ? "/dashboard" : "/login");

  if (pathname === "/login") {
    if (session) return redirect(res, "/dashboard");
    return sendFile(res, path.join(PUBLIC_DIR, "login.html"), { "Cache-Control": "no-store" });
  }

  if (pathname === "/dashboard") {
    if (!session) return redirect(res, "/login");
    return sendFile(res, path.join(PUBLIC_DIR, "dashboard.html"), { "Cache-Control": "no-store" });
  }

  if (pathname.startsWith("/assets/")) {
    const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
    if (!filePath.startsWith(path.join(PUBLIC_DIR, "assets") + path.sep)) {
      return send(res, 404, "Not found", { "Content-Type": "text/plain" });
    }
    return sendFile(res, filePath, { "Cache-Control": "public, max-age=300" });
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
