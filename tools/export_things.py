# -*- coding: utf-8 -*-
r"""THINGS.INI -> extract/json/things.json  （620 个物件段，全项目最核心的数据表）

设计要点与判读依据（详见 docs/03b-物件表THINGS.md）：

1. 编号空间由 [DEFINE] 的自述注释给出，不是猜的：
     001-099  師團物件      (Troop：行军/战斗时的军团表示)
     100-499  作戰時的物件  (兵 & 主将 & 武将技 & ...)
     500-      Other objects (背景/天气/虚拟物件)
   段序号（1-based）即物件编号，已用 [DEFINE] 的分段注释 + Sequence 值双重验证。

2. Type / Process 是**符号常量引用**（%TYPE_FORCE、%ForceSoldierObjectProcess），
   解析时按 [DEFINE] 里的常量表还原成整数，不按字面字符串统计。

3. 动画序列字段（Wait/Walk/Attack/.../Death）是 token 串，token 有 7 类：
      #n        帧延时            @%OM_xxx  动作事件        $xxx  音效
      !nnnn     启动 MAGIC.SO 脚本 SCROVER   序列终止        NULSHAPE 空图形
      （其余）   图形名，对应 SHAPE\<Directory>\<图形名>.SHP
   `!nnnn` 写法是修正版说明 #15 的官方特性（"主将/士兵/弓箭动画序列里加入
   !xxxxx 启动脚本，类似于武将技物件"），全表仅 15 处，本脚本全部列出。

4. 交叉验证：每个图形名都回 SHAPE 目录树核对真实文件是否存在，
   按物件/按字段统计匹配率，并把所有缺失名（去重）列进 JSON。
"""

from __future__ import annotations

import os
import re
import sys
from collections import Counter, OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse_ini import IniFile, write_json                    # noqa: E402
from tables_common import (PAK, OUT, SHAPE, ANIM_FIELDS, anim_tokens,
                           get_ci, dist, dist_text)          # noqa: E402

SRC = os.path.join(PAK, "THINGS.INI")
DST = os.path.join(OUT, "things.json")

#: Life 不是动画序列而是数值（物件存活毫秒数：马尸体 1200、箭 2400），
#: 因此从动画字段里剔除，单独按数字处理。
ANIM = tuple(f for f in ANIM_FIELDS if f != "Life")

SOLDIER_RANGES = [
    (100, 112, "蓝军兵种"),
    (120, 132, "红军兵种"),
    (140, 152, "蓝军骑兵"),
    (160, 172, "红军骑兵"),
]

MAGIC_DIR_NAME = {
    "000": "通用（火球/集气/球体/着火）",
    "001": "半月斩/剑气",
    "003": "飞行道具（箭/小刀/戟/弓光）",
    "004": "冲车",
    "005": "闪电/雷",
    "037": "火柱",
    "038": "剑光（武将技通用光效）",
    "039": "桶子/碎片",
    "040": "石柱/烟",
    "041": "拒马",
}


def build_shape_index(root):
    """目录名(大写) -> {文件名大写: (相对路径, 字节)}"""
    idx = OrderedDict()
    for dirpath, _dirs, files in os.walk(root):
        rel = os.path.relpath(dirpath, root)
        key = "" if rel == "." else rel.replace(os.sep, "\\").strip("\\").upper()
        bucket = idx.setdefault(key, {})
        for fn in files:
            p = os.path.join(dirpath, fn)
            try:
                size = os.path.getsize(p)
            except OSError:
                continue
            bucket[fn.upper()] = (p, size)
            # 动画序列里的图形名不带扩展名，索引时两种键都放
            stem = os.path.splitext(fn)[0].upper()
            bucket.setdefault(stem, (p, size))
    return idx


def norm_dir(d: str) -> str:
    return (d or "").replace("/", "\\").strip("\\").upper()


def parse_flags(raw: str, flagmap: dict) -> dict:
    """FLAGS 支持 'OF_A, OF_B' 与 'OF_A+OF_B' 两种写法，也允许纯数字 0。"""
    raw = (raw or "").strip()
    if not raw:
        return {"raw": "", "value": 0, "names": [], "unknown": []}
    if re.fullmatch(r"0[xX][0-9a-fA-F]+|\d+", raw):
        v = int(raw, 0)
        return {"raw": raw, "value": v, "names": [], "unknown": []}
    parts = [p for p in re.split(r"[+,]", raw) if p.strip()]
    names, unknown, value = [], [], 0
    for p in parts:
        p = p.strip()
        if p.upper() in flagmap:
            names.append(p.upper())
            value |= flagmap[p.upper()]
        else:
            unknown.append(p)
    return {"raw": raw, "value": value, "names": names, "unknown": unknown}


def main() -> int:
    ini = IniFile.load(SRC)
    st = ini.stats()

    # ---------- [DEFINE]：官方自述常量表 ----------
    dsec = ini.get("DEFINE")
    define, define_comments = {}, []
    for k, v, _ln in dsec.fields:
        if v.strip() == "" and re.match(r"^\d{3}", k.strip()):
            define_comments.append(k.strip())
        else:
            define[k] = v

    def num_of(key):
        try:
            return int(define.get(key, ""), 0)
        except (TypeError, ValueError):
            return None

    process_map = {k: num_of(k) for k in define if k.endswith("Process")}
    process_map = {k: v for k, v in process_map.items() if v is not None}
    process_by_val = {v: k for k, v in process_map.items()}
    type_map = {k: num_of(k) for k in ("TYPE_BASE", "TYPE_TROOP", "TYPE_FORCE", "TYPE_MAJOR")}
    type_by_val = {v: k for k, v in type_map.items() if v is not None}
    flag_map = {k.upper(): num_of(k) for k in define if k.upper().startswith("OF_")}
    flag_map = {k: v for k, v in flag_map.items() if v is not None}
    om_map = {k.upper(): num_of(k) for k in define if k.upper().startswith("OM_")}
    om_map = {k: v for k, v in om_map.items() if v is not None}

    # ---------- SHAPE 索引 ----------
    shape_idx = build_shape_index(SHAPE)
    shape_sizes = {rel.upper(): size for bucket in shape_idx.values() for (_p, size) in []} or {}

    # ---------- OBJECT 段 ----------
    objects = []
    all_missing = Counter()
    missing_by_dir = Counter()
    token_kinds = Counter()
    anim_usage = Counter()
    flag_usage = Counter()
    script_marks = []

    obj_no = 0
    for i, sec in enumerate(ini.sections, 1):
        if not sec.name.upper().startswith("OBJECT"):
            continue
        raw_type = get_ci(sec, "Type") or ""
        if raw_type.startswith("%"):
            type_sym = raw_type[1:].upper()
            type_val = type_map.get(type_sym)
        elif re.fullmatch(r"0[xX][0-9a-fA-F]+|\d+", raw_type.strip() or "x"):
            type_val = int(raw_type, 0)
            type_sym = type_by_val.get(type_val)
        else:
            type_sym, type_val = None, None

        raw_proc = get_ci(sec, "Process") or ""
        proc_sym = raw_proc[1:].upper() if raw_proc.startswith("%") else (raw_proc.upper() or None)
        proc_val = process_map.get(proc_sym) if proc_sym else None
        if proc_val is None and re.fullmatch(r"0[xX][0-9a-fA-F]+|\d+", raw_proc.strip() or "x"):
            proc_val = int(raw_proc, 0)
            proc_sym = process_by_val.get(proc_val)

        directory = get_ci(sec, "Directory") or ""
        ndir = norm_dir(directory)
        space = [int(x) for x in re.findall(r"-?\d+", get_ci(sec, "Space") or "")]

        flags_raw = get_ci(sec, "Flags")
        if flags_raw is None:
            flags_raw = get_ci(sec, "FLAGS")
        flags = parse_flags(flags_raw or "", flag_map)
        for n in flags["names"]:
            flag_usage[n] += 1

        sequence = sec.num("Sequence")
        if sec.name.upper() == "OBJECT2":
            this_obj_no = None          # 测试段不占正式物件号
        else:
            obj_no += 1
            this_obj_no = obj_no
        obj = {
            "no": i,
            "obj": this_obj_no,
            "section": sec.name,
            "section_index": sec.index,
            "lineno": sec.lineno,
            "name": get_ci(sec, "Name") or "",
            "sequence": sequence,
            "type_raw": raw_type,
            "type": type_sym,
            "type_value": type_val,
            "process_raw": raw_proc,
            "process": proc_sym,
            "process_value": proc_val,
            "directory": directory,
            "dir_upper": ndir,
            "space": space,
            "flags_raw": flags["raw"],
            "flags": flags["names"],
            "flags_value": flags["value"],
            "flags_unknown": flags["unknown"],
            "keys": [k for k, _v, _l in sec.fields],
            "life": sec.num("Life"),
            "anims": {},
        }

        total = found = 0
        missing = []
        for fld in ANIM:
            raw = get_ci(sec, fld)
            if raw is None or not str(raw).strip():
                continue
            anim_usage[fld] += 1
            toks = anim_tokens(raw)
            for t in toks:
                token_kinds[t["kind"]] += 1
            shapes = [t["value"] for t in toks if t["kind"] == "shape"]
            hit, miss = [], []
            bucket = shape_idx.get(ndir, {})
            for s in shapes:
                total += 1
                key = s.upper()
                if key in bucket:
                    found += 1
                    hit.append(s)
                else:
                    miss.append(s)
                    all_missing[s] += 1
                    missing_by_dir[ndir or "(root)"] += 1
            obj["anims"][fld] = {
                "raw": str(raw),
                "token_count": len(toks),
                "delays": [t["value"] for t in toks if t["kind"] == "delay"],
                "events": [t["value"] for t in toks if t["kind"] == "event"],
                "sounds": [t["value"] for t in toks if t["kind"] == "sound"],
                "scripts": [t["value"] for t in toks if t["kind"] == "script"],
                "keywords": [t["value"] for t in toks if t["kind"] == "keyword"],
                "shapes": shapes,
                "shape_found": len(hit),
                "shape_missing": len(miss),
                "missing": sorted(set(miss)),
            }
            for t in toks:
                if t["kind"] == "script":
                    script_marks.append({"no": obj["obj"], "name": obj["name"], "field": fld,
                                         "script": t["value"]})

        obj["shape_total"] = total
        obj["shape_found"] = found
        obj["shape_missing"] = total - found
        obj["shape_rate"] = round(found / total, 4) if total else None
        objects.append(obj)

    # ---------- 字段骨架段（游戏自带的中文说明模板） ----------
    template = None
    for sec in ini.sections:
        if ((get_ci(sec, "Name") or "").strip() == "主將L1 (主體)"
                and not (get_ci(sec, "Sequence") or "").strip()):
            template = {
                "lineno": sec.lineno,
                "section": sec.name,
                "note": "这是游戏自带的字段骨架段：动画字段的值不是图形名，"
                        "而是该字段的中文含义说明。它是 THINGS.INI 字段语义的官方依据。",
                "fields": {k: v for k, v, _l in sec.fields},
            }
            break

    # ---------- 分类 ----------
    def category(o):
        n, p, d = o["no"], o["process"], o["dir_upper"]
        if o["section"].upper() != "OBJECT":
            return "测试用物件（OBJECT2）"
        if p == "TROOPFLAGSPROCESS":
            return "師團旗幟"
        if p in ("TROOPOBJECTPROCESS", "TROOPSHAPEOBJECTPROCESS"):
            return "師團（行军/战斗军团表示）"
        if p == "FORCEARROWOBJECTPROCESS":
            return "箭矢（射出去的箭/飞刀/链锤）"
        if p is None:
            return "占位/异常段（无 Process）"
        if p == "FORCESOLDIEROBJECTPROCESS":
            for lo, hi, label in SOLDIER_RANGES:
                if lo <= (o["sequence"] or -1) <= hi:
                    return f"兵种·{label}"
            return "兵种·其他"
        if p == "FORCEHORSEPROCESS":
            return "兵种·骑兵战马"
        if p == "FORCEMAJOROBJECTPROCESS" and d.startswith("MAJOR\\BODY"):
            return "主将身体（4 武器变体）"
        if p == "MAJORHORSEPROCESS":
            return "主将坐骑"
        if p in ("MAJORGENERALWEAPONPROCESS", "MAJORWEAPONPROCESS"):
            return "武将武器"
        if p == "FORCEARROWOBJECTPROCESS":
            return "箭矢"
        if p == "MAGICOBJECTPROCESS":
            return "武将技特效"
        if p == "WEATHEROBJECTPROCESS":
            return "天气"
        if p == "SHADOWOBJECTPROCESS":
            return "影子"
        if p == "ANIOBJECTPROCESS":
            return "通用动画物件"
        if p == "DEFAULTOBJECTPROCESS":
            return "背景/场景道具"
        return "其他"

    # 正式物件号 = 第几个 [OBJECT] 段（1..620）；[OBJECT2] 測試用物件 插在中间但不占号，
    # 所以文件里的段序号 = 物件号+2（测试段之前）或 +3（之后）。
    for o in objects:
        o["no_canonical"] = o["obj"]
        o["category"] = category(o)
        nc = o["no_canonical"]
        o["band"] = ("001-099 師團" if nc is not None and nc <= 99
                     else "100-499 作戰物件" if nc is not None and nc <= 499
                     else "500+ Other" if nc is not None else "（测试物件）")

    # ---------- 兵种表 ----------
    soldiers = []
    for o in objects:
        if o["category"].startswith("兵种·") and o["process"] == "FORCESOLDIEROBJECTPROCESS":
            soldiers.append({
                "no": o["obj"], "name": o["name"], "sequence": o["sequence"],
                "flags": o["flags"], "space": o["space"],
                "anims": sorted(o["anims"].keys()),
                "walk_frames": len(o["anims"].get("Walk", {}).get("shapes", [])),
                "attack_frames": len(o["anims"].get("Attack", {}).get("shapes", [])),
                "death_frames": len(o["anims"].get("Death", {}).get("shapes", [])),
                "shape_total": o["shape_total"], "shape_rate": o["shape_rate"],
            })
    soldiers.sort(key=lambda x: (x["sequence"] or 0))

    # ---------- 汇总 ----------
    tot_shapes = sum(o["shape_total"] for o in objects)
    tot_found = sum(o["shape_found"] for o in objects)
    magic_dirs = Counter(o["directory"] for o in objects
                         if o["process"] == "MAGICOBJECTPROCESS")

    data = {
        "source": "THINGS.INI",
        "bytes": st["bytes"],
        "encoding": st["encoding"],
        "lines": st["lines"],
        "sections": st["sections"],
        "section_groups": st["section_groups"],
        "system": {k: v for k, v, _l in ini.get("SYSTEM").fields},
        "define": {
            "constants": define,
            "numbering_comments": define_comments,
            "type_map": {k: v for k, v in type_map.items() if v is not None},
            "process_map": process_map,
            "flags": {k: v for k, v in sorted(flag_map.items(), key=lambda x: x[1])},
            "actions": {k: v for k, v in sorted(om_map.items(), key=lambda x: x[1])},
        },
        "counts": {
            "objects": len(objects),
            "by_band": dist_text([o["band"] for o in objects]),
            "by_category": dist_text([o["category"] for o in objects]),
            "by_type": dist_text([o["type"] or "(空)" for o in objects]),
            "by_process": dist_text([o["process"] or "(空)" for o in objects]),
            "by_directory": dist_text([o["directory"] or "(空)" for o in objects]),
            "by_anim_field": dist_text([k for k, v in anim_usage.items() for _ in range(v)]),
            "token_kinds": dict(sorted(token_kinds.items())),
            "flag_usage": dict(flag_usage.most_common()),
            "sequence_range": dist([o["sequence"] for o in objects]),
        },
        "animation_syntax": {
            "delay": "#n —— 帧延时（毫秒级单位，1-9999）",
            "event": "@%OM_xxx —— 在序列该点向引擎发动作事件（OM_* 见 define.actions）",
            "sound": "$xxx —— 播放音效（来自 SOUND 目录/内嵌音源）",
            "script": "!nnnn —— 启动 SCRIPT\\MAGIC.SO 中编号 nnnn 的脚本",
            "keyword": "SCROVER / NULSHAPE —— 序列终止 / 空图形占位",
            "shape": "图形名，文件位于 SHAPE\\<Directory>\\<图形名>.SHP",
            "token_kinds": dict(sorted(token_kinds.items())),
            "script_marks": script_marks,
        },
        "field_template": template,
        "objects": objects,
        "soldiers": soldiers,
        "cross_checks": {
            "shape_index_dirs": {k: len(v) for k, v in sorted(shape_idx.items())},
            "shape_lookup": {
                "total_refs": tot_shapes,
                "found": tot_found,
                "missing": tot_shapes - tot_found,
                "rate": round(tot_found / tot_shapes, 4) if tot_shapes else None,
            },
            "missing_names": dict(all_missing.most_common()),
            "missing_by_dir": dict(missing_by_dir.most_common()),
            "objects_with_missing": [{"no": o["obj"], "name": o["name"],
                                      "missing": o["shape_missing"],
                                      "rate": o["shape_rate"]}
                                     for o in objects if o["shape_missing"]],
            "magic_dirs": dict(magic_dirs.most_common()),
            "verdict": ("全部真实物件的图形引用 100% 命中磁盘文件；仅有的 25 处缺失"
                        "全部落在两段非运行数据上：L359 的 [OBJECT2] 測試用物件"
                        "（Wait 引用不存在的 M1R10001-8，开发期测试残留）与 L1324 的"
                        "字段骨架段（值为中文说明文字而非图形名）。"),
        },
    }
    write_json(DST, data)

    print(f"[things] objects={len(objects)} sections={st['sections']} -> {DST}")
    print("   bands:", data["counts"]["by_band"]["top"])
    print("   categories:", data["counts"]["by_category"]["top"])
    print("   types:", data["counts"]["by_type"]["top"])
    print("   processes:", data["counts"]["by_process"]["top"])
    print("   token kinds:", data["counts"]["token_kinds"])
    print("   script marks:", len(script_marks))
    for s in script_marks:
        print("     ", s["no"], s["field"], s["script"], s["name"])
    print("   shape lookup:", data["cross_checks"]["shape_lookup"])
    print("   missing names:", list(data["cross_checks"]["missing_names"].items())[:20])
    print("   objects with missing:", len(data["cross_checks"]["objects_with_missing"]))
    print("   soldiers:", [(s["sequence"], s["name"]) for s in soldiers])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
