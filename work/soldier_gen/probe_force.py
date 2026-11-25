# -*- coding: utf-8 -*-
"""勘察 FORCE 士兵帧：命名解析、每兵种每动作的帧序列、逐帧 offx/offy 与 ink 包围盒。

产出 work/soldier_gen/force_probe.txt
"""
import json
import re
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"F:\sanguo")
GEN = ROOT / "work" / "soldier_gen"
PNG = ROOT / "export" / "png" / "SHAPE" / "FORCE"

MAN = json.loads((ROOT / "export" / "manifest_art.json").read_text(encoding="utf-8"))
FORCE = {}
for m in MAN:
    p = m["path"].replace("\\", "/")
    if not p.upper().startswith("SHAPE/FORCE/"):
        continue
    FORCE[p.split("/")[-1].rsplit(".", 1)[0].upper()] = m

# 用 things.json 的对象表拿到每兵种的真实动作序列
SOL = json.loads((GEN / "soldiers_raw.json").read_text(encoding="utf-8"))


def bbox_of(stem):
    p = PNG / (stem + ".png")
    if not p.exists():
        # 大小写不敏感兜底
        cand = [q for q in PNG.glob("*.png") if q.stem.upper() == stem.upper()]
        if not cand:
            return None
        p = cand[0]
    im = Image.open(p).convert("RGBA")
    a = np.asarray(im)
    al = a[..., 3]
    ys, xs = np.nonzero(al)
    if len(xs) == 0:
        return (0, 0, 0, 0)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def main():
    out = []
    # 只看蓝军步兵（M 侧 13 兵种）的 Walk / Attack / Wait
    troops = [o for o in SOL if o["name"].startswith("M") is False]
    blue = [o for o in SOL if o["obj"] <= 44]
    out.append("== 13 兵种（M 侧步兵）动作序列与几何 ==")
    agg = {}
    for o in blue:
        letter = None
        for k, shapes in o["anims"].items():
            if shapes:
                s = shapes[0]
                # M + letter + ...
                letter = s[1]
                break
        agg[letter] = {"name": o["name"], "obj": o["obj"]}
        out.append("")
        out.append("%s %s obj=%d" % (letter, o["name"], o["obj"]))
        for act in ("Wait", "Walk", "Attack", "Defense", "Pain", "Death", "Win"):
            shapes = o["anims"].get(act, [])
            out.append("  %-8s n=%-3d %s" % (act, len(shapes), ",".join(shapes)))
    # 几何：对 Walk / Attack 的每一帧
    out.append("")
    out.append("== 几何（offx/offy 与 ink 相对锚点） ==")
    out.append("act   stem          WxH      offx offy  ink_l ink_r ink_top ink_bot  inkW inkH")
    stats = defaultdict(lambda: {"maxl": 0, "maxr": 0, "maxup": 0, "maxdown": 0, "maxw": 0, "maxh": 0})
    for o in blue:
        for act in ("Walk", "Attack"):
            for stem in o["anims"].get(act, []):
                md = FORCE.get(stem.upper())
                if md is None:
                    out.append("MISSING %s" % stem)
                    continue
                bb = bbox_of(stem)
                if bb is None:
                    out.append("NOPNG   %s" % stem)
                    continue
                ox, oy = md["offx"], md["offy"]
                l, t, r, b = bb
                ink_l, ink_r = ox - l, r - ox
                ink_top, ink_bot = oy - t, b - oy
                st = stats[act]
                st["maxl"] = max(st["maxl"], ox)
                st["maxr"] = max(st["maxr"], md["width"] - ox)
                st["maxup"] = max(st["maxup"], oy)
                st["maxdown"] = max(st["maxdown"], md["height"] - oy)
                st["maxw"] = max(st["maxw"], md["width"])
                st["maxh"] = max(st["maxh"], md["height"])
                st["ink_l"] = max(st.get("ink_l", 0), ink_l)
                st["ink_r"] = max(st.get("ink_r", 0), ink_r)
                st["ink_top"] = max(st.get("ink_top", 0), ink_top)
                st["ink_bot"] = max(st.get("ink_bot", 0), ink_bot)
                out.append("%-5s %-12s %3dx%-3d %3d %3d   %4d %4d %5d %6d  %3d %3d"
                           % (act, stem, md["width"], md["height"], ox, oy,
                              ink_l, ink_r, ink_top, ink_bot, r - l, b - t))
    out.append("")
    out.append("== 汇总（13 兵种 M 侧） ==")
    for act, st in stats.items():
        out.append("%-6s offx<=%d right<=%d up<=%d down<=%d  W<=%d H<=%d | ink l<=%d r<=%d top<=%d bot<=%d"
                   % (act, st["maxl"], st["maxr"], st["maxup"], st["maxdown"], st["maxw"], st["maxh"],
                      st["ink_l"], st["ink_r"], st["ink_top"], st["ink_bot"]))
    g = {"maxl": 0, "maxr": 0, "maxup": 0, "maxdown": 0,
         "ink_l": 0, "ink_r": 0, "ink_top": 0, "ink_bot": 0}
    for st in stats.values():
        for k in g:
            g[k] = max(g[k], st[k])
    out.append("GLOBAL " + json.dumps(g))
    out.append("=> 对称画布宽 2*max(ink_l,ink_r) = %d ; 66px 宽时身高 = %.1f px"
               % (2 * max(g["ink_l"], g["ink_r"]),
                  66.0 * g["ink_top"] / (2 * max(g["ink_l"], g["ink_r"]))))
    (GEN / "force_probe.txt").write_text("\n".join(out), encoding="utf-8")
    print("ok", len(out))


main()
