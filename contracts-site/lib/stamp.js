'use strict';
// The signed copy of a contract: each signature is written onto the PDF as soon as that person signs, without waiting
// for everyone else. The uploaded PDF is never changed (signatures are tied to its SHA-256); the signed copy is made from
// it whenever it's asked for and kept in memory.
//
// Where a signature goes: PDF.js reads the text and its positions, and a signing block is a heading ("On behalf of …",
// "The Employee", "Employee" or "Witness") with "Name:", "Signature:" and "Date:" lined up under it, as in the HN Group
// contract templates. Each signer fills the block that matches what they sign as. Anyone without a matching block is
// added to an "Electronic signatures" page at the end. Both libraries are kept in lib/vendor (pdf-lib 1.17.1, MIT;
// PDF.js 4.10.38 legacy build, Apache-2.0).
const path = require('path');
const { pathToFileURL } = require('url');
const PDFLib = require('./vendor/pdf-lib.min.js');

const PURPLE = PDFLib.rgb(0x55 / 255, 0x14 / 255, 0xB4 / 255), INK = PDFLib.rgb(0.09, 0.09, 0.11), GREY = PDFLib.rgb(0.35, 0.36, 0.42), LINE = PDFLib.rgb(0.9, 0.88, 0.93);
const HEADING = /^(on behalf of .+|the employee|employee|the witness|witness)$/i;
const LABEL = /^(name|signature|date)\s*:?$/i;

let pdfjs = null;
async function loadPdfjs() {
  if (!pdfjs) {
    const worker = await import(pathToFileURL(path.join(__dirname, 'vendor', 'pdfjs-legacy.worker.min.mjs')).href);
    globalThis.pdfjsWorker = worker;
    // Only text is read, never drawn, so PDF.js's warnings about missing canvas support don't apply.
    const warn = console.warn, log = console.log, quiet = (f) => (...a) => { if (!/canvas|polyfill/i.test(String(a[0]))) f(...a); };
    console.warn = quiet(warn); console.log = quiet(log);
    try { pdfjs = await import(pathToFileURL(path.join(__dirname, 'vendor', 'pdfjs-legacy.min.mjs')).href); } finally { console.warn = warn; console.log = log; }
  }
  return pdfjs;
}

// The signing blocks in a PDF: [{ page, heading, right, name: {x, y}, signature: {x, y}, date: {x, y} }] (PDF points).
const blockCache = new Map();
async function blocks(bytes, sha256) {
  if (blockCache.has(sha256)) return blockCache.get(sha256);
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  const found = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n), width = page.getViewport({ scale: 1 }).viewBox[2];
      const items = (await page.getTextContent()).items.filter((i) => i.str && i.str.trim()).map((i) => ({ text: i.str.trim().replace(/\s+/g, ' '), x: i.transform[4], y: i.transform[5], width: i.width, size: Math.abs(i.transform[3]) || 10 }));
      const headings = items.filter((i) => HEADING.test(i.text)), labels = items.filter((i) => LABEL.test(i.text));
      for (const h of headings) {
        const below = labels.filter((l) => Math.abs(l.x - h.x) < 4 && l.y < h.y && h.y - l.y < 140);
        const pick = (kind) => below.filter((l) => l.text.toLowerCase().startsWith(kind)).sort((a, b) => b.y - a.y)[0];
        const name = pick('name'), signature = pick('signature'), date = pick('date');
        if (!name || !signature || !date) continue;
        const next = headings.filter((o) => o !== h && Math.abs(o.y - h.y) < 3 && o.x > h.x).sort((a, b) => a.x - b.x)[0];
        const at = (l) => ({ x: l.x + l.width + 6, y: l.y, size: l.size });
        found.push({ page: n - 1, heading: h.text, right: next ? next.x - 8 : Math.max(h.x + h.width, width - 57), name: at(name), signature: at(signature), date: at(date) });
      }
    }
  } finally { await doc.destroy(); }
  blockCache.set(sha256, found);
  if (blockCache.size > 200) blockCache.delete(blockCache.keys().next().value);
  return found;
}

// Which block a signer fills: the one headed with exactly what they sign as, or for "Employee"/"Witness" any heading
// naming that; someone signing on behalf of a company falls back to the only "On behalf of" block if there's just one.
function match(role, free) {
  const r = String(role || '').toLowerCase();
  if (!r) return null;
  const exact = free.find((b) => b.heading.toLowerCase() === r);
  if (exact) return exact;
  if (r === 'employee' || r === 'witness') return free.find((b) => b.heading.toLowerCase().includes(r)) || null;
  if (r.startsWith('on behalf of ')) { const behalf = free.filter((b) => /^on behalf of /i.test(b.heading)); if (behalf.length === 1) return behalf[0]; }
  return null;
}

const longDay = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
const timeOf = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
// The standard PDF fonts only have Western European characters; anything else becomes "?" rather than failing.
function fit(font, text) { const ok = new Set(font.getCharacterSet()); return Array.from(String(text || '')).map((ch) => (ok.has(ch.codePointAt(0)) ? ch : '?')).join(''); }
function draw(page, font, text, x, y, size, max, color) {
  text = fit(font, text);
  let s = size; while (s > 6 && font.widthOfTextAtSize(text, s) > max) s -= 0.5;
  page.drawText(text, { x, y, size: s, font, color });
}

// The signed copy, or null when nobody has signed yet.
const copies = new Map();
async function signedCopy(bytes, c) {
  const signed = c.signers.filter((s) => s.status === 'signed' && s.signature);
  if (!signed.length) return null;
  const key = c.id + ':' + c.file.sha256 + ':' + signed.map((s) => s.id + '@' + s.signedAt).join(',');
  if (copies.has(key)) return copies.get(key);
  const found = await blocks(bytes, c.file.sha256).catch(() => []);
  const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const regular = await doc.embedFont(PDFLib.StandardFonts.Helvetica), bold = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold), italic = await doc.embedFont(PDFLib.StandardFonts.HelveticaBoldOblique);
  const pages = doc.getPages(), free = found.slice(), rest = [];
  for (const s of c.signers) {
    const b = match(s.role, free);
    if (b) free.splice(free.indexOf(b), 1);
    if (s.status !== 'signed' || !s.signature) continue;
    if (!b || !pages[b.page]) { rest.push(s); continue; }
    const page = pages[b.page], size = b.name.size || 10;
    draw(page, regular, s.signature.typed, b.name.x, b.name.y, size, b.right - b.name.x, INK);
    draw(page, italic, s.signature.typed, b.signature.x, b.signature.y - 1, size + 4, b.right - b.signature.x, PURPLE);
    draw(page, regular, longDay(s.signedAt), b.date.x, b.date.y, size, b.right - b.date.x, INK);
  }
  if (rest.length) {
    const last = pages[pages.length - 1], [w, h] = last ? [last.getWidth(), last.getHeight()] : [595.28, 841.89];
    let page = doc.addPage([w, h]), y = h - 90;
    const head = () => {
      page.drawText('Electronic signatures', { x: 57, y, size: 18, font: bold, color: INK }); y -= 22;
      page.drawText(fit(regular, 'Signed with HN Group Contracts on ' + c.title + '. The signing certificate has the full record.'), { x: 57, y, size: 9, font: regular, color: GREY, maxWidth: w - 114 }); y -= 30;
    };
    head();
    for (const s of rest) {
      if (y < 150) { page = doc.addPage([w, h]); y = h - 90; head(); }
      page.drawRectangle({ x: 57, y: y - 84, width: w - 114, height: 96, borderColor: LINE, borderWidth: 1 });
      draw(page, bold, s.role || 'Signed by', 69, y - 6, 10, w - 138, GREY);
      draw(page, regular, 'Name: ' + s.signature.typed, 69, y - 26, 10, w - 138, INK);
      page.drawText('Signature:', { x: 69, y: y - 50, size: 10, font: regular, color: INK });
      draw(page, italic, s.signature.typed, 69 + regular.widthOfTextAtSize('Signature:', 10) + 6, y - 51, 14, w - 220, PURPLE);
      draw(page, regular, 'Date: ' + timeOf(s.signedAt), 69, y - 74, 10, w - 138, INK);
      y -= 112;
    }
  }
  const out = Buffer.from(await doc.save({ useObjectStreams: false }));
  copies.set(key, out);
  if (copies.size > 50) copies.delete(copies.keys().next().value);
  return out;
}

module.exports = { signedCopy, blocks, loadPdfjs };
