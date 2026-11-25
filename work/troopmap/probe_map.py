# -*- coding: utf-8 -*-
"""像素级核对：units.json 的 13 组是不是真的来自各自对应的原作 FORCE 兵种字母。

做法（全部离线，不碰游戏代码）：
  1. 复用 build_atlas.py 的画布规则（frame_canvas: LANCZOS 缩放 k=0.75、锚点贴底边中点、
     skirt=4、画布宽 75），把原作 FORCE 每个兵种字母的 Walk 首帧重建成「我们图集里应该有的样子」。
  2. 拿它和图集里实际抠出来的 group_walk_00 比 alpha IoU / RGB MAE —— 用 13×13 全交叉打分，
     看每组的「最佳匹配字母」是不是它自称的那个字母。
  3. 顺带输出 13 组两两 alpha IoU（看「不同兵种看起来一样」到底成不成立）。
  4. 输出每帧 / 每组的人物实际像素高宽（回答 66px 屏宽 vs 原作 100px 画布）。

输出：work/troopmap/probe_map.json + 终端表格。
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(r"F:\sanguo")
GEN = ROOT / "work" / "soldier_gen"
PNG = ROOT / "export" / "png" / "SHAPE" / "FORCE"
OUT = ROOT / "work" / "troopmap"
SKIRT = 4
ATLAS_DIR = ROOT / "game" / "web" / "anim"

TROOPS = [
    (0, "A", "podao", "朴刀"), (1, "C", "changqiang", "長槍"), (2, "D", "dadao", "大刀"),
    (3, "F", "archer", "弓箭"), (4, "I", "lianchui", "鍊錘"), (5, "H", "feidao", "飛刀"),
    (6, "J", "wudou", "武鬥"), (7, "K", "manzu", "蠻族"), (8, "E", "tiechui", "鐵鎚"),
    (9, "L", "tengjia", "籐甲"), (10, "M", "huangjin", "黃巾"), (11, "B", "nu", "弩"),
    (12, "G", "nvbing", "女兵"),
]
LETTERS = [t[1] for t in TROOPS]


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


def crop_atlas(page, sp):
    return page.crop((sp["x"], sp["y"], sp["x"] + sp["w"], sp["y"] + sp["h"])).convert("RGBA")


def binar(im):
    return im.getchannel("A").point(lambda v: 255 if v >= 128 else 0)


def bottom_align(a, b):
    """两图都按底边中点对齐到同一尺寸（宽取 max，高取 max），用于跨字母比较。"""
    w = max(a.width, b.width)
    h = max(a.height, b.height)
    def put(im):
        c = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        c.alpha_composite(im, ((w - im.width) // 2, h - im.height))
        return c
    return put(a), put(b)


def iou(a, b):
    ma, mb = binar(a), binar(b)
    pa, pb = ma.load(), mb.load()
    inter = union = 0
    for y in range(a.height):
        for x in range(a.width):
            va = pa[x, y] > 0
            vb = pb[x, y] > 0
            if va or vb:
                union += 1
                if va and vb:
                    inter += 1
    return inter / union if union else 1.0


def rgb_mae(a, b):
    """只在前景交集上比颜色（两边都在 = 人物本体），0..255。"""
    ma, mb = binar(a), binar(b)
    pa, pb = a.load(), b.load()
    mka, mkb = ma.load(), mb.load()
    tot = n = 0
    for y in range(a.height):
        for x in range(a.width):
            if mka[x, y] and mkb[x, y]:
                ra, ga, ba, _ = pa[x, y]
                rb, gb, bb, _ = pb[x, y]
                tot += abs(ra - rb) + abs(ga - gb) + abs(ba - bb)
                n += 1
    return (tot / (n * 3)) if n else 255.0


def bbox(im):
    bb = binar(im).getbbox()
    if not bb:
        return None
    return {"w": bb[2] - bb[0], "h": bb[3] - bb[1], "x": bb[0], "y": bb[1], "canvas": [im.width, im.height]}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    man = load_manifest()
    sol = json.loads((GEN / "soldiers_raw.json").read_text(encoding="utf-8"))
    by_letter = {}
    for o in sol:
        stem = o["anims"]["Walk"][0]
        side = "m" if stem[0].upper() == "M" else "n"
        if stem[2].upper() == "H":
            continue
        by_letter.setdefault(stem[1].upper(), {})[side] = o

    doc = json.loads((ATLAS_DIR / "units.json").read_text(encoding="utf-8"))
    page = Image.open(ATLAS_DIR / "units_00.png").convert("RGBA")
    sprites = {s["name"]: s for s in doc["pages"][0]["sprites"]}

    # 原作候选：每个字母的 M 侧 Walk 首帧，按我们的画布规则重建
    cand = {}
    for L in LETTERS:
        o = by_letter[L]["m"]
        stem = o["anims"]["Walk"][0]
        md = dict(man[stem.upper()])
        md["_stem"] = stem
        cand[L] = frame_canvas(md, 0.75, 100)

    report = {"groups": {}, "pair_iou": {}, "cand_size": {}}
    for L in LETTERS:
        report["cand_size"][L] = [cand[L].width, cand[L].height]

    print("== 13 组 vs 原作 13 字母（Walk 首帧，跨字母全交叉）==")
    print("%-11s %-6s %-6s %-7s %-7s %-8s" % ("group", "自称", "最佳", "IoU", "MAE", "结论"))
    for idx, L, gname, cname in TROOPS:
        g = doc["groups"][gname]
        mine = crop_atlas(page, sprites[g["back"][0]])
        scores = []
        for L2 in LETTERS:
            a, b = bottom_align(mine, cand[L2])
            scores.append((iou(a, b), rgb_mae(a, b), L2))
        scores.sort(key=lambda t: (-t[0], t[1]))
        best = scores[0]
        ok = best[2] == L
        report["groups"][gname] = {
            "troop": idx, "letter": L, "name": cname,
            "frame": g["back"][0],
            "self": [round(best[0], 3) if best[2] == L else None],
            "best": best[2], "best_iou": round(best[0], 3), "best_mae": round(best[1], 1),
            "ok": ok,
            "top3": [[s[2], round(s[0], 3), round(s[1], 1)] for s in scores[:3]],
            "self_iou": round([s for s in scores if s[2] == L][0][0], 3),
            "self_mae": round([s for s in scores if s[2] == L][0][1], 1),
            "bbox": bbox(mine),
        }
        print("%-11s %-6s %-6s %-7.3f %-7.1f %-8s top3=%s" % (
            gname, L, best[2], best[0], best[1], "OK" if ok else "MISMATCH",
            ",".join("%s:%.2f" % (s[2], s[0]) for s in scores[:3])))

    print("\n== 13 组两两 alpha IoU（>0.85 才算「看起来一样」）==")
    mine_all = {}
    for idx, L, gname, cname in TROOPS:
        mine_all[gname] = crop_atlas(page, sprites[doc["groups"][gname]["back"][0]])
    worst = []
    for i, (i1, L1, g1, c1) in enumerate(TROOPS):
        for i2, L2, g2, c2 in TROOPS[i + 1:]:
            a, b = bottom_align(mine_all[g1], mine_all[g2])
            v = iou(a, b)
            report["pair_iou"]["%s|%s" % (g1, g2)] = round(v, 3)
            worst.append((v, g1, g2))
    worst.sort(reverse=True)
    for v, g1, g2 in worst[:6]:
        print("  最高 %-10s %-10s %.3f" % (g1, g2, v))
    print("  最低 %-10s %-10s %.3f" % (worst[-1][1], worst[-1][2], worst[-1][0]))
    report["pair_max"] = [list(w) for w in worst[:6]]
    report["pair_min"] = list(worst[-1])

    print("\n== 人物本体像素（图集画布 75 宽 / 屏幕按 66 宽画）==")
    for idx, L, gname, cname in TROOPS:
        bb = report["groups"][gname]["bbox"]
        if not bb:
            continue
        sx = 66 / bb["canvas"][0]
        print("%-11s 图集 %dx%d 本体 %dx%d → 屏幕 %.1fx%.1f px" % (
            gname, bb["canvas"][0], bb["canvas"][1], bb["w"], bb["h"], bb["w"] * sx, bb["h"] * sx))
        report["groups"][gname]["screen"] = [round(bb["w"] * sx, 1), round(bb["h"] * sx, 1)]

    (OUT / "probe_map.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    bad = [g for g, v in report["groups"].items() if not v["ok"]]
    print("\nmismatch=%d %s" % (len(bad), bad))
    return 0 if not bad else 2


if __name__ == "__main__":
    sys.exit(main())
