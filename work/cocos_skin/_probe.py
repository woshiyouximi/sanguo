# -*- coding: utf-8 -*-
"""Probe the 26 web UI sprites: size, alpha box, edge uniformity, center-line transitions."""
import os
from PIL import Image

WEB = r"F:\sanguo\game\web\assets"
ITEMS = [(os.path.join(WEB, "ui", "orig", n), n) for n in [
    "frame_panel.png", "plate_btn.png", "plate_sq.png", "plate_sel.png",
    "bar_div.png", "gem_gold.png"]]
ITEMS += [(os.path.join(WEB, "ui", "orig", "force_%02d.png" % i), "force_%02d.png" % i)
          for i in range(1, 14)]
ITEMS += [(os.path.join(WEB, "battleui", n), n) for n in [
    "slot.png", "slot_off.png", "cmd_on.png", "cmd_off.png", "port.png", "msg.png", "sep.png"]]

print("count=%d" % len(ITEMS))
for path, name in ITEMS:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    # alpha bounding box
    alpha = im.getchannel("A")
    abox = alpha.getbbox()
    # count fully transparent pixels on each edge ring
    def ring_transparent(pts):
        return sum(1 for (x, y) in pts if px[x, y][3] == 0)
    left = ring_transparent([(0, y) for y in range(h)])
    right = ring_transparent([(w - 1, y) for y in range(h)])
    top = ring_transparent([(x, 0) for x in range(w)])
    bot = ring_transparent([(x, h - 1) for x in range(w)])
    # center-line transitions: how many times color changes along the middle row/col
    def transitions(seq):
        return sum(1 for i in range(1, len(seq)) if seq[i] != seq[i - 1])
    midrow = [px[x, h // 2] for x in range(w)]
    midcol = [px[w // 2, y] for y in range(h)]
    # find first x where midrow differs from px[0, h//2] (border width guess)
    def first_change(seq):
        base = seq[0]
        for i, v in enumerate(seq):
            if v != base:
                return i
        return len(seq)
    def last_change(seq):
        base = seq[-1]
        for i in range(len(seq) - 1, -1, -1):
            if seq[i] != base:
                return len(seq) - 1 - i
        return len(seq)
    colors = len(im.getcolors(maxcolors=1 << 16) or [])
    print("%-16s %3dx%-3d abox=%-18s edges T=%d B=%d L=%d R=%d | midrow x-chg=%d left=%d right=%d | midcol y-chg=%d top=%d bot=%d | colors=%d" % (
        name, w, h, str(abox), top, bot, left, right,
        transitions(midrow), first_change(midrow), last_change(midrow),
        transitions(midcol), first_change(midcol), last_change(midcol), colors))
