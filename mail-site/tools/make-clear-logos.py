#!/usr/bin/env python3
"""Makes see-through copies of the HN Group email logos for showing inside HN Mail (the user's report, 6 November 2026:
the signature logo had "a white box around" it in Midnight Lavender). White becomes transparent; every other colour
keeps its look over white (colour-to-alpha). The logos people receive are unchanged.
   python3 mail-site/tools/make-clear-logos.py"""
from pathlib import Path
from PIL import Image

folder = Path(__file__).resolve().parent.parent / 'public' / 'assets' / 'brand' / 'png'
for src in sorted(folder.glob("*-email-logo.png")):
    im = Image.open(src).convert('RGB')
    out = Image.new('RGBA', im.size)
    px, op = im.load(), out.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b = px[x, y]
            a = max(255 - r, 255 - g, 255 - b)
            if a == 0:
                op[x, y] = (0, 0, 0, 0)
                continue
            k = a / 255
            op[x, y] = tuple(max(0, min(255, round(255 - (255 - c) / k))) for c in (r, g, b)) + (a,)
    out.save(src.with_name(src.stem + '-clear.png'), optimize=True)
    print('made', src.with_name(src.stem + '-clear.png').name)

# Lavender Dusk copies (the user's request, 6 November 2026: "the coloured bars should sta the same colour"), made from
# the original logos: white becomes transparent, the colourless lettering becomes Lavender Dusk's text colour (like the
# approved white variants, its edges kept smooth through transparency), and every coloured pixel, the stripe included,
# keeps its exact colour, fully solid.
INK = (0xef, 0xe9, 0xfb)
from collections import Counter
for src in sorted(folder.glob('*-email-logo.png')):
    im = Image.open(src).convert('RGB')
    out = Image.new('RGBA', im.size)
    px, op = im.load(), out.load()
    grey = lambda c: max(c) - min(c) <= 6
    # The logo's own solid colours (stripe blocks, roundel), so edge pixels blended with white can become that exact
    # colour, partly see-through, instead of a pale fringe.
    counts = Counter(px[x, y] for y in range(im.size[1]) for x in range(im.size[0]))
    solid = [c for c, n in counts.most_common(64) if n >= 40 and not grey(c)]
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            c = px[x, y]
            if grey(c):   # white, greys and black: the background and lettering
                a = 255 - min(c)
                op[x, y] = INK + (a,) if a > 6 else (0, 0, 0, 0)
                continue
            if c in solid:
                op[x, y] = c + (255,)
                continue
            best = None
            for p in solid:   # c = p*k + white*(1-k)?
                ks = [(255 - c[i]) / (255 - p[i]) for i in range(3) if 255 - p[i] > 30]
                if not ks:
                    continue
                k = sum(ks) / len(ks)
                err = max(abs(round(p[i] * k + 255 * (1 - k)) - c[i]) for i in range(3))
                if 0 < k <= 1.02 and (best is None or err < best[0]):
                    best = (err, p, k)
            if best and best[0] <= 14:
                op[x, y] = best[1] + (max(0, min(255, round(best[2] * 255))),)
            else:
                op[x, y] = c + (255,)
    target = src.with_name(src.stem + '-dusk.png')
    out.save(target, optimize=True)
    print('made', target.name)
