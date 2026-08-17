# -*- coding: utf-8 -*-
"""Draws the app icon: Momo's head on volcanic basalt.

Rendered at 4x and downsampled so the curves stay clean at 48px on a home
screen, which is the size that actually matters.
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "docs", "icons")
SS = 4  # supersample

BASALT = (20, 16, 14)
HEAD_HI = (79, 192, 165)
HEAD_LO = (42, 122, 107)
CROWN = (99, 214, 182)
NAPE = (194, 112, 63)
MASK = (30, 21, 18)
BROW = (95, 182, 224)
EYE = (246, 239, 226)
PUPIL = (20, 16, 14)
BEAK_HI = (88, 66, 52)
BEAK_LO = (42, 30, 23)
ORO = (232, 163, 61)


def draw_icon(size, maskable=False):
    s = size * SS
    img = Image.new("RGBA", (s, s), BASALT + (255,))
    d = ImageDraw.Draw(img)

    # Warm glow from below, like the fritanga bulb the palette came from.
    # Built as a soft mask and pasted, because drawing translucent ellipses
    # directly replaces pixels instead of blending them and leaves a hard rim.
    glow = Image.new("L", (s, s), 0)
    gd = ImageDraw.Draw(glow)
    steps = 90
    gx, gy = s // 2, int(s * 0.9)
    for i in range(steps, 0, -1):
        r = int(s * 0.78 * i / steps)
        v = int(120 * (1 - i / steps) ** 2.1)
        gd.ellipse([gx - r, gy - r, gx + r, gy + r], fill=v)
    img.paste(Image.new("RGB", (s, s), ORO), (0, 0), glow)

    # A maskable icon needs its subject inside the safe circle (80%).
    scale = 0.62 if maskable else 0.76
    cx, cy = s / 2, s / 2 + s * 0.02
    R = s * scale / 2

    def px(x, y):
        """Model coords are the 220x214 SVG viewBox, head centred at (110,70)."""
        return (cx + (x - 110) / 33.0 * R, cy + (y - 70) / 33.0 * R)

    def box(x0, y0, x1, y1):
        a, b = px(x0, y0), px(x1, y1)
        return [a[0], a[1], b[0], b[1]]

    # head — a darker rim under a lighter face reads as depth at small sizes
    d.ellipse(box(77, 37, 143, 103), fill=HEAD_LO)
    d.ellipse(box(79.5, 39.5, 140.5, 100.5), fill=HEAD_HI)
    # crown, kept inside the head so it lifts the top rather than banding it
    d.ellipse(box(84, 40, 136, 74), fill=CROWN)
    d.ellipse(box(82, 48, 138, 102), fill=HEAD_HI)
    # bandit mask
    d.ellipse(box(84, 58, 136, 82), fill=MASK)
    # brows
    bw = max(2, int(R * 0.10))
    d.arc(box(85, 45, 108, 68), 200, 340, fill=BROW, width=bw)
    d.arc(box(112, 45, 135, 68), 200, 340, fill=BROW, width=bw)
    # eyes
    d.ellipse(box(89.4, 61.4, 106.6, 78.6), fill=EYE)
    d.ellipse(box(113.4, 61.4, 130.6, 78.6), fill=EYE)
    d.ellipse(box(94.9, 66.5, 103.9, 75.5), fill=PUPIL)
    d.ellipse(box(118.9, 66.5, 127.9, 75.5), fill=PUPIL)
    d.ellipse(box(99.4, 66.8, 103.0, 70.4), fill=(255, 255, 255))
    d.ellipse(box(123.4, 66.8, 127.0, 70.4), fill=(255, 255, 255))
    # beak
    d.polygon([px(99, 83), px(121, 83), px(110, 90.5)], fill=BEAK_HI)
    d.polygon([px(100, 84.5), px(120, 84.5), px(110, 103)], fill=BEAK_LO)

    return img.convert("RGB").resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
made = []
for name, size, maskable in [
    ("icon-192.png", 192, False),
    ("icon-512.png", 512, False),
    ("icon-maskable-512.png", 512, True),
    ("icon-180.png", 180, False),
]:
    p = os.path.join(OUT, name)
    draw_icon(size, maskable).save(p, "PNG", optimize=True)
    made.append((name, os.path.getsize(p)))

for n, b in made:
    print("%-26s %6d bytes" % (n, b))
