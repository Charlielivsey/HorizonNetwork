// Payslips and payroll. Only people with "payroll.manage" (the Human Resources role) can see pay
// details, generate payslips and issue them. Employees only ever see their own issued payslips.
// Every payslip is paid by HN Group Limited.
//
// Income tax, National Insurance, pension and student loan are always worked out automatically
// from the payments on the payslip (HR adds payments and any other deductions; the statutory ones
// can't be typed over). Income tax is cumulative across the tax year, the way HMRC payroll works,
// unless the tax code is an emergency (W1/M1/X) code. Rates are for 2025/26, rest of the UK.
//
// Generating payslips takes their cost (total pay plus employer NI and pension) out of the
// payroll fund; changing or deleting a payslip adjusts it. Stored in DATA_DIR/payslips.json.

const crypto = require("crypto");
const store = require("./store");
const rotas = require("./rotas");
const funds = require("./funds");
const datafile = require("./datafile");

const MANAGE = "payroll.manage";
const EMPLOYER = "HN Group Limited";
const STANDARD_MONTHLY_SALARY = 10;

const RATES = {
  label: "2025/26",
  basicBand: 37700,
  higherLimit: 125140,
  personalAllowance: 12570,
  basicRate: 0.2,
  higherRate: 0.4,
  additionalRate: 0.45,
  niMainRate: 0.08,
  niUpperRate: 0.02,
  employerNiRate: 0.15,
  // HMRC's published monthly thresholds.
  monthly: { niPrimaryThreshold: 1048, niUpperEarningsLimit: 4189, employerNiThreshold: 417 },
  studentLoans: {
    plan1: { label: "Plan 1", threshold: 26065, rate: 0.09 },
    plan2: { label: "Plan 2", threshold: 28470, rate: 0.09 },
    plan4: { label: "Plan 4", threshold: 32745, rate: 0.09 },
    plan5: { label: "Plan 5", threshold: 25000, rate: 0.09 },
    postgrad: { label: "Postgraduate loan", threshold: 21000, rate: 0.06 },
  },
};

const AUTO_KINDS = ["tax", "ni", "pension", "studentLoan"];

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "payslips.json", () => ({ payDetails: {}, payslips: [] }));
  // Company pension: 5% from the employee and 10% from HN Group, for everyone. Applied once to
  // anyone whose pay details were already saved; HR can change individuals afterwards.
  if (!db.data.pensionRatesSet) {
    for (const d of Object.values(db.data.payDetails)) {
      d.pensionEmployeePct = 5;
      d.pensionEmployerPct = 10;
    }
    db.data.pensionRatesSet = true;
    db.save();
  }
}

// Payroll can't run while company money is overdrawn (after a payroll the payroll fund couldn't
// fully cover, the main balance can be below zero).
function assertCanRun() {
  const b = funds.balances();
  if (b.main < 0 || b.payroll < 0) {
    const which = b.main < 0 ? "main balance" : "payroll fund";
    const amount = b.main < 0 ? b.main : b.payroll;
    throw new store.ValidationError(`The ${which} is overdrawn by ${funds.fmt(Math.round(-amount * 100))}, so payroll can't run. Add funds first.`);
  }
}

const newId = () => crypto.randomBytes(8).toString("hex");
const money = (n) => Math.round(Number(n) * 100) / 100;
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const sum = (list) => money(list.reduce((n, l) => n + l.amount, 0));

function validPeriod(v) {
  const s = String(v || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) throw new store.ValidationError("Choose a valid pay month.");
  return s;
}

function validDay(v, label) {
  const s = String(v || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s + "T00:00:00Z"))) throw new store.ValidationError(`Choose a valid ${label}.`);
  return s;
}

function periodBounds(period) {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: period + "-01", end: period + "-" + String(last).padStart(2, "0") };
}

function periodLabel(period) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

// UK tax years run from 6 April; tax month 1 is 6 April to 5 May.
function taxYearStart(date) {
  const y = Number(date.slice(0, 4));
  return date >= `${y}-04-06` ? `${y}-04-06` : `${y - 1}-04-06`;
}

function taxMonth(date) {
  const [, m, d] = date.split("-").map(Number);
  const mm = d < 6 ? m - 1 : m;
  return ((mm - 4 + 12) % 12) + 1;
}

// ---------- Pay details ----------

const PAY_DEFAULTS = {
  employeeNumber: "", niNumber: "", taxCode: "1257L", niCategory: "A", payType: "salary",
  monthlySalary: STANDARD_MONTHLY_SALARY, hourlyRate: 0, pensionEmployeePct: 5, pensionEmployerPct: 10, studentLoan: "",
  // Pay and tax earlier in the current tax year that isn't on a portal payslip (from a P45, or an
  // older payroll), so cumulative tax is right. Only counts in the tax year it was entered for.
  previousPay: 0, previousTax: 0, previousTaxYear: "",
};

function payDetails(personId) {
  const saved = db.data.payDetails[personId] || {};
  const d = { ...PAY_DEFAULTS, ...saved };
  // Older records stored an annual salary.
  if (saved.monthlySalary === undefined && saved.annualSalary) d.monthlySalary = money(saved.annualSalary / 12);
  delete d.annualSalary;
  d.currentTaxYear = taxYearStart(new Date().toISOString().slice(0, 10));
  if (d.previousTaxYear !== d.currentTaxYear) { d.previousPay = 0; d.previousTax = 0; }
  delete d.company;
  d.isStandard = d.payType === "salary" && d.monthlySalary === STANDARD_MONTHLY_SALARY;
  return d;
}

function savePayDetails(personId, input) {
  const num = (v, label, max) => {
    const n = Number(v || 0);
    if (!(n >= 0 && n <= max)) throw new store.ValidationError(`Enter a valid ${label}.`);
    return money(n);
  };
  const ni = str(input.niNumber, 13).toUpperCase().replace(/\s+/g, "");
  if (ni && !/^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/.test(ni)) throw new store.ValidationError("Enter a valid National Insurance number, like AB123456C.");
  const taxCode = str(input.taxCode, 12).toUpperCase().replace(/\s+/g, "") || "1257L";
  if (!/^[SC]?(\d{1,6}[LMNT]|K\d{1,6}|BR|D0|D1|D2|NT|0T)(W1|M1|X)?$/.test(taxCode)) throw new store.ValidationError("Enter a valid tax code, like 1257L.");
  db.data.payDetails[personId] = {
    employeeNumber: str(input.employeeNumber, 20),
    niNumber: ni,
    taxCode,
    niCategory: /^[A-Z]$/.test(str(input.niCategory, 1).toUpperCase()) ? str(input.niCategory, 1).toUpperCase() : "A",
    payType: input.payType === "hourly" ? "hourly" : "salary",
    monthlySalary: num(input.monthlySalary, "monthly salary", 1000000),
    hourlyRate: num(input.hourlyRate, "hourly rate", 10000),
    pensionEmployeePct: num(input.pensionEmployeePct, "employee pension %", 100),
    pensionEmployerPct: num(input.pensionEmployerPct, "employer pension %", 100),
    studentLoan: RATES.studentLoans[input.studentLoan] ? input.studentLoan : "",
    previousPay: num(input.previousPay, "earlier pay this tax year", 10000000),
    previousTax: num(input.previousTax, "earlier tax this tax year", 10000000),
    previousTaxYear: taxYearStart(new Date().toISOString().slice(0, 10)),
  };
  db.save();
  return payDetails(personId);
}

// ---------- Tax and National Insurance ----------

function parseTaxCode(raw) {
  const full = String(raw || "1257L").toUpperCase().replace(/^[SC]/, "");
  const emergency = /(W1|M1|X)$/.test(full);
  const code = full.replace(/(W1|M1|X)$/, "");
  let m;
  if (code === "NT") return { flat: 0, emergency };
  if (code === "BR") return { flat: RATES.basicRate, emergency };
  if (code === "D0") return { flat: RATES.higherRate, emergency };
  if (code === "D1" || code === "D2") return { flat: RATES.additionalRate, emergency };
  if ((m = /^(\d+)[LMNT]$/.exec(code))) return { allowance: Number(m[1]) * 10 + 9, emergency };
  if ((m = /^K(\d+)$/.exec(code))) return { allowance: -(Number(m[1]) * 10), emergency };
  return { allowance: 0, emergency }; // 0T
}

// Tax due on a taxable amount for `months` twelfths of the year's bands.
function bandTax(taxable, months) {
  const f = months / 12;
  const basic = RATES.basicBand * f;
  const higher = (RATES.higherLimit - RATES.personalAllowance) * f;
  let tax = Math.min(taxable, basic) * RATES.basicRate;
  if (taxable > basic) tax += (Math.min(taxable, higher) - basic) * RATES.higherRate;
  if (taxable > higher) tax += (taxable - higher) * RATES.additionalRate;
  return tax;
}

// PAYE for this payslip. Cumulative: tax due on everything paid this tax year so far, less the
// tax already taken. Emergency codes work on this month alone. Tax can't be more than half the pay.
function payeTax(taxablePay, code, payDate, previous) {
  const c = parseTaxCode(code);
  if (c.flat !== undefined) return money(Math.max(0, taxablePay) * c.flat);
  const cumulative = !c.emergency;
  const months = cumulative ? taxMonth(payDate) : 1;
  const paidSoFar = cumulative ? previous.taxable : 0;
  const taxSoFar = cumulative ? previous.tax : 0;
  const freePay = (c.allowance * months) / 12;
  const taxableToDate = Math.max(0, Math.floor(paidSoFar + taxablePay - freePay));
  let tax = Math.floor(bandTax(taxableToDate, months) * 100) / 100 - taxSoFar;
  tax = Math.min(tax, Math.max(0, taxablePay) * 0.5);
  return money(tax);
}

function employeeNi(gross, category) {
  const cat = String(category || "A").toUpperCase();
  if (cat === "C" || cat === "X") return 0;
  const pt = RATES.monthly.niPrimaryThreshold;
  const uel = RATES.monthly.niUpperEarningsLimit;
  const main = ["J", "Z", "L"].includes(cat) ? RATES.niUpperRate : RATES.niMainRate;
  let ni = 0;
  if (gross > pt) ni += (Math.min(gross, uel) - pt) * main;
  if (gross > uel) ni += (gross - uel) * RATES.niUpperRate;
  return money(ni);
}

function employerNi(gross) {
  const st = RATES.monthly.employerNiThreshold;
  return gross > st ? money((gross - st) * RATES.employerNiRate) : 0;
}

function taxablePayOf(slip) {
  return money(sum(slip.payments) - sum(slip.deductions.filter((l) => l.kind === "pension")));
}

// Earlier payslips in the same tax year (any status), for cumulative tax.
// Earlier payslips are those paid on an earlier date, or on the same date but made before this one
// (an additional payslip in the same month counts the first one).
function previousInYear(personId, payDate, excludeId) {
  const from = taxYearStart(payDate);
  const self = excludeId ? db.data.payslips.find((s) => s.id === excludeId) : null;
  const createdAt = self ? self.createdAt : null;
  const earlierThis = (s) => s.payDate < payDate || (s.payDate === payDate && (!createdAt || s.createdAt < createdAt));
  const list = db.data.payslips.filter((s) => s.personId === personId && s.id !== excludeId && s.payDate >= from && earlierThis(s));
  const d = payDetails(personId);
  const earlier = d.previousTaxYear === from ? d : { previousPay: 0, previousTax: 0 };
  return {
    taxable: money(earlier.previousPay + list.reduce((n, s) => n + taxablePayOf(s), 0)),
    tax: money(earlier.previousTax + list.reduce((n, s) => n + sum(s.deductions.filter((l) => l.kind === "tax")), 0)),
  };
}

// Works out the automatic deductions and employer contributions for a set of payments.
function calculate(personId, payments, payDate, excludeId) {
  const d = payDetails(personId);
  const gross = sum(payments);
  const pension = money((gross * d.pensionEmployeePct) / 100);
  const previous = previousInYear(personId, payDate, excludeId);
  const deductions = [
    { label: `Income tax (PAYE, ${d.taxCode})`, amount: payeTax(gross - pension, d.taxCode, payDate, previous), kind: "tax", auto: true },
    { label: `National Insurance (category ${d.niCategory})`, amount: employeeNi(gross, d.niCategory), kind: "ni", auto: true },
  ];
  if (pension) deductions.push({ label: `Pension (${d.pensionEmployeePct}%)`, amount: pension, kind: "pension", auto: true });
  const loan = RATES.studentLoans[d.studentLoan];
  if (loan) {
    const amount = Math.max(0, Math.floor((gross - loan.threshold / 12) * loan.rate));
    deductions.push({ label: `Student loan (${loan.label})`, amount, kind: "studentLoan", auto: true });
  }
  const employer = [{ label: "Employer National Insurance", amount: employerNi(gross) }];
  if (d.pensionEmployerPct) employer.push({ label: `Employer pension (${d.pensionEmployerPct}%)`, amount: money((gross * d.pensionEmployerPct) / 100) });
  return { deductions, employer, details: d };
}

function approvedHours(personId, period) {
  const { start, end } = periodBounds(period);
  let hours = 0;
  for (let w = rotas.weekStart(start); w <= end; w = rotas.addDays(w, 7)) {
    const sheet = rotas.findSheet(personId, w);
    if (!sheet || sheet.status !== "approved") continue;
    for (const day of sheet.days) if (day.date >= start && day.date <= end) hours += rotas.hoursOf(day.start, day.end, day.breakMins);
  }
  return Math.round(hours * 100) / 100;
}

function standardPayments(personId, period) {
  const d = payDetails(personId);
  if (d.payType === "hourly") {
    const hours = approvedHours(personId, period);
    return [{ label: `Basic pay (${hours} hrs at £${d.hourlyRate.toFixed(2)})`, amount: money(hours * d.hourlyRate) }];
  }
  return [{ label: "Basic salary", amount: d.monthlySalary }];
}

// Suggested payslip for a person and month (used by the editor).
function estimate(personId, period, payDate) {
  const person = store.getPerson(personId);
  if (!person) throw new store.ValidationError("Choose an employee.");
  const payments = standardPayments(personId, period);
  const date = payDate || periodBounds(period).end;
  return { payments, ...calculate(personId, payments, date, null) };
}

// What a month's payroll would cost at everyone's current pay, for the funds forecast.
function forecastMonthlyCost() {
  let total = 0;
  const period = new Date().toISOString().slice(0, 7);
  for (const p of store.employees()) {
    const payments = standardPayments(p.id, period);
    const gross = sum(payments);
    const c = calculate(p.id, payments, periodBounds(period).end, null);
    total += gross + sum(c.employer);
  }
  return money(total);
}

// ---------- Payslips ----------

function cleanLines(list) {
  return (Array.isArray(list) ? list : []).slice(0, 30).map((l) => {
    const label = str(l && l.label, 80);
    const amount = Number(l && l.amount);
    if (!label) return null;
    if (!(amount >= -1000000 && amount <= 10000000)) throw new store.ValidationError(`Enter a valid amount for “${label}”.`);
    return { label, amount: money(amount) };
  }).filter(Boolean);
}

// Payments and any extra deductions come from HR; tax, NI, pension and student loan are worked out.
function applyLines(slip, input) {
  slip.payments = cleanLines(input.payments);
  const extra = cleanLines((Array.isArray(input.deductions) ? input.deductions : []).filter((l) => l && !l.auto && !AUTO_KINDS.includes(l.kind)))
    .map((l) => ({ ...l, kind: "other" }));
  const calc = calculate(slip.personId, slip.payments, slip.payDate, slip.id);
  slip.deductions = calc.deductions.concat(extra);
  slip.employerItems = calc.employer;
  slip.taxCode = calc.details.taxCode;
  slip.niCategory = calc.details.niCategory;
  slip.employeeNumber = calc.details.employeeNumber;
  slip.niNumber = calc.details.niNumber;
}

// The cost to the company: total pay plus employer contributions, in pence.
function costPence(slip) {
  return funds.pence(sum(slip.payments) + sum(slip.employerItems));
}

function createDraft(personId, input, by, opts) {
  if (!(opts && opts.deferCharge)) assertCanRun();
  const person = store.getPerson(personId);
  if (!person || person.system) throw new store.ValidationError("Choose an employee.");
  const period = validPeriod(input.period);
  // HR can deliberately make an additional payslip for a month that already has one.
  const existing = db.data.payslips.some((s) => s.personId === personId && s.period === period);
  if (existing && !input.override) {
    throw new store.ValidationError(`${person.displayName} already has a payslip for ${periodLabel(period)}. Tick “Make an additional payslip anyway” to make another one.`);
  }
  const now = new Date().toISOString();
  const slip = {
    id: newId(),
    personId,
    period,
    payDate: validDay(input.payDate || periodBounds(period).end, "pay date"),
    employer: EMPLOYER,
    note: str(input.note, 500),
    status: "draft",
    createdBy: by.id,
    createdAt: now,
    updatedAt: now,
    issuedAt: null,
    issuedBy: null,
    additional: !!existing,
  };
  applyLines(slip, { payments: input.payments || standardPayments(personId, period), deductions: input.deductions });
  slip.charged = costPence(slip);
  db.data.payslips.push(slip);
  db.save();
  if (!(opts && opts.deferCharge)) funds.chargePayroll(slip.charged, `Payroll – ${person.displayName}, ${periodLabel(period)}`, by);
  return slip;
}

function updateDraft(slip, input, by) {
  if (slip.status !== "draft") throw new store.ValidationError("Issued payslips can't be edited. Withdraw it first.");
  slip.payDate = validDay(input.payDate || slip.payDate, "pay date");
  slip.employer = EMPLOYER;
  slip.note = str(input.note, 500);
  applyLines(slip, input);
  if (!slip.payments.length) throw new store.ValidationError("Add at least one payment.");
  slip.updatedAt = new Date().toISOString();
  const cost = costPence(slip);
  const diff = cost - (slip.charged || 0);
  slip.charged = cost;
  db.save();
  const p = store.getPerson(slip.personId);
  if (diff) funds.chargePayroll(diff, `Payslip changed – ${p ? p.displayName : "former staff"}, ${periodLabel(slip.period)}`, by);
  return slip;
}

function setIssued(slip, issued, by) {
  if (issued && !slip.payments.length) throw new store.ValidationError("Add at least one payment before issuing.");
  slip.status = issued ? "issued" : "draft";
  slip.issuedAt = issued ? new Date().toISOString() : null;
  slip.issuedBy = issued ? by.id : null;
  db.save();
}

function getPayslip(id) {
  return db.data.payslips.find((s) => s.id === id) || null;
}

function deletePayslip(slip, by) {
  db.data.payslips = db.data.payslips.filter((s) => s.id !== slip.id);
  db.save();
  const p = store.getPerson(slip.personId);
  if (slip.charged) funds.chargePayroll(-slip.charged, `Payslip deleted – ${p ? p.displayName : "former staff"}, ${periodLabel(slip.period)}`, by);
}

function totals(slip) {
  const gross = sum(slip.payments);
  const deductions = sum(slip.deductions);
  const byKind = (k) => sum(slip.deductions.filter((l) => l.kind === k));
  return { gross, deductions, net: money(gross - deductions), tax: byKind("tax"), ni: byKind("ni"), pension: byKind("pension"), employer: sum(slip.employerItems), cost: money(gross + sum(slip.employerItems)) };
}

// Year-to-date totals: issued payslips in the same tax year, up to and including this one.
function yearToDate(slip) {
  const from = taxYearStart(slip.payDate);
  const list = db.data.payslips.filter((s) => s.personId === slip.personId && s.payDate >= from && s.payDate <= slip.payDate && (s.status === "issued" || s.id === slip.id));
  const ytd = { gross: 0, tax: 0, ni: 0, pension: 0, net: 0 };
  for (const s of list) {
    const t = totals(s);
    for (const k of Object.keys(ytd)) ytd[k] = money(ytd[k] + t[k]);
  }
  return { ...ytd, from, taxMonth: taxMonth(slip.payDate) };
}

function summaryView(slip) {
  const p = store.getPerson(slip.personId);
  const t = totals(slip);
  return {
    id: slip.id,
    personId: slip.personId,
    person: p ? { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl } : { displayName: "Former staff" },
    period: slip.period,
    periodLabel: periodLabel(slip.period),
    payDate: slip.payDate,
    employer: slip.employer,
    status: slip.status,
    additional: !!slip.additional,
    gross: t.gross,
    net: t.net,
    cost: t.cost,
    issuedAt: slip.issuedAt,
  };
}

function fullView(slip) {
  const p = store.getPerson(slip.personId);
  return {
    ...summaryView(slip),
    employeeName: p ? `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.displayName : "Former staff",
    jobTitle: p ? p.jobTitle : "",
    employeeNumber: slip.employeeNumber,
    niNumber: slip.niNumber,
    taxCode: slip.taxCode,
    niCategory: slip.niCategory,
    periodStart: periodBounds(slip.period).start,
    periodEnd: periodBounds(slip.period).end,
    payments: slip.payments,
    deductions: slip.deductions,
    employerItems: slip.employerItems,
    note: slip.note,
    totals: totals(slip),
    ytd: yearToDate(slip),
  };
}

function mine(person) {
  return db.data.payslips.filter((s) => s.personId === person.id && s.status === "issued")
    .sort((a, b) => b.payDate.localeCompare(a.payDate)).map(summaryView);
}

function forPeriod(period) {
  return db.data.payslips.filter((s) => s.period === period).map(summaryView)
    .sort((a, b) => a.person.displayName.localeCompare(b.person.displayName));
}

function peopleList() {
  return store.employees().map((p) => {
    const d = payDetails(p.id);
    return {
      id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, company: p.company,
      avatarUrl: store.publicView(p).avatarUrl,
      payType: d.payType, monthlySalary: d.monthlySalary, hourlyRate: d.hourlyRate, isStandard: d.isStandard,
      pensionEmployerPct: d.pensionEmployerPct,
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function removePerson(personId) {
  // Payslips are kept (they're payroll records); only stored pay details go.
  if (db.data.payDetails[personId]) {
    delete db.data.payDetails[personId];
    db.save();
  }
}

module.exports = {
  MANAGE, RATES, EMPLOYER, STANDARD_MONTHLY_SALARY, init, payDetails, savePayDetails, estimate, calculate, createDraft,
  updateDraft, setIssued, getPayslip, deletePayslip, fullView, summaryView, mine, forPeriod, peopleList, periodLabel,
  removePerson, forecastMonthlyCost, payeTax, employeeNi, taxMonth, assertCanRun,
};
