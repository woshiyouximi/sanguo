# -*- coding: utf-8 -*-
"""COMBINE.INI -> extract/json/combine.json

COMBINE.INI 是「多张 SHP 拼成一张界面图」的配置表：
    [SHAPE]
    NAME=TestCombineShape
    SHAPE=-96,-96,FACE\\FACE001
    SHAPE=  0,-96,FACE\\FACE002
    ...
本脚本解析全部 SHAPE 行，解析出 (x, y, 图形路径)，核对图形文件是否真实存在、
文件多大，并推出拼接后的包围盒与网格。

注意实测结论（与需求书里"8 行"的说法不同）：
  文件总行数 = 8 行，但**真正的 SHAPE 条目只有 4 条**；
  第 7 行是空行，第 8 行是 27388 个空格的填充行（把文件凑到 27534 字节）。
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse_ini import IniFile, read_text, write_json          # noqa: E402
from tables_common import PAK, OUT, SHAPE                      # noqa: E402

SRC = os.path.join(PAK, "COMBINE.INI")
DST = os.path.join(OUT, "combine.json")


def main() -> int:
    text, enc = read_text(SRC)
    ini = IniFile.load(SRC)

    lines = text.splitlines()
    raw_bytes = os.path.getsize(SRC)
    # 找出"填充行"：非空但全是空格、且超长
    pad = [(i + 1, len(ln)) for i, ln in enumerate(lines)
           if ln.strip() == "" and len(ln) > 256]

    groups = []
    for sec in ini.sections:
        shapes = []
        for order, s in enumerate(sec.getall("SHAPE"), 1):
            parts = [p.strip() for p in s.split(",")]
            try:
                x, y = int(parts[0]), int(parts[1])
            except (ValueError, IndexError):
                x = y = None
            path = parts[2] if len(parts) > 2 else ""
            # INI 里写的是 'FACE\\FACE001'（相对 SHAPE\\，且不带扩展名）
            stem = path.replace("\\", "/")
            real = None
            size = 0
            for cand in (stem, stem.lower(), stem.upper()):
                p = os.path.join(SHAPE, cand + ".SHP")
                if os.path.exists(p):
                    real = cand.replace("/", "\\") + ".SHP"
                    size = os.path.getsize(p)
                    break
            shapes.append({
                "order": order,
                "x": x, "y": y,
                "path_ini": path,
                "file": real,
                "exists": real is not None,
                "bytes": size,
                "lineno": sec.lineno_of("SHAPE"),
            })

        xs = sorted({s["x"] for s in shapes if s["x"] is not None})
        ys = sorted({s["y"] for s in shapes if s["y"] is not None})
        # 网格间距 = 相邻 x / 相邻 y 的最小差值 -> 单张图尺寸
        dx = min((b - a for a, b in zip(xs, xs[1:])), default=None)
        dy = min((b - a for a, b in zip(ys, ys[1:])), default=None)
        groups.append({
            "name": sec.get("NAME"),
            "section": sec.name,
            "lineno": sec.lineno,
            "shape_count": len(shapes),
            "shapes": shapes,
            "grid": {"unique_x": xs, "unique_y": ys,
                     "cols": len(xs), "rows": len(ys),
                     "step_x": dx, "step_y": dy},
            "bbox": {
                "x_min": min(xs) if xs else None,
                "x_max": (max(xs) + dx) if (xs and dx) else None,
                "y_min": min(ys) if ys else None,
                "y_max": (max(ys) + dy) if (ys and dy) else None,
                "width": (max(xs) - min(xs) + dx) if (xs and dx) else None,
                "height": (max(ys) - min(ys) + dy) if (ys and dy) else None,
            },
            "note": "坐标是每张子图左上角相对于拼接原点的像素偏移；"
                    "负值表示向左/向上，故原点落在图块中心。"
                    "step_x/step_y 即单张子图边长（由相邻坐标差反推，非文件头读取）。",
        })

    data = {
        "source": "COMBINE.INI",
        "bytes": raw_bytes,
        "encoding": enc,
        "line_count": len(lines),
        "section_count": len(ini.sections),
        "shape_entry_count": sum(g["shape_count"] for g in groups),
        "padding": {
            "lines": [{"lineno": n, "bytes": b} for n, b in pad],
            "total_bytes": sum(b for _n, b in pad),
            "ratio": round(sum(b for _n, b in pad) / raw_bytes, 4),
            "note": "该表内容只有 5 行字段，其余全是尾部空格填充，"
                    "用于把文件撑到 27534 字节（推测为 PAK 打包时的对齐/定长块）。",
        },
        "stats": ini.stats(),
        "groups": groups,
    }
    write_json(DST, data)
    print(f"[combine] {len(groups)} group(s), "
          f"{data['shape_entry_count']} SHAPE entries, "
          f"{len(lines)} lines, padding {data['padding']['total_bytes']}B -> {DST}")
    for g in groups:
        print("   grid", g["grid"], "bbox", g["bbox"])
        for s in g["shapes"]:
            print(f"   {s['order']} ({s['x']:>4},{s['y']:>4}) {s['path_ini']:<18} "
                  f"exists={s['exists']} {s['bytes']}B")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
