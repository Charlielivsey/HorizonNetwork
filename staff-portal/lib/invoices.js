// Invoices. People who run payroll & finance raise branded invoices from any HN Group company,
// send them (as a PDF from the print window) and mark them paid, which adds the money to the main
// balance. Numbers run INV-0001, INV-0002... across the group. Stored in DATA_DIR/invoices.json.

const crypto = require("crypto");
const store = require("./store");
const funds = require("./funds");
const datafile = require("./datafile");

const MANAGE = "payroll.manage";
const STATUSES = { draft: "Draft", sent: "Sent", paid: "Paid", void: "Void" };
const VAT_RATES = [0, 5, 20];

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "invoices.json", () => ({ invoices: [], nextNumber: 1, settings: { paymentTerms: 30, bankDetails: "", footer: "Thank you for your business." } }));
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const money = (n) => Math.round(Number(n) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

function validDay(v, label) {
  const s = str(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) throw new store.ValidationError(`Choose a valid ${label}.`);
  return s;
}

function addDays(date, n) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function cleanLines(list) {
  const lines = (Array.isArray(list) ? list : []).slice(0, 50).map((l) => {
    const description = str(l && l.description, 200);
    if (!description) return null;
    const quantity = Number(l.quantity);
    const unitPrice = Number(l.unitPrice);
    if (!(quantity > 0 && quantity <= 100000)) throw new store.ValidationError(`Enter a valid quantity for “${description}”.`);
    if (!(unitPrice >= -10000000 && unitPrice <= 10000000)) throw new store.ValidationError(`Enter a valid price for “${description}”.`);
    return { description, quantity: Math.round(quantity * 100) / 100, unitPrice: money(unitPrice) };
  }).filter(Boolean);
  if (!lines.length) throw new store.ValidationError("Add at least one line.");
  return lines;
}

function totals(inv) {
  const subtotal = money(inv.lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0));
  const vat = money((subtotal * inv.vatRate) / 100);
  return { subtotal, vat, total: money(subtotal + vat) };
}

function apply(inv, input) {
  if (!store.COMPANIES.includes(input.company)) throw new store.ValidationError("Choose which company the invoice is from.");
  const customerName = str(input.customerName, 120);
  if (!customerName) throw new store.ValidationError("Enter who the invoice is for.");
  inv.company = input.company;
  inv.customer = { name: customerName, email: str(input.customerEmail, 160), address: str(input.customerAddress, 400) };
  inv.issueDate = validDay(input.issueDate || today(), "invoice date");
  inv.dueDate = input.dueDate ? validDay(input.dueDate, "due date") : addDays(inv.issueDate, db.data.settings.paymentTerms);
  if (inv.dueDate < inv.issueDate) throw new store.ValidationError("The due date can't be before the invoice date.");
  inv.reference = str(input.reference, 80);
  inv.lines = cleanLines(input.lines);
  inv.vatRate = VAT_RATES.includes(Number(input.vatRate)) ? Number(input.vatRate) : 0;
  inv.notes = str(input.notes, 1000);
  inv.updatedAt = new Date().toISOString();
}

function create(input, by) {
  const inv = { id: newId(), number: "INV-" + String(db.data.nextNumber).padStart(4, "0"), status: "draft", createdBy: by.id, createdAt: new Date().toISOString(), paidAt: null, sentAt: null };
  apply(inv, input);
  db.data.nextNumber++;
  db.data.invoices.push(inv);
  db.save();
  return inv;
}

function update(inv, input) {
  if (inv.status === "paid" || inv.status === "void") throw new store.ValidationError("Paid or void invoices can't be changed.");
  apply(inv, input);
  db.save();
}

function get(id) {
  return db.data.invoices.find((i) => i.id === id) || null;
}

function setStatus(inv, status, by, input) {
  if (inv.status === "paid" || inv.status === "void") throw new store.ValidationError("This invoice is already " + STATUSES[inv.status].toLowerCase() + ".");
  if (status === "sent") {
    inv.status = "sent";
    inv.sentAt = new Date().toISOString();
  } else if (status === "paid") {
    const t = totals(inv);
    const source = input && input.source === "paypal" ? "PayPal" : "bank transfer";
    funds.invoicePaid(funds.pence(t.total), `${inv.number} paid by ${inv.customer.name} (${source})`, inv.number, by);
    inv.status = "paid";
    inv.paidAt = new Date().toISOString();
  } else if (status === "void") {
    inv.status = "void";
  } else throw new store.ValidationError("Choose a status.");
  inv.updatedAt = new Date().toISOString();
  db.save();
}

function remove(inv) {
  if (inv.status !== "draft") throw new store.ValidationError("Only draft invoices can be deleted. Void it instead.");
  db.data.invoices = db.data.invoices.filter((i) => i.id !== inv.id);
  db.save();
}

function view(inv) {
  const overdue = inv.status === "sent" && inv.dueDate < today();
  return { ...inv, ...totals(inv), overdue, statusLabel: overdue ? "Overdue" : STATUSES[inv.status] };
}

function list() {
  return db.data.invoices.slice().sort((a, b) => b.number.localeCompare(a.number)).map(view);
}

function summary() {
  const all = list();
  const sum = (l) => money(l.reduce((n, i) => n + i.total, 0));
  const outstanding = all.filter((i) => i.status === "sent");
  return {
    outstanding: sum(outstanding),
    overdue: sum(outstanding.filter((i) => i.overdue)),
    overdueCount: outstanding.filter((i) => i.overdue).length,
    paidThisMonth: sum(all.filter((i) => i.status === "paid" && i.paidAt.slice(0, 7) === today().slice(0, 7))),
  };
}

function settings() {
  return { ...db.data.settings };
}

function saveSettings(input) {
  const terms = Number(input.paymentTerms);
  if (!(terms >= 0 && terms <= 365)) throw new store.ValidationError("Enter payment terms between 0 and 365 days.");
  db.data.settings = { paymentTerms: Math.round(terms), bankDetails: str(input.bankDetails, 400), footer: str(input.footer, 300) };
  db.save();
}

module.exports = { MANAGE, STATUSES, VAT_RATES, init, create, update, get, setStatus, remove, view, list, summary, settings, saveSettings };
