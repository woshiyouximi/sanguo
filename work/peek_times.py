import io
p = r'F:\sanguo\extract\pak\TIMES1.INI'
raw = open(p,'rb').read().decode('cp950')
lines = raw.splitlines()
print('total lines', len(lines))
# 打印前 4 段的开头
import re
secs = [(i,l) for i,l in enumerate(lines) if l.strip().startswith('[')]
print('sections', len(secs))
for name, idx in [('first', 0)]:
    pass
seen = {}
for i,l in secs:
    nm = l.strip()
    seen.setdefault(nm, i)
for nm in ['[SYSTEM]','[KING01]','[CITY01]','[GENERAL]','[PATH001]']:
    if nm in seen:
        i = seen[nm]
        print('=====', nm, 'at line', i+1)
        for l in lines[i:i+22]:
            print(l)
