#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
make_face.py — 生成《三國群英傳 2》重制项目的原作肖像图集。

输入（只读）：
  F:\\sanguo\\export\\png\\SHAPE\\FACE\\FACE001.png … FACE400.png   100x120 RGBA
  F:\\sanguo\\game\\data\\generals.json                            401 元素数组，[1..400] 是 400 将

输出：
  F:\\sanguo\\game\\web\\assets\\face\\full\\NNN.webp    100x120 原尺寸
  F:\\sanguo\\game\\web\\assets\\face\\thumb\\NNN.webp   30x40（列表缩略图位）
  F:\\sanguo\\game\\web\\assets\\face\\index.json       { "faces": { "<武将名>": {...} }, "sizes": {...} }

特性：
  * 幂等：默认跳过「输出已存在且比源文件新且非空」的文件；--force 全部重编。
  * 只算不写：--dry-run 打印体积预估。
  * 调质量：--full-q / --thumb-q。
  * 自检：--verify 读回 index.json 与产物，核对 400/400、尺寸、名称、键唯一。

用法（bundled python）：
  $env:PYTHONIOENCODING='utf-8'
  & "C:\\Users\\liutian\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe" `
      "F:\\sanguo\\work\\asset_pipe\\make_face.py"
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import time

from PIL import Image

ROOT = r"F:\sanguo"
SRC_DIR = os.path.join(ROOT, "export", "png", "SHAPE", "FACE")
GEN_JSON = os.path.join(ROOT, "game", "data", "generals.json")
OUT_DIR = os.path.join(ROOT, "game", "web", "assets", "face")
FULL_DIR = os.path.join(OUT_DIR, "full")
THUMB_DIR = os.path.join(OUT_DIR, "thumb")
INDEX_JSON = os.path.join(OUT_DIR, "index.json")
# 前端手写的名字→编号表（不是我生成的产物，只做一致性交叉校验）
FACE_MAP_JS = os.path.join(ROOT, "game", "web", "face_map.js")

FULL_SIZE = (100, 120)
THUMB_SIZE = (30, 40)

# 女性武将：名字白名单。generals.json 里没有任何性别字段（TYPE 1..15 是兵种/类型，
# 不是性别），所以 sex_hint 只对能用人名 + 画像双重确认的 6 个人写 "F"，
# 其余一律 "?"（不臆断 "M"）。三國群英傳2 的 400 将名单里女性名字恰好只有这 6 个。
FEMALE_NAMES = ["大喬", "小喬", "孫尚香", "祝融夫人", "貂蟬", "關鳳"]


def human(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if abs(n) < 1024 or unit == "GB":
            return f"{n:.2f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024.0  # type: ignore[assignment]
    return f"{n} B"


def load_generals() -> list[dict]:
    with open(GEN_JSON, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise SystemExit(f"generals.json 不是数组，实际是 {type(data)}")
    # [0] 是 id=0 的 盜賊 模板记录（无 SEQUENCE）；[1..400] 才是 400 名武将。
    gens = data[1:401]
    if len(gens) != 400:
        raise SystemExit(f"期望 400 将，实得 {len(gens)}（总长 {len(data)}）")

    seen_n: dict[int, str] = {}
    seen_name: dict[str, int] = {}
    for g in gens:
        name = g["NAME"]
        face = g["FACE"]                       # 形如 "FACE\\FACE349"
        n = int(face.rsplit("\\", 1)[-1][-3:])
        if face != "FACE\\FACE%03d" % n:
            raise SystemExit(f"FACE 字段异常：{name} -> {face!r}")
        if n in seen_n:
            raise SystemExit(f"FACE 编号重复：{n} 被 {seen_n[n]} 与 {name} 共用")
        if name in seen_name:
            raise SystemExit(f"武将名重复：{name!r}")
        seen_n[n] = name
        seen_name[name] = n
    missing = [n for n in range(1, 401) if n not in seen_n]
    if missing:
        raise SystemExit(f"有 {len(missing)} 个 FACE 编号没被任何武将引用：{missing[:10]}")
    return gens


def encode_webp(im: Image.Image, quality: int) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    return buf.getvalue()


def cover(im: Image.Image, size: tuple[int, int], anchor: tuple[float, float] = (0.5, 0.14)) -> Image.Image:
    """按 CSS object-fit:cover + object-position 的规则裁切并缩放。

    三个显示位（HUD / deploy / items 列表）全是 cover：HUD 是 battleView.js 手写的
    `scale = max(PORTRAIT.w/pr.w, PORTRAIT.h/pr.h)` + `sy = (pr.h-sh)*0.16`，
    HTML 那两处是 `object-fit:cover; object-position:50% 14%`。所以缩略图也用 cover 生成，
    免得先压扁再被浏览器裁一刀。
    """
    W, H = size
    iw, ih = im.size
    scale = max(W / iw, H / ih)
    sw, sh = W / scale, H / scale
    x = (iw - sw) * anchor[0]
    y = (ih - sh) * anchor[1]
    x0, y0 = int(round(x)), int(round(y))
    x1, y1 = int(round(x + sw)), int(round(y + sh))
    return im.crop((x0, y0, x1, y1)).resize((W, H), Image.LANCZOS)


def fresh(dst: str, src_mtime: float) -> bool:
    try:
        st = os.stat(dst)
    except OSError:
        return False
    return st.st_size > 0 and st.st_mtime >= src_mtime - 1.0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--full-q", type=int, default=85, help="full 的 webp quality（默认 85）")
    ap.add_argument("--thumb-q", type=int, default=78, help="thumb 的 webp quality（默认 78）")
    ap.add_argument("--force", action="store_true", help="忽略已有产物，全部重编")
    ap.add_argument("--dry-run", action="store_true", help="只统计体积，不写文件")
    ap.add_argument("--verify", action="store_true", help="只读回产物做完整性自检")
    args = ap.parse_args(argv)

    gens = load_generals()

    if args.verify:
        return verify(gens)

    os.makedirs(FULL_DIR, exist_ok=True)
    os.makedirs(THUMB_DIR, exist_ok=True)

    t0 = time.time()
    n_full = n_full_skip = n_thumb = n_thumb_skip = 0
    full_bytes = thumb_bytes = 0
    errors: list[str] = []

    for g in gens:
        name = g["NAME"]
        n = int(g["FACE"].rsplit("\\", 1)[-1][-3:])
        src = os.path.join(SRC_DIR, "FACE%03d.png" % n)
        if not os.path.exists(src):
            errors.append(f"缺源文件 {src}（{name}）")
            continue
        src_mtime = os.stat(src).st_mtime
        dst_full = os.path.join(FULL_DIR, "%03d.webp" % n)
        dst_thumb = os.path.join(THUMB_DIR, "%03d.webp" % n)

        need_full = args.force or not fresh(dst_full, src_mtime)
        need_thumb = args.force or not fresh(dst_thumb, src_mtime)
        if not need_full and not need_thumb:
            n_full_skip += 1
            n_thumb_skip += 1
            full_bytes += os.path.getsize(dst_full)
            thumb_bytes += os.path.getsize(dst_thumb)
            continue

        with Image.open(src) as im0:
            im = im0.convert("RGBA")
            if im.size != FULL_SIZE:
                errors.append(f"FACE%03d 尺寸异常 {im.size}（{name}）" % n)
                im = im.resize(FULL_SIZE, Image.LANCZOS)

            if need_full:
                b = encode_webp(im, args.full_q)
                full_bytes += len(b)
                if not args.dry_run:
                    with open(dst_full, "wb") as f:
                        f.write(b)
                n_full += 1
            else:
                full_bytes += os.path.getsize(dst_full)

            if need_thumb:
                th = cover(im, THUMB_SIZE)
                b = encode_webp(th, args.thumb_q)
                thumb_bytes += len(b)
                if not args.dry_run:
                    with open(dst_thumb, "wb") as f:
                        f.write(b)
                n_thumb += 1
            else:
                thumb_bytes += os.path.getsize(dst_thumb)

    # ---- index.json ----
    faces: dict[str, dict] = {}
    for g in gens:
        name = g["NAME"]
        n = int(g["FACE"].rsplit("\\", 1)[-1][-3:])
        faces[name] = {
            "n": n,
            "face": g["FACE"],
            "sex_hint": "F" if name in FEMALE_NAMES else "?",
        }

    index = {
        # 契约键放最前，方便人肉 diff / 前 200 字符自解释
        "sizes": {"full": list(FULL_SIZE), "thumb": list(THUMB_SIZE)},
        "faces": faces,
        "count": len(faces),
        "generated": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "generator": "work/asset_pipe/make_face.py",
        "source": "export/png/SHAPE/FACE/FACE<NNN>.png",
        "encoding": {
            "full": {"format": "webp", "quality": args.full_q, "method": 6, "scale": "1:1 原尺寸"},
            "thumb": {"format": "webp", "quality": args.thumb_q, "method": 6,
                      "resample": "cover(100x120 -> 30x40) + LANCZOS"},
        },
        "note": "键是武将名（前端按名字取图）；n 是原作 FACE 编号，文件名是零填充 3 位 %03d.webp。"
                "sex_hint 只有 6 名女性写 F，其余 ? 表示未知（generals.json 无性别字段）。",
        "sex_known": {k: v["sex_hint"] for k, v in faces.items() if v["sex_hint"] != "?"},
        # 6 名女性名白名单本身也给出，方便前端复用（generals.json 无性别字段）
        "female_names": FEMALE_NAMES,
    }

    if not args.dry_run:
        with open(INDEX_JSON, "w", encoding="utf-8", newline="\n") as f:
            json.dump(index, f, ensure_ascii=False, indent=1)
            f.write("\n")

    idx_bytes = 0 if args.dry_run else os.path.getsize(INDEX_JSON)
    total = full_bytes + thumb_bytes + idx_bytes

    print("=" * 68)
    print("make_face.py  full_q=%d  thumb_q=%d  force=%s dry_run=%s"
          % (args.full_q, args.thumb_q, args.force, args.dry_run))
    print("-" * 68)
    print("full/  : %3d 张  %10d B  %9s   (本次新编 %d, 跳过 %d)"
          % (len(gens), full_bytes, human(full_bytes), n_full, n_full_skip))
    print("thumb/ : %3d 张  %10d B  %9s   (本次新编 %d, 跳过 %d)"
          % (len(gens), thumb_bytes, human(thumb_bytes), n_thumb, n_thumb_skip))
    print("index.json      %10d B  %9s" % (idx_bytes, human(idx_bytes)))
    print("TOTAL  :        %10d B  %9s   (预算 2.5 MB, full<=1.8MB, thumb<=0.3MB)"
          % (total, human(total)))
    print("预算检查: full %s | thumb %s | total %s"
          % ("OK" if full_bytes <= int(1.8 * 1048576) else "超",
             "OK" if thumb_bytes <= int(0.3 * 1048576) else "超",
             "OK" if total <= int(2.5 * 1048576) else "超"))
    print("耗时 %.1fs" % (time.time() - t0))
    if errors:
        print("!! %d 个问题:" % len(errors))
        for e in errors[:20]:
            print("   ", e)
        return 1
    return 0


def verify(gens: list[dict]) -> int:
    with open(INDEX_JSON, encoding="utf-8") as f:
        idx = json.load(f)
    ok = True
    faces = idx["faces"]
    if len(faces) != 400:
        print("!! index faces 数量 =", len(faces)); ok = False
    if set(faces) != {g["NAME"] for g in gens}:
        print("!! index 键集合与 generals.json 不一致"); ok = False
    for g in gens:
        name = g["NAME"]
        e = faces.get(name)
        if e is None:
            print("!! 缺键", name); ok = False; continue
        if e["face"] != g["FACE"]:
            print("!! FACE 不符", name, e["face"], g["FACE"]); ok = False
        for kind, size in (("full", FULL_SIZE), ("thumb", THUMB_SIZE)):
            p = os.path.join(OUT_DIR, kind, "%03d.webp" % e["n"])
            if not os.path.exists(p):
                print("!! 缺产物", p); ok = False; continue
            with Image.open(p) as im:
                if im.size != size:
                    print("!! 尺寸错", p, im.size, "期望", size); ok = False
    # 无多余文件
    for kind, size in (("full", FULL_SIZE), ("thumb", THUMB_SIZE)):
        d = os.path.join(OUT_DIR, kind)
        have = {f for f in os.listdir(d) if f.lower().endswith(".webp")}
        want = {"%03d.webp" % e["n"] for e in faces.values()}
        if have - want:
            print("!! 多余文件", kind, sorted(have - want)[:10])
        if want - have:
            print("!! 缺文件", kind, sorted(want - have)[:10])
            ok = False
    # 交叉校验前端那份手写 map（game/web/face_map.js）：两份真相必须一致，否则
    # 前端拿到 NNN 去找 full/NNN.webp 会 404。只读检查，face_map.js 不属于本脚本产物。
    ok = crosscheck_face_map(faces) and ok
    print("verify:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


def crosscheck_face_map(faces: dict[str, dict]) -> bool:
    p = FACE_MAP_JS
    if not os.path.exists(p):
        print("face_map.js: 不存在，跳过交叉校验")
        return True
    try:
        with open(p, encoding="utf-8") as f:
            pairs = re.findall(r'"([^"]{1,12})"\s*:\s*"(\d{1,3})"', f.read())
    except Exception as e:  # 解析失败不该让主校验挂掉
        print("face_map.js: 读取失败，跳过交叉校验", e)
        return True
    ok = True
    if len(pairs) != len(faces):
        print("!! face_map.js 条目数 =", len(pairs), "期望", len(faces)); ok = False
    for name, n in pairs:
        e = faces.get(name)
        if e is None:
            print("!! face_map.js 有 index 没有的名字", name); ok = False; continue
        if int(n) != e["n"]:
            print("!! 编号不一致", name, n, "vs", e["n"]); ok = False
    only = set(faces) - {a for a, _ in pairs}
    if only:
        print("!! index 有而 face_map.js 无", sorted(only)[:10]); ok = False
    print("face_map.js 交叉校验:", "PASS" if ok else "FAIL", "(%d 条)" % len(pairs))
    return ok


if __name__ == "__main__":
    sys.exit(main())
