# -*- coding: utf-8 -*-
"""A3 step1：BODY/WEAPON/HORSE 全量清点 + 覆盖表 + 每帧 ink bbox。

命名结构（实测，已用 things_parsed 的动作表交叉验证）：
  BODY   {L|R}{造型}{code}{slot}{frame4}   slot∈1..4，仅 W/A 会用 2..4，其余恒 1
         {L|R}{造型}{FS|A5|A6}{frame4}    8 字符，无 slot（Win 与招式码）
         ** 注意：BODY 的 A2/A3/A4 是"武器位 2/3/4"，A5/A6 才是招式码 **
  WEAPON {A-D}{n}{code}{d}{frame4}   第 4 位的含义随动作而变，不做语义依赖
  HORSE  H{A-H}{code}1{frame4}

产出 work/gen_sprites/inventory.json
"""
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"F:\sanguo")
OUT = ROOT / "work" / "gen_sprites"
OUT.mkdir(parents=True, exist_ok=True)
PNG = ROOT / "export" / "png" / "SHAPE" / "MAJOR"

MAN = json.loads((ROOT / "export" / "manifest_art.json").read_text(encoding="utf-8"))
META = {m["path"].replace("\\", "/"): m for m in MAN}

SHAPES = "123456789ABCDE0"
MOTION = ("A5", "A6", "A7", "A8")
PLAIN = ("W", "R", "A", "D", "H", "L", "S", "F", "FS")


def parse_body(stem):
    if len(stem) < 8 or stem[0] not in "LR" or stem[1] not in SHAPES:
        return None
    rest, frame = stem[2:-4], stem[-4:]
    if not frame.isdigit():
        return None
    if rest in ("FS",) or rest in MOTION:
        return dict(camp=stem[0], shape=stem[1], code=rest, slot=None, frame=frame)
    if len(rest) == 2 and rest[0] in "WARDFHLS" and rest[1] in "1234":
        return dict(camp=stem[0], shape=stem[1], code=rest[0], slot=int(rest[1]), frame=frame)
    return None


def parse_weapon(stem):
    m = re.match(r"^([A-D])([0-9A-B])(.*?)(\d{4})$", stem)
    if not m:
        return None
    cls, num, rest, frame = m.groups()
    return dict(cls=cls, num=num, rest=rest, frame=frame)


def parse_horse(stem):
    m = re.match(r"^H([A-H])(.*?)(\d{4})$", stem)
    if not m:
        return None
    cod, rest, frame = m.groups()
    return dict(cod=cod, rest=rest, frame=frame)


def frame_stats(sub, stem, md):
    p = PNG / sub / (stem + ".png")
    im = Image.open(p).convert("RGBA")
    a = np.asarray(im)
    al = a[..., 3]
    ys, xs = np.nonzero(al)
    if len(xs) == 0:
        bbox = [0, 0, 0, 0]
        ink = 0
        ncol = 0
    else:
        bbox = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
        ink = int(len(xs))
        ncol = int(len(np.unique(a[al > 0][:, :3].reshape(-1, 3), axis=0)))
    return {"w": md["width"], "h": md["height"], "offx": md["offx"], "offy": md["offy"],
            "px": p.stat().st_size, "bbox": bbox, "ink": ink, "ncol": ncol,
            "alpha_vals": int(len(np.unique(al)))}


def scan(sub, parse):
    files, bad = {}, []
    for p in sorted((PNG / sub).glob("*.png")):
        stem = p.stem
        md = META.get("SHAPE/MAJOR/%s/%s.SHP" % (sub, stem))
        pr = parse(stem)
        if md is None or pr is None or stem == "NULSHAPE":
            bad.append(stem)
            continue
        rec = dict(md)
        rec.pop("sha1", None)
        rec.update(pr)
        rec.update(frame_stats(sub, stem, md))
        files[stem] = rec
    return files, bad


def main():
    body, bad_b = scan("BODY", parse_body)
    weap, bad_w = scan("WEAPON", parse_weapon)
    horse, bad_h = scan("HORSE", parse_horse)
    for sub, f, bad in (("BODY", body, bad_b), ("WEAPON", weap, bad_w), ("HORSE", horse, bad_h)):
        print("%-7s %5d ok  %3d skip %s" % (sub, len(f), len(bad), bad[:4]))

    tp = json.loads((ROOT / "work" / "things_parsed.json").read_text(encoding="utf-8"))
    objs = []
    for o in tp["objects"]:
        d = (o.get("directory") or "").upper()
        if "MAJOR" not in d:
            continue
        objs.append({
            "ord": o["ord"], "seq": o["sequence"], "dir": o["directory"],
            "name": o.get("name"), "space": o.get("space"),
            "flags": o.get("flags_raw"),
            "actions": {a: {"default_delay": v.get("default_delay"),
                            "frames": [{"shape": f["shape"], "delay": f.get("delay"),
                                        "event": f.get("after_event")} for f in v["frames"]]}
                        for a, v in o["actions"].items()},
        })
    kind = Counter(objs[i]["dir"].upper().split("\\")[-1] for i in range(len(objs)))
    print("objects", len(objs), dict(kind))

    # --- 覆盖表 ---
    cov = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    for k, r in body.items():
        cov[(r["camp"], r["shape"])][r["code"]].setdefault(str(r["slot"]), []).append(r["frame"])
    grid = {}
    for (camp, shape), m in cov.items():
        for code, slots in m.items():
            for slot, fr in slots.items():
                grid.setdefault(camp, {}).setdefault(shape, {}).setdefault(code, {})[slot] = sorted(fr)
    codes = Counter()
    for camp in grid:
        for shape in grid[camp]:
            for code, slots in grid[camp][shape].items():
                codes[code] += sum(len(v) for v in slots.values())
    print("BODY code 文件数:", dict(sorted(codes.items())))

    sig = Counter()
    per_shape = {}
    for camp in grid:
        for shape in grid[camp]:
            n = sum(len(v) for sl in grid[camp][shape].values() for v in sl.values())
            per_shape[camp + shape] = n
            s = json.dumps({c: {k: len(v) for k, v in sl.items()}
                            for c, sl in grid[camp][shape].items()}, sort_keys=True)
            sig[s] += 1
    print("每造型帧数:", sorted(set(per_shape.values())), "不同覆盖签名:", len(sig))

    # 引用关系：每个 shape 被哪些对象用
    refs = defaultdict(set)
    for o in objs:
        for a, v in o["actions"].items():
            for f in v["frames"]:
                s = f["shape"]
                if s in body:
                    refs[s].add((o["seq"], a))
    unused = [k for k in body if not refs.get(k)]
    print("BODY 未被任何动作引用的帧:", len(unused), sorted(unused)[:8])

    inv = {"files": {"BODY": body, "WEAPON": weap, "HORSE": horse},
           "unmatched": {"BODY": bad_b, "WEAPON": bad_w, "HORSE": bad_h},
           "objects": objs, "coverage": grid, "frames_per_shape": per_shape,
           "unused_body": unused}
    (OUT / "inventory.json").write_text(json.dumps(inv, ensure_ascii=False), encoding="utf-8")
    print("wrote", OUT / "inventory.json", (OUT / "inventory.json").stat().st_size // 1024, "KB")

    # 尺寸/偏移统计
    for sub, f in (("BODY", body), ("WEAPON", weap), ("HORSE", horse)):
        o = [r["offx"] for r in f.values()]
        oy = [r["offy"] for r in f.values()]
        print("%-7s n=%4d w=%d..%d h=%d..%d offx=%d..%d offy=%d..%d neg_offx=%d ink_med=%d ncol_med=%d"
              % (sub, len(f), min(r["w"] for r in f.values()), max(r["w"] for r in f.values()),
                 min(r["h"] for r in f.values()), max(r["h"] for r in f.values()),
                 min(o), max(o), min(oy), max(oy), sum(1 for x in o if x < 0),
                 int(np.median([r["ink"] for r in f.values()])),
                 int(np.median([r["ncol"] for r in f.values()]))))


if __name__ == "__main__":
    main()
