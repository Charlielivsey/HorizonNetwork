// Expense claims. Anyone can claim money back for something they paid for at work, with a
// receipt. Their supervisor or anyone who runs payroll approves or rejects it. Payroll then repays
// it, either straight from the main balance or tax free on the person's next payslip.
// Stored in DATA_DIR/expenses.json, receipts in DATA_DIR/expense-receipts.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");
const workplace = require("./workplace");
const funds = require("./funds");
const payslips = require("./payslips");
const datafile = require("./datafile");

const PAY = "payroll.manage";
const RECEIPT_TYPES = ["pdf", "jpg", "jpeg", "png", "webp", "gif", "heic"];
const STATUSES = { submitted: "Waiting for approval", approved: "Approved", rejected: "Rejected", paid: "Paid" };

let db;
let dir;

function init(dataDir) {
  db = datafile.open(dataDir, "expenses.json", () => ({ claims: [] }));
  dir = path.join(dataDir, "expense-receipts");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  payslips.useReimbursements({ claim: claimForPayslip, release: releaseFromPayslip });
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const money = (n) => Math.round(Number(n) * 100) / 100;

function canApprove(viewer, claim) {
  const person = store.getPerson(claim.personId);
  if (viewer.id === claim.personId) return store.isOwner(viewer);
  return store.can(viewer, PAY) || (person && store.supervises(viewer, person));
}

function canSee(viewer, claim) {
  return claim.personId === viewer.id || canApprove(viewer, claim) || store.can(viewer, PAY);
}

function submit(person, meta, buffer) {
  if (!person || person.system) throw new store.ValidationError("Only staff can claim expenses.");
  const date = str(meta.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) throw new store.ValidationError("Choose the date you paid.");
  if (date > new Date().toISOString().slice(0, 10)) throw new store.ValidationError("The date can't be in the future.");
  const text = String(meta.amount == null ? "" : meta.amount).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text) || !(Number(text) > 0) || Number(text) > 100000) throw new store.ValidationError("Enter the amount in pounds, like 12.50.");
  const description = str(meta.description, 300);
  if (!description) throw new store.ValidationError("Say what the expense was for.");
  const claim = {
    id: newId(),
    personId: person.id,
    date,
    category: funds.categories().includes(meta.category) && meta.category !== "Payroll" ? meta.category : "Other",
    amount: money(text),
    description,
    receipt: null,
    status: "submitted",
    createdAt: new Date().toISOString(),
    decidedBy: null, decidedAt: null, decisionNote: "",
    payMethod: null, paidBy: null, paidAt: null, payslipId: null,
  };
  if (buffer && buffer.length) {
    const fileName = str(meta.fileName, 200);
    const ext = workplace.fileExt(fileName);
    if (!RECEIPT_TYPES.includes(ext)) throw new store.ValidationError("Receipts can be a PDF or a photo (JPG, PNG, WebP or HEIC).");
    fs.writeFileSync(path.join(dir, claim.id), buffer, { mode: 0o600 });
    claim.receipt = { fileName: workplace.cleanFileName(fileName), ext, size: buffer.length };
  }
  db.data.claims.push(claim);
  db.save();
  return claim;
}

function get(id) {
  return db.data.claims.find((c) => c.id === id) || null;
}

function receiptFile(claim) {
  if (!claim.receipt) return null;
  const extra = { webp: { mime: "image/webp", inline: true }, gif: { mime: "image/gif", inline: true }, heic: { mime: "image/heic", inline: false } };
  const t = workplace.FILE_TYPES[claim.receipt.ext] || extra[claim.receipt.ext] || { mime: "application/octet-stream", inline: false };
  return { path: path.join(dir, claim.id), name: claim.receipt.fileName, mime: t.mime, inline: t.inline };
}

function decide(claim, approve, by, note) {
  if (claim.status !== "submitted") throw new store.ValidationError("That claim has already been dealt with.");
  if (!canApprove(by, claim)) throw new store.ValidationError("You can't approve that claim.");
  claim.status = approve ? "approved" : "rejected";
  claim.decidedBy = by.id;
  claim.decidedAt = new Date().toISOString();
  claim.decisionNote = str(note, 300);
  db.save();
}

// Payroll repays an approved claim: now from the main balance, or with the next payslip.
function pay(claim, method, by) {
  if (claim.status !== "approved" || (claim.payMethod === "payslip" && claim.payslipId)) throw new store.ValidationError("Only approved, unpaid claims can be paid.");
  const person = store.getPerson(claim.personId);
  if (method === "payslip") {
    claim.payMethod = "payslip";
    db.save();
    return;
  }
  funds.payExpense(funds.pence(claim.amount), claim.category, `Expenses – ${person ? person.displayName : "former staff"}: ${claim.description}`, "EXP-" + claim.id.slice(0, 6).toUpperCase(), by);
  claim.status = "paid";
  claim.payMethod = "direct";
  claim.paidBy = by.id;
  claim.paidAt = new Date().toISOString();
  db.save();
}

function cancel(claim, by) {
  if (claim.personId !== by.id && !store.can(by, PAY)) throw new store.ValidationError("You can't withdraw that claim.");
  if (claim.status === "paid" || claim.payslipId) throw new store.ValidationError("Paid claims can't be withdrawn.");
  db.data.claims = db.data.claims.filter((c) => c.id !== claim.id);
  if (claim.receipt) fs.rmSync(path.join(dir, claim.id), { force: true });
  db.save();
}

// Called by payslips.createDraft: claims marked "with next payslip" go on it.
function claimForPayslip(personId, slipId) {
  const lines = [];
  for (const c of db.data.claims) {
    if (c.personId !== personId || c.status !== "approved" || c.payMethod !== "payslip" || c.payslipId) continue;
    c.payslipId = slipId;
    c.status = "paid";
    c.paidAt = new Date().toISOString();
    lines.push({ label: `Expenses: ${c.description}`.slice(0, 80), amount: c.amount, claimId: c.id });
  }
  if (lines.length) db.save();
  return lines;
}

function releaseFromPayslip(slipId) {
  let changed = false;
  for (const c of db.data.claims) {
    if (c.payslipId !== slipId) continue;
    c.payslipId = null;
    c.status = "approved";
    c.paidAt = null;
    changed = true;
  }
  if (changed) db.save();
}

function brief(id) {
  const p = id ? store.getPerson(id) : null;
  return p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl } : { displayName: id ? "Former staff" : "" };
}

function view(c, viewer) {
  return {
    ...c,
    person: brief(c.personId),
    statusLabel: c.status === "approved" && c.payMethod === "payslip" ? "Approved · with next payslip" : STATUSES[c.status],
    decidedByName: c.decidedBy ? brief(c.decidedBy).displayName : null,
    canApprove: c.status === "submitted" && canApprove(viewer, c),
    canPay: c.status === "approved" && !c.payslipId && store.can(viewer, PAY),
    canCancel: (c.status === "submitted" || c.status === "approved" || c.status === "rejected") && !c.payslipId && (c.personId === viewer.id || store.can(viewer, PAY)),
  };
}

const newestFirst = (a, b) => b.createdAt.localeCompare(a.createdAt);

function forViewer(viewer) {
  const mine = db.data.claims.filter((c) => c.personId === viewer.id).sort(newestFirst).map((c) => view(c, viewer));
  const toApprove = db.data.claims.filter((c) => c.status === "submitted" && c.personId !== viewer.id && canApprove(viewer, c)).sort(newestFirst).map((c) => view(c, viewer));
  const all = store.can(viewer, PAY) ? db.data.claims.filter((c) => c.personId !== viewer.id).sort(newestFirst).slice(0, 300).map((c) => view(c, viewer)) : [];
  return { mine, toApprove, all };
}

function approvalCount(viewer) {
  let n = db.data.claims.filter((c) => c.status === "submitted" && c.personId !== viewer.id && canApprove(viewer, c)).length;
  if (store.can(viewer, PAY)) n += db.data.claims.filter((c) => c.status === "approved" && !c.payMethod).length;
  return n;
}

function paidBetween(from, to) {
  const list = db.data.claims.filter((c) => c.status === "paid" && c.paidAt && c.paidAt.slice(0, 10) >= from && c.paidAt.slice(0, 10) <= to);
  return { count: list.length, amount: money(list.reduce((n, c) => n + c.amount, 0)) };
}

module.exports = { STATUSES, init, submit, get, canSee, receiptFile, decide, pay, cancel, forViewer, approvalCount, paidBetween };
