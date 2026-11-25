# -*- coding: utf-8 -*-
"""探查 times1..5.json：每剧本的 base_exp 分布 / generals 数量 / 名字一致性 / POS 槽位结构。"""
import json
import os
from collections import Counter

J = r"F:\sanguo\extract\json"
OUT = []


def log(s=""):
    OUT.append(str(s))


def ntok(v):
    if isinstance(v, list):
        return len(v)
    if isinstance(v, str):
        return len(v.split())
    return -1


names_per = {}
for i in range(1, 6):
    p = os.path.join(J, "times%d.json" % i)
    d = json.load(open(p, encoding="utf-8"))
    g = d["generals"]
    sysd = d.get("system") or {}
    log("=== times%d.json  %d B" % (i, os.path.getsize(p)))
    log("  system: %r" % (sysd,))
    log("  generals: %d  kings: %d  cities: %d  paths: %d"
        % (len(g), len(d.get("kings") or []), len(d.get("cities") or []), len(d.get("paths") or [])))
    if i == 1:
        log("  generals[0] 的键: %r" % (list(g[0].keys()),))
    be = Counter(x.get("base_exp") for x in g)
    log("  base_exp 分布: %r" % (dict(be),))
    st = Counter(x.get("status") for x in g)
    log("  status 分布: %r" % (dict(st),))
    ci = Counter((x.get("city") or "") == "" for x in g)
    log("  city 为空: %d / 非空: %d" % (ci.get(True, 0), ci.get(False, 0)))
    tokcnt = Counter(ntok(x.get("pos")) for x in g)
    log("  POS token 数分布: %r" % (dict(tokcnt),))
    for k in (0, 1, 2):
        log("  generals[%d]: name=%r base_exp=%r pos=%r city=%r status=%r"
            % (k, g[k].get("name"), g[k].get("base_exp"), g[k].get("pos"), g[k].get("city"), g[k].get("status")))
    cc = d.get("cross_checks")
    if isinstance(cc, dict):
        log("  cross_checks 键: %r" % (list(cc.keys()),))
    log("")
    names_per[i] = [x.get("name") for x in g]

log("=== 名字序列跨剧本是否一致")
base = names_per[1]
for i in range(2, 6):
    n = names_per[i]
    same_len = len(n) == len(base)
    same_seq = same_len and all(a == b for a, b in zip(base, n))
    diff_idx = [k for k in range(min(len(n), len(base))) if base[k] != n[k]][:10]
    log("  times%d: len=%d 同长=%s 同序=%s 首个不同 idx=%r"
        % (i, len(n), same_len, same_seq, diff_idx))

log("")
log("=== 重复名字检查（times1）")
c = Counter(base)
dups = {k: v for k, v in c.items() if v > 1}
log("  重名: %r" % (dups,))

log("")
log("=== 生成器/解析器路径线索（times1.json 顶层 source）")
d1 = json.load(open(os.path.join(J, "times1.json"), encoding="utf-8"))
log("  source=%r times_index=%r bytes=%r encoding=%r lines=%r"
    % (d1.get("source"), d1.get("times_index"), d1.get("bytes"), d1.get("encoding"), d1.get("lines")))
log("  sections=%r" % (d1.get("sections"),))
log("  stats=%r" % (d1.get("stats"),))

with open(r"F:\sanguo\work\scen_levels\probe3.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(OUT) + "\n")
print("done", len(OUT), "lines")
