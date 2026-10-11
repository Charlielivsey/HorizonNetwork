// Company funds: the main balance and a separate payroll fund, with a full history of every
// movement. Money comes into the main balance (a PayPal payment, or added manually) and can be
// removed manually. The payroll fund can only be topped up from the main balance; running
// payroll takes the cost of the payslips out of it, and it's allowed to go negative.
// Only people with "payroll.manage" can see or change it. Stored in DATA_DIR/funds.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const ACCOUNTS = { main: "Main balance", payroll: "Payroll fund" };
const SOURCES = { paypal: "PayPal", bank: "Bank transfer", manual: "Manual" };

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "funds.json", () => ({ balances: { main: 0, payroll: 0 }, transactions: [] }));
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

function removeFunds(input, by) {
  const amount = validAmount(input.amount);
  const note = String(input.note || "").trim();
  if (!note) throw new store.ValidationError("Say what the money is being removed for.");
  if (amount > db.data.balances.main) throw new store.ValidationError(`There's only ${fmt(db.data.balances.main)} in the main balance.`);
  const t = record("main", -amount, { type: "withdrawal", source: "manual", reference: input.reference, description: note }, by);
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

module.exports = { ACCOUNTS, SOURCES, init, balances, addFunds, removeFunds, transferToPayroll, transferToMain, chargePayroll, history, pence, fmt };
