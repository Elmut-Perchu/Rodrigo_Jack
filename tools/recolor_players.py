"""Generates one recoloured Adventurer spritesheet per arena fighter.

Run from the repository root:  python3 tools/recolor_players.py

The sheet uses a 25-colour palette, so the two garment families can be
remapped exactly instead of being guessed at with a hue filter:

    tunic  #285daa #2d6ac5 #9bbced   (hue ~216)
    sash   #4f2437 #741a33 #9e293b   (hue ~333-351)

Skin, hair, leather and the steel of the blade share neither hue, so they come
through untouched - which is the whole reason for doing a palette swap rather
than a CSS hue-rotate over the entire sprite.

Output feeds constants/vs_palette.js; keep the two in step.
"""
import colorsys, os
from PIL import Image

SRC = 'assets/sprites/Adventurer_Sprite_Sheet_v1.5.png'
OUT = 'assets/sprites/players'

TUNIC = [(40, 93, 170), (45, 106, 197), (155, 188, 237)]
SASH = [(79, 36, 55), (116, 26, 51), (158, 41, 59)]

# hue, saturation scale, lightness scale, lightness offset.
# Hue alone is not enough: the same lightness reads very differently from one
# hue to the next, so a straight rotation turned gold into olive and green
# into acid. The last two numbers put each family back where the eye expects.
PALETTES = {
    'p1': {'label': 'Crimson & Gold', 'tunic': (352, 1.00, 1.00, 0.00), 'sash': (43, 1.30, 1.00, 0.16)},
    'p2': {'label': 'Teal & Coral',   'tunic': (186, 1.00, 1.00, 0.00), 'sash': (14, 1.15, 1.00, 0.08)},
    'p3': {'label': 'Violet & Jade',  'tunic': (272, 1.05, 0.96, 0.00), 'sash': (152, 1.10, 1.00, 0.06)},
    'p4': {'label': 'Moss & Plum',    'tunic': (104, 1.00, 0.80, 0.00), 'sash': (322, 1.05, 1.00, 0.04)},
}


def shift(rgb, hue_deg, sat_scale, l_scale, l_offset):
    r, g, b = [c / 255 for c in rgb]
    _, l, s = colorsys.rgb_to_hls(r, g, b)
    l = max(0.0, min(1.0, l * l_scale + l_offset))
    s = max(0.0, min(1.0, s * sat_scale))
    r, g, b = colorsys.hls_to_rgb(hue_deg / 360.0, l, s)
    return (round(r * 255), round(g * 255), round(b * 255))


src = Image.open(SRC).convert('RGBA')
os.makedirs(OUT, exist_ok=True)
hexes = lambda c: '#%02x%02x%02x' % c

for key, cfg in PALETTES.items():
    mapping = {}
    for c in TUNIC:
        mapping[c] = shift(c, *cfg['tunic'])
    for c in SASH:
        mapping[c] = shift(c, *cfg['sash'])

    im = src.copy()
    px = im.load()
    w, h = im.size
    changed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            new = mapping.get((r, g, b))
            if new:
                px[x, y] = (new[0], new[1], new[2], a)
                changed += 1

    path = f'{OUT}/adventurer_{key}.png'
    im.save(path, optimize=True)
    print(f"{key:3} {cfg['label']:16} {changed:5d}px  tunic {hexes(mapping[TUNIC[1]])}  sash {hexes(mapping[SASH[2]])}")
