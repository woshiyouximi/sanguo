# -*- coding: utf-8 -*-
"""批量把 game/web 里的精灵走一遍像素后处理，输出到新目录（绝不覆盖原件）。

用法（在 F:\\sanguo 下）：
    python tools\\apply_pixel_post.py                     # anim/ 全量，输出 work\\pixel_ab\\batch
    python tools\\apply_pixel_post.py --targets anim,fx   # anim + 技能特效
    python tools\\apply_pixel_post.py --colors 24 --no-outline --dry-run
    python tools\\apply_pixel_post.py --out work\\px_v2 --png8

产物：
    <out>\\anim\\units_00.px.png           ← 同名 + .px 后缀
    <out>\\anim\\atlas_00.px.png
    <out>\\fx\\atlas_000.px.png  +  <out>\\fx\\index.json（sheet 字段改指 .px.png）
    <out>\\manifest.json                  ← 每个文件的色数/体积前后对比

切回原版：产物全在新目录，`game/web/**` 一个字节都没动 —— 只要游戏不引用本目录就是原版。
正式启用时把 main.js 里加载 anim/ 的基路径改一处即可（本轮不改 main.js，另有 agent 在改它）。
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixel_post  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANIM = os.path.join(ROOT, "game", "web", "anim")
FX_CANDIDATES = [os.path.join(ROOT, "game", "web", "fx"),
                 os.path.join(ROOT, "game", "web", "assets", "fx")]

CHAIN_ANIM = ["--alpha-threshold", "0.5", "--outline-mode", "outside",
              "--outline-color", "auto", "--kill-glint"]
# fx 是原作拆包出来 MAGIC 特效（已是硬 alpha + 抖动渐变），二值化/描边对它是负收益
CHAIN_FX = ["--no-alpha", "--no-outline", "--no-outline-snap"]


def find_fx():
    for p in FX_CANDIDATES:
        if os.path.isdir(p) and any(f.startswith("atlas_") for f in os.listdir(p)):
            return p
    return None


def sheets_in(d):
    if not os.path.isdir(d):
        return []
    return sorted(f for f in os.listdir(d) if f.lower().endswith(".png") and ".px." not in f)


def run_chain(src_dir, out_dir, pngs, chain, colors, suffix, dry):
    os.makedirs(out_dir, exist_ok=True)
    inputs = [os.path.join(src_dir, n) for n in pngs]
    if not inputs:
        return 0
    argv = inputs + ["-o", out_dir, "--suffix", suffix, "--colors",
                     str(colors if colors else 32), "--report",
                     os.path.join(out_dir, "_report.json")] + chain
    if dry:
        print("[dry-run] pixel_post " + " ".join(argv))
        return 0
    return pixel_post.main(argv)


def main(argv=None):
    ap = argparse.ArgumentParser(description="批量像素后处理（输出到新目录，不动原件）")
    ap.add_argument("--out", default=os.path.join(ROOT, "work", "pixel_ab", "batch"))
    ap.add_argument("--targets", default="anim", help="逗号分隔：anim,fx（默认 anim）")
    ap.add_argument("--colors", type=int, default=None, help="覆盖默认 32 色")
    ap.add_argument("--suffix", default=".px")
    ap.add_argument("--png8", action="store_true", help="输出 8bit 索引色 PNG（同像素，体积更小）")
    ap.add_argument("--no-outline", action="store_true", help="关掉描边（anim 也会被关掉）")
    ap.add_argument("--no-quantize", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    targets = [t.strip() for t in args.targets.split(",") if t.strip()]
    out = os.path.abspath(args.out)
    for src in (ANIM, find_fx()):
        if src and os.path.abspath(src).lower() in out.lower():
            print("[apply] 输出目录不能放在素材目录里面：%s" % out)
            return 2
    os.makedirs(out, exist_ok=True)
    manifest = {"out": out, "colors": args.colors or 32, "targets": targets, "items": []}

    if "anim" in targets:
        pngs = sheets_in(ANIM)
        chain = list(CHAIN_ANIM)
        if args.no_outline:
            chain += ["--no-outline"]
        if args.no_quantize:
            chain += ["--no-quantize"]
        if args.png8:
            chain += ["--png8"]
        print("[apply] anim: %d 张 -> %s" % (len(pngs), os.path.join(out, "anim")))
        rc = run_chain(ANIM, os.path.join(out, "anim"), pngs, chain, args.colors, args.suffix,
                       args.dry_run)
        if rc:
            return rc
        for n in pngs:
            d = os.path.join(out, "anim", pixel_post.out_name(n, args.suffix, "png"))
            manifest["items"].append({"kind": "anim", "src": n, "out": d})

    if "fx" in targets:
        fx = find_fx()
        if not fx:
            print("[apply] 没找到 fx 目录（game/web/fx 或 game/web/assets/fx）")
        else:
            pngs = sheets_in(fx)
            chain = list(CHAIN_FX)
            if args.no_quantize:
                chain += ["--no-quantize"]
            if args.png8:
                chain += ["--png8"]
            fxo = os.path.join(out, "fx")
            print("[apply] fx: %d 张（原作拆包素材，只做量化）-> %s" % (len(pngs), fxo))
            rc = run_chain(fx, fxo, pngs, chain, args.colors, args.suffix, args.dry_run)
            if rc:
                return rc
            idx = os.path.join(fx, "index.json")
            if os.path.exists(idx) and not args.dry_run:
                d = json.load(open(idx, encoding="utf-8"))
                for dirn in d.get("dirs", {}).values():
                    s = dirn.get("sheet")
                    if s:
                        dirn["sheet"] = pixel_post.out_name(s, args.suffix, "png")
                json.dump(d, open(os.path.join(fxo, "index.json"), "w", encoding="utf-8"),
                          ensure_ascii=False, separators=(",", ":"))
                print("[apply] fx/index.json 已改指 %s 后缀" % args.suffix)

    if not args.dry_run:
        rep = os.path.join(out, "manifest.json")
        json.dump(manifest, open(rep, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("[apply] 清单 -> %s" % rep)
        print("[apply] 切回原版：不引用本目录即可；原件一个字节都没动（只读）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
