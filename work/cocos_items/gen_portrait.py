# -*- coding: utf-8 -*-
"""把 game/web/face_map.js 的 FULL 表原样抠出来，替换 Portrait.ts 里的 @@FACE_TABLE@@ 标记。

为什么要 python：400 条中文/日文汉字键，手抄必错；python 读写的都是原字节，且显式 utf-8。
用法：python work/cocos_items/gen_portrait.py
"""
import io
import re
import sys

ROOT = r"F:/sanguo"
SRC = ROOT + "/game/web/face_map.js"
DST = ROOT + "/game/cocos/assets/scripts/Portrait.ts"
MARKER = "// @@FACE_TABLE@@"

with io.open(SRC, "r", encoding="utf-8") as f:
    src = f.read()

m = re.search(r"var FULL = \{([\s\S]*?)\n  \};", src)
if not m:
    sys.exit("FULL 表没找到，face_map.js 结构变了？")

body = m.group(1)
pairs = re.findall(r'"([^"]+)"\s*:\s*"([^"]+)"', body)
if len(pairs) != 400:
    sys.exit("预期 400 条，实际 %d 条" % len(pairs))

lines = []
for name, no in pairs:
    lines.append("  '%s': '%s'," % (name, no))
table = "\n".join(lines)

with io.open(DST, "r", encoding="utf-8") as f:
    ts = f.read()

if MARKER not in ts:
    sys.exit("Portrait.ts 里没有 %s 标记（是不是已经生成过？）" % MARKER)

ts = ts.replace(MARKER, table)

with io.open(DST, "w", encoding="utf-8", newline="\n") as f:
    f.write(ts)

print("已写入 %d 条 FACE 映射 → %s" % (len(pairs), DST))
print("首条 %s 末条 %s" % (pairs[0], pairs[-1]))
