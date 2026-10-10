/**
 * Job Application Tracker for Google Sheets
 *
 * Creates and formats MAIN, Indeed, CV-Library, GOV.UK and OTHER sheets,
 * adds a "Job Tracker" menu (Set Up Sheet, Archive Sheet, New Job, Update Job)
 * and sends an hourly email summary of applications that are still waiting on
 * a response or whose status changed since the last email.
 *
 * Every job lives on its job-site sheet AND on MAIN. A hidden ID column links
 * the two copies so edits made on either one are mirrored to the other.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const EMAIL_RECIPIENTS = [
  'charlielivsey7@gmail.com',
  'Chazziebear11@icloud.com',
  'Charlielivsey14@icloud.com',
];

const MAIN_SHEET = 'MAIN';
const SOURCE_SHEETS = ['Indeed', 'CV-Library', 'GOV.UK', 'OTHER'];
const TRACKER_SHEETS = [MAIN_SHEET].concat(SOURCE_SHEETS);

const TAB_COLOURS = {
  'MAIN': '#1f3864',
  'Indeed': '#2557a7',
  'CV-Library': '#e4007c',
  'GOV.UK': '#0b0c0c',
  'OTHER': '#6aa84f',
};

const HEADERS = [
  'Job Title', 'Company', 'Location', 'Salary', 'Date Applied',
  'Phone Interview', 'Interview', 'Job Offer', 'Rejected', 'Reason for Rejection',
  'Source', 'ID', 'Last Emailed Status', // hidden helper columns
];

const COL = {
  TITLE: 1, COMPANY: 2, LOCATION: 3, SALARY: 4, DATE: 5,
  PHONE: 6, INTERVIEW: 7, OFFER: 8, REJECTED: 9, REASON: 10,
  SOURCE: 11, ID: 12, EMAILED: 13,
};

const NUM_COLS = HEADERS.length;   // 13
const VISIBLE_COLS = 10;           // A:J are shown, K:M are hidden helpers
const COLUMN_WIDTHS = [230, 190, 150, 120, 115, 125, 95, 95, 90, 280];
const MIN_DATA_ROWS = 100;         // empty rows kept ready for new jobs
const SPARE_ROWS = 25;             // spare rows kept below the last job

const HEADER_BG = '#1f3864';
const BAND_1 = '#ffffff';
const BAND_2 = '#f3f6fb';

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💼 Job Tracker')
    .addItem('Set Up Sheet', 'setUpSheet')
    .addItem('Archive Sheet', 'archiveSheet')
    .addSeparator()
    .addItem('New Job', 'showNewJobDialog')
    .addItem('Update Job', 'showUpdateJobDialog')
    .addSeparator()
    .addItem('Send Update Email Now', 'sendUpdateEmailNow')
    .addToUi();
}

// ---------------------------------------------------------------------------
// Set Up Sheet
// ---------------------------------------------------------------------------

function setUpSheet() {
  const ss = SpreadsheetApp.getActive();

  TRACKER_SHEETS.forEach(function (name, index) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name, index);
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(index + 1);
    formatTrackerSheet_(sheet);
  });

  removeBlankDefaultSheets_(ss);
  installHourlyTrigger_();

  ss.setActiveSheet(ss.getSheetByName(MAIN_SHEET));
  SpreadsheetApp.getUi().alert(
    'Job Tracker is ready',
    'Sheets have been created and formatted, and the hourly update email has been scheduled.\n\n' +
    'Use Job Tracker → New Job to add an application.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function removeBlankDefaultSheets_(ss) {
  ss.getSheets().forEach(function (sheet) {
    const name = sheet.getName();
    if (TRACKER_SHEETS.indexOf(name) !== -1) return;
    if (/^Sheet\s?\d+$/i.test(name) && sheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet);
    }
  });
}

/** Applies headers, column layout, checkboxes, banding and colour rules. */
function formatTrackerSheet_(sheet) {
  // Columns: keep exactly NUM_COLS.
  const maxCols = sheet.getMaxColumns();
  if (maxCols > NUM_COLS) sheet.deleteColumns(NUM_COLS + 1, maxCols - NUM_COLS);
  if (maxCols < NUM_COLS) sheet.insertColumnsAfter(maxCols, NUM_COLS - maxCols);

  // Rows: enough for the data plus some spare, no more.
  const lastData = findLastDataRow_(sheet);
  const wantedRows = Math.max(MIN_DATA_ROWS + 1, lastData + SPARE_ROWS);
  const maxRows = sheet.getMaxRows();
  if (maxRows > wantedRows) sheet.deleteRows(wantedRows + 1, maxRows - wantedRows);
  if (maxRows < wantedRows) sheet.insertRowsAfter(maxRows, wantedRows - maxRows);
  const dataRows = wantedRows - 1;

  // Reset previous formatting so re-running setup is always clean.
  sheet.getBandings().forEach(function (b) { b.remove(); });
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.clearConditionalFormatRules();
  sheet.getRange(1, 1, wantedRows, NUM_COLS).clearDataValidations();

  const all = sheet.getRange(1, 1, wantedRows, NUM_COLS);
  all.setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle').setBorder(false, false, false, false, false, false);

  // Header row.
  sheet.getRange(1, 1, 1, NUM_COLS).setValues([HEADERS]);
  sheet.getRange(1, 1, 1, VISIBLE_COLS)
    .setBackground(HEADER_BG)
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('center')
    .setWrap(true)
    .setBorder(null, null, true, null, null, null, '#0b1a33', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.setRowHeight(1, 40);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(0);

  // Column widths.
  COLUMN_WIDTHS.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });

  // Data area.
  const data = sheet.getRange(2, 1, dataRows, VISIBLE_COLS);
  data.setFontColor('#202124').setWrap(false);
  sheet.setRowHeights(2, dataRows, 26);
  sheet.getRange(2, COL.TITLE, dataRows, 1).setFontWeight('bold');
  sheet.getRange(2, COL.SALARY, dataRows, 1).setNumberFormat('@').setHorizontalAlignment('center');
  sheet.getRange(2, COL.DATE, dataRows, 1)
    .setNumberFormat('dd/mm/yyyy')
    .setHorizontalAlignment('center')
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireDate().setAllowInvalid(false).setHelpText('Enter a date, e.g. 10/10/2026').build());
  // Checkbox validation (not insertCheckboxes, which would untick existing statuses).
  sheet.getRange(2, COL.PHONE, dataRows, 4)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build())
    .setHorizontalAlignment('center');
  sheet.getRange(2, COL.REASON, dataRows, 1).setWrap(true).setFontStyle('italic');
  sheet.getRange(2, COL.SOURCE, dataRows, 3).setNumberFormat('@');

  // Alternating row colours.
  const banding = sheet.getRange(1, 1, wantedRows, VISIBLE_COLS)
    .applyRowBanding(SpreadsheetApp.BandingTheme.BLUE, true, false);
  banding.setHeaderRowColor(HEADER_BG).setFirstRowColor(BAND_1).setSecondRowColor(BAND_2);

  // Subtle row dividers.
  data.setBorder(null, null, true, null, null, true, '#dfe3eb', SpreadsheetApp.BorderStyle.SOLID);

  // Row colour by status (first matching rule wins).
  const rulesRange = sheet.getRange(2, 1, dataRows, VISIBLE_COLS);
  const rule = function (formula, bg, fg) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(formula).setBackground(bg).setFontColor(fg)
      .setRanges([rulesRange]).build();
  };
  sheet.setConditionalFormatRules([
    rule('=$H2=TRUE', '#d9ead3', '#274e13'), // Job Offer – green
    rule('=$I2=TRUE', '#f4cccc', '#660000'), // Rejected  – red
    rule('=$G2=TRUE', '#fff2cc', '#7f6000'), // Interview – amber
    rule('=$F2=TRUE', '#cfe2f3', '#073763'), // Phone interview – blue
  ]);

  // Filter buttons on the header for quick sorting/filtering.
  sheet.getRange(1, 1, wantedRows, VISIBLE_COLS).createFilter();

  // Hide helper columns and gridlines.
  sheet.hideColumns(COL.SOURCE, NUM_COLS - VISIBLE_COLS);
  sheet.setHiddenGridlines(true);
  if (TAB_COLOURS[sheet.getName()]) sheet.setTabColor(TAB_COLOURS[sheet.getName()]);
}

// ---------------------------------------------------------------------------
// Archive Sheet
// ---------------------------------------------------------------------------

function archiveSheet() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getActiveSheet();
  const name = sheet.getName();

  if (TRACKER_SHEETS.indexOf(name) === -1) {
    ui.alert('Archive Sheet', 'Open one of the tracker sheets (' + TRACKER_SHEETS.join(', ') +
      ') and run Archive Sheet again.', ui.ButtonSet.OK);
    return;
  }

  const message = name === MAIN_SHEET
    ? 'This copies MAIN into a new archive sheet and then clears ALL tracker sheets (MAIN, ' +
      SOURCE_SHEETS.join(', ') + ').\n\nContinue?'
    : 'This copies "' + name + '" into a new archive sheet, clears it, and removes those jobs from MAIN.\n\nContinue?';
  if (ui.alert('Archive Sheet', message, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    let archiveName = name + ' Archive ' + stamp;
    for (let n = 2; ss.getSheetByName(archiveName); n++) archiveName = name + ' Archive ' + stamp + ' (' + n + ')';

    const archive = sheet.copyTo(ss).setName(archiveName);
    archive.setTabColor('#999999');
    ss.setActiveSheet(archive);
    ss.moveActiveSheet(ss.getSheets().length);

    if (name === MAIN_SHEET) {
      TRACKER_SHEETS.forEach(function (n) { clearTrackerSheet_(ss.getSheetByName(n)); });
    } else {
      const ids = getJobRows_(sheet).map(function (j) { return j.id; }).filter(String);
      removeJobsFromSheet_(ss.getSheetByName(MAIN_SHEET), ids);
      clearTrackerSheet_(sheet);
    }
    ss.setActiveSheet(sheet);
  } finally {
    lock.releaseLock();
  }

  ss.toast('Archived to a new sheet and reset "' + name + '".', 'Archive Sheet', 5);
}

function clearTrackerSheet_(sheet) {
  if (!sheet) return;
  if (sheet.getMaxRows() > 1) {
    sheet.getRange(2, 1, sheet.getMaxRows() - 1, sheet.getMaxColumns()).clearContent();
  }
  formatTrackerSheet_(sheet);
}

function removeJobsFromSheet_(sheet, ids) {
  if (!sheet || !ids.length) return;
  const wanted = {};
  ids.forEach(function (id) { wanted[id] = true; });
  const rows = getJobRows_(sheet)
    .filter(function (j) { return wanted[j.id]; })
    .map(function (j) { return j.row; })
    .sort(function (a, b) { return b - a; });
  rows.forEach(function (r) { sheet.deleteRow(r); });
  formatTrackerSheet_(sheet);
}

// ---------------------------------------------------------------------------
// New Job
// ---------------------------------------------------------------------------

function showNewJobDialog() {
  const html = HtmlService.createHtmlOutput(NEW_JOB_HTML.replace('{{SOURCES}}',
    SOURCE_SHEETS.map(function (s) { return '<option>' + s + '</option>'; }).join('')))
    .setWidth(460).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'New Job');
}

/** Called from the New Job dialog. */
function addJob(form) {
  const title = String(form.title || '').trim();
  const company = String(form.company || '').trim();
  const source = SOURCE_SHEETS.indexOf(form.source) !== -1 ? form.source : 'OTHER';
  if (!title || !company) throw new Error('Job Title and Company are required.');

  let date = new Date();
  if (form.date) {
    const p = String(form.date).split('-').map(Number);
    date = new Date(p[0], p[1] - 1, p[2]);
  }

  const ss = SpreadsheetApp.getActive();
  ensureTrackerSheetsExist_(ss);

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const row = [
      title, company, String(form.location || '').trim(), String(form.salary || '').trim(), date,
      false, false, false, false, '',
      source, Utilities.getUuid(), '',
    ];
    appendJob_(ss.getSheetByName(source), row);
    appendJob_(ss.getSheetByName(MAIN_SHEET), row);
  } finally {
    lock.releaseLock();
  }
  ss.toast('Added "' + title + '" at ' + company + ' to ' + source + ' and MAIN.', 'New Job', 5);
  return true;
}

function appendJob_(sheet, row) {
  const target = findLastDataRow_(sheet) + 1;
  if (target > sheet.getMaxRows() - 1) {
    sheet.insertRowsAfter(sheet.getMaxRows(), SPARE_ROWS);
    formatTrackerSheet_(sheet);
  }
  sheet.getRange(target, 1, 1, NUM_COLS).setValues([row]);
}

// ---------------------------------------------------------------------------
// Update Job
// ---------------------------------------------------------------------------

function showUpdateJobDialog() {
  const html = HtmlService.createHtmlOutput(UPDATE_JOB_HTML).setWidth(480).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'Update Job');
}

/** Called from the Update Job dialog: list of jobs plus the one on the selected row. */
function getJobsForUpdate() {
  const ss = SpreadsheetApp.getActive();
  ensureTrackerSheetsExist_(ss);
  registerManualEntries_(ss);

  const jobs = getJobRows_(ss.getSheetByName(MAIN_SHEET))
    .filter(function (j) { return j.id; })
    .map(function (j) {
      return {
        id: j.id,
        label: j.title + ' – ' + j.company + (j.source ? ' (' + j.source + ')' : ''),
        phone: j.phone, interview: j.interview, offer: j.offer, rejected: j.rejected,
        reason: j.reason,
      };
    });

  let selectedId = '';
  const active = ss.getActiveSheet();
  if (TRACKER_SHEETS.indexOf(active.getName()) !== -1) {
    const range = active.getActiveRange();
    const r = range ? range.getRow() : 0;
    if (r > 1) selectedId = String(active.getRange(r, COL.ID).getValue());
  }
  return { jobs: jobs, selectedId: selectedId };
}

/** Called from the Update Job dialog. */
function updateJob(form) {
  if (!form.id) throw new Error('Please choose a job.');
  const values = [[!!form.phone, !!form.interview, !!form.offer, !!form.rejected,
    form.rejected ? String(form.reason || '').trim() : '']];

  const ss = SpreadsheetApp.getActive();
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  let found = false;
  try {
    TRACKER_SHEETS.forEach(function (name) {
      const sheet = ss.getSheetByName(name);
      const row = sheet ? findRowById_(sheet, form.id) : -1;
      if (row > 0) {
        sheet.getRange(row, COL.PHONE, 1, 5).setValues(values);
        found = true;
      }
    });
  } finally {
    lock.releaseLock();
  }
  if (!found) throw new Error('That job could not be found – it may have been archived.');
  ss.toast('Job status updated.', 'Update Job', 4);
  return true;
}

// ---------------------------------------------------------------------------
// Keep MAIN and job-site sheets in sync when cells are edited by hand
// ---------------------------------------------------------------------------

function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const name = sheet.getName();
  if (TRACKER_SHEETS.indexOf(name) === -1) return;
  if (e.range.getColumn() > VISIBLE_COLS || e.range.getLastRow() < 2) return;

  const ss = sheet.getParent();
  const first = Math.max(2, e.range.getRow());
  const last = e.range.getLastRow();
  const rows = sheet.getRange(first, 1, last - first + 1, NUM_COLS).getValues();

  rows.forEach(function (values, i) {
    const id = values[COL.ID - 1];
    if (!id) return;
    const targetName = name === MAIN_SHEET ? values[COL.SOURCE - 1] : MAIN_SHEET;
    const target = targetName && targetName !== name ? ss.getSheetByName(targetName) : null;
    if (!target) return;
    const row = findRowById_(target, id);
    if (row > 0) target.getRange(row, 1, 1, VISIBLE_COLS).setValues([values.slice(0, VISIBLE_COLS)]);
  });
}

/**
 * Jobs typed directly into a job-site sheet (not via New Job) have no ID yet.
 * Give them one and copy them onto MAIN so they are tracked and emailed.
 */
function registerManualEntries_(ss) {
  const main = ss.getSheetByName(MAIN_SHEET);

  SOURCE_SHEETS.forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    getJobRows_(sheet).forEach(function (j) {
      if (j.id || !j.title) return;
      const id = Utilities.getUuid();
      sheet.getRange(j.row, COL.SOURCE, 1, 2).setValues([[name, id]]);
      const values = sheet.getRange(j.row, 1, 1, NUM_COLS).getValues()[0];
      values[COL.EMAILED - 1] = '';
      appendJob_(main, values);
    });
  });

  // Jobs typed directly into MAIN just get an ID (source unknown).
  getJobRows_(main).forEach(function (j) {
    if (j.id || !j.title) return;
    main.getRange(j.row, COL.ID).setValue(Utilities.getUuid());
  });
}

// ---------------------------------------------------------------------------
// Hourly email
// ---------------------------------------------------------------------------

function installHourlyTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendStatusEmail') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendStatusEmail').timeBased().everyHours(1).create();
}

function sendUpdateEmailNow() {
  const sent = sendStatusEmail();
  SpreadsheetApp.getActive().toast(
    sent ? 'Update email sent.' : 'Nothing to report – every application has a status and nothing has changed.',
    'Job Tracker', 5);
}

/**
 * Emails every application that has no status yet, plus every application
 * whose status changed since the last email. Returns true if an email was sent.
 */
function sendStatusEmail() {
  const ss = SpreadsheetApp.getActive();
  const main = ss.getSheetByName(MAIN_SHEET);
  if (!main) return false;
  registerManualEntries_(ss);

  const jobs = getJobRows_(main).filter(function (j) { return j.id; });
  const awaiting = [];
  const changed = [];

  jobs.forEach(function (j) {
    j.state = stateKey_(j);
    const noStatus = !j.phone && !j.interview && !j.offer && !j.rejected;
    if (noStatus) {
      awaiting.push(j);
    } else if (j.state !== j.emailed) {
      j.previous = j.emailed ? statusLabel_(parseState_(j.emailed)) : 'No response yet';
      changed.push(j);
    }
  });

  if (!awaiting.length && !changed.length) return false;

  const subject = 'Job Applications: ' +
    changed.length + ' update' + (changed.length === 1 ? '' : 's') + ', ' +
    awaiting.length + ' awaiting response';

  MailApp.sendEmail({
    to: EMAIL_RECIPIENTS.join(','),
    subject: subject,
    htmlBody: buildEmailHtml_(changed, awaiting, jobs.length),
    body: buildEmailText_(changed, awaiting),
    name: 'Job Tracker',
  });

  // Remember what was reported so only new changes appear next time.
  const emailedRange = main.getRange(2, COL.EMAILED, findLastDataRow_(main) - 1, 1);
  const emailed = emailedRange.getValues();
  jobs.forEach(function (j) { emailed[j.row - 2][0] = j.state; });
  emailedRange.setValues(emailed);
  return true;
}

function stateKey_(j) {
  return JSON.stringify([j.phone, j.interview, j.offer, j.rejected, j.reason]);
}

function parseState_(key) {
  try {
    const s = JSON.parse(key);
    return { phone: s[0], interview: s[1], offer: s[2], rejected: s[3], reason: s[4] };
  } catch (err) {
    return {};
  }
}

function statusLabel_(j) {
  if (j.offer) return 'Job Offer 🎉';
  if (j.rejected) return 'Rejected';
  if (j.interview) return 'Interview';
  if (j.phone) return 'Phone Interview';
  return 'No response yet';
}

function statusColour_(j) {
  if (j.offer) return '#d9ead3';
  if (j.rejected) return '#f4cccc';
  if (j.interview) return '#fff2cc';
  if (j.phone) return '#cfe2f3';
  return '#f3f3f3';
}

function buildEmailHtml_(changed, awaiting, total) {
  const th = 'style="background:#1f3864;color:#fff;padding:8px 10px;text-align:left;font-size:13px"';
  const td = 'style="padding:8px 10px;border-bottom:1px solid #e0e0e0;font-size:13px;vertical-align:top"';

  const table = function (rows, withChange) {
    let html = '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin-bottom:24px">' +
      '<tr><th ' + th + '>Job Title</th><th ' + th + '>Company</th><th ' + th + '>Location</th>' +
      '<th ' + th + '>Salary</th><th ' + th + '>Applied</th><th ' + th + '>Source</th>' +
      (withChange ? '<th ' + th + '>Was</th>' : '') + '<th ' + th + '>Status</th></tr>';
    rows.forEach(function (j) {
      let status = esc_(statusLabel_(j));
      if (j.rejected && j.reason) status += '<br><i style="color:#666">' + esc_(j.reason) + '</i>';
      html += '<tr><td ' + td + '><b>' + esc_(j.title) + '</b></td><td ' + td + '>' + esc_(j.company) +
        '</td><td ' + td + '>' + esc_(j.location) + '</td><td ' + td + '>' + esc_(j.salary) +
        '</td><td ' + td + '>' + esc_(j.dateText) + '</td><td ' + td + '>' + esc_(j.source) + '</td>' +
        (withChange ? '<td ' + td + '>' + esc_(j.previous) + '</td>' : '') +
        '<td ' + td.replace('style="', 'style="background:' + statusColour_(j) + ';') + '>' + status + '</td></tr>';
    });
    return html + '</table>';
  };

  let html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#202124;max-width:900px">' +
    '<h2 style="color:#1f3864;margin-bottom:4px">Job Application Update</h2>' +
    '<p style="color:#666;margin-top:0">' + esc_(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'EEEE d MMMM yyyy, HH:mm')) +
    ' · ' + total + ' active application' + (total === 1 ? '' : 's') + '</p>';
  if (changed.length) {
    html += '<h3 style="color:#1f3864">🔔 Status changes since last email (' + changed.length + ')</h3>' + table(changed, true);
  }
  if (awaiting.length) {
    html += '<h3 style="color:#1f3864">⏳ Awaiting response (' + awaiting.length + ')</h3>' + table(awaiting, false);
  }
  html += '<p style="color:#999;font-size:12px">Sent automatically by Job Tracker in ' +
    esc_(SpreadsheetApp.getActive().getName()) + ': <a href="' + SpreadsheetApp.getActive().getUrl() + '">open the spreadsheet</a>.</p></div>';
  return html;
}

function buildEmailText_(changed, awaiting) {
  const line = function (j) {
    return '- ' + j.title + ' – ' + j.company + (j.location ? ', ' + j.location : '') +
      ' (' + (j.source || 'MAIN') + ', applied ' + j.dateText + '): ' + statusLabel_(j) +
      (j.rejected && j.reason ? ' – ' + j.reason : '');
  };
  let text = 'Job Application Update\n\n';
  if (changed.length) text += 'STATUS CHANGES SINCE LAST EMAIL\n' + changed.map(line).join('\n') + '\n\n';
  if (awaiting.length) text += 'AWAITING RESPONSE\n' + awaiting.map(line).join('\n') + '\n';
  return text;
}

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureTrackerSheetsExist_(ss) {
  const missing = TRACKER_SHEETS.some(function (n) { return !ss.getSheetByName(n); });
  if (missing) throw new Error('Run Job Tracker → Set Up Sheet first.');
}

/** Last row with text in any of A:E (checkbox columns always hold FALSE, so getLastRow() is no use). */
function findLastDataRow_(sheet) {
  const maxRows = sheet.getMaxRows();
  if (maxRows < 2) return 1;
  const values = sheet.getRange(2, 1, maxRows - 1, COL.DATE).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i].some(function (v) { return v !== '' && v !== null; })) return i + 2;
  }
  return 1;
}

function findRowById_(sheet, id) {
  if (!id || sheet.getMaxRows() < 2) return -1;
  const cell = sheet.getRange(2, COL.ID, sheet.getMaxRows() - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : -1;
}

/** All job rows on a sheet as plain objects (only strings/booleans, safe to send to dialogs). */
function getJobRows_(sheet) {
  const last = findLastDataRow_(sheet);
  if (last < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sheet.getRange(2, 1, last - 1, NUM_COLS).getValues()
    .map(function (v, i) {
      const date = v[COL.DATE - 1];
      return {
        row: i + 2,
        title: String(v[COL.TITLE - 1]).trim(),
        company: String(v[COL.COMPANY - 1]).trim(),
        location: String(v[COL.LOCATION - 1]).trim(),
        salary: String(v[COL.SALARY - 1]).trim(),
        dateText: date instanceof Date ? Utilities.formatDate(date, tz, 'dd/MM/yyyy') : String(date),
        phone: v[COL.PHONE - 1] === true,
        interview: v[COL.INTERVIEW - 1] === true,
        offer: v[COL.OFFER - 1] === true,
        rejected: v[COL.REJECTED - 1] === true,
        reason: String(v[COL.REASON - 1]).trim(),
        source: String(v[COL.SOURCE - 1]).trim(),
        id: String(v[COL.ID - 1]).trim(),
        emailed: String(v[COL.EMAILED - 1]).trim(),
      };
    })
    .filter(function (j) { return j.title || j.company; });
}

// ---------------------------------------------------------------------------
// Dialog HTML
// ---------------------------------------------------------------------------

const DIALOG_CSS = `
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #202124; margin: 0; padding: 4px 6px; }
  label { display: block; font-size: 12px; font-weight: bold; color: #1f3864; margin: 12px 0 4px; }
  input[type=text], input[type=date], select, textarea {
    width: 100%; padding: 8px 10px; font-size: 14px; border: 1px solid #c4c9d4; border-radius: 6px;
  }
  input:focus, select:focus, textarea:focus { outline: none; border-color: #2557a7; box-shadow: 0 0 0 2px #d2e3fc; }
  .row { display: flex; gap: 12px; } .row > div { flex: 1; }
  .req { color: #c5221f; }
  .checks { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
  .check { display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid #dfe3eb;
           border-radius: 6px; cursor: pointer; font-size: 14px; }
  .check input { width: 18px; height: 18px; }
  .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
  button { padding: 9px 18px; font-size: 14px; border-radius: 6px; border: 1px solid #c4c9d4;
           background: #fff; cursor: pointer; }
  button.primary { background: #1f3864; color: #fff; border-color: #1f3864; }
  button:disabled { opacity: .6; cursor: default; }
  .error { color: #c5221f; font-size: 13px; margin-top: 10px; min-height: 16px; }
  .hidden { display: none; }
</style>`;

const NEW_JOB_HTML = DIALOG_CSS + `
<form id="f" onsubmit="submitForm(event)">
  <label>Job Title <span class="req">*</span></label>
  <input type="text" name="title" required autofocus>
  <label>Company <span class="req">*</span></label>
  <input type="text" name="company" required>
  <label>Location</label>
  <input type="text" name="location" placeholder="e.g. Manchester / Remote">
  <div class="row">
    <div><label>Salary</label><input type="text" name="salary" placeholder="e.g. £28,000"></div>
    <div><label>Date Applied</label><input type="date" name="date" id="date"></div>
  </div>
  <label>Job Site</label>
  <select name="source">{{SOURCES}}</select>
  <div class="error" id="err"></div>
  <div class="actions">
    <button type="button" onclick="google.script.host.close()">Cancel</button>
    <button type="submit" class="primary" id="save">Add Job</button>
  </div>
</form>
<script>
  const d = new Date();
  document.getElementById('date').value =
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  function submitForm(e) {
    e.preventDefault();
    const f = document.getElementById('f');
    const data = {};
    new FormData(f).forEach(function (v, k) { data[k] = v; });
    document.getElementById('save').disabled = true;
    google.script.run
      .withSuccessHandler(function () { google.script.host.close(); })
      .withFailureHandler(function (err) {
        document.getElementById('err').textContent = err.message;
        document.getElementById('save').disabled = false;
      })
      .addJob(data);
  }
</script>`;

const UPDATE_JOB_HTML = DIALOG_CSS + `
<div id="loading">Loading jobs…</div>
<form id="f" class="hidden" onsubmit="submitForm(event)">
  <label>Search</label>
  <input type="text" id="search" placeholder="Type to filter by job title or company" oninput="filterJobs()">
  <label>Job</label>
  <select id="job" size="6" onchange="showJob()"></select>
  <div class="checks">
    <label class="check"><input type="checkbox" id="phone"> Phone Interview</label>
    <label class="check"><input type="checkbox" id="interview"> Interview</label>
    <label class="check"><input type="checkbox" id="offer"> Job Offer</label>
    <label class="check"><input type="checkbox" id="rejected" onchange="toggleReason()"> Rejected</label>
  </div>
  <div id="reasonBox" class="hidden">
    <label>Reason for Rejection</label>
    <textarea id="reason" rows="3" placeholder="Why were you rejected? (optional)"></textarea>
  </div>
  <div class="error" id="err"></div>
  <div class="actions">
    <button type="button" onclick="google.script.host.close()">Cancel</button>
    <button type="submit" class="primary" id="save">Save</button>
  </div>
</form>
<script>
  let jobs = [];

  google.script.run
    .withSuccessHandler(function (res) {
      jobs = res.jobs;
      document.getElementById('loading').classList.add('hidden');
      if (!jobs.length) {
        document.getElementById('loading').textContent = 'No jobs yet – add one with Job Tracker → New Job.';
        document.getElementById('loading').classList.remove('hidden');
        return;
      }
      document.getElementById('f').classList.remove('hidden');
      filterJobs(res.selectedId || jobs[jobs.length - 1].id);
    })
    .withFailureHandler(function (err) { document.getElementById('loading').textContent = err.message; })
    .getJobsForUpdate();

  function filterJobs(selectId) {
    const q = document.getElementById('search').value.toLowerCase();
    const sel = document.getElementById('job');
    const current = typeof selectId === 'string' ? selectId : sel.value;
    sel.innerHTML = '';
    jobs.filter(function (j) { return j.label.toLowerCase().indexOf(q) !== -1; })
      .forEach(function (j) {
        const o = document.createElement('option');
        o.value = j.id; o.textContent = j.label;
        sel.appendChild(o);
      });
    sel.value = current;
    if (sel.selectedIndex === -1 && sel.options.length) sel.selectedIndex = 0;
    showJob();
  }

  function showJob() {
    const id = document.getElementById('job').value;
    const j = jobs.find(function (x) { return x.id === id; }) || {};
    ['phone', 'interview', 'offer', 'rejected'].forEach(function (k) {
      document.getElementById(k).checked = !!j[k];
    });
    document.getElementById('reason').value = j.reason || '';
    toggleReason();
  }

  function toggleReason() {
    document.getElementById('reasonBox').classList.toggle('hidden', !document.getElementById('rejected').checked);
  }

  function submitForm(e) {
    e.preventDefault();
    const data = { id: document.getElementById('job').value, reason: document.getElementById('reason').value };
    ['phone', 'interview', 'offer', 'rejected'].forEach(function (k) {
      data[k] = document.getElementById(k).checked;
    });
    document.getElementById('save').disabled = true;
    google.script.run
      .withSuccessHandler(function () { google.script.host.close(); })
      .withFailureHandler(function (err) {
        document.getElementById('err').textContent = err.message;
        document.getElementById('save').disabled = false;
      })
      .updateJob(data);
  }
</script>`;
