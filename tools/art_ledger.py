"""美术产出总台账：扫描所有出图目录，汇总成一张 CSV + 一张 by-batch 统计。

为什么需要它：
- 400 张头像 + 620 帧兵种 + 346 帧特效，**没有台账就无法回答**"这批出到哪了、谁出的、seed 是多少、哪张是重出的"。
- 重出一张时必须能查出旧参数（seed/prompt hash），否则风格会漂。

用法：
    python F:\\sanguo\\tools\\art_ledger.py                # 扫默认目录，写 ledger.csv
    python F:\\sanguo\\tools\\art_ledger.py --root D:\\x     # 换根目录
输出：
    F:\\sanguo\\project\\art_ref\\ledger.csv
    stdout 打印 by-batch 统计（张数 / 总字节 / 最近时间）
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

# 默认要扫的目录（都是 run_batch.py 的 --out）
DEFAULT_ROOTS = [
    r"F:\sanguo\project\art_ref",
]

# 文件名 → (batch, id) 的推断规则
PATTERNS = [
    (re.compile(r"^(hero)_(.+)$"), "heroes"),
    (re.compile(r"^(troop)_(.+)_(front|back)$"), "troops"),
    (re.compile(r"^(soldier)_(.+)$"), "soldiers"),
    (re.compile(r"^(ui|bg|fx|map)_(.+)$"), "scenes"),
    (re.compile(r"^(loc|seq)_(.+)$"), "anim"),
]

SKIP_DIRS = {"floors", "heroes", "heroes40", "__pycache__"}


def sha1_8(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:8]


def classify(stem: str) -> tuple[str, str]:
    for rx, batch in PATTERNS:
        m = rx.match(stem)
        if m:
            return batch, m.group(2)
    return "other", stem


def png_size(path: Path) -> tuple[int, int]:
    """只读 PNG 头拿宽高，不解码整图。"""
    try:
        with path.open("rb") as f:
            head = f.read(33)
        if head[:8] != b"\x89PNG\r\n\x1a\n":
            return 0, 0
        w = int.from_bytes(head[16:20], "big")
        h = int.from_bytes(head[20:24], "big")
        return w, h
    except OSError:
        return 0, 0


def scan(root: Path) -> list[dict]:
    rows: list[dict] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in sorted(filenames):
            if not name.lower().endswith(".png"):
                continue
            p = Path(dirpath) / name
            stem = p.stem
            # run_batch 的多帧输出是 <id>_NN.png（NN 从 01 开始），归到同一个 id
            frame = ""
            m = re.match(r"^(.+?)_(\d{2,3})$", stem)
            if m:
                cand = m.group(1)
                if any(rx.match(cand) for rx, _ in PATTERNS):
                    stem, frame = cand, m.group(2)
            batch, ident = classify(stem)
            w, h = png_size(p)
            rows.append({
                "batch": batch,
                "id": ident,
                "frame": frame,
                "w": w,
                "h": h,
                "bytes": p.stat().st_size,
                "sha1_8": sha1_8(p),
                "mtime": time.strftime("%Y-%m-%d %H:%M", time.localtime(p.stat().st_mtime)),
                "path": str(p),
                "dir": str(p.parent),
            })
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", action="append", default=None, help="要扫的目录，可重复")
    ap.add_argument("--out", default=r"F:\sanguo\project\art_ref\ledger.csv")
    args = ap.parse_args()

    roots = [Path(r) for r in (args.root or DEFAULT_ROOTS)]
    rows: list[dict] = []
    for r in roots:
        if not r.exists():
            print(f"[skip] {r} 不存在")
            continue
        part = scan(r)
        print(f"[scan] {r} → {len(part)} png")
        rows.extend(part)

    if not rows:
        print("没有扫到任何 PNG", file=sys.stderr)
        return 2

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    # by-batch 统计
    stat: dict[str, dict] = {}
    for r in rows:
        s = stat.setdefault(r["batch"], {"n": 0, "bytes": 0, "ids": set(), "last": ""})
        s["n"] += 1
        s["bytes"] += r["bytes"]
        s["ids"].add(r["id"])
        s["last"] = max(s["last"], r["mtime"])

    print("\n%-10s %6s %8s %10s %6s  %s" % ("batch", "files", "unique", "MB", "avgKB", "last"))
    for b, s in sorted(stat.items(), key=lambda kv: -kv[1]["n"]):
        print("%-10s %6d %8d %10.1f %6.0f  %s" % (
            b, s["n"], len(s["ids"]), s["bytes"] / 1e6, s["bytes"] / s["n"] / 1024, s["last"]))
    print(f"\n台账: {out}  ({len(rows)} 行)")

    meta = out.with_suffix(".json")
    meta.write_text(json.dumps({
        "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "roots": [str(r) for r in roots],
        "total_files": len(rows),
        "batches": {b: {"files": s["n"], "unique_ids": len(s["ids"]), "bytes": s["bytes"]}
                    for b, s in stat.items()},
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"统计: {meta}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
