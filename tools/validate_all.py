# -*- coding: utf-8 -*-
"""回归闸门：一次性校验 data\\*.json 与立绘入库的已知不变量。

用法：
    python tools\\validate_all.py            # 跑全部检查
    python tools\\validate_all.py --quiet    # 只写报告文件，不逐行打印

退出码：
    0 = 全部 PASS（可以有 WARN）
    2 = 至少一条 FAIL

输出：
    stdout 逐行 <PASS|FAIL|WARN> <项> <数值>
    F:\\sanguo\\work\\validate_report.txt 同内容

设计约定（重要）：
  1) 本脚本**只读** data/ 与 assets/，绝不写回数据。发现不符一律如实 FAIL，
     不允许为了"让闸门变绿"去改数据——改数据是 import_legacy.py 的事。
  2) 单值字段在 JSON 里可能是**标量**也可能是**长度 1 的数组**（历史遗留），
     统计"对数"时必须用 rows() 归一化：标量算 1 行。这不算迁就数据，
     而是"字段出现次数"的唯一正确读法；类型不一致本身另有 WARN 项记录。
"""
from __future__ import annotations

import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
WORK = os.path.join(ROOT, "work")
REPORT = os.path.join(WORK, "validate_report.txt")
HERO_DIRS = [
    os.path.join(ROOT, "proto", "ui", "assets", "hero"),
    os.path.join(ROOT, "game", "web", "assets", "hero"),
]
HERO_TARGET = 400          # SHAPE\\FACE 下 400 个立绘
EXPECT_GENERALS = 401      # 含首段 "盜賊" 模板
EXPECT_SKILL_PAIRS = 2061
EXPECT_WISE_PAIRS = 1567
EXPECT_MAGICS = 110
EXPECT_WISES = 67
EXPECT_ITEMS = 77
EXPECT_TERRAINS = 12
EXPECT_SCENARIOS = 5
EXPECT_CITIES = 60
EXPECT_PATHS = 116

RESULT = []                # [(status, item, detail)]
QUIET = "--quiet" in sys.argv


def emit(status: str, item: str, detail) -> None:
    RESULT.append((status, item, str(detail)))
    if not QUIET:
        try:
            print(f"{status} {item} {detail}")
        except UnicodeEncodeError:            # 极端终端
            print(f"{status} {item} {str(detail).encode('ascii', 'replace').decode()}")


def check(status: str, item: str, ok: bool, expect, actual) -> bool:
    """条件式记录：ok → PASS，否则 FAIL；返回 ok 便于串联。"""
    emit("PASS" if ok else "FAIL", item, f"expected={expect} actual={actual}")
    return ok


def warn(item: str, detail) -> None:
    emit("WARN", item, detail)


def load(name: str):
    path = os.path.join(DATA, name)
    with open(path, "r", encoding="utf-8") as fp:
        return json.load(fp)


def rows(value) -> int:
    """字段出现次数：标量算 1 行，数组算 len。"""
    if value is None:
        return 0
    if isinstance(value, str):
        return 1 if value.strip() else 0
    if isinstance(value, (list, tuple)):
        return len(value)
    return 1


def as_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    return list(value)


def lead_int(text) -> int:
    """'1, 50' → 1（习得等级）。"""
    return int(str(text).split(",")[0].strip())


# ---------------------------------------------------------------- generals
def check_generals() -> None:
    G = load("generals.json")
    check("count", "generals.count", len(G) == EXPECT_GENERALS, EXPECT_GENERALS, len(G))

    names = [g["NAME"] for g in G]
    check("count", "generals.name_unique", len(set(names)) == len(names),
          len(names), len(set(names)))
    check("count", "generals.template", "盜賊" in names, "盜賊 present",
          "盜賊" if "盜賊" in names else "missing")

    index = {}
    for g in G:
        index.setdefault(g["NAME"], g)

    gy = index.get("關羽")
    if gy is None:
        emit("FAIL", "generals.關羽.skill", "expected=%d actual=将军不存在" % 8)
        emit("FAIL", "generals.關羽.wise", "expected=%d actual=将军不存在" % 7)
    else:
        check("count", "generals.關羽.skill", rows(gy["SKILL"]) == 8, 8, rows(gy["SKILL"]))
        check("count", "generals.關羽.wise", rows(gy["WISESKILL"]) == 7, 7,
              rows(gy["WISESKILL"]))

    skill_total = sum(rows(g.get("SKILL")) for g in G)
    wise_total = sum(rows(g.get("WISESKILL")) for g in G)
    check("count", "generals.skill.pairs", skill_total == EXPECT_SKILL_PAIRS,
          EXPECT_SKILL_PAIRS, skill_total)
    check("count", "generals.wise.pairs", wise_total == EXPECT_WISE_PAIRS,
          EXPECT_WISE_PAIRS, wise_total)

    # 习得等级非降序（全库，逐将）
    bad = []
    for g in G:
        levels = [lead_int(x) for x in as_list(g.get("SKILL"))]
        if levels != sorted(levels):
            bad.append(g["NAME"])
    check("order", "generals.skill.level_monotonic", not bad,
          "%d 人全单调" % len(G), "%d 人乱序 %s" % (len(bad), bad[:5]))

    # 类型一致性（历史上曾出现"单行写成标量"的字段）
    scalar_wise = [g["NAME"] for g in G if isinstance(g.get("WISESKILL"), str)]
    scalar_skill = [g["NAME"] for g in G if isinstance(g.get("SKILL"), str)]
    if scalar_wise or scalar_skill:
        warn("generals.field_type",
             "WISESKILL 标量 %d 人、SKILL 标量 %d 人（同一表两种类型，"
             "消费方需按标量=1 行处理；建议 import_legacy.py 统一输出数组）"
             % (len(scalar_wise), len(scalar_skill)))
    else:
        emit("PASS", "generals.field_type", "SKILL/WISESKILL 全部为数组")


# ----------------------------------------------------------------- magics
def check_magics() -> None:
    M = load("magics.json")
    check("count", "magics.count", len(M) == EXPECT_MAGICS, EXPECT_MAGICS, len(M))

    scripts = [int(m["SCRIPT"]) for m in M]
    lo, hi = 501, 610
    out_of_range = [s for s in scripts if not (lo <= s <= hi)]
    check("range", "magics.script.range", not out_of_range,
          "%d..%d" % (lo, hi), "越界 %s" % out_of_range[:5] if out_of_range else "全部在内")
    check("unique", "magics.script.unique", len(set(scripts)) == len(scripts),
          len(scripts), len(set(scripts)))

    missing = [m.get("NAME") or m.get("SEQUENCE") for m in M if not str(m.get("fx_dir") or "").strip()]
    check("field", "magics.fx_dir", not missing, len(M), "%d 条缺 fx_dir %s" % (len(missing), missing[:5]))

    seq = sorted(int(m["SEQUENCE"]) for m in M)
    check("order", "magics.sequence", seq == list(range(1, len(M) + 1)),
          "1..%d" % len(M), "%s..%s" % (seq[0], seq[-1]))


def check_simple_tables() -> None:
    for fname, key, expect in (
        ("wises.json", "wises.count", EXPECT_WISES),
        ("items.json", "items.count", EXPECT_ITEMS),
        ("terrains.json", "terrains.count", EXPECT_TERRAINS),
    ):
        try:
            n = len(load(fname))
        except Exception as exc:                       # noqa: BLE001
            emit("FAIL", key, "expected=%d actual=读取失败 %s" % (expect, exc))
            continue
        check("count", key, n == expect, expect, n)


# -------------------------------------------------------------- scenarios
def check_scenarios() -> None:
    S = load("scenarios.json")
    check("count", "scenarios.count", len(S) == EXPECT_SCENARIOS, EXPECT_SCENARIOS, len(S))

    cities = [len(s["cities"]) for s in S]
    paths = [len(s["paths"]) for s in S]
    kings = [len(s["kings"]) for s in S]
    check("count", "scenarios.cities",
          all(c == EXPECT_CITIES for c in cities), "5×%d" % EXPECT_CITIES, cities)
    check("count", "scenarios.paths",
          all(p == EXPECT_PATHS for p in paths), "5×%d" % EXPECT_PATHS, paths)
    emit("PASS", "scenarios.kings", "每剧本君主数 %s" % kings)

    ids = [s.get("id") for s in S]
    check("unique", "scenarios.ids", sorted(ids) == list(range(1, len(S) + 1)),
          "1..%d" % len(S), ids)


# ---------------------------------------------------------------- matrices
def check_antisymmetric(fname: str, item: str, expect_n: int) -> None:
    T = load(fname)
    names = T["names"]
    rows_ = [r["vs"] for r in T["matrix"]]
    n = len(names)
    ok_n = (n == expect_n and len(rows_) == expect_n)
    check("shape", item + ".shape", ok_n,
          "%d×%d" % (expect_n, expect_n), "%d names × %d rows" % (n, len(rows_)))
    if not ok_n:
        return

    square = all(len(r) == n for r in rows_)
    check("shape", item + ".square", square, "%d 列" % n,
          "行长 %s" % sorted({len(r) for r in rows_}))

    diag = [rows_[i][i] for i in range(n) if i < len(rows_[i])]
    check("antisym", item + ".diag_zero", all(v == 0 for v in diag), "全 0", diag)

    bad = []
    for i in range(n):
        for j in range(n):
            if i < len(rows_) and j < len(rows_[i]) and rows_[i][j] + rows_[j][i] != 0:
                bad.append((names[i], names[j], rows_[i][j], rows_[j][i]))
    check("antisym", item + ".matrix", not bad, "[i][j]+[j][i]==0",
          "%d 处不符 %s" % (len(bad), bad[:3]))

    flat = [abs(v) for r in rows_ for v in r]
    emit("PASS", item + ".maxabs", "max|v|=%d，%d 个非零" % (max(flat), sum(1 for v in flat if v)))


def check_formations_slots() -> None:
    F = load("formations.json")
    slots = F["slots"]
    check("count", "formations.slots", len(slots) == 11, 11, len(slots))

    bad200 = [s.get("name") or s.get("a") for s in slots if len(s["fill"]["200"]) != 200]
    bad100 = [s.get("name") or s.get("a") for s in slots if len(s["fill"]["100"]) != 100]
    check("fill", "formations.fill200", not bad200, "11×200", "%d 个不合 %s" % (len(bad200), bad200[:3]))
    check("fill", "formations.fill100", not bad100, "11×100", "%d 个不合 %s" % (len(bad100), bad100[:3]))

    keys = sorted({k for s in slots for k in s["fill"]}, key=int)
    emit("PASS", "formations.fill_keys", "档位 %s" % keys)


# -------------------------------------------------------------------- hero
def check_hero() -> None:
    names = {g["NAME"] for g in load("generals.json")}
    for folder in HERO_DIRS:
        label = os.path.relpath(folder, ROOT).replace("\\", "/")
        if not os.path.isdir(folder):
            emit("FAIL", "hero." + label, "expected=目录存在 actual=缺失")
            continue
        files = sorted(glob.glob(os.path.join(folder, "*.png")))
        stems = [os.path.splitext(os.path.basename(p))[0] for p in files]
        unknown = [s for s in stems if s not in names]
        check("cover", "hero." + label + ".names", not unknown,
              "%d 个文件名都在 generals.NAME 里" % len(stems),
              "%d 个未知 %s" % (len(unknown), unknown[:5]))
        n = len(stems)
        detail = "覆盖 %d/%d = %.1f%%" % (n, HERO_TARGET, 100.0 * n / HERO_TARGET)
        if n >= HERO_TARGET:
            emit("PASS", "hero." + label + ".coverage", detail)
        else:
            warn("hero." + label + ".coverage", detail + "（未达标，不阻断闸门）")


# -------------------------------------------------------------------- main
def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:                                  # noqa: BLE001
        pass

    for step in (check_generals, check_magics, check_simple_tables,
                 check_scenarios,
                 lambda: check_antisymmetric("troops.json", "troops", 13),
                 lambda: check_antisymmetric("formations.json", "formations", 9),
                 check_formations_slots, check_hero):
        try:
            step()
        except FileNotFoundError as exc:
            emit("FAIL", getattr(step, "__name__", "step"), "expected=数据文件存在 actual=%s" % exc)
        except Exception as exc:                       # noqa: BLE001
            emit("FAIL", getattr(step, "__name__", "step"),
                 "expected=检查可运行 actual=%s: %s" % (type(exc).__name__, exc))

    n_pass = sum(1 for r in RESULT if r[0] == "PASS")
    n_fail = sum(1 for r in RESULT if r[0] == "FAIL")
    n_warn = sum(1 for r in RESULT if r[0] == "WARN")
    summary = "SUM pass=%d fail=%d warn=%d" % (n_pass, n_fail, n_warn)
    RESULT.append(("SUM", "total", "pass=%d fail=%d warn=%d" % (n_pass, n_fail, n_warn)))

    os.makedirs(WORK, exist_ok=True)
    with open(REPORT, "w", encoding="utf-8", newline="\n") as fp:
        for status, item, detail in RESULT:
            if status == "SUM":
                fp.write(summary + "\n")
            else:
                fp.write("%s %s %s\n" % (status, item, detail))

    print(summary)
    print("报告：%s" % REPORT)
    return 2 if n_fail else 0


if __name__ == "__main__":
    sys.exit(main())
