#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
make_hero.py — 把现用 AI 立绘 game/web/assets/hero/<武将名>.webp 从 480x701 重采样到 176x220
（最大显示位 88x110 的 2 倍，retina 余量），文件路径/文件名一律不变，前端零改动。

原则：
  * 原图先整体挪到 work/asset_pipe/hero_webp_orig/（可逆，有清单）；之后每次都从备份读，
    绝不二次压缩已压缩的产物 —— 重跑任意次结果都一样（幂等）。
  * 裁切几何跟页面一致：页面是 object-fit:cover + object-position:50% 14%
    （HUD 是 battleView.js 手写的同一套算法，sy=(pr.h-sh)*0.16）。这里先按 0.8 长宽比
    （=最大显示位 88x110 的比例）用同一 anchor 裁一刀，再 LANCZOS 缩到 176x220。
    这样 88x110 位不裁、86x108 位几乎不裁，观感与现在一致，只是像素变少。

用法：
  $env:PYTHONIOENCODING='utf-8'
  & "...\\python.exe" make_hero.py --sweep          # 只试编码参数，不写 hero/
  & "...\\python.exe" make_hero.py --backup         # 首次：hero/*.webp -> hero_webp_orig/
  & "...\\python.exe" make_hero.py                  # 生成（幂等）
  & "...\\python.exe" make_hero.py --verify
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import shutil
import sys
import time

from PIL import Image

ROOT = r"F:\sanguo"
GEN_JSON = os.path.join(ROOT, "game", "data", "generals.json")
HERO = os.path.join(ROOT, "game", "web", "assets", "hero")
BAK = os.path.join(ROOT, "work", "asset_pipe", "hero_webp_orig")
MANIFEST = os.path.join(ROOT, "work", "asset_pipe", "hero_webp_orig_manifest.csv")
REPORT = os.path.join(ROOT, "work", "asset_pipe", "hero_resize_report.json")

SRC_SIZE = (480, 701)
DST_SIZE = (176, 220)
ANCHOR = (0.5, 0.14)


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if abs(n) < 1024 or unit == "GB":
            return f"{n:.2f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1024.0
    return f"{n} {unit}"


def cover_crop(im: Image.Image, aspect_w: int, aspect_h: int, anchor=ANCHOR) -> Image.Image:
    """按目标长宽比做 object-fit:cover 裁切（不缩放）。"""
    iw, ih = im.size
    target = aspect_w / aspect_h
    cur = iw / ih
    if cur > target:          # 太宽 → 裁左右
        nw = ih * target
        x = (iw - nw) * anchor[0]
        box = (round(x), 0, round(x + nw), ih)
    else:                     # 太高 → 裁上下
        nh = iw / target
        y = (ih - nh) * anchor[1]
        box = (0, round(y), iw, round(y + nh))
    return im.crop(box)


def load_names() -> list[str]:
    with open(GEN_JSON, encoding="utf-8") as f:
        data = json.load(f)
    return [g["NAME"] for g in data[1:401]]


def do_backup(names: list[str]) -> int:
    os.makedirs(BAK, exist_ok=True)
    moved, kept = 0, 0
    with open(MANIFEST, "w", encoding="utf-8-sig", newline="") as mf:
        w = csv.writer(mf)
        w.writerow(["Name", "Length", "BackupPath"])
        for name in names:
            src = os.path.join(HERO, name + ".webp")
            dst = os.path.join(BAK, name + ".webp")
            if os.path.exists(dst) and not os.path.exists(src):
                kept += 1
                w.writerow([name, os.path.getsize(dst), dst])
                continue
            if not os.path.exists(src):
                print("!! 缺源", src)
                continue
            size = os.path.getsize(src)
            shutil.move(src, dst)          # 与 clone 相反：移走，不复制，避免双份
            moved += 1
            w.writerow([name, size, dst])
    print("backup: moved=%d already=%d  bak_total=%s"
          % (moved, kept, human(sum(os.path.getsize(os.path.join(BAK, f)) for f in os.listdir(BAK)))))
    return 0


def encode(im: Image.Image, q: int) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=q, method=6)
    return buf.getvalue()


def build(path_src: str, q: int) -> tuple[Image.Image, bytes]:
    with Image.open(path_src) as im0:
        im = im0.convert("RGBA")
        c = cover_crop(im, *DST_SIZE)
        out = c.resize(DST_SIZE, Image.LANCZOS)
    return out, encode(out, q)


def sweep(names: list[str]) -> int:
    sample = names[::40][:10]
    print("SWEEP  %dx%d -> %dx%d  LANCZOS  样本 %d 张"
          % (SRC_SIZE[0], SRC_SIZE[1], DST_SIZE[0], DST_SIZE[1], len(sample)))
    orig_total = 0
    for name in sample:
        orig_total += os.path.getsize(os.path.join(BAK if os.path.isdir(BAK) and os.listdir(BAK) else HERO, name + ".webp"))
    print("  现状：均 %.0f B / 张 → 400 张外推 %.2f MB" % (orig_total / len(sample), orig_total / len(sample) * 400 / 1048576))
    for q in (75, 80, 85, 88, 90, 92, 95):
        tot = 0
        for name in sample:
            src = os.path.join(BAK if os.path.isdir(BAK) and os.listdir(BAK) else HERO, name + ".webp")
            im, raw = build(src, q)
            tot += len(raw)
        avg = tot / len(sample)
        print("  q%-3d 均 %6.0f B/张 → 400 张 %.2f MB" % (q, avg, avg * 400 / 1048576))
    return 0


def do_build(names: list[str], q: int, force: bool) -> int:
    if not (os.path.isdir(BAK) and os.listdir(BAK)):
        print("!! 没有备份 %s，先跑 --backup（脚本绝不从已压缩产物二次压缩）" % BAK)
        return 2
    t0 = time.time()
    rows = []
    n_new = n_skip = 0
    before = after = 0
    for name in names:
        src = os.path.join(BAK, name + ".webp")
        dst = os.path.join(HERO, name + ".webp")
        if not os.path.exists(src):
            rows.append({"name": name, "error": "missing_backup"})
            continue
        b = os.path.getsize(src)
        before += b
        if (not force) and os.path.exists(dst):
            n_skip += 1
            a = os.path.getsize(dst)
            after += a
            rows.append({"name": name, "before": b, "after": a, "skipped": True})
            continue
        _, raw = build(src, q)
        with open(dst, "wb") as f:
            f.write(raw)
        n_new += 1
        after += len(raw)
        rows.append({"name": name, "before": b, "after": len(raw)})

    # 汇总
    ok = [r for r in rows if "after" in r]
    with Image.open(os.path.join(HERO, names[0] + ".webp")) as im:
        dim = im.size
    summary = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "generator": "work/asset_pipe/make_hero.py",
        "src_size": list(SRC_SIZE),
        "dst_size": list(DST_SIZE),
        "resample": "cover_crop(aspect 176x220, anchor 50%/14%) + LANCZOS",
        "webp": {"quality": q, "method": 6},
        "files": len(names),
        "bytes_before": before,
        "bytes_after": after,
        "ratio": (after / before) if before else 0,
        "written_at_max": dim,
        "rows": rows,
    }
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)
    print("build: files=%d new=%d skip=%d" % (len(names), n_new, n_skip))
    print("before %s (%.2f MB)  ->  after %s (%.2f MB)  ratio %.1f%% saved %.1f%%"
          % (human(before), before / 1048576, human(after), after / 1048576,
             summary["ratio"] * 100, (1 - summary["ratio"]) * 100))
    print("per-file after: max %s  min %s  avg %.0f B"
          % (human(max(r["after"] for r in ok)), human(min(r["after"] for r in ok)),
             sum(r["after"] for r in ok) / len(ok)))
    print("耗时 %.1fs" % (time.time() - t0))
    return 0


def do_verify(names: list[str]) -> int:
    ok = True
    have = {f[:-5] for f in os.listdir(HERO) if f.lower().endswith(".webp")}
    if have != set(names):
        print("!! 文件名集合不符：多 %s 少 %s" % (sorted(have - set(names))[:5], sorted(set(names) - have)[:5]))
        ok = False
    tot = 0
    for name in names:
        p = os.path.join(HERO, name + ".webp")
        with Image.open(p) as im:
            if im.size != DST_SIZE:
                print("!! 尺寸不对", p, im.size)
                ok = False
                break
        tot += os.path.getsize(p)
    others = [f for f in os.listdir(HERO) if not f.lower().endswith(".webp")]
    if others:
        print("!! hero/ 里有非 webp 文件：", others[:5])
        ok = False
    print("hero/: %d 个文件, %s (%.2f MB)" % (len(names), human(tot), tot / 1048576))
    print("verify:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quality", type=int, default=90)
    ap.add_argument("--sweep", action="store_true")
    ap.add_argument("--backup", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args(argv)
    names = load_names()
    if args.sweep:
        return sweep(names)
    if args.backup:
        return do_backup(names)
    if args.verify:
        return do_verify(names)
    return do_build(names, args.quality, args.force)


if __name__ == "__main__":
    sys.exit(main())
