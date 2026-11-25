"""把原作数据（10 个 INI + 宝典 XLS）导成游戏用 JSON —— M0-4「数据管线」。

设计原则（与 `project/04_技术方案_Cocos.md` §5 一致）：
  1. **1:1 导出**：字段名保持 INI 原样（`POWER` / `ATTACK` / `BATTLEARRAY` …），只做类型转换与分组；
  2. **可重跑**：同输入必得同输出（键按固定顺序，浮点统一 3 位），生成完写 `meta.json` 记 sha1；
  3. **不改原作**：`extract/` 只读，产物只写 `data/`；
  4. **断言而非静默**：条数不符直接报错（`--strict`），别让"少了 3 个武将"流到客户端。

用法：
    python tools/import_legacy.py                # 导出到 F:\\sanguo\\data
    python tools/import_legacy.py --out data --strict
    python tools/import_legacy.py --check        # 只跑对拍，不写文件
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys

SRC = r"F:\sanguo\extract\pak"
XLSDIR = r"F:\sanguo\extract\json"
DEFAULT_OUT = r"F:\sanguo\data"

# 期望条数：来自 docs/03 的实测值。对不上就说明导出逻辑或输入变了。
EXPECT = {
    "cities": 60,        # TIMES1 [CITY01..60]（SYSTEM 里 TotalCity=64 是容量）
    "paths": 116,        # [PATH001..118] 有缺号
    "kings": 15,         # [KING01..15]
    "generals": 401,     # 全部名为 [GENERAL]，含 1 个盜賊模板
    "magics": 110,       # MAGIC.INI [MAGIC]
    "wises": 67,         # MAGIC.INI [WISE]
    "items": 77,         # SANGO.INI [ITEM]
    "terrains": 12,      # SANGO.INI [TERRAIN]
    "troops": 13,        # 宝典 兵种 sheet 的表头（A..M）
    "formations": 9,     # 宝典 阵形 sheet
}

SECTION_RE = re.compile(r"^\s*\[([^\]]+)\]\s*$")
NUM_RE = re.compile(r"^-?\d+$")
FLOAT_RE = re.compile(r"^-?\d+\.\d+$")


# ------------------------------------------------------------------ INI
def read_ini(path):
    """返回 ([(section_name, {key: raw_value})], system_meta)。编码 cp950。"""
    with open(path, "rb") as f:
        text = f.read().decode("cp950", "replace")
    out, cur = [], None
    for line in text.splitlines():
        m = SECTION_RE.match(line)
        if m:
            cur = {"_section": m.group(1).strip(), "_keys": {}}
            out.append(cur)
            continue
        if cur is None or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        if not k:
            continue
        v = v.strip()
        # 同名键必须累积：TIMES*.INI 里 SKILL= / WISESKILL= 会重复 1~8 行，
        # 早期用 dict 直接赋值会被后一行覆盖，只剩最后一对（401 将全变 1 个技能）。
        if k in cur["_keys"]:
            old = cur["_keys"][k]
            if isinstance(old, list):
                old.append(v)
            else:
                cur["_keys"][k] = [old, v]
        else:
            cur["_keys"][k] = v
    return out


def as_list(v):
    """多值键统一成 list（单值也包一层），供 SKILL/WISESKILL 之类使用。"""
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def as_multi(v):
    """多值字段 → 字符串数组：重复键累积成 list 原样保留，单值包一层，空值给 []。

    形状约定见 project/08 §9.5：**任何可能多值的字段都必须是数组**，
    1 条也给 `[x]`，0 条给 `[]`，不许退化成标量。
    历史 bug：重复键只出现 1 行时 coerce() 返回字符串，导致 102 人的
    `WISESKILL` 是 `"1, 5"` 而不是 `["1, 5"]`，消费方要判类型。
    """
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x) for x in v]
    s = str(v).strip()
    return [s] if s else []


def split_tokens(v):
    """空格分隔的多值串 → 数组：`'圓 玄'` → `['圓','玄']`，`''` → `[]`。"""
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x) for x in v if str(x).strip()]
    return [t for t in str(v).split() if t]


def coerce(v):
    """字符串 → int / float / str。'1108 90' 这类坐标保持字符串，由上层拆。
    重复键（list）逐项 coerce，保持与单值同样的类型规则。"""
    if isinstance(v, list):
        return [coerce(x) for x in v]
    if v is None:
        return None
    s = str(v).strip()
    if s == "":
        return ""
    if NUM_RE.match(s):
        try:
            return int(s)
        except ValueError:
            return s
    if FLOAT_RE.match(s):
        try:
            return round(float(s), 3)
        except ValueError:
            return s
    return s


def rows_of(sections):
    return [{k: coerce(v) for k, v in s["_keys"].items()} for s in sections]


def split_xy(s):
    """'1108 90' / '1108,90' → [1108, 90]，失败返回 None。"""
    if not isinstance(s, str):
        return None
    parts = re.split(r"[,\s]+", s.strip())
    parts = [p for p in parts if p]
    if len(parts) < 2:
        return None
    try:
        return [int(parts[0]), int(parts[1])]
    except ValueError:
        return None


# ------------------------------------------------------------------ 各表
def build_times():
    """5 个剧本：城市、武将站位、君主、路径。返回 dict。"""
    scenarios = []
    for i in range(1, 6):
        p = os.path.join(SRC, "TIMES%d.INI" % i)
        if not os.path.exists(p):
            continue
        secs = read_ini(p)
        sys_kv = {}
        cities, kings, generals, paths = [], [], [], []
        for s in secs:
            name = s["_section"].upper()
            kv = s["_keys"]
            if name == "SYSTEM":
                sys_kv = {k: coerce(v) for k, v in kv.items()}
            elif name.startswith("KING"):
                d = {k: coerce(v) for k, v in kv.items()}
                d["_index"] = int(re.sub(r"\D", "", name) or 0)
                kings.append(d)
            elif name.startswith("CITY"):
                d = {k: coerce(v) for k, v in kv.items()}
                d["_index"] = int(re.sub(r"\D", "", name) or 0)
                d["pos_xy"] = split_xy(kv.get("POS", ""))
                d["flagpos_xy"] = split_xy(kv.get("FLAGPOS", ""))
                # 坐标也是多值（x, y）：统一成数组，pos_xy/flagpos_xy 作为旧别名保留
                d["POS"] = list(d["pos_xy"] or [])
                d["FLAGPOS"] = list(d["flagpos_xy"] or [])
                cities.append(d)
            elif name.startswith("PATH"):
                d = {k: coerce(v) for k, v in kv.items()}
                d["_index"] = int(re.sub(r"\D", "", name) or 0)
                pts = []
                for tok in (kv.get("Point") or "").replace(",", " ").split():
                    pts.append(tok)
                # Point 形如 "1108,90 1066,66 …" → 成对合并
                d["points"] = _pairs((kv.get("Point") or ""))
                del d["Point"]
                paths.append(d)
            elif name == "GENERAL":
                generals.append({k: coerce(v) for k, v in kv.items()})
        scenarios.append({
            "id": i,
            "file": "TIMES%d.INI" % i,
            "system": sys_kv,
            "kings": sorted(kings, key=lambda x: x["_index"]),
            "cities": sorted(cities, key=lambda x: x["_index"]),
            "paths": sorted(paths, key=lambda x: x["_index"]),
            "generals": generals,
        })
    return scenarios


def _pairs(s):
    nums = re.findall(r"-?\d+", s or "")
    return [[int(nums[i]), int(nums[i + 1])] for i in range(0, len(nums) - 1, 2)]


def build_magic():
    secs = read_ini(os.path.join(SRC, "MAGIC.INI"))
    magics, wises = [], []
    for s in secs:
        name = s["_section"].upper()
        if name == "MAGIC":
            magics.append({k: coerce(v) for k, v in s["_keys"].items()})
        elif name == "WISE":
            wises.append({k: coerce(v) for k, v in s["_keys"].items()})
    magics.sort(key=lambda d: d.get("SEQUENCE", 0))
    wises.sort(key=lambda d: d.get("SEQUENCE", 0))
    return magics, wises


def build_sango():
    secs = read_ini(os.path.join(SRC, "SANGO.INI"))
    sys_kv, terrains, items, fonts = {}, [], [], []
    for s in secs:
        name = s["_section"].upper()
        if name == "SYSTEM":
            sys_kv = {k: coerce(v) for k, v in s["_keys"].items()}
        elif name == "TERRAIN":
            d = {k: coerce(v) for k, v in s["_keys"].items()}
            d["_index"] = len(terrains)
            terrains.append(d)
        elif name == "ITEM":
            items.append({k: coerce(v) for k, v in s["_keys"].items()})
        elif name.startswith("FONTS"):
            fonts.append({k: coerce(v) for k, v in s["_keys"].items()})
    items.sort(key=lambda d: d.get("Sequence", 0))
    terrains.sort(key=lambda d: d["_index"])
    return sys_kv, terrains, items, fonts


def build_things():
    secs = read_ini(os.path.join(SRC, "THINGS.INI"))
    objs, define = [], {}
    for s in secs:
        name = s["_section"].upper()
        if name in ("SYSTEM", "DEFINE"):
            define[name] = {k: coerce(v) for k, v in s["_keys"].items()}
        elif name.startswith("OBJECT"):
            objs.append({k: coerce(v) for k, v in s["_keys"].items()})
    return objs, define


# ------------------------------------------------------------------ XLS 矩阵
def build_matrices():
    """兵种 13×13 与阵形 9×9 相克矩阵（来自宝典 XLS 的解包 JSON）。"""
    def load(name):
        p = os.path.join(XLSDIR, name)
        if not os.path.exists(p):
            return None
        return json.load(open(p, encoding="utf-8"))

    out = {}
    for key, fname in (("troops", "xls_兵种.json"), ("formations", "xls_阵形.json")):
        d = load(fname)
        if not d:
            out[key] = None
            continue
        rows = d.get("rows") or d
        # 表头在 d["header"]（首格为空）；**不要**拿 rows[0] 当表头——那是第一行数据。
        # 曾经的 bug：header=rows[0] 让名字列错位成数字，矩阵反对称检查报 132。
        header = d.get("header") or (rows[0] if rows else [])
        names = [str(x).strip() for x in header[1:] if str(x).strip()]
        # rows 可能已不含表头（xls_dump 的布局），也可能第一行是表头——两种都兼容
        body = rows
        if body and str(body[0][0]).strip() not in names:
            body = body[1:]
        matrix = []
        for r in body:
            name = str(r[0]).strip()
            vals = []
            for v in r[1:1 + len(names)]:
                try:
                    vals.append(int(v))
                except (TypeError, ValueError):
                    vals.append(0)
            if name:
                matrix.append({"name": name, "vs": vals})
        out[key] = {"names": names, "matrix": matrix}
    return out


# ------------------------------------------------------------------ 主流程
def sha1_of(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def build_all():
    scen = build_times()
    magics, wises = build_magic()
    sango_sys, terrains, items, fonts = build_sango()
    things, define = build_things()
    mx = build_matrices()

    base = scen[0] if scen else {"cities": [], "paths": [], "kings": [], "generals": [], "system": {}}
    # 武将：剧本 1 的属性是权威（docs/03 已证 401 人五剧本属性完全相同），站位按剧本索引
    generals = []
    for gi, g in enumerate(base.get("generals", [])):
        entry = dict(g)
        entry["id"] = gi
        # ---- 字段形状约定：多值字段一律数组（1 条也包一层，0 条给 []）----
        # SKILL/WISESKILL 是重复键（1~8 行）；Skill 是首段盜賊的旧式键。
        for key in ("SKILL", "WISESKILL", "Skill"):
            if key in entry or key in ("SKILL", "WISESKILL"):
                entry[key] = as_multi(entry.get(key))
        # POS 是 5 个剧本的城池槽位；BattleArray/Force 是空格分隔的名字表。
        for key in ("POS", "BattleArray", "Force", "UseForce"):
            entry[key] = split_tokens(entry.get(key))
        entry["pos_by_times"] = [s["generals"][gi].get("POS") if gi < len(s["generals"]) else None
                                 for s in scen]
        entry["city_by_times"] = [s["generals"][gi].get("CITY") if gi < len(s["generals"]) else None
                                  for s in scen]
        entry["status_by_times"] = [s["generals"][gi].get("Status") if gi < len(s["generals"]) else None
                                    for s in scen]
        generals.append(entry)

    troops = (mx.get("troops") or {"names": [], "matrix": []})
    forms = (mx.get("formations") or {"names": [], "matrix": []})

    data = {
        "scenarios": [{"id": s["id"], "system": s["system"], "file": s["file"],
                       "kings": s["kings"], "cities": s["cities"],
                       "paths": s["paths"]} for s in scen],
        "generals": generals,
        "magics": magics,
        "wises": wises,
        "items": items,
        "terrains": terrains,
        "things": things,
        "things_define": define,
        "fonts": fonts,
        "sango_system": sango_sys,
        "troops": troops,
        "formations": forms,
    }
    return data


def parity_report(data):
    """逐表对拍，返回 (rows, ok)。rows = [(表名, 期望, 实际, 结论, 备注)]。"""
    rows = []

    def cmp(name, expect, actual, note=""):
        rows.append((name, expect, actual, "PASS" if expect == actual else "FAIL", note))

    cmp("cities", EXPECT["cities"], len(data["scenarios"][0]["cities"]) if data["scenarios"] else 0, "剧本1")
    cmp("paths", EXPECT["paths"], len(data["scenarios"][0]["paths"]) if data["scenarios"] else 0, "剧本1")
    cmp("kings", EXPECT["kings"], len(data["scenarios"][0]["kings"]) if data["scenarios"] else 0, "剧本1")
    cmp("generals", EXPECT["generals"], len(data["generals"]))
    cmp("magics", EXPECT["magics"], len(data["magics"]))
    cmp("wises", EXPECT["wises"], len(data["wises"]))
    cmp("items", EXPECT["items"], len(data["items"]))
    cmp("terrains", EXPECT["terrains"], len(data["terrains"]))
    cmp("troops", EXPECT["troops"], len(data["troops"].get("names") or []))
    cmp("formations", EXPECT["formations"], len(data["formations"].get("names") or []))

    # 结构性抽检
    g = data["generals"][0] if data["generals"] else {}
    rows.append(("武将模板字段", "NAME/Skill/STR/INT/BaseHP", 
                 "/".join(k for k in ("NAME", "Skill", "STR", "INT", "BaseHP") if k in g),
                 "PASS" if all(k in g for k in ("NAME", "Skill", "STR", "INT", "BaseHP")) else "FAIL", "第一个是盜賊"))
    m = data["magics"][0] if data["magics"] else {}
    rows.append(("武将技字段", "SEQUENCE/NAME/POWER/ATTACK/SCRIPT",
                 "/".join(k for k in ("SEQUENCE", "NAME", "POWER", "ATTACK", "SCRIPT") if k in m),
                 "PASS" if all(k in m for k in ("SEQUENCE", "NAME", "POWER", "ATTACK", "SCRIPT")) else "FAIL", ""))
    t = data["troops"]
    if t.get("matrix"):
        asym = max(abs(t["matrix"][i]["vs"][j] + t["matrix"][j]["vs"][i])
                   for i in range(len(t["matrix"])) for j in range(len(t["matrix"])))
        rows.append(("兵种矩阵反对称", "0", asym, "PASS" if asym == 0 else "FAIL", "越接近 0 越说明是同一张表"))
    f = data["formations"]
    if f.get("matrix"):
        asym = max(abs(f["matrix"][i]["vs"][j] + f["matrix"][j]["vs"][i])
                   for i in range(len(f["matrix"])) for j in range(len(f["matrix"])))
        rows.append(("阵形矩阵反对称", "0", asym, "PASS" if asym == 0 else "FAIL", ""))
    ok = all(r[3] == "PASS" for r in rows)
    return rows, ok


def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=False)
        f.write("\n")
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--check", action="store_true", help="只对拍，不写文件")
    ap.add_argument("--strict", action="store_true", help="对拍失败时退出码 2")
    a = ap.parse_args()

    data = build_all()
    rows, ok = parity_report(data)

    print("%-16s %-6s %-6s %-6s %s" % ("表", "期望", "实际", "结论", "备注"))
    for r in rows:
        print("%-16s %-6s %-6s %-6s %s" % r)

    if a.check:
        print("\n对拍：%s" % ("全过" if ok else "有失败"))
        return 0 if ok or not a.strict else 2

    os.makedirs(a.out, exist_ok=True)
    meta = {"generated_from": SRC, "tables": {}, "expect": EXPECT}
    for name in ("scenarios", "generals", "magics", "wises", "items", "terrains",
                 "things", "things_define", "fonts", "sango_system", "troops", "formations"):
        obj = data[name]
        p = os.path.join(a.out, name + ".json")
        write_json(p, obj)
        n = len(obj) if isinstance(obj, (list, dict)) else 0
        size = os.path.getsize(p)
        meta["tables"][name] = {"count": n, "bytes": size, "sha1_16": sha1_of(p)}
        print("写出 %-14s %6d 项 %9d B" % (name + ".json", n, size))

    meta["source_files"] = {
        f: sha1_of(os.path.join(SRC, f))
        for f in sorted(os.listdir(SRC))
        if f.upper().endswith((".INI", ".SO", ".IDX"))
    }
    write_json(os.path.join(a.out, "meta.json"), meta)
    print("\nmeta.json 已写：%d 张表，源文件 %d 个" % (len(meta["tables"]), len(meta["source_files"])))
    print("对拍：%s" % ("全过" if ok else "有失败（见上表）"))
    return 0 if ok or not a.strict else 2


if __name__ == "__main__":
    sys.exit(main())
