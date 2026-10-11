// Service status. The server checks each monitored website on a timer and keeps seven days of
// results, so the status page can show what's up, what's down, response times and uptime.
// People with "helpdesk.manage" (IT) choose what's monitored. Stored in DATA_DIR/uptime.json.

const http = require("http");
const https = require("https");
const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const MANAGE = "helpdesk.manage";
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 10000;

let db;
let timer = null;
let saveTimer = null;
const running = new Set();

function init(dataDir, selfUrl) {
  db = datafile.open(dataDir, "uptime.json", () => ({ monitors: [], checks: {} }));
  if (!db.data.selfAdded && selfUrl) {
    db.data.monitors.push({ id: newId(), name: "Staff portal", url: selfUrl, intervalMin: 5, createdAt: new Date().toISOString(), self: true });
    db.data.selfAdded = true;
    db.save();
  }
}

const newId = () => crypto.randomBytes(8).toString("hex");

function validUrl(v) {
  let u;
  try { u = new URL(String(v || "").trim()); } catch (e) { throw new store.ValidationError("Enter a full web address, like https://horizon-network.co.uk"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new store.ValidationError("Only http:// and https:// addresses can be monitored.");
  return u.toString();
}

function saveMonitor(input, existing) {
  const name = String(input.name || "").trim().slice(0, 80);
  if (!name) throw new store.ValidationError("Give it a name.");
  const fields = {
    name,
    url: validUrl(input.url),
    intervalMin: [1, 5, 10, 15, 30, 60].includes(Number(input.intervalMin)) ? Number(input.intervalMin) : 5,
  };
  if (existing) Object.assign(existing, fields);
  else db.data.monitors.push((existing = { id: newId(), ...fields, createdAt: new Date().toISOString() }));
  db.save();
  return existing;
}

function getMonitor(id) {
  return db.data.monitors.find((m) => m.id === id) || null;
}

function deleteMonitor(m) {
  db.data.monitors = db.data.monitors.filter((x) => x.id !== m.id);
  delete db.data.checks[m.id];
  db.save();
}

// One request: up if it answers with a status below 400 within the time limit.
function probe(url) {
  return new Promise((resolve) => {
    const started = Date.now();
    const lib = url.startsWith("https:") ? https : http;
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      resolve({ at: new Date().toISOString(), ms: Date.now() - started, ...result });
    };
    try {
      const req = lib.get(url, { timeout: TIMEOUT_MS, headers: { "User-Agent": "HN-Staff-Portal-Status/1.0" } }, (res) => {
        res.resume();
        finish({ ok: res.statusCode < 400, status: res.statusCode });
      });
      req.on("timeout", () => { req.destroy(); finish({ ok: false, error: "No response within 10 seconds" }); });
      req.on("error", (err) => finish({ ok: false, error: friendlyError(err) }));
    } catch (err) {
      finish({ ok: false, error: friendlyError(err) });
    }
  });
}

function friendlyError(err) {
  const code = err && err.code;
  if (code === "ENOTFOUND") return "Address not found (DNS)";
  if (code === "ECONNREFUSED") return "Connection refused";
  if (code === "ECONNRESET") return "Connection reset";
  if (code === "CERT_HAS_EXPIRED") return "SSL certificate has expired";
  if (code && /CERT|SSL|TLS/.test(code)) return "SSL certificate problem";
  return (err && err.message) || "Couldn't connect";
}

async function check(m) {
  if (running.has(m.id)) return;
  running.add(m.id);
  try {
    const result = await probe(m.url);
    const list = (db.data.checks[m.id] = db.data.checks[m.id] || []);
    list.push(result);
    const cutoff = new Date(Date.now() - KEEP_MS).toISOString();
    while (list.length && list[0].at < cutoff) list.shift();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => db.save(), 2000);
    return result;
  } finally {
    running.delete(m.id);
  }
}

// Every minute, check whatever is due.
function start() {
  if (timer) return;
  const tick = () => {
    const now = Date.now();
    for (const m of db.data.monitors) {
      const list = db.data.checks[m.id] || [];
      const last = list.length ? Date.parse(list[list.length - 1].at) : 0;
      if (now - last >= m.intervalMin * 60000 - 5000) check(m);
    }
  };
  setTimeout(tick, 3000).unref();
  timer = setInterval(tick, 60000);
  timer.unref();
}

function uptime(list, ms) {
  const cutoff = new Date(Date.now() - ms).toISOString();
  const recent = list.filter((c) => c.at >= cutoff);
  if (!recent.length) return null;
  return Math.round((recent.filter((c) => c.ok).length / recent.length) * 10000) / 100;
}

// The last 24 hours in 48 half-hour blocks: up, down, partly down, or no data.
function timeline(list) {
  const blocks = [];
  const now = Date.now();
  for (let i = 47; i >= 0; i--) {
    const from = new Date(now - (i + 1) * 30 * 60000).toISOString();
    const to = new Date(now - i * 30 * 60000).toISOString();
    const inBlock = list.filter((c) => c.at >= from && c.at < to);
    blocks.push(!inBlock.length ? "none" : inBlock.every((c) => c.ok) ? "up" : inBlock.some((c) => c.ok) ? "partial" : "down");
  }
  return blocks;
}

function view(m) {
  const list = db.data.checks[m.id] || [];
  const last = list[list.length - 1] || null;
  // When did the current state start?
  let since = null;
  if (last) {
    for (let i = list.length - 1; i >= 0 && list[i].ok === last.ok; i--) since = list[i].at;
  }
  const lastDay = list.filter((c) => c.ok && c.at >= new Date(Date.now() - 86400000).toISOString());
  return {
    id: m.id,
    name: m.name,
    url: m.url,
    intervalMin: m.intervalMin,
    self: !!m.self,
    state: !last ? "pending" : last.ok ? "up" : "down",
    last,
    since,
    uptime24h: uptime(list, 86400000),
    uptime7d: uptime(list, KEEP_MS),
    avgMs: lastDay.length ? Math.round(lastDay.reduce((n, c) => n + c.ms, 0) / lastDay.length) : null,
    timeline: timeline(list),
    recentErrors: list.filter((c) => !c.ok).slice(-5).reverse(),
  };
}

function list() {
  return db.data.monitors.map(view);
}

function downCount() {
  return list().filter((m) => m.state === "down").length;
}

module.exports = { MANAGE, init, start, saveMonitor, getMonitor, deleteMonitor, check, list, view, downCount };
