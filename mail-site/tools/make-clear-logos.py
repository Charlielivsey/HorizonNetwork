#!/usr/bin/env python3
"""Makes see-through copies of the HN Group email logos for showing inside HN Mail (the user's report, 6 November 2026:
the signature logo had "a white box around" it in Midnight Lavender). White becomes transparent; every other colour
keeps its look over white (colour-to-alpha). The logos people receive are unchanged.
   python3 mail-site/tools/make-clear-logos.py"""
from pathlib import Path
from PIL import Image

folder = Path(__file__).resolve().parent.parent / 'public' / 'assets' / 'brand' / 'png'
for src in sorted(folder.glob('*-email-logo.png')):
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
