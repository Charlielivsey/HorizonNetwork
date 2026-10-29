'use strict';
// Download as PDF: turns a document into an A4 PDF on the server, laid out like the page in the editor (the company
// logo, the HN stripe, the details, the text and the sign-off), with Plus Jakarta Sans embedded, the company footer
// and page numbers on every page, and "Private & confidential" at the top of every page when the document is marked
// so. No print dialog is involved, so the browser adds nothing to it. The text comes from the document's cleaned HTML
// (see sanitize.js), so only its short list of formatting tags needs handling here.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { decode } = require('./sanitize');

const ASSETS = path.join(__dirname, 'pdf-assets');
const MM = 72 / 25.4;
const PAGE = { w: 595.28, h: 841.89, left: 20 * MM, right: 20 * MM, top: 18 * MM, bottom: 26 * MM };
const CONTENT_W = PAGE.w - PAGE.left - PAGE.right;
const C = { ink: '#1B1A21', muted: '#5E6070', faint: '#6E6F7E', rule: '#ECE9F2', ruleDark: '#DCD7E6', purple: '#5514B4', deep: '#3A1290', red: '#B4234F', quote: '#3B3A45', pink: '#E97DE8', head: '#F4F1FA' };
const STRIPE = [['#e97de8', 14], ['#5514b4', 14], ['#e3e65b', 6], ['#3e9ba3', 20], ['#7a1f6c', 10], ['#c2306b', 10], ['#5fae7b', 13], ['#1c2135', 13]];
const rgb = (hex) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
const n = (v) => (Math.round(v * 100) / 100).toString();

// ---------- Fonts (TrueType, embedded whole, written as glyph ids) ----------
function readFont(file) {
  const b = fs.readFileSync(path.join(ASSETS, file));
  const tables = {};
  for (let i = 0, count = b.readUInt16BE(4); i < count; i++) {
    const at = 12 + i * 16;
    tables[b.toString('latin1', at, at + 4)] = { off: b.readUInt32BE(at + 8), len: b.readUInt32BE(at + 12) };
  }
  const head = tables.head.off, hhea = tables.hhea.off, os2 = tables['OS/2'].off, post = tables.post.off;
  const unitsPerEm = b.readUInt16BE(head + 18);
  const bbox = [b.readInt16BE(head + 36), b.readInt16BE(head + 38), b.readInt16BE(head + 40), b.readInt16BE(head + 42)];
  const ascent = b.readInt16BE(hhea + 4), descent = b.readInt16BE(hhea + 6), metrics = b.readUInt16BE(hhea + 34);
  const capHeight = tables['OS/2'].len >= 90 ? b.readInt16BE(os2 + 88) : ascent;
  const italicAngle = b.readInt32BE(post + 4) / 65536;
  const advances = [];
  for (let i = 0; i < metrics; i++) advances.push(b.readUInt16BE(tables.hmtx.off + i * 4));
  // Character → glyph, from the Unicode cmap (format 12 if there is one, otherwise format 4).
  const map = new Map(), cmap = tables.cmap.off;
  const subtables = [];
  for (let i = 0, count = b.readUInt16BE(cmap + 2); i < count; i++) {
    const at = cmap + 4 + i * 8, platform = b.readUInt16BE(at), encoding = b.readUInt16BE(at + 2), off = cmap + b.readUInt32BE(at + 4);
    if ((platform === 3 && (encoding === 1 || encoding === 10)) || platform === 0) subtables.push({ off, format: b.readUInt16BE(off) });
  }
  const t12 = subtables.find((t) => t.format === 12), t4 = subtables.find((t) => t.format === 4);
  if (t12) {
    for (let i = 0, groups = b.readUInt32BE(t12.off + 12); i < groups; i++) {
      const at = t12.off + 16 + i * 12, start = b.readUInt32BE(at), end = b.readUInt32BE(at + 4), gid = b.readUInt32BE(at + 8);
      for (let c = start; c <= end && c < 0x30000; c++) map.set(c, gid + c - start);
    }
  } else if (t4) {
    const segs = b.readUInt16BE(t4.off + 6) / 2, ends = t4.off + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
    for (let s = 0; s < segs; s++) {
      const end = b.readUInt16BE(ends + s * 2), start = b.readUInt16BE(starts + s * 2), delta = b.readInt16BE(deltas + s * 2), range = b.readUInt16BE(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let gid;
        if (!range) gid = (c + delta) & 0xffff;
        else { const g = b.readUInt16BE(ranges + s * 2 + range + (c - start) * 2); gid = g ? (g + delta) & 0xffff : 0; }
        if (gid) map.set(c, gid);
      }
    }
  }
  const advance = (gid) => advances[Math.min(gid, advances.length - 1)] * 1000 / unitsPerEm;
  return { bytes: b, unitsPerEm, bbox: bbox.map((v) => Math.round(v * 1000 / unitsPerEm)), ascent: Math.round(ascent * 1000 / unitsPerEm), descent: Math.round(descent * 1000 / unitsPerEm),
    capHeight: Math.round(capHeight * 1000 / unitsPerEm), italicAngle, map, advance, name: file.replace(/\.ttf$/, '') };
}
const FONT_FILES = { regular: 'PlusJakartaSans-Regular.ttf', bold: 'PlusJakartaSans-Bold.ttf', heavy: 'PlusJakartaSans-ExtraBold.ttf', italic: 'PlusJakartaSans-Italic.ttf', boldItalic: 'PlusJakartaSans-BoldItalic.ttf' };
let FONTS = null;
const fonts = () => FONTS || (FONTS = Object.fromEntries(Object.entries(FONT_FILES).map(([k, f]) => [k, readFont(f)])));

// ---------- PNG pictures (8-bit RGB or RGBA, as resvg makes them) ----------
const PICTURES = new Map();
function picture(file) {
  if (PICTURES.has(file)) return PICTURES.get(file);
  const b = fs.readFileSync(path.join(ASSETS, file));
  let at = 8, width, height, depth, type; const idat = [];
  while (at < b.length) {
    const len = b.readUInt32BE(at), kind = b.toString('latin1', at + 4, at + 8), data = b.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; if (data[12]) throw new Error('Interlaced PNGs aren’t supported.'); }
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    at += 12 + len;
  }
  if (depth !== 8 || (type !== 6 && type !== 2)) throw new Error('Only 8-bit RGB and RGBA PNGs are supported.');
  const bpp = type === 6 ? 4 : 3, stride = width * bpp, raw = zlib.inflateSync(Buffer.concat(idat)), out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = out.subarray(y * stride, (y + 1) * stride), prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0, up = prev ? prev[x] : 0, ul = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a; else if (filter === 2) v += up; else if (filter === 3) v += (a + up) >> 1;
      else if (filter === 4) { const p = a + up - ul, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - ul); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : ul; }
      row[x] = v & 255;
    }
  }
  const colour = Buffer.alloc(width * height * 3), alpha = type === 6 ? Buffer.alloc(width * height) : null;
  for (let i = 0; i < width * height; i++) { out.copy(colour, i * 3, i * bpp, i * bpp + 3); if (alpha) alpha[i] = out[i * bpp + 3]; }
  const pic = { width, height, colour: zlib.deflateSync(colour), alpha: alpha && zlib.deflateSync(alpha) };
  PICTURES.set(file, pic);
  return pic;
}

// ---------- Reading the document's HTML into a small tree ----------
function parseHtml(html) {
  const root = { tag: 'root', attrs: {}, children: [] }, stack = [root];
  const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) { top.children.push({ text: decode(m[4]) }); continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) { const at = stack.map((x) => x.tag).lastIndexOf(tag); if (at > 0) stack.length = at; continue; }
    const attrs = {};
    for (const a of m[3].matchAll(/([a-z-]+)="([^"]*)"/gi)) attrs[a[1].toLowerCase()] = decode(a[2]);
    const node = { tag, attrs, children: [] };
    top.children.push(node);
    if (tag !== 'br' && tag !== 'hr') stack.push(node);
  }
  return root;
}
const alignOf = (node) => (/text-align:(left|center|right|justify)/.exec(node.attrs.style || '') || [])[1] || 'left';

// Inline text inside a block, as runs with their own style.
function runsOf(node, style, out = []) {
  for (const c of node.children) {
    if (c.text !== undefined) { out.push({ text: c.text, ...style }); continue; }
    if (c.tag === 'br') { out.push({ text: '\n', ...style }); continue; }
    if (['ul', 'ol', 'table', 'blockquote', 'hr', 'p', 'div', 'h1', 'h2', 'h3'].includes(c.tag)) continue; // blocks inside are laid out separately
    const s = { ...style };
    if (c.tag === 'strong') s.bold = true;
    if (c.tag === 'em') s.italic = true;
    if (c.tag === 'u') s.underline = true;
    if (c.tag === 's') s.strike = true;
    if (c.tag === 'a' && c.attrs.href) { s.link = c.attrs.href; s.underline = true; s.color = C.purple; }
    runsOf(c, s, out);
  }
  return out;
}
const BODY = { size: 10.5, lead: 1.6, color: C.ink };
// The document body as a list of blocks to lay out.
function blocksOf(node, ctx = { indent: 0, list: null }, out = []) {
  let loose = [];
  const flush = () => { if (loose.some((r) => r.text.trim())) out.push({ type: 'text', runs: loose, style: { ...BODY }, indent: ctx.indent, after: 8.5 }); loose = []; };
  for (const c of node.children) {
    if (c.text !== undefined || ['strong', 'em', 'u', 's', 'a', 'br'].includes(c.tag)) { loose.push(...runsOf({ children: [c] }, { color: BODY.color })); continue; }
    flush();
    const tag = c.tag;
    if (tag === 'p' || tag === 'div') { out.push({ type: 'text', runs: runsOf(c, { color: ctx.quote ? C.quote : BODY.color, italic: !!ctx.quote }), style: { ...BODY, ...(ctx.quote ? { color: C.quote } : {}) }, align: alignOf(c), indent: ctx.indent, after: ctx.quote ? 2 : 8.5, quote: ctx.quote }); blocksOf({ children: c.children.filter((x) => ['ul', 'ol', 'table'].includes(x.tag)) }, ctx, out); }
    else if (/^h[1-3]$/.test(tag)) {
      const style = { h1: { size: 17, lead: 1.25, before: 20, after: 8.5, color: C.ink, heavy: true }, h2: { size: 13, lead: 1.3, before: 17, after: 5.7, color: C.deep, heavy: true }, h3: { size: 11, lead: 1.4, before: 14, after: 4.3, color: C.ink, heavy: true } }[tag];
      out.push({ type: 'text', runs: runsOf(c, { color: style.color, heavy: true }), style, align: alignOf(c), indent: ctx.indent, before: style.before, after: style.after, keepWithNext: true });
    }
    else if (tag === 'ul' || tag === 'ol') {
      let i = 0;
      for (const li of c.children.filter((x) => x.tag === 'li')) {
        i++;
        out.push({ type: 'text', runs: runsOf(li, { color: BODY.color }), style: { ...BODY }, align: alignOf(li), indent: ctx.indent + 20, bullet: tag === 'ol' ? i + '.' : '•', after: 2.8 });
        blocksOf({ children: li.children.filter((x) => ['ul', 'ol', 'p', 'div', 'table'].includes(x.tag)) }, { ...ctx, indent: ctx.indent + 20 }, out);
      }
      if (out.length) out[out.length - 1].after = 8.5;
    }
    else if (tag === 'blockquote') {
      const start = out.length;
      blocksOf(c, { ...ctx, indent: ctx.indent + 14, quote: true }, out);
      if (out.length > start) { out[start].before = (out[start].before || 0) + 11; for (let k = start; k < out.length; k++) out[k].quote = true; out[out.length - 1].after = 11; }
    }
    else if (tag === 'hr') out.push({ type: 'rule', before: 17, after: 17 });
    else if (tag === 'table') {
      const rows = [];
      for (const section of c.children) for (const tr of section.tag === 'tr' ? [section] : section.children.filter((x) => x.tag === 'tr')) {
        rows.push(tr.children.filter((x) => x.tag === 'th' || x.tag === 'td').map((cell) => ({ header: cell.tag === 'th', span: Math.max(1, Number(cell.attrs.colspan) || 1), runs: runsOf(cell, { color: BODY.color, bold: cell.tag === 'th' }), align: alignOf(cell) })));
      }
      if (rows.length) out.push({ type: 'table', rows, before: 8.5, after: 14, indent: ctx.indent });
    }
  }
  flush();
  return out;
}

// ---------- Measuring and breaking lines ----------
const fontKey = (r) => (r.heavy ? 'heavy' : r.bold && r.italic ? 'boldItalic' : r.bold ? 'bold' : r.italic ? 'italic' : 'regular');
function glyphs(text, key) {
  const f = fonts()[key], out = [];
  for (const ch of text.replace(/\t/g, ' ')) { const g = f.map.get(ch.codePointAt(0)) || f.map.get(0x3f) || 0; out.push({ ch, gid: g, w: f.advance(g) }); }
  return out;
}
const textWidth = (text, key, size, spacing = 0) => glyphs(text, key).reduce((w, g) => w + g.w, 0) * size / 1000 + spacing * [...text].length;
// Breaks runs into lines no wider than `max` (long words are split), keeping each piece's style.
function breakLines(runs, size, max) {
  const lines = []; let line = [], width = 0;
  const push = () => { while (line.length && !line[line.length - 1].text.trim()) { width -= line[line.length - 1].w; line.pop(); } lines.push({ parts: line, width }); line = []; width = 0; };
  for (const r of runs) {
    for (const piece of r.text.split(/(\n|\s+)/)) {
      if (!piece) continue;
      if (piece === '\n') { push(); continue; }
      const space = !piece.trim(), key = fontKey(r);
      if (space) { if (!line.length) continue; const w = textWidth(' ', key, size); line.push({ ...r, text: ' ', w }); width += w; continue; }
      let word = piece, w = textWidth(word, key, size);
      while (w > max) { // split a word longer than the line
        let cut = word.length - 1;
        while (cut > 1 && textWidth(word.slice(0, cut), key, size) > max - width) cut--;
        if (width && textWidth(word.slice(0, cut), key, size) > max - width) { push(); continue; }
        line.push({ ...r, text: word.slice(0, cut), w: textWidth(word.slice(0, cut), key, size) }); push();
        word = word.slice(cut); w = textWidth(word, key, size);
      }
      if (width + w > max && line.length) push();
      line.push({ ...r, text: word, w }); width += w;
    }
  }
  if (line.length || !lines.length) push();
  return lines;
}

// ---------- Writing the PDF ----------
class Writer {
  constructor() { this.pages = []; this.used = Object.fromEntries(Object.keys(FONT_FILES).map((k) => [k, new Map()])); this.pictures = new Map(); }
  page() { const p = { ops: [], links: [] }; this.pages.push(p); return p; }
  text(p, x, y, text, { key = 'regular', size = 10.5, color = C.ink, spacing = 0 } = {}) {
    if (!text) return;
    const hex = glyphs(text, key).map((g) => { this.used[key].set(g.gid, g); return g.gid.toString(16).padStart(4, '0'); }).join('');
    p.ops.push('BT ' + rgb(color) + ' rg /' + key + ' ' + n(size) + ' Tf ' + n(spacing) + ' Tc ' + n(x) + ' ' + n(PAGE.h - y) + ' Td <' + hex + '> Tj ET');
  }
  rect(p, x, y, w, h, color) { p.ops.push(rgb(color) + ' rg ' + n(x) + ' ' + n(PAGE.h - y - h) + ' ' + n(w) + ' ' + n(h) + ' re f'); }
  line(p, x1, y1, x2, y2, color, width = 0.75) { p.ops.push(rgb(color) + ' RG ' + n(width) + ' w ' + n(x1) + ' ' + n(PAGE.h - y1) + ' m ' + n(x2) + ' ' + n(PAGE.h - y2) + ' l S'); }
  image(p, file, x, y, h) {
    const pic = picture(file), w = pic.width * h / pic.height;
    if (!this.pictures.has(file)) this.pictures.set(file, { name: 'Im' + (this.pictures.size + 1), pic });
    p.ops.push('q ' + n(w) + ' 0 0 ' + n(h) + ' ' + n(x) + ' ' + n(PAGE.h - y - h) + ' cm /' + this.pictures.get(file).name + ' Do Q');
    return w;
  }
  link(p, x, y, w, h, href) { p.links.push({ rect: [x, PAGE.h - y - h, x + w, PAGE.h - y].map(n).join(' '), href }); }

  build(info) {
    const objects = [];
    const add = (body) => { objects.push(body); return objects.length; };
    const stream = (dict, data) => { const z = zlib.deflateSync(data); return { dict: dict + ' /Filter /FlateDecode /Length ' + z.length, data: z }; };
    const pagesId = add(null);
    const fontIds = {};
    for (const [key, used] of Object.entries(this.used)) {
      if (!used.size) continue;
      const f = fonts()[key], name = 'HNDOCS+' + f.name;
      const file = add(stream('/Length1 ' + f.bytes.length, f.bytes));
      const flags = (key === 'italic' || key === 'boldItalic' ? 64 : 0) | 32;
      const desc = add('<< /Type /FontDescriptor /FontName /' + name + ' /Flags ' + flags + ' /FontBBox [' + f.bbox.join(' ') + '] /ItalicAngle ' + n(f.italicAngle) + ' /Ascent ' + f.ascent + ' /Descent ' + f.descent + ' /CapHeight ' + f.capHeight + ' /StemV ' + (key === 'regular' || key === 'italic' ? 80 : 140) + ' /FontFile2 ' + file + ' 0 R >>');
      const gids = [...used.keys()].sort((a, b) => a - b);
      const widths = '[' + gids.map((g) => g + ' [' + Math.round(f.advance(g)) + ']').join(' ') + ']';
      const cid = add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /' + name + ' /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ' + desc + ' 0 R /W ' + widths + ' /CIDToGIDMap /Identity >>');
      const utf16 = (s) => Buffer.from(s, 'utf16le').swap16().toString('hex');
      const cmap = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n' +
        gids.reduce((acc, g, i) => { if (i % 100 === 0) acc.push([]); acc[acc.length - 1].push(g); return acc; }, []).map((chunk) => chunk.length + ' beginbfchar\n' + chunk.map((g) => '<' + g.toString(16).padStart(4, '0') + '> <' + utf16(used.get(g).ch) + '>').join('\n') + '\nendbfchar').join('\n') +
        '\nendcmap CMapName currentdict /CMap defineresource pop end end';
      const toUnicode = add(stream('', Buffer.from(cmap, 'latin1')));
      fontIds[key] = add('<< /Type /Font /Subtype /Type0 /BaseFont /' + name + ' /Encoding /Identity-H /DescendantFonts [' + cid + ' 0 R] /ToUnicode ' + toUnicode + ' 0 R >>');
    }
    const imageIds = {};
    for (const { name, pic } of this.pictures.values()) {
      const mask = pic.alpha ? add({ dict: '<< /Type /XObject /Subtype /Image /Width ' + pic.width + ' /Height ' + pic.height + ' /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ' + pic.alpha.length, data: pic.alpha, raw: true }) : null;
      imageIds[name] = add({ dict: '<< /Type /XObject /Subtype /Image /Width ' + pic.width + ' /Height ' + pic.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8' + (mask ? ' /SMask ' + mask + ' 0 R' : '') + ' /Filter /FlateDecode /Length ' + pic.colour.length, data: pic.colour, raw: true });
    }
    const resources = '<< /Font << ' + Object.entries(fontIds).map(([k, id]) => '/' + k + ' ' + id + ' 0 R').join(' ') + ' >> /XObject << ' + Object.entries(imageIds).map(([k, id]) => '/' + k + ' ' + id + ' 0 R').join(' ') + ' >> >>';
    const pageIds = [];
    for (const p of this.pages) {
      const content = add(stream('', Buffer.from(p.ops.join('\n'), 'latin1')));
      const annots = p.links.map((l) => add('<< /Type /Annot /Subtype /Link /Rect [' + l.rect + '] /Border [0 0 0] /A << /S /URI /URI (' + String(l.href).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, '') + ') >> >>'));
      pageIds.push(add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + n(PAGE.w) + ' ' + n(PAGE.h) + '] /Resources ' + resources + ' /Contents ' + content + ' 0 R' + (annots.length ? ' /Annots [' + annots.map((a) => a + ' 0 R').join(' ') + ']' : '') + ' >>'));
    }
    objects[pagesId - 1] = '<< /Type /Pages /Kids [' + pageIds.map((id) => id + ' 0 R').join(' ') + '] /Count ' + pageIds.length + ' >>';
    const pdfText = (s) => '<FEFF' + Buffer.from(String(s), 'utf16le').swap16().toString('hex') + '>';
    const infoId = add('<< /Title ' + pdfText(info.title) + ' /Author ' + pdfText(info.author) + ' /Creator ' + pdfText('HN Group Docs') + ' /Producer ' + pdfText('HN Group Docs') + ' /CreationDate (D:' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z) >>');
    const catalog = add('<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>');
    const parts = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')], offsets = [];
    let size = parts[0].length;
    objects.forEach((o, i) => {
      offsets.push(size);
      const head = Buffer.from((i + 1) + ' 0 obj\n', 'latin1');
      const body = typeof o === 'string' ? Buffer.from(o + '\nendobj\n', 'latin1') : Buffer.concat([Buffer.from((o.raw ? o.dict : '<< ' + o.dict) + ' >>\nstream\n', 'latin1'), o.data, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
      parts.push(head, body); size += head.length + body.length;
    });
    const xref = 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n' + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') +
      'trailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + catalog + ' 0 R /Info ' + infoId + ' 0 R >>\nstartxref\n' + size + '\n%%EOF\n';
    parts.push(Buffer.from(xref, 'latin1'));
    return Buffer.concat(parts);
  }
}

// ---------- Laying out a document ----------
function renderDocument(doc, company, template) {
  const pdf = new Writer();
  let page, y;
  const bottom = PAGE.h - PAGE.bottom;
  const newPage = () => { page = pdf.page(); y = PAGE.top; };
  const room = (h) => { if (y + h > bottom) newPage(); };
  // A block of text: wrapped, aligned, with bullets, quote bars and links.
  function textBlock(b) {
    const style = b.style, size = style.size, lead = size * style.lead, x0 = PAGE.left + (b.indent || 0), max = CONTENT_W - (b.indent || 0) - (b.quote ? 0 : 0);
    const runs = b.runs.map((r) => ({ ...r, heavy: r.heavy || style.heavy, color: r.color || style.color }));
    const lines = breakLines(runs, size, max);
    if (!lines.some((l) => l.parts.length) && !b.bullet) return;
    y += b.before || 0;
    if (b.keepWithNext) room(lead * 3); else room(lead);
    lines.forEach((l, i) => {
      if (y + lead > bottom) newPage();
      const base = y + (lead - size) / 2 + size * 0.8;
      if (b.quote) pdf.rect(page, x0 - 14, y, 3.4, lead, C.pink);
      if (b.bullet && i === 0) pdf.text(page, x0 - 14, base, b.bullet, { key: 'regular', size, color: C.ink });
      let x = x0 + (b.align === 'center' ? (max - l.width) / 2 : b.align === 'right' ? max - l.width : 0);
      for (const part of l.parts) {
        pdf.text(page, x, base, part.text, { key: fontKey(part), size, color: part.color || style.color });
        if (part.underline) pdf.line(page, x, base + 1.4, x + part.w, base + 1.4, part.color || style.color, 0.6);
        if (part.strike) pdf.line(page, x, base - size * 0.3, x + part.w, base - size * 0.3, part.color || style.color, 0.6);
        if (part.link) pdf.link(page, x, y, part.w, lead, part.link);
        x += part.w;
      }
      y += lead;
    });
    y += b.after || 0;
  }
  function table(b) {
    const x0 = PAGE.left + (b.indent || 0), max = CONTENT_W - (b.indent || 0), cols = Math.max(...b.rows.map((r) => r.reduce((s, c) => s + c.span, 0)));
    const colW = max / cols, pad = 2.5 * MM, size = 9.5, lead = size * 1.45;
    y += b.before || 0;
    for (const row of b.rows) {
      let col = 0;
      const cells = row.map((c) => { const w = colW * c.span, lines = breakLines(c.runs, size, w - pad * 2); const cell = { ...c, x: x0 + col * colW, w, lines }; col += c.span; return cell; });
      const h = Math.max(...cells.map((c) => c.lines.length)) * lead + 1.8 * MM * 2;
      if (y + h > bottom) newPage();
      for (const c of cells) {
        if (c.header) pdf.rect(page, c.x, y, c.w, h, C.head);
        pdf.line(page, c.x, y, c.x + c.w, y, C.ruleDark); pdf.line(page, c.x, y + h, c.x + c.w, y + h, C.ruleDark);
        pdf.line(page, c.x, y, c.x, y + h, C.ruleDark); pdf.line(page, c.x + c.w, y, c.x + c.w, y + h, C.ruleDark);
        c.lines.forEach((l, i) => {
          let x = c.x + pad + (c.align === 'center' ? (c.w - pad * 2 - l.width) / 2 : c.align === 'right' ? c.w - pad * 2 - l.width : 0);
          for (const part of l.parts) { pdf.text(page, x, y + 1.8 * MM + i * lead + size * 0.95, part.text, { key: fontKey({ ...part, bold: part.bold || c.header }), size, color: part.color || C.ink }); x += part.w; }
        });
      }
      y += h;
    }
    y += b.after || 0;
  }
  const label = (text) => text.toUpperCase();

  newPage();
  // Letterhead: the company's logo, the document type and the stripe.
  const logoH = 14 * MM;
  try { pdf.image(page, company.logo + '.png', PAGE.left, PAGE.top, logoH); } catch { pdf.text(page, PAGE.left, PAGE.top + 20, company.name, { key: 'heavy', size: 18 }); }
  if (template.label) { const t = label(template.label), w = textWidth(t, 'heavy', 8.5, 1.2); pdf.text(page, PAGE.w - PAGE.right - w, PAGE.top + 10, t, { key: 'heavy', size: 8.5, color: C.purple, spacing: 1.2 }); }
  y = PAGE.top + Math.max(logoH, 16 * MM) + 5 * MM;
  let sx = PAGE.left;
  for (const [colour, share] of STRIPE) { const w = CONTENT_W * share / 100; pdf.rect(page, sx, y, w + 0.3, 1.4 * MM, colour); sx += w; }
  y += 1.4 * MM + 9 * MM;

  const fields = doc.fields || {};
  const fieldText = (k) => String(fields[k] || '').trim();
  if (template.layout === 'letter') {
    // Address on the left; date and reference on the right.
    const left = template.head.find((f) => f.area === 'left'), rightW = 62 * MM, leftW = CONTENT_W - rightW - 10 * MM;
    const top = y;
    let ly = y;
    if (left) for (const l of breakLines([{ text: fieldText(left.key), color: C.ink }], 10.5, leftW)) { if (l.parts.length) { let x = PAGE.left; for (const p of l.parts) { pdf.text(page, x, ly + 12, p.text, { size: 10.5 }); x += p.w; } } ly += 16.8; }
    let ry = top;
    for (const f of template.head.filter((x) => x.area === 'right')) {
      const v = fieldText(f.key); if (!v) continue;
      pdf.text(page, PAGE.w - PAGE.right - rightW, ry + 8, label(f.label), { key: 'bold', size: 8, color: C.muted, spacing: 0.5 });
      pdf.text(page, PAGE.w - PAGE.right - rightW, ry + 22, v, { size: 10.5 });
      ry += 34;
    }
    y = Math.max(ly, ry) + 10 * MM;
  }
  // The title: a bold subject line on letters, a large heading otherwise.
  const subject = template.title === 'subject';
  textBlock({ runs: [{ text: doc.title || '', heavy: true, color: C.ink }], style: subject ? { size: 11, lead: 1.5, color: C.ink, heavy: true } : { size: 22, lead: 1.2, color: C.ink, heavy: true }, after: subject ? 5 * MM : 6 * MM });
  // Details (memos, reports, policies, minutes, press releases): label and value rows, leaving out empty ones.
  if (template.layout !== 'letter') {
    const rows = template.head.filter((f) => fieldText(f.key));
    for (const f of rows) {
      const lines = breakLines([{ text: fieldText(f.key), color: C.ink }], 9.5, CONTENT_W - 38 * MM);
      const h = lines.length * 14 + 3.2 * MM;
      room(h);
      pdf.text(page, PAGE.left, y + 1.6 * MM + 10, f.label, { key: 'bold', size: 9.5, color: C.muted });
      lines.forEach((l, i) => { let x = PAGE.left + 38 * MM; for (const p of l.parts) { pdf.text(page, x, y + 1.6 * MM + 10 + i * 14, p.text, { size: 9.5 }); x += p.w; } });
      y += h;
      pdf.line(page, PAGE.left, y, PAGE.w - PAGE.right, y, C.rule);
    }
    if (rows.length) y += 8 * MM;
  }
  // A policy's version history.
  if (template.versions && (doc.history || []).length) {
    room(40);
    pdf.text(page, PAGE.left, y + 10, 'VERSION HISTORY', { key: 'heavy', size: 9, color: C.muted, spacing: 0.8 });
    y += 6 * MM;
    table({ rows: [['Version', 'Date', 'By', 'Changes'].map((t) => ({ header: true, span: 1, runs: [{ text: t, bold: true, color: C.ink }] })),
      ...doc.history.slice().reverse().map((h) => [h.version, h.date, h.by, h.changes.map((c) => '• ' + c).join('\n')].map((t, i) => ({ span: 1, runs: [{ text: String(t), bold: i === 0, color: C.ink }] })))], before: 0, after: 8 * MM });
  }
  for (const b of blocksOf(parseHtml(doc.body))) { if (b.type === 'text') textBlock(b); else if (b.type === 'table') table(b); else { y += b.before; room(2); pdf.line(page, PAGE.left, y, PAGE.w - PAGE.right, y, C.ruleDark); y += b.after; } }
  // The sign-off (letters): closing, a gap for a signature, then name, job title and company.
  if (template.foot.length) {
    y += 8 * MM;
    room(30 * MM);
    for (const f of template.foot) {
      if (f.gap) y += 14 * MM;
      const v = fieldText(f.key); if (!v) continue;
      textBlock({ runs: [{ text: v, color: C.ink }], style: { ...BODY }, after: 0 });
    }
  }
  // Every page: "Private & confidential" at the top when marked, and the company footer with page numbers (no website).
  const legal = company.note && company.note.includes(company.legal) ? company.note : company.legal + (company.note ? ' · ' + company.note : '');
  pdf.pages.forEach((p, i) => {
    if (doc.confidential) { const t = 'PRIVATE & CONFIDENTIAL', w = textWidth(t, 'heavy', 7.5, 1.1); pdf.text(p, (PAGE.w - w) / 2, PAGE.top - 6 * MM, t, { key: 'heavy', size: 7.5, color: C.red, spacing: 1.1 }); }
    const fy = PAGE.h - 10 * MM - 9;
    pdf.line(p, PAGE.left, fy - 3 * MM, PAGE.w - PAGE.right, fy - 3 * MM, C.rule);
    pdf.text(p, PAGE.left, fy, legal, { size: 7.5, color: C.faint });
    const num = 'Page ' + (i + 1) + ' of ' + pdf.pages.length;
    pdf.text(p, PAGE.w - PAGE.right - textWidth(num, 'regular', 7.5), fy, num, { size: 7.5, color: C.faint });
  });
  return pdf.build({ title: doc.title || 'Document', author: doc.owner || '' });
}

module.exports = { renderDocument, parseHtml, blocksOf };
