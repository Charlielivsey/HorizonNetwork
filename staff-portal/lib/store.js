// Data layer for the staff portal: people (employees + system accounts), passwords,
// email generation and access settings. Everything is kept in JSON files in DATA_DIR.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const COMPANIES = [
  "HN Group Limited",
  "Horizon Network Limited",
  "Horizon Advertising",
  "Horizon Development",
  "Horizon Media Group",
];

const DOMAINS = [
  "hngroup.org.uk",
  "horizon-network.co.uk",
  "horizonadvertising.co.uk",
  "media.hngroup.org.uk",
];

// Domain pre-selected for a new employee's first email, based on their company.
const COMPANY_DOMAINS = {
  "HN Group Limited": "hngroup.org.uk",
  "Horizon Network Limited": "horizon-network.co.uk",
  "Horizon Advertising": "horizonadvertising.co.uk",
  "Horizon Development": "hngroup.org.uk",
  "Horizon Media Group": "media.hngroup.org.uk",
};

// Job title words/phrases that give access to Employee Management (leadership and HR).
// Editable by the admin in the portal (Employee Management → Access rules).
const DEFAULT_MANAGEMENT_TITLES = [
  "Chief",
  "Director",
  "Head of",
  "Founder",
  "Leadership",
  "Human Resources",
  "HR",
];

const DEFAULT_TIMEZONE = "Europe/London";
const ADMIN_USERNAME = "admin@hngroup.org.uk";
// The system owner has access to everything, including PIN-protected System Admin.
const DEFAULT_OWNER_EMAIL = "charlie.livsey@hngroup.org.uk";
const DEFAULT_SYSTEM_PIN = "0103";
const TIMEZONES = new Set([...Intl.supportedValuesOf("timeZone"), "UTC"]);
const LOCAL_PART_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const MAX_EMAILS = 10;

let dataDir;
let peopleFile;
let settingsFile;
let auditFile;
let avatarDir;
let people = [];
let settings = {};

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

// ---------- Persistence ----------

function writeJson(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function savePeople() {
  writeJson(peopleFile, people);
}

function init(dir) {
  dataDir = dir;
  peopleFile = path.join(dataDir, "people.json");
  settingsFile = path.join(dataDir, "settings.json");
  auditFile = path.join(dataDir, "audit.log");
  avatarDir = path.join(dataDir, "avatars");
  fs.mkdirSync(avatarDir, { recursive: true, mode: 0o700 });

  people = loadPeople();
  settings = fs.existsSync(settingsFile)
    ? JSON.parse(fs.readFileSync(settingsFile, "utf8"))
    : { managementTitles: DEFAULT_MANAGEMENT_TITLES };
  if (!settings.ownerEmail) settings.ownerEmail = DEFAULT_OWNER_EMAIL;
  if (!settings.systemPin) settings.systemPin = hashPassword(DEFAULT_SYSTEM_PIN);
  writeJson(settingsFile, settings);
}

function loadPeople() {
  if (fs.existsSync(peopleFile)) {
    const list = JSON.parse(fs.readFileSync(peopleFile, "utf8"));
    // The built-in admin used to sign in as plain "admin"; it now uses an email address.
    const oldAdmin = list.find((p) => p.system && p.username === "admin");
    if (oldAdmin && !list.some((p) => p.system && p.username === ADMIN_USERNAME)) {
      oldAdmin.username = ADMIN_USERNAME;
      writeJson(peopleFile, list);
      console.log(`Renamed the admin login to ${ADMIN_USERNAME}`);
    }
    // Extra companies used to be a plain list; they now carry their own job title and supervisor.
    let migrated = false;
    for (const p of list) {
      if (!p.otherRoles) {
        p.otherRoles = (p.otherCompanies || []).map((company) => ({ company, jobTitle: "", supervisorId: null }));
        delete p.otherCompanies;
        migrated = true;
      }
    }
    if (migrated) writeJson(peopleFile, list);
    return list;
  }

  // First run of this version: carry over accounts from the original users.json, if any.
  const legacyFile = path.join(dataDir, "users.json");
  let list;
  if (fs.existsSync(legacyFile)) {
    list = JSON.parse(fs.readFileSync(legacyFile, "utf8")).map((u) =>
      systemPerson(u.username === "admin" ? ADMIN_USERNAME : u.username, u.displayName, {
        salt: u.salt,
        hash: u.hash,
        mustChangePassword: !!u.mustChangePassword,
      })
    );
    console.log(`Migrated ${list.length} account(s) from users.json`);
  } else {
    list = [systemPerson(ADMIN_USERNAME, "Administrator", { ...hashPassword("admin"), mustChangePassword: true })];
    console.log(`Created default login ${ADMIN_USERNAME} / admin — change this password after first login.`);
  }
  writeJson(peopleFile, list);
  if (fs.existsSync(legacyFile)) fs.renameSync(legacyFile, legacyFile + ".migrated");
  return list;
}

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

function systemPerson(username, displayName, account) {
  const now = new Date().toISOString();
  return {
    id: newId(),
    system: true,
    username,
    firstName: "",
    lastName: "",
    displayName: displayName || username,
    jobTitle: "System Administrator",
    company: "HN Group Limited",
    otherRoles: [],
    supervisorId: null,
    emails: [],
    phone: "",
    location: "",
    timezone: DEFAULT_TIMEZONE,
    avatar: null,
    createdAt: now,
    updatedAt: now,
    account: {
      enabled: true,
      passwordTemporary: false,
      mustChangePassword: false,
      createdAt: now,
      lastLoginAt: null,
      ...account,
    },
  };
}

// ---------- Passwords ----------

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}

function verifyPassword(person, password) {
  if (!person || !person.account || typeof password !== "string") return false;
  const { hash } = hashPassword(password, person.account.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(person.account.hash, "hex"));
}

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const groups = [];
  for (let g = 0; g < 3; g++) {
    let s = "";
    for (let i = 0; i < 4; i++) s += alphabet[crypto.randomInt(alphabet.length)];
    groups.push(s);
  }
  return groups.join("-");
}

function setPassword(person, newPassword) {
  Object.assign(person.account, hashPassword(newPassword), {
    passwordTemporary: false,
    mustChangePassword: false,
  });
  person.updatedAt = new Date().toISOString();
  savePeople();
}

function validateNewPassword(newPassword, currentPassword) {
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    throw new ValidationError("New password must be at least 8 characters.");
  }
  if (newPassword.length > 200) throw new ValidationError("New password is too long.");
  if (currentPassword !== undefined && newPassword === currentPassword) {
    throw new ValidationError("New password must be different from the current one.");
  }
}

// ---------- Lookups & views ----------

function getPerson(id) {
  return people.find((p) => p.id === id) || null;
}

function findSystemAccount(username) {
  return people.find((p) => p.system && p.username === username) || null;
}

function employees() {
  return people.filter((p) => !p.system);
}

function primaryEmail(person) {
  const e = person.emails.find((x) => x.primary) || person.emails[0];
  return e ? e.address : "";
}

function loginName(person) {
  return person.system ? person.username : primaryEmail(person);
}

// Login accepts a system username or any of an employee's email addresses.
function findByLogin(login) {
  const name = String(login || "").trim().toLowerCase();
  if (!name) return null;
  return (
    people.find(
      (p) =>
        p.account &&
        p.account.enabled &&
        (p.system ? p.username.toLowerCase() === name : p.emails.some((e) => e.address === name))
    ) || null
  );
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleGrantsManagement(title) {
  return (settings.managementTitles || []).some((phrase) =>
    new RegExp(`(^|[^a-z0-9])${escapeRegExp(phrase)}($|[^a-z0-9])`, "i").test(title || "")
  );
}

function isOwner(person) {
  const owner = String(settings.ownerEmail || "").toLowerCase();
  return !!person && !person.system && !!owner && person.emails.some((e) => e.address === owner);
}

function allJobTitles(person) {
  return [person.jobTitle].concat((person.otherRoles || []).map((r) => r.jobTitle)).filter(Boolean);
}

function canManage(person) {
  return !!person && (person.system || isOwner(person) || allJobTitles(person).some(titleGrantsManagement));
}

function avatarUrl(person) {
  return person.avatar ? `/api/avatars/${person.id}?v=${person.avatar.version}` : null;
}

function publicView(p) {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    displayName: p.displayName,
    jobTitle: p.jobTitle,
    company: p.company,
    otherRoles: p.otherRoles || [],
    supervisorId: p.supervisorId,
    isOwner: isOwner(p),
    emails: p.emails,
    phone: p.phone,
    location: p.location,
    timezone: p.timezone,
    avatarUrl: avatarUrl(p),
  };
}

function manageView(p) {
  return {
    ...publicView(p),
    loginUsername: loginName(p),
    account: p.account
      ? {
          enabled: p.account.enabled,
          passwordTemporary: p.account.passwordTemporary,
          createdAt: p.account.createdAt,
          lastLoginAt: p.account.lastLoginAt,
        }
      : null,
  };
}

// Every company someone works at, with the job title and supervisor that apply there.
// Extra companies fall back to the main job title and supervisor when theirs are left blank.
function rolesOf(p) {
  const brief = (id) => {
    const s = id ? getPerson(id) : null;
    return s ? { id: s.id, displayName: s.displayName, jobTitle: s.jobTitle } : null;
  };
  return [{ company: p.company, jobTitle: p.jobTitle, supervisor: brief(p.supervisorId), main: true }].concat(
    (p.otherRoles || []).map((r) => ({
      company: r.company,
      jobTitle: r.jobTitle || p.jobTitle,
      supervisor: brief(r.supervisorId || p.supervisorId),
      main: false,
    }))
  );
}

function meView(p) {
  const supervisor = p.supervisorId ? getPerson(p.supervisorId) : null;
  return {
    ...publicView(p),
    roles: rolesOf(p),
    system: !!p.system,
    username: loginName(p),
    supervisor: supervisor ? { id: supervisor.id, displayName: supervisor.displayName } : null,
    canManage: canManage(p),
    isAdmin: !!p.system || isOwner(p),
    mustChangePassword: !!p.account.mustChangePassword,
    passwordTemporary: !!p.account.passwordTemporary,
  };
}

// ---------- Email addresses ----------

function nameSlug(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s'’]+/g, "")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

function emailInUse(address, excludeId) {
  return people.some(
    (p) => p.id !== excludeId && (p.emails.some((e) => e.address === address) || (p.system && p.username.toLowerCase() === address))
  );
}

// Resolves the email rows from the employee form. "auto" rows become firstname.lastname@domain,
// or firstname.<random number>.lastname@domain when that is already taken.
function resolveEmails(firstName, lastName, rows, excludeId) {
  const errors = [];
  const out = [];
  const used = new Set();
  const first = nameSlug(firstName);
  const last = nameSlug(lastName);
  rows = Array.isArray(rows) ? rows.slice(0, MAX_EMAILS) : [];
  if (rows.length === 0) errors.push("Add at least one email address.");

  const isFree = (local, domain) =>
    LOCAL_PART_RE.test(local) &&
    !local.includes("..") &&
    !used.has(`${local}@${domain}`) &&
    !emailInUse(`${local}@${domain}`, excludeId);

  for (const row of rows) {
    const domain = String((row && row.domain) || "").toLowerCase();
    const auto = !!(row && row.auto);
    let local = String((row && row.local) || "").trim().toLowerCase();
    let adjusted = false;

    if (!DOMAINS.includes(domain)) {
      errors.push("Choose an email domain from the list.");
    } else if (auto) {
      if (!first || !last) {
        local = "";
      } else {
        const base = `${first}.${last}`;
        const numbered = new RegExp(`^${escapeRegExp(first)}\\.\\d+\\.${escapeRegExp(last)}$`);
        if (isFree(base, domain)) {
          local = base;
        } else if (numbered.test(local) && isFree(local, domain)) {
          adjusted = true; // keep the number already shown to the user
        } else {
          adjusted = true;
          for (let attempt = 0; ; attempt++) {
            const n = attempt < 50 ? crypto.randomInt(10, 100) : crypto.randomInt(100, 10000);
            local = `${first}.${n}.${last}`;
            if (isFree(local, domain) || attempt > 500) break;
          }
        }
      }
    } else if (!LOCAL_PART_RE.test(local) || local.includes("..")) {
      errors.push(`"${local || "(blank)"}@${domain}" isn't a valid email address.`);
    } else if (used.has(`${local}@${domain}`) || emailInUse(`${local}@${domain}`, excludeId)) {
      errors.push(`${local}@${domain} is already in use.`);
    }

    if (local && domain) used.add(`${local}@${domain}`);
    out.push({ local, domain, auto, adjusted, primary: !!(row && row.primary), address: local ? `${local}@${domain}` : "" });
  }

  // Exactly one primary address.
  const firstPrimary = out.findIndex((e) => e.primary);
  out.forEach((e, i) => (e.primary = firstPrimary === -1 ? i === 0 : i === firstPrimary));
  return { emails: out, errors };
}

// ---------- Employees ----------

function str(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function saveEmployee(input, existing) {
  const errors = [];
  const firstName = str(input.firstName, 60);
  const lastName = str(input.lastName, 60);
  const displayName = str(input.displayName, 80) || `${firstName} ${lastName}`.trim();
  const jobTitle = str(input.jobTitle, 100);
  const company = str(input.company, 60);
  const timezone = TIMEZONES.has(input.timezone) ? input.timezone : DEFAULT_TIMEZONE;
  const otherRoles = [];
  for (const r of Array.isArray(input.otherRoles) ? input.otherRoles.slice(0, COMPANIES.length) : []) {
    const roleCompany = str(r && r.company, 60);
    if (!COMPANIES.includes(roleCompany) || roleCompany === company || otherRoles.some((x) => x.company === roleCompany)) continue;
    let roleSupervisor = (r && r.supervisorId) || null;
    if (roleSupervisor) {
      const sup = getPerson(roleSupervisor);
      if (!sup || sup.system || (existing && sup.id === existing.id)) {
        errors.push(`Choose a valid supervisor for ${roleCompany}.`);
        roleSupervisor = null;
      }
    }
    otherRoles.push({ company: roleCompany, jobTitle: str(r.jobTitle, 100), supervisorId: roleSupervisor });
  }

  if (!firstName) errors.push("First name is required.");
  if (!lastName) errors.push("Last name is required.");
  if (!jobTitle) errors.push("Job title is required.");
  if (!COMPANIES.includes(company)) errors.push("Choose a company.");

  let supervisorId = input.supervisorId || null;
  if (supervisorId) {
    const sup = getPerson(supervisorId);
    if (!sup || sup.system || (existing && sup.id === existing.id)) errors.push("Choose a valid supervisor.");
    else if (existing) {
      // Prevent loops (someone supervising their own manager).
      for (let cur = sup, hops = 0; cur && hops < 1000; cur = getPerson(cur.supervisorId), hops++) {
        if (cur.id === existing.id) {
          errors.push("That supervisor reports to this employee — choose someone else.");
          break;
        }
      }
    }
  }

  const resolved = resolveEmails(firstName, lastName, input.emails, existing && existing.id);
  errors.push(...resolved.errors);
  if (errors.length) throw new ValidationError(errors.join(" "));

  const now = new Date().toISOString();
  const fields = {
    firstName,
    lastName,
    displayName,
    jobTitle,
    company,
    otherRoles,
    supervisorId,
    emails: resolved.emails.map((e) => ({ address: e.address, primary: e.primary })),
    phone: str(input.phone, 40),
    location: str(input.location, 80),
    timezone,
    updatedAt: now,
  };

  if (existing) {
    Object.assign(existing, fields);
    savePeople();
    return existing;
  }
  const person = { id: newId(), system: false, ...fields, avatar: null, createdAt: now, account: null };
  people.push(person);
  savePeople();
  return person;
}

function deleteEmployee(person) {
  people = people.filter((p) => p.id !== person.id);
  for (const p of people) {
    if (p.supervisorId === person.id) p.supervisorId = null;
    for (const r of p.otherRoles || []) if (r.supervisorId === person.id) r.supervisorId = null;
  }
  removeAvatar(person, false);
  savePeople();
}

// Creates a login account, or resets the password of an existing one, with a temporary password.
function issueTemporaryPassword(person) {
  const temporaryPassword = generateTemporaryPassword();
  const now = new Date().toISOString();
  person.account = {
    enabled: true,
    mustChangePassword: false,
    createdAt: (person.account && person.account.createdAt) || now,
    lastLoginAt: (person.account && person.account.lastLoginAt) || null,
    ...hashPassword(temporaryPassword),
    passwordTemporary: true,
  };
  person.updatedAt = now;
  savePeople();
  return { username: loginName(person), temporaryPassword };
}

function setAccountEnabled(person, enabled) {
  person.account.enabled = !!enabled;
  savePeople();
}

function recordLogin(person) {
  person.account.lastLoginAt = new Date().toISOString();
  savePeople();
}

function updateOwnProfile(person, input) {
  const displayName = str(input.displayName, 80);
  if (!displayName) throw new ValidationError("Display name can't be blank.");
  if (input.timezone && !TIMEZONES.has(input.timezone)) throw new ValidationError("Choose a valid time zone.");
  Object.assign(person, {
    displayName,
    phone: str(input.phone, 40),
    location: str(input.location, 80),
    timezone: input.timezone || person.timezone || DEFAULT_TIMEZONE,
    updatedAt: new Date().toISOString(),
  });
  savePeople();
}

// ---------- Avatars ----------

const IMAGE_TYPES = {
  jpeg: { ext: "jpg", mime: "image/jpeg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { ext: "png", mime: "image/png", magic: (b) => b.slice(0, 4).toString("hex") === "89504e47" },
  webp: { ext: "webp", mime: "image/webp", magic: (b) => b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP" },
};

function saveAvatar(person, dataUrl) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!match) throw new ValidationError("Upload a JPG, PNG or WebP image.");
  const type = IMAGE_TYPES[match[1]];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 1024 * 1024) throw new ValidationError("That image is too large (max 1 MB).");
  if (!type.magic(buffer)) throw new ValidationError("That file doesn't look like a valid image.");

  removeAvatar(person, false);
  fs.writeFileSync(path.join(avatarDir, `${person.id}.${type.ext}`), buffer, { mode: 0o600 });
  person.avatar = { ext: type.ext, version: Date.now() };
  savePeople();
}

function removeAvatar(person, save = true) {
  if (!person.avatar) return;
  fs.rmSync(path.join(avatarDir, `${person.id}.${person.avatar.ext}`), { force: true });
  person.avatar = null;
  if (save) savePeople();
}

function avatarFile(person) {
  if (!person || !person.avatar) return null;
  const type = Object.values(IMAGE_TYPES).find((t) => t.ext === person.avatar.ext);
  return { file: path.join(avatarDir, `${person.id}.${person.avatar.ext}`), mime: type.mime };
}

// ---------- Settings ----------

function getManagementTitles() {
  return settings.managementTitles || [];
}

function setManagementTitles(list) {
  if (!Array.isArray(list)) throw new ValidationError("Expected a list of job titles.");
  const clean = [];
  for (const item of list) {
    const t = str(item, 60);
    if (t && !clean.some((c) => c.toLowerCase() === t.toLowerCase())) clean.push(t);
  }
  settings.managementTitles = clean.slice(0, 100);
  writeJson(settingsFile, settings);
}

// ---------- System Admin ----------

function verifySystemPin(pin) {
  if (typeof pin !== "string" || !settings.systemPin) return false;
  const { hash } = hashPassword(pin, settings.systemPin.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(settings.systemPin.hash, "hex"));
}

function setSystemPin(pin) {
  if (!/^\d{4,8}$/.test(String(pin || ""))) throw new ValidationError("The PIN must be 4 to 8 digits.");
  settings.systemPin = hashPassword(pin);
  writeJson(settingsFile, settings);
}

function audit(entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  fs.appendFileSync(auditFile, line + "\n", { mode: 0o600 });
}

function readAudit(limit) {
  if (!fs.existsSync(auditFile)) return [];
  const lines = fs.readFileSync(auditFile, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).reverse().map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function allPeople() {
  return people;
}

module.exports = {
  ADMIN_USERNAME,
  COMPANIES,
  DOMAINS,
  COMPANY_DOMAINS,
  DEFAULT_TIMEZONE,
  ValidationError,
  init,
  getPerson,
  findSystemAccount,
  savePeople,
  employees,
  findByLogin,
  verifyPassword,
  validateNewPassword,
  setPassword,
  canManage,
  publicView,
  manageView,
  meView,
  resolveEmails,
  saveEmployee,
  deleteEmployee,
  issueTemporaryPassword,
  setAccountEnabled,
  recordLogin,
  updateOwnProfile,
  saveAvatar,
  removeAvatar,
  avatarFile,
  getManagementTitles,
  setManagementTitles,
  isOwner,
  verifySystemPin,
  setSystemPin,
  audit,
  readAudit,
  allPeople,
  loginName,
};
