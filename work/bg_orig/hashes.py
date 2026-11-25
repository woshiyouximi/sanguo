# -*- coding: utf-8 -*-
import hashlib
import os

d = r"F:\sanguo\game\web\assets\bg\orig"
s = r"F:\sanguo\export\png\tga"


def h(p):
    return hashlib.md5(open(p, "rb").read()).hexdigest()[:10]


for i in range(12):
    row = [f"{k}{i:02d}={h(os.path.join(d, k + '%02d.png' % i))}" for k in ("floor", "bg", "mg", "fg")]
    print(i, " ".join(row))
print("---")
for i in range(4):
    print("src floor", i, h(os.path.join(s, "SHAPE_BG_FLOOR%02d.png" % i)))
