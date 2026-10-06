"""Generate the HN Group brand logo family (SVG). Run: python3 brand/tools/generate.py"""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = os.path.join(os.path.dirname(__file__), "..", "logos")
FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

# Brand palette
BRANDS = {
    "hn-group":            dict(initials="HN", color="#4C1D95", name="HN", sub="Group"),
    "horizon-network":     dict(initials="HN", color="#6D28D9", name="Horizon", sub="Network"),
    "horizon-advertising": dict(initials="HA", color="#C026D3", name="Horizon", sub="Advertising"),
    "horizon-development": dict(initials="HD", color="#0F766E", name="Horizon", sub="Development"),
}

# Custom geometric glyphs, cap height 36, stroke 8.6 (fill-rule evenodd)
S, CAP = 8.6, 36.0
GLYPHS = {
    "H": (26, f"M0 0h{S}v{(CAP-S)/2}h{26-2*S}V0h{S}v{CAP}h-{S}v-{(CAP-S)/2}h-{26-2*S}v{(CAP-S)/2}H0z"),
    "N": (27, f"M0 0h{S}l{27-2*S} 21.6V0h{S}v{CAP}h-{S}L{S} 14.4V{CAP}H0z"),
    "A": (30, f"M0 {CAP}L10.6 0h8.8L30 {CAP}h-8.9l-1.9-6.6h-8.4l-1.9 6.6zM12.6 22.6h4.8L15 13.4z"),
    "D": (29, f"M0 0h11a18 18 0 0 1 0 {CAP}H0zM{S} {S}v{CAP-2*S}h2.4a9.4 9.4 0 0 0 0-{CAP-2*S}z"),
}
GAP = 3.2

def roundel_body(initials, color, cx=50, cy=50, r=50, on_dark=False):
    widths = [GLYPHS[c][0] for c in initials]
    total = sum(widths) + GAP * (len(initials) - 1)
    x = cx - total / 2
    y = cy - CAP / 2
    fg = color if on_dark else "#FFFFFF"
    bg = "#FFFFFF" if on_dark else color
    parts = [f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{bg}"/>']
    for c, w in zip(initials, widths):
        parts.append(f'<path transform="translate({x:.2f} {y:.2f})" fill="{fg}" fill-rule="evenodd" d="{GLYPHS[c][1]}"/>')
        x += w + GAP
    return "\n  ".join(parts)

def text_path(text, font_file, size, x, baseline, tracking=0.0):
    font = TTFont(font_file)
    gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
    scale = size / font["head"].unitsPerEm
    pen = SVGPathPen(gs)
    cursor = x
    for ch in text:
        g = cmap[ord(ch)]
        gs[g].draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, baseline)))
        cursor += hmtx[g][0] * scale + tracking
    return pen.getCommands(), cursor - tracking

def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.1f} {h}" width="{w:.0f}" height="{h}" role="img" aria-label="{title}">\n'
            f'  <title>{title}</title>\n  {body}\n</svg>\n')

def lockup(b, dark=False):
    """Roundel + two-line wordmark (name bold, sub regular)."""
    ink = "#FFFFFF" if dark else "#1F1235"
    body = roundel_body(b["initials"], b["color"], on_dark=False)
    if b["name"] == "HN":  # group lockup: roundel + single-line "Group", like a corporate group mark
        d, end = text_path(b["sub"], FONT, 46, 118, 66, -0.5)
        body += f'\n  <path fill="{ink}" d="{d}"/>'
    else:
        d1, e1 = text_path(b["name"], FONT, 34, 118, 46, -0.3)
        d2, e2 = text_path(b["sub"], FONT_REG, 34, 118, 84, -0.3)
        sub_col = "#FFFFFF" if dark else b["color"]
        body += f'\n  <path fill="{ink}" d="{d1}"/>\n  <path fill="{sub_col}" d="{d2}"/>'
        end = max(e1, e2)
    return end + 4, body

def main():
    os.makedirs(OUT, exist_ok=True)
    for slug, b in BRANDS.items():
        title = "HN Group" if slug == "hn-group" else f'{b["name"]} {b["sub"]}'
        files = {
            f"{slug}-roundel.svg": svg(100, 100, roundel_body(b["initials"], b["color"]), title),
            f"{slug}-roundel-reversed.svg": svg(100, 100, roundel_body(b["initials"], b["color"], on_dark=True), title),
        }
        w, body = lockup(b)
        files[f"{slug}-lockup.svg"] = svg(w, 100, body, title)
        w, body = lockup(b, dark=True)
        files[f"{slug}-lockup-on-dark.svg"] = svg(w, 100, body, title)
        for name, content in files.items():
            with open(os.path.join(OUT, name), "w") as f:
                f.write(content)
    print("written to", os.path.abspath(OUT))

if __name__ == "__main__":
    main()
