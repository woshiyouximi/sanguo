# -*- coding: utf-8 -*-
"""生成 batch.mjs 的 jobs.json：12 张地形 + 1 张 ?bgbench=1 性能取证"""
import json

BASE = "http://127.0.0.1:5173/web/index.html?sim=120&freeze=1"
OUT = r"F:\sanguo\work\bg_orig"
CLIP = "16,133,750,1334"

jobs = []
for t in range(12):
    jobs.append(
        {
            "url": f"{BASE}&terrain={t:02d}",
            "out": rf"{OUT}\terrain_{t:02d}.png",
            "wait": 2400,
            "clip": CLIP,
        }
    )
for t in (0, 8):
    jobs.append(
        {
            "url": f"{BASE}&terrain={t:02d}&bgbench=1",
            "out": rf"{OUT}\raw\bench_{t:02d}.png",
            "wait": 2600,
            "clip": CLIP,
        }
    )

with open(rf"{OUT}\jobs.json", "w", encoding="utf-8") as f:
    json.dump(jobs, f, ensure_ascii=False, indent=1)
print("jobs", len(jobs))
