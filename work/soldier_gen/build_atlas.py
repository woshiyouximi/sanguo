# -*- coding: utf-8 -*-
"""把原作 FORCE 士兵帧拼成 `units_00.png` + `units.json`（纯函数式，不碰游戏代码）。

画布规则（与 battleView.pushSpriteFrames 的口径对齐）：
  * 每帧画布宽固定 W，锚点(原作 offx/offy = 脚下地面点)落在 **底边水平中点**，
    再上移 SKIRT 像素 —— 因为 battleView 把 sprite 的底边贴在 fy+26，
    旧图集(80x104)的脚线在 y=100（底边上方 4 px），SKIRT=4 与之等价。
  * 画布高 = offy + SKIRT（逐帧裁掉上方空白，bytes 省下来；脚线永远在底边上方 SKIRT）。
  * 同一兵种所有帧共用同一个 W → 屏幕缩放恒定 66/W，走路/攻击切换不跳。

用法：
  python build_atlas.py --w 112 --k 1.0 --walk 12 --attack 6 --out build_w112
"""
import argparse
import io
import json
from pathlib import Path

from PIL import Image

ROOT = Path(r"F:\sanguo")
GEN = ROOT / "work" / "soldier_gen"
PNG = ROOT / "export" / "png" / "SHAPE" / "FORCE"
SKIRT = 4
TROOPS = [
    # (兵种号 0-based, 原作字母, 组名（units.json 的 groups.<name>）, 中文名)
    (0, "A", "podao", "朴刀"), (1, "C", "changqiang", "長槍"), (2, "D", "dadao", "大刀"),
    (3, "F", "archer", "弓箭"), (4, "I", "lianchui", "鍊錘"), (5, "H", "feidao", "飛刀"),
    (6, "J", "wudou", "武鬥"), (7, "K", "manzu", "蠻族"), (8, "E", "tiechui", "鐵鎚"),
    (9, "L", "tengjia", "籐甲"), (10, "M", "huangjin", "黃巾"), (11, "B", "nu", "弩"),
    (12, "G", "nvbing", "女兵"),
]


def load_manifest():
    man = json.loads((ROOT / "export" / "manifest_art.json").read_text(encoding="utf-8"))
    out = {}
    for m in man:
        p = m["path"].replace("\\", "/")
        if p.upper().startswith("SHAPE/FORCE/"):
            out[p.rsplit("/", 1)[-1].rsplit(".", 1)[0].upper()] = m
    return out


def open_any(stem):
    p = PNG / (stem + ".png")
    if not p.exists():
        cand = [q for q in PNG.glob("*.png") if q.stem.upper() == stem.upper()]
        if not cand:
            raise FileNotFoundError(stem)
        p = cand[0]
    return Image.open(p).convert("RGBA")


def spread(n, total):
    """循环动作：按环均匀取样（步长 floor(i*total/n)，首尾相接也均匀）。"""
    if n >= total:
        return list(range(total))
    return [i * total // n for i in range(n)]


def spread_linear(n, total):
    """非循环动作：含首尾，均匀取样（攻击的起手和收势都要留）。"""
    if n >= total:
        return list(range(total))
    if n == 1:
        return [0]
    return sorted({round(i * (total - 1) / (n - 1)) for i in range(n)})


def frame_canvas(md, k, W):
    im = open_any(md["_stem"])
    ox, oy = md["offx"], md["offy"]
    if k != 1.0:
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        ox, oy = ox * k, oy * k
    cw = round(W * k)
    ch = round((md["offy"] + SKIRT) * k)
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    canvas.alpha_composite(im, (round(cw / 2 - ox), round(ch - SKIRT * k - oy)))
    return canvas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--w", type=int, default=112)
    ap.add_argument("--k", type=float, default=1.0)
    ap.add_argument("--walk", type=int, default=12)
    ap.add_argument("--attack", type=int, default=6)
    ap.add_argument("--page", type=int, default=1024)
    ap.add_argument("--pad", type=int, default=2)
    ap.add_argument("--pal", type=int, default=0)
    ap.add_argument("--sides", choices=("m", "both"), default="both",
                    help="m=只用藍軍 M 幀（敵方靠 main.js 染紅）；both=我方 M 幀＋敵方 N 幀")
    ap.add_argument("--hold", type=int, default=4)
    ap.add_argument("--out", default="build")
    args = ap.parse_args()

    man = load_manifest()
    sol = json.loads((GEN / "soldiers_raw.json").read_text(encoding="utf-8"))
    by_letter = {}
    for o in sol:
        # 名称为 GBK 中文（朴刀兵/紅軍/騎兵），不可靠；阵营与兵种直接读 shape 名：
        # 步兵 MAR10001 / 騎兵 MAHR0001 → [0]=M|N 陣營、[1]=兵種字母、[2]=H 才是騎兵
        stem = o["anims"]["Walk"][0]
        side = "m" if stem[0].upper() == "M" else "n"
        if stem[2].upper() == "H":
            continue  # 本图集只做步兵
        by_letter.setdefault(stem[1].upper(), {})[side] = o

    frames = []  # (name, canvas)
    for idx, letter, gname, cname in TROOPS:
        sides = [(s, "") for s in ("m",)] if args.sides == "m" else [("m", ""), ("n", "e")]
        for side, tag in sides:
            obj = by_letter[letter][side]
            for act, want, key in (("walk", args.walk, "Walk"), ("atk", args.attack, "Attack")):
                src = obj["anims"][key]
                picks = spread(want, len(src)) if key == "Walk" else spread_linear(want, len(src))
                for j, si in enumerate(picks):
                    stem = src[si]
                    md = dict(man[stem.upper()])
                    md["_stem"] = stem
                    nm = "%s_%s%s_%02d" % (gname, tag, act, j)
                    frames.append((nm, canvas_of(md, args, cname)))
    # 摆页（shelf packing）
    page_w = args.page
    x = y = row_h = 0
    placed = []
    for name, im in frames:
        if x + im.width > page_w:
            x = 0
            y += row_h + args.pad
            row_h = 0
        placed.append((name, im, x, y))
        x += im.width + args.pad
        row_h = max(row_h, im.height)
    page_h = y + row_h
    page = Image.new("RGBA", (page_w, page_h), (0, 0, 0, 0))
    sprites = []
    for name, im, px, py in placed:
        page.alpha_composite(im, (px, py))
        sprites.append({"name": name, "x": px, "y": py, "w": im.width, "h": im.height})

    pages = [{"file": "units_00.png", "w": page_w, "h": page_h, "sprites": sprites}]
    groups = {}
    for idx, letter, gname, cname in TROOPS:
        walk = [s["name"] for s in sprites if s["name"].startswith(gname + "_walk_")]
        atk = [s["name"] for s in sprites if s["name"].startswith(gname + "_atk_")]
        if args.sides == "m":
            # 敌方没有独立帧 → front 复用同一批帧，靠 main.js 的 source-atop 刷红
            foe_walk, foe_atk = walk, atk
        else:
            foe_walk = [s["name"] for s in sprites if s["name"].startswith(gname + "_ewalk_")]
            foe_atk = [s["name"] for s in sprites if s["name"].startswith(gname + "_eatk_")]
        groups[gname] = {
            "back": walk,
            "front": foe_walk,
            "attack": atk,
            "attackEnemy": foe_atk,
            "hold": args.hold,
            "troop": idx,
            "letter": letter,
            "name": cname,
        }
    meta = {
        "page_size": [page_w, page_h],
        "padding": args.pad,
        "scale": 1.0,
        "count": len(sprites),
        "source": "export/png/SHAPE/FORCE (原作 SHAPE 圖集)",
        "packed_page_size": [page_w, page_h],
        "canvas_w": round(args.w * args.k),
        "skirt": round(SKIRT * args.k),
        "frame_scale_k": args.k,
        # 自述：画布宽 = frame_raw_w（原作画布宽，单位原图像素）× k；
        # skirt = 4px（旧图集脚线口径）× k；两列都给出来，换参数时一眼能看出比例没走样。
        "frame_raw_w": args.w,
        "skirt_raw": SKIRT,
        "sides": args.sides,
        "walk_frames": args.walk,
        "attack_frames": args.attack,
        "palette": args.pal,
    }
    out = GEN / args.out
    out.mkdir(parents=True, exist_ok=True)
    if args.pal:
        page = quantize(page, args.pal)
    page.save(out / "units_00.png", "PNG", optimize=True)
    doc = {"meta": meta, "pages": pages, "groups": groups}
    (out / "units.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    nbytes = (out / "units_00.png").stat().st_size
    jbytes = (out / "units.json").stat().st_size
    print("frames=%d page=%dx%d png=%d B (%.1f KB) json=%d B total=%.1f KB"
          % (len(sprites), page_w, page_h, nbytes, nbytes / 1024, jbytes, (nbytes + jbytes) / 1024))


def quantize(page, ncol):
    """全局调色板量化（alpha 二值，透明走索引 255）—— 屏幕上是 66px 宽，肉眼几乎无差。"""
    alpha = page.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
    q = page.convert("RGB").quantize(colors=ncol - 1, method=Image.MEDIANCUT, dither=Image.NONE)
    pal = q.getpalette()[: (ncol - 1) * 3]
    pal += [0, 0, 0] * (ncol - len(pal) // 3)
    idx = bytearray(q.tobytes())
    am = alpha.tobytes()
    for i, a in enumerate(am):
        if a == 0:
            idx[i] = ncol - 1
    out = Image.frombytes("P", page.size, bytes(idx))
    out.putpalette(pal[: ncol * 3])
    out.info["transparency"] = ncol - 1
    return out


def canvas_of(md, args, cname):
    return frame_canvas(md, args.k, args.w)


main()
