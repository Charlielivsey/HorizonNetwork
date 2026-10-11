// API routes for the newer modules (finance extras, HR extras, people and IT). server.js calls
// handle() before its own routes; it returns true when it dealt with the request. `ctx` carries
// the server's helpers (sending JSON, reading bodies, the audit log and so on).

const fs = require("fs");
const store = require("./store");
const funds = require("./funds");
const payslips = require("./payslips");
const expenses = require("./expenses");
const invoices = require("./invoices");

let ctx;
function init(helpers) {
  ctx = helpers;
}

function sendFileDownload(res, file, download) {
  const encoded = encodeURIComponent(file.name);
  return fs.readFile(file.path, (err, content) => {
    if (err) return ctx.sendJson(res, 404, { error: "The file is missing." });
    res.writeHead(200, {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Content-Type": file.mime,
      "Content-Length": content.length,
      "Content-Disposition": `${download || !file.inline ? "attachment" : "inline"}; filename="${encoded}"; filename*=UTF-8''${encoded}`,
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, no-store",
    });
    res.end(content);
  });
}

const query = (req) => new URL(req.url, "http://localhost").searchParams;

async function handle(req, res, pathname, session) {
  const method = req.method;
  const me = session.person;
  const { sendJson, httpError, readJsonBody, readRawBody, headerJson, logEvent, meResponse, notify } = ctx;
  let m;
  const can = (perm) => store.can(me, perm);
  const needPay = () => { if (!can(payslips.MANAGE)) throw httpError(403, "Only people who run payroll & finance can do that."); };

  // ----- Expense claims -----
  if (pathname.startsWith("/api/expenses")) {
    if (method === "GET" && pathname === "/api/expenses") {
      return sendJson(res, 200, { ...expenses.forViewer(me), categories: funds.categories().filter((c) => c !== "Payroll"), canPay: can(payslips.MANAGE), statuses: expenses.STATUSES }), true;
    }
    if (method === "POST" && pathname === "/api/expenses") {
      const meta = headerJson(req, "x-claim");
      const buffer = await readRawBody(req, 10 * 1024 * 1024);
      const c = expenses.submit(me, meta, buffer);
      logEvent(req, session, "expense-claimed", { detail: `£${c.amount.toFixed(2)} – ${c.description}` });
      const person = store.getPerson(me.supervisorId);
      if (person && notify) notify([person.id], { type: "expense", title: `${me.displayName} claimed £${c.amount.toFixed(2)} in expenses`, body: c.description, link: "/expenses" });
      return sendJson(res, 201, { ok: true, user: meResponse(session) }), true;
    }
    if ((m = /^\/api\/expenses\/([a-f0-9]{16})\/(receipt|approve|reject|pay|cancel)$/.exec(pathname))) {
      const c = expenses.get(m[1]);
      if (!c || !expenses.canSee(me, c)) throw httpError(404, "Claim not found.");
      if (method === "GET" && m[2] === "receipt") {
        const file = expenses.receiptFile(c);
        if (!file) throw httpError(404, "There's no receipt.");
        return sendFileDownload(res, file, query(req).has("download")), true;
      }
      if (method !== "POST") throw httpError(405, "Use POST.");
      const body = await readJsonBody(req);
      const who = (store.getPerson(c.personId) || {}).displayName;
      if (m[2] === "approve" || m[2] === "reject") {
        expenses.decide(c, m[2] === "approve", me, body.note);
        logEvent(req, session, m[2] === "approve" ? "expense-approved" : "expense-rejected", { target: who, detail: `£${c.amount.toFixed(2)} – ${c.description}` });
        if (notify) notify([c.personId], { type: "expense", title: `Your expense claim was ${m[2] === "approve" ? "approved" : "rejected"}`, body: `£${c.amount.toFixed(2)} – ${c.description}${body.note ? ` · ${body.note}` : ""}`, link: "/expenses" });
      } else if (m[2] === "pay") {
        needPay();
        expenses.pay(c, body.method === "payslip" ? "payslip" : "direct", me);
        logEvent(req, session, "expense-paid", { target: who, detail: `£${c.amount.toFixed(2)} ${body.method === "payslip" ? "with next payslip" : "from the main balance"}` });
        if (notify) notify([c.personId], { type: "expense", title: body.method === "payslip" ? "Your expenses will be repaid with your next payslip" : "Your expenses have been repaid", body: `£${c.amount.toFixed(2)} – ${c.description}`, link: "/expenses" });
      } else {
        expenses.cancel(c, me);
        logEvent(req, session, "expense-withdrawn", { target: who, detail: `£${c.amount.toFixed(2)} – ${c.description}` });
      }
      return sendJson(res, 200, { ok: true, user: meResponse(session) }), true;
    }
  }

  // ----- Funds: categories, budgets and charts -----
  if (pathname === "/api/funds/insights" && method === "GET") {
    needPay();
    const period = /^\d{4}-\d{2}$/.test(query(req).get("period") || "") ? query(req).get("period") : new Date().toISOString().slice(0, 7);
    return sendJson(res, 200, { series: funds.monthlySeries(12), budgets: funds.budgets(period), categories: funds.categories(), period }), true;
  }
  if (pathname === "/api/funds/categories" && method === "POST") {
    needPay();
    const body = await readJsonBody(req);
    if (body.remove) funds.removeCategory(body.remove);
    else funds.addCategory(body.add);
    logEvent(req, session, "funds-category-changed", { detail: body.remove ? `Removed ${body.remove}` : `Added ${body.add}` });
    return sendJson(res, 200, { ok: true }), true;
  }
  if (pathname === "/api/funds/budgets" && method === "POST") {
    needPay();
    const body = await readJsonBody(req);
    funds.setBudget(body.category, body.amount);
    logEvent(req, session, "budget-set", { target: body.category, detail: body.amount ? `£${body.amount} a month` : "Removed" });
    return sendJson(res, 200, { ok: true }), true;
  }

  // ----- Payroll: pay changes, year end and P60s -----
  if ((m = /^\/api\/payroll\/pay-changes\/([a-f0-9]{16})(?:\/([a-f0-9]{16})\/delete)?$/.exec(pathname))) {
    needPay();
    const person = store.getPerson(m[1]);
    if (!person || person.system) throw httpError(404, "Employee not found.");
    if (method === "GET" && !m[2]) return sendJson(res, 200, { changes: payslips.payChangesView(person.id) }), true;
    if (method === "POST" && m[2]) {
      payslips.deletePayChange(person.id, m[2]);
      logEvent(req, session, "pay-change-deleted", { target: person.displayName });
      return sendJson(res, 200, { changes: payslips.payChangesView(person.id) }), true;
    }
    if (method === "POST") {
      const c = payslips.addPayChange(person.id, await readJsonBody(req), me);
      logEvent(req, session, "pay-change-scheduled", { target: person.displayName, detail: `${c.payType === "hourly" ? `£${c.hourlyRate}/hr` : `£${c.monthlySalary}/month`} from ${payslips.periodLabel(c.effective)}` });
      return sendJson(res, 200, { changes: payslips.payChangesView(person.id) }), true;
    }
  }
  if (pathname === "/api/payroll/upcoming-changes" && method === "GET") {
    needPay();
    return sendJson(res, 200, { changes: payslips.upcomingPayChanges() }), true;
  }
  if (pathname === "/api/payroll/year-end" && method === "GET") {
    needPay();
    const years = payslips.taxYears();
    const start = query(req).get("start") || years[0].start;
    return sendJson(res, 200, { years, report: payslips.yearEnd(start) }), true;
  }
  if (pathname === "/api/payroll/year-end.csv" && method === "GET") {
    needPay();
    const start = query(req).get("start") || "";
    const report = payslips.yearEnd(start);
    const csv = payslips.yearCsv(start);
    logEvent(req, session, "payroll-exported", { detail: `Tax year ${report.label}` });
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll-${report.label.replace("/", "-")}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end("﻿" + csv);
    return true;
  }
  if ((m = /^\/api\/payroll\/p60\/([a-f0-9]{16})$/.exec(pathname)) && method === "GET") {
    needPay();
    return sendJson(res, 200, { p60: payslips.p60(m[1], query(req).get("start")) }), true;
  }
  if (pathname === "/api/payslips/p60" && method === "GET") {
    if (me.system) throw httpError(404, "Not found.");
    const years = payslips.taxYears();
    const start = query(req).get("start") || years[0].start;
    return sendJson(res, 200, { years, p60: payslips.p60(me.id, start) }), true;
  }

  // ----- Invoices -----
  if (pathname.startsWith("/api/invoices")) {
    needPay();
    if (method === "GET" && pathname === "/api/invoices") {
      return sendJson(res, 200, { invoices: invoices.list(), summary: invoices.summary(), settings: invoices.settings(), statuses: invoices.STATUSES, vatRates: invoices.VAT_RATES, companies: store.COMPANIES }), true;
    }
    if (method === "POST" && pathname === "/api/invoices") {
      const inv = invoices.create(await readJsonBody(req), me);
      logEvent(req, session, "invoice-created", { target: inv.number, detail: `${inv.customer.name}, £${invoices.view(inv).total.toFixed(2)}` });
      return sendJson(res, 201, { invoice: invoices.view(inv) }), true;
    }
    if (method === "POST" && pathname === "/api/invoices/settings") {
      invoices.saveSettings(await readJsonBody(req));
      logEvent(req, session, "invoice-settings-changed");
      return sendJson(res, 200, { settings: invoices.settings() }), true;
    }
    if ((m = /^\/api\/invoices\/([a-f0-9]{16})(?:\/(sent|paid|void|delete))?$/.exec(pathname)) && method === "POST") {
      const inv = invoices.get(m[1]);
      if (!inv) throw httpError(404, "Invoice not found.");
      const body = await readJsonBody(req);
      if (!m[2]) {
        invoices.update(inv, body);
        logEvent(req, session, "invoice-updated", { target: inv.number });
      } else if (m[2] === "delete") {
        invoices.remove(inv);
        logEvent(req, session, "invoice-deleted", { target: inv.number });
        return sendJson(res, 200, { ok: true }), true;
      } else {
        invoices.setStatus(inv, m[2], me, body);
        logEvent(req, session, "invoice-" + m[2], { target: inv.number, detail: `${inv.customer.name}, £${invoices.view(inv).total.toFixed(2)}` });
      }
      return sendJson(res, 200, { invoice: invoices.view(inv), user: meResponse(session) }), true;
    }
  }

  return false;
}

module.exports = { init, handle };
