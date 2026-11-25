# -*- coding: utf-8 -*-
"""
从原作 TIMES1..5.INI 抽出「每个剧本 × 每个武将」的 BaseEXP / 起始等级，产出
  F:\\sanguo\\game\\data\\levels_by_scenario.json

真值依据（project/133 §3，[確認]）：
  0x42D38B mov dword ptr [ecx+0x2a],eax   ; BaseEXP -> gen+0x2A
  0x42D391 push edx ; call 0x409F73        ; 等级 = level_of(gen->exp)
  0x42D39D mov word ptr [ecx+0x2e],ax      ; 写回 gen+0x2E
  0x409EE0(k) = k>99 ? 0x98967F : (((k-1)*137 - 34) * k) / 2 + 17      (C 向零截断)
  0x409F73(gen): for (i=0;i<99;i++) if (exp < 0x409EE0(i)) return i-1; return 99

数据源（两路互证）：
  A. 原始 INI：F:\\sanguo\\extract\\pak\\TIMES{1..5}.INI（cp950），593 段 = [SYSTEM]+15[KING]+60[CITY]+116[PATH]+401[GENERAL]
     每个 [GENERAL] 段的 BaseEXP= / POS= / CITY= / Status= 就是原始字段。
  B. 已解 JSON：F:\\sanguo\\extract\\json\\times{1..5}.json（同一批 INI 的结构化投影）
  A 与 B 必须逐将一致，否则脚本报错退出。

登场判定： TIMES{i}.INI 里该将 Status != '未'（等价于 CITY != ''）；Status 取值 未/登/野。
"""
import io
import json
import os
import sys
from collections import OrderedDict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
INI_DIR = r"F:\sanguo\extract\pak"
JSON_DIR = r"F:\sanguo\extract\json"
GAME_DATA = r"F:\sanguo\game\data"
OUT_JSON = os.path.join(GAME_DATA, "levels_by_scenario.json")
AUDIT = os.path.join(HERE, "extract_audit.txt")

UP = []


def log(s=""):
    line = str(s)
    UP.append(line)


# ------------------------------------------------------------------ 原作门槛表
def exp_to_reach(k):
    """0x409EE0 —— 与 game/src/core/battle.ts:2163 expToReach 逐字一致。"""
    if k > 99:
        return 0x98967F
    num = ((k - 1) * 0x89 - 0x22) * k
    q = abs(num) // 2
    return (q if num >= 0 else -q) + 0x11


def level_of(exp):
    """0x409F73 —— 原作反推。exp 极小时会返回 -1（原作同样），此处不夹。"""
    for i in range(0x63):
        if exp < exp_to_reach(i):
            return i - 1
    return 0x63


def level_from_exp(exp):
    """game/src/core/battle.ts:2168 levelFromExp —— 引擎侧口径，夹 >=1。"""
    if exp is None:
        return 1
    n = 1
    while n < 99 and exp >= exp_to_reach(n + 1):
        n += 1
    return n


# ------------------------------------------------------------------ 原始 INI 解析
def parse_ini(path):
    raw = open(path, "rb").read()
    txt = raw.decode("cp950", errors="replace")
    lines = txt.splitlines()
    sections = []           # [(name, [ (key, val), ... ])]
    cur_name, cur = None, []
    for ln in lines:
        s = ln.strip()
        if s.startswith("[") and s.endswith("]"):
            if cur_name is not None:
                sections.append((cur_name, cur))
            cur_name, cur = s[1:-1].strip(), []
        elif "=" in ln and cur_name is not None:
            k, v = ln.split("=", 1)
            cur.append((k.strip(), v.strip()))
    if cur_name is not None:
        sections.append((cur_name, cur))
    return raw, len(lines), sections


def blocks_of(sections, name):
    return [dict(kv) for n, kv in sections if n.upper() == name.upper()]


def parse_times(idx):
    p = os.path.join(INI_DIR, "TIMES%d.INI" % idx)
    raw, nlines, sections = parse_ini(p)
    sysd = blocks_of(sections, "SYSTEM")
    assert len(sysd) == 1, "SYSTEM 段数异常: %d" % len(sysd)
    sysd = sysd[0]
    gens = blocks_of(sections, "GENERAL")
    groups = Counter(n.split("0")[0].rstrip("0123456789") or n for n, _ in sections)
    return {
        "path": p, "bytes": len(raw), "lines": nlines, "sections": len(sections),
        "groups": dict(groups),
        "system": sysd, "generals": gens,
    }


# ------------------------------------------------------------------ 载入项目数据
scen = json.load(io.open(os.path.join(GAME_DATA, "scenarios.json"), encoding="utf-8-sig"))
gens = json.load(io.open(os.path.join(GAME_DATA, "generals.json"), encoding="utf-8-sig"))
assert isinstance(scen, list) and len(scen) == 5, "scenarios.json 应为 5 条 list"
assert isinstance(gens, list) and len(gens) == 401, "generals.json 应为 401 条 list"
gen_names = [g["NAME"] for g in gens]
assert len(set(gen_names)) == 401, "generals.json NAME 不唯一"

log("=" * 78)
log("levels_by_scenario 抽取审计 —— %s" % os.path.basename(OUT_JSON))
log("=" * 78)
log("")
log("原始 INI： %s" % INI_DIR)
log("参考 JSON：%s" % JSON_DIR)
log("项目数据：%s" % GAME_DATA)
log("")

# ------------------------------------------------------------------ 逐剧本抽取
out_scen = []
name_diff_total = 0
for i in range(1, 6):
    t = parse_times(i)
    g = t["generals"]
    s = scen[i - 1]
    ini_time = t["system"].get("TIME", "")
    proj_time = (s.get("system") or {}).get("TIME", "")
    log("-" * 78)
    log("TIMES%d.INI  %d B  %d 行  %d 段  groups=%r" % (i, t["bytes"], t["lines"], t["sections"], t["groups"]))
    log("  SYSTEM: TIME=%r YEAR=%s TotalKing=%s TotalGeneral=%s TotalCity=%s"
        % (ini_time, t["system"].get("YEAR"), t["system"].get("TotalKing"),
           t["system"].get("TotalGeneral"), t["system"].get("TotalCity")))
    log("  scenarios.json: id=%r file=%r system.TIME=%r YEAR=%r  -> 名称一致=%s"
        % (s.get("id"), s.get("file"), proj_time, (s.get("system") or {}).get("YEAR"),
           ini_time == proj_time))
    assert ini_time == proj_time, "剧本名不一致: INI=%r project=%r" % (ini_time, proj_time)

    names = [x.get("NAME", "") for x in g]
    miss_key = [x.get("NAME", "") for x in g if "BaseEXP" not in x]
    missing = [n for n in names if not str(n).strip()]
    log("  [GENERAL] 段数=%d  无 NAME 的段=%d  无 BaseEXP 字段的段=%d" % (len(g), len(missing), len(miss_key)))

    # 名字必须与 generals.json 同名同序（顺序对齐是 import_legacy.py 的既定假设）
    same_set = set(names) == set(gen_names)
    same_seq = names == gen_names
    only_ini = sorted(set(names) - set(gen_names))
    only_proj = sorted(set(gen_names) - set(names))
    name_diff_total += len(only_ini) + len(only_proj)
    log("  NAME 集合与 generals.json 相同=%s  顺序相同=%s  仅在 INI=%r  仅在 generals.json=%r"
        % (same_set, same_seq, only_ini[:10], only_proj[:10]))

    # 与 extract/json/timesN.json 互证
    j = json.load(io.open(os.path.join(JSON_DIR, "times%d.json" % i), encoding="utf-8-sig"))
    jg = j["generals"]
    bad = []
    for a, b in zip(g, jg):
        be_a, be_b = int(a["BaseEXP"]), int(b.get("base_exp"))
        if a["NAME"] != b.get("name") or be_a != be_b:
            bad.append((a["NAME"], be_a, b.get("name"), be_b))
    log("  extract/json/times%d.json: %d 将  NAME+BaseEXP 逐将一致=%s  不一致前 5=%r"
        % (i, len(jg), not bad, bad[:5]))
    assert len(jg) == len(g) and not bad, "INI 与 JSON 投影不一致"

    # 逐将打表
    levels = OrderedDict()
    hist = Counter()
    hist_absent = Counter()
    st_cnt = Counter()
    city_pos_mismatch = []
    deployed_n = absent_n = 0
    for k, row in enumerate(g):
        nm = row["NAME"]
        be = int(row["BaseEXP"])
        st = row.get("Status", "").strip()
        city = row.get("CITY", "").strip()
        pos = (row.get("POS") or "").split()
        st_cnt[st] += 1
        dep = st != "未"
        if dep != (city != ""):
            city_pos_mismatch.append((nm, st, city))
        # POS 是 5 个剧本的城池槽位，第 i 个槽位应等于本剧本的 CITY（未登场时槽位=未）
        slot = pos[i - 1] if len(pos) == 5 else "?"
        if (slot == "未") == dep:
            city_pos_mismatch.append((nm, "POS槽%d" % i, slot, st, city))
        lv = level_from_exp(be)
        lv_asm = level_of(be)
        assert lv == lv_asm or (be == 0), "两级实现分歧 %r be=%r eng=%r asm=%r" % (nm, be, lv, lv_asm)
        levels[nm] = OrderedDict((("baseExp", be), ("level", lv), ("deployed", dep)))
        if dep:
            deployed_n += 1
            hist[lv] += 1
        else:
            absent_n += 1
            hist_absent[lv] += 1

    be_cnt = Counter(int(x["BaseEXP"]) for x in g)
    log("  BaseEXP 分布: %r  -> 等级 %r"
        % (dict(be_cnt), dict((v, level_from_exp(v)) for v in sorted(be_cnt))))
    log("  Status 分布: %r" % (dict(st_cnt),))
    log("  登场(=Status!=未) = %d，未登场 = %d，两者与 CITY 空/非空矛盾的行 = %d %r"
        % (deployed_n, absent_n, len(city_pos_mismatch), city_pos_mismatch[:5]))
    log("  登场等级直方图: %r" % (dict(sorted(hist.items())),))
    log("  未登场等级直方图: %r （未登场也照引擎口径有等级，只是不在地图上）"
        % (dict(sorted(hist_absent.items())),))

    out_scen.append({
        "index": i - 1,
        "id": s.get("id"),
        "name": ini_time,
        "year": (s.get("system") or {}).get("YEAR"),
        "file": os.path.basename(t["path"]),
        "baseExpCommon": be_cnt.most_common(1)[0][0],
        "defaultLevel": level_from_exp(be_cnt.most_common(1)[0][0]),
        "counts": OrderedDict((("total", len(levels)), ("deployed", deployed_n),
                               ("absent", absent_n), ("missing", 0))),
        "levelHistogram": dict(sorted(hist.items())),
        "absentLevelHistogram": dict(sorted(hist_absent.items())),
        "levels": levels,
    })

log("-" * 78)
log("名字匹配合计异常数（应为 0）：%d" % name_diff_total)
assert name_diff_total == 0, "名字集合与 generals.json 不一致"

# ------------------------------------------------------------------ 写表
doc = OrderedDict()
doc["schema"] = 1
doc["source"] = "TIMES"
doc["sourceFiles"] = ["extract/pak/TIMES%d.INI" % i for i in range(1, 6)]
doc["expToLevel"] = "0x409EE0"
doc["levelFromExp"] = "0x409F73"
doc["loader"] = "0x42D38B (BaseEXP -> gen+0x2A) / 0x42D391 call 0x409F73 / 0x42D39D (level -> gen+0x2E)"
doc["formula"] = "expToReach(k) = k>99 ? 9999999 : (((k-1)*137 - 34) * k) / 2 + 17 ; level = max{n | exp >= expToReach(n)}"
doc["format"] = ("scenarios[index].levels[NAME] = {baseExp, level, deployed}；"
                 "NAME 与 game/data/generals.json 的 NAME 逐字相同；"
                 "deployed=true 表示该剧本 TIMES 文件里此将 Status != '未'（等价 CITY != ''，即登/野）；"
                 "deployed=false 的将也有 baseExp/level（原作装载器对 401 人一律赋值），只是不在地图上")
doc["generatedBy"] = "work/scen_levels/extract.py"
doc["scenarios"] = out_scen

# 手写序列化：外壳 indent=2，levels 每个武将一行（git diff 按将可读）
def emit(obj, path="F:\\sanguo\\game\\data\\levels_by_scenario.json"):
    L = []
    L.append("{")
    keys = list(obj.keys())
    for ki, k in enumerate(keys):
        v = obj[k]
        tail = "," if ki < len(keys) - 1 else ""
        head = '  %s: ' % json.dumps(k, ensure_ascii=False)
        if k != "scenarios":
            L.append(head + json.dumps(v, ensure_ascii=False) + tail)
            continue
        L.append(head + "[")
        for si, sc in enumerate(v):
            stail = "," if si < len(v) - 1 else ""
            L.append("    {")
            skeys = list(sc.keys())
            for s_i, s_k in enumerate(skeys):
                sv = sc[s_k]
                st_ = "," if s_i < len(skeys) - 1 else ""
                if s_k != "levels":
                    L.append('      %s: %s%s' % (json.dumps(s_k, ensure_ascii=False),
                                                 json.dumps(sv, ensure_ascii=False, separators=(", ", ": ")), st_))
                    continue
                L.append('      "levels": {')
                items = list(sv.items())
                for e_i, (nm, ev) in enumerate(items):
                    etail = "," if e_i < len(items) - 1 else ""
                    L.append('        %s: %s%s' % (
                        json.dumps(nm, ensure_ascii=False),
                        json.dumps(ev, ensure_ascii=False, separators=(", ", ": ")),
                        etail))
                L.append("      }" + st_)
            L.append("    }" + stail)
        L.append("  ]" + tail)
    L.append("}")
    data = "\n".join(L) + "\n"
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(data)
    return len(data.encode("utf-8"))


nbytes = emit(doc)
# 自检：写出来的必须是合法 JSON 且与内存对象等价
back = json.load(io.open(OUT_JSON, encoding="utf-8"))
assert back == json.loads(json.dumps(doc, ensure_ascii=False)), "回读不等价"

log("")
log("=" * 78)
log("写出 %s  %d 字节" % (OUT_JSON, nbytes))
log("")
log("剧本 | id | 年 | 文件 | 统一 BaseEXP | 默认等级 | 将数 | 登场 | 未登场 | 等级直方图")
for sc in out_scen:
    log("%-6s | %s | %s | %-12s | %5d | Lv%-2d | %3d | %3d | %3d | %r"
        % (sc["name"], sc["id"], sc["year"], sc["file"], sc["baseExpCommon"], sc["defaultLevel"],
           sc["counts"]["total"], sc["counts"]["deployed"], sc["counts"]["absent"], sc["levelHistogram"]))
log("")
log("All OK.")

with io.open(AUDIT, "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(UP) + "\n")
print("\n".join(UP[-14:]))
