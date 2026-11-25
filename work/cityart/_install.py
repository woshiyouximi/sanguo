# -*- coding: utf-8 -*-
"""Copy the chosen MENU primitives into game/web/assets/cityart/ and append an
alpha evidence block for exactly those files to work/cityart/alpha_check.txt."""
import io
import os
import shutil
from PIL import Image

MENU = r"F:\sanguo\export\png\SHAPE\MENU"
DST = r"F:\sanguo\game\web\assets\cityart"
EVID = r"F:\sanguo\work\cityart\alpha_check.txt"

# (source, dest, nine-slice insets planned for CSS)
PICK = [
    ("D3_2G", "frame_panel.png", (12, 12, 12, 12), "panel/log/city-card gold double frame"),
    ("D25", "plate_chip.png", (8, 8, 8, 8), "hud chip plate + city-name plaque"),
    ("WAR06", "rail_gold.png", (0, 16, 0, 16), "bright gold rail (header/footer/seam)"),
    ("WAR05", "hair_gold.png", (0, 16, 0, 16), "hollow gold hairline (section heads)"),
    ("WAR08", "orn_corner.png", (12, 12, 12, 12), "ornate corner bracket overlay (cmd/btn/pick.on)"),
    ("C4_A", "bar_gauge.png", (0, 0, 0, 0), "gauge bar accent (h2 accent / eff)"),
    ("SB_V1", "sb_track.png", (0, 0, 0, 0), "scrollbar track (vertical double line)"),
    ("SB_V2", "sb_thumb.png", (12, 0, 12, 0), "scrollbar thumb (ornate caps, red body)"),
    ("SB_V6", "sb_up.png", (0, 0, 0, 0), "scrollbar start arrow"),
    ("SB_V7", "sb_down.png", (0, 0, 0, 0), "scrollbar end arrow"),
]


def edge_stats(im, px=4):
    """min/mean alpha of the outermost px rows/cols."""
    a = im.getchannel("A")
    w, h = im.size
    out = {}
    for name, box in (("top", (0, 0, w, px)), ("bottom", (0, h - px, w, h)),
                      ("left", (0, 0, px, h)), ("right", (w - px, 0, w, h))):
        px_ = list(a.crop(box).getdata())
        out[name] = (min(px_), round(sum(px_) / float(len(px_)), 1))
    return out


if not os.path.isdir(DST):
    os.makedirs(DST)
lines = []
lines.append("")
lines.append("=" * 78)
lines.append("USED BY city.html R64  (game/web/assets/cityart/*)  -- re-checked 4px edges")
lines.append("=" * 78)
lines.append("%-16s %-11s %-4s %-28s %s" % ("src", "size", "bytes", "4px edge alpha min/mean (T B L R)", "planned slice"))
tot = 0
for src, dst, sl, why in PICK:
    p = os.path.join(MENU, src + ".png")
    im = Image.open(p).convert("RGBA")
    w, h = im.size
    shutil.copyfile(p, os.path.join(DST, dst))
    n = os.path.getsize(os.path.join(DST, dst))
    tot += n
    e = edge_stats(im)
    edges = " ".join("%s %d/%.1f" % (k[0].upper(), e[k][0], e[k][1]) for k in ("top", "bottom", "left", "right"))
    lines.append("%-16s %-11s %-4d %-28s %s" % (src, "%dx%d" % (w, h), n, edges, str(sl)))
    lines.append("    -> %-16s %s" % (dst, why))
    print("%-12s -> %-18s %dx%d %5dB alpha_ok=%s" % (src, dst, w, h, n,
          all(e[k][0] == 255 for k in ("top", "bottom", "left", "right"))))
lines.append("-" * 78)
lines.append("TOTAL copied: %d bytes, %d files" % (tot, len(PICK)))
lines.append("NOTE: WARINFO01/02 rejected as a four-sided frame -- bottom 4px min alpha 0 / mean 126.3.")
lines.append("      SB_V2 partial-alpha edges are intentional: it is used as scrollbar-thumb caps only.")
with io.open(EVID, "a", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(lines) + "\n")
print("APPENDED", EVID)
print("TOTAL", tot)
