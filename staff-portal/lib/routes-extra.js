// API routes for the newer modules (finance extras, HR extras, people and IT). server.js calls
// handle() before its own routes; it returns true when it dealt with the request. `ctx` carries
// the server's helpers (sending JSON, reading bodies, the audit log and so on).

const fs = require("fs");
const store = require("./store");
const funds = require("./funds");
const payslips = require("./payslips");
const expenses = require("./expenses");
const invoices = require("./invoices");
const leave = require("./leave");
const training = require("./training");
const cases = require("./cases");
const recruitment = require("./recruitment");
const notifications = require("./notifications");
const kudos = require("./kudos");
const ideas = require("./ideas");
const workplace = require("./workplace");
const calendar = require("./calendar");
const helpdesk = require("./helpdesk");
const uptime = require("./uptime");
const onboarding = require("./onboarding");
const bills = require("./bills");
const objectives = require("./objectives");
const feedback = require("./feedback");
const pulse = require("./pulse");
const exitinterviews = require("./exitinterviews");
const flexible = require("./flexible");
const chat = require("./chat");
const qa = require("./qa");
const wiki = require("./wiki");
const mentoring = require("./mentoring");
const oncall = require("./oncall");
const security = require("./security");
const enquiries = require("./enquiries");
const storageAccess = require("./storage-access");
const retention = require("./retention");
const rotas = require("./rotas");
const stafffiles = require("./stafffiles");
const reviews = require("./reviews");

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
  if (pathname.startsWith("/api/me/") && (await handleMe(req, res, pathname, session))) return true;
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

  // ----- Team chat -----
  if (pathname.startsWith("/api/chat")) {
    if (me.system) throw httpError(403, "The admin account can't use chat.");
    if (method === "GET" && pathname === "/api/chat") {
      return sendJson(res, 200, { channels: chat.channels(me, query(req).get("open")), people: store.employees().filter((p) => p.id !== me.id).map((p) => ({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl })) }), true;
    }
    if (method === "POST" && pathname === "/api/chat/dm") {
      const { personId } = await readJsonBody(req);
      const other = store.getPerson(personId);
      if (!other || other.system || other.id === me.id) throw httpError(400, "Choose someone to message.");
      return sendJson(res, 200, { channel: chat.dmId(me.id, other.id) }), true;
    }
    if ((m = /^\/api\/chat\/c\/([a-z0-9\-]+)(?:\/([a-f0-9]{16})\/delete)?$/.exec(pathname))) {
      const channel = m[1];
      if (!chat.canAccess(me, channel)) throw httpError(404, "Conversation not found.");
      if (method === "GET") {
        const after = query(req).get("after") || "";
        const msgs = chat.messages(me, channel, after);
        chat.markRead(me, channel);
        return sendJson(res, 200, { messages: msgs, unreadTotal: chat.unreadTotal(me) }), true;
      }
      if (method === "POST" && m[2]) { chat.remove(me, channel, m[2]); return sendJson(res, 200, { ok: true }), true; }
      if (method === "POST") {
        const { text } = await readJsonBody(req);
        const msg = chat.post(me, channel, text);
        if (channel.startsWith("dm-") && notify) {
          const other = channel.slice(3).split("-").find((id) => id !== me.id);
          notify([other], { type: "chat", title: `New message from ${me.displayName}`, body: msg.text.slice(0, 120), link: "/chat?c=" + channel }, me);
        }
        return sendJson(res, 201, { ok: true }), true;
      }
    }
  }

  // ----- Website enquiries (from the contact form on hngroup.org.uk) -----
  if (pathname.startsWith("/api/enquiries")) {
    if (!can(enquiries.MANAGE)) throw httpError(403, "You don't have access to website enquiries.");
    if (method === "GET" && pathname === "/api/enquiries") {
      return sendJson(res, 200, { enquiries: enquiries.list(), topics: enquiries.TOPICS, statuses: enquiries.STATUSES, handlers: store.employees().filter((p) => store.can(p, enquiries.MANAGE)).map((p) => ({ id: p.id, displayName: p.displayName })) }), true;
    }
    if ((m = /^\/api\/enquiries\/([a-f0-9]{16})(\/delete)?$/.exec(pathname)) && method === "POST") {
      const e = enquiries.get(m[1]);
      if (!e) throw httpError(404, "Enquiry not found.");
      if (m[2]) {
        enquiries.remove(e);
        logEvent(req, session, "enquiry-deleted", { target: e.name });
        return sendJson(res, 200, { ok: true }), true;
      }
      const body = await readJsonBody(req);
      const was = e.assigneeId;
      enquiries.update(e, body, me);
      if (e.assigneeId && e.assigneeId !== was && e.assigneeId !== me.id && notify) notify([e.assigneeId], { type: "info", title: `${me.displayName} passed you a website enquiry from ${e.name}`, link: "/enquiries" }, me);
      logEvent(req, session, "enquiry-updated", { target: e.name, detail: enquiries.STATUSES[e.status] });
      return sendJson(res, 200, { enquiry: enquiries.view(e) }), true;
    }
  }

  // ----- Document storage on docs.hngroup.org.uk: who can open whose private storage -----
  if (pathname.startsWith("/api/document-storage")) {
    // Everyone sees the storage they've been given; managing access needs the permission.
    if (method === "GET" && pathname === "/api/document-storage") {
      const mine = storageAccess.forIdentity(me);
      if (!can(storageAccess.ACCESS)) return sendJson(res, 200, { manage: false, myGrants: mine.storageGrants }), true;
      return sendJson(res, 200, { manage: true, myGrants: mine.storageGrants, people: storageAccess.people(), grants: storageAccess.list() }), true;
    }
    // Someone's storage, shown on this page: their private documents (as PDFs) and files, read only. Docs records the visit.
    if ((m = /^\/api\/document-storage\/people\/([A-Za-z0-9_-]{1,64})(?:\/(documents|files)\/([0-9a-f-]{36})(\/pdf)?)?$/.exec(pathname)) && method === "GET") {
      if (!storageAccess.canOpen(me, m[1])) throw httpError(403, "You don't have access to this person's storage.");
      const listing = await storageAccess.storageOf(m[1], me);
      if (!m[2]) {
        const p = store.getPerson(m[1]);
        if (p) listing.person = { ...listing.person, name: p.displayName, jobTitle: p.jobTitle || "" };
        return sendJson(res, 200, listing), true;
      }
      const owned = (m[2] === "documents" ? listing.documents : listing.files).some((x) => x.id === m[3]);
      if (!owned || (m[2] === "documents" && !m[4])) throw httpError(404, "That isn't in their storage.");
      const r = await storageAccess.fromDocs("/api/service/" + m[2] + "/" + m[3] + (m[4] ? "/pdf" : ""), me, m[2] === "files" && new URL(req.url, "http://x").searchParams.get("download") === "1" ? { download: "1" } : {});
      res.writeHead(200, { "Content-Type": r.type, "Content-Length": r.body.length, "Content-Disposition": r.disposition, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" });
      res.end(r.body);
      return true;
    }
    if (!can(storageAccess.ACCESS)) throw httpError(403, "You don't have access to staff document storage.");
    if (method === "POST" && pathname === "/api/document-storage/grants") {
      const g = storageAccess.add(await readJsonBody(req), me);
      logEvent(req, session, "storage-access-granted", { target: g.granteeName, detail: g.ownerName + "'s storage until " + g.until.slice(0, 10) + (g.reason ? " (" + g.reason + ")" : "") });
      if (notify) notify([g.granteeId], { type: "info", title: `${me.displayName} gave you access to ${g.ownerName}'s document storage`, link: "/document-storage" }, me);
      return sendJson(res, 201, { grant: g }), true;
    }
    if ((m = /^\/api\/document-storage\/grants\/([a-f0-9]{16})\/delete$/.exec(pathname)) && method === "POST") {
      const g = storageAccess.remove(m[1]);
      logEvent(req, session, "storage-access-removed", { target: g.granteeName, detail: g.ownerName + "'s storage" });
      return sendJson(res, 200, { ok: true }), true;
    }
  }

  // ----- Q&A -----
  if (pathname.startsWith("/api/qa")) {
    if (method === "GET" && pathname === "/api/qa") return sendJson(res, 200, { questions: qa.list(me) }), true;
    if (method === "POST" && pathname === "/api/qa") {
      const q = qa.ask(me, await readJsonBody(req));
      logEvent(req, session, "question-asked", { target: q.title });
      return sendJson(res, 201, { id: q.id }), true;
    }
    if ((m = /^\/api\/qa\/([a-f0-9]{16})(?:\/(answer|vote|accept|delete)|\/answers\/([a-f0-9]{16})\/delete)?$/.exec(pathname))) {
      const q = qa.get(m[1]);
      if (!q) throw httpError(404, "Question not found.");
      if (method === "GET") return sendJson(res, 200, { question: qa.view(q, me, true) }), true;
      const body = await readJsonBody(req);
      if (m[3]) qa.removeAnswer(q, m[3], me);
      else if (m[2] === "answer") {
        qa.answer(q, me, body.body);
        if (notify) notify([q.by].concat(q.answers.map((a) => a.by)), { type: "idea", title: `${me.displayName} answered: ${q.title}`, link: "/questions?q=" + q.id }, me);
      } else if (m[2] === "vote") qa.vote(q, body.answerId, me);
      else if (m[2] === "accept") qa.accept(q, body.answerId, me);
      else if (m[2] === "delete") { qa.removeQuestion(q, me); return sendJson(res, 200, { ok: true }), true; }
      return sendJson(res, 200, { question: qa.view(q, me, true) }), true;
    }
  }

  // ----- Knowledge base -----
  if (pathname.startsWith("/api/wiki")) {
    if (method === "GET" && pathname === "/api/wiki") return sendJson(res, 200, { pages: wiki.list(), canDelete: can(wiki.MANAGE) }), true;
    if (method === "GET" && pathname === "/api/wiki/resolve") {
      const p = wiki.byTitle(query(req).get("title"));
      return sendJson(res, 200, { slug: p ? p.slug : null }), true;
    }
    if (method === "POST" && pathname === "/api/wiki") {
      if (me.system) throw httpError(403, "The admin account can't write pages.");
      const page = wiki.save(await readJsonBody(req), me, null);
      logEvent(req, session, "wiki-page-created", { target: page.title });
      return sendJson(res, 201, { slug: page.slug }), true;
    }
    if ((m = /^\/api\/wiki\/page\/([a-z0-9\-]+)(?:\/(restore|delete))?$/.exec(pathname))) {
      const page = wiki.bySlug(m[1]);
      if (!page) throw httpError(404, "That page doesn't exist.");
      if (method === "GET") return sendJson(res, 200, { page: wiki.view(page, true), canDelete: can(wiki.MANAGE) }), true;
      const body = await readJsonBody(req);
      if (m[2] === "delete") {
        if (!can(wiki.MANAGE)) throw httpError(403, "Only people who manage documents can delete pages.");
        wiki.remove(page);
        logEvent(req, session, "wiki-page-deleted", { target: page.title });
        return sendJson(res, 200, { ok: true }), true;
      }
      if (m[2] === "restore") wiki.restore(page, body.index, me);
      else wiki.save(body, me, page);
      logEvent(req, session, m[2] === "restore" ? "wiki-page-restored" : "wiki-page-edited", { target: page.title });
      return sendJson(res, 200, { slug: page.slug }), true;
    }
  }

  // ----- Mentoring -----
  if (pathname.startsWith("/api/mentoring")) {
    if (method === "GET" && pathname === "/api/mentoring") {
      return sendJson(res, 200, { ...mentoring.forViewer(me), canPair: can("staff.manage"), people: store.employees().map((p) => ({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, skills: p.skills || [] })) }), true;
    }
    if (method === "POST" && pathname === "/api/mentoring") {
      const pair = mentoring.create(await readJsonBody(req), me);
      logEvent(req, session, "mentoring-requested", { target: (store.getPerson(pair.mentorId) || {}).displayName });
      if (notify) notify(pair.status === "requested" ? [pair.mentorId] : [pair.mentorId, pair.menteeId], { type: "review", title: pair.status === "requested" ? `${me.displayName} would like you to mentor them` : "You've been paired for mentoring", link: "/mentoring" }, me);
      return sendJson(res, 201, { ok: true, user: meResponse(session) }), true;
    }
    if ((m = /^\/api\/mentoring\/([a-f0-9]{16})\/(accept|decline|meeting|note|update)$/.exec(pathname)) && method === "POST") {
      const p = mentoring.get(m[1]);
      if (!p) throw httpError(404, "Not found.");
      const body = await readJsonBody(req);
      if (m[2] === "accept" || m[2] === "decline") {
        mentoring.respond(p, m[2] === "accept", me);
        if (notify) notify([p.menteeId], { type: "review", title: `${me.displayName} ${m[2] === "accept" ? "will be your mentor" : "can't be your mentor right now"}`, link: "/mentoring" }, me);
      } else if (m[2] === "meeting") mentoring.logMeeting(p, body, me);
      else if (m[2] === "note") mentoring.addNote(p, body.text, me);
      else mentoring.update(p, body, me);
      return sendJson(res, 200, { ok: true, user: meResponse(session) }), true;
    }
  }

  // ----- On-call rotas -----
  if (pathname.startsWith("/api/oncall")) {
    if (method === "GET" && pathname === "/api/oncall") {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(query(req).get("from") || "") ? query(req).get("from") : oncall.weekStart();
      return sendJson(res, 200, { rotas: oncall.list(from, 8), from: oncall.weekStart(from), canManage: can(oncall.MANAGE), people: can(oncall.MANAGE) ? store.employees().map((p) => ({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle })) : [] }), true;
    }
    if (!can(oncall.MANAGE)) throw httpError(403, "Only IT can change on-call rotas.");
    if (method === "POST" && pathname === "/api/oncall") {
      const r = oncall.saveRota(await readJsonBody(req), null);
      logEvent(req, session, "oncall-rota-created", { target: r.name });
      return sendJson(res, 201, { ok: true }), true;
    }
    if ((m = /^\/api\/oncall\/([a-f0-9]{16})(?:\/(assign|rotate|delete))?$/.exec(pathname)) && method === "POST") {
      const r = oncall.getRota(m[1]);
      if (!r) throw httpError(404, "Rota not found.");
      const body = await readJsonBody(req);
      if (!m[2]) oncall.saveRota(body, r);
      else if (m[2] === "assign") oncall.assign(r, body.week, body.personId);
      else if (m[2] === "rotate") oncall.rotate(r, body.people, body.from, body.count);
      else oncall.deleteRota(r);
      logEvent(req, session, "oncall-rota-changed", { target: r.name, detail: m[2] || "details" });
      return sendJson(res, 200, { ok: true }), true;
    }
  }

  // ----- Work patterns (part-time and shift staff) -----
  if ((m = /^\/api\/leave\/pattern\/([a-f0-9]{16})$/.exec(pathname)) && method === "POST") {
    if (!can(leave.MANAGE)) throw httpError(403, "Only people who manage leave can change work patterns.");
    const p = store.getPerson(m[1]);
    if (!p || p.system) throw httpError(404, "Employee not found.");
    leave.setPattern(p.id, (await readJsonBody(req)).days);
    logEvent(req, session, "work-pattern-changed", { target: p.displayName, detail: leave.patternLabel(p.id) });
    return sendJson(res, 200, { summary: leave.summary(p.id, new Date().getFullYear()) }), true;
  }

  // ----- Objectives -----
  if (pathname.startsWith("/api/objectives")) {
    if (method === "GET" && pathname === "/api/objectives") {
      const q = query(req);
      const quarter = /^\d{4}-Q[1-4]$/.test(q.get("quarter") || "") ? q.get("quarter") : objectives.quarterOf();
      const personId = q.get("person") || me.id;
      const person = store.getPerson(personId);
      if (!person || (personId !== me.id && !objectives.canManage(me, person))) throw httpError(404, "Not found.");
      return sendJson(res, 200, {
        quarter, quarterLabel: objectives.quarterLabel(quarter), prev: objectives.shiftQuarter(quarter, -1), next: objectives.shiftQuarter(quarter, 1),
        person: { id: person.id, displayName: person.displayName, jobTitle: person.jobTitle }, objectives: objectives.forPerson(personId, me, quarter),
        team: objectives.team(me, quarter), statuses: objectives.STATUSES, isSelf: personId === me.id,
      }), true;
    }
    if (method === "POST" && pathname === "/api/objectives") {
      const body = await readJsonBody(req);
      const person = store.getPerson(body.personId || me.id);
      const o = objectives.save(person, body, me, null);
      logEvent(req, session, "objective-set", { target: person.displayName, detail: o.title });
      if (notify && person.id !== me.id) notify([person.id], { type: "review", title: `${me.displayName} set you a goal`, body: o.title, link: "/objectives" }, me);
      return sendJson(res, 201, { ok: true }), true;
    }
    if ((m = /^\/api\/objectives\/([a-f0-9]{16})(?:\/(progress|delete))?$/.exec(pathname)) && method === "POST") {
      const o = objectives.get(m[1]);
      const person = o && store.getPerson(o.personId);
      if (!o || !objectives.canManage(me, person)) throw httpError(404, "Goal not found.");
      const body = await readJsonBody(req);
      if (!m[2]) objectives.save(person, body, me, o);
      else if (m[2] === "progress") objectives.update(o, body, me);
      else objectives.remove(o);
      return sendJson(res, 200, { ok: true }), true;
    }
  }

  // ----- 360 feedback -----
  if (pathname.startsWith("/api/feedback")) {
    if (method === "GET" && pathname === "/api/feedback") {
      return sendJson(res, 200, { ...feedback.forViewer(me), people: store.employees().map((p) => ({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, canRequest: feedback.canRequest(me, p) })) }), true;
    }
    if (method === "POST" && pathname === "/api/feedback") {
      const body = await readJsonBody(req);
      const subject = store.getPerson(body.subjectId);
      const r = feedback.create(subject, body, me);
      logEvent(req, session, "feedback-requested", { target: subject.displayName, detail: `${r.reviewers.length} people asked` });
      if (notify) notify(r.reviewers, { type: "review", title: `Feedback wanted on ${subject.displayName}`, body: `Anonymous, by ${r.dueDate}. It only takes a few minutes.`, link: "/feedback" }, me);
      return sendJson(res, 201, { ok: true }), true;
    }
    if ((m = /^\/api\/feedback\/([a-f0-9]{16})\/(respond|close|delete)$/.exec(pathname)) && method === "POST") {
      const r = feedback.get(m[1]);
      if (!r) throw httpError(404, "Not found.");
      const body = await readJsonBody(req);
      if (m[2] === "respond") {
        feedback.respond(r, me, body.answers);
        logEvent(req, session, "feedback-given");
      } else {
        if (!(r.requestedBy === me.id || can("staff.manage"))) throw httpError(403, "You can't change that request.");
        if (m[2] === "close") feedback.close(r); else feedback.remove(r);
      }
      return sendJson(res, 200, { ok: true, user: meResponse(session) }), true;
    }
  }

  // ----- Pulse -----
  if (pathname.startsWith("/api/pulse")) {
    if (method === "GET" && pathname === "/api/pulse") return sendJson(res, 200, pulse.forViewer(me)), true;
    if (method === "POST" && pathname === "/api/pulse") {
      pulse.answer(me, await readJsonBody(req));
      return sendJson(res, 200, { ok: true, user: meResponse(session) }), true;
    }
    if (method === "POST" && pathname === "/api/pulse/question") {
      if (!pulse.canSeeResults(me)) throw httpError(403, "Only leadership can change the question.");
      const { text } = await readJsonBody(req);
      pulse.setQuestion(text);
      logEvent(req, session, "pulse-question-set", { detail: text || "Default question" });
      return sendJson(res, 200, pulse.forViewer(me)), true;
    }
  }

  // ----- Exit interviews -----
  if (pathname === "/api/exit-interview") {
    const mine = exitinterviews.forPerson(me.id);
    const leaving = onboarding.leaverChecklistOf(me.id);
    if (method === "GET") return sendJson(res, 200, { eligible: !!leaving || !!mine, submitted: mine ? mine.at : null, lastDay: leaving ? leaving.lastDay : null, questions: exitinterviews.QUESTIONS, reasons: exitinterviews.REASONS }), true;
    if (method === "POST") {
      if (!leaving) throw httpError(403, "The exit interview opens once your leaving process has started.");
      exitinterviews.submit(me, (await readJsonBody(req)).answers);
      onboarding.completeAction(me.id, "exit-interview");
      logEvent(req, session, "exit-interview-sent");
      if (notify) notify(store.employees().filter((p) => store.can(p, "staff.manage")).map((p) => p.id), { type: "review", title: `${me.displayName} sent their exit interview`, link: "/exit-interviews" }, me);
      return sendJson(res, 200, { ok: true, user: meResponse(session) }), true;
    }
  }
  if (pathname === "/api/exit-interviews" && method === "GET") {
    if (!can("staff.manage")) throw httpError(403, "Only HR can read exit interviews.");
    return sendJson(res, 200, { interviews: exitinterviews.list(), summary: exitinterviews.reasonSummary(), questions: exitinterviews.QUESTIONS, reasons: exitinterviews.REASONS }), true;
  }

  // ----- Flexible working -----
  if (pathname.startsWith("/api/flexible")) {
    if (method === "GET" && pathname === "/api/flexible") return sendJson(res, 200, flexible.forViewer(me)), true;
    if (method === "POST" && pathname === "/api/flexible") {
      const r = flexible.create(me, await readJsonBody(req));
      logEvent(req, session, "flexible-requested", { detail: flexible.TYPES[r.type] });
      const sups = [me.supervisorId].filter(Boolean);
      const to = sups.length ? sups : store.employees().filter((p) => store.can(p, "staff.manage")).map((p) => p.id);
      if (notify) notify(to, { type: "leave", title: `${me.displayName} asked for flexible working`, body: flexible.TYPES[r.type], link: "/flexible" }, me);
      return sendJson(res, 201, { ok: true }), true;
    }
    if ((m = /^\/api\/flexible\/([a-f0-9]{16})\/(decide|withdraw|comment)$/.exec(pathname)) && method === "POST") {
      const r = flexible.get(m[1]);
      if (!r || !flexible.canSee(me, r)) throw httpError(404, "Not found.");
      const body = await readJsonBody(req);
      if (m[2] === "decide") {
        flexible.decide(r, body, me);
        logEvent(req, session, "flexible-decided", { target: (store.getPerson(r.personId) || {}).displayName, detail: flexible.STATUSES[r.status] });
        if (notify) notify([r.personId], { type: "leave", title: `Your flexible working request: ${flexible.STATUSES[r.status]}`, body: r.decisionNote, link: "/flexible" }, me);
      } else if (m[2] === "withdraw") flexible.withdraw(r, me);
      else {
        flexible.comment(r, me, body.text);
        if (notify) notify([r.personId, r.decidedBy, store.getPerson(r.personId) && store.getPerson(r.personId).supervisorId].filter(Boolean), { type: "leave", title: `${me.displayName} commented on a flexible working request`, link: "/flexible" }, me);
      }
      return sendJson(res, 200, { ok: true, user: meResponse(session) }), true;
    }
  }

  // ----- Mileage: what a journey would pay -----
  if (pathname === "/api/expenses/mileage" && method === "GET") {
    const q = query(req);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get("date") || "") ? q.get("date") : new Date().toISOString().slice(0, 10);
    const miles = Math.max(0, Math.min(2000, Number(q.get("miles")) || 0));
    return sendJson(res, 200, { ...expenses.mileageAmount(me.id, date, miles), rates: expenses.MILEAGE }), true;
  }

  // ----- Payroll: approval, pay history, salary bands, bonuses and commission -----
  if (pathname.startsWith("/api/payroll/")) {
    if ((m = /^\/api\/payroll\/history\/([a-f0-9]{16})$/.exec(pathname)) && method === "GET") {
      needPay();
      return sendJson(res, 200, { ...payslips.payHistoryView(m[1]), extras: payslips.extrasView(m[1]) }), true;
    }
    if ((m = /^\/api\/payroll\/extras\/([a-f0-9]{16})(?:\/([a-f0-9]{16})\/delete)?$/.exec(pathname)) && method === "POST") {
      needPay();
      const p = store.getPerson(m[1]);
      if (!p) throw httpError(404, "Employee not found.");
      if (m[2]) {
        payslips.deleteExtra(p.id, m[2]);
        logEvent(req, session, "pay-extra-deleted", { target: p.displayName });
      } else {
        const x = payslips.addExtra(p.id, await readJsonBody(req), me);
        logEvent(req, session, x.kind === "bonus" ? "bonus-added" : "commission-added", { target: p.displayName, detail: `£${x.amount.toFixed(2)} ${x.label}` });
      }
      return sendJson(res, 200, { extras: payslips.extrasView(p.id) }), true;
    }
    if (pathname === "/api/payroll/bands") {
      needPay();
      if (method === "POST") {
        const body = await readJsonBody(req);
        if (body.delete) payslips.deleteBand(body.delete);
        else payslips.saveBand(body);
        logEvent(req, session, "salary-band-changed", { target: body.jobTitle || undefined });
      }
      return sendJson(res, 200, { bands: payslips.bands() }), true;
    }
    if (pathname === "/api/payroll/settings" && method === "POST") {
      needPay();
      const body = await readJsonBody(req);
      payslips.setApprovalRequired(!!body.requireApproval);
      logEvent(req, session, "payroll-settings-changed", { detail: body.requireApproval ? "Second approval required" : "Second approval not required" });
      return sendJson(res, 200, { requireApproval: payslips.approvalRequired() }), true;
    }
    if ((m = /^\/api\/payroll\/payslips\/([a-f0-9]{16})\/(approve|unapprove)$/.exec(pathname)) && method === "POST") {
      needPay();
      const slip = payslips.getPayslip(m[1]);
      if (!slip) throw httpError(404, "Payslip not found.");
      if (m[2] === "approve") payslips.approve(slip, me); else payslips.unapprove(slip);
      logEvent(req, session, "payslip-" + m[2] + "d", { target: (store.getPerson(slip.personId) || {}).displayName, detail: payslips.periodLabel(slip.period) });
      return sendJson(res, 200, { ok: true }), true;
    }
    if (pathname === "/api/payroll/approve-all" && method === "POST") {
      needPay();
      const { period } = await readJsonBody(req);
      let n = 0, skipped = 0;
      for (const sv of payslips.forPeriod(period)) {
        const slip = payslips.getPayslip(sv.id);
        if (slip.status !== "draft" || slip.approvedBy) continue;
        try { payslips.approve(slip, me); n++; } catch (err) { if (!(err instanceof store.ValidationError)) throw err; skipped++; }
      }
      if (n) logEvent(req, session, "payroll-approved", { detail: `${payslips.periodLabel(period)}: ${n} payslip${n === 1 ? "" : "s"}` });
      return sendJson(res, 200, { approved: n, skipped }), true;
    }
  }

  // ----- Cash-flow forecast: the next 6 months -----
  if (pathname === "/api/funds/forecast" && method === "GET") {
    needPay();
    const b = funds.balances();
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const avgOther = funds.averageMonthlyOther(3);
    const avgIn = funds.averageMonthlyIn(thisMonth, 3);
    const unpaidInvoices = invoices.list().filter((i) => i.status === "sent");
    const unpaidBills = bills.list().filter((x) => x.status === "unpaid");
    let balance = Math.round((b.main + b.payroll) * 100) / 100;
    const months = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
      const period = d.toISOString().slice(0, 7);
      const inMonth = (date) => (i === 0 ? date.slice(0, 7) <= period : date.slice(0, 7) === period);
      const invoicesIn = unpaidInvoices.filter((x) => inMonth(x.dueDate)).reduce((n, x) => n + x.total, 0);
      // Bills: unpaid ones due this month, plus repeats of repeating bills projected forward.
      let billsOut = unpaidBills.filter((x) => inMonth(x.dueDate)).reduce((n, x) => n + x.amount, 0);
      for (const x of unpaidBills) {
        if (x.repeat === "none") continue;
        const step = { monthly: 1, quarterly: 3, yearly: 12 }[x.repeat];
        for (let due = bills.addMonths(x.dueDate, step), k = 0; due.slice(0, 7) <= period && k < 24; due = bills.addMonths(due, step), k++) if (due.slice(0, 7) === period) billsOut += x.amount;
      }
      const payroll = payslips.remainingForPeriod(period).cost;
      const start = balance;
      const other = i === 0 ? Math.round(avgOther * (1 - now.getUTCDate() / 31) * 100) / 100 : avgOther;
      balance = Math.round((start + invoicesIn - billsOut - payroll - other) * 100) / 100;
      months.push({ period, label: payslips.periodLabel(period), start, invoicesIn: Math.round(invoicesIn * 100) / 100, billsOut: Math.round(billsOut * 100) / 100, payroll, other, end: balance });
    }
    return sendJson(res, 200, { months, averageIn: avgIn, averageOther: avgOther, lowest: months.reduce((lo, x) => (x.end < lo.end ? x : lo), months[0]) }), true;
  }

  // ----- Supplier bills -----
  if (pathname.startsWith("/api/bills")) {
    needPay();
    if (method === "GET" && pathname === "/api/bills") {
      return sendJson(res, 200, { bills: bills.list(), summary: bills.summary(), repeats: bills.REPEATS, categories: funds.categories().filter((c) => c !== "Payroll") }), true;
    }
    if (method === "POST" && pathname === "/api/bills") {
      const x = bills.create(await readJsonBody(req), me);
      logEvent(req, session, "bill-added", { target: x.supplier, detail: `£${x.amount.toFixed(2)} due ${x.dueDate}` });
      return sendJson(res, 201, { ok: true }), true;
    }
    if ((m = /^\/api\/bills\/([a-f0-9]{16})(?:\/(pay|delete))?$/.exec(pathname)) && method === "POST") {
      const x = bills.get(m[1]);
      if (!x) throw httpError(404, "Bill not found.");
      if (!m[2]) { bills.update(x, await readJsonBody(req)); logEvent(req, session, "bill-updated", { target: x.supplier }); }
      else if (m[2] === "delete") { bills.remove(x); logEvent(req, session, "bill-deleted", { target: x.supplier }); }
      else {
        const next = bills.pay(x, me);
        logEvent(req, session, "bill-paid", { target: x.supplier, detail: `£${x.amount.toFixed(2)}` + (next ? `; next one due ${next.dueDate}` : "") });
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

  // ----- Leave: calendar grid, clash limit, shutdowns and TOIL -----
  if (pathname === "/api/leave/grid" && method === "GET") {
    const q = query(req);
    const month = /^\d{4}-\d{2}$/.test(q.get("month") || "") ? q.get("month") : new Date().toISOString().slice(0, 7);
    const company = store.COMPANIES.includes(q.get("company")) ? q.get("company") : "";
    return sendJson(res, 200, { ...leave.grid(me, month, company), companies: store.COMPANIES, types: leave.TYPES }), true;
  }
  if (pathname === "/api/leave/settings" && method === "POST") {
    if (!can(leave.MANAGE)) throw httpError(403, "Only people who manage leave can change this.");
    const body = await readJsonBody(req);
    leave.setMaxOffPerCompany(body.maxOffPerCompany);
    logEvent(req, session, "leave-settings-changed", { detail: `Clash warning at ${body.maxOffPerCompany} people off per company` });
    return sendJson(res, 200, { ok: true }), true;
  }
  if (pathname.startsWith("/api/leave/shutdowns")) {
    if (!can(leave.MANAGE)) throw httpError(403, "Only people who manage leave can book shutdown days.");
    if (method === "GET" && pathname === "/api/leave/shutdowns") return sendJson(res, 200, { shutdowns: leave.shutdowns(), companies: store.COMPANIES }), true;
    if (method === "POST" && pathname === "/api/leave/shutdowns") {
      const s = leave.createShutdown(await readJsonBody(req), me);
      logEvent(req, session, "shutdown-booked", { target: s.name, detail: `${s.startDate}${s.endDate !== s.startDate ? " to " + s.endDate : ""}: ${s.requestIds.length} people${s.skipped.length ? `, ${s.skipped.length} skipped` : ""}` });
      if (notify) notify(s.requestIds.map((id) => (leave.getRequest(id) || {}).personId), { type: "leave", title: `Company shutdown booked: ${s.name}`, body: `${s.startDate}${s.endDate !== s.startDate ? " to " + s.endDate : ""}. It's been taken from your holiday allowance.`, link: "/leave" }, me);
      return sendJson(res, 201, { shutdown: s, user: meResponse(session) }), true;
    }
    if (method === "POST" && (m = /^\/api\/leave\/shutdowns\/([a-f0-9]{16})\/delete$/.exec(pathname))) {
      const s = leave.deleteShutdown(m[1]);
      logEvent(req, session, "shutdown-cancelled", { target: s.name });
      return sendJson(res, 200, { ok: true }), true;
    }
  }
  if ((m = /^\/api\/leave\/toil\/([a-f0-9]{16})$/.exec(pathname))) {
    const person = store.getPerson(m[1]);
    if (!person || person.system) throw httpError(404, "Employee not found.");
    const manager = can(leave.MANAGE) || store.supervises(me, person);
    if (person.id !== me.id && !manager) throw httpError(403, "You can't see that.");
    if (method === "POST") {
      if (!manager || (person.id === me.id && !store.isOwner(me))) throw httpError(403, "Only their supervisor or HR can add time off in lieu.");
      const body = await readJsonBody(req);
      leave.addToil(person, body.hours, body.reason, me, "manual");
      logEvent(req, session, "toil-added", { target: person.displayName, detail: `${body.hours} hours – ${body.reason || ""}` });
      if (notify) notify([person.id], { type: "leave", title: `${Number(body.hours) > 0 ? "You've earned" : "Adjustment:"} ${body.hours} hours of time off in lieu`, body: body.reason || "", link: "/leave" }, me);
    }
    return sendJson(res, 200, { balance: leave.toilBalance(person.id), hoursPerDay: leave.TOIL_HOURS_PER_DAY, history: leave.toilHistory(person.id) }), true;
  }

  // ----- Training records -----
  if (pathname.startsWith("/api/training")) {
    if (method === "GET" && pathname === "/api/training") {
      return sendJson(res, 200, { ...training.forViewer(me), people: training.canManage(me) ? store.employees().map((p) => ({ id: p.id, displayName: p.displayName })) : [], companies: store.COMPANIES }), true;
    }
    if (method === "POST" && pathname === "/api/training") {
      const meta = headerJson(req, "x-training");
      const buffer = await readRawBody(req, 10 * 1024 * 1024);
      const existing = meta.id ? training.get(meta.id) : null;
      if (meta.id && (!existing || !training.canEdit(me, existing))) throw httpError(404, "Record not found.");
      const personId = existing ? existing.personId : meta.personId || me.id;
      if (personId !== me.id && !training.canManage(me)) throw httpError(403, "You can only add your own training.");
      const rec = training.save(store.getPerson(personId), meta, buffer, me, existing);
      logEvent(req, session, existing ? "training-updated" : "training-added", { target: (store.getPerson(personId) || {}).displayName, detail: rec.course });
      return sendJson(res, existing ? 200 : 201, { ok: true, user: meResponse(session) }), true;
    }
    if (method === "POST" && pathname === "/api/training/required") {
      if (!training.canManage(me)) throw httpError(403, "Only HR can set required training.");
      const body = await readJsonBody(req);
      training.saveRequired(body);
      logEvent(req, session, "training-required-added", { target: body.course, detail: body.company || "Everyone" });
      return sendJson(res, 200, { ok: true, user: meResponse(session) }), true;
    }
    if (method === "POST" && (m = /^\/api\/training\/required\/([a-f0-9]{16})\/delete$/.exec(pathname))) {
      if (!training.canManage(me)) throw httpError(403, "Only HR can set required training.");
      training.deleteRequired(m[1]);
      return sendJson(res, 200, { ok: true, user: meResponse(session) }), true;
    }
    if ((m = /^\/api\/training\/([a-f0-9]{16})\/(certificate|verify|delete)$/.exec(pathname))) {
      const rec = training.get(m[1]);
      if (!rec || !(training.canManage(me) || rec.personId === me.id)) throw httpError(404, "Record not found.");
      if (method === "GET" && m[2] === "certificate") {
        const file = training.certificateFile(rec);
        if (!file) throw httpError(404, "There's no certificate.");
        return sendFileDownload(res, file, query(req).has("download")), true;
      }
      if (method === "POST" && m[2] === "verify") {
        if (!training.canManage(me)) throw httpError(403, "Only HR can check records.");
        training.verify(rec, me);
        return sendJson(res, 200, { ok: true }), true;
      }
      if (method === "POST" && m[2] === "delete") {
        if (!training.canEdit(me, rec)) throw httpError(403, "You can't delete that.");
        training.remove(rec);
        logEvent(req, session, "training-deleted", { target: (store.getPerson(rec.personId) || {}).displayName, detail: rec.course });
        return sendJson(res, 200, { ok: true, user: meResponse(session) }), true;
      }
    }
  }

  // ----- HR cases -----
  if (pathname.startsWith("/api/cases")) {
    if (!can(cases.MANAGE)) throw httpError(403, "HR cases are only for people with the HR cases permission.");
    if (method === "GET" && pathname === "/api/cases") {
      return sendJson(res, 200, { cases: cases.list(), types: cases.TYPES, outcomes: cases.OUTCOMES, entryKinds: cases.ENTRY_KINDS, people: store.employees().map((p) => ({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle })) }), true;
    }
    if (method === "POST" && pathname === "/api/cases") {
      const c = cases.create(await readJsonBody(req), me);
      logEvent(req, session, "case-opened", { target: c.number, detail: `${cases.TYPES[c.type]} – ${(store.getPerson(c.personId) || {}).displayName}` });
      return sendJson(res, 201, { case: cases.view(c, true) }), true;
    }
    if ((m = /^\/api\/cases\/([a-f0-9]{16})(?:\/(entry|close|reopen|delete|files)(?:\/([a-f0-9]{16}))?)?$/.exec(pathname))) {
      const c = cases.get(m[1]);
      if (!c) throw httpError(404, "Case not found.");
      if (method === "GET" && !m[2]) {
        logEvent(req, session, "case-viewed", { target: c.number });
        return sendJson(res, 200, { case: cases.view(c, true) }), true;
      }
      if (method === "GET" && m[2] === "files" && m[3]) {
        const file = cases.fileFor(c, m[3]);
        if (!file) throw httpError(404, "File not found.");
        logEvent(req, session, "case-file-opened", { target: c.number });
        return sendFileDownload(res, file, query(req).has("download")), true;
      }
      if (method === "POST" && m[2] === "files") {
        const meta = headerJson(req, "x-document");
        const buffer = await readRawBody(req, 20 * 1024 * 1024);
        cases.addFile(c, meta, buffer, me);
        logEvent(req, session, "case-file-added", { target: c.number });
        return sendJson(res, 201, { case: cases.view(c, true) }), true;
      }
      if (method === "POST") {
        const body = await readJsonBody(req);
        if (!m[2]) cases.update(c, body);
        else if (m[2] === "entry") cases.addEntry(c, body, me);
        else if (m[2] === "close") cases.close(c, body);
        else if (m[2] === "reopen") cases.reopen(c);
        else if (m[2] === "delete") {
          cases.remove(c);
          logEvent(req, session, "case-deleted", { target: c.number });
          return sendJson(res, 200, { ok: true }), true;
        }
        logEvent(req, session, "case-" + (m[2] || "updated"), { target: c.number, detail: m[2] === "close" ? cases.OUTCOMES[c.outcome] : undefined });
        return sendJson(res, 200, { case: cases.view(c, true) }), true;
      }
    }
  }

  // ----- Jobs and recruitment -----
  if (pathname.startsWith("/api/jobs")) {
    const manager = recruitment.canManage(me);
    const needManage = () => { if (!manager) throw httpError(403, "Only recruiters can do that."); };
    if (method === "GET" && pathname === "/api/jobs") {
      return sendJson(res, 200, { ...recruitment.forViewer(me), companies: store.COMPANIES, people: manager ? store.employees().map((p) => ({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle })) : [] }), true;
    }
    if (method === "POST" && pathname === "/api/jobs") {
      needManage();
      const v = recruitment.saveVacancy(await readJsonBody(req), me, null);
      logEvent(req, session, "vacancy-posted", { target: v.title, detail: v.company });
      if (notify) notify(store.employees().map((p) => p.id), { type: "jobs", title: `New vacancy: ${v.title}`, body: `${v.company}${v.location ? ` · ${v.location}` : ""}`, link: "/jobs" }, me);
      return sendJson(res, 201, { ok: true }), true;
    }
    if ((m = /^\/api\/jobs\/([a-f0-9]{16})(?:\/(status|delete|apply))?$/.exec(pathname)) && method === "POST") {
      const v = recruitment.getVacancy(m[1]);
      if (!v) throw httpError(404, "Vacancy not found.");
      if (m[2] === "apply") {
        const meta = headerJson(req, "x-applicant");
        const buffer = await readRawBody(req, 10 * 1024 * 1024);
        const a = recruitment.addApplicant(v, meta, buffer, me);
        logEvent(req, session, a.personId ? "job-applied" : "candidate-referred", { target: v.title, detail: a.personId ? undefined : a.name });
        const recruiters = store.employees().filter((p) => store.can(p, recruitment.MANAGE)).map((p) => p.id);
        if (notify) notify(recruiters.concat(v.hiringManagerId || []), { type: "jobs", title: `${a.personId ? `${me.displayName} applied` : `${me.displayName} referred ${a.name}`} for ${v.title}`, link: "/jobs" }, me);
        return sendJson(res, 201, { ok: true }), true;
      }
      needManage();
      const body = await readJsonBody(req);
      if (!m[2]) recruitment.saveVacancy(body, me, v);
      else if (m[2] === "status") recruitment.setVacancyStatus(v, body.status);
      else recruitment.deleteVacancy(v);
      logEvent(req, session, m[2] === "delete" ? "vacancy-deleted" : "vacancy-updated", { target: v.title, detail: m[2] === "status" ? body.status : undefined });
      return sendJson(res, 200, { ok: true }), true;
    }
    if ((m = /^\/api\/jobs\/applicants\/([a-f0-9]{16})\/(cv|stage|note|hire|delete)$/.exec(pathname))) {
      needManage();
      const a = recruitment.getApplicant(m[1]);
      if (!a) throw httpError(404, "Applicant not found.");
      if (method === "GET" && m[2] === "cv") {
        const file = recruitment.cvFile(a);
        if (!file) throw httpError(404, "There's no CV.");
        return sendFileDownload(res, file, query(req).has("download")), true;
      }
      if (method !== "POST") throw httpError(405, "Use POST.");
      const body = await readJsonBody(req);
      const v = recruitment.getVacancy(a.vacancyId);
      if (m[2] === "stage") {
        recruitment.setStage(a, body.stage, me);
        if (a.personId && notify) notify([a.personId], { type: "jobs", title: `Your application for ${v.title}: ${recruitment.STAGES[a.stage]}`, link: "/jobs" }, me);
      } else if (m[2] === "note") recruitment.addNote(a, body.text, me);
      else if (m[2] === "delete") recruitment.deleteApplicant(a);
      else {
        if (!a.personId && !can("staff.manage")) throw httpError(403, "Hiring someone new creates their employee record, which needs the Manage staff permission.");
        const r = recruitment.hire(a, body, me);
        logEvent(req, session, "candidate-hired", { target: r.person.displayName, detail: v.title });
        if (a.personId && notify) notify([a.personId], { type: "jobs", title: `Congratulations – you've got the ${v.title} job`, link: "/jobs" }, me);
        return sendJson(res, 200, { ok: true, personId: r.person.id, onboarding: !!r.checklist }), true;
      }
      logEvent(req, session, "applicant-" + m[2], { target: a.name, detail: v.title + (m[2] === "stage" ? ` → ${recruitment.STAGES[a.stage]}` : "") });
      return sendJson(res, 200, { ok: true }), true;
    }
  }

  // ----- Notifications -----
  if (pathname === "/api/notifications" && method === "GET") {
    return sendJson(res, 200, { items: notifications.forPerson(me.id), unread: notifications.unreadCount(me.id) }), true;
  }
  if ((pathname === "/api/notifications/read" || pathname === "/api/notifications/clear") && method === "POST") {
    const body = await readJsonBody(req);
    if (pathname.endsWith("/clear")) notifications.clear(me.id);
    else notifications.markRead(me.id, body.id || null);
    return sendJson(res, 200, { ok: true, unread: notifications.unreadCount(me.id) }), true;
  }

  // ----- Kudos and milestones -----
  if (pathname.startsWith("/api/kudos")) {
    if (method === "GET" && pathname === "/api/kudos") {
      return sendJson(res, 200, {
        posts: kudos.list(me), leaders: kudos.leaders(), milestones: kudos.milestones(me, { ahead: 14 }),
        values: kudos.VALUES, reactions: kudos.REACTIONS,
        people: store.employees().filter((p) => p.id !== me.id).map((p) => ({ id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, avatarUrl: store.publicView(p).avatarUrl })),
      }), true;
    }
    if (method === "POST" && pathname === "/api/kudos") {
      const post = kudos.give(me, await readJsonBody(req));
      logEvent(req, session, "kudos-given", { target: post.to.map((id) => (store.getPerson(id) || {}).displayName).join(", ") });
      if (notify) notify(post.to, { type: "kudos", title: `${me.displayName} gave you kudos: ${kudos.VALUES[post.value]}`, body: post.message, link: "/kudos" }, me);
      return sendJson(res, 201, { ok: true }), true;
    }
    if (method === "POST" && pathname === "/api/kudos/congrats") {
      const body = await readJsonBody(req);
      const personId = String(body.key || "").split(":")[1];
      if (personId === me.id) throw httpError(400, "You can't congratulate yourself!");
      const added = kudos.congratulate(body.key, me);
      if (added && notify) notify([personId], { type: "kudos", title: `${me.displayName} says congratulations! 🎉`, body: { birthday: "Happy birthday!", anniversary: "Happy work anniversary!", starter: "Welcome to HN Group!" }[String(body.key).split(":")[0]], link: "/kudos" }, me);
      return sendJson(res, 200, { ok: true, added }), true;
    }
    if ((m = /^\/api\/kudos\/([a-f0-9]{16})\/(react|delete)$/.exec(pathname)) && method === "POST") {
      const post = kudos.get(m[1]);
      if (!post) throw httpError(404, "Not found.");
      if (m[2] === "react") kudos.react(post, me, (await readJsonBody(req)).emoji);
      else {
        if (!kudos.canDelete(me, post)) throw httpError(403, "You can't delete that.");
        kudos.remove(post);
        logEvent(req, session, "kudos-deleted");
      }
      return sendJson(res, 200, { ok: true, post: m[2] === "react" ? kudos.list(me).find((p) => p.id === post.id) : null }), true;
    }
  }

  // ----- Ideas box -----
  if (pathname.startsWith("/api/ideas")) {
    if (method === "GET" && pathname === "/api/ideas") {
      return sendJson(res, 200, { ideas: ideas.list(me), statuses: ideas.STATUSES, categories: ideas.CATEGORIES, canManage: can(ideas.MANAGE) }), true;
    }
    if (method === "POST" && pathname === "/api/ideas") {
      const idea = ideas.create(me, await readJsonBody(req));
      logEvent(req, session, "idea-posted", { target: idea.title, detail: idea.anonymous ? "Anonymous" : undefined, actor: idea.anonymous ? "Anonymous" : undefined });
      if (notify) notify(store.employees().filter((p) => store.can(p, ideas.MANAGE)).map((p) => p.id), { type: "idea", title: `New idea: ${idea.title}`, body: idea.anonymous ? "Posted anonymously" : `From ${me.displayName}`, link: "/ideas" }, me);
      return sendJson(res, 201, { ok: true }), true;
    }
    if ((m = /^\/api\/ideas\/([a-f0-9]{16})\/(vote|comment|status|delete)$/.exec(pathname)) && method === "POST") {
      const idea = ideas.get(m[1]);
      if (!idea) throw httpError(404, "Idea not found.");
      const body = await readJsonBody(req);
      if (m[2] === "vote") ideas.vote(idea, me);
      else if (m[2] === "comment") {
        ideas.comment(idea, me, body.text);
        if (notify && idea.by !== me.id) notify([idea.by], { type: "idea", title: `${me.displayName} commented on your idea`, body: idea.title, link: "/ideas" }, me);
      } else if (m[2] === "status") {
        if (!can(ideas.MANAGE)) throw httpError(403, "Only leadership can change an idea's status.");
        ideas.setStatus(idea, body.status, body.note, me);
        logEvent(req, session, "idea-status-changed", { target: idea.title, detail: ideas.STATUSES[idea.status] });
        if (notify) notify(idea.votes.concat(idea.by), { type: "idea", title: `Idea ${ideas.STATUSES[idea.status].toLowerCase()}: ${idea.title}`, body: idea.statusNote, link: "/ideas" }, me);
      } else {
        if (!ideas.canDelete(me, idea)) throw httpError(403, "You can't delete that idea.");
        ideas.remove(idea);
        logEvent(req, session, "idea-deleted", { target: idea.title });
        return sendJson(res, 200, { ok: true }), true;
      }
      return sendJson(res, 200, { idea: ideas.view(idea, me) }), true;
    }
  }

  // ----- Team pages: one per company -----
  if ((m = /^\/api\/teams\/(.+)$/.exec(pathname)) && method === "GET") {
    const company = decodeURIComponent(m[1]);
    if (!store.COMPANIES.includes(company)) throw httpError(404, "Team not found.");
    const members = store.employees().filter((p) => p.company === company || (p.otherRoles || []).some((r) => r.company === company));
    const ids = members.map((p) => p.id);
    const t = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const roleOf = (p) => (p.company === company ? { jobTitle: p.jobTitle, supervisorId: p.supervisorId } : (p.otherRoles || []).find((r) => r.company === company) || {});
    return sendJson(res, 200, {
      company,
      people: members.map((p) => {
        const v = store.publicView(p);
        const r = roleOf(p);
        return { id: p.id, displayName: p.displayName, jobTitle: r.jobTitle || p.jobTitle, avatarUrl: v.avatarUrl, status: store.currentStatus(p), main: p.company === company, supervisorId: r.supervisorId || p.supervisorId, offToday: leave.isOffToday(p.id) };
      }).sort((a, b) => a.displayName.localeCompare(b.displayName)),
      announcements: workplace.listAnnouncements(me).filter((a) => a.state === "live" && a.companies.includes(company)).slice(0, 5)
        .map((a) => ({ id: a.id, title: a.title, body: a.body, createdAt: a.publishAt || a.createdAt, author: a.author, pinned: a.pinned })),
      leave: leave.calendarItems(t, in30).filter((x) => ids.includes(x.personId)),
      events: calendar.itemsBetween(me, t, in30).filter((e) => e.kind === "event" && (!e.companies.length || e.companies.includes(company))),
      kudos: kudos.list(me, { people: ids, limit: 6 }),
      milestones: kudos.milestones(me, { people: ids, ahead: 30 }),
      vacancies: recruitment.forViewer(me).vacancies.filter((v) => v.open && v.company === company).map((v) => ({ id: v.id, title: v.title, location: v.location })),
    }), true;
  }

  // ----- Monthly activity reports -----
  if (pathname === "/api/reports" && method === "GET") {
    if (!can("reports.view")) throw httpError(403, "Activity reports need the Activity reports permission.");
    const thisMonth = new Date().toISOString().slice(0, 7);
    const month = /^\d{4}-\d{2}$/.test(query(req).get("month") || "") ? query(req).get("month") : thisMonth;
    const [y, mo] = month.split("-").map(Number);
    const from = `${month}-01`;
    const to = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
    const prevMonth = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
    const audit = store.readAudit(200000).filter((e) => e.at && e.at.slice(0, 10) >= from && e.at.slice(0, 10) <= to);
    const signIns = audit.filter((e) => e.action === "signed-in");
    const byDay = {};
    for (const e of signIns) byDay[e.at.slice(0, 10)] = (byDay[e.at.slice(0, 10)] || 0) + 1;
    const people = store.employees();
    const leavers = onboarding.listChecklists(me).filter((c) => c.kind === "leaver" && c.lastDay && c.lastDay >= from && c.lastDay <= to);
    const leaveDays = leave.leaveBetween(from, to);
    const report = {
      month, from, to, prevMonth, generatedAt: new Date().toISOString(), generatedBy: me.displayName, isCurrent: month === thisMonth,
      people: {
        headcount: people.length,
        byCompany: store.COMPANIES.map((c) => ({ company: c, count: people.filter((p) => p.company === c).length })),
        starters: people.filter((p) => p.startDate && p.startDate >= from && p.startDate <= to).map((p) => p.displayName),
        leavers: leavers.map((c) => c.person.displayName),
        hires: recruitment.hiresBetween(from, to),
      },
      logins: { total: signIns.length, people: new Set(signIns.map((e) => e.actor)).size, byDay, busiestDay: Object.entries(byDay).sort((a, b) => b[1] - a[1])[0] || null },
      leave: { byType: Object.entries(leaveDays).map(([type, days]) => ({ type, label: leave.TYPES[type] || type, days })), total: Object.values(leaveDays).reduce((n, d) => n + d, 0) },
      helpdesk: helpdesk.statsBetween(from, to),
      status: { incidents: uptime.incidentsBetween(from, to), services: uptime.list().map((x) => ({ name: x.name, uptime7d: x.uptime7d, state: x.state })) },
      engagement: {
        kudos: kudos.countBetween(from, to),
        ideas: ideas.countBetween(from, to),
        announcements: audit.filter((e) => e.action === "announcement-posted").length,
        documents: audit.filter((e) => e.action === "document-uploaded").length,
        expenseClaims: audit.filter((e) => e.action === "expense-claimed").length,
      },
      activity: Object.entries(audit.reduce((acc, e) => { acc[e.action] = (acc[e.action] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([action, count]) => ({ action, count })),
    };
    if (can(payslips.MANAGE)) {
      const st = funds.statement(month);
      report.money = {
        payroll: payslips.costBetween(from, to),
        expenses: expenses.paidBetween(from, to),
        invoicesPaid: invoices.list().filter((i) => i.status === "paid" && i.paidAt.slice(0, 10) >= from && i.paidAt.slice(0, 10) <= to).reduce((n, i) => n + i.total, 0),
        moneyIn: st.moneyIn, spent: st.spent, closing: st.closing, byCategory: st.byCategory,
      };
    }
    logEvent(req, session, "report-viewed", { detail: month });
    return sendJson(res, 200, { report }), true;
  }

  return false;
}

// ----- Sign-in history -----
const LOGIN_ACTIONS = { "signed-in": "Signed in", "sign-in-failed": "Wrong password", "sign-in-code-failed": "Wrong sign-in code", "password-changed": "Password changed", "code-changed": "Sign-in code changed", "sign-in-maintenance": "Tried to sign in during maintenance" };

function loginHistory(person, limit) {
  const name = store.loginName(person);
  const out = [];
  for (const e of store.readAudit(20000)) {
    if (!LOGIN_ACTIONS[e.action] || e.via) continue;
    // Failed password attempts are logged with whatever was typed, which could be any of their emails.
    const mine = e.actor === name || (e.action === "sign-in-failed" && store.findByLogin(e.actor) === person);
    if (!mine) continue;
    out.push({ at: e.at, action: e.action, label: LOGIN_ACTIONS[e.action], ip: e.ip || "", ua: e.ua || "", detail: e.detail || "", failed: /failed/.test(e.action), reported: security.isReported(e.at, e.ip) });
    if (out.length >= limit) break;
  }
  return out;
}

// Everything the portal holds about someone, as they'd see it, for "Download my data".
function exportFor(me) {
  const safe = (fn) => { try { return fn(); } catch (err) { return { error: "This section couldn't be included." }; } };
  const view = store.meView(me);
  delete view.permissions;
  return {
    exportedAt: new Date().toISOString(),
    about: "Your personal data held by the HN Group Staff Portal. Anonymous answers (pulse surveys, anonymous ideas and 360 feedback you gave) aren't linked to you, so they aren't included.",
    profile: view,
    signIns: safe(() => loginHistory(me, 500)),
    leave: safe(() => ({ requests: leave.mine(me), thisYear: leave.summary(me.id), toil: leave.toilHistory(me.id) })),
    payslips: safe(() => payslips.mine(me)),
    expenses: safe(() => expenses.forViewer(me).mine),
    timesheets: safe(() => rotas.myRecent(me)),
    training: safe(() => training.forViewer(me).mine),
    goals: safe(() => objectives.forPerson(me.id, me)),
    reviews: safe(() => reviews.forPerson(me, me)),
    feedbackAboutYou: safe(() => feedback.forViewer(me).requests.filter((r) => r.subject && r.subject.id === me.id)),
    flexibleWorking: safe(() => flexible.forViewer(me).mine),
    exitInterview: safe(() => exitinterviews.forPerson(me.id)),
    documents: safe(() => stafffiles.forPerson(me.id, me).map((f) => ({ name: f.name || f.fileName, category: f.categoryLabel || f.category, uploadedAt: f.uploadedAt }))),
    kudos: safe(() => kudos.list(me, { people: [me.id], limit: 1000 })),
    ideas: safe(() => ideas.list(me).filter((i) => i.mine)),
    itTickets: safe(() => helpdesk.list(me).filter((t) => t.requester && t.requester.id === me.id)),
    chatMessages: safe(() => chat.writtenBy(me.id)),
    questionsAndAnswers: safe(() => qa.byPerson(me.id)),
    knowledgeBase: safe(() => wiki.byPerson(me.id)),
    mentoring: safe(() => mentoring.forViewer(me).mine),
    notifications: safe(() => notifications.forPerson(me.id)),
  };
}

async function handleMe(req, res, pathname, session) {
  const method = req.method;
  const me = session.person;
  const { sendJson, httpError, readJsonBody, logEvent, meResponse, notify } = ctx;
  if (method === "GET" && pathname === "/api/me/logins") {
    return sendJson(res, 200, { logins: loginHistory(me, 60) }), true;
  }
  if (method === "POST" && pathname === "/api/me/logins/report") {
    if (session.data.impersonatorId) throw httpError(403, "You can't do that while logged in as someone else.");
    const { at, ip } = await readJsonBody(req);
    const entry = loginHistory(me, 500).find((e) => e.at === at && e.ip === (ip || ""));
    if (!entry) throw httpError(404, "That sign-in isn't in your history.");
    if (entry.reported) throw httpError(400, "You've already reported that sign-in.");
    // Sign out everywhere else, forget remembered browsers, and tell IT.
    ctx.endSessionsFor(store.sessionIdOf(me), session.token);
    const t = helpdesk.createTicket(me, {
      subject: "Sign-in I don't recognise",
      category: "access",
      priority: "urgent",
      body: `${me.displayName} reported a sign-in they don't recognise.\n\nWhat: ${entry.label}\nWhen: ${entry.at}\nIP address: ${entry.ip || "unknown"}\nDevice: ${entry.ua || "unknown"}\n\nAll their other sessions have been signed out. They've been asked to change their password and sign-in code.`,
    });
    security.addReport(me.id, entry, t.number);
    logEvent(req, session, "sign-in-reported", { target: `#${t.number}`, detail: `${entry.label} from ${entry.ip || "unknown IP"} at ${entry.at}` });
    if (notify) notify(helpdesk.agents().map((a) => a.id).filter((id) => id !== me.id), { type: "helpdesk", title: `${me.displayName} reported a sign-in they don't recognise`, body: `IT ticket #${t.number}`, link: "/helpdesk" }, me);
    return sendJson(res, 200, { ticket: t.number }), true;
  }
  if (method === "GET" && pathname === "/api/me/export") {
    if (session.data.impersonatorId) throw httpError(403, "You can't download someone else's data while logged in as them.");
    const body = JSON.stringify(exportFor(me), null, 2);
    logEvent(req, session, "data-exported");
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    });
    res.end(body);
    return true;
  }
  if (method === "POST" && pathname === "/api/me/home-layout") {
    store.setHomeLayout(me, await readJsonBody(req));
    return sendJson(res, 200, { user: meResponse(session) }), true;
  }
  return false;
}

// System Admin → Security & data (only reached once the System Admin PIN has been entered).
async function handleSystem(req, res, pathname, session) {
  const method = req.method;
  const { sendJson, httpError, readJsonBody, logEvent } = ctx;
  if (!pathname.startsWith("/api/system/security")) return false;
  if (method === "GET" && pathname === "/api/system/security") {
    return sendJson(res, 200, { password: security.policy(), retention: security.retention(), choices: { expiry: security.EXPIRY_CHOICES, retention: security.RETENTION_CHOICES }, preview: retention.preview() }), true;
  }
  if (method === "POST" && pathname === "/api/system/security/password") {
    const p = security.setPolicy(await readJsonBody(req));
    logEvent(req, session, "password-rules-changed", { detail: `At least ${p.minLength} characters, common passwords ${p.blockCommon ? "blocked" : "allowed"}, ${p.expiryDays ? `change every ${p.expiryDays} days` : "no expiry"}` });
    return sendJson(res, 200, { password: p }), true;
  }
  if (method === "POST" && pathname === "/api/system/security/retention") {
    const r = security.setRetention(await readJsonBody(req));
    logEvent(req, session, "retention-changed");
    return sendJson(res, 200, { retention: r, preview: retention.preview() }), true;
  }
  if (method === "POST" && pathname === "/api/system/security/cleanup") {
    const r = ctx.runRetention(retention.run);
    logEvent(req, session, "retention-run");
    return sendJson(res, 200, { result: r, retention: security.retention() }), true;
  }
  throw httpError(404, "Not found.");
}

// ----- The public website (hngroup.org.uk) -----
// nginx on hngroup.org.uk passes /api/public/ through to the portal; nothing else of the portal is
// reachable from there. No sign-in, so everything here is limited per IP address.
const publicHits = new Map();
function publicLimit(ip, max) {
  const now = Date.now();
  const list = (publicHits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (list.length >= max) return false;
  list.push(now);
  publicHits.set(ip, list);
  if (publicHits.size > 5000) publicHits.clear();
  return true;
}

async function handlePublic(req, res, pathname) {
  if (!pathname.startsWith("/api/public/")) return false;
  const { sendJson, httpError, readJsonBody, readRawBody, headerJson, notify } = ctx;
  const method = req.method;
  const ip = ctx.clientIp(req);
  const staffWith = (perm) => store.employees().filter((p) => store.can(p, perm) && p.account && p.account.enabled).map((p) => p.id);
  let m;
  if (method === "GET" && pathname === "/api/public/jobs") {
    res.setHeader("Cache-Control", "public, max-age=120");
    return sendJson(res, 200, { jobs: recruitment.publicVacancies() }), true;
  }
  if (method === "POST" && (m = /^\/api\/public\/jobs\/([a-f0-9]{16})\/apply$/.exec(pathname))) {
    if (!publicLimit(ip, 5)) throw httpError(429, "Too many applications from your connection. Please try again later.");
    const v = recruitment.getVacancy(m[1]);
    if (!v) throw httpError(404, "That job is no longer open.");
    const meta = headerJson(req, "x-application");
    const buffer = await readRawBody(req, 10 * 1024 * 1024);
    const a = recruitment.addWebsiteApplicant(v, meta, buffer);
    store.audit({ action: "website-application", actor: a.email, target: v.title, detail: a.name, ip });
    if (notify) notify(staffWith(recruitment.MANAGE).concat(v.hiringManagerId || []), { type: "jobs", title: `${a.name} applied for ${v.title} on the website`, link: "/jobs" }, null);
    return sendJson(res, 201, { ok: true }), true;
  }
  if (method === "POST" && pathname === "/api/public/enquiry") {
    if (!publicLimit(ip, 5)) throw httpError(429, "You've sent a few messages already. Please try again later.");
    const e = enquiries.create(await readJsonBody(req), ip);
    if (e.status !== "spam") {
      store.audit({ action: "website-enquiry", actor: e.email, detail: enquiries.TOPICS[e.topic], ip });
      if (notify) notify(staffWith(enquiries.MANAGE), { type: "info", title: `Website enquiry from ${e.name}`, body: enquiries.TOPICS[e.topic] + (e.company ? " · " + e.company : ""), link: "/enquiries" }, null);
    }
    return sendJson(res, 201, { ok: true }), true;
  }
  throw httpError(404, "Not found.");
}

module.exports = { init, handle, handleSystem, handlePublic };
