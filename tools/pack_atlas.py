"""把散装 PNG 打成图集页 + 生成 atlas.json（供 Cocos / 自绘两种渲染共用）。

为什么要自己写：
- 400 张头像 + 26 组兵种 + 346 帧特效，逐张当独立纹理在微信小游戏里必然爆 DrawCall 与显存；
- 现成打包器（TexturePacker / free-tex-packer）都要 GUI 或商业授权，而我们的输入是"目录 + 命名规则"，规则很简单；
- 输出格式只要两样：**图集页 PNG** + **每帧的矩形元数据**，Cocos 的 `SpriteFrame` 与自绘 `drawImage` 都能直接吃。

用法：
    # 预演（只算不写）
    python F:\\sanguo\\tools\\pack_atlas.py --src F:\\sanguo\\project\\art_ref\\cloud_v0\\troops26 --out F:\\sanguo\\work\\atlas_troops --page 2048 --dry-run
    # 正式
    python F:\\sanguo\\tools\\pack_atlas.py --src <dir> --out <dir> --page 2048 --pad 2 --scale 0.5

约定：
- 输入按文件名排序；同一 id 的 `<id>_NN.png` 视为同一序列的不同帧，按 NN 排序。
- 统一缩放到 `--scale`（<1 用 LANCZOS），保证同页内尺寸一致（头像/兵种都是等尺寸，简化排布）。
- 排布用简单的 shelf packing（按行铺），不做旋转/紧凑搜索——等尺寸素材下它的利用率已经够（实测 >90%）。
- 输出 `atlas.json`：{pages:[{file,w,h,sprites:[{name,x,y,w,h,src_w,src_h}]}], meta:{...}}
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("需要 Pillow：pip install pillow", file=sys.stderr)
    raise


def collect(src: Path) -> list[tuple[str, Path]]:
    """返回 [(sprite_name, path)]，按 (id, frame) 排序。"""
    items: list[tuple[str, str, Path]] = []
    for p in sorted(src.rglob("*.png")):
        if p.name.startswith("_") or p.name.startswith("contact"):
            continue
        m = re.match(r"^(.+?)_(\d{2,3})$", p.stem)
        if m:
            items.append((m.group(1), m.group(2), p))
        else:
            items.append((p.stem, "", p))
    items.sort(key=lambda t: (t[0], t[1]))
    return [(f"{i}_{f}" if f else i, p) for i, f, p in items]


def shelf_pack(sizes: list[tuple[int, int]], page: int, pad: int) -> list[list[tuple[int, int]]]:
    """返回每页的 [(x, y)]；等尺寸/近似尺寸时利用率高。"""
    pages: list[list[tuple[int, int]]] = []
    pos: list[tuple[int, int]] = []
    x = y = row_h = 0
    for (w, h) in sizes:
        if x + w + pad > page:      # 换行
            x = 0
            y += row_h + pad
            row_h = 0
        if y + h + pad > page:      # 换页
            pages.append(pos)
            pos, x, y, row_h = [], 0, 0, 0
        pos.append((x, y))
        x += w + pad
        row_h = max(row_h, h)
    if pos:
        pages.append(pos)
    return pages


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--page", type=int, default=2048)
    ap.add_argument("--pad", type=int, default=2)
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    src, out = Path(args.src), Path(args.out)
    if not src.exists():
        print(f"源目录不存在: {src}", file=sys.stderr)
        return 2

    items = collect(src)
    if not items:
        print("没找到 PNG", file=sys.stderr)
        return 2

    # 先读尺寸（只读 PNG 头）
    sizes: list[tuple[int, int, int, int]] = []   # (out_w, out_h, src_w, src_h)
    for name, p in items:
        with p.open("rb") as f:
            head = f.read(33)
        if head[:8] != b"\x89PNG\r\n\x1a\n":
            print(f"[skip] 不是 PNG: {p}")
            continue
        sw = int.from_bytes(head[16:20], "big")
        sh = int.from_bytes(head[20:24], "big")
        sizes.append((max(1, round(sw * args.scale)), max(1, round(sh * args.scale)), sw, sh))

    names = [n for n, _ in items][: len(sizes)]
    pages = shelf_pack([(w, h) for w, h, _, _ in sizes], args.page, args.pad)

    # 统计
    area = sum(w * h for w, h, _, _ in sizes)
    cap = len(pages) * args.page * args.page
    print(f"素材 {len(sizes)} 张 → {len(pages)} 页 @ {args.page}px, 缩放 {args.scale:.2f}, padding {args.pad}px")
    print(f"像素利用率 {area / cap * 100:.1f}%  (素材 {area/1e6:.2f} Mpx / 图集 {cap/1e6:.2f} Mpx)")
    est_kb = cap * 4 * 0.25 / 1024     # ASTC 4x4 ≈ 25% of RGBA8
    print(f"ASTC 4x4 估算 ≈ {est_kb/1024:.1f} MB；RGBA8 未压缩 ≈ {cap*4/1048576:.1f} MB")

    if args.dry_run:
        print("dry-run：不写文件")
        return 0

    out.mkdir(parents=True, exist_ok=True)
    meta = {"pages": [], "meta": {
        "page_size": args.page, "padding": args.pad, "scale": args.scale,
        "count": len(sizes), "source": str(src),
    }}

    idx = 0
    for pi, positions in enumerate(pages):
        if pi == 1 and args.page > 1024 and len(pages) > 8:
            pass
        img = Image.new("RGBA", (args.page, args.page), (0, 0, 0, 0))
        sprites = []
        for (x, y) in positions:
            name = names[idx]
            w, h, sw, sh = sizes[idx]
            p = items[idx][1]
            with Image.open(p) as im:
                im = im.convert("RGBA")
                if (w, h) != (sw, sh):
                    im = im.resize((w, h), Image.LANCZOS)
                img.paste(im, (x, y))
            sprites.append({"name": name, "x": x, "y": y, "w": w, "h": h, "src_w": sw, "src_h": sh})
            idx += 1
        fn = f"atlas_{pi:02d}.png"
        img.save(out / fn, optimize=True)
        used_h = max((s["y"] + s["h"] for s in sprites), default=0)
        meta["pages"].append({"file": fn, "w": args.page, "h": args.page,
                              "used_h": used_h, "sprites": sprites})
        print(f"  {fn}: {len(sprites)} 帧，占用高度 {used_h}/{args.page}")

    (out / "atlas.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    total_kb = sum((out / p["file"]).stat().st_size for p in meta["pages"]) / 1024
    print(f"写出 {len(meta['pages'])} 页 + atlas.json，PNG 合计 {total_kb/1024:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
