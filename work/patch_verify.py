# -*- coding: utf-8 -*-
import io

p = r'F:\sanguo\work\verify172.py'
t = io.open(p, encoding='utf-8').read()
pairs = [
    ("('src/core/battle.ts', 2424, 'qiPowerPercentOf')", "('src/core/battle.ts', 2415, 'qiPowerPercentOf')"),
    ("('src/core/battle.ts', 2817, 'levelFromExp')", "('src/core/battle.ts', 2808, 'levelFromExp')"),
    ("('src/core/battle.ts', 3030, 'ovHp')", "('src/core/battle.ts', 3021, 'ovHp')"),
    ("('src/core/battle.ts', 3040, 'learnedAtLevelUp')", "('src/core/battle.ts', 3031, 'learnedAtLevelUp')"),
    ("range(max(0, ln - 3), min(len(lines), ln + 3))", "range(max(0, ln - 12), min(len(lines), ln + 12))"),
]
for old, new in pairs:
    if old not in t:
        print('MISS:', old)
    t = t.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('verify patched')
