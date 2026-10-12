// Data retention: once a day, deletes personal data that's older than the limits set in System
// Admin (see security.js). Each kind of data is only deleted when its limit is turned on.

const store = require("./store");
const security = require("./security");
const recruitment = require("./recruitment");
const chat = require("./chat");
const helpdesk = require("./helpdesk");
const onboarding = require("./onboarding");
const payslips = require("./payslips");

const DAY = 86400000;
const cutoff = (days) => new Date(Date.now() - days * DAY).toISOString();

// Leavers whose login is turned off and whose last day was more than `years` ago.
function oldLeavers(years) {
  const before = new Date(Date.now() - years * 365.25 * DAY).toISOString().slice(0, 10);
  return store.employees().filter((p) => {
    if (store.isOwner(p) || (p.account && p.account.enabled)) return false;
    const last = onboarding.leavingDateOf(p.id);
    return last && last < before;
  });
}

// Runs the clean-up. `onPersonDeleted` lets the server end sessions and log it.
function run(onPersonDeleted) {
  const r = security.retention();
  const result = { audit: 0, applicants: 0, chat: 0, tickets: 0, leavers: 0 };
  if (r.auditDays) result.audit = store.pruneAudit(cutoff(r.auditDays));
  if (r.applicantsDays) result.applicants = recruitment.pruneApplicants(cutoff(r.applicantsDays));
  if (r.chatDays) result.chat = chat.prune(cutoff(r.chatDays));
  if (r.ticketsDays) result.tickets = helpdesk.pruneClosed(cutoff(r.ticketsDays));
  if (r.leaversYears) {
    for (const p of oldLeavers(r.leaversYears)) {
      store.deleteEmployee(p);
      onboarding.removePerson(p.id);
      payslips.removePerson(p.id);
      result.leavers++;
      if (onPersonDeleted) onPersonDeleted(p);
    }
  }
  security.setLastCleanup(result);
  return result;
}

// What would be deleted right now, for the System Admin panel.
function preview() {
  const r = security.retention();
  return { leavers: r.leaversYears ? oldLeavers(r.leaversYears).map((p) => p.displayName) : [] };
}

// Checks every hour and runs once a day, at 3am or soon after.
function schedule(onRun) {
  const tick = () => {
    const last = security.retention().lastCleanup;
    const today = new Date().toISOString().slice(0, 10);
    if (new Date().getHours() >= 3 && (!last || last.at.slice(0, 10) !== today)) {
      try { onRun(run); } catch (err) { console.error("Data retention clean-up failed:", err); }
    }
  };
  setInterval(tick, 60 * 60 * 1000).unref();
  setTimeout(tick, 60 * 1000).unref();
}

module.exports = { run, preview, schedule };
