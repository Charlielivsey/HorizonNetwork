'use strict';
// Builds simple one-page A4 PDF documents (title plus labelled lines) for filings the register
// generates itself. Uses the standard Helvetica fonts, so no font files are needed.

// PDF strings use Latin-1 with (, ) and \ escaped; anything outside Latin-1 becomes "?".
function pdfText(s) {
  return String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// Wraps text to roughly `width` characters per line.
function wrap(text, width) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if ((line + ' ' + word).trim().length > width) { if (line) out.push(line); line = word; } else line = (line + ' ' + word).trim();
    }
    out.push(line);
  }
  return out;
}

// Writes pages (arrays of drawing operations) out as a PDF file.
function assemble(pages) {
  const fonts = 3 + pages.length * 2; // catalog, pages, then a page and its contents for each page
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => (3 + i * 2) + ' 0 R').join(' ')}] /Count ${pages.length} >>`];
  pages.forEach((ops, i) => {
    const content = ops.join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fonts} 0 R /F2 ${fonts + 1} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// A page writer: text at a moving position, with new pages added as needed.
function writer(heading, subheading) {
  const pages = [];
  let ops, y;
  const text = (x, size, font, s) => ops.push(`BT /${font} ${size} Tf ${x} ${y} Td (${pdfText(s)}) Tj ET`);
  const rule = (at, grey) => ops.push(`${grey || 0.8} ${grey || 0.8} ${grey || 0.8} RG 56 ${at} m 539 ${at} l S 0 0 0 RG`);
  function newPage() {
    ops = []; pages.push(ops); y = 790;
    ops.push('0.333 0.078 0.706 rg 0 822 595 20 re f 0 0 0 rg'); // purple band across the top
    text(56, 11, 'F2', 'COMPANY REGISTER');
    if (pages.length === 1) {
      y -= 34; text(56, 20, 'F2', heading);
      if (subheading) { y -= 22; text(56, 12, 'F1', subheading); }
    } else { y -= 22; text(56, 9, 'F1', heading); }
    y -= 14; rule(y); y -= 26;
  }
  newPage();
  return {
    text, rule,
    get y() { return y; }, set y(v) { y = v; },
    room(h) { if (y - h < 100) newPage(); },
    pages, newPage,
  };
}
function footers(pages, footer) {
  pages.forEach((ops, i) => {
    let y = 70;
    ops.push(`0.8 0.8 0.8 RG 56 ${y + 16} m 539 ${y + 16} l S 0 0 0 RG`);
    for (const l of wrap(footer || '', 95)) { ops.push(`BT /F1 8 Tf 56 ${y} Td (${pdfText(l)}) Tj ET`); y -= 11; }
    if (pages.length > 1) ops.push(`BT /F1 8 Tf 490 40 Td (${pdfText('Page ' + (i + 1) + ' of ' + pages.length)}) Tj ET`);
  });
}

function rowsOut(w, rows) {
  for (const [label, value] of rows) {
    const lines = wrap(value || 'Not recorded', 58);
    w.room(15 * lines.length + 7);
    w.text(56, 10, 'F2', label);
    for (const l of lines) { w.text(220, 10, 'F1', l); w.y -= 15; }
    w.y -= 7;
  }
}

// doc: { heading, subheading, rows: [[label, value]], footer }: a one-page filing document.
function build(doc) {
  const w = writer(doc.heading, doc.subheading);
  for (const [label, value] of doc.rows) {
    if (w.y < 120) break;
    w.text(56, 10, 'F2', label);
    for (const l of wrap(value || 'Not recorded', 58)) { w.text(220, 10, 'F1', l); w.y -= 15; }
    w.y -= 7;
  }
  footers(w.pages, doc.footer);
  return assemble(w.pages);
}

// doc: { heading, subheading, footer, sections: [{ title, subtitle, rows, list: { title, items } }] }:
// a report over as many pages as it needs.
function report(doc) {
  const w = writer(doc.heading, doc.subheading);
  doc.sections.forEach((sec, i) => {
    if (sec.newPage && i) w.newPage();
    w.room(60);
    w.text(56, sec.level === 2 ? 11 : 14, 'F2', sec.title); w.y -= sec.level === 2 ? 16 : 18;
    if (sec.subtitle) { for (const l of wrap(sec.subtitle, 90)) { w.text(56, 9, 'F1', l); w.y -= 13; } }
    w.y -= 6;
    if (sec.rows) rowsOut(w, sec.rows);
    if (sec.lines) for (const line of sec.lines) {
      const lines = wrap(line, 92);
      w.room(13 * lines.length);
      lines.forEach((l, k) => { w.text(k ? 66 : 56, 10, 'F1', l); w.y -= 13; });
      w.y -= 3;
    }
    w.y -= 8;
  });
  footers(w.pages, doc.footer);
  return assemble(w.pages);
}

module.exports = { build, report };
