# -*- coding: utf-8 -*-
"""补两个报告要用的事实：
 1) 每剧本 Status=登/野 的将落在「有主城」还是「空城」——用于给 登/野 语义定标注；
 2) 每剧本「0 城势力」（KING 名单里但一座城都没有的君主）有几个、其武将怎么表现。
"""
import io
import json
import os
from collections import Counter, OrderedDict

INI_DIR = r"F:\sanguo\extract\pak"
OUT = []


def log(s=""):
    OUT.append(str(s))


def parse_ini(path):
    txt = open(path, "rb").read().decode("cp950", errors="replace")
    sections, cur_name, cur = [], None, []
    for ln in txt.splitlines():
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
    return sections


def blocks(sections, name):
    """精确匹配 [SYSTEM] 或前缀匹配 [CITY01]/[KING03]（GENERAL 是无编号的 [GENERAL]）。"""
    out = []
    for n, kv in sections:
        u = n.upper()
        if u == name.upper() or (u.startswith(name.upper()) and u[len(name):].isdigit()):
            out.append(dict(kv))
    return out


for i in range(1, 6):
    sec = parse_ini(os.path.join(INI_DIR, "TIMES%d.INI" % i))
    cities = blocks(sec, "CITY")
    kings = blocks(sec, "KING")
    gens = blocks(sec, "GENERAL")
    owner = {}
    for c in cities:
        owner[c.get("NAME", "")] = c.get("KING", "").strip()
    log("=" * 70)
    log("TIMES%d  %s  %d 城  %d 君主" % (i, dict(blocks(sec, "SYSTEM")[0]).get("TIME"), len(cities), len(kings)))
    kc = Counter(v for v in owner.values() if v)
    zero = [k.get("NAME", "") for k in kings if kc.get(k.get("NAME", ""), 0) == 0]
    log("  KING 名单: %r" % ([k.get("NAME") for k in kings],))
    log("  每君主城数: %r" % (dict(kc),))
    log("  空 KING 字段的城: %d" % sum(1 for v in owner.values() if not v))
    log("  0 城势力 (%d 个): %r" % (len(zero), zero))
    st_own = Counter()
    for g in gens:
        st = g.get("Status", "").strip()
        if st == "未":
            continue
        city = g.get("CITY", "").strip()
        st_own[(st, "城有主" if owner.get(city) else "城无主/空")] += 1
    log("  登场将按 (Status, 所在城是否有主): %r" % (dict(st_own),))
    # 0 城势力的将：君主名不可能出现在武将记录里，只能看有没有城池归属
    log("  0 城势力名下武将在城表里出现的次数: %d" % sum(1 for v in owner.values() if v in zero))
    log("")

with io.open(r"F:\sanguo\work\scen_levels\probe6.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(OUT) + "\n")
print("done", len(OUT))
