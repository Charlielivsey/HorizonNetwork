"""Generate the HN Group brand logo family (SVG).

- HN Group and Horizon Network: heavy wordmark over a stepped multicolour bar line (BT Group style).
- Every other division: heavy initials inside a thick indigo ring (BT roundel style).

Run: pip install fonttools && python3 brand/tools/generate.py"""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

OUT = os.path.join(os.path.dirname(__file__), "..", "logos")
FONT_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"

INDIGO = "#5514B4"
WHITE = "#FFFFFF"
INK = "#1A1A1A"
LAVENDER = "#7B52C4"  # Horizon Advertising

# --- Roundel (100 x 100 box), proportions taken from the BT roundel -------------
RING = 6.2                # ring thickness, ~6% of the diameter
CAP, S = 34.3, 7.8        # letter height (~34% of diameter) and stem weight
GAP = 2.8
_m = CAP / 2 - 3.7        # top of crossbars


def _rounded_d(w):
    r, ri = 13.0, 13.0 - S
    outer = f"M0 0H{w-r}A{r} {r} 0 0 1 {w} {r}V{CAP-r}A{r} {r} 0 0 1 {w-r} {CAP}H0z"
    inner = f"M{S} {S}V{CAP-S}H{w-r}A{ri} {ri} 0 0 0 {w-S} {CAP-r}V{r}A{ri} {ri} 0 0 0 {w-r} {S}z"
    return outer + inner


GLYPHS = {
    "H": (24.0, f"M0 0h{S}v{_m:.2f}h{24-2*S:.2f}V0h{S}v{CAP}h-{S}v-{CAP-_m-7.4:.2f}h-{24-2*S:.2f}v{CAP-_m-7.4:.2f}H0z"),
    "N": (25.5, f"M0 0h{S+1.2}L{25.5-S} 21.6V0H25.5v{CAP}h-{S+1.2}L{S} 12.7V{CAP}H0z"),
    "A": (28.0, f"M0 {CAP}L9.6 0h8.8L28 {CAP}h-8.1l-1.6-5.9h-8.6l-1.6 5.9zM11.5 21.7h5L14 11.6z"),
    "D": (25.0, _rounded_d(25.0)),
    "M": (31.0, f"M0 0h9.4l6.1 17.6L21.6 0H31v{CAP}h-7.6V14.2l-5.1 13.6h-5.6L7.6 14.2V{CAP}H0z"),
}

ROUNDEL_BRANDS = {
    # slug: (initials, line 1, line 2, colour)
    "horizon-advertising": ("HA", "Horizon", "Advertising", LAVENDER),
    "horizon-development": ("HD", "Horizon", "Development", INDIGO),
    "horizon-media-group": ("HM", "Horizon", "Media Group", INDIGO),
    "horizon-holding-co":  ("HH", "Horizon", "Holding Co", INDIGO),
}

# --- Wordmarks with the stepped colour line -------------------------------------
# (width share, level 0=top/1=mid/2=low, colour)
STEPS = [(52, 0, "#E97DE8"), (49, 1, "#5514B4"), (20, 0, "#E3E65B"), (73, 1, "#3E9BA3"),
         (35, 0, "#7A1F6C"), (37, 1, "#C2306B"), (47, 2, "#5FAE7B"), (48, 1, "#1C2235")]

WORDMARK_BRANDS = {
    # slug: (title, [variant name -> lines])
    "hn-group": ("HN Group", {"wordmark": ["HN Group"]}),
    "horizon-network": ("Horizon Network", {"wordmark": ["Horizon Network"],
                                            "wordmark-stacked": ["Horizon", "Network"]}),
}


def svg(w, h, body, title, bg=None):
    rect = f'<rect width="{w:.1f}" height="{h:.1f}" fill="{bg}"/>\n  ' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.1f} {h:.1f}" width="{w:.0f}" height="{h:.0f}" '
            f'role="img" aria-label="{title}">\n  <title>{title}</title>\n  {rect}{body}\n</svg>\n')


def roundel(initials, color, cx=50, cy=50):
    widths = [GLYPHS[c][0] for c in initials]
    x = cx - (sum(widths) + GAP * (len(widths) - 1)) / 2
    y = cy - CAP / 2
    out = [f'<circle cx="{cx}" cy="{cy}" r="{50 - RING/2}" fill="none" stroke="{color}" stroke-width="{RING}"/>']
    for c, w in zip(initials, widths):
        out.append(f'<path transform="translate({x:.2f} {y:.2f})" fill="{color}" fill-rule="evenodd" d="{GLYPHS[c][1]}"/>')
        x += w + GAP
    return "\n  ".join(out)


def text_path(text, font_file, size, x, baseline, tracking=0.0):
    """Outline text; returns (path data, ink bounds)."""
    font = TTFont(font_file)
    gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
    scale = size / font["head"].unitsPerEm
    pen, bounds = SVGPathPen(gs), BoundsPen(gs)
    cur = x
    for ch in text:
        g = cmap[ord(ch)]
        t = (scale, 0, 0, -scale, cur, baseline)
        gs[g].draw(TransformPen(pen, t))
        gs[g].draw(TransformPen(bounds, t))
        cur += hmtx[g][0] * scale + tracking
    return pen.getCommands(), bounds.bounds


def cap_height(font_file, size):
    font = TTFont(font_file)
    return font["OS/2"].sCapHeight * size / font["head"].unitsPerEm


def roundel_lockup(initials, line1, line2, color):
    body = roundel(initials, color)
    d1, b1 = text_path(line1, FONT_BOLD, 34, 116, 46, -0.6)
    d2, b2 = text_path(line2, FONT_REG, 34, 116, 84, -0.6)
    body += f'\n  <path fill="{color}" d="{d1}"/>\n  <path fill="{color}" d="{d2}"/>'
    return max(b1[2], b2[2]) + 4, body


def wordmark(lines, ink):
    """Heavy wordmark (one or more lines) with the stepped colour line beneath."""
    size, tracking, pad, leading = 100.0, -3.0, 8.0, 1.12
    cap = cap_height(FONT_BOLD, size)
    paths, x0s, x1s = [], [], []
    baseline = pad + cap
    for i, line in enumerate(lines):
        bl = baseline + i * size * leading
        d, (bx0, _, bx1, _) = text_path(line, FONT_BOLD, size, 0, bl, tracking)
        paths.append(d)
        x0s.append(bx0)
        x1s.append(bx1)
        last_baseline = bl
    x0, x1 = min(x0s), max(x1s)
    thick, step = cap * 0.155, cap * 0.215
    top = last_baseline + cap * 0.5
    total = sum(w for w, _, _ in STEPS)
    parts = [f'<path transform="translate({pad - x0:.2f} 0)" fill="{ink}" d="{d}"/>' for d in paths]
    x = pad
    for w, lvl, c in STEPS:
        bw = (x1 - x0) * w / total
        if ink == WHITE and c == "#1C2235":
            c = WHITE  # the near-black bar would vanish on a dark background
        parts.append(f'<rect x="{x:.2f}" y="{top + lvl*step:.2f}" width="{bw + 0.05:.2f}" height="{thick:.2f}" fill="{c}"/>')
        x += bw
    return (x1 - x0) + 2 * pad, top + 2 * step + thick + pad, "\n  ".join(parts)


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(".svg"):
            os.remove(os.path.join(OUT, f))
    files = {}
    for slug, (title, variants) in WORDMARK_BRANDS.items():
        for name, lines in variants.items():
            for ink, suffix in ((INK, ""), (WHITE, "-white")):
                w, h, body = wordmark(lines, ink)
                files[f"{slug}-{name}{suffix}.svg"] = svg(w, h, body, title)
    for slug, (ini, l1, l2, color) in ROUNDEL_BRANDS.items():
        title = f"{l1} {l2}"
        files[f"{slug}-roundel.svg"] = svg(100, 100, roundel(ini, color), title)
        files[f"{slug}-roundel-white.svg"] = svg(100, 100, roundel(ini, WHITE), title)
        files[f"{slug}-app-icon.svg"] = svg(100, 100, f'<g transform="translate(15 15) scale(0.7)">\n  {roundel(ini, WHITE)}\n  </g>', title, bg=color)
        w, b = roundel_lockup(ini, l1, l2, color)
        files[f"{slug}-logo.svg"] = svg(w, 100, b, title)
        w, b = roundel_lockup(ini, l1, l2, WHITE)
        files[f"{slug}-logo-white.svg"] = svg(w, 100, b, title)
    for name, content in files.items():
        with open(os.path.join(OUT, name), "w") as f:
            f.write(content)
    print(len(files), "files written to", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
