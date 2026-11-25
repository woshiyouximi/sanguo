# -*- coding: utf-8 -*-
"""SANGO.INI -> extract/json/sango.json

SANGO.INI 是本作**最容易被误认**的表：它名字像"系统设置"，实际是四张表塞在一个文件里，
98 个段 = [SYSTEM] x1 + [FONTS01..07] x7 + [TERRAIN] x12 + [SCRIPT] x1 + [ITEM] x77。

  [SYSTEM]  TotalTimes/TotalGeneralType/TotalThings/Times0N/FontDirectory/DefaultFont/TotalForce
  [FONTSNN] 字形表参数（中文字模尺寸、每行字节、英文点阵/图形字体）
  [TERRAIN] 12 种地形/场景的图层与配乐
  [SCRIPT]  载入的 .SO 脚本文件名
  [ITEM]    77 件物品：兵符 / 武器 / 书籍 / 马 / 阵法书 / 商品

本脚本额外做两件交叉验证（结论写进 docs/03d / 03c）：
  1. 字形自洽：PerLineBytes x Height == Bytes，且 文件大小 == 字数 x 单字字节；
     由此反推 1bpp 位图、按行字节对齐的存储格式，并与 SANGO.15/SANGO.20/
     MINGASC.20/OLDASC.15 的真实字节数逐一核对。
  2. 书籍加智力：把 8 本书的 INT 列出来，与说明文档的 7-10-13-17-20 对照。
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse_ini import IniFile, write_json          # noqa: E402
from tables_common import PAK, OUT, dist, dist_text, get_ci   # noqa: E402

SRC = os.path.join(PAK, "SANGO.INI")
DST = os.path.join(OUT, "sango.json")

ITEM_FIELDS = ["Sequence", "Name", "Attrib", "TYPE", "WeaponType", "WeaponObject",
               "SearchType", "Sort", "Level", "Sprite", "Rate", "STR", "INT",
               "MaxHP", "MaxMP", "Force", "Battle", "Skill", "Speed", "HP",
               "MP", "Spirit", "Loyal", "Tire", "Description"]

#: 字体文件实测大小（字节）
FONT_FILES = {
    "SANGO.20": 832020, "SANGO.15": 416010, "SANGO.IDX": 38000,
    "MINGASC.20": 10240, "OLDASC.15": 3840,
}

ITEM_CLASS = [
    (1, 13, "兵符（可招募该兵种）"),
    (14, 47, "武器"),
    (48, 55, "书籍（加智力）"),
    (56, 63, "坐骑"),
    (64, 72, "阵法书"),
    (73, 77, "商品（卖钱/赠礼）"),
]


def main() -> int:
    ini = IniFile.load(SRC)

    # ---------------- SYSTEM ----------------
    sysd = {}
    s = ini.get("SYSTEM")
    for k, v, ln in s.fields:
        sysd[k] = v
    times = []
    for k in sorted(sysd):
        if k.lower().startswith("times") and len(k) == 7 and k[5:].isdigit():
            parts = [p.strip() for p in sysd[k].split(",")]
            times.append({"index": int(k[5:]), "file": parts[0],
                          "name": parts[1] if len(parts) > 1 else ""})

    # ---------------- FONTS ----------------
    fonts = []
    for sec in ini.sections:
        if not sec.name.upper().startswith("FONTS"):
            continue
        n = lambda key: sec.num(key)  # noqa: E731
        cw, ch, cb = n("ChineseWidth"), n("ChineseHeight"), n("ChineseBytes")
        cpl = n("ChinesePerLineBytes")
        ew, eh, eb = n("EnglishWidth"), n("EnglishHeight"), n("EnglishBytes")
        epl = n("EnglishPerLineBytes")
        fonts.append({
            "font_num": n("FontNum"),
            "section": sec.name,
            "lineno": sec.lineno,
            "chinese_font": get_ci(sec, "ChineseFont") or "",
            "chinese_index": get_ci(sec, "ChineseIndex") or "",
            "chinese_width": cw, "chinese_height": ch,
            "chinese_bytes": cb, "chinese_per_line_bytes": cpl,
            "english_type": get_ci(sec, "EnglishType") or "",
            "english_font": get_ci(sec, "EnglishFont") or "",
            "english_width": ew, "english_height": eh,
            "english_bytes": eb, "english_per_line_bytes": epl,
            "check_chinese": {
                "perline_x_height": (cpl * ch) if (cpl and ch) else None,
                "equals_bytes": (cpl * ch) == cb if (cpl and ch and cb) else None,
                "bits_per_pixel": round(cpl * 8 / cw, 3) if (cpl and cw) else None,
            },
            "check_english": {
                "perline_x_height": (epl * eh) if (epl and eh) else None,
                "equals_bytes": (epl * eh) == eb if (epl and eh and eb) else None,
                "bits_per_pixel": round(epl * 8 / ew, 3) if (epl and ew) else None,
            },
        })

    font_cross = []
    for f in fonts:
        for key, w, h, b in (("chinese", f["chinese_width"], f["chinese_height"],
                              f["chinese_bytes"]),
                             ("english", f["english_width"], f["english_height"],
                              f["english_bytes"])):
            fn = f["chinese_font"] if key == "chinese" else f["english_font"]
            if not fn or b in (None, 0):
                continue
            size = FONT_FILES.get(fn.upper())
            if size is None:
                continue
            font_cross.append({
                "font_num": f["font_num"], "which": key, "file": fn,
                "bytes": size, "bytes_per_char": b,
                "char_count": size / b,
                "integer": size % b == 0,
            })

    # ---------------- TERRAIN ----------------
    terrains = []
    for sec in ini.sections:
        if sec.name.upper() != "TERRAIN":
            continue
        terrains.append({
            "sequence": sec.num("Sequence"),
            "name": get_ci(sec, "Name"),
            "soundtrack": sec.num("SoundTrack"),
            "floor": get_ci(sec, "Floor") or "",
            "foreground": sec.getall("Foreground"),
            "midground": sec.getall("Midground"),
            "background": sec.getall("Background"),
            "lineno": sec.lineno,
        })

    # ---------------- SCRIPT ----------------
    script_files = []
    for sec in ini.sections:
        if sec.name.upper() == "SCRIPT":
            script_files = sec.getall("File")

    # ---------------- ITEM ----------------
    items = []
    for i, sec in enumerate(ini.all("ITEM"), 1):
        seq = sec.num("Sequence")
        cls = next((c for lo, hi, c in ITEM_CLASS if lo <= (seq or 0) <= hi), "?")
        it = {"index": i, "lineno": sec.lineno, "class": cls}
        for k in ITEM_FIELDS:
            v = get_ci(sec, k)
            if k in ("Name", "Attrib", "TYPE", "WeaponType", "WeaponObject",
                     "SearchType", "Sprite", "Description"):
                it[k.lower()] = v or ""
            else:
                it[k.lower()] = sec.num(k)
        it["description"] = it["description"].strip('"')
        items.append(it)

    books = [it for it in items if it["type"] == "JEWEL_THING" or "書" in it["name"] or "經" in it["name"]]
    seals = [it for it in items if it["class"].startswith("兵符")]
    horses = [it for it in items if it["type"] == "JEWEL_HORSE"]
    weapons = [it for it in items if it["type"] == "JEWEL_WEAPON"]

    data = {
        "source": "SANGO.INI",
        "bytes": os.path.getsize(SRC),
        "encoding": ini.encoding,
        "lines": ini.stats()["lines"],
        "sections": len(ini.sections),
        "section_groups": ini.stats()["section_groups"],
        "system": {
            "raw": sysd,
            "total_times": ini.get("SYSTEM").num("TotalTimes"),
            "total_general_type": ini.get("SYSTEM").num("TotalGeneralType"),
            "total_things": ini.get("SYSTEM").num("TotalThings"),
            "total_force": ini.get("SYSTEM").num("TotalForce"),
            "font_directory": sysd.get("FontDirectory"),
            "default_font": ini.get("SYSTEM").num("DefaultFont"),
            "times": times,
        },
        "fonts": fonts,
        "font_files": FONT_FILES,
        "font_cross_check": font_cross,
        "terrain": terrains,
        "script_files": script_files,
        "items": items,
        "item_stats": {
            "count": len(items),
            "by_type": dist_text([it["type"] for it in items]),
            "by_class": dist_text([it["class"] for it in items]),
            "level": dist([it["level"] for it in items]),
            "rate": dist([it["rate"] for it in items]),
            "str": dist([it["str"] for it in items]),
            "int": dist([it["int"] for it in items]),
            "maxhp": dist([it["maxhp"] for it in items]),
            "maxmp": dist([it["maxmp"] for it in items]),
            "battle": dist([it["battle"] for it in items]),
            "skill": dist([it["skill"] for it in items]),
            "speed": dist([it["speed"] for it in items]),
            "spirit": dist([it["spirit"] for it in items]),
            "loyal": dist([it["loyal"] for it in items]),
            "tire": dist([it["tire"] for it in items]),
        },
        "cross_checks": {
            "books_int": [{"seq": b["sequence"], "name": b["name"],
                           "int": b["int"], "description": b["description"]}
                          for b in books],
            "seal_force": [{"seq": s["sequence"], "name": s["name"],
                            "force": s["force"], "sort": s["sort"]} for s in seals],
            "horse_speed": [{"seq": h["sequence"], "name": h["name"],
                             "speed": h["speed"], "level": h["level"]} for h in horses],
            "weapon_count": len(weapons),
            "readme_claim": "说明文档：书籍加智力显示 7-10-13-17-20，原版实际 13-15-17-18-20",
        },
    }
    write_json(DST, data)

    print(f"[sango] sections={len(ini.sections)} groups={ini.stats()['section_groups']} -> {DST}")
    print("   system:", {k: v for k, v in sysd.items() if not k.startswith("Times0")})
    print("   times:", [(t["index"], t["file"], t["name"]) for t in times])
    for f in fonts:
        print(f"   FONTS{f['font_num']:02d} 中 {f['chinese_width']}x{f['chinese_height']}"
              f" B={f['chinese_bytes']} pl={f['chinese_per_line_bytes']}"
              f" 英 {f['english_type']} {f['english_width']}x{f['english_height']}"
              f" B={f['english_bytes']} pl={f['english_per_line_bytes']}"
              f" 自洽中={f['check_chinese']['equals_bytes']}"
              f" 字ppi={f['check_chinese']['bits_per_pixel']}")
    print("   font cross:", [(c["file"], c["bytes_per_char"], c["char_count"], c["integer"])
                             for c in font_cross])
    print("   terrain:", [(t["sequence"], t["name"], t["soundtrack"]) for t in terrains])
    print("   items:", data["item_stats"]["by_class"]["top"])
    print("   books:", [(b["name"], b["int"], b["description"]) for b in books])
    print("   seals force:", [(s["name"], s["force"]) for s in seals])
    print("   horses:", [(h["name"], h["speed"], h["level"]) for h in horses])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
