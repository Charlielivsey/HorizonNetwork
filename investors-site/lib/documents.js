'use strict';
// Documents for individual investors (the user's request, 25 October 2026: share certificates for each
// person holding shares). They ship with the site in investors-site/documents/ (index.json plus the PDFs) and
// each belongs to a holder named as on the Company Register: an investor sees only the documents of the
// register names their account is linked to. Nothing here is public.
const fs = require('node:fs');
const path = require('node:path');

const DIR = process.env.INVESTOR_DOCUMENTS_DIR || path.join(__dirname, '..', 'documents');
const key = (s) => String(s || '').trim().toLowerCase();
let list = [];
function load() {
  let raw = [];
  try { raw = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')); } catch { raw = []; }
  list = (Array.isArray(raw) ? raw : []).filter((d) => d && /^[a-z0-9-]{3,80}$/.test(d.id || '') && /^[a-z0-9-]+\.pdf$/.test(d.file || '') && d.holder && fs.existsSync(path.join(DIR, d.file)))
    .map((d) => ({ id: d.id, holder: String(d.holder), kind: String(d.kind || 'Document'), title: String(d.title || d.id), company: String(d.company || ''), detail: String(d.detail || ''), issued: /^\d{4}-\d{2}-\d{2}$/.test(d.issued || '') ? d.issued : '', file: d.file }));
}
// The documents an investor may see: those of the register names on their account.
function forInvestor(x) { const mine = new Set((x.holders || []).map(key)); return list.filter((d) => mine.has(key(d.holder))); }
function find(x, id) { return forInvestor(x).find((d) => d.id === id) || null; }
const filePath = (d) => path.join(DIR, d.file);
const all = () => list.slice();
load();
module.exports = { load, forInvestor, find, filePath, all };
