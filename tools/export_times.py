# -*- coding: utf-8 -*-
r"""TIMES1..5.INI -> extract/json/times1.json ... times5.json

五份剧本表结构完全相同（[SYSTEM] x1 + [KING01..NN] + [CITY01..60] +
[PATH001..116] + [GENERAL] x401）。核心规律（有数值佐证，见 docs/03c）：

1. GENERAL 段名一律是裸 `[GENERAL]`，没有编号，靠 SEQUENCE 区分。

2. POS 是**5 个空格分隔的城池名槽位**，依次对应剧本 1..5；运行时读哪一个由
   剧本号决定。CITY 字段就是"当前剧本那一个槽"。已用曹操/劉備/孫堅 三人
   逐剧本核对（data.cross_checks.city_equals_pos 计数 = 401/401）。

3. Status 三态：登=已登场、野=在野、未=未登场（"未"同时出现在 POS 里，
   CITY 留空）。逐剧本登场人数 = Status=登 的条数。

4. TotalGeneral(512) / TotalCity(64) 在五份文件里是常量，而实存 401 / 60，
   说明它们是数组容量上限；TotalKing 才是真计数（15/19/9/9/6）。

5. 同一武将的 STR/INT/Loyal 等属性在五个剧本里完全一致 —— 剧本只切换
   POS/CITY/Status，不改变人物数值。
"""

from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse_ini import IniFile, write_json                 # noqa: E402
from tables_common import PAK, OUT, SHAPE, get_ci, dist, dist_text  # noqa: E402

TIMES = [(i, os.path.join(PAK, f"TIMES{i}.INI"), os.path.join(OUT, f"times{i}.json"))
         for i in range(1, 6)]

NUM_FIELDS = ["STR", "INT", "BaseHP", "BaseMP", "Loyal", "Spirit", "BaseEXP",
              "CONSTANCY", "TYPE"]


def parse_pairs(sec, key):
    """SKILL / WISESKILL 是重复键，值是 "等级,编号"。"""
    out = []
    for v in sec.getall(key):
        nums = [int(x) for x in re.findall(r"\d+", v)]
        if len(nums) >= 2:
            out.append({"level": nums[0], "id": nums[1]})
    return out


def face_paths():
    d = os.path.join(SHAPE, "FACE")
    if not os.path.isdir(d):
        return {}
    return {fn.upper(): os.path.join(d, fn) for fn in os.listdir(d)}


def main() -> int:
    faces = face_paths()
    summary = []
    for idx, src, dst in TIMES:
        ini = IniFile.load(src)
        st = ini.stats()
        sysd = {k: v for k, v, _l in ini.get("SYSTEM").fields}
        n = lambda k: ini.get("SYSTEM").num(k)  # noqa: E731

        kings = []
        for sec in ini.sections:
            if not re.match(r"^KING\d+$", sec.name.upper()):
                continue
            kings.append({
                "index": int(re.sub(r"\D", "", sec.name)),
                "section": sec.name,
                "lineno": sec.lineno,
                "name": get_ci(sec, "Name") or "",
                "flag_num": sec.num("FLAGNUM"),
                "select": sec.num("SELECT"),
                "type": sec.num("Type"),
            })

        cities = []
        for sec in ini.sections:
            if not re.match(r"^CITY\d+$", sec.name.upper()):
                continue
            pos = (get_ci(sec, "POS") or "").split()
            fpos = (get_ci(sec, "FLAGPOS") or "").split()
            cities.append({
                "index": int(re.sub(r"\D", "", sec.name)),
                "section": sec.name,
                "lineno": sec.lineno,
                "name": get_ci(sec, "Name") or "",
                "king": get_ci(sec, "KING") or "",
                "major": get_ci(sec, "MAJOR") or "",
                "wise": get_ci(sec, "WISE") or "",
                "population": sec.num("POPULATION"),
                "defense": sec.num("DEFENSE"),
                "money": sec.num("MONEY"),
                "pos": [int(x) for x in pos] if pos else [],
                "flag_pos": [int(x) for x in fpos] if fpos else [],
                "rate": sec.num("RATE"),
                "flags": sec.num("FLAGS"),
                "is_empty": not (get_ci(sec, "KING") or "").strip(),
            })

        paths = []
        for sec in ini.sections:
            if not re.match(r"^PATH\d+$", sec.name.upper()):
                continue
            pts = []
            for v in sec.getall("Point"):
                pts.append([int(x) for x in re.findall(r"-?\d+", v)])
            paths.append({
                "index": int(re.sub(r"\D", "", sec.name)),
                "start": get_ci(sec, "Start") or "",
                "end": get_ci(sec, "End") or "",
                "length": sec.num("Length"),
                "points": pts,
            })

        generals = []
        face_hit = face_miss = 0
        city_eq_pos = city_ne_pos = 0
        for sec in ini.sections:
            if sec.name.upper() != "GENERAL":
                continue
            face = (get_ci(sec, "FACE") or "").strip()
            key = os.path.basename(face.replace("/", "\\")).upper()
            if key and not key.endswith(".SHP"):
                key += ".SHP"
            face_ok = key in faces if key else None
            if face_ok is True:
                face_hit += 1
            elif face_ok is False:
                face_miss += 1

            pos = (get_ci(sec, "POS") or "").split()
            city = (get_ci(sec, "CITY") or "").strip()
            if len(pos) >= idx:
                if city == pos[idx - 1]:
                    city_eq_pos += 1
                else:
                    city_ne_pos += 1

            g = {
                "seq": sec.num("SEQUENCE"),
                "lineno": sec.lineno,
                "keys": [k for k, _v, _l in sec.fields],
                "name": get_ci(sec, "Name") or "",
                "face": face,
                "face_file_exists": face_ok,
                "pos": pos,
                "city": city,
                "status": (get_ci(sec, "Status") or "").strip(),
                "weapon": get_ci(sec, "Weapon") or "",
                "horse": get_ci(sec, "Horse") or "",
                "thing": get_ci(sec, "Thing") or "",
                "battle_array": (get_ci(sec, "BattleArray") or "").split(),
                "use_battle_array": get_ci(sec, "UseBattleArray") or "",
                "force": (get_ci(sec, "Force") or "").split(),
                "use_force": get_ci(sec, "UseForce") or "",
                "loyal_king": get_ci(sec, "LoyalKing") or "",
                "blood": get_ci(sec, "BLOOD") or "",
                "flags_raw": get_ci(sec, "FLAGS") or "",
                "skills": parse_pairs(sec, "SKILL"),
                "wise_skills": parse_pairs(sec, "WISESKILL"),
            }
            g["str"] = sec.num("STR")
            g["int"] = sec.num("INT")
            g["max_hp"] = sec.num("BaseHP")
            g["max_mp"] = sec.num("BaseMP")
            g["loyal"] = sec.num("Loyal")
            g["spirit"] = sec.num("Spirit")
            g["base_exp"] = sec.num("BaseEXP")
            g["constancy"] = sec.num("CONSTANCY")
            g["type"] = sec.num("TYPE")
            if sec.num("SEQUENCE") is None:   # 只有首段(盜賊)没有 SEQUENCE，走旧式键
                # 首段(盜賊)的特殊键，单独保留
                g["legacy_skill"] = get_ci(sec, "Skill")
                for k in ("LOYAL", "SKILLLEVEL1", "SKILLLEVEL2", "SKILLLEVEL3",
                          "SKILLLEVEL4"):
                    if get_ci(sec, k) is not None:
                        g[k.lower()] = get_ci(sec, k)
            generals.append(g)

        # ---- 统计 ----
        from collections import Counter
        st_counts = Counter(g["status"] for g in generals)
        status_map = dict(st_counts.most_common())
        by_city = {}
        for g in generals:
            if g["city"]:
                by_city[g["city"]] = by_city.get(g["city"], 0) + 1
        strength = {g["name"]: (g["str"] or 0) + (g["int"] or 0) for g in generals}

        data = {
            "source": os.path.basename(src),
            "times_index": idx,
            "bytes": st["bytes"],
            "encoding": st["encoding"],
            "lines": st["lines"],
            "sections": st["sections"],
            "section_groups": st["section_groups"],
            "system": {
                "raw": sysd,
                "time": sysd.get("TIME", ""),
                "year": n("YEAR"),
                "total_king": n("TotalKing"),
                "total_general": n("TotalGeneral"),
                "total_city": n("TotalCity"),
                "actual_kings": len(kings),
                "actual_cities": len(cities),
                "actual_generals": len(generals),
                "actual_paths": len(paths),
            },
            "kings": kings,
            "cities": cities,
            "paths": paths,
            "generals": generals,
            "stats": {
                "generals": len(generals),
                "status": status_map,
                "king_count": len(kings),
                "city_count": len(cities),
                "path_count": len(paths),
                "empty_cities": sum(1 for c in cities if c["is_empty"]),
                "city_population": dist([c["population"] for c in cities]),
                "city_defense": dist([c["defense"] for c in cities]),
                "city_money": dist([c["money"] for c in cities]),
                "city_rate": dist([c["rate"] for c in cities]),
                "city_flags": dist([c["flags"] for c in cities]),
                "path_length": dist([p["length"] for p in paths]),
                "str": dist([g["str"] for g in generals]),
                "int": dist([g["int"] for g in generals]),
                "loyal": dist([g["loyal"] for g in generals]),
                "max_hp": dist([g["max_hp"] for g in generals]),
                "max_mp": dist([g["max_mp"] for g in generals]),
                "spirit": dist([g["spirit"] for g in generals]),
                "base_exp": dist([g["base_exp"] for g in generals]),
                "constancy": dist([g["constancy"] for g in generals]),
                "type": dist([g["type"] for g in generals]),
                "weapons": dist_text([g["weapon"] for g in generals]),
                "horses": dist_text([g["horse"] for g in generals]),
                "things": dist_text([g["thing"] for g in generals if g["thing"]]),
                "use_force": dist_text([g["use_force"] for g in generals]),
                "use_battle_array": dist_text([g["use_battle_array"] for g in generals]),
                "force_tokens": dist_text([t for g in generals for t in g["force"]]),
                "battle_array_tokens": dist_text([t for g in generals for t in g["battle_array"]]),
                "skill_rows": sum(len(g["skills"]) for g in generals),
                "wise_skill_rows": sum(len(g["wise_skills"]) for g in generals),
                "skills_per_general": dist([len(g["skills"]) for g in generals]),
                "wise_skills_per_general": dist([len(g["wise_skills"]) for g in generals]),
                "generals_per_city": dict(sorted(by_city.items(), key=lambda x: -x[1])[:40]),
                "top_strength": sorted(strength.items(), key=lambda x: -x[1])[:20],
            },
            "cross_checks": {
                "face_files": len(faces),
                "face_hit": face_hit,
                "face_miss": face_miss,
                "face_rate": round(face_hit / (face_hit + face_miss), 4)
                if (face_hit + face_miss) else None,
                "city_equals_pos_slot": city_eq_pos,
                "city_differs_from_pos_slot": city_ne_pos,
            },
        }
        write_json(dst, data)
        summary.append((idx, data))

        print(f"[times{idx}] {data['system']['time']} {data['system']['year']} "
              f"kings={len(kings)}/{n('TotalKing')} cities={len(cities)} "
              f"generals={len(generals)} paths={len(paths)} -> {os.path.basename(dst)}")
        print(f"   status={status_map} empty_cities={data['stats']['empty_cities']} "
              f"face_hit={face_hit} miss={face_miss} city==pos={city_eq_pos} "
              f"ne={city_ne_pos}")
        print(f"   force_tokens={data['stats']['force_tokens']['top']}")
        print(f"   weapons={data['stats']['weapons']['top'][:6]}")

    # 五剧本横向对照
    print("\n== 五剧本对照 ==")
    names = None
    for idx, d in summary:
        print(f"  T{idx} {d['system']['time']:6s} year={d['system']['year']} "
              f"king={d['stats']['king_count']:2d} city={d['stats']['city_count']} "
              f"gen={d['stats']['generals']} 登={d['stats']['status'].get('登', 0):3d} "
              f"野={d['stats']['status'].get('野', 0):3d} "
              f"未={d['stats']['status'].get('未', 0):3d}")
    base = summary[0][1]["generals"]
    for idx, d in summary[1:]:
        diff = [(a["name"], a["str"], b["str"], a["int"], b["int"], a["loyal"], b["loyal"])
                for a, b in zip(base, d["generals"])
                if (a["str"], a["int"], a["loyal"]) != (b["str"], b["int"], b["loyal"])]
        print(f"  T1 vs T{idx}: 属性不同的武将 = {len(diff)} {diff[:3]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
