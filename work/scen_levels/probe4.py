# -*- coding: utf-8 -*-
"""看原始 TIMES1.INI 的分段命名与武将段的字段布局（cp950）。"""
import io
import os
import re
from collections import Counter, OrderedDict

P = r"F:\sanguo\extract\pak\TIMES1.INI"
OUT = []


def log(s=""):
    OUT.append(str(s))


raw = open(P, "rb").read()
txt = raw.decode("cp950", errors="replace")
lines = txt.splitlines()
log("bytes=%d lines=%d" % (len(raw), len(lines)))
log("--- 前 40 行 ---")
for i, ln in enumerate(lines[:40]):
    log("%4d| %s" % (i + 1, ln))

secs = [(i, ln.strip()) for i, ln in enumerate(lines) if ln.strip().startswith("[") and ln.strip().endswith("]")]
log("")
log("--- 段名总数 %d，按前缀归类 ---" % len(secs))
pref = Counter(re.sub(r"\d+", "#", s[1:-1]) for _, s in secs)
for k, v in pref.most_common():
    log("  %-24s x%d" % (k, v))
log("")
log("--- 前 30 个段名（按出现顺序）---")
for i, s in secs[:30]:
    log("  line %5d  %s" % (i + 1, s))

# 找一个武将段，打印其全内容
gen_secs = [(i, s) for i, s in secs if re.sub(r"\d+", "#", s[1:-1]) in ("GENERAL#", "GEN#", "武將#")]
log("")
log("武将段候选 %d 个；前 3 个名字: %r" % (len(gen_secs), [s for _, s in gen_secs[:3]]))
if gen_secs:
    for idx in (0, 1):
        i, s = gen_secs[idx]
        ni = secs[idx + 1][0] if idx + 1 < len(secs) else len(lines)
        log("")
        log("=== %s (line %d) 全文 ===" % (s, i + 1))
        for j in range(i, min(ni, i + 40)):
            log("  %s" % lines[j])

with io.open(r"F:\sanguo\work\scen_levels\probe4.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(OUT) + "\n")
print("done", len(OUT))
