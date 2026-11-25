# -*- coding: utf-8 -*-
"""打印原始 TIMES1.INI 的前两个 [GENERAL] 段全文（cp950），并统计键名。"""
import io
from collections import Counter

P = r"F:\sanguo\extract\pak\TIMES1.INI"
OUT = []


def log(s=""):
    OUT.append(str(s))


lines = open(P, "rb").read().decode("cp950", errors="replace").splitlines()
idx = [i for i, ln in enumerate(lines) if ln.strip().upper() == "[GENERAL]"]
log("[GENERAL] 段数 = %d，首段 line %d，末段 line %d" % (len(idx), idx[0] + 1, idx[-1] + 1))
for k in (0, 1):
    a = idx[k]
    b = idx[k + 1] if k + 1 < len(idx) else len(lines)
    log("")
    log("=== 第 %d 个 [GENERAL] 段（line %d..%d，%d 行）===" % (k + 1, a + 1, b, b - a))
    for j in range(a, b):
        log("%5d| %s" % (j + 1, lines[j]))

# 每段键名序列（前 3 段 + 全体键名计数）
log("")
log("=== 键名统计（取 '=' 左侧，去掉行内空格）===")
keys = Counter()
per_block = []
for k, a in enumerate(idx):
    b = idx[k + 1] if k + 1 < len(idx) else len(lines)
    ks = []
    for j in range(a + 1, b):
        ln = lines[j]
        if "=" in ln:
            key = ln.split("=", 1)[0].strip()
            keys[key] += 1
            ks.append(key)
    per_block.append(ks)
for k, v in keys.most_common():
    log("  %-14s %d" % (k, v))
log("")
log("每段键数分布: %r" % (dict(Counter(len(x) for x in per_block)),))
log("第 1 段键序: %r" % (per_block[0],))
log("第 2 段键序: %r" % (per_block[1],))
log("第 3 段键序: %r" % (per_block[2],))

with io.open(r"F:\sanguo\work\scen_levels\probe5.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(OUT) + "\n")
print("done", len(OUT))
