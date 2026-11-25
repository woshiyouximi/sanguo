# -*- coding: utf-8 -*-
"""校验 actions.json 每个 sprite 与 actions_v2 源帧像素一致（防止打包偏移/缩放）。
用法: python F:\\sanguo\\work\\verify_actions_atlas.py
"""
import json
from pathlib import Path

from PIL import Image, ImageChops

ATLAS = Path(r"F:\sanguo\game\web\anim\actions_00.png")
META = Path(r"F:\sanguo\game\web\anim\actions.json")
SRC = Path(r"F:\sanguo\project\anim\actions_v2\frames")


def main() -> int:
    meta = json.loads(META.read_text(encoding="utf-8"))
    page = meta["pages"][0]
    sheet = Image.open(ATLAS).convert("RGBA")
    print(f"sheet {sheet.size} mode={Image.open(ATLAS).mode} sprites={len(page['sprites'])}")

    worst = 0
    bad = 0
    counts = {}
    for s in page["sprites"]:
        action = s["name"].rsplit("_", 1)[0]
        src = SRC / action / (s["name"].rsplit("_", 1)[1] + ".png")
        ref = Image.open(src).convert("RGBA")
        if (s["w"], s["h"]) != ref.size:
            print(f"SIZE MISMATCH {s['name']}: atlas {s['w']}x{s['h']} vs src {ref.size}")
            bad += 1
            continue
        crop = sheet.crop((s["x"], s["y"], s["x"] + s["w"], s["y"] + s["h"]))
        diff = ImageChops.difference(crop, ref)
        bbox = diff.getbbox()
        if bbox is not None:
            import numpy as np

            d = np.asarray(diff)
            worst = max(worst, int(d.max()))
            bad += 1
            print(f"PIXEL DIFF {s['name']} bbox={bbox}")
        counts[action] = counts.get(action, 0) + 1

    print(f"actions={counts} worst_diff={worst} bad={bad}")
    print("PASS" if bad == 0 else "FAIL")
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
