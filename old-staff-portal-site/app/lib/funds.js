// Company funds: the main balance and a separate payroll fund, with a full history of every
// movement. Money comes into the main balance (a PayPal payment, or added manually) and can be
// removed manually. The payroll fund can only be topped up from the main balance; running
// payroll takes the cost of the payslips out of it, and it's allowed to go negative.
// Only people with "payroll.manage" can see or change it. Stored in DATA_DIR/funds.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const ACCOUNTS = { main: "Main balance", payroll: "Payroll fund" };
const SOURCES = { paypal: "PayPal", bank: "Bank transfer", manual: "Manual", invoice: "Invoice" };
// What money going out is spent on. Payroll is always "Payroll"; HR can add their own categories.
const DEFAULT_CATEGORIES = ["Payroll", "Hosting", "Software", "Marketing", "Equipment", "Travel", "Office", "Training", "Other"];
// Budget warnings show from this share of a monthly budget.
const BUDGET_WARN = 0.8;

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "funds.json", () => ({ balances: { main: 0, payroll: 0 }, transactions: [], categories: DEFAULT_CATEGORIES.slice(), budgets: {} }));
}

const pence = (n) => Math.round(Number(n) * 100);
const pounds = (p) => p / 100;

function validAmount(v) {
  const text = String(v == null ? "" : v).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new store.ValidationError("Enter an amount in pounds, like 250 or 99.50.");
  const n = Number(text);
  if (!(n > 0 && n <= 10000000)) throw new store.ValidationError("Enter an amount greater than £0.");
  return pence(n);
}

function balances() {
  return { main: pounds(db.data.balances.main), payroll: pounds(db.data.balances.payroll) };
}

// Records a movement on one account. `amountPence` is signed: positive in, negative out.
function record(account, amountPence, fields, by) {
  db.data.balances[account] += amountPence;
  const t = {
    id: crypto.randomBytes(8).toString("hex"),
    account,
    amount: pounds(amountPence),
    balanceAfter: pounds(db.data.balances[account]),
    type: fields.type,
    description: String(fields.description || "").slice(0, 200),
    reference: String(fields.reference || "").trim().slice(0, 80),
    source: fields.source || "",
    category: fields.category || categoryOfType(fields.type),
    by: by ? by.id : null,
    at: new Date().toISOString(),
  };
  db.data.transactions.push(t);
  return t;
}

function addFunds(input, by) {
  const amount = validAmount(input.amount);
  const source = SOURCES[input.source] ? input.source : "manual";
  const note = String(input.note || "").trim();
  const t = record("main", amount, {
    type: "deposit",
    source,
    reference: input.reference,
    description: note || (source === "paypal" ? "PayPal payment received" : source === "bank" ? "Bank transfer received" : "Funds added"),
  }, by);
  db.save();
  return t;
}

function categoryOfType(type) {
  return type === "payroll" || type === "payroll-shortfall" || type === "payroll-refund" ? "Payroll" : "";
}

function validCategory(c) {
  const v = String(c || "").trim();
  return db.data.categories.find((x) => x.toLowerCase() === v.toLowerCase()) || "Other";
}

function removeFunds(input, by) {
  const amount = validAmount(input.amount);
  const note = String(input.note || "").trim();
  if (!note) throw new store.ValidationError("Say what the money is being removed for.");
  if (amount > db.data.balances.main) throw new store.ValidationError(`There's only ${fmt(db.data.balances.main)} in the main balance.`);
  const t = record("main", -amount, { type: "withdrawal", source: "manual", reference: input.reference, description: note, category: validCategory(input.category) }, by);
  db.save();
  return t;
}

// Main balance → payroll fund. The only way money gets into the payroll fund.
function transferToPayroll(input, by) {
  const amount = validAmount(input.amount);
  if (amount > db.data.balances.main) throw new store.ValidationError(`There's only ${fmt(db.data.balances.main)} in the main balance.`);
  const note = String(input.note || "").trim();
  record("main", -amount, { type: "transfer-out", description: note || "Moved to the payroll fund" }, by);
  const t = record("payroll", amount, { type: "transfer-in", description: note || "Moved from the main balance" }, by);
  db.save();
  return t;
}

// Payroll fund → main balance, for money that isn't needed for wages.
function transferToMain(input, by) {
  const amount = validAmount(input.amount);
  if (amount > db.data.balances.payroll) throw new store.ValidationError(`There's only ${fmt(Math.max(0, db.data.balances.payroll))} in the payroll fund.`);
  const note = String(input.note || "").trim();
  record("payroll", -amount, { type: "payroll-to-main", description: note || "Moved back to the main balance" }, by);
  const t = record("main", amount, { type: "main-from-payroll", description: note || "Moved back from the payroll fund" }, by);
  db.save();
  return t;
}

// Payroll costs. The payroll fund pays what it can (down to £0); any shortfall is taken from the
// main balance, which is allowed to go negative. A negative cost (a payslip deleted or reduced)
// goes back into the payroll fund.
function chargePayroll(costPence, description, by) {
  if (!costPence) return null;
  if (costPence < 0) {
    const t = record("payroll", -costPence, { type: "payroll-refund", description }, by);
    db.save();
    return t;
  }
  const fromPayroll = Math.min(costPence, Math.max(0, db.data.balances.payroll));
  const shortfall = costPence - fromPayroll;
  if (fromPayroll) record("payroll", -fromPayroll, { type: "payroll", description }, by);
  if (shortfall) {
    record("main", -shortfall, {
      type: "payroll-shortfall",
      description: `${description} – ${fmt(shortfall)} the payroll fund couldn't cover`,
    }, by);
  }
  db.save();
  return { fromPayroll: pounds(fromPayroll), fromMain: pounds(shortfall) };
}

// An expense claim paid straight from the main balance. Allowed to take it below zero, like payroll.
function payExpense(amountPence, category, description, reference, by) {
  const t = record("main", -amountPence, { type: "expense", description, reference, category: validCategory(category) }, by);
  db.save();
  return t;
}

// A supplier bill paid from the main balance (allowed to go below zero).
function payBill(amountPence, category, description, reference, by) {
  const t = record("main", -amountPence, { type: "bill", description, reference, category: validCategory(category) }, by);
  db.save();
  return t;
}

// Average money spent each month on things other than payroll and bills (removals and expenses)
// over the last `months` full months.
function averageMonthlyOther(months) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1)).toISOString();
  const total = db.data.transactions.filter((t) => (t.type === "withdrawal" || t.type === "expense") && t.at >= start && t.at < end).reduce((n, t) => n - pence(t.amount), 0);
  return pounds(Math.round(total / months));
}

// A customer paid an invoice: the money goes into the main balance.
function invoicePaid(amountPence, description, reference, by) {
  const t = record("main", amountPence, { type: "deposit", source: "invoice", description, reference }, by);
  db.save();
  return t;
}

// ---------- Spending categories and budgets ----------

function categories() {
  return db.data.categories.slice();
}

function addCategory(name) {
  const v = String(name || "").trim().slice(0, 40);
  if (!v) throw new store.ValidationError("Give the category a name.");
  if (db.data.categories.some((c) => c.toLowerCase() === v.toLowerCase())) throw new store.ValidationError("That category already exists.");
  db.data.categories.push(v);
  db.save();
}

function removeCategory(name) {
  if (name === "Payroll" || name === "Other") throw new store.ValidationError(`"${name}" can't be removed.`);
  db.data.categories = db.data.categories.filter((c) => c !== name);
  delete db.data.budgets[name];
  db.save();
}

function setBudget(category, amount) {
  const c = db.data.categories.find((x) => x === category);
  if (!c) throw new store.ValidationError("Choose a category.");
  const text = String(amount == null ? "" : amount).trim();
  if (!text || Number(text) === 0) delete db.data.budgets[c];
  else db.data.budgets[c] = pounds(validAmount(text));
  db.save();
}

function monthBounds(period) {
  const [y, m] = period.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)).toISOString(), end: new Date(Date.UTC(y, m, 1)).toISOString() };
}

// Money spent in a month by category (internal moves between the accounts don't count).
function spendingByCategory(period) {
  const { start, end } = monthBounds(period);
  const out = {};
  for (const t of db.data.transactions) {
    if (t.at < start || t.at >= end || INTERNAL.includes(t.type)) continue;
    const spend = t.type === "withdrawal" || t.type === "expense" || t.type === "bill" || t.type === "payroll" || t.type === "payroll-shortfall" || t.type === "payroll-refund";
    if (!spend) continue;
    const c = t.category || categoryOfType(t.type) || "Other";
    out[c] = (out[c] || 0) - pence(t.amount);
  }
  return out;
}

// Each category this month: what's been spent against its budget, and whether it's close or over.
function budgets(period) {
  const p = period || new Date().toISOString().slice(0, 7);
  const spent = spendingByCategory(p);
  return db.data.categories.map((c) => {
    const budget = db.data.budgets[c] || 0;
    const s = pounds(spent[c] || 0);
    const used = budget ? s / budget : 0;
    return { category: c, budget, spent: s, left: budget ? Math.round((budget - s) * 100) / 100 : null, used, level: !budget ? null : used >= 1 ? "over" : used >= BUDGET_WARN ? "close" : "ok" };
  });
}

function budgetWarnings(period) {
  return budgets(period).filter((b) => b.level === "over" || b.level === "close");
}

// Month-by-month figures for the charts: closing balances, money in and money spent.
function monthlySeries(months) {
  const now = new Date();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const period = d.toISOString().slice(0, 7);
    const { start, end } = monthBounds(period);
    let main = 0, payroll = 0, moneyIn = 0, out_ = 0;
    for (const t of db.data.transactions) {
      if (t.at >= end) break;
      if (t.account === "main") main = t.balanceAfter; else payroll = t.balanceAfter;
      if (t.at >= start && !INTERNAL.includes(t.type)) {
        if (t.amount > 0 && t.type !== "payroll-refund") moneyIn += pence(t.amount);
        else out_ -= pence(t.amount);
      }
    }
    out.push({ period, main, payroll, total: Math.round((main + payroll) * 100) / 100, in: pounds(moneyIn), out: pounds(out_) });
  }
  return out;
}

function fmt(p) {
  const v = pounds(p);
  return (v < 0 ? "-" : "") + "£" + Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function history(limit) {
  return db.data.transactions.slice(-(limit || 300)).reverse().map((t) => {
    const p = t.by ? store.getPerson(t.by) : null;
    return { ...t, byName: p ? p.displayName : t.by ? "Former staff" : "System", sourceLabel: SOURCES[t.source] || "" };
  });
}

// Movements between the two accounts are internal, so they don't count as money in or spent.
const INTERNAL = ["transfer-out", "transfer-in", "payroll-to-main", "main-from-payroll"];

// Figures for a statement covering one month (YYYY-MM).
function statement(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period || ""))) throw new store.ValidationError("Choose a valid month.");
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();
  const all = db.data.transactions;
  const balanceAt = (account, before) => {
    let last = null;
    for (const t of all) if (t.account === account && t.at < before) last = t;
    return last ? last.balanceAfter : 0;
  };
  const inPeriod = all.filter((t) => t.at >= start && t.at < end);
  const external = inPeriod.filter((t) => !INTERNAL.includes(t.type));
  const p = (list) => list.reduce((n, t) => n + pence(t.amount), 0);
  const spentBy = {
    payroll: -p(external.filter((t) => t.type === "payroll" || t.type === "payroll-shortfall" || t.type === "payroll-refund")),
    removed: -p(external.filter((t) => t.type === "withdrawal")),
    expenses: -p(external.filter((t) => t.type === "expense")),
    bills: -p(external.filter((t) => t.type === "bill")),
  };
  const accounts = {};
  for (const a of Object.keys(ACCOUNTS)) {
    const list = inPeriod.filter((t) => t.account === a);
    accounts[a] = {
      opening: balanceAt(a, start),
      in: pounds(list.filter((t) => t.amount > 0).reduce((n, t) => n + pence(t.amount), 0)),
      out: pounds(-list.filter((t) => t.amount < 0).reduce((n, t) => n + pence(t.amount), 0)),
      closing: balanceAt(a, end),
    };
  }
  const byName = (t) => {
    const person = t.by ? store.getPerson(t.by) : null;
    return person ? person.displayName : t.by ? "Former staff" : "System";
  };
  return {
    period,
    start: start.slice(0, 10),
    end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
    accounts,
    opening: pounds(pence(accounts.main.opening) + pence(accounts.payroll.opening)),
    closing: pounds(pence(accounts.main.closing) + pence(accounts.payroll.closing)),
    moneyIn: pounds(p(external.filter((t) => t.amount > 0 && t.type !== "payroll-refund"))),
    spent: pounds(spentBy.payroll + spentBy.removed + spentBy.expenses + spentBy.bills),
    spentBy: { payroll: pounds(spentBy.payroll), removed: pounds(spentBy.removed), expenses: pounds(spentBy.expenses), bills: pounds(spentBy.bills) },
    byCategory: Object.entries(spendingByCategory(period)).map(([category, v]) => ({ category, amount: pounds(v) })).filter((x) => x.amount).sort((a, b) => b.amount - a.amount),
    transactions: inPeriod.map((t) => ({ ...t, byName: byName(t), sourceLabel: SOURCES[t.source] || "", internal: INTERNAL.includes(t.type) })),
  };
}

// Average money in per month over the last `months` full months before `period` (YYYY-MM).
function averageMonthlyIn(period, months) {
  const [y, m] = period.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const start = new Date(Date.UTC(y, m - 1 - months, 1)).toISOString();
  const total = db.data.transactions.filter((t) => t.type === "deposit" && t.at >= start && t.at < end).reduce((n, t) => n + pence(t.amount), 0);
  return pounds(Math.round(total / months));
}

module.exports = {
  payBill, averageMonthlyOther, categories, addCategory, removeCategory, setBudget, budgets, budgetWarnings, spendingByCategory, monthlySeries, payExpense, invoicePaid,
  ACCOUNTS, SOURCES, INTERNAL, statement, averageMonthlyIn, init, balances, addFunds, removeFunds, transferToPayroll, transferToMain, chargePayroll, history, pence, fmt };
