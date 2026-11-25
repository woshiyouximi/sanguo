# -*- coding: utf-8 -*-
"""Build 9-slice tiles from MENU sources.

usage: python _make.py <outdir> [--final]

Tile = inset + MID + inset (square).  Corners come from the real image
corners, the four edge strips from the middle of each side, the centre is
left transparent (the canvas art shows through).  MID>=2 is required:
a zero-width middle slice leaves the middle border area empty in CSS.

usage note: the emitted tile is meant for
  border: <inset>px solid transparent;
  border-image: url(tile.png) <inset> / <inset>px / 0 stretch;
"""
import os
import sys
from PIL import Image

MENU = r'F:\sanguo\export\png\SHAPE\MENU'
MID = 6

# key -> (source png, inset)
# 技能格 = D3_2H 角括号宽板；技能格禁用 = D0_B 素金框；
# 按钮可用 = WAR08 金红高亮框；按钮置灰 = D3_2G 角括号；头像框 = D25 角括号；
# 日志框 = D3_2H 同源但 inset 收到 10（14px 边框会压到 canvas 提示行）。
SPEC = {
    'slot':     ('D3_2H', 14),
    'slot_off': ('D0_B', 8),
    'cmd_on':   ('WAR08', 16),
    'cmd_off':  ('D3_2G', 14),
    'port':     ('D25', 14),
    'msg':      ('D3_2H', 10),
}


def build(key, src, inset, outdir):
    im = Image.open(os.path.join(MENU, src + '.png')).convert('RGBA')
    w, h = im.size
    n = inset * 2 + MID
    if w < 2 * inset + MID or h < 2 * inset + MID:
        raise SystemExit('%s %dx%d too small for inset %d + mid %d' % (src, w, h, inset, MID))
    tile = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    # corners
    tile.paste(im.crop((0, 0, inset, inset)), (0, 0))
    tile.paste(im.crop((w - inset, 0, w, inset)), (inset + MID, 0))
    tile.paste(im.crop((0, h - inset, inset, h)), (0, inset + MID))
    tile.paste(im.crop((w - inset, h - inset, w, h)), (inset + MID, inset + MID))
    # edges sampled from the middle of each side
    mx = (w - MID) // 2
    my = (h - MID) // 2
    tile.paste(im.crop((mx, 0, mx + MID, inset)), (inset, 0))            # top
    tile.paste(im.crop((mx, h - inset, mx + MID, h)), (inset, inset + MID))  # bottom
    tile.paste(im.crop((0, my, inset, my + MID)), (0, inset))            # left
    tile.paste(im.crop((w - inset, my, w, my + MID)), (inset + MID, inset))  # right
    out = os.path.join(outdir, key + '.png')
    ncol = len(tile.getcolors(maxcolors=65536) or [])
    if ncol and ncol <= 256:
        tile.quantize(colors=ncol, method=Image.FASTOCTREE).save(out, optimize=True)
    else:
        tile.save(out, optimize=True)
    return out, tile.size


def main():
    outdir = sys.argv[1]
    final = '--final' in sys.argv
    os.makedirs(outdir, exist_ok=True)
    total = 0
    rows = []
    for key, (src, inset) in SPEC.items():
        if final and key.startswith('cand_'):
            continue
        path, size = build(key, src, inset, outdir)
        b = os.path.getsize(path)
        total += b
        rows.append((key, src, inset, size, b))
    # separator keeps the whole source bar (tiled horizontally, never stretched)
    if True:
        src = os.path.join(MENU, 'WAR05.png')
        dst = os.path.join(outdir, 'sep.png')
        Image.open(src).convert('RGBA').save(dst, optimize=True)
        b = os.path.getsize(dst)
        total += b
        rows.append(('sep', 'WAR05', 0, (111, 12), b))
    print('%-13s %-9s %5s %9s %7s' % ('tile', 'source', 'inset', 'px', 'bytes'))
    for key, src, inset, size, b in rows:
        print('%-13s %-9s %5d %9s %7d' % (key, src, inset, '%dx%d' % size, b))
    print('TOTAL %d bytes' % total)


main()
