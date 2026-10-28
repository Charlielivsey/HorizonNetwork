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
const DEFAULT_MAINTENANCE_PIN = "1101";
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
  saveLogins();
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
  // A second PIN, needed to turn maintenance mode on.
  if (!settings.maintenancePin) settings.maintenancePin = hashPassword(DEFAULT_MAINTENANCE_PIN);
  if (!settings.roles) migrateToRoles();
  if (!settings.superAdminRoleAdded) {
    // Added once; if it's deleted later it stays deleted.
    if (!settings.roles.some((r) => r.name.toLowerCase() === "super admin")) {
      settings.roles.unshift({ id: newId(), name: "Super Admin", permissions: PERMISSION_KEYS.slice() });
    }
    settings.superAdminRoleAdded = true;
  }
  if (!settings.hrRolesAdded) migrateHrRoles();
  if (!settings.extraPermissionsAdded) {
    // HR cases, recruitment and reports: given once to the roles that should have them.
    const add = (name, keys) => {
      const role = settings.roles.find((r) => r.name.toLowerCase() === name);
      if (role) keys.forEach((k) => { if (!role.permissions.includes(k)) role.permissions.push(k); });
    };
    add("super admin", ["cases.manage", "recruitment.manage", "reports.view"]);
    add("leadership & hr", ["cases.manage", "recruitment.manage", "reports.view"]);
    add("human resources", ["cases.manage", "recruitment.manage", "reports.view"]);
    settings.extraPermissionsAdded = true;
  }
  if (!settings.enquiriesPermissionAdded) {
    // Website enquiries: given once to the roles that had every permission, and to Communications.
    for (const role of settings.roles) {
      const name = role.name.toLowerCase();
      if ((name === "super admin" || name === "leadership & hr" || name === "communications") && !role.permissions.includes("enquiries.manage")) role.permissions.push("enquiries.manage");
    }
    settings.enquiriesPermissionAdded = true;
  }
  if (!settings.storageAccessPermissionAdded) {
    // Document storage (the user's request, 26 October 2026): Super Admin can open everyone's storage.
    const role = settings.roles.find((r) => r.name.toLowerCase() === "super admin");
    if (role && !role.permissions.includes(STORAGE_ACCESS)) role.permissions.push(STORAGE_ACCESS);
    settings.storageAccessPermissionAdded = true;
  }
  writeJson(settingsFile, settings);
  loadLogins();
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
  { key: "leave.manage", name: "Manage leave", description: "Approve anyone's leave, see all absence and set holiday allowances." },
  { key: "rotas.manage", name: "Manage rotas & timesheets", description: "Plan shifts on the rota and approve anyone's timesheets." },
  { key: "helpdesk.manage", name: "Handle IT tickets", description: "See every IT Helpdesk ticket, reply, assign and change its status." },
  { key: "payroll.manage", name: "Run payroll & finance", description: "See pay details, generate and issue payslips, and manage company funds, expenses and invoices. Only people who already have it can give it out." },
  { key: "cases.manage", name: "HR cases", description: "See and record disciplinary, grievance and capability cases. These are private to people with this permission." },
  { key: "recruitment.manage", name: "Recruitment", description: "Post job vacancies, track applicants and hire them." },
  { key: "enquiries.manage", name: "Website enquiries", description: "Read and answer messages sent from the contact form on hngroup.org.uk." },
  { key: "reports.view", name: "Activity reports", description: "See the monthly activity reports (payroll figures only for people who can run payroll)." },
  { key: "storage.access", name: "Access staff document storage", description: "Open anyone's private storage on docs.hngroup.org.uk (view only) and give people access to someone's storage for a while. Only people who already have it can give it out." },
  { key: "system.admin", name: "System Admin", description: "Open System Admin with the PIN: sessions, log in as, backups and the full activity log. Only people who already have it can give it out." },
];
const SYSTEM_ADMIN = "system.admin";
const PAYROLL = "payroll.manage";
// Permissions only someone who already has them can hand out.
const STORAGE_ACCESS = "storage.access";
const GUARDED_PERMISSIONS = [SYSTEM_ADMIN, PAYROLL, STORAGE_ACCESS];
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

// Leave, rotas, the helpdesk and payroll: give the new permissions to the roles that should have
// them, and add "Human Resources" (with payroll) and "IT Support" roles. Runs once.
function migrateHrRoles() {
  const byName = (name) => settings.roles.find((r) => r.name.toLowerCase() === name.toLowerCase());
  const add = (role, keys) => {
    if (role) keys.forEach((k) => { if (!role.permissions.includes(k)) role.permissions.push(k); });
  };
  add(byName("Leadership & HR"), ["leave.manage", "rotas.manage"]);
  add(byName("Super Admin"), ["leave.manage", "rotas.manage", "helpdesk.manage"]);
  if (!byName("Human Resources")) {
    const hr = { id: newId(), name: "Human Resources", permissions: ["staff.manage", "onboarding.manage", "leave.manage", "rotas.manage", PAYROLL] };
    settings.roles.push(hr);
    let changed = false;
    for (const p of people) {
      if (p.system) continue;
      if (allJobTitles(p).some((t) => /human resources|\bhr\b/i.test(t))) {
        p.roleIds = (p.roleIds || []).concat(hr.id);
        changed = true;
      }
    }
    if (changed) savePeople();
  }
  if (!byName("IT Support")) settings.roles.push({ id: newId(), name: "IT Support", permissions: ["helpdesk.manage"] });
  settings.hrRolesAdded = true;
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
  for (const l of logins) if (l.roleIds) l.roleIds = l.roleIds.filter((id) => id !== role.id);
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

// The owner and the built-in admin account can do everything. Everyone else gets the
// permissions of the roles they've been given.
function permissionsOf(person) {
  if (!person) return [];
  if (hasOwnerAccess(person)) return PERMISSION_KEYS.slice();
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

// Does `boss` supervise `person` in any of the person's roles?
function supervises(boss, person) {
  if (!boss || !person || boss.id === person.id) return false;
  if (person.supervisorId === boss.id) return true;
  return (person.otherRoles || []).some((r) => (r.supervisorId || person.supervisorId) === boss.id);
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
    passwordChangedAt: new Date().toISOString(),
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

// Checks a new password against the rules set in System Admin (length, common passwords, not
// based on the person's name).
function validateNewPassword(newPassword, currentPassword, person) {
  const problem = require("./security").passwordProblem(newPassword, person);
  if (problem) throw new ValidationError(problem);
  if (currentPassword !== undefined && newPassword === currentPassword) {
    throw new ValidationError("New password must be different from the current one.");
  }
}

// ---------- Lookups & views ----------

// A staff record, a built-in account, or (for a session or remembered browser) a sign-in account acting as one of
// its profiles: "p~<account>~<record>~<company>" or "p~<account>" for an account without a staff profile.
function getPerson(id) {
  if (typeof id === "string" && id.startsWith("p~")) return principalPerson(id);
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
  const l = person.__login;
  if (l) return l.primaryFor && l.matchEmails ? primaryEmail(getRecord(l.primaryFor) || { emails: [] }) || l.username : l.username;
  return person.system ? person.username : primaryEmail(person);
}

// Login accepts a system username or any of an employee's email addresses.
// "Sign in with Google" (HN Group Auth): a staff account can be linked to one Google account, identified by
// Google's permanent account id (sub). Only the account's owner links it, while signed in, and only a Google
// account with one of their own email addresses; signing in with Google still asks for the PIN.
function findByGoogle(sub) {
  const id = String(sub || "");
  if (!/^[0-9A-Za-z_-]{1,255}$/.test(id)) return null;
  const l = logins.find((x) => x.account && x.account.google && x.account.google.sub === id);
  return l ? viewOf(l, defaultProfile(l)) : null;
}
function ownsEmail(person, email) {
  const e = String(email || "").trim().toLowerCase();
  return !!e && !person.system && (person.emails || []).some((x) => String(x.address || "").toLowerCase() === e);
}
function setGoogle(person, link) {
  if (!person.account) return;
  if (link) {
    const other = findByGoogle(link.sub);
    if (other && (other.loginId || other.id) !== (person.loginId || person.id)) throw Object.assign(new Error("That Google account is already connected to another staff account."), { status: 409 });
    person.account.google = { sub: String(link.sub), email: String(link.email || "").toLowerCase().slice(0, 254), linkedAt: new Date().toISOString() };
  } else delete person.account.google;
  person.updatedAt = new Date().toISOString();
  savePeople();
}

// Signing in: a built-in account's username, or a sign-in account's username (an account that is a staff
// member's own login also accepts any of their email addresses). Returns the account acting as its default profile.
// "Continue with Discord" (the user's request, 28 October 2026): a sign-in account can be linked to one Discord
// account (its permanent id). The Discord username and id are also kept on the staff record the account belongs to
// (its own record, or else its default profile's), and HN Group Auth's bot keeps the username up to date.
const DISCORD_ID = /^\d{15,22}$/;
function findByDiscord(id) {
  if (!DISCORD_ID.test(String(id || ""))) return null;
  const l = logins.find((x) => x.account && x.account.discord && x.account.discord.id === String(id));
  return l ? viewOf(l, defaultProfile(l)) : null;
}
function discordRecordOf(l) {
  const def = defaultProfile(l);
  return (l.primaryFor && getRecord(l.primaryFor)) || (def && getRecord(def.personId)) || null;
}
function setDiscord(person, link) {
  const l = person.__login || (!person.system && primaryLogin(person));
  if (!l || !l.account) return;
  const rec = discordRecordOf(l), now = new Date().toISOString();
  if (link) {
    if (!DISCORD_ID.test(String(link.id))) throw new ValidationError("Invalid Discord account.");
    // An account with staff profiles can only connect the Discord account recorded on one of those profiles.
    const allowed = loginProfiles(l).map((p) => (getRecord(p.personId) || {}).discord).filter((d) => d && d.id).map((d) => d.id);
    if (allowed.length && !allowed.includes(String(link.id))) throw Object.assign(new Error("Use the Discord account that’s on your staff profile."), { status: 403 });
    const other = findByDiscord(link.id);
    if (other && other.loginId !== l.id) throw Object.assign(new Error("That Discord account is already connected to another sign-in account."), { status: 409 });
    const username = String(link.username || "").slice(0, 64);
    l.account.discord = { id: String(link.id), username, linkedAt: now };
    // The staff record keeps its Discord id; connecting fills in (or records) it and the current username.
    if (rec && (!rec.discord || rec.discord.id === String(link.id))) rec.discord = { id: String(link.id), username, updatedAt: now };
  } else {
    delete l.account.discord;
  }
  savePeople();
}
// Every linked Discord id, for the bot to look up.
function discordIds() {
  return [...new Set([...logins.filter((l) => l.account && l.account.discord).map((l) => l.account.discord.id), ...people.filter((p) => p.discord && p.discord.id).map((p) => p.discord.id)])];
}
// New usernames from Discord (the bot): updates the sign-in accounts and the staff records that hold them.
function updateDiscordNames(updates) {
  let changed = 0;
  const now = new Date().toISOString();
  for (const u of Array.isArray(updates) ? updates.slice(0, 5000) : []) {
    if (!DISCORD_ID.test(String(u && u.id)) || typeof u.username !== "string" || !u.username) continue;
    const name = u.username.slice(0, 64);
    // Their Discord profile as the bot sees it: username, display name and picture (an avatar hash on Discord's CDN).
    const globalName = typeof u.globalName === "string" ? u.globalName.slice(0, 64) : null;
    const avatar = typeof u.avatar === "string" && /^(a_)?[a-f0-9]{32}$/.test(u.avatar) ? u.avatar : null;
    const apply = (d) => { if (d.username === name && (d.globalName || null) === globalName && (d.avatar || null) === avatar) return false; d.username = name; d.globalName = globalName; d.avatar = avatar; return true; };
    for (const l of logins) if (l.account && l.account.discord && l.account.discord.id === u.id && apply(l.account.discord)) changed++;
    for (const p of people) if (p.discord && p.discord.id === u.id && apply(p.discord)) { p.discord.updatedAt = now; changed++; }
  }
  if (changed) savePeople();
  return changed;
}

function findByLogin(login) {
  const name = String(login || "").trim().toLowerCase();
  if (!name) return null;
  const builtIn = people.find((p) => p.system && p.account && p.account.enabled && String(p.username || "").toLowerCase() === name);
  if (builtIn) return builtIn;
  const active = logins.filter((l) => l.account && l.account.enabled);
  const l = active.find((x) => String(x.username || "").toLowerCase() === name) ||
    active.find((x) => x.matchEmails && x.primaryFor && ((getRecord(x.primaryFor) || {}).emails || []).some((e) => e.address === name));
  return l ? viewOf(l, defaultProfile(l)) : null;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleGrantsManagement(title) {
  return (settings.managementTitles || []).some((phrase) =>
    new RegExp(`(^|[^a-z0-9])${escapeRegExp(phrase)}($|[^a-z0-9])`, "i").test(title || "")
  );
}

function isOwnerRecord(person) {
  const owner = String(settings.ownerEmail || "").toLowerCase();
  return !!person && !person.system && !!owner && (person.emails || []).some((e) => e.address === owner);
}
// Sign-in accounts that are the system owner whatever profile they use (the user's statement, 28 October 2026:
// "user catnap@hngroup.org.uk and profile charlie is the system owner. i do anything and everything i want").
const SYSTEM_OWNER_LOGINS = ["catnap@hngroup.org.uk"];
// The system owner: their staff record, or (when signed in) the sign-in account that belongs to that record, one
// named in SYSTEM_OWNER_LOGINS, or one the system owner has made a system owner on HN Account.
function isOwner(person) {
  const l = person && person.__login;
  if (l) return (!!l.primaryFor && isOwnerRecord(getRecord(l.primaryFor))) || l.owner === "system" || SYSTEM_OWNER_LOGINS.includes(String(l.username || "").toLowerCase());
  return isOwnerRecord(person);
}

// Staff accounts with the same access as the system owner, alongside the built-in admin account.
const OWNER_LEVEL_EMAILS = ["dogday@hngroup.org.uk"];

function ownerLevelRecord(person) {
  return isOwnerRecord(person) || (person.emails || []).some((e) => OWNER_LEVEL_EMAILS.includes(String(e.address || "").toLowerCase()));
}
// Owner-level access belongs to a sign-in account (each account has its own permissions): the account that was
// the owner's or an owner-level person's own login, or one marked owner-level. Built-in admin accounts have it too.
function hasOwnerAccess(person) {
  if (!person) return false;
  const l = person.__login;
  if (l) return !!(l.account && l.account.enabled) && (isOwner(person) || !!l.owner || OWNER_LEVEL_EMAILS.includes(String(l.username || "").toLowerCase()) || (!!l.primaryFor && !!getRecord(l.primaryFor) && ownerLevelRecord(getRecord(l.primaryFor))));
  if (person.system) return !!(person.account && person.account.enabled);
  return ownerLevelRecord(person);
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
    department: p.department || "",
    company: p.company,
    otherRoles: p.otherRoles || [],
    supervisorId: p.supervisorId,
    supervisorCompany: p.supervisorCompany || null,
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
    skills: p.skills || [],
    languages: p.languages || [],
    bio: p.bio || "",
    // Their Discord account, when a sign-in account of theirs is connected to Discord (kept up to date by the bot).
    discord: p.discord ? { id: p.discord.id, username: p.discord.username || null, globalName: p.discord.globalName || null, avatarUrl: p.discord.avatar ? "/api/discord-avatar/" + p.id + "?v=" + p.discord.avatar.slice(-8) : null, updatedAt: p.discord.updatedAt || null } : null,
  };
}

// Skills and languages people list on their profile (so the directory can find "who speaks Spanish?").
function cleanTagList(v, max) {
  const list = Array.isArray(v) ? v : String(v || "").split(",");
  return [...new Set(list.map((x) => str(x, 40)).filter(Boolean).map((x) => x.charAt(0).toUpperCase() + x.slice(1)))].slice(0, max);
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
  const brief = (id, company, chosen) => {
    const s = id ? getPerson(id) : null;
    if (!s) return null;
    if (chosen && supervisorCompanyFor(s, chosen)) company = chosen;
    const other = s.company === company ? null : (s.otherRoles || []).find((r) => r.company === company);
    const sameCompany = s.company === company || !!other;
    return {
      id: s.id,
      displayName: s.displayName,
      jobTitle: other ? other.jobTitle || s.jobTitle : s.jobTitle,
      department: other ? other.department || s.department || "" : s.department || "",
      company: sameCompany ? company : s.company,
    };
  };
  return [{ company: p.company, jobTitle: p.jobTitle, department: p.department || "", supervisor: brief(p.supervisorId, p.company, p.supervisorCompany), main: true }].concat(
    (p.otherRoles || []).map((r) => ({
      company: r.company,
      jobTitle: r.jobTitle || p.jobTitle,
      department: r.department || p.department || "",
      supervisor: r.supervisorId ? brief(r.supervisorId, r.company, r.supervisorCompany) : brief(p.supervisorId, r.company),
      main: false,
    }))
  );
}

function meView(p) {
  const supervisor = p.supervisorId ? getPerson(p.supervisorId) : null;
  const login = p.__login || (!p.system && primaryLogin(p)) || null;
  return {
    ...publicView(p),
    // The sign-in account in use and the profile it's acting as (each company on a staff record is a profile).
    accountId: login ? login.id : null,
    profileCompany: p.profile ? p.profile.company : null,
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
    passwordExpired: require("./security").passwordExpired(p),
    passwordMinLength: require("./security").policy().minLength,
    codeSetupRequired: !hasCode(p),
    homeLayout: p.homeLayout || null,
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

// Which of the supervisor's roles someone reports to: a company the supervisor works at, or
// null for the default (their role at the same company, else their main role).
function supervisorCompanyFor(sup, company) {
  const c = str(company, 60);
  return c && (sup.company === c || (sup.otherRoles || []).some((r) => r.company === c)) ? c : null;
}

function saveEmployee(input, existing) {
  const errors = [];
  const firstName = str(input.firstName, 60);
  const lastName = str(input.lastName, 60);
  const displayName = str(input.displayName, 80) || `${firstName} ${lastName}`.trim();
  const jobTitle = str(input.jobTitle, 100);
  const department = str(input.department, 80);
  const company = str(input.company, 60);
  const timezone = TIMEZONES.has(input.timezone) ? input.timezone : DEFAULT_TIMEZONE;
  const otherRoles = [];
  for (const r of Array.isArray(input.otherRoles) ? input.otherRoles.slice(0, COMPANIES.length) : []) {
    const roleCompany = str(r && r.company, 60);
    if (!COMPANIES.includes(roleCompany) || roleCompany === company || otherRoles.some((x) => x.company === roleCompany)) continue;
    let roleSupervisor = (r && r.supervisorId) || null;
    let roleSupervisorCompany = null;
    if (roleSupervisor) {
      const sup = getPerson(roleSupervisor);
      if (!sup || sup.system || (existing && sup.id === existing.id)) {
        errors.push(`Choose a valid supervisor for ${roleCompany}.`);
        roleSupervisor = null;
      } else roleSupervisorCompany = supervisorCompanyFor(sup, r.supervisorCompany);
    }
    otherRoles.push({ company: roleCompany, jobTitle: str(r.jobTitle, 100), department: str(r.department, 80), supervisorId: roleSupervisor, supervisorCompany: roleSupervisorCompany });
  }

  if (!firstName) errors.push("First name is required.");
  if (!lastName) errors.push("Last name is required.");
  if (!jobTitle) errors.push("Job title is required.");
  if (!COMPANIES.includes(company)) errors.push("Choose a company.");

  let supervisorId = input.supervisorId || null;
  let supervisorCompany = null;
  if (supervisorId) {
    const sup = getPerson(supervisorId);
    if (!sup || sup.system || (existing && sup.id === existing.id)) errors.push("Choose a valid supervisor.");
    else supervisorCompany = supervisorCompanyFor(sup, input.supervisorCompany);
    if (sup && !sup.system && existing && sup.id !== existing.id) {
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
    department,
    company,
    otherRoles,
    supervisorId,
    supervisorCompany,
    emails: resolved.emails.map((e) => ({ address: e.address, primary: e.primary })),
    phone: str(input.phone, 40),
    location: str(input.location, 80),
    timezone,
    startDate: validDate(input.startDate),
    updatedAt: now,
  };

  // Their Discord user id (the user's request, 28 October 2026: required when a staff record is made; the staff
  // portal enforces that). HN Group Auth's Discord bot fills in the username from it.
  if (input.discordId !== undefined) {
    const id = String(input.discordId || "").trim();
    if (id && !DISCORD_ID.test(id)) throw new ValidationError("Enter their Discord user ID: 15 to 22 digits (in Discord, turn on Developer Mode, then right-click their name and choose Copy User ID).");
    if (id && people.some((p) => p !== existing && p.discord && p.discord.id === id)) throw new ValidationError("That Discord user ID is already on another staff record.");
    const current = existing && existing.discord;
    if (!id) { if (existing) delete existing.discord; }
    else if (!current || current.id !== id) fields.discord = { id, username: null, updatedAt: now };
  }

  if (existing) {
    Object.assign(existing, fields);
    savePeople();
    return existing;
  }
  const person = { id: newId(), system: false, ...fields, avatar: null, createdAt: now, account: null };
  people.push(attach(person));
  savePeople();
  return person;
}

function deleteEmployee(person) {
  people = people.filter((p) => p.id !== person.id);
  // Their own sign-in account goes with them; other accounts just lose the profiles at this record.
  logins = logins.filter((l) => l.primaryFor !== person.id);
  for (const l of logins) l.profiles = (l.profiles || []).filter((x) => x.personId !== person.id);
  for (const p of people) {
    if (p.supervisorId === person.id) { p.supervisorId = null; p.supervisorCompany = null; }
    for (const r of p.otherRoles || []) if (r.supervisorId === person.id) { r.supervisorId = null; r.supervisorCompany = null; }
  }
  removeAvatar(person, false);
  removeBanner(person, false);
  savePeople();
}

// ---------- Sign-in accounts and profiles ----------
// The user's request, 28 October 2026: sign-in accounts are separate from staff records. Each account has its
// own username, password, PIN, Google sign-in and permissions (roles), and can be linked to any number of
// profiles; each company on a staff record is its own profile, and several accounts can share a profile. People
// pick the profile when they sign in (the default is preselected). An account with no profile works on the HN
// Group websites but not as a member of staff. Accounts are made and managed on HN Account.
//
// Stored in logins.json: { id, username, displayName, account: {password, PIN, Google, enabled...}, roleIds,
// owner, primaryFor (the staff record whose own login this is: it follows that record's companies and email
// addresses), matchEmails, profiles: [{ personId, company }], defaultProfile (a profile key) }.
// A staff record's `account` and `roleIds` read and write its own account (primaryFor), so everything that
// worked on records before keeps working.
let logins = [];
let loginsFile = null;

function saveLogins() {
  if (loginsFile) writeJson(loginsFile, logins);
}
function getRecord(id) {
  return people.find((p) => p.id === id && !p.system) || null;
}
function getLogin(id) {
  return logins.find((l) => l.id === id) || null;
}
function primaryLogin(rec) {
  return logins.find((l) => l.primaryFor === rec.id) || null;
}
const companyHash = (company) => crypto.createHash("sha256").update(String(company)).digest("hex").slice(0, 8);
function profileKey(personId, company) {
  return personId + ":" + companyHash(company);
}
function companiesOf(rec) {
  return [...new Set([rec.company, ...(rec.otherRoles || []).map((r) => r.company)].filter(Boolean))];
}
// What websites and apps know a profile by: the record's id for its main company (so everything already kept for
// that person stays theirs), and a fixed id of its own for each other company.
function profileIdOf(rec, company) {
  return company === rec.company ? rec.id : crypto.createHash("sha256").update(rec.id + "\0" + company).digest("hex").slice(0, 16);
}
// The job someone has at one company.
function roleAt(rec, company) {
  if (company === rec.company) return { company, jobTitle: rec.jobTitle || "", supervisorId: rec.supervisorId || null, supervisorCompany: rec.supervisorCompany || null };
  const r = (rec.otherRoles || []).find((x) => x.company === company) || {};
  return { company, jobTitle: r.jobTitle || rec.jobTitle || "", supervisorId: r.supervisorId || rec.supervisorId || null, supervisorCompany: r.supervisorCompany || null };
}
function profileInfo(rec, company) {
  return { key: profileKey(rec.id, company), personId: rec.id, company, profileId: profileIdOf(rec, company), displayName: rec.displayName, jobTitle: roleAt(rec, company).jobTitle, avatarUrl: avatarUrl(rec) };
}
function loginProfiles(l) {
  const out = [], seen = new Set();
  const add = (personId, company) => {
    const rec = getRecord(personId);
    if (!rec || !companiesOf(rec).includes(company)) return;
    const info = profileInfo(rec, company);
    if (seen.has(info.key)) return;
    seen.add(info.key); out.push(info);
  };
  if (l.primaryFor) { const rec = getRecord(l.primaryFor); if (rec) companiesOf(rec).forEach((c) => add(rec.id, c)); }
  for (const x of l.profiles || []) add(x.personId, x.company);
  return out;
}
function defaultProfile(l) {
  const list = loginProfiles(l), own = l.primaryFor && getRecord(l.primaryFor);
  return list.find((p) => p.key === l.defaultProfile) || (own && list.find((p) => p.personId === own.id && p.company === own.company)) || list[0] || null;
}
function principalOf(l, profile) {
  return "p~" + l.id + (profile ? "~" + profile.personId + "~" + profile.key.split(":")[1] : "");
}
function principalPerson(id) {
  const m = /^p~([a-f0-9]{16})(?:~([a-f0-9]{16})~([a-f0-9]{8}))?$/.exec(id);
  const l = m && getLogin(m[1]);
  if (!l) return null;
  if (!m[2]) return viewOf(l, null);
  const profile = loginProfiles(l).find((p) => p.key === m[2] + ":" + m[3]);
  // A profile that's been taken off the account falls back to its default one.
  return viewOf(l, profile || defaultProfile(l));
}
// Which session or remembered-browser ids belong to an account or record: a record id matches every account
// acting as one of its profiles (and old sessions made before accounts were separate); an account's id, or any of
// its session ids, matches that account.
function principalMatches(sid, id) {
  if (!sid || !id) return false;
  if (sid === id) return true;
  const parts = String(sid).split("~"), want = String(id).startsWith("p~") ? String(id).split("~")[1] : id;
  if (parts[0] !== "p") return false;
  if (String(id).startsWith("p~")) return parts[1] === want;
  return parts[1] === want || parts[2] === want;
}
// The id a session or remembered browser is kept under for someone signed in.
function sessionIdOf(person) {
  return (person && person.principalId) || (person && person.id);
}
// A sign-in account acting as one profile (or as itself, with no staff profile). Reads come from the staff record,
// with the job, company and supervisor of that profile's company; the password, PIN, Google and permissions come
// from the sign-in account. Changes to the record's own details are saved to the record.
function viewOf(l, profile) {
  const rec = profile ? getRecord(profile.personId) : null;
  if (profile && !rec) return null;
  if (!l.self) l.self = { displayName: l.displayName || l.username, firstName: "", lastName: "", phone: "", location: "", timezone: DEFAULT_TIMEZONE, avatar: null, createdAt: l.createdAt, updatedAt: l.createdAt };
  const base = rec || l.self;
  const fixed = {
    principalId: principalOf(l, profile), loginId: l.id, profile: profile || null, profileId: profile ? profile.profileId : l.id, __login: l, otherRoles: [],
    ...(rec ? roleAt(rec, profile.company) : { id: l.id, system: true, standalone: true, username: l.username, company: "", jobTitle: "", supervisorId: null, supervisorCompany: null, emails: [], roleIds: undefined }),
  };
  delete fixed.roleIds;
  const own = (k) => Object.prototype.hasOwnProperty.call(fixed, k);
  return new Proxy(base, {
    get(t, k) {
      if (k === "account") return l.account;
      if (k === "roleIds") return l.roleIds || (l.roleIds = []);
      return own(k) ? fixed[k] : t[k];
    },
    set(t, k, v) {
      if (k === "account") l.account = v;
      else if (k === "roleIds") l.roleIds = v;
      else if (!own(k)) t[k] = v;
      return true;
    },
    deleteProperty(t, k) { if (!own(k) && k !== "account" && k !== "roleIds") delete t[k]; return true; },
    has(t, k) { return k === "account" || k === "roleIds" || own(k) || k in t; },
  });
}
function createLoginFor(rec) {
  const now = new Date().toISOString();
  const l = { id: newId(), username: primaryEmail(rec) || rec.id, displayName: rec.displayName, primaryFor: rec.id, matchEmails: true, profiles: [], defaultProfile: null, roleIds: rec.rolesWithoutLogin || [], owner: false, account: null, createdAt: now };
  delete rec.rolesWithoutLogin;
  logins.push(l);
  return l;
}
// A staff record's `account` and `roleIds` are those of its own sign-in account.
function attach(rec) {
  if (!rec || rec.system || Object.prototype.hasOwnProperty.call(rec, "__attached")) return rec;
  Object.defineProperty(rec, "__attached", { value: true, enumerable: false });
  if (Object.prototype.hasOwnProperty.call(rec, "roleIds")) {
    const roles = rec.roleIds; delete rec.roleIds;
    if (roles && roles.length && !primaryLogin(rec)) rec.rolesWithoutLogin = roles;
  }
  Object.defineProperty(rec, "account", {
    enumerable: false, configurable: true,
    get() { const l = primaryLogin(rec); return l ? l.account : null; },
    set(v) {
      let l = primaryLogin(rec);
      if (!v) { if (l) logins = logins.filter((x) => x !== l); return; }
      if (!l) l = createLoginFor(rec);
      l.account = v;
    },
  });
  Object.defineProperty(rec, "roleIds", {
    enumerable: false, configurable: true,
    get() { const l = primaryLogin(rec); return l ? l.roleIds || (l.roleIds = []) : rec.rolesWithoutLogin || []; },
    set(v) { const l = primaryLogin(rec); if (l) l.roleIds = v; else rec.rolesWithoutLogin = v; },
  });
  return rec;
}
// Loads sign-in accounts; the first time, every existing staff login becomes a sign-in account with the same
// username, password, PIN, Google sign-in and roles (the people file is backed up first).
function loadLogins() {
  loginsFile = path.join(dataDir, "logins.json");
  logins = fs.existsSync(loginsFile) ? JSON.parse(fs.readFileSync(loginsFile, "utf8")) : [];
  let changed = !fs.existsSync(loginsFile);
  const stored = people.filter((p) => !p.system && (Object.prototype.hasOwnProperty.call(p, "account") || Object.prototype.hasOwnProperty.call(p, "roleIds")));
  if (stored.length) {
    const backup = peopleFile + ".before-sign-in-accounts";
    if (!fs.existsSync(backup)) fs.copyFileSync(peopleFile, backup);
    for (const p of stored) {
      if (p.account && !logins.some((l) => l.primaryFor === p.id)) {
        logins.push({ id: newId(), username: primaryEmail(p) || p.id, displayName: p.displayName, primaryFor: p.id, matchEmails: true, profiles: [], defaultProfile: null, roleIds: p.roleIds || [], owner: false, account: p.account, createdAt: p.account.createdAt || p.createdAt || new Date().toISOString() });
        delete p.roleIds;
      }
      delete p.account;
    }
    changed = true;
  }
  people.forEach(attach);
  if (changed) { saveLogins(); writeJson(peopleFile, people); }
}

// What HN Account shows about a sign-in account.
function loginView(l) {
  const list = loginProfiles(l), def = defaultProfile(l), rec = l.primaryFor && getRecord(l.primaryFor);
  return {
    id: l.id, username: loginName({ __login: l }), displayName: rec ? rec.displayName : (l.self && l.self.displayName) || l.displayName || l.username,
    ownLoginOf: rec ? { id: rec.id, displayName: rec.displayName } : null,
    profiles: list.map((p) => ({ ...p, default: !!def && p.key === def.key, automatic: !!rec && p.personId === rec.id })),
    roleIds: l.roleIds || [], ownerAccess: hasOwnerAccess({ __login: l, account: l.account }), systemOwner: isOwner({ __login: l }), owner: l.owner || false,
    account: l.account ? { enabled: !!l.account.enabled, hasCode: !!l.account.code, passwordTemporary: !!l.account.passwordTemporary, lastLoginAt: l.account.lastLoginAt || null, google: l.account.google ? l.account.google.email : null } : null,
    createdAt: l.createdAt,
  };
}
function listLogins() {
  return logins.map(loginView).sort((a, b) => a.displayName.localeCompare(b.displayName));
}
function loginTaken(name, exceptId) {
  const n = String(name || "").trim().toLowerCase();
  return people.some((p) => p.system && String(p.username || "").toLowerCase() === n) ||
    logins.some((l) => l.id !== exceptId && (String(l.username || "").toLowerCase() === n || (l.matchEmails && l.primaryFor && ((getRecord(l.primaryFor) || {}).emails || []).some((e) => e.address === n))));
}
function validProfiles(list) {
  const out = [];
  for (const x of Array.isArray(list) ? list.slice(0, 50) : []) {
    const rec = getRecord(String((x && x.personId) || ""));
    if (!rec || !companiesOf(rec).includes(x.company)) throw new ValidationError("One of the chosen profiles no longer exists.");
    if (!out.some((y) => y.personId === rec.id && y.company === x.company)) out.push({ personId: rec.id, company: x.company });
  }
  return out;
}
// A new sign-in account, with or without profiles. Returns its temporary password.
function createLogin(input) {
  const displayName = str(input && input.displayName, 80);
  const username = String((input && input.username) || "").trim().toLowerCase();
  if (!displayName) throw new ValidationError("Enter a name for the account.");
  if (username.length > 120 || !/^[a-z0-9][a-z0-9._+-]{1,62}(@[a-z0-9-]+(\.[a-z0-9-]+)+)?$/.test(username)) throw new ValidationError("Enter a username or email address (letters, numbers, dots and dashes).");
  if (loginTaken(username)) throw Object.assign(new Error("That username or email address is already used by another account."), { status: 409 });
  const now = new Date().toISOString();
  const l = { id: newId(), username, displayName, primaryFor: null, matchEmails: false, profiles: validProfiles(input.profiles), defaultProfile: null, roleIds: cleanRoleIds(input.roleIds), owner: false, account: null, createdAt: now, self: { displayName, firstName: "", lastName: "", phone: "", location: "", timezone: DEFAULT_TIMEZONE, avatar: null, createdAt: now, updatedAt: now } };
  const def = loginProfiles(l).find((p) => p.key === input.defaultProfile);
  l.defaultProfile = def ? def.key : null;
  logins.push(l);
  const credentials = issueTemporaryPassword(viewOf(l, null));
  return { login: l, credentials };
}
function cleanRoleIds(list) {
  return [...new Set((Array.isArray(list) ? list : []).map(String))].filter((id) => getRole(id));
}
// Changes an account's profiles, default profile and roles (HN Account).
function updateLogin(l, input) {
  if (input.profiles !== undefined) l.profiles = validProfiles(input.profiles).filter((x) => x.personId !== l.primaryFor);
  if (input.defaultProfile !== undefined) {
    const def = loginProfiles(l).find((p) => p.key === input.defaultProfile);
    l.defaultProfile = def ? def.key : null;
  }
  if (input.roleIds !== undefined) l.roleIds = cleanRoleIds(input.roleIds);
  // Owner-level access ("level") or system owner ("system"); only the system owner sets this (server.js checks).
  if (input.owner !== undefined) l.owner = input.owner === "system" ? "system" : input.owner === "level" || input.owner === true ? "level" : false;
  if (input.displayName !== undefined && !l.primaryFor) {
    const name = str(input.displayName, 80);
    if (!name) throw new ValidationError("Enter a name for the account.");
    l.displayName = name; if (l.self) l.self.displayName = name;
  }
  savePeople();
  return l;
}
function deleteLogin(l) {
  logins = logins.filter((x) => x !== l);
  savePeople();
}
// The sign-in accounts behind an id a website or app knows someone by: a sign-in account's own id (no staff
// profile), or a profile id (a record's id for its main company, or the id of one of its other companies).
function loginsForId(id) {
  const l = getLogin(id);
  if (l) return [l];
  for (const rec of people) {
    if (rec.system) continue;
    for (const c of companiesOf(rec)) {
      if (profileIdOf(rec, c) !== id) continue;
      const key = profileKey(rec.id, c);
      return logins.filter((x) => loginProfiles(x).some((p) => p.key === key));
    }
  }
  return [];
}
// Every staff profile (each company on each staff record), for choosing on HN Account.
function allProfiles() {
  const out = [];
  for (const rec of people) if (!rec.system) for (const c of companiesOf(rec)) out.push(profileInfo(rec, c));
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.company.localeCompare(b.company));
}
function loginAsPerson(l) {
  return viewOf(l, null);
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

// Which home page panels someone wants, and in what order.
function setHomeLayout(person, input) {
  const clean = (list) => [...new Set((Array.isArray(list) ? list : []).map((k) => String(k).replace(/[^a-z-]/g, "").slice(0, 30)).filter(Boolean))].slice(0, 30);
  person.homeLayout = input && (input.order || input.hidden) ? { order: clean(input.order), hidden: clean(input.hidden) } : null;
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
  // `auto` marks a status set by approved leave; what it replaced stays private.
  return { type: st.type, message: st.message || "", until: st.until || null, auto: !!st.auto };
}

// Used by leave.js to switch "Out of office" on and off around approved leave.
function setLeaveStatus(person, status) {
  person.status = status;
  savePeople();
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
  if ("skills" in input) person.skills = cleanTagList(input.skills, 20);
  if ("languages" in input) person.languages = cleanTagList(input.languages, 10);
  // About me: a short introduction shown on their profile, and on a public company website if they
  // appear on one (e.g. Horizon Network leadership) unless they turn that off.
  if ("bio" in input) person.bio = String(input.bio == null ? "" : input.bio).replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 600);
  if ("bioPublic" in input) person.bioPublic = !!input.bioPublic;
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
  gif: { ext: "gif", mime: "image/gif", magic: (b) => /^GIF8[79]a$/.test(b.slice(0, 6).toString("latin1")) },
};

function saveAvatar(person, dataUrl) {
  // Animated GIFs are stored as uploaded so they keep moving; other images arrive already cropped.
  const match = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!match) throw new ValidationError("Upload a JPG, PNG, WebP or GIF image.");
  const type = IMAGE_TYPES[match[1]];
  const buffer = Buffer.from(match[2], "base64");
  const limit = type.ext === "gif" ? 1.4 * 1024 * 1024 : 1024 * 1024;
  if (buffer.length > limit) throw new ValidationError(type.ext === "gif" ? "That GIF is too large (max 1.4 MB)." : "That image is too large (max 1 MB).");
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

function verifyMaintenancePin(pin) {
  if (typeof pin !== "string" || !settings.maintenancePin) return false;
  const { hash } = hashPassword(pin, settings.maintenancePin.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(settings.maintenancePin.hash, "hex"));
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

// Deletes activity log entries older than the cutoff (data retention). Returns how many went.
function pruneAudit(cutoffIso) {
  if (!fs.existsSync(auditFile)) return 0;
  const lines = fs.readFileSync(auditFile, "utf8").split("\n").filter(Boolean);
  const kept = lines.filter((l) => { try { return JSON.parse(l).at >= cutoffIso; } catch { return false; } });
  if (kept.length === lines.length) return 0;
  const tmp = auditFile + ".tmp";
  fs.writeFileSync(tmp, kept.length ? kept.join("\n") + "\n" : "", { mode: 0o600 });
  fs.renameSync(tmp, auditFile);
  return lines.length - kept.length;
}

// ---------- Maintenance mode ----------
// While it's on, only the system owner can sign in; everyone else sees the message.

const DEFAULT_MAINTENANCE_MESSAGE = "The staff portal is having some planned maintenance. Please try again a little later.";

function maintenance() {
  const m = settings.maintenance || {};
  return { on: process.env.HN_CONTROL_MANAGED === '1' ? false : !!m.on, message: m.message || DEFAULT_MAINTENANCE_MESSAGE, since: m.since || null, by: m.by || null, ...(process.env.HN_CONTROL_MANAGED === '1' ? { central: true } : {}) };
}

function setMaintenance(on, message, by) {
  const text = str(message, 600) || DEFAULT_MAINTENANCE_MESSAGE;
  const was = maintenance();
  settings.maintenance = { on: !!on, message: text, since: on ? (was.on ? was.since : new Date().toISOString()) : null, by: on ? loginName(by) : null };
  writeJson(settingsFile, settings);
  return maintenance();
}

function allPeople() {
  return people;
}

module.exports = {
  verifyMaintenancePin,
  maintenance,
  setMaintenance,
  ADMIN_USERNAME,
  PERMISSIONS,
  GUARDED_PERMISSIONS,
  supervises,
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
  findByGoogle,
  findByDiscord,
  setDiscord,
  discordIds,
  updateDiscordNames,
  ownsEmail,
  setGoogle,
  verifyPassword,
  validateNewPassword,
  setPassword,
  setHomeLayout,
  pruneAudit,
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
  getLogin,
  listLogins,
  loginView,
  loginProfiles,
  defaultProfile,
  createLogin,
  updateLogin,
  deleteLogin,
  loginAsPerson,
  loginsForId,
  allProfiles,
  viewOf,
  principalMatches,
  sessionIdOf,
  companiesOf,
  profileInfo,
  setAccountEnabled,
  recordLogin,
  updateOwnProfile,
  setTheme,
  setStatus,
  setLeaveStatus,
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
  hasOwnerAccess,
  verifySystemPin,
  setSystemPin,
  audit,
  readAudit,
  allPeople,
  loginName,
};
