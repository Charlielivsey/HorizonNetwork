'use strict';
// Makes share certificates in the HN Group design (the same layout as HNG-001 to HNG-005): an A4 landscape page with the
// issuing company's approved logo, the holder, the shareholding, the class, the share of votes the Company Register
// calculates, and signature lines. Rendered by headless Chromium, like the originals.
//   node investors-site/tools/share-certificate.cjs <certificates.json> <output folder>
// certificates.json: [{ number, company, logo, holder, holderType, share, cls, votes, issued, note, file }]
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..', '..');
const CLASSES = { A: 'ordinary shares, one vote per share', B: 'staff shares, half a vote per share', C: 'special issue shares, two votes per share' };
const CLASS_WORDS = { A: 'Class A ordinary', B: 'Class B staff', C: 'Class C special issue' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
const dataUri = (file, type) => 'data:' + type + ';base64,' + fs.readFileSync(file).toString('base64');

function html(c) {
  const font = dataUri(path.join(ROOT, 'hngroup-site/public/assets/fonts/plus-jakarta-sans.woff2'), 'font/woff2');
  const logo = dataUri(path.join(ROOT, 'brand/logos', c.logo + '.svg'), 'image/svg+xml');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:J;src:url(${font}) format('woff2');font-weight:200 800}
@page{size:A4 landscape;margin:0}
*{box-sizing:border-box}html,body{margin:0;width:297mm;height:210mm;font-family:J,sans-serif;color:#17161C}
.stripe{position:absolute;left:0;right:0;top:0;height:5px;background:linear-gradient(90deg,#E97DE8 0 14%,#5514B4 14% 28%,#E3E65B 28% 34%,#3E9BA3 34% 54%,#7A1F6C 54% 64%,#C2306B 64% 74%,#5FAE7B 74% 87%,#3A4166 87%)}
.frame{position:absolute;inset:12mm 10mm 10mm;border:2px solid transparent;border-radius:5mm;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(160deg,#E97DE8,#5514B4 45%,#1C2135) border-box;padding:12mm 15mm 9mm;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:flex-start}.top img{height:16mm;width:auto;max-width:70mm}
.num{text-align:right;font-size:8.5pt;color:#5A5C6B;line-height:1.6}.num b{display:block;color:#5514B4;font-size:11pt}
.eyebrow{margin-top:9mm;font-size:7.5pt;font-weight:800;letter-spacing:.2em;color:#5514B4;text-transform:uppercase}
h1{font-size:27pt;margin:2mm 0 5mm;letter-spacing:-.02em;font-weight:800}
.certify{font-size:10.5pt;margin:0}.holder{font-size:20pt;font-weight:800;color:#5514B4;margin:3mm 0}
.body{font-size:10.5pt;line-height:1.6;margin:0;max-width:240mm}
.boxes{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;margin-top:7mm}
.box{border:1px solid #E5E0EE;border-radius:4mm;padding:4mm;background:#FBFAFD}.box small{display:block;font-size:6.5pt;font-weight:800;letter-spacing:.14em;color:#5A5C6B}
.box strong{display:block;font-size:12pt;margin:1.5mm 0 1mm}.box span{font-size:7.5pt;color:#5A5C6B;line-height:1.5}
.sign{margin-top:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:12mm;font-size:7.5pt;color:#5A5C6B}.sign div{border-top:1px solid #17161C;padding-top:2mm}
.note{margin-top:5mm;font-size:6.8pt;color:#5A5C6B}
</style></head><body><div class="stripe"></div><div class="frame">
<div class="top"><img src="${logo}" alt=""><div class="num">Certificate number<b>${esc(c.number)}</b>Date of issue: ${esc(day(c.issued))}</div></div>
<div class="eyebrow">${esc(c.company)}</div><h1>Share certificate</h1>
<p class="certify">This is to certify that</p><p class="holder">${esc(c.holder)}</p>
<p class="body">is the registered holder of <b>${esc(c.share)}% of the issued shares</b> of <b>${esc(c.company)}</b>, held as <b>${esc(CLASS_WORDS[c.cls])} shares</b>, as recorded on the HN Group Company Register.</p>
<div class="boxes"><div class="box"><small>HOLDER</small><strong>${esc(c.holder)}</strong><span>${esc(c.holderType)}</span></div>
<div class="box"><small>SHAREHOLDING</small><strong>${esc(c.share)}%</strong><span>of the company’s shares</span></div>
<div class="box"><small>SHARE CLASS</small><strong>Class ${esc(c.cls)}</strong><span>${esc(CLASSES[c.cls])}</span></div>
<div class="box"><small>SHARE OF VOTES</small><strong>${esc(c.votes)}%</strong><span>as calculated by the register</span></div></div>
<div class="sign"><div>Director, for and on behalf of ${esc(c.company)}</div><div>Witness</div><div>Date</div></div>
<p class="note">${esc(c.note)} The Company Register at companies.hngroup.org.uk is the record of this holding; this certificate is evidence of it.</p>
</div></body></html>`;
}

async function make(list, out) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright')); }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const c of list) {
      await page.setContent(html(c), { waitUntil: 'load' });
      await page.pdf({ path: path.join(out, c.file), format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
      console.log('Made ' + c.file);
    }
  } finally { await browser.close(); }
}
if (require.main === module) make(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), process.argv[3]).catch((e) => { console.error(e); process.exit(1); });
module.exports = { html, make };
