// Account security settings and personal data rules, set in System Admin:
//  - password rules: minimum length, blocking common/breached passwords, optional expiry
//  - data retention: how long the activity log, rejected job applicants, chat messages, closed IT
//    tickets and leavers' records are kept before they're deleted automatically
// Also remembers sign-ins people have reported as "this wasn't me". Stored in DATA_DIR/security.json.

const datafile = require("./datafile");

const EXPIRY_CHOICES = [0, 90, 180, 365];
const RETENTION_CHOICES = {
  auditDays: [0, 180, 365, 730, 1095, 2190],
  applicantsDays: [0, 90, 180, 365],
  chatDays: [0, 90, 180, 365, 730],
  ticketsDays: [0, 180, 365, 730],
  enquiriesDays: [0, 180, 365, 730],
  leaversYears: [0, 6, 7],
};
const RETENTION_DEFAULTS = { auditDays: 730, applicantsDays: 180, chatDays: 0, ticketsDays: 0, enquiriesDays: 365, leaversYears: 0 };

// The most common passwords from public breach lists (plus a few local ones). Anything on this list,
// or one of these with a number or symbol added, is refused when "Block common passwords" is on.
const COMMON = [
  "password", "passw0rd", "p@ssword", "p@ssw0rd", "123456", "1234567", "12345678", "123456789", "1234567890", "12345", "1234",
  "qwerty", "qwertyuiop", "qwerty123", "1q2w3e4r", "1qaz2wsx", "zaq12wsx", "asdfghjkl", "asdf1234", "zxcvbnm", "abc123", "abcd1234",
  "111111", "000000", "121212", "123123", "654321", "666666", "696969", "777777", "888888", "987654321", "112233", "123321",
  "iloveyou", "letmein", "welcome", "welcome1", "monkey", "dragon", "football", "baseball", "soccer", "liverpool", "arsenal",
  "chelsea", "manchester", "everton", "tottenham", "princess", "sunshine", "shadow", "master", "superman", "batman", "trustno1",
  "starwars", "pokemon", "michael", "jessica", "charlie", "jordan", "hunter", "thomas", "daniel", "andrew", "robert", "matthew",
  "freedom", "whatever", "ginger", "summer", "winter", "autumn", "spring", "flower", "hello", "hello123", "secret", "secret123",
  "computer", "internet", "samsung", "google", "apple", "admin", "admin123", "administrator", "root", "login", "changeme",
  "default", "guest", "test", "test123", "testing", "temp", "temppass", "letmein1", "mustang", "harley", "ranger", "buster",
  "tigger", "cheese", "pepper", "maggie", "hannah", "london", "england", "unitedkingdom", "monday", "friday", "january",
  "lovely", "loveme", "babygirl", "angel", "family", "blessed", "jesus", "money", "killer", "access", "pass", "passcode",
  "company", "office", "staff", "staffportal", "portal", "horizon", "horizonnetwork", "hngroup", "horizonmedia", "horizonadvertising",
];
const COMMON_SET = new Set(COMMON);

// Used until init() runs (e.g. by command-line scripts that only load the staff records).
const empty = () => ({ password: { minLength: 8, blockCommon: true, expiryDays: 0, expirySince: null }, retention: { ...RETENTION_DEFAULTS }, lastCleanup: null, reports: [] });
let db = { data: empty(), save() {} };

function init(dataDir) {
  db = datafile.open(dataDir, "security.json", empty);
  for (const k of Object.keys(RETENTION_DEFAULTS)) if (db.data.retention[k] === undefined) db.data.retention[k] = RETENTION_DEFAULTS[k];
}

// store requires this module, so its error class is looked up when needed.
const invalid = (message) => new (require("./store").ValidationError)(message);

function policy() {
  return { ...db.data.password };
}

function setPolicy(input) {
  const p = db.data.password;
  const min = Math.round(Number(input.minLength));
  if (!(min >= 8 && min <= 32)) throw invalid("The minimum length must be between 8 and 32 characters.");
  const days = Number(input.expiryDays) || 0;
  if (!EXPIRY_CHOICES.includes(days)) throw invalid("Choose how often passwords must be changed.");
  // Expiry counts from when it was turned on, so nobody is forced to change straight away.
  if (days && !p.expiryDays) p.expirySince = new Date().toISOString();
  if (!days) p.expirySince = null;
  Object.assign(p, { minLength: min, blockCommon: !!input.blockCommon, expiryDays: days });
  db.save();
  return policy();
}

const normalise = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9@]/g, "");

// Returns a message saying what's wrong with the password, or "" when it's fine.
function passwordProblem(password, person) {
  const p = db.data.password;
  if (typeof password !== "string" || password.length < p.minLength) return `Your password must be at least ${p.minLength} characters.`;
  if (password.length > 200) return "That password is too long.";
  if (!p.blockCommon) return "";
  const bare = normalise(password);
  const stripped = bare.replace(/[0-9@]+$/, "").replace(/^[0-9@]+/, "");
  if (COMMON_SET.has(bare) || COMMON_SET.has(stripped) || /^(.)\1+$/.test(bare) || /^(?:0123456789|1234567890|abcdefghij)/.test(bare)) {
    return "That password is too common: it appears in lists of leaked passwords. Choose something harder to guess, like three random words.";
  }
  if (person) {
    const names = [person.firstName, person.lastName, person.displayName].concat((person.emails || []).map((e) => String(e.address || "").split("@")[0]))
      .map(normalise).filter((n) => n.length >= 4);
    if (names.some((n) => stripped === n || bare === n || (stripped.length < n.length + 4 && stripped.includes(n)))) return "Don't base your password on your name or email address.";
  }
  return "";
}

function passwordExpired(person) {
  const p = db.data.password;
  if (!p.expiryDays || !person || !person.account || person.system || person.account.passwordTemporary) return false;
  const changed = [person.account.passwordChangedAt, p.expirySince].filter(Boolean).sort().pop();
  if (!changed) return false;
  return Date.now() - new Date(changed).getTime() > p.expiryDays * 86400000;
}

function retention() {
  return { ...db.data.retention, lastCleanup: db.data.lastCleanup };
}

function setRetention(input) {
  const r = db.data.retention;
  for (const [k, choices] of Object.entries(RETENTION_CHOICES)) {
    if (input[k] === undefined) continue;
    const v = Number(input[k]) || 0;
    if (!choices.includes(v)) throw invalid("Choose one of the options for each setting.");
    r[k] = v;
  }
  db.save();
  return retention();
}

function setLastCleanup(result) {
  db.data.lastCleanup = { at: new Date().toISOString(), ...result };
  db.save();
}

// ----- "This wasn't me" -----
const reportKey = (at, ip) => `${at}|${ip || ""}`;

function isReported(at, ip) {
  return db.data.reports.some((r) => r.key === reportKey(at, ip));
}

function addReport(personId, entry, ticketNumber) {
  db.data.reports.push({ key: reportKey(entry.at, entry.ip), personId, at: new Date().toISOString(), ticketNumber });
  if (db.data.reports.length > 500) db.data.reports.splice(0, db.data.reports.length - 500);
  db.save();
}

module.exports = { EXPIRY_CHOICES, RETENTION_CHOICES, init, policy, setPolicy, passwordProblem, passwordExpired, retention, setRetention, setLastCleanup, isReported, addReport };
