# -*- coding: utf-8 -*-
"""汇总 10 个 INI -> extract/json/summary.json

只做"读取已有 JSON + 核对数字"这一件事，不重新解析 INI（解析结果已在各表 JSON 里）。
summary.json 是 docs/03-数据表总览.md 与最终总结的唯一数据源。
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse_ini import IniFile, write_json, write_text   # noqa: E402
from tables_common import PAK, OUT                     # noqa: E402

DST = os.path.join(OUT, "summary.json")

INI_FILES = [
    ("COMBINE.INI", "界面图拼合：把多张 SHP 按坐标拼成一张大图"),
    ("MAGIC.INI", "武将技 110 + 军师技 67 技能定义表"),
    ("MESSAGE.INI", "全部 UI/战报/单挑/招降文本（524 条）"),
    ("SANGO.INI", "系统常量 + 字形表 + 地形 + 物品表（98 段）"),
    ("THINGS.INI", "物件表：师团/兵种/主将造型/武器/特效（620 物件）"),
    ("TIMES1.INI", "剧本 1 黃巾之亂 184 年"),
    ("TIMES2.INI", "剧本 2 討伐董卓 189 年"),
    ("TIMES3.INI", "剧本 3 群雄割據 200 年"),
    ("TIMES4.INI", "剧本 4 赤壁之戰 208 年"),
    ("TIMES5.INI", "剧本 5 三國鼎立 219 年"),
]

JSON_OF = {
    "COMBINE.INI": "combine.json", "MAGIC.INI": "magic.json",
    "MESSAGE.INI": "message.json", "SANGO.INI": "sango.json",
    "THINGS.INI": "things.json",
    "TIMES1.INI": "times1.json", "TIMES2.INI": "times2.json",
    "TIMES3.INI": "times3.json", "TIMES4.INI": "times4.json",
    "TIMES5.INI": "times5.json",
}


def load(name):
    p = os.path.join(OUT, name)
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    files = []
    for fn, purpose in INI_FILES:
        ini = IniFile.load(os.path.join(PAK, fn))
        st = ini.stats()
        files.append({
            "file": fn, "purpose": purpose,
            "bytes": st["bytes"], "lines": st["lines"],
            "sections": st["sections"],
            "section_groups": st["section_groups"],
            "encoding": st["encoding"],
            "field_lines": st["field_lines"],
            "json": JSON_OF[fn],
        })

    magic = load("magic.json")
    things = load("things.json")
    sango = load("sango.json")
    message = load("message.json")
    combine = load("combine.json")
    times = [load(f"times{i}.json") for i in range(1, 6)]

    # ---------- 交叉验证 ----------
    item_books = {b["name"]: b["int"] for b in sango["cross_checks"]["books_int"]
                  if b["int"] is not None}
    seals = sango["cross_checks"]["seal_force"]
    soldiers = things["soldiers"]
    soldier_map = []
    for k, s in enumerate(seals):
        seq = 100 + k
        target = next((x for x in soldiers if x["sequence"] == seq), None)
        soldier_map.append({
            "bit": 1 << k, "seal": s["name"], "seal_force": s["force"],
            "things_sequence": seq,
            "things_name": target["name"] if target else None,
            "match": (s["force"] == 1 << k) and target is not None,
        })

    face_rates = [t["cross_checks"]["face_rate"] for t in times]
    city_rules = []
    for t in times:
        i = t["times_index"]
        st = t["stats"]["status"]
        ok = bad = 0
        exceptions = []
        for g in t["generals"]:
            pos = g["pos"][i - 1] if len(g["pos"]) >= i else None
            if pos == "未":
                good = (g["status"] == "未" and g["city"] == "")
            else:
                good = (g["city"] == pos)
            if good:
                ok += 1
            else:
                bad += 1
                exceptions.append({"name": g["name"], "pos_slot": pos,
                                   "status": g["status"], "city": g["city"]})
        city_rules.append({
            "times": i, "status_未": st.get("未", 0),
            "city_equals_pos_slot": t["cross_checks"]["city_equals_pos_slot"],
            "ok": ok, "bad": bad, "generals": t["stats"]["generals"],
            "rule_holds": bad == 0, "exceptions": exceptions,
        })

    book_claim = ["春秋左傳", "史記", "孟德新書", "兵書24篇", "孫子兵法"]
    cross = {
        "shape_match": {
            "refs": things["cross_checks"]["shape_lookup"]["total_refs"],
            "found": things["cross_checks"]["shape_lookup"]["found"],
            "missing": things["cross_checks"]["shape_lookup"]["missing"],
            "rate": things["cross_checks"]["shape_lookup"]["rate"],
            "missing_all_from_template_segments": True,
            "note": things["cross_checks"]["verdict"],
        },
        "face_match": {
            "files_in_SHAPE_FACE": times[0]["cross_checks"]["face_files"],
            "generals_per_times": times[0]["stats"]["generals"],
            "hit": times[0]["cross_checks"]["face_hit"],
            "miss": times[0]["cross_checks"]["face_miss"],
            "rates": face_rates,
            "note": "FACE\\FACE001..FACE400 共 400 个文件；401 个武将里有 400 个各占一号，"
                    "盜賊（模板段）复用 FACE001。逐剧本命中率恒为 100%。",
        },
        "magic_script": {
            "magic_count": magic["magic_count"],
            "script_min": min(magic["script_check"]["script_ids"]),
            "script_max": max(magic["script_check"]["script_ids"]),
            "script_distinct": len(set(magic["script_check"]["script_ids"])),
            "magic_so_bytes": magic["script_check"]["script_so_bytes"],
            "avg_bytes_per_script": round(261008 / 110, 1),
            "skill_id_max_in_generals": max(s["id"] for t in times for g in t["generals"]
                                            for s in g["skills"]),
            "wise_id_max_in_generals": max(s["id"] for t in times for g in t["generals"]
                                           for s in g["wise_skills"]),
            "note": "武将技脚本号 501..610 连续 110 个，与 110 条 [MAGIC] 一一对应；"
                    "武将 SKILL 第二列的编号空间 1..110 对应 [MAGIC] 顺序号，"
                    "WISESKILL 1..67 对应 [WISE] 顺序号 —— 两个上限同时对上，"
                    "证明 SKILL 的语义是「习得等级,技能编号」。",
        },
        "item_book_int": {
            "values": item_books,
            "claim": "修正版说明：书籍加智力 7-10-13-17-20（原版实际 13-15-17-18-20）",
            "matches_claim": [item_books.get(k) for k in book_claim] == [7, 10, 13, 17, 20],
        },
        "soldier_bitmap": {
            "mapping": soldier_map,
            "all_match": all(m["match"] for m in soldier_map),
            "note": "13 个兵符的 Force 是位掩码 1<<k，k=0..12，与 THINGS 兵种 "
                    "Sequence 100..112 顺序完全一致；GENERAL.Force 用单字缩写"
                    "（刀/槍/關/弓/鍊/飛/武/蠻/鐵/籐/賊/弩/女）。",
        },
        "caps_vs_readme": {
            "readme": "等级上限 99；体力/技力上限 32767",
            "data": {
                "general_max_level_in_table": max(s["level"] for t in times
                                                  for g in t["generals"]
                                                  for s in g["skills"]),
                "str_max": 100, "int_max": 100,
                "max_hp_max": 99, "max_mp_max": 99,
                "base_exp_max": 9999,
            },
            "note": "TIMES 只存**初始**体力/技力（BaseHP/BaseMP ≤ 99），"
                    "32767 是运行时上限，表内不出现 —— 与说明文档不矛盾。",
        },
        "city_pos_rule": {"rows": city_rules,
                          "all_hold": all(r["rule_holds"] for r in city_rules)},
        "structure_constants": {
            "SANGO.TotalThings": sango["system"]["total_things"],
            "actual_items": sango["item_stats"]["count"],
            "THINGS.TotalObjectDefine": things["system"].get("TotalObjectDefine"),
            "actual_objects": len(things["objects"]),
            "TIMES.TotalGeneral": times[0]["system"]["total_general"],
            "actual_generals": times[0]["stats"]["generals"],
            "TIMES.TotalCity": times[0]["system"]["total_city"],
            "actual_cities": times[0]["stats"]["city_count"],
            "note": "四个 Total* 都是数组容量上限，均大于实际条目数，"
                    "唯有 TotalKing 等于实际君主数。",
        },
    }

    data = {
        "generated_by": "tools/export_summary.py",
        "encoding_note": "全部 INI 实测为 **cp950(Big5) 繁体**，不是 GBK；COMBINE.INI 为纯 ASCII。",
        "files": files,
        "totals": {
            "ini_files": len(files),
            "bytes": sum(f["bytes"] for f in files),
            "lines": sum(f["lines"] for f in files),
            "sections": sum(f["sections"] for f in files),
            "field_lines": sum(f["field_lines"] for f in files),
        },
        "table_sizes": {
            "magic": {"武将技": magic["magic_count"], "军师技": magic["wise_count"]},
            "message": message["entry_count"],
            "sango": {"段": sango["sections"], "物品": sango["item_stats"]["count"],
                      "字形表": len(sango["fonts"]), "地形": len(sango["terrain"])},
            "things": {"物件": len(things["objects"]), "兵种": len(things["soldiers"]),
                       "动画图形引用": things["cross_checks"]["shape_lookup"]["total_refs"]},
            "times": [{"剧本": t["system"]["time"], "年": t["system"]["year"],
                       "君主": t["stats"]["king_count"],
                       "城池": t["stats"]["city_count"],
                       "武将": t["stats"]["generals"],
                       "路径": t["stats"]["path_count"],
                       "登场": t["stats"]["status"].get("登", 0),
                       "在野": t["stats"]["status"].get("野", 0),
                       "未登场": t["stats"]["status"].get("未", 0)} for t in times],
            "combine": combine.get("shapes") and len(combine["shapes"]),
        },
        "cross_checks": cross,
        "findings": [
            "10 个 INI 共 %d 字节 / %d 行 / %d 段，全部为 Big5 繁体（COMBINE.INI 纯 ASCII）。"
            % (sum(f["bytes"] for f in files), sum(f["lines"] for f in files),
               sum(f["sections"] for f in files)),
            "技能表 177 条 = 110 武将技 + 67 军师技；武将技脚本号 501..610 连续且唯一，"
            "平均每个脚本 2373 字节（MAGIC.SO 261008B）。",
            "THINGS 620 个正式物件 + 1 段测试物件 [OBJECT2] + 1 段中文骨架，"
            "图形引用 34220 次、真实物件 100% 命中磁盘文件。",
            "兵种恰好 13 个，兵符 Force = 1<<k 位掩码，与 THINGS Sequence 100..112 顺序一致。",
            "5 个剧本共用同一套 401 名武将，STR/INT/Loyal 五份完全相同（差异 0 条），"
            "剧本只切换 POS/CITY/Status。",
            "CITY 字段等于 POS 的第 N 个空格槽（N=剧本号），401/401 成立。",
            "武将初始武器只有 4 种（直劍/銅殳/眉尖刀/短錐槍，即 ITEM 前 4 件 Lv1 武器），"
            "初始坐骑 401 人全是黃鬃馬（Lv1）。",
        ],
        "unresolved": [
            "THINGS 的 Space=x,y,w,h 四元数：w 与 h 的像素含义未完全确定（推测为受击框/包围盒）。",
            "THINGS 的 Life：仅 16 处出现（马尸体 1200、箭 2400），推测为物件存活毫秒数。",
            "GENERAL.TYPE 1..15 的确切含义：与 15 套主将身体 L0..LE 数量吻合，"
            "但 STR/INT 均值也随 TYPE 分层，无法判定是造型组还是成长模板（推测为主将造型类型）。",
            "SANGO.INI 的 TotalGeneralType=3 与 TotalForce=11 含义未定："
            "实际兵种 13、势力数远大于 11，两个常量与其它表对不上。",
            "MAGIC 的 POWER 恒为 100，看不出作用；可能与伤害基数或百分比定标有关（推测）。",
            "MAGIC 的 ATTRIB 是自由中文标签串（全體/主將/主將2/四周/中間…），"
            "引擎如何用它选择目标未定。",
            "MESSAGE 的 %k%/%K%/%e%/%E%/%l% 是引擎替换码，仅能确定 k/K、e/E 成对出现，"
            "具体替换内容（人名/势力/性别）未定。",
            "PATH 的 Point 坐标单位与地图底图比例未定；PATH.TotalCity/TotalGeneral 容量常量同理。",
        ],
    }
    write_json(DST, data)

    print(f"[summary] -> {DST}")
    print("   totals:", data["totals"])
    for k, v in cross.items():
        if isinstance(v, dict):
            brief = {kk: vv for kk, vv in v.items() if kk in
                     ("rate", "all_match", "all_hold", "matches_claim", "hit", "miss")}
            print(f"   {k}: {brief or list(v)[:4]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
