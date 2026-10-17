'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Builds the register's own PDF documents: filing forms (one A4 page per filing, continuing onto more
// pages if needed) and company reports. Uses the standard Helvetica fonts, so no font files are needed.
// Every page has the HN Group header, a form code, the company's details and a
// footer with the document reference and page number.

const W = 595, H = 842, L = 48, R = W - 48;
const COLOURS = { ink: '0.043 0.047 0.047', grey: '0.314 0.353 0.373', rule: '0.694 0.706 0.714', light: '0.953 0.949 0.945', brand: '0.333 0.078 0.706', green: '0 0.439 0.235', white: '1 1 1' };
// Character widths (per 1000 units) for printable ASCII, Helvetica and Helvetica-Bold.
const WIDTHS = {
  F1: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
  F2: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584],
};
// The HN Group wordmark (white, for the black header), read from the site's copy of the approved logo:
// its letters as one path and the stepped colour stripe as rectangles, in the logo's own drawing space.
const WORDMARK = (() => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'brand', 'hn-group-wordmark-white.svg'), 'utf8');
  const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const paths = [...svg.matchAll(/<path(?: transform="translate\(([\d.-]+) ([\d.-]+)\)")? fill="(#[0-9A-Fa-f]{6})" d="([^"]+)"/g)].map((m) => ({ dx: Number(m[1] || 0), dy: Number(m[2] || 0), fill: m[3], d: m[4] }));
  const rects = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], fill: m[5] }));
  return { w: Number(box[1]), h: Number(box[2]), paths, rects };
})();
const rgb = (hex) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');

// Plain characters only: curly quotes and dashes become their plain forms; anything outside Latin-1 becomes "?".
const plain = (s) => String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
const esc = (s) => plain(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const width = (s, font, size) => [...plain(s)].reduce((w, ch) => { const c = ch.charCodeAt(0); return w + ((c >= 32 && c <= 126 ? WIDTHS[font][c - 32] : 556)); }, 0) * size / 1000;

// Wraps text to fit `max` points.
function wrap(text, font, size, max) {
  const out = [];
  for (const para of String(text == null ? '' : text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + word : word;
      if (width(next, font, size) > max && line) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

// Converts the simple SVG paths used by the roundel (M, L, H, V, h, v, l, z) to PDF path operators.
function svgPath(d, ox, oy, scale) {
  const ops = []; let x = 0, y = 0, sx = 0, sy = 0;
  const pt = (px, py) => (ox + px * scale).toFixed(2) + ' ' + (oy - py * scale).toFixed(2);
  const tokens = d.match(/[MLHVQZmlhvz]|-?\d*\.?\d+(?:e-?\d+)?/g);
  let cmd = '';
  for (let i = 0; i < tokens.length;) {
    if (/[A-Za-z]/.test(tokens[i])) { cmd = tokens[i++]; if (cmd === 'z' || cmd === 'Z') { ops.push('h'); x = sx; y = sy; } continue; }
    const n = () => Number(tokens[i++]);
    switch (cmd) {
      case 'M': x = n(); y = n(); sx = x; sy = y; ops.push(pt(x, y) + ' m'); cmd = 'L'; break;
      case 'L': x = n(); y = n(); ops.push(pt(x, y) + ' l'); break;
      case 'Q': { // a quadratic curve, drawn as the equivalent cubic one
        const qx = n(), qy = n(), ex = n(), ey = n();
        ops.push(pt(x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y)) + ' ' + pt(ex + 2 / 3 * (qx - ex), ey + 2 / 3 * (qy - ey)) + ' ' + pt(ex, ey) + ' c');
        x = ex; y = ey; break;
      }
      case 'l': x += n(); y += n(); ops.push(pt(x, y) + ' l'); break;
      case 'H': x = n(); ops.push(pt(x, y) + ' l'); break;
      case 'h': x += n(); ops.push(pt(x, y) + ' l'); break;
      case 'V': y = n(); ops.push(pt(x, y) + ' l'); break;
      case 'v': y += n(); ops.push(pt(x, y) + ' l'); break;
      default: i++;
    }
  }
  return ops.join(' ');
}

// A drawing surface for one document: pages, text, boxes and the shared header and footer.
function canvas(meta) {
  const pages = [];
  let ops, y;
  const api = {
    get y() { return y; }, set y(v) { y = v; },
    text(x, yy, size, font, s, colour) { ops.push(`BT ${COLOURS[colour || 'ink']} rg /${font} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td (${esc(s)}) Tj ET`); },
    right(x, yy, size, font, s, colour) { api.text(x - width(s, font, size), yy, size, font, s, colour); },
    rect(x, yy, w, h, fill, stroke, lw) { ops.push(`${lw || 0.8} w ${fill ? COLOURS[fill] + ' rg ' : ''}${stroke ? COLOURS[stroke] + ' RG ' : ''}${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`); },
    line(x1, y1, x2, y2, colour, lw) { ops.push(`${lw || 0.8} w ${COLOURS[colour || 'rule']} RG ${x1} ${y1} m ${x2} ${y2} l S`); },
    page() {
      ops = []; pages.push(ops);
      // Black header with the white HN Group wordmark, the register's name and the form code.
      api.rect(0, H - 78, W, 78, 'ink');
      api.rect(0, H - 84, W, 6, 'brand');
      const ws = 46 / WORDMARK.h, ox = L, oy = H - 15;
      for (const p of WORDMARK.paths) ops.push(`${rgb(p.fill)} rg ` + svgPath(p.d, ox + p.dx * ws, oy - p.dy * ws, ws) + ' f*');
      for (const r of WORDMARK.rects) ops.push(`${rgb(r.fill)} rg ${(ox + r.x * ws).toFixed(2)} ${(oy - (r.y + r.h) * ws).toFixed(2)} ${(r.w * ws).toFixed(2)} ${(r.h * ws).toFixed(2)} re f`);
      const tx = ox + WORDMARK.w * ws + 16;
      api.line(tx - 8, H - 24, tx - 8, H - 58, 'grey', 0.8);
      api.text(tx, H - 38, 12, 'F2', 'Company Register', 'white');
      api.text(tx, H - 53, 8.5, 'F1', 'HN Group Limited', 'white');
      if (meta.code) {
        const label = 'FORM', code = meta.code, bw = Math.max(width(code, 'F2', 16), width(label, 'F1', 7)) + 22;
        api.rect(R - bw, H - 62, bw, 40, null, 'white', 1.2);
        api.text(R - bw + 11, H - 35, 7, 'F1', label, 'white');
        api.text(R - bw + 11, H - 54, 16, 'F2', code, 'white');
      }
      y = H - 116;
      if (pages.length > 1) { api.text(L, y, 10, 'F2', meta.heading + (meta.company ? ' - ' + meta.company : ''), 'grey'); y -= 24; }
    },
    room(h) { if (y - h < 96) api.page(); },
    finish() {
      pages.forEach((p, i) => {
        ops = p;
        api.line(L, 78, R, 78, 'rule', 0.8);
        let fy = 64;
        for (const l of wrap(meta.footer || '', 'F1', 7.5, R - L - 175)) { api.text(L, fy, 7.5, 'F1', l, 'grey'); fy -= 10; }
        api.right(R, 64, 7.5, 'F2', 'Page ' + (i + 1) + ' of ' + pages.length, 'grey');
        if (meta.reference) api.right(R, 54, 7.5, 'F1', 'Ref ' + meta.reference, 'grey');
      });
      return assemble(pages, meta);
    },
  };
  api.page();
  return api;
}

// The title and the company's name and number, as at the top of each form.
function titleBlock(c, meta) {
  for (const l of wrap(meta.heading, 'F2', 22, R - L)) { c.text(L, c.y, 22, 'F2', l); c.y -= 26; }
  if (meta.subtitle) { c.y += 4; for (const l of wrap(meta.subtitle, 'F1', 11, R - L)) { c.text(L, c.y, 11, 'F1', l, 'grey'); c.y -= 15; } }
  c.y -= 8;
  if (meta.company !== undefined) {
    const nameW = (R - L) * 0.68, gap = 10, numW = R - L - nameW - gap;
    const lines = wrap(meta.company || 'Not recorded', 'F2', 12, nameW - 20);
    const h = 30 + lines.length * 15;
    c.rect(L, c.y - h, nameW, h, 'light', null);
    c.rect(L + nameW + gap, c.y - h, numW, h, 'light', null);
    c.text(L + 10, c.y - 15, 7.5, 'F2', 'COMPANY NAME', 'grey');
    c.text(L + nameW + gap + 10, c.y - 15, 7.5, 'F2', 'COMPANY NUMBER', 'grey');
    lines.forEach((l, i) => c.text(L + 10, c.y - 31 - i * 15, 12, 'F2', l));
    c.text(L + nameW + gap + 10, c.y - 31, 12, 'F2', meta.number || 'Not recorded', meta.number ? 'ink' : 'grey');
    c.y -= h + 26;
  }
}

function sectionHeading(c, title, number) {
  c.room(60);
  c.rect(L, c.y - 4, 4, 18, 'brand');
  c.text(L + 12, c.y, 13, 'F2', (number ? number + '. ' : '') + title);
  c.y -= 24;
}

// Labelled answers, each in a form-style box, as a filled-in form would show them.
function fields(c, rows) {
  const labelW = 150, boxX = L + labelW + 12, boxW = R - boxX;
  rows.forEach(([label, value], i) => {
    const empty = value == null || value === '';
    const lines = wrap(empty ? 'Not recorded' : value, 'F1', 10.5, boxW - 16);
    const labelLines = wrap(label, 'F2', 9.5, labelW);
    const h = Math.max(lines.length * 14 + 12, labelLines.length * 12 + 8, 26);
    c.room(h + 8);
    labelLines.forEach((l, k) => c.text(L, c.y - 14 - k * 12, 9.5, 'F2', l));
    c.rect(boxX, c.y - h, boxW, h, 'white', 'rule', 0.9);
    lines.forEach((l, k) => c.text(boxX + 8, c.y - 16 - k * 14, 10.5, 'F1', l, empty ? 'grey' : 'ink'));
    c.y -= h + 8;
  });
}

// Compact label and value rows, for reports.
function table(c, rows) {
  const labelW = 160, vx = L + labelW + 10, vw = R - vx;
  for (const [label, value] of rows) {
    const empty = value == null || value === '';
    const lines = wrap(empty ? 'Not recorded' : value, 'F1', 10, vw);
    const h = lines.length * 13 + 9;
    c.room(h + 2);
    c.text(L, c.y - 12, 9.5, 'F2', label, 'grey');
    lines.forEach((l, k) => c.text(vx, c.y - 12 - k * 13, 10, 'F1', l, empty ? 'grey' : 'ink'));
    c.y -= h;
    c.line(L, c.y, R, c.y, 'light', 0.8);
  }
  c.y -= 6;
}

// The register's stamp showing the filing was recorded, and when.
function stamp(c, date, reference) {
  c.room(80);
  c.y -= 10;
  const w = 190, h = 58, x = R - w;
  c.rect(x, c.y - h, w, h, null, 'green', 1.6);
  c.rect(x + 3, c.y - h + 3, w - 6, h - 6, null, 'green', 0.6);
  c.text(x + 14, c.y - 18, 8, 'F2', 'FILED ON THE COMPANY REGISTER', 'green');
  c.text(x + 14, c.y - 36, 13, 'F2', date || 'Date not recorded', 'green');
  if (reference) c.text(x + 14, c.y - 49, 7, 'F1', 'Document ' + reference, 'green');
  c.text(L, c.y - 22, 9, 'F1', 'Generated by the Company Register from the details recorded', 'grey');
  c.text(L, c.y - 34, 9, 'F1', 'when this filing was made.', 'grey');
  c.y -= h + 10;
}

// doc: { code, heading, company, number, rows: [[label, value]], date, reference, footer }
function build(doc) {
  const c = canvas(doc);
  titleBlock(c, doc);
  sectionHeading(c, 'Details of this filing');
  fields(c, doc.rows || []);
  stamp(c, doc.date, doc.reference);
  return c.finish();
}

// doc: { code, heading, subtitle, footer, reference, sections: [{ title, subtitle, rows, lines, newPage, level }] }
function report(doc) {
  const c = canvas(doc);
  titleBlock(c, { heading: doc.heading, subtitle: doc.subtitle || doc.subheading });
  doc.sections.forEach((sec, i) => {
    if (sec.newPage && i) c.page();
    if (sec.level === 2) {
      c.room(50);
      c.text(L, c.y, 11, 'F2', sec.title); c.y -= 6; c.line(L, c.y, R, c.y, 'rule', 0.8); c.y -= 14;
    } else {
      c.room(70);
      c.rect(L, c.y - 30, R - L, 36, 'light');
      c.rect(L, c.y - 30, 4, 36, 'brand');
      c.text(L + 14, c.y - 12, 14, 'F2', sec.title);
      if (sec.subtitle) c.text(L + 14, c.y - 25, 8.5, 'F1', sec.subtitle, 'grey');
      c.y -= 48;
    }
    if (sec.rows) table(c, sec.rows);
    if (sec.lines) for (const line of sec.lines) {
      const indent = (/^ */.exec(line)[0].length / 2) * 14;
      const body = line.trim();
      const lines = wrap(body, 'F1', 10, R - L - 14 - indent);
      c.room(13 * lines.length + 4);
      c.rect(L + indent, c.y + 2.5, 3, 3, 'brand');
      lines.forEach((l, k) => { c.text(L + 10 + indent, c.y, 10, 'F1', l); c.y -= 13; });
      c.y -= 3;
    }
    c.y -= 12;
  });
  return c.finish();
}

// Writes pages (lists of drawing operators) out as a PDF file.
function assemble(pages, meta) {
  const fonts = 3 + pages.length * 2;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => (3 + i * 2) + ' 0 R').join(' ')}] /Count ${pages.length} >>`];
  pages.forEach((ops, i) => {
    const content = ops.join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${fonts} 0 R /F2 ${fonts + 1} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  objects.push(`<< /Title (${esc(meta.heading + (meta.company ? ' - ' + meta.company : ''))}) /Author (HN Group Limited) /Creator (Company Register) >>`);
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// Reads back the heading, company line and rows from a filing made with the register's first, plain
// design, so it can be drawn again in this one. Returns null for anything else (such as uploaded PDFs).
function readLegacy(buffer) {
  const s = buffer.toString('latin1');
  if (!s.includes('(COMPANY REGISTER) Tj') || s.includes('/Creator (Company Register)')) return null;
  const unesc = (t) => t.replace(/\\([\\()])/g, '$1');
  const items = [...s.matchAll(/BT \/(F[12]) ([\d.]+) Tf ([\d.]+) ([\d.]+) Td \(((?:\\.|[^\\)])*)\) Tj ET/g)].map((m) => ({ font: m[1], size: Number(m[2]), x: Number(m[3]), y: Number(m[4]), text: unesc(m[5]) }));
  const heading = items.find((t) => t.size === 20);
  if (!heading) return null;
  const sub = items.find((t) => t.size === 12 && t.font === 'F1');
  const rows = [];
  for (const t of items) {
    if (t.size !== 10) continue;
    if (t.font === 'F2' && t.x === 56) rows.push([t.text, '']);
    else if (t.font === 'F1' && t.x === 220 && rows.length) { const r = rows[rows.length - 1]; r[1] = r[1] ? r[1] + ' ' + t.text : t.text; }
  }
  for (const r of rows) if (r[1] === 'Not recorded') r[1] = '';
  let company = sub ? sub.text : '', number = '';
  const m = /^(.*) \(company number (.+)\)$/.exec(company);
  if (m) { company = m[1]; number = m[2]; }
  return { heading: heading.text, company, number, rows };
}

module.exports = { build, report, readLegacy };
