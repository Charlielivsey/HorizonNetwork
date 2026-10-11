// Payslips and payroll. Only people with "payroll.manage" (the Human Resources role) can see pay
// details, generate payslips and issue them. Employees only ever see their own issued payslips.
//
// Generating a payslip fills in an *estimate* of PAYE income tax, National Insurance, pension and
// student loan from the person's pay details, using the 2025/26 rates below (rest of UK, monthly,
// non-cumulative). HR reviews every line and can change any figure before issuing it.
// Stored in DATA_DIR/payslips.json.

const crypto = require("crypto");
const store = require("./store");
const rotas = require("./rotas");
const datafile = require("./datafile");

const MANAGE = "payroll.manage";

const RATES = {
  label: "2025/26",
  personalAllowance: 12570,
  basicBand: 37700,
  higherLimit: 125140,
  basicRate: 0.2,
  higherRate: 0.4,
  additionalRate: 0.45,
  niPrimaryThreshold: 12570,
  niUpperEarningsLimit: 50270,
  niMainRate: 0.08,
  niUpperRate: 0.02,
  employerNiThreshold: 5000,
  employerNiRate: 0.15,
  // HMRC's published monthly thresholds (rounded), used for monthly payslips.
  monthly: { niPrimaryThreshold: 1048, niUpperEarningsLimit: 4189, employerNiThreshold: 417 },
  studentLoans: {
    plan1: { label: "Plan 1", threshold: 26065, rate: 0.09 },
    plan2: { label: "Plan 2", threshold: 28470, rate: 0.09 },
    plan4: { label: "Plan 4", threshold: 32745, rate: 0.09 },
    plan5: { label: "Plan 5", threshold: 25000, rate: 0.09 },
    postgrad: { label: "Postgraduate loan", threshold: 21000, rate: 0.06 },
  },
};

const LEGAL_NAMES = {
  "HN Group": "HN Group Limited",
  "Horizon Network": "Horizon Network Limited",
  "Horizon Advertising": "Horizon Advertising Limited",
};

const DEDUCTION_KINDS = ["tax", "ni", "pension", "studentLoan", "other"];

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "payslips.json", () => ({ payDetails: {}, payslips: [] }));
}

const newId = () => crypto.randomBytes(8).toString("hex");
const money = (n) => Math.round(Number(n) * 100) / 100;
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

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

// UK tax years run from 6 April.
function taxYearStart(date) {
  const y = Number(date.slice(0, 4));
  return date >= `${y}-04-06` ? `${y}-04-06` : `${y - 1}-04-06`;
}

// ---------- Pay details ----------

const PAY_DEFAULTS = {
  employeeNumber: "", niNumber: "", taxCode: "1257L", niCategory: "A", payType: "salary",
  annualSalary: 0, hourlyRate: 0, pensionEmployeePct: 5, pensionEmployerPct: 3, studentLoan: "", company: "",
};

function payDetails(personId) {
  return { ...PAY_DEFAULTS, ...(db.data.payDetails[personId] || {}) };
}

function hasPayDetails(personId) {
  const d = db.data.payDetails[personId];
  return !!d && (d.payType === "hourly" ? d.hourlyRate > 0 : d.annualSalary > 0);
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
  const company = input.company && store.COMPANIES.includes(input.company) ? input.company : "";
  db.data.payDetails[personId] = {
    employeeNumber: str(input.employeeNumber, 20),
    niNumber: ni,
    taxCode,
    niCategory: /^[A-Z]$/.test(str(input.niCategory, 1).toUpperCase()) ? str(input.niCategory, 1).toUpperCase() : "A",
    payType: input.payType === "hourly" ? "hourly" : "salary",
    annualSalary: num(input.annualSalary, "annual salary", 10000000),
    hourlyRate: num(input.hourlyRate, "hourly rate", 10000),
    pensionEmployeePct: num(input.pensionEmployeePct, "employee pension %", 100),
    pensionEmployerPct: num(input.pensionEmployerPct, "employer pension %", 100),
    studentLoan: RATES.studentLoans[input.studentLoan] ? input.studentLoan : "",
    company,
  };
  db.save();
  return payDetails(personId);
}

// ---------- Estimates ----------

// Monthly income tax for a tax code, on a non-cumulative (month 1) basis.
function monthlyTax(pay, taxCodeRaw) {
  const code = String(taxCodeRaw || "1257L").toUpperCase().replace(/(W1|M1|X)$/, "").replace(/^[SC]/, "");
  const r = RATES;
  if (code === "NT") return 0;
  if (code === "BR") return money(pay * r.basicRate);
  if (code === "D0") return money(pay * r.higherRate);
  if (code === "D1" || code === "D2") return money(pay * r.additionalRate);
  let allowance = 0;
  let m;
  if ((m = /^(\d+)[LMNT]$/.exec(code))) allowance = Number(m[1]) * 10 + 9;
  else if ((m = /^K(\d+)$/.exec(code))) allowance = -(Number(m[1]) * 10);
  let taxable = Math.max(0, pay - allowance / 12);
  const basic = r.basicBand / 12;
  const higher = (r.higherLimit - r.personalAllowance) / 12;
  let tax = Math.min(taxable, basic) * r.basicRate;
  if (taxable > basic) tax += (Math.min(taxable, higher) - basic) * r.higherRate;
  if (taxable > higher) tax += (taxable - higher) * r.additionalRate;
  return money(Math.floor(tax * 100) / 100);
}

function monthlyNi(pay, category) {
  const r = RATES;
  const cat = String(category || "A").toUpperCase();
  if (cat === "C" || cat === "X") return 0;
  const pt = r.monthly.niPrimaryThreshold;
  const uel = r.monthly.niUpperEarningsLimit;
  const main = cat === "J" || cat === "Z" || cat === "L" ? r.niUpperRate : r.niMainRate;
  let ni = 0;
  if (pay > pt) ni += (Math.min(pay, uel) - pt) * main;
  if (pay > uel) ni += (pay - uel) * r.niUpperRate;
  return money(ni);
}

function employerNi(pay) {
  const st = RATES.monthly.employerNiThreshold;
  return pay > st ? money((pay - st) * RATES.employerNiRate) : 0;
}

function approvedHours(personId, period) {
  const { start, end } = periodBounds(period);
  let hours = 0;
  // Hours from approved timesheets, counting only the days that fall in this month.
  for (let w = rotas.weekStart(start); w <= end; w = rotas.addDays(w, 7)) {
    const sheet = rotas.findSheet(personId, w);
    if (!sheet || sheet.status !== "approved") continue;
    for (const d of sheet.days) if (d.date >= start && d.date <= end) hours += rotas.hoursOf(d.start, d.end, d.breakMins);
  }
  return Math.round(hours * 100) / 100;
}

// Suggested payslip lines for a person and month.
function estimate(personId, period) {
  const person = store.getPerson(personId);
  if (!person) throw new store.ValidationError("Choose an employee.");
  const d = payDetails(personId);
  const payments = [];
  if (d.payType === "hourly") {
    const hours = approvedHours(personId, period);
    payments.push({ label: `Basic pay (${hours} hrs × £${d.hourlyRate.toFixed(2)})`, amount: money(hours * d.hourlyRate) });
  } else {
    payments.push({ label: "Basic salary", amount: money(d.annualSalary / 12) });
  }
  const gross = payments.reduce((n, p) => n + p.amount, 0);
  const pension = money((gross * d.pensionEmployeePct) / 100);
  // Pension is taken before tax (a "net pay arrangement").
  const deductions = [
    { label: `Income tax (PAYE, ${d.taxCode})`, amount: monthlyTax(gross - pension, d.taxCode), kind: "tax" },
    { label: `National Insurance (${d.niCategory})`, amount: monthlyNi(gross, d.niCategory), kind: "ni" },
  ];
  if (pension) deductions.push({ label: `Pension (${d.pensionEmployeePct}%)`, amount: pension, kind: "pension" });
  const loan = RATES.studentLoans[d.studentLoan];
  if (loan) {
    const amount = Math.max(0, Math.floor((gross - loan.threshold / 12) * loan.rate));
    if (amount) deductions.push({ label: `Student loan (${loan.label})`, amount, kind: "studentLoan" });
  }
  const employer = [{ label: "Employer National Insurance", amount: employerNi(gross) }];
  if (d.pensionEmployerPct) employer.push({ label: `Employer pension (${d.pensionEmployerPct}%)`, amount: money((gross * d.pensionEmployerPct) / 100) });
  return { payments, deductions, employer, details: d, missingDetails: !hasPayDetails(personId) };
}

// ---------- Payslips ----------

function cleanLines(list, withKind) {
  return (Array.isArray(list) ? list : []).slice(0, 30).map((l) => {
    const label = str(l && l.label, 80);
    const amount = Number(l && l.amount);
    if (!label) return null;
    if (!(amount >= -1000000 && amount <= 10000000)) throw new store.ValidationError(`Enter a valid amount for “${label}”.`);
    const line = { label, amount: money(amount) };
    if (withKind) line.kind = DEDUCTION_KINDS.includes(l.kind) ? l.kind : "other";
    return line;
  }).filter(Boolean);
}

function employerFor(personId, details) {
  const p = store.getPerson(personId);
  const company = details.company || (p ? p.company : "HN Group");
  return LEGAL_NAMES[company] || company;
}

function createDraft(personId, input, by) {
  const person = store.getPerson(personId);
  if (!person || person.system) throw new store.ValidationError("Choose an employee.");
  const period = validPeriod(input.period);
  if (db.data.payslips.some((s) => s.personId === personId && s.period === period)) {
    throw new store.ValidationError(`${person.displayName} already has a payslip for ${periodLabel(period)}.`);
  }
  const d = payDetails(personId);
  const est = input.payments ? null : estimate(personId, period);
  const now = new Date().toISOString();
  const slip = {
    id: newId(),
    personId,
    period,
    payDate: validDay(input.payDate || periodBounds(period).end, "pay date"),
    employer: employerFor(personId, d),
    employeeNumber: d.employeeNumber,
    niNumber: d.niNumber,
    taxCode: d.taxCode,
    niCategory: d.niCategory,
    payments: est ? est.payments : cleanLines(input.payments),
    deductions: est ? est.deductions : cleanLines(input.deductions, true),
    employerItems: est ? est.employer : cleanLines(input.employerItems),
    note: str(input.note, 500),
    status: "draft",
    createdBy: by.id,
    createdAt: now,
    updatedAt: now,
    issuedAt: null,
    issuedBy: null,
  };
  db.data.payslips.push(slip);
  db.save();
  return slip;
}

function updateDraft(slip, input) {
  if (slip.status !== "draft") throw new store.ValidationError("Issued payslips can't be edited. Withdraw it first.");
  Object.assign(slip, {
    payDate: validDay(input.payDate || slip.payDate, "pay date"),
    employer: str(input.employer, 100) || slip.employer,
    employeeNumber: str(input.employeeNumber, 20),
    niNumber: str(input.niNumber, 13).toUpperCase(),
    taxCode: str(input.taxCode, 12).toUpperCase() || slip.taxCode,
    niCategory: str(input.niCategory, 1).toUpperCase() || slip.niCategory,
    payments: cleanLines(input.payments),
    deductions: cleanLines(input.deductions, true),
    employerItems: cleanLines(input.employerItems),
    note: str(input.note, 500),
    updatedAt: new Date().toISOString(),
  });
  if (!slip.payments.length) throw new store.ValidationError("Add at least one payment.");
  db.save();
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

function deletePayslip(slip) {
  db.data.payslips = db.data.payslips.filter((s) => s.id !== slip.id);
  db.save();
}

function totals(slip) {
  const sum = (list) => money(list.reduce((n, l) => n + l.amount, 0));
  const gross = sum(slip.payments);
  const deductions = sum(slip.deductions);
  const byKind = (k) => money(slip.deductions.filter((l) => l.kind === k).reduce((n, l) => n + l.amount, 0));
  return { gross, deductions, net: money(gross - deductions), tax: byKind("tax"), ni: byKind("ni"), pension: byKind("pension"), employer: sum(slip.employerItems) };
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
  return { ...ytd, from };
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
    gross: t.gross,
    net: t.net,
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
      hasDetails: hasPayDetails(p.id), payType: d.payType,
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
  MANAGE, RATES, init, payDetails, savePayDetails, estimate, createDraft, updateDraft, setIssued,
  getPayslip, deletePayslip, fullView, summaryView, mine, forPeriod, peopleList, periodLabel, removePerson,
  monthlyTax, monthlyNi,
};
