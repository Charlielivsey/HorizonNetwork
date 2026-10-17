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

// doc: { heading, subheading, rows: [[label, value]], footer }
function build(doc) {
  const ops = [];
  let y = 790;
  const text = (x, size, font, s) => ops.push(`BT /${font} ${size} Tf ${x} ${y} Td (${pdfText(s)}) Tj ET`);
  ops.push('0.333 0.078 0.706 rg 0 822 595 20 re f 0 0 0 rg'); // purple band across the top
  text(56, 11, 'F2', 'COMPANY REGISTER');
  y -= 34; text(56, 20, 'F2', doc.heading);
  if (doc.subheading) { y -= 22; text(56, 12, 'F1', doc.subheading); }
  y -= 14; ops.push(`0.8 0.8 0.8 RG 56 ${y} m 539 ${y} l S 0 0 0 RG`);
  y -= 26;
  for (const [label, value] of doc.rows) {
    if (y < 120) break;
    text(56, 10, 'F2', label);
    const lines = wrap(value || 'Not recorded', 58);
    for (const l of lines) { text(220, 10, 'F1', l); y -= 15; }
    y -= 7;
  }
  y = 70; ops.push(`0.8 0.8 0.8 RG 56 ${y + 16} m 539 ${y + 16} l S 0 0 0 RG`);
  for (const l of wrap(doc.footer || '', 95)) { text(56, 8, 'F1', l); y -= 11; }
  const content = ops.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

module.exports = { build };
