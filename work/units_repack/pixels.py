#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
士兵图集「逐帧搬像素 + 逐帧校验」（由 `repack.mjs` 调用，不单独跑也行）

  入：layout.json（repack.mjs 排好的 页/帧 落位表 + 源页尺寸 + 源目录 + 输出目录）
  出：<outDir>/units_XX.png                     —— 新页（不缩放、不重采样）
      <outDir>/verify.json                     —— 逐帧 RGBA SHA256 / 下标字节比对 + 越界统计
      <outDir>/frames.sha256.csv               —— 572 行逐帧证据

搬法：按**调色板下标**整块 numpy 拷贝（不是先转 RGBA 再画，避免任何颜色转换），
      新页底色 = 源图的透明下标（P 图的 `transparency`），所以帧之外全透明。
校验（全部真跑，不看代码猜）：
  1. 每一帧：源页 crop 的 RGBA bytes SHA256 == 新页 crop 的 RGBA bytes SHA256；
     源图若是 P 模式，再比一次**下标原始字节**（更强：像素值逐字节相同）。
  2. 新页里「帧矩形之外」的不透明像素数必须为 0（搬歪 / 漏搬都会露出来）。
  3. 帧矩形两两不重叠、都在页内。
  4. 新页 PNG 实际尺寸 == JSON 声明尺寸，且 max(w,h) <= page_max。
"""
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image


def die(msg):
    sys.stderr.write("[pixels] FAIL: %s\n" % msg)
    sys.exit(1)


def sha256_bytes(buf):
    return hashlib.sha256(buf).hexdigest()


def rgba_bytes(im, box):
    """crop → RGBA 原始字节（校验口径：不管源是什么模式，都按 RGBA 比）"""
    return np.ascontiguousarray(np.asarray(im.crop(box).convert("RGBA"))).tobytes()


def main():
    if len(sys.argv) < 2:
        die("usage: pixels.py <layout.json>")
    layout_path = sys.argv[1]
    with open(layout_path, "r", encoding="utf-8") as fh:
        layout = json.load(fh)

    src_dir = layout["srcDir"]
    out_dir = layout["outDir"]
    page_max = int(layout.get("pageMax") or 2048)
    os.makedirs(out_dir, exist_ok=True)

    # ---- 源页：P 模式走下标拷贝，其它模式退 RGBA ----
    src_imgs = []
    src_arrs = []
    src_is_p = True
    palette = None
    transp = None
    for s in layout["sources"]:
        path = os.path.join(src_dir, s["file"])
        if not os.path.exists(path):
            die("source png missing: %s" % path)
        im = Image.open(path)
        im.load()
        if im.mode != "P":
            src_is_p = False
            im = im.convert("RGBA")
        src_imgs.append(im)
        src_arrs.append(np.array(im))
        if palette is None and im.mode == "P":
            palette = im.getpalette()
            transp = im.info.get("transparency", 255)
        if im.size != (s["w"], s["h"]):
            die("%s size %r != json %r" % (path, im.size, (s["w"], s["h"])))

    fill = 255 if src_is_p else 0
    shape_extra = () if src_is_p else (4,)
    mode = "P" if src_is_p else "RGBA"

    pages_report = []
    frame_rows = []
    mismatches = []
    total_equal = 0
    total_index_equal = 0

    for pi, page in enumerate(layout["pages"]):
        w, h = int(page["w"]), int(page["h"])
        if max(w, h) > page_max:
            die("page %d is %dx%d > %d" % (pi, w, h, page_max))
        canvas = np.full((h, w) + shape_extra, fill, dtype=np.uint8)
        rects = []
        for sp in page["sprites"]:
            x, y, fw, fh = int(sp["x"]), int(sp["y"]), int(sp["w"]), int(sp["h"])
            sx, sy, si = int(sp["sx"]), int(sp["sy"]), int(sp.get("s", 0))
            if x < 0 or y < 0 or x + fw > w or y + fh > h:
                die("%s placed out of page: %r" % (sp["name"], (x, y, fw, fh)))
            block = src_arrs[si][sy : sy + fh, sx : sx + fw]
            if block.shape[:2] != (fh, fw):
                die("%s source crop shape %r != %r" % (sp["name"], block.shape, (fh, fw)))
            canvas[y : y + fh, x : x + fw] = block
            rects.append((x, y, fw, fh, sp["name"]))

        # 重叠检查（572 帧量级，O(n^2) 足够）
        overlaps = 0
        rects_sorted = sorted(rects, key=lambda r: (r[1], r[0]))
        for i in range(len(rects_sorted)):
            x1, y1, w1, h1, n1 = rects_sorted[i]
            for j in range(i + 1, len(rects_sorted)):
                x2, y2, w2, h2, n2 = rects_sorted[j]
                if y2 >= y1 + h1:
                    break
                if x1 < x2 + w2 and x2 < x1 + w1 and y1 < y2 + h2 and y2 < y1 + h1:
                    overlaps += 1
                    if overlaps <= 5:
                        sys.stderr.write("[pixels] overlap: %s / %s\n" % (n1, n2))

        out_path = os.path.join(out_dir, page["file"])
        if src_is_p:
            out = Image.frombytes("P", (w, h), canvas.tobytes())
            out.putpalette(palette)
            if transp is not None:
                out.save(out_path, transparency=transp)
            else:
                out.save(out_path)
        else:
            Image.frombytes("RGBA", (w, h), canvas.tobytes()).save(out_path)

        # ---- 重新读盘校验（比的是真正落盘的 PNG） ----
        fresh = Image.open(out_path)
        fresh.load()
        if fresh.size != (w, h):
            die("%s saved size %r != %r" % (out_path, fresh.size, (w, h)))
        fresh_arr = np.array(fresh)
        fresh_rgba = np.asarray(fresh.convert("RGBA"))

        alpha = fresh_rgba[:, :, 3]
        allowed = np.zeros((h, w), dtype=bool)
        for (x, y, fw, fh, _name) in rects:
            allowed[y : y + fh, x : x + fw] = True
        stray = int(np.count_nonzero((alpha > 0) & (~allowed)))
        opaque = int(np.count_nonzero(alpha > 0))

        for sp in page["sprites"]:
            x, y, fw, fh = int(sp["x"]), int(sp["y"]), int(sp["w"]), int(sp["h"])
            sx, sy, si = int(sp["sx"]), int(sp["sy"]), int(sp.get("s", 0))
            src_sha = sha256_bytes(rgba_bytes(src_imgs[si], (sx, sy, sx + fw, sy + fh)))
            dst_sha = sha256_bytes(rgba_bytes(fresh, (x, y, x + fw, y + fh)))
            idx_equal = None
            if src_is_p:
                a = np.ascontiguousarray(src_arrs[si][sy : sy + fh, sx : sx + fw]).tobytes()
                b = np.ascontiguousarray(fresh_arr[y : y + fh, x : x + fw]).tobytes()
                idx_equal = a == b
                total_index_equal += 1 if idx_equal else 0
            ok = src_sha == dst_sha and (idx_equal in (None, True))
            if ok:
                total_equal += 1
            else:
                mismatches.append(
                    "%s src=%s dst=%s idx=%r" % (sp["name"], src_sha[:16], dst_sha[:16], idx_equal)
                )
            frame_rows.append(
                "%s,%d,%d,%d,%d,%d,%s,%s,%s"
                % (sp["name"], pi, x, y, fw, fh, src_sha, dst_sha, "1" if ok else "0")
            )

        pages_report.append(
            {
                "file": page["file"],
                "w": w,
                "h": h,
                "frames": len(page["sprites"]),
                "bytes": os.path.getsize(out_path),
                "sha256": sha256_bytes(open(out_path, "rb").read()),
                "opaquePixels": opaque,
                "strayPixels": stray,
                "overlaps": overlaps,
            }
        )

    total_frames = sum(p["frames"] for p in pages_report)
    verify = {
        "frames": total_frames,
        "equal": total_equal,
        "indexEqual": total_index_equal if src_is_p else None,
        "mismatches": mismatches,
        "strayPixels": sum(p["strayPixels"] for p in pages_report),
        "overlaps": sum(p["overlaps"] for p in pages_report),
        "pages": pages_report,
        "pageMax": page_max,
    }
    with open(os.path.join(out_dir, "verify.json"), "w", encoding="utf-8") as fh:
        json.dump(verify, fh, ensure_ascii=False, indent=1)
    with open(os.path.join(out_dir, "frames.sha256.csv"), "w", encoding="utf-8") as fh:
        fh.write("name,page,x,y,w,h,src_sha256,dst_sha256,equal\n")
        fh.write("\n".join(frame_rows) + "\n")

    print("[pixels] mode=%s frames=%d equal=%d indexEqual=%d stray=%d overlaps=%d"
          % (mode, total_frames, total_equal, total_index_equal,
             verify["strayPixels"], verify["overlaps"]))
    for p in pages_report:
        print("[pixels] %s %dx%d frames=%d bytes=%d opaque=%d sha256=%s"
              % (p["file"], p["w"], p["h"], p["frames"], p["bytes"], p["opaquePixels"], p["sha256"][:12]))
    if total_equal != total_frames or verify["strayPixels"] or verify["overlaps"]:
        for m in mismatches[:8]:
            sys.stderr.write("[pixels] mismatch: %s\n" % m)
        die("verification failed")


if __name__ == "__main__":
    main()
