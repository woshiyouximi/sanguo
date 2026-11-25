import sys, re, collections
sys.path.insert(0, r"F:\sanguo\tools")
from parse_ini import IniFile
ini = IniFile.load(r"F:\sanguo\extract\pak\THINGS.INI")
print("sections", len(ini.sections))
print(collections.Counter(s.name for s in ini.sections))
objs = ini.all("OBJECT")
print("OBJ count", len(objs))
for li in (100, 101, 32, 2):
    s = objs[li]
    print("="*70)
    print("idx", li+1, "section#", s.index, "line", s.lineno, "keys", len(s.fields))
    for k, v, ln in s.fields:
        print(f"  L{ln:6d} {k:12s} = {v}")
