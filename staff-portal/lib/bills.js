// Supplier bills: money the company owes (hosting, software, rent...). People who run payroll &
// finance record each bill with its due date, and mark it paid, which takes it out of the main
// balance under its spending category. Monthly or yearly bills make the next one when paid.
// Stored in DATA_DIR/bills.json.

const crypto = require("crypto");
const store = require("./store");
const funds = require("./funds");
const datafile = require("./datafile");

const REPEATS = { none: "One-off", monthly: "Every month", quarterly: "Every 3 months", yearly: "Every year" };

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "bills.json", () => ({ bills: [] }));
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const money = (n) => Math.round(Number(n) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

function addMonths(date, n) {
  const d = new Date(date + "T12:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

function apply(b, input) {
  const supplier = str(input.supplier, 120);
  if (!supplier) throw new store.ValidationError("Enter who the bill is from.");
  const amount = Number(String(input.amount || "").replace(/[£,\s]/g, ""));
  if (!(amount > 0 && amount <= 10000000)) throw new store.ValidationError("Enter the amount.");
  const dueDate = str(input.dueDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new store.ValidationError("Choose the due date.");
  Object.assign(b, {
    supplier, amount: money(amount), dueDate,
    reference: str(input.reference, 80),
    category: funds.categories().includes(input.category) && input.category !== "Payroll" ? input.category : "Other",
    repeat: REPEATS[input.repeat] ? input.repeat : "none",
    note: str(input.note, 500),
    updatedAt: new Date().toISOString(),
  });
}

function create(input, by) {
  const b = { id: newId(), status: "unpaid", createdBy: by.id, createdAt: new Date().toISOString(), paidAt: null, paidBy: null };
  apply(b, input);
  db.data.bills.push(b);
  db.save();
  return b;
}

function update(b, input) {
  if (b.status === "paid") throw new store.ValidationError("Paid bills can't be changed.");
  apply(b, input);
  db.save();
}

function get(id) {
  return db.data.bills.find((b) => b.id === id) || null;
}

function pay(b, by) {
  if (b.status === "paid") throw new store.ValidationError("That bill has already been paid.");
  funds.payBill(funds.pence(b.amount), b.category, `${b.supplier}${b.reference ? ` (${b.reference})` : ""}`, b.reference, by);
  b.status = "paid";
  b.paidAt = new Date().toISOString();
  b.paidBy = by.id;
  let next = null;
  if (b.repeat !== "none") {
    next = { ...b, id: newId(), status: "unpaid", paidAt: null, paidBy: null, createdAt: new Date().toISOString(), createdBy: by.id, dueDate: addMonths(b.dueDate, { monthly: 1, quarterly: 3, yearly: 12 }[b.repeat]) };
    db.data.bills.push(next);
  }
  db.save();
  return next;
}

function remove(b) {
  if (b.status === "paid") throw new store.ValidationError("Paid bills stay on record.");
  db.data.bills = db.data.bills.filter((x) => x.id !== b.id);
  db.save();
}

function view(b) {
  const overdue = b.status === "unpaid" && b.dueDate < today();
  const soon = b.status === "unpaid" && !overdue && (Date.parse(b.dueDate) - Date.parse(today())) / 86400000 <= 7;
  return { ...b, overdue, dueSoon: soon, repeatLabel: REPEATS[b.repeat] };
}

function list() {
  return db.data.bills.slice().sort((a, b) => (a.status === b.status ? (a.status === "paid" ? b.paidAt.localeCompare(a.paidAt) : a.dueDate.localeCompare(b.dueDate)) : a.status === "unpaid" ? -1 : 1)).map(view);
}

function unpaidBetween(from, to) {
  return db.data.bills.filter((b) => b.status === "unpaid" && b.dueDate >= from && b.dueDate <= to);
}

function dueCount() {
  const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  return db.data.bills.filter((b) => b.status === "unpaid" && b.dueDate <= week).length;
}

function summary() {
  const unpaid = db.data.bills.filter((b) => b.status === "unpaid");
  const sum = (l) => money(l.reduce((n, b) => n + b.amount, 0));
  const t = today();
  const monthEnd = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return {
    unpaid: sum(unpaid),
    overdue: sum(unpaid.filter((b) => b.dueDate < t)),
    overdueCount: unpaid.filter((b) => b.dueDate < t).length,
    dueThisMonth: sum(unpaid.filter((b) => b.dueDate <= monthEnd)),
  };
}

module.exports = { REPEATS, init, create, update, get, pay, remove, list, unpaidBetween, dueCount, summary, addMonths };
