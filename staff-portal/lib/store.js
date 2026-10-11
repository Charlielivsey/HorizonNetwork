// Data layer for the staff portal: people (employees + system accounts), passwords,
// email generation and access settings. Everything is kept in JSON files in DATA_DIR.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const COMPANIES = [
  "HN Group",
  "Horizon Network",
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
  "HN Group": "hngroup.org.uk",
  "Horizon Network": "horizon-network.co.uk",
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

// Company names that have changed; old values in saved data are updated on startup.
const RENAMED_COMPANIES = { "HN Group Limited": "HN Group", "Horizon Network Limited": "Horizon Network" };

const DEFAULT_TIMEZONE = "Europe/London";
const THEMES = ["system", "light", "dark", "lavender", "lavender-dusk", "ocean", "forest", "midnight"];
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
  if (!settings.roles) migrateToRoles();
  writeJson(settingsFile, settings);
}

// ---------- Roles & permissions ----------

const PERMISSIONS = [
  { key: "staff.manage", name: "Manage staff", description: "Add, edit and remove employees, and manage their logins." },
  { key: "access.manage", name: "Manage roles", description: "Create roles and choose who has them." },
  { key: "announcements.manage", name: "Post announcements", description: "Post, edit and delete announcements." },
  { key: "documents.manage", name: "Manage documents", description: "Upload, edit and delete documents and policies." },
  { key: "events.manage", name: "Manage the calendar", description: "Add, edit and delete calendar events and company holidays." },
  { key: "polls.manage", name: "Run polls & surveys", description: "Create polls and surveys and see the results." },
  { key: "onboarding.manage", name: "Run onboarding", description: "Start onboarding checklists and edit the templates." },
];
const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

// First run with roles: create sensible defaults, and give anyone who had access through their
// job title (the old rule) the "Leadership & HR" role so nobody loses access.
function migrateToRoles() {
  const leadership = { id: newId(), name: "Leadership & HR", permissions: PERMISSION_KEYS.slice() };
  settings.roles = [
    leadership,
    { id: newId(), name: "Communications", permissions: ["announcements.manage", "events.manage", "polls.manage"] },
    { id: newId(), name: "Documents", permissions: ["documents.manage"] },
  ];
  let changed = false;
  for (const p of people) {
    if (p.system) continue;
    if (allJobTitles(p).some(titleGrantsManagement)) {
      p.roleIds = [leadership.id];
      changed = true;
    }
  }
  if (changed) savePeople();
}

function listRoles() {
  return (settings.roles || []).map((r) => ({
    ...r,
    members: people.filter((p) => !p.system && (p.roleIds || []).includes(r.id)).map((p) => p.id),
  }));
}

function cleanPermissions(list) {
  return (Array.isArray(list) ? list : []).filter((k, i, arr) => PERMISSION_KEYS.includes(k) && arr.indexOf(k) === i);
}

function saveRole(input, existing) {
  const name = str(input.name, 60);
  if (!name) throw new ValidationError("Give the role a name.");
  if ((settings.roles || []).some((r) => r !== existing && r.name.toLowerCase() === name.toLowerCase())) {
    throw new ValidationError("There's already a role with that name.");
  }
  const fields = { name, permissions: cleanPermissions(input.permissions) };
  if (existing) Object.assign(existing, fields);
  else settings.roles.push((existing = { id: newId(), ...fields }));
  writeJson(settingsFile, settings);
  return existing;
}

function getRole(id) {
  return (settings.roles || []).find((r) => r.id === id) || null;
}

function deleteRole(role) {
  settings.roles = settings.roles.filter((r) => r.id !== role.id);
  for (const p of people) if (p.roleIds) p.roleIds = p.roleIds.filter((id) => id !== role.id);
  writeJson(settingsFile, settings);
  savePeople();
}

function setRoleMembers(role, personIds) {
  const ids = new Set(Array.isArray(personIds) ? personIds : []);
  for (const p of people) {
    if (p.system) continue;
    const has = (p.roleIds || []).includes(role.id);
    if (ids.has(p.id) && !has) p.roleIds = (p.roleIds || []).concat(role.id);
    if (!ids.has(p.id) && has) p.roleIds = p.roleIds.filter((id) => id !== role.id);
  }
  savePeople();
}

// The owner and the built-in admin account can do everything; everyone else gets the
// permissions of the roles they've been given.
function permissionsOf(person) {
  if (!person) return [];
  if (person.system || isOwner(person)) return PERMISSION_KEYS.slice();
  const out = new Set();
  for (const id of person.roleIds || []) {
    const role = getRole(id);
    if (role) role.permissions.forEach((k) => out.add(k));
  }
  return [...out];
}

function can(person, permission) {
  return permissionsOf(person).includes(permission);
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
    for (const p of list) {
      if (RENAMED_COMPANIES[p.company]) { p.company = RENAMED_COMPANIES[p.company]; migrated = true; }
      for (const r of p.otherRoles || []) {
        if (RENAMED_COMPANIES[r.company]) { r.company = RENAMED_COMPANIES[r.company]; migrated = true; }
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
    company: "HN Group",
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

// ---------- Sign-in codes (asked for after the password) ----------

function hasCode(person) {
  return !!(person && person.account && person.account.code);
}

function verifyCode(person, code) {
  if (!hasCode(person) || typeof code !== "string") return false;
  const { hash } = hashPassword(code, person.account.code.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(person.account.code.hash, "hex"));
}

function validateNewCode(code) {
  code = String(code || "");
  if (!/^\d{6}$/.test(code)) throw new ValidationError("Your code must be exactly 6 digits.");
  const ascending = "01234567890123456789";
  const descending = "98765432109876543210";
  if (/^(\d)\1{5}$/.test(code) || ascending.includes(code) || descending.includes(code)) {
    throw new ValidationError("That code is too easy to guess. Avoid repeated or sequential digits.");
  }
  return code;
}

function setCode(person, code) {
  person.account.code = hashPassword(validateNewCode(code));
  person.updatedAt = new Date().toISOString();
  savePeople();
}

function clearCode(person) {
  if (!person.account) return;
  delete person.account.code;
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
  return can(person, "staff.manage");
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
    banner: bannerView(p),
    status: currentStatus(p),
    birthday: p.birthday && p.birthday.show ? { month: p.birthday.month, day: p.birthday.day } : null,
    startDate: p.startDate || null,
  };
}

function manageView(p) {
  return {
    ...publicView(p),
    roleIds: p.roleIds || [],
    loginUsername: loginName(p),
    account: p.account
      ? {
          enabled: p.account.enabled,
          hasCode: hasCode(p),
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
  // A supervisor is shown in their role at the same company, or their main role if they don't work there.
  const brief = (id, company) => {
    const s = id ? getPerson(id) : null;
    if (!s) return null;
    const other = s.company === company ? null : (s.otherRoles || []).find((r) => r.company === company);
    const sameCompany = s.company === company || !!other;
    return {
      id: s.id,
      displayName: s.displayName,
      jobTitle: other ? other.jobTitle || s.jobTitle : s.jobTitle,
      company: sameCompany ? company : s.company,
    };
  };
  return [{ company: p.company, jobTitle: p.jobTitle, supervisor: brief(p.supervisorId, p.company), main: true }].concat(
    (p.otherRoles || []).map((r) => ({
      company: r.company,
      jobTitle: r.jobTitle || p.jobTitle,
      supervisor: brief(r.supervisorId || p.supervisorId, r.company),
      main: false,
    }))
  );
}

function meView(p) {
  const supervisor = p.supervisorId ? getPerson(p.supervisorId) : null;
  return {
    ...publicView(p),
    roles: rolesOf(p),
    theme: THEMES.includes(p.theme) ? p.theme : "light",
    system: !!p.system,
    username: loginName(p),
    supervisor: supervisor ? { id: supervisor.id, displayName: supervisor.displayName } : null,
    canManage: canManage(p),
    myBirthday: p.birthday || null,
    permissions: permissionsOf(p),
    roleNames: (p.roleIds || []).map((id) => (getRole(id) || {}).name).filter(Boolean),
    isAdmin: !!p.system || isOwner(p),
    mustChangePassword: !!p.account.mustChangePassword,
    passwordTemporary: !!p.account.passwordTemporary,
    codeSetupRequired: !hasCode(p),
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
    startDate: validDate(input.startDate),
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
  removeBanner(person, false);
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

function validDate(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v + "T00:00:00Z"))) throw new ValidationError("Enter a valid date.");
  return v;
}

// ---------- Status / out of office ----------

const STATUS_TYPES = ["available", "busy", "away", "ooo"];

// A status with an end date clears itself once that date has passed.
function currentStatus(p) {
  const st = p.status;
  if (!st || !STATUS_TYPES.includes(st.type)) return null;
  if (st.until && st.until < new Date().toISOString().slice(0, 10)) return null;
  return st;
}

function setStatus(person, input) {
  if (!input || !input.type) {
    person.status = null;
  } else {
    if (!STATUS_TYPES.includes(input.type)) throw new ValidationError("Choose a status.");
    person.status = { type: input.type, message: str(input.message, 120), until: validDate(input.until) };
  }
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
  // Birthday: day and month only (no year), shown to colleagues only if the person chooses.
  if ("birthdayMonth" in input) {
    const month = Number(input.birthdayMonth);
    const day = Number(input.birthdayDay);
    if (!month || !day) person.birthday = null;
    else {
      const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
      if (!max || day < 1 || day > max) throw new ValidationError("Enter a valid birthday.");
      person.birthday = { month, day, show: !!input.showBirthday };
    }
  }
  savePeople();
}

function markAnnouncementsSeen(person) {
  person.announcementsSeenAt = new Date().toISOString();
  savePeople();
}

function setTheme(person, theme) {
  if (!THEMES.includes(theme)) throw new ValidationError("Choose a theme from the list.");
  person.theme = theme;
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

// ---------- Profile banners: a preset gradient or an uploaded image ----------

const BANNER_PRESETS = ["aurora", "sunset", "ocean", "forest", "lavender", "midnight", "ember", "slate"];

function bannerView(person) {
  const b = person.banner;
  if (!b) return null;
  if (b.preset) return { preset: b.preset };
  return { url: `/api/banners/${person.id}?v=${b.version}` };
}

function setBannerPreset(person, preset) {
  if (!BANNER_PRESETS.includes(preset)) throw new ValidationError("Choose one of the banner styles.");
  removeBanner(person, false);
  person.banner = { preset };
  savePeople();
}

function saveBanner(person, dataUrl) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!match) throw new ValidationError("Upload a JPG, PNG or WebP image.");
  const type = IMAGE_TYPES[match[1]];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 1.5 * 1024 * 1024) throw new ValidationError("That image is too large (max 1.5 MB).");
  if (!type.magic(buffer)) throw new ValidationError("That file doesn't look like a valid image.");
  removeBanner(person, false);
  fs.writeFileSync(path.join(avatarDir, `${person.id}-banner.${type.ext}`), buffer, { mode: 0o600 });
  person.banner = { ext: type.ext, version: Date.now() };
  savePeople();
}

function removeBanner(person, save = true) {
  if (!person.banner) return;
  if (person.banner.ext) fs.rmSync(path.join(avatarDir, `${person.id}-banner.${person.banner.ext}`), { force: true });
  person.banner = null;
  if (save) savePeople();
}

function bannerFile(person) {
  if (!person || !person.banner || !person.banner.ext) return null;
  const type = Object.values(IMAGE_TYPES).find((t) => t.ext === person.banner.ext);
  return { file: path.join(avatarDir, `${person.id}-banner.${person.banner.ext}`), mime: type.mime };
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
  PERMISSIONS,
  listRoles,
  saveRole,
  getRole,
  deleteRole,
  setRoleMembers,
  permissionsOf,
  can,
  RENAMED_COMPANIES,
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
  hasCode,
  verifyCode,
  setCode,
  clearCode,
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
  setTheme,
  setStatus,
  currentStatus,
  validDate,
  STATUS_TYPES,
  markAnnouncementsSeen,
  saveAvatar,
  removeAvatar,
  avatarFile,
  BANNER_PRESETS,
  setBannerPreset,
  saveBanner,
  removeBanner,
  bannerFile,
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
