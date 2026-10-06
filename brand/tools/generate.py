"""Generate the HN Group brand logo family (SVG), modelled on the BT roundel.
Run: pip install fonttools && python3 brand/tools/generate.py"""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = os.path.join(os.path.dirname(__file__), "..", "logos")
FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

INDIGO = "#5514B4"
WHITE = "#FFFFFF"

# Roundel geometry (100 x 100 box): thin ring, letters sitting centrally
R, RING = 47.0, 4.6
S, CAP = 6.0, 29.0  # letter stroke, cap height
GLYPHS = {
    "H": (22.0, f"M0 0h{S}v{(CAP-S)/2:.2f}h{22.0-2*S:.2f}V0h{S}v{CAP}h-{S}v-{(CAP-S)/2:.2f}h-{22.0-2*S:.2f}v{(CAP-S)/2:.2f}H0z"),
    "N": (23.0, f"M0 0h{S}l{23.0-2*S:.2f} 18.6V0h{S}v{CAP}h-{S}L{S} 10.4V{CAP}H0z"),
    "A": (25.0, f"M0 {CAP}L9.4 0h6.2L25 {CAP}h-6.4l-1.8-5.8h-10.6l-1.8 5.8zM9.2 17.6h6.6L12.5 7.2z"),
    "D": (23.5, f"M0 0h9a14.5 14.5 0 0 1 0 {CAP}H0zM{S} {S}v{CAP-2*S}h2.8a8.5 8.5 0 0 0 0-{CAP-2*S}z"),
}
GAP = 3.0

BRANDS = {
    # slug: (roundel initials, wordmark beside the roundel or None)
    "hn-group":            ("HN", "Group"),
    "horizon-network":     ("HN", None),
    "horizon-advertising": ("HN", "Advertising"),
    "horizon-development": ("HN", "Development"),
}
TITLES = {"hn-group": "HN Group", "horizon-network": "Horizon Network",
          "horizon-advertising": "Horizon Advertising", "horizon-development": "Horizon Development"}

def roundel(initials, color, cx=50, cy=50):
    widths = [GLYPHS[c][0] for c in initials]
    x = cx - (sum(widths) + GAP * (len(widths) - 1)) / 2
    y = cy - CAP / 2
    out = [f'<circle cx="{cx}" cy="{cy}" r="{R - RING/2}" fill="none" stroke="{color}" stroke-width="{RING}"/>']
    for c, w in zip(initials, widths):
        out.append(f'<path transform="translate({x:.2f} {y:.2f})" fill="{color}" fill-rule="evenodd" d="{GLYPHS[c][1]}"/>')
        x += w + GAP
    return "\n  ".join(out)

def text_path(text, size, x, baseline, tracking=0.0):
    font = TTFont(FONT)
    gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
    scale = size / font["head"].unitsPerEm
    pen = SVGPathPen(gs)
    cur = x
    for ch in text:
        g = cmap[ord(ch)]
        gs[g].draw(TransformPen(pen, (scale, 0, 0, -scale, cur, baseline)))
        cur += hmtx[g][0] * scale + tracking
    return pen.getCommands(), cur - tracking

def svg(w, h, body, title, bg=None):
    rect = f'<rect width="{w:.1f}" height="{h}" fill="{bg}"/>\n  ' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.1f} {h}" width="{w:.0f}" height="{h}" role="img" aria-label="{title}">\n'
            f'  <title>{title}</title>\n  {rect}{body}\n</svg>\n')

def lockup(initials, word, color):
    body = roundel(initials, color)
    if not word:
        return 100, body
    d, end = text_path(word, 40, 114, 64.5, -0.6)
    # thicken the regular weight slightly towards BT's medium wordmark
    body += f'\n  <path fill="{color}" stroke="{color}" stroke-width="0.9" stroke-linejoin="round" d="{d}"/>'
    return end + 3, body

def main():
    os.makedirs(OUT, exist_ok=True)
    files = {}
    for slug, (ini, word) in BRANDS.items():
        t = TITLES[slug]
        files[f"{slug}-roundel.svg"] = svg(100, 100, roundel(ini, INDIGO), t)
        files[f"{slug}-roundel-white.svg"] = svg(100, 100, roundel(ini, WHITE), t)
        files[f"{slug}-app-icon.svg"] = svg(100, 100, roundel(ini, WHITE), t, bg=INDIGO)
        w, b = lockup(ini, word, INDIGO)
        files[f"{slug}-logo.svg"] = svg(w, 100, b, t)
        w, b = lockup(ini, word, WHITE)
        files[f"{slug}-logo-white.svg"] = svg(w, 100, b, t)
    # Alternative roundels with the division's own initials
    files["horizon-advertising-roundel-alt-HA.svg"] = svg(100, 100, roundel("HA", INDIGO), "Horizon Advertising")
    files["horizon-development-roundel-alt-HD.svg"] = svg(100, 100, roundel("HD", INDIGO), "Horizon Development")
    for name, content in files.items():
        with open(os.path.join(OUT, name), "w") as f:
            f.write(content)
    print(len(files), "files written to", os.path.abspath(OUT))

if __name__ == "__main__":
    main()
