# -*- coding: utf-8 -*-
"""拷 26 张九宫图元到 Cocos bundle（uv 副本，不动 web 原件）。"""
import hashlib
import os
import shutil
import sys

SRC_ORIG = r"F:\sanguo\game\web\assets\ui\orig"
SRC_BUI = r"F:\sanguo\game\web\assets\battleui"
DST = r"F:\sanguo\game\cocos\assets\bundles\res\ui"

ORIG = ["frame_panel", "plate_btn", "plate_sq", "plate_sel", "bar_div", "gem_gold"] + \
       ["force_%02d" % i for i in range(1, 14)]
BUI = ["slot", "slot_off", "cmd_on", "cmd_off", "port", "msg", "sep"]


def sha(p):
    with open(p, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:16]


os.makedirs(DST, exist_ok=True)
total = 0
rows = []
for name in ORIG + BUI:
    src = os.path.join(SRC_ORIG if name in ORIG else SRC_BUI, name + ".png")
    dst = os.path.join(DST, name + ".png")
    if not os.path.isfile(src):
        print("MISSING SRC", src)
        sys.exit(1)
    shutil.copy2(src, dst)
    a, b = sha(src), sha(dst)
    if a != b:
        print("HASH MISMATCH", name)
        sys.exit(1)
    total += os.path.getsize(dst)
    rows.append((name + ".png", os.path.getsize(dst), a))
    if not os.path.isfile(src):
        print("SRC DISAPPEARED (moved!)", src)
        sys.exit(1)

for n, s, h in rows:
    print("%-18s %6d B  %s" % (n, s, h))
print("files=%d total=%d B" % (len(rows), total))
