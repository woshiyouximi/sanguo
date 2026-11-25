#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 `game/data/garrison.json`：5 个剧本 × 60 城的守将表。

数据全部来自原作导出的两张表，**不新增任何设定**：

  scenarios.json  cities[]  
      NAME 城名 / KING 归属势力（"" = 无主）/ MAJOR 太守 / WISE 军师
      POPULATION 人口（只用来算守军数）
  generals.json   401 行
      NAME STR INT Loyal(少数行叫 LOYAL) 
      city_by_times[i]   第 i 个剧本（0..4）该将所在的城（"" = 未登场）
      status_by_times[i] 同剧本身份：登（在野可登用）/ 野（在野）/ 未（未登场）

派生规则：

  owner / major / wise  ← 城市字段原样搬过来（不再用 DEFENSE 代理）
  officers              ← 所有 city_by_times[i] == 城名 的武将（含野将），
                          按 STR+INT 降序全部收进来，不做截断
  garrison              ← min(floor(POPULATION / 2500) + 110, 600)
                          与 `game/web/deploy.html` 现有公式逐位一致

输出是紧凑 JSON（不留缩进）：这是运行时查表用的生成物，300 座城 + 1011 条
武将记录，带缩进会白白多出两三倍体积。校验信息全部打在 stdout。

用法（Windows 上没有 python 在 PATH 时用托管运行时）：
  python work/build_garrison.py
  python work/build_garrison.py --data game/data --out game/data/garrison.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 校验/展示用的知名城（第 1 个剧本）
FAMOUS = ("南皮", "平原", "洛陽")


def read_json(path: Path):
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def int_of(value, default: int = 0) -> int:
    """把 JSON 里的数字/字符串统一成 int；坏值退回 default（数据里有空字符串）。"""
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        text = value.strip()
        if text:
            try:
                return int(float(text))
            except ValueError:
                return default
    return default


def at(values, index: int) -> str:
    """取 `*_by_times[index]`；缺列/短数组/非字符串一律当空串。"""
    if isinstance(values, list) and 0 <= index < len(values):
        item = values[index]
        if isinstance(item, str):
            return item
    return ""


def text_of(value) -> str:
    """只收字符串。第 1 剧本有 12 个城的 KING 是数字 1..12（连续递增，
    看起来是转换残留而非势力名，也没有对应 kings[] 的可靠映射），当空处理；
    否则 UI 上会出现"勢力 1"这种东西。"""
    return value if isinstance(value, str) else ""


def loyal_of(general: dict) -> int:
    """401 行里 400 行是数字 `Loyal`，只有「盜賊」一行是字符串 `LOYAL: ""`。"""
    if "Loyal" in general:
        return int_of(general.get("Loyal"))
    return int_of(general.get("LOYAL"))


def garrison_of(population) -> int:
    """守军数：沿用 deploy.html 第 148 行的 `min(floor(POP/2500)+110, 600)`。"""
    return min(int_of(population) // 2500 + 110, 600)


def build(data_dir: Path):
    scenarios = read_json(data_dir / "scenarios.json")
    generals = read_json(data_dir / "generals.json")
    if not isinstance(scenarios, list) or not scenarios:
        raise SystemExit(f"{data_dir / 'scenarios.json'} 不是非空数组")
    if not isinstance(generals, list) or not generals:
        raise SystemExit(f"{data_dir / 'generals.json'} 不是非空数组")

    table = []
    stats = []
    for i, scenario in enumerate(scenarios):
        cities = scenario.get("cities") or []
        if not isinstance(cities, list):
            raise SystemExit(f"剧本 {i} 的 cities 不是数组")

        # 先把武将按城分桶，避免 O(城×将) 的重复扫描
        buckets: dict[str, list[dict]] = {}
        for general in generals:
            name = at(general.get("city_by_times"), i)
            if name:
                buckets.setdefault(name, []).append(general)

        out_cities: dict[str, dict] = {}
        for city in cities:
            if not isinstance(city, dict):
                continue
            name = city.get("NAME")
            if not isinstance(name, str) or not name or name in out_cities:
                continue

            officers = []
            for general in buckets.get(name, []):
                officers.append({
                    "name": str(general.get("NAME") or ""),
                    "str": int_of(general.get("STR")),
                    "int": int_of(general.get("INT")),
                    "loyal": loyal_of(general),
                    "status": at(general.get("status_by_times"), i),
                })
            # STR+INT 降序；同分按名字定序，保证同一份输入每次生成字节一致
            officers.sort(key=lambda o: (-(o["str"] + o["int"]), o["name"]))

            out_cities[name] = {
                "owner": text_of(city.get("KING")),
                "major": text_of(city.get("MAJOR")),
                "wise": text_of(city.get("WISE")),
                "officers": officers,
                "garrison": garrison_of(city.get("POPULATION")),
            }

        table.append({"scenario": i, "cities": out_cities})
        stats.append((i, len(cities), out_cities, buckets))

    return table, stats, generals


def report(table, stats, generals) -> None:
    print("=" * 78)
    print("garrison.json 生成完毕")
    print("=" * 78)
    total_officers = 0
    union_names = set()
    for i, raw_cities, cities, buckets in stats:
        with_officers = sum(1 for c in cities.values() if c["officers"])
        empty = len(cities) - with_officers
        assigned = sum(len(c["officers"]) for c in cities.values())
        owned = sum(1 for c in cities.values() if c["owner"])
        majors = sum(1 for c in cities.values() if c["major"])
        wises = sum(1 for c in cities.values() if c["wise"])
        total_officers += assigned
        for c in cities.values():
            union_names.update(o["name"] for o in c["officers"])
        print(
            f"剧本 {i}: 城 {len(cities)}（原表 {raw_cities}）"
            f" · 有将城 {with_officers} / 空城 {empty}"
            f" · 武将记录 {assigned}"
            f" · owner 非空 {owned} · major 非空 {majors} · wise 非空 {wises}"
        )

    print("-" * 78)
    print(f"武将记录合计 {total_officers}；跨剧本去重后 {len(union_names)} 名"
          f"（generals.json 共 {len(generals)} 行，其中「盜賊」没有 city_by_times 故永不入城）")

    # ---- 一致性断言（任何一条不成立都说明上游数据/本脚本出错，直接退出） ----
    problems = []
    for entry in table:
        i = entry["scenario"]
        for city_name, city in entry["cities"].items():
            names = [o["name"] for o in city["officers"]]
            if city["major"] and city["major"] not in names:
                problems.append(f"剧本{i} {city_name}: 太守 {city['major']} 不在守将名单")
            if city["wise"] and city["wise"] not in names:
                problems.append(f"剧本{i} {city_name}: 军师 {city['wise']} 不在守将名单")
            sums = [o["str"] + o["int"] for o in city["officers"]]
            if sums != sorted(sums, reverse=True):
                problems.append(f"剧本{i} {city_name}: 守将未按 STR+INT 降序")
            if not isinstance(city["garrison"], int) or city["garrison"] < 0:
                problems.append(f"剧本{i} {city_name}: garrison 非法 {city['garrison']!r}")
    if problems:
        print("\n".join(problems[:20]), file=sys.stderr)
        raise SystemExit(f"校验失败：{len(problems)} 处")

    # ---- 前 3 个知名城（第 1 剧本）的完整守将名单 ----
    print("-" * 78)
    first = table[0]["cities"]
    for city_name in FAMOUS:
        city = first.get(city_name)
        if not city:
            print(f"{city_name}: 第 1 剧本无此城")
            continue
        roster = "、".join(
            f"{o['name']}({o['str']}+{o['int']}|{o['status']})" for o in city["officers"]
        ) or "（无将）"
        print(f"{city_name} · 勢力「{city['owner'] or '無主'}」 · 太守「{city['major'] or '—'}」"
              f" · 軍師「{city['wise'] or '—'}」 · 守軍 {city['garrison']}")
        print(f"  守將 {len(city['officers'])} 人：{roster}")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="生成 game/data/garrison.json")
    parser.add_argument("--data", default=str(ROOT / "game" / "data"), help="数据目录")
    parser.add_argument("--out", default=str(ROOT / "game" / "data" / "garrison.json"),
                        help="输出文件")
    args = parser.parse_args(argv)

    data_dir = Path(args.data)
    out_path = Path(args.out)
    table, stats, generals = build(data_dir)
    report(table, stats, generals)

    text = json.dumps(table, ensure_ascii=False, separators=(",", ":"))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(text, encoding="utf-8")
    size = out_path.stat().st_size
    print("-" * 78)
    print(f"写入 {out_path} · {size} 字节（{size / 1024:.1f} KiB）· {len(table)} 个剧本")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
