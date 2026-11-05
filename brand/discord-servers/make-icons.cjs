// Discord server icons for four servers, each its own design around the approved logo (brand/logos, unaltered).
// Renders 1024x1024 PNGs into brand/discord-servers/ and a preview sheet with Discord's circle crop.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const LOGOS = '/home/user/HorizonNetwork/brand/logos', OUT = '/home/user/HorizonNetwork/brand/discord-servers';
const preview = process.argv[2] || OUT; // where the circle-crop preview goes
const svg = (name) => fs.readFileSync(path.join(LOGOS, name), 'utf8').replace(/<\?xml[^>]*>/, '').replace(/<title>[^<]*<\/title>/, '').replace(/ width="[^"]*" height="[^"]*"/, '');
const STRIPE = [['#E97DE8', 14], ['#5514B4', 14], ['#E3E65B', 6], ['#3E9BA3', 20], ['#7A1F6C', 10], ['#C2306B', 10], ['#5FAE7B', 13], ['#3A4166', 13]];
const FONT = "font-family:'Plus Jakarta Sans',Arial,sans-serif;";
const fontFace = "@font-face{font-family:'Plus Jakarta Sans';src:url(data:font/woff2;base64," + fs.readFileSync('/home/user/HorizonNetwork/hngroup-site/public/assets/fonts/' + fs.readdirSync('/home/user/HorizonNetwork/hngroup-site/public/assets/fonts').find((f) => /woff2$/.test(f))).toString('base64') + ") format('woff2');font-weight:200 800}";

// A ring of the HN stripe colours, in the stripe's proportions, starting at the top.
function stripeRing(r, width, gapDeg) {
  const total = STRIPE.reduce((n, [, w]) => n + w, 0), C = 2 * Math.PI * r;
  let at = 0;
  return STRIPE.map(([c, w]) => {
    const len = (w / total) * C, gap = (gapDeg / 360) * C;
    const s = '<circle cx="512" cy="512" r="' + r + '" fill="none" stroke="' + c + '" stroke-width="' + width + '" stroke-linecap="round" stroke-dasharray="' + Math.max(1, len - gap) + ' ' + C + '" stroke-dashoffset="' + -at + '" transform="rotate(-90 512 512)"/>';
    at += len; return s;
  }).join('');
}

const ICONS = {
  // Navy, a ring of the HN stripe colours, the stacked wordmark and an HQ badge.
  'horizon-network-hq': `
    <div class="bg" style="background:radial-gradient(circle at 50% 38%,#2B3150 0%,#1C2135 55%,#12151F 100%)"></div>
    <svg class="layer" viewBox="0 0 1024 1024">${stripeRing(400, 26, 2.2)}<circle cx="512" cy="512" r="352" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="2"/></svg>
    <div class="logo" style="left:282px;top:262px;width:460px">${svg('horizon-network-wordmark-stacked-white.svg')}</div>
    <div class="badge" style="left:372px;top:640px;width:280px;height:120px;background:#5514B4;color:#fff;font-size:78px;letter-spacing:10px">HQ</div>`,
  // Lavender, broadcast waves rippling out from the white roundel.
  'horizon-advertising': `
    <div class="bg" style="background:radial-gradient(circle at 50% 50%,#9C7BE0 0%,#7B52C4 45%,#4E2F8C 100%)"></div>
    <svg class="layer" viewBox="0 0 1024 1024">${[300, 380, 460, 540, 620].map((r, i) => '<circle cx="512" cy="512" r="' + r + '" fill="none" stroke="#fff" stroke-opacity="' + (0.34 - i * 0.06) + '" stroke-width="' + (14 - i * 2) + '"/>').join('')}
      <circle cx="512" cy="512" r="250" fill="#ffffff" fill-opacity=".07"/></svg>
    <div class="logo" style="left:292px;top:292px;width:440px">${svg('horizon-advertising-roundel-white.svg')}</div>
    <div class="tag" style="left:0;right:0;top:812px;color:#fff;font-size:46px;letter-spacing:10px;opacity:.9">ADVERTISING</div>`,
  // Purple blueprint grid with angle brackets around the white roundel.
  'horizon-development': `
    <div class="bg" style="background:linear-gradient(160deg,#6A22D6 0%,#5514B4 50%,#2E0B66 100%)"></div>
    <svg class="layer" viewBox="0 0 1024 1024"><defs><pattern id="g" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M64 0H0V64" fill="none" stroke="#fff" stroke-opacity=".10" stroke-width="2"/></pattern>
      <pattern id="G" width="256" height="256" patternUnits="userSpaceOnUse"><path d="M256 0H0V256" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="3"/></pattern></defs>
      <rect width="1024" height="1024" fill="url(#g)"/><rect width="1024" height="1024" fill="url(#G)"/>
      <path d="M232 380 L132 512 L232 644" fill="none" stroke="#E3E65B" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M792 380 L892 512 L792 644" fill="none" stroke="#E3E65B" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div class="logo" style="left:312px;top:312px;width:400px">${svg('horizon-development-roundel-white.svg')}</div>
    <div class="tag" style="left:0;right:0;top:790px;color:#fff;font-size:44px;letter-spacing:10px;opacity:.92">DEVELOPMENT</div>`,
  // Teal to navy, the stacked wordmark over a bold STAFF bar and the stripe along the bottom.
  'horizon-network-staff': `
    <div class="bg" style="background:linear-gradient(200deg,#3E9BA3 0%,#24606C 42%,#1C2135 100%)"></div>
    <svg class="layer" viewBox="0 0 1024 1024"><circle cx="820" cy="190" r="260" fill="#ffffff" fill-opacity=".06"/><circle cx="170" cy="880" r="220" fill="#000" fill-opacity=".12"/></svg>
    <div class="logo" style="left:272px;top:258px;width:480px">${svg('horizon-network-wordmark-stacked-white.svg')}</div>
    <div class="badge" style="left:292px;top:646px;width:440px;height:124px;background:#E3E65B;color:#1C2135;font-size:66px;letter-spacing:12px">STAFF</div>
`,
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(), page = await (await b.newContext({ viewport: { width: 1024, height: 1024 } })).newPage();
  const files = [];
  for (const [name, body] of Object.entries(ICONS)) {
    await page.setContent('<!doctype html><style>' + fontFace + 'html,body{margin:0}#i{position:relative;width:1024px;height:1024px;overflow:hidden}.bg,.layer{position:absolute;inset:0;width:1024px;height:1024px}.logo{position:absolute}.logo svg{width:100%;height:auto;display:block}' +
      '.badge{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:999px;font-weight:800;' + FONT + 'box-shadow:0 10px 30px rgba(0,0,0,.25)}.tag{position:absolute;text-align:center;font-weight:800;' + FONT + '}.stripe{position:absolute;display:flex;height:16px;gap:0}.stripe i{display:block;height:16px}</style><div id="i">' + body + '</div>');
    await page.evaluate(() => document.fonts.ready);
    const file = path.join(OUT, name + '.png'); await page.locator('#i').screenshot({ path: file }); files.push([name, file]);
  }
  // Preview: each icon as Discord shows it (a circle), large and at sidebar size.
  await page.setViewportSize({ width: 1240, height: 420 });
  await page.setContent('<!doctype html><body style="margin:0;background:#1e1f22;display:flex;gap:40px;padding:40px;align-items:flex-start">' + files.map(([n, f]) => '<div style="display:grid;gap:16px;justify-items:center"><img src="data:image/png;base64,' + fs.readFileSync(f).toString('base64') + '" style="width:260px;height:260px;border-radius:50%"><img src="data:image/png;base64,' + fs.readFileSync(f).toString('base64') + '" style="width:48px;height:48px;border-radius:50%"></div>').join('') + '</body>');
  await page.screenshot({ path: preview + '/server-icons-preview.png' });
  await b.close();
  console.log(files.map(([, f]) => f).join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });
