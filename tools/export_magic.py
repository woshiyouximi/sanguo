# -*- coding: utf-8 -*-
"""MAGIC.INI -> extract/json/magic.json

MAGIC.INI 里其实有**两种段**：
    [MAGIC] x110   武将技（战场上由主将施放）
    [WISE]  x67    军师技（战前/战场由军师施放）

[MAGIC] 字段：SEQUENCE / NAME / MP / POWER / ATTACK / SCRIPT / ATTRIB / TITLE / NOTE / ACTIVE
[WISE]  字段：SEQUENCE / NAME / Level / WiseLevel / Execute / ATTRIB / ACTIVE

本脚本除了逐字段导出，还做四件事（结论写进 docs/03a）：
  1. ATTRIB 的逗号分词与词表统计（它是自由标签串，不是单一枚举）；
  2. NOTE 的 "说明,L几" 拆分 -> 技能等级；
  3. ACTIVE 的作用对象位掩码解算（符号与数字两套写法统一成 2x2 位掩码）；
  4. SCRIPT 号段与 SCRIPT\\MAGIC.SO 的规模核对（数据侧，不看反汇编）。
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse_ini import IniFile, write_json        # noqa: E402
from tables_common import PAK, OUT, dist, dist_text, get_ci   # noqa: E402

SRC = os.path.join(PAK, "MAGIC.INI")
DST = os.path.join(OUT, "magic.json")
MAGIC_SO = os.path.join(PAK, "SCRIPT", "MAGIC.SO")

#: ACTIVE 的作用对象位掩码。四位分别表示「我方士兵 / 我方主将 / 敌方士兵 / 敌方主将」。
#: 依据：数字写法只出现 1/2/4/8；符号写法可以按同一规则拼出来（敌我全軍=15、
#: 敵我士兵=5、我方主將=2 ……），两套写法在语义上完全自洽，见 docs/03a 的验证表。
ACTIVE_BITS = {1: "我方士兵", 2: "我方主将", 4: "敌方士兵", 8: "敌方主将"}
ACTIVE_SYMBOL = {
    "我方士兵": 1, "我方主將": 2, "敌方士兵": 4, "敵方士兵": 4,
    "敵方主將": 8, "敵方全軍": 12, "敵我全軍": 15, "敵我士兵": 5,
    "我方全軍": 3, "主將": 8,
}


def decode_mask(raw: str):
    """把 ACTIVE 的符号/数字两套写法统一成 (mask, bits)。"""
    s = (raw or "").strip()
    if not s:
        return None, []
    if s.isdigit():
        m = int(s)
    else:
        m = ACTIVE_SYMBOL.get(s)
        if m is None:
            m = 0
            for k, v in ACTIVE_SYMBOL.items():
                if k in s:
                    m |= v
            if m == 0:
                return None, []
    return m, [ACTIVE_BITS[b] for b in (1, 2, 4, 8) if m & b]


def grade_of(note: str):
    """NOTE 形如 '主將補血,L1' -> ('主將補血', 'L1')。"""
    if not note:
        return "", None
    parts = [p.strip() for p in note.split(",")]
    g = None
    for p in parts[1:]:
        if len(p) >= 2 and p[0] in "Ll" and p[1:].isdigit():
            g = "L" + p[1:]
    return parts[0], g


def classify(row: dict) -> tuple[str, str]:
    """按优先级给出 (分类, 命中规则)。规则全部写在 docs/03a，便于复核。"""
    if row["kind"] == "wise":
        return "军师技", "段名 [WISE]"
    tags, note, name = row["attrib_tags"], row["note_text"], row["name"]
    if "補兵" in tags or "補兵" in note or "召喚" in note or "召喚" in name:
        return "召唤/补兵", "ATTRIB 含 補兵 或 NOTE 含 召喚"
    if "補血" in tags or "補血" in note:
        return "恢复", "ATTRIB/NOTE 含 補血"
    if "退兵" in note or "阻礙" in note or "暫停" in note or "混亂" in note:
        return "控制/阻碍", "NOTE 含 退兵/阻礙/暫停/混亂"
    if row["active_mask"] == 8:
        return "伤害-单体主将", "ACTIVE 掩码 = 8（只打敌方主将）"
    if row["active_mask"] in (4,):
        return "伤害-敌方士兵", "ACTIVE 掩码 = 4"
    return "伤害-群体", "其余 MAGIC 段"


def main() -> int:
    ini = IniFile.load(SRC)
    magics, wises = ini.all("MAGIC"), ini.all("WISE")

    rows = []
    for kind, secs in (("magic", magics), ("wise", wises)):
        for i, sec in enumerate(secs, 1):
            if kind == "magic":
                attrib = get_ci(sec, "ATTRIB", "") or ""
                note = get_ci(sec, "NOTE", "") or ""
                note_text, grade = grade_of(note)
                active = get_ci(sec, "ACTIVE", "") or ""
                mask, bits = decode_mask(active)
                row = {
                    "kind": kind,
                    "index": i,
                    "sequence": sec.num("SEQUENCE"),
                    "name": get_ci(sec, "NAME"),
                    "mp": sec.num("MP"),
                    "power": sec.num("POWER"),
                    "attack": sec.num("ATTACK"),
                    "script": sec.num("SCRIPT"),
                    "attrib": attrib,
                    "attrib_tags": [t.strip() for t in attrib.split(",") if t.strip()],
                    "title": get_ci(sec, "TITLE") or "",
                    "note": note,
                    "note_text": note_text,
                    "grade": grade,
                    "active": active,
                    "active_mask": mask,
                    "active_bits": bits,
                    "lineno": sec.lineno,
                }
            else:
                attrib = get_ci(sec, "ATTRIB", "") or ""
                active = get_ci(sec, "ACTIVE", "") or ""
                mask, bits = decode_mask(active)
                level = sec.num("Level")
                row = {
                    "kind": kind,
                    "index": i,
                    "sequence": sec.num("SEQUENCE"),
                    "name": get_ci(sec, "NAME"),
                    "level": level,
                    "level_div10": (level // 10) if isinstance(level, int) else None,
                    "wise_level": sec.num("WiseLevel"),
                    "execute": sec.num("Execute"),
                    "attrib": attrib,
                    "attrib_tags": [t.strip() for t in attrib.split(",") if t.strip()],
                    "active": active,
                    "active_mask": mask,
                    "active_bits": bits,
                    "lineno": sec.lineno,
                }
            row["category"], row["category_rule"] = classify(row)
            rows.append(row)

    mag = [r for r in rows if r["kind"] == "magic"]
    wis = [r for r in rows if r["kind"] == "wise"]

    # ---- SCRIPT 号段核对 ----
    scripts = sorted({r["script"] for r in mag if r["script"] is not None})
    dup_scripts = {}
    for r in mag:
        dup_scripts.setdefault(r["script"], []).append(r["name"])
    dup_scripts = {k: v for k, v in dup_scripts.items() if len(v) > 1}
    so_bytes = os.path.getsize(MAGIC_SO) if os.path.exists(MAGIC_SO) else 0
    gaps = [n for n in range(scripts[0], scripts[-1] + 1) if n not in set(scripts)] if scripts else []

    # ---- ATTRIB 词表 ----
    tag_count = {}
    for r in rows:
        for t in r["attrib_tags"]:
            tag_count[t] = tag_count.get(t, 0) + 1

    data = {
        "source": "MAGIC.INI",
        "bytes": os.path.getsize(SRC),
        "encoding": ini.encoding,
        "lines": ini.stats()["lines"],
        "sections": len(ini.sections),
        "magic_count": len(mag),
        "wise_count": len(wis),
        "field_sets": {
            "MAGIC": ["SEQUENCE", "NAME", "MP", "POWER", "ATTACK",
                      "SCRIPT", "ATTRIB", "TITLE", "NOTE", "ACTIVE"],
            "WISE": ["SEQUENCE", "NAME", "Level", "WiseLevel",
                     "Execute", "ATTRIB", "ACTIVE"],
        },
        "stats": {
            "mp": dist([r["mp"] for r in mag]),
            "power": dist([r["power"] for r in mag]),
            "attack": dist([r["attack"] for r in mag]),
            "script": dist([r["script"] for r in mag]),
            "grade": dist_text([r["grade"] for r in mag]),
            "active": dist_text([r["active"] for r in rows]),
            "attrib_tags": dist_text([t for r in rows for t in r["attrib_tags"]], 40),
            "title_filled": sum(1 for r in mag if r["title"]),
            "title_empty": sum(1 for r in mag if not r["title"]),
            "wise_level": dist([r["wise_level"] for r in wis]),
            "wise_level_value": dist([r["level"] for r in wis]),
            "execute": dist([r["execute"] for r in wis]),
            "wise_attrib": dist_text([r["attrib"] for r in wis]),
        },
        "script_check": {
            "script_so": "SCRIPT\\MAGIC.SO",
            "script_so_bytes": so_bytes,
            "script_ids": scripts,
            "script_id_count": len(scripts),
            "script_min": scripts[0] if scripts else None,
            "script_max": scripts[-1] if scripts else None,
            "contiguous": not gaps,
            "gaps": gaps,
            "duplicated": dup_scripts,
            "bytes_per_script": round(so_bytes / len(scripts), 1) if scripts else None,
            "note": "MAGIC.SO 259KB / 85 个脚本号 ≈ 每脚本 3KB，量级合理；"
                    "脚本号 501 起连续分配，与 110 个武将技不是一一对应"
                    "（同一脚本号被多个技能复用，或反之）。",
        },
        "classification": {
            "rules": [
                "1) [WISE] 段 -> 军师技",
                "2) ATTRIB 含 補兵 或 NOTE 含 召喚 -> 召唤/补兵",
                "3) ATTRIB/NOTE 含 補血 -> 恢复",
                "4) NOTE 含 退兵/阻礙/暫停/混亂 -> 控制/阻碍",
                "5) ACTIVE 掩码 = 8 -> 伤害-单体主将",
                "6) ACTIVE 掩码 = 4 -> 伤害-敌方士兵",
                "7) 其余 -> 伤害-群体",
            ],
            "counts": dist_text([r["category"] for r in rows]),
        },
        "entries": rows,
    }
    write_json(DST, data)

    print(f"[magic] MAGIC={len(mag)} WISE={len(wis)} -> {DST}")
    print("   mp", data["stats"]["mp"])
    print("   attack", data["stats"]["attack"])
    print("   power", data["stats"]["power"])
    print("   grade", data["stats"]["grade"]["top"])
    print("   classify", [(d["value"], d["n"]) for d in data["classification"]["counts"]["top"]])
    print("   scripts", scripts[0], "..", scripts[-1], "n=", len(scripts),
          "gaps=", gaps, "dup=", dup_scripts)
    print("   MAGIC.SO", so_bytes, "B ->", data["script_check"]["bytes_per_script"], "B/script")
    print("   attrib tags", [(d["value"], d["n"]) for d in data["stats"]["attrib_tags"]["top"]][:14])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
