# -*- coding: utf-8 -*-
"""Dump the 198 (33x6) submenu labels + their exec-entry addresses."""
import rq

out = []
out.append("idx group slot ptr      bytes                     gbk")
for g in range(33):
    for s in range(6):
        i = g * 6 + s
        p = rq.u32(0x48eb60 + i * 4)
        raw = rq.rb(p, 12)
        txt = raw.split(b"\0")[0]
        try:
            dec = txt.decode("gbk")
        except Exception as e:
            dec = "<%s>" % e
        out.append("%3d  %02d   %d  0x%06X  %-24s  %s" % (i, g, s, p, raw.hex(), dec))

# exec table 0x48ee78
out.append("")
out.append("idx group slot exec")
for g in range(33):
    for s in range(6):
        i = g * 6 + s
        f = rq.u32(0x48ee78 + i * 4)
        out.append("%3d  %02d   %d  0x%06X" % (i, g, s, f))

open("menu_strings.txt", "w", encoding="utf-8").write("\n".join(out))
print("ok", len(out))
