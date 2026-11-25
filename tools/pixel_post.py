#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""pixel_post.py - 纯后处理：把全彩 AI 精灵压成"原作口径"的像素画。

链（每一步都能单独关掉）：
    pixelate(可选 2x 下采样 + 2x 最近邻放大)
  -> alpha 二值化(阈值默认 0.5)
  -> 调色板量化(median-cut 到 N 色，N 默认 32，全批共用一张色板)
  -> 1px 深色描边(沿 alpha 外侧补一圈，颜色 auto / 指定 HEX)

设计要点（为什么不是简单调个 Image.quantize）：
  * **一个 32 色板管全部帧**。逐帧各自量化会让同一动作相邻帧的甲片颜色跳变，
    播起来像"闪色"。所以先收集全部帧的像素，切一次色板，再统一映射。
  * **图集按 sprite 矩形的边界处理**。图集里帧与帧之间有 2px 透明 gutter，
    整页一起做像素化/二值化会把 gutter 混进邻帧；这里按矩形逐帧做，再拼回。
  * **输出尺寸恒定**。像素化的"下采样再放大"最终回到原尺寸，
    所以 units.json / atlas.json 的帧矩形一个字节都不用改。

用法：
    # 单图
    python tools/pixel_post.py sprite.png -o out/
    # 图集（自动读同名 .json 或目录里的 index.json 取帧矩形）
    python tools/pixel_post.py game/web/anim/units_00.png -o work/pixel_ab --suffix .px
    # 关掉某一步 / 改参数
    python tools/pixel_post.py a.png b.png -o out --no-outline --colors 24
    python tools/pixel_post.py a.png -o out --outline-color 12151A --outline-mode inside
    python tools/pixel_post.py a.png -o out --pixel 2 --dither bayer4 --report r.json

退出码：0 正常，2 参数/输入错误。
Windows 下建议用 DSH 自带解释器：
    C:\\Users\\liutian\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
import time

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

# 原作攻描边色（比纯黑暖一点，跟 16 色场景的 #1A1614 同族）
DEFAULT_OUTLINE_HEX = "12151A"
BAYER4 = np.array([
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
], dtype=np.float32) / 16.0


# ---------------------------------------------------------------- 基础工具

def log(msg: str) -> None:
    print(msg, flush=True)


def hex2rgb(s: str) -> np.ndarray:
    s = s.strip().lstrip("#")
    if len(s) != 6:
        raise ValueError("颜色要 6 位 HEX，例如 12151A")
    return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.uint8)


def rgb2hex(c) -> str:
    return "#%02X%02X%02X" % tuple(int(v) for v in c[:3])


def luma(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return 0.299 * r + 0.587 * g + 0.114 * b


def unique_colors(rgb: np.ndarray, mask: np.ndarray) -> int:
    """alpha>0（或给定 mask）范围内的唯一 RGB 数——本文件统一的口径。"""
    if not mask.any():
        return 0
    px = rgb[mask].reshape(-1, 3)
    return int(np.unique(px, axis=0).shape[0])


# ---------------------------------------------------------------- 帧矩形

def fx_rects(index_path: str, sheet_name: str):
    """game/web/assets/fx/index.json -> 某张图上所有帧的矩形。"""
    d = json.load(open(index_path, encoding="utf-8"))
    out = []
    for _k, ent in (d.get("dirs") or {}).items():
        if os.path.basename(ent.get("sheet", "")) != sheet_name:
            continue
        for it in ent.get("list", []):
            x, y, w, h = int(it[0]), int(it[1]), int(it[2]), int(it[3])
            if w > 0 and h > 0:
                out.append({"name": "%s_f%03d" % (_k, len(out)), "x": x, "y": y, "w": w, "h": h})
    return out


def load_rects(path: str):
    """units.json / atlas.json / actions.json（pages[].sprites[]）或 fx index.json。"""
    d = json.load(open(path, encoding="utf-8"))
    if isinstance(d, dict) and "pages" in d:
        out = []
        for p in d["pages"]:
            for s in p.get("sprites", []):
                out.append({"name": s["name"], "x": s["x"], "y": s["y"], "w": s["w"], "h": s["h"]})
        return out
    if isinstance(d, dict) and "dirs" in d:
        return None  # 交给 fx_rects（按 sheet 名过滤）
    return None


def resolve_rects(img_path: str, args):
    """优先级：--rects 指定 > 同名 .json > 目录里的 index.json。"""
    name = os.path.basename(img_path)
    if args.rects:
        if args.rects.lower() == "auto":
            pass
        else:
            rp = args.rects
            rs = load_rects(rp) if os.path.exists(rp) else None
            if rs is None:
                rs = fx_rects(rp, name)
            return rs, rp
    stem = os.path.splitext(img_path)[0]
    if os.path.exists(stem + ".json"):
        rs = load_rects(stem + ".json")
        if rs:
            return rs, os.path.basename(stem + ".json")
    # 同目录里任何 json 只要有一页 file == 本图文件名（units.json / atlas.json 这类）
    d = os.path.dirname(img_path) or "."
    for jf in sorted(glob.glob(os.path.join(d, "*.json"))):
        try:
            dd = json.load(open(jf, encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(dd, dict):
            continue
        for pg in dd.get("pages", []) or []:
            if os.path.basename(pg.get("file", "")) == name:
                rs = [{"name": s["name"], "x": s["x"], "y": s["y"], "w": s["w"], "h": s["h"]}
                      for s in pg.get("sprites", [])]
                if rs:
                    return rs, os.path.basename(jf)
    idx = os.path.join(d, "index.json")
    if os.path.exists(idx):
        rs = fx_rects(idx, name)
        if rs:
            return rs, "index.json"
    return None, None


# ---------------------------------------------------------------- 步骤 1 像素化

def pixelate(patch: np.ndarray, f: int) -> np.ndarray:
    """f×f 盒式下采样再最近邻放大回原尺寸。预乘 alpha 避免透明边缘发黑。"""
    h, w = patch.shape[:2]
    if f <= 1 or w < 2 or h < 2:
        return patch
    a = patch[..., 3:4].astype(np.float32) / 255.0
    pm = patch[..., :3].astype(np.float32) * a            # 预乘
    nw, nh = max(1, w // f), max(1, h // f)
    small_rgb = np.array(Image.fromarray(np.clip(pm, 0, 255).astype(np.uint8), "RGB")
                         .resize((nw, nh), Image.BOX), dtype=np.float32)
    small_a = np.array(Image.fromarray(patch[..., 3], "L").resize((nw, nh), Image.BOX), dtype=np.float32)
    sa = small_a[..., None] / 255.0
    small_rgb = np.where(sa > 1e-6, small_rgb / np.maximum(sa, 1e-6), 0.0)
    big_rgb = np.array(Image.fromarray(np.clip(small_rgb, 0, 255).astype(np.uint8), "RGB")
                       .resize((w, h), Image.NEAREST), dtype=np.uint8)
    big_a = np.array(Image.fromarray(np.clip(small_a, 0, 255).astype(np.uint8), "L")
                     .resize((w, h), Image.NEAREST), dtype=np.uint8)
    out = np.dstack([big_rgb, big_a])
    return out


# ---------------------------------------------------------------- 步骤 3 量化

def median_cut(colors: np.ndarray, counts: np.ndarray, k: int, seed: int = 0):
    """加权 median-cut。colors(uint8 N×3) + counts(N) -> 调色板 (<=k)×3 uint8。"""
    colors = colors.astype(np.float32)
    counts = counts.astype(np.float64)
    boxes = [(colors, counts)]
    while len(boxes) < k:
        best_i, best_score, best_ch = -1, -1.0, 0
        for i, (c, ct) in enumerate(boxes):
            if len(c) < 2:
                continue
            rng = c.max(0) - c.min(0)
            ch = int(np.argmax(rng))
            score = float(rng[ch]) * float(np.sqrt(ct.sum() + 1.0))
            if score > best_score:
                best_i, best_score, best_ch = i, score, ch
        if best_i < 0:            # 所有盒子都不可再分（颜色本就 <= k）
            break
        c, ct = boxes[best_i]
        order = np.argsort(c[:, best_ch], kind="stable")
        c, ct = c[order], ct[order]
        cum = np.cumsum(ct)
        half = cum[-1] / 2.0
        idx = int(np.searchsorted(cum, half))
        idx = min(max(idx, 1), len(c) - 1)
        boxes[best_i:best_i + 1] = [(c[:idx], ct[:idx]), (c[idx:], ct[idx:])]
    pal = np.array([(c * ct[:, None]).sum(0) / max(ct.sum(), 1e-9) for c, ct in boxes])
    pal = np.clip(np.rint(pal), 0, 255).astype(np.uint8)
    return np.unique(pal, axis=0)


def build_palette(samples: np.ndarray, counts: np.ndarray, k: int) -> np.ndarray:
    """samples/counts 已经是去重后的 (颜色, 出现次数)。"""
    if len(samples) <= k:
        return samples.astype(np.uint8)
    return median_cut(samples, counts, k)


def palette_from_jobs(jobs, k: int) -> np.ndarray:
    S, C = [], []
    for job in jobs:
        for (p, _x, _y) in job["patches"]:
            m = p[..., 3] >= 128
            if m.any():
                u, c = np.unique(p[..., :3][m], axis=0, return_counts=True)
                S.append(u)
                C.append(c)
    if not S:
        return np.zeros((0, 3), np.uint8)
    S = np.concatenate(S, 0)
    C = np.concatenate(C, 0)
    u, inv = np.unique(S, axis=0, return_inverse=True)
    agg = np.zeros(len(u), np.int64)
    np.add.at(agg, inv.ravel(), C)
    return build_palette(u, agg, k)


def map_to_palette(rgb: np.ndarray, mask: np.ndarray, pal: np.ndarray, chunk: int = 120000):
    out = rgb.copy()
    if not mask.any() or len(pal) == 0:
        return out
    ys, xs = np.nonzero(mask)
    flat = rgb[ys, xs].astype(np.int32)          # 必须 int32：int16 上 (255-0)^2 会溢出成负数
    res = np.empty_like(flat)
    p = pal.astype(np.int32)
    for s in range(0, len(flat), chunk):
        seg = flat[s:s + chunk]
        d = ((seg[:, None, :] - p[None, :, :]) ** 2).sum(2)
        res[s:s + chunk] = p[d.argmin(1)]
    out[ys, xs] = res.astype(np.uint8)
    return out


# ---------------------------------------------------------------- 步骤 4 描边

NEIGH8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
NEIGH4 = [(-1, 0), (0, -1), (0, 1), (1, 0)]


def shifted(a: np.ndarray, dy: int, dx: int):
    """把 a 平移 (dy,dx)，移出去的部分填 0。"""
    out = np.zeros_like(a)
    h, w = a.shape[:2]
    ys0, ys1 = max(0, dy), h + min(0, dy)
    xs0, xs1 = max(0, dx), w + min(0, dx)
    out[ys0:ys1, xs0:xs1] = a[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
    return out


def dilate(mask: np.ndarray, conn: int = 8) -> np.ndarray:
    out = mask.copy()
    for dy, dx in (NEIGH8 if conn == 8 else NEIGH4):
        out |= shifted(mask, dy, dx)
    return out


def erode(mask: np.ndarray, conn: int = 8) -> np.ndarray:
    out = mask.copy()
    for dy, dx in (NEIGH8 if conn == 8 else NEIGH4):
        out &= shifted(mask, dy, dx)
    return out


def outline_patch(patch: np.ndarray, color_arg: str, mode: str, conn: int,
                  dark_pct: float, snap_pal, grow: np.ndarray | None):
    """在 patch 上补 1px 描边，返回 (新patch, 描边用色 list, 描边像素数)。

    color_arg='auto' 时：取该像素 8 邻域里"本帧最暗 dark_pct 那部分"的均值 ×0.35；
    没有暗邻域就退回全帧暗部均值；仍没有就用 DEFAULT_OUTLINE_HEX。
    """
    rgb = patch[..., :3]
    a = patch[..., 3]
    mask = a > 0

    if mode == "inside":
        ring = mask & ~erode(mask, conn)
    else:                                   # outside（默认）：往外长一圈
        ring = dilate(mask, conn) & ~mask
        if grow is not None:
            ring &= grow
    n = int(ring.sum())
    if n == 0:
        return patch, [], 0

    out = patch.copy()
    if color_arg != "auto":
        c = hex2rgb(color_arg)
        out[..., :3][ring] = c
        out[..., 3][ring] = 255
        return out, [c], n

    # ---- auto：逐像素取邻域暗部均值 × 0.35
    lum = luma(rgb)
    solid = mask
    if solid.any():
        thr = np.percentile(lum[solid], dark_pct * 100.0)
        dark = solid & (lum <= thr)
    else:
        dark = solid
    if not dark.any():
        c = hex2rgb(DEFAULT_OUTLINE_HEX)
        out[..., :3][ring] = c
        out[..., 3][ring] = 255
        return out, [c], n

    acc = np.zeros(rgb.shape, np.float64)
    cnt = np.zeros(mask.shape, np.float64)
    for dy, dx in NEIGH8:
        d_shift = shifted(dark, dy, dx)
        acc += shifted(rgb, dy, dx).astype(np.float64) * d_shift[..., None]
        cnt += d_shift
    fallback = rgb[dark].mean(0)
    mean = np.where(cnt[..., None] > 0, acc / np.maximum(cnt, 1)[..., None], fallback)
    cols = np.clip(np.rint(mean * 0.35), 0, 255).astype(np.uint8)

    if snap_pal is not None and len(snap_pal):
        flat = cols[ring].astype(np.int32)
        p = snap_pal.astype(np.int32)
        idx = ((flat[:, None, :] - p[None, :, :]) ** 2).sum(2).argmin(1)
        cols[ring] = p[idx].astype(np.uint8)
    out[..., :3][ring] = cols[ring]
    out[..., 3][ring] = 255
    used = np.unique(cols[ring], axis=0)
    return out, list(used), n


def kill_glint(patch: np.ndarray, yfrac: float, sat_max: float, luma_pct: float) -> np.ndarray:
    """清掉 AI 精灵自带的"接地光斑"：帧底部一条低饱和高亮度的亮片。

    判定 = 在帧底部 (1-yfrac) 区域里、alpha>0、饱和度 < sat_max、亮度在该区域前
    (1-luma_pct) 百分位的像素。只动 alpha，不动颜色；描边随后会贴着真正的脚包一圈。
    """
    h = patch.shape[0]
    y0 = int(h * yfrac)
    if y0 >= h:
        return patch
    sub = patch[y0:]
    a = sub[..., 3]
    m = a > 0
    if not m.any():
        return patch
    rgb = sub[..., :3].astype(np.float32)
    mx = rgb.max(2)
    mn = rgb.min(2)
    sat = np.where(mx > 1.0, (mx - mn) / np.maximum(mx, 1.0), 0.0)
    lum = luma(rgb)
    thr = np.percentile(lum[m], luma_pct * 100.0)
    sel = m & (sat < sat_max) & (lum >= thr)
    out = patch.copy()
    out[y0:, :, 3] = np.where(sel, 0, a).astype(np.uint8)
    return out


def save_png8(arr_rgba: np.ndarray, path: str) -> bool:
    """写成 8bit 索引色 PNG（P 模式 + tRNS）。颜色数 > 254 时返回 False 交给普通 RGBA。"""
    rgb = arr_rgba[..., :3]
    a = arr_rgba[..., 3]
    solid = a > 0
    if not solid.any():
        return False
    cols, inv = np.unique(rgb[solid].reshape(-1, 3), axis=0, return_inverse=True)
    if len(cols) > 254:
        return False
    idx = np.zeros(a.shape, np.uint8)          # 0 号 = 全透明
    idx[solid] = (inv.reshape(-1) + 1).astype(np.uint8)
    im = Image.fromarray(idx, "P")
    pal = [0, 0, 0] + cols.reshape(-1).tolist()
    im.putpalette(pal + [0] * (768 - len(pal)))
    im.save(path, optimize=True, transparency=0)
    return True


def save_result(arr_rgba: np.ndarray, path: str, fmt: str, png8: bool, bg_hex: str) -> None:
    if fmt == "jpg":
        bg = hex2rgb(bg_hex).astype(np.float32)
        al = (arr_rgba[..., 3:4].astype(np.float32) / 255.0)
        flat = arr_rgba[..., :3].astype(np.float32) * al + bg * (1.0 - al)
        Image.fromarray(np.clip(np.rint(flat), 0, 255).astype(np.uint8), "RGB").save(
            path, quality=95, subsampling=0)
        return
    if png8 and save_png8(arr_rgba, path):
        return
    Image.fromarray(arr_rgba, "RGBA").save(path, optimize=True)


# ---------------------------------------------------------------- 主流程

def out_name(png_path: str, suffix: str, fmt: str = "png") -> str:
    stem = os.path.splitext(os.path.basename(png_path))[0]
    if suffix.lower() in ("." + fmt.lower(), ""):      # --format jpg --suffix .jpg 别写成 a.jpg.jpg
        return stem + "." + fmt
    return stem + suffix + "." + fmt


def expand(inputs, outdir, suffix, fmt="png"):
    jobs = []
    for pat in inputs:
        for p in sorted(glob.glob(pat)) if any(ch in pat for ch in "*?[") else [pat]:
            if not os.path.exists(p):
                raise SystemExit("[pixel_post] 输入不存在: %s" % p)
            jobs.append((p, os.path.join(outdir, out_name(p, suffix, fmt))))
    return jobs


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="纯后处理：全彩精灵 -> N 色像素画（不改尺寸）")
    ap.add_argument("inputs", nargs="+", help="PNG 路径，支持通配符")
    ap.add_argument("-o", "--out", required=True, help="输出目录")
    ap.add_argument("--suffix", default=".px", help="输出文件名后缀，默认 .px")
    ap.add_argument("--rects", default=None,
                    help="帧矩形 json；auto=自动探测（同名 .json 或目录 index.json）")
    ap.add_argument("--colors", type=int, default=32, help="调色板色数，默认 32")
    ap.add_argument("--palette", choices=["file", "shared"], default="file",
                    help="file=每张图各自一条色板（默认，避免不同内容抢颜色）；shared=全批共用一条")
    ap.add_argument("--no-quantize", action="store_true")
    ap.add_argument("--alpha-threshold", type=float, default=0.5, help="alpha 二值化阈值，默认 0.5")
    ap.add_argument("--no-alpha", action="store_true", help="跳过 alpha 二值化")
    ap.add_argument("--outline-color", default="auto", help="auto 或 6 位 HEX（默认 auto）")
    ap.add_argument("--outline-mode", choices=["outside", "inside"], default="outside")
    ap.add_argument("--outline-conn", type=int, choices=[4, 8], default=8)
    ap.add_argument("--outline-dark", type=float, default=0.35,
                    help="auto 取色的暗部百分位，默认 0.35（=最暗 35%%）")
    ap.add_argument("--no-outline", action="store_true")
    ap.add_argument("--no-outline-snap", action="store_true", help="auto 描边色不吸附到调色板")
    ap.add_argument("--pixel", type=int, default=1, help="像素化倍率，1=关，2=2x 下采样再放大")
    ap.add_argument("--dither", choices=["none", "bayer4"], default="none")
    ap.add_argument("--kill-glint", action="store_true",
                    help="清掉 AI 精灵自带的接地亮斑（实验步骤，默认关）")
    ap.add_argument("--glint-y", type=float, default=0.82, help="只在该帧最底部 (1-该值) 区域找亮斑")
    ap.add_argument("--glint-sat", type=float, default=0.18, help="亮斑判定：饱和度上限")
    ap.add_argument("--glint-luma", type=float, default=0.55,
                    help="亮斑判定：该区域亮度百分位下限（取比它亮的）")
    ap.add_argument("--report", default=None, help="把逐帧统计写成 JSON")
    ap.add_argument("--format", choices=["png", "jpg"], default="png",
                    help="输出格式，默认 png（jpg 会丢掉 alpha，按 --bg-color 压平）")
    ap.add_argument("--bg-color", default="1A1614", help="--format jpg 时 alpha=0 的底色")
    ap.add_argument("--png8", action="store_true",
                    help="PNG 用 8bit 索引色（P 模式 + tRNS）存，体积再降一截；颜色>254 自动退回 RGBA")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    if args.pixel not in (1, 2, 3, 4):
        log("[pixel_post] --pixel 只支持 1/2/3/4"); return 2
    os.makedirs(args.out, exist_ok=True)
    jobs = expand(args.inputs, args.out, args.suffix, args.format)
    if not jobs:
        log("[pixel_post] 没有可处理的文件"); return 2

    t0 = time.time()
    # ---------- 阶段 1：读入 + 像素化 + 收集全批像素样本
    plan = []          # (in, out, rects, rectname, img_h, img_w, patches)
    for src, dst in jobs:
        im = Image.open(src)
        im.load()
        if im.mode not in ("RGBA", "LA"):
            im = im.convert("RGBA")
        img = np.array(im, dtype=np.uint8)
        if img.ndim == 2:
            img = np.dstack([img, img, img, np.full(img.shape, 255, np.uint8)])
        h, w = img.shape[:2]
        rects, rsrc = resolve_rects(src, args)
        if rects is None:
            rects = [{"name": os.path.basename(src), "x": 0, "y": 0, "w": w, "h": h}]
        patches = []
        for r in rects:
            x, y, rw, rh = r["x"], r["y"], r["w"], r["h"]
            x = max(0, min(x, w - 1)); y = max(0, min(y, h - 1))
            rw = max(1, min(rw, w - x)); rh = max(1, min(rh, h - y))
            p = img[y:y + rh, x:x + rw].copy()
            if args.pixel > 1:
                p = pixelate(p, args.pixel)
            patches.append((p, x, y))
        plan.append({"src": src, "dst": dst, "rects": rects, "rectsrc": rsrc,
                     "w": w, "h": h, "patches": patches, "img": img})
        if not args.quiet:
            log("[pixel_post] 读入 %-28s %4dx%-4d 帧 %3d%s"
                % (os.path.basename(src), w, h, len(rects),
                   ("  矩形来自 " + rsrc) if rsrc else "  (整图为 1 帧)"))

    pal = None
    if not args.no_quantize:
        if args.palette == "file":
            # 每张图一条色板：同一动作集的帧共用一个色板（不闪色），
            # 又不让别的图（比如兵种 vs 技能特效）把颜色名额抢走。
            for job in plan:
                job["pal"] = palette_from_jobs([job], args.colors)
            log("[pixel_post] 逐图色板：" + "  ".join(
                "%s=%d 色" % (os.path.basename(j["src"]), len(j["pal"])) for j in plan))
        else:
            pal = palette_from_jobs(plan, args.colors)
            for job in plan:
                job["pal"] = pal
            log("[pixel_post] 共享色板：全批样本 -> median-cut %d 色" % len(pal))
        pal = plan[0]["pal"] if plan else (np.zeros((0, 3), np.uint8))

    # ---------- 阶段 2：二值化 -> 量化 -> 描边 -> 落盘
    report = {"args": {k: v for k, v in vars(args).items()},
              "palette": [rgb2hex(c) for c in pal] if pal is not None else None,
              "files": []}
    for job in plan:
        img = job["img"]
        h, w = img.shape[:2]
        rec = {"file": os.path.basename(job["src"]), "out": os.path.basename(job["dst"]),
               "w": w, "h": h, "frames": len(job["rects"]), "rects_from": job["rectsrc"],
               "bytes_in": os.path.getsize(job["src"]), "frames_detail": []}
        before_colors = []
        for (p, x, y), r in zip(job["patches"], job["rects"]):
            a0 = p[..., 3] > 0
            before_colors.append(unique_colors(p[..., :3], a0))
        rec["colors_before_min"] = min(before_colors) if before_colors else 0
        rec["colors_before_max"] = max(before_colors) if before_colors else 0
        rec["colors_before_mean"] = round(float(np.mean(before_colors)), 1) if before_colors else 0
        rec["colors_before_page"] = unique_colors(img[..., :3], img[..., 3] > 0)
        if job.get("pal") is not None:
            rec["palette"] = [rgb2hex(c) for c in job["pal"]]

        out_img = np.zeros_like(img)
        outline_colors = []
        outline_px = 0
        after_colors = []
        for (p, x, y), r in zip(job["patches"], job["rects"]):
            q = p.copy()
            if args.kill_glint:
                q = kill_glint(q, args.glint_y, args.glint_sat, args.glint_luma)
            if not args.no_alpha:
                q[..., 3] = np.where(q[..., 3] >= int(round(args.alpha_threshold * 255)), 255, 0)
            fpal = job.get("pal") if args.palette == "file" else pal
            if fpal is not None and len(fpal):
                rgbm = q[..., :3].copy()
                if args.dither == "bayer4":
                    ph, pw = rgbm.shape[:2]
                    tile = np.tile(BAYER4, (ph // 4 + 1, pw // 4 + 1))[:ph, :pw][..., None]
                    off = (tile - 0.5) * 24.0
                    rgbm = np.clip(rgbm.astype(np.float32) + off, 0, 255).astype(np.uint8)
                q[..., :3] = map_to_palette(rgbm, q[..., 3] > 0, fpal)
            if not args.no_outline:
                grow = None
                q, used, n = outline_patch(
                    q, args.outline_color, args.outline_mode, args.outline_conn,
                    args.outline_dark, None if args.no_outline_snap else fpal, grow)
                outline_px += n
                for c in used:
                    outline_colors.append(rgb2hex(c))
            ph, pw = q.shape[:2]
            out_img[y:y + ph, x:x + pw] = q
            after_colors.append(unique_colors(q[..., :3], q[..., 3] > 0))
            rec["frames_detail"].append({
                "name": r["name"], "rect": [r["x"], r["y"], r["w"], r["h"]],
                "colors_before": int(unique_colors(p[..., :3], p[..., 3] > 0)),
                "colors_after": int(after_colors[-1]),
                "opaque_px": int((q[..., 3] > 0).sum()),
            })
        save_result(out_img, job["dst"], args.format, args.png8, args.bg_color)
        rec["colors_after_max"] = max(after_colors) if after_colors else 0
        rec["colors_after_min"] = min(after_colors) if after_colors else 0
        rec["colors_after_mean"] = round(float(np.mean(after_colors)), 1) if after_colors else 0
        rec["outline_px"] = outline_px
        rec["outline_colors"] = sorted(set(outline_colors),
                                      key=lambda c: -outline_colors.count(c))[:5]
        rec["bytes_out"] = os.path.getsize(job["dst"])
        rec["kb_in"] = round(rec["bytes_in"] / 1024.0, 1)
        rec["kb_out"] = round(rec["bytes_out"] / 1024.0, 1)
        rec["ratio"] = round(rec["bytes_out"] / max(rec["bytes_in"], 1), 3)
        report["files"].append(rec)
        log("[pixel_post] 写出 %-28s 色数 %d..%d (页 %d) -> %d..%d   描边 %d px   体积 %.1f -> %.1f KB (%+.0f%%)"
            % (rec["out"], rec["colors_before_min"], rec["colors_before_max"],
               rec["colors_before_page"], rec["colors_after_min"],
               rec["colors_after_max"], outline_px, rec["kb_in"], rec["kb_out"],
               (rec["ratio"] - 1) * 100))
    report["elapsed_s"] = round(time.time() - t0, 2)
    if args.report:
        os.makedirs(os.path.dirname(os.path.abspath(args.report)) or ".", exist_ok=True)
        with open(args.report, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=1)
        log("[pixel_post] 统计 -> %s  (%.1fs)" % (args.report, report["elapsed_s"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
