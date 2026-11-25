# -*- coding: utf-8 -*-
import sys
sys.path.insert(0, r"F:\sanguo\tools")
from parse_ini import IniFile
mi = IniFile.load(r"F:\sanguo\extract\pak\MESSAGE.INI")
s = mi.sections[0]
d={k:v for k,v,ln in s.fields}
for k in [f"MSG{n}" for n in range(230,300)]:
    if k in d: print(k,"=",d[k])
print("-"*40)
for k in [f"MSG{n}" for n in range(400,425)]:
    if k in d: print(k,"=",d[k])
