import re, io, os

SRC = r'F:\sanguo\game\cocos\assets\scripts\core\battle.ts'
DST = r'F:\sanguo\game\src\core\battle.ts'

s = open(SRC, encoding='utf-8').read()
assert s.count('\ufffd') == 0

# 1) restore .ts extensions on relative imports (cocos copy has them stripped)
def fix(m):
    q, path = m.group(1), m.group(2)
    if path.endswith('.ts') or path.endswith('.json') or path.endswith('.js'):
        return m.group(0)
    return f"from {q}{path}.ts{q}"

s2, n = re.subn(r"from\s+(['\"])(\.{1,2}/[^'\"]+)\1", fix, s)
print('imports fixed:', n)

# 2) sanity: no import.meta / .js extension left in relative imports
left = re.findall(r"from\s+['\"](\.[^'\"]*\.js)['\"]", s2)
print('left .js imports:', left[:5])

open(DST, 'w', encoding='utf-8', newline='\n').write(s2)
print('written', DST, len(s2.encode('utf-8')), 'bytes', s2.count('\n') + 1, 'lines')
