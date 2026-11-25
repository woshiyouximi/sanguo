# -*- coding: utf-8 -*-
"""交付前自检：结构、围栏、表格列数、交叉引用、禁用词。"""
import io
import re

DOC = r'F:\sanguo\project\02_战斗重构设计.md'
txt = io.open(DOC, encoding='utf-8').read()
lines = txt.split('\n')

heads, cur = set(), None
for l in lines:
    m = re.match(r'^(#{2,3}) (\d+)(?:\.(\d+))?\.? ', l)
    if m:
        cur = m.group(2) + ('.' + m.group(3) if m.group(3) else '')
        heads.add(cur)

refs = set(re.findall(r'§(\d+(?:\.\d+)?)', txt))
dangling = sorted(r for r in refs if r not in heads)

fences = [i for i, l in enumerate(lines) if l.startswith('```')]
print('lines      =', len(lines))
print('chars      =', len(txt))
print('h1/h2/h3   =', len(re.findall(r'(?m)^# ', txt)), len(re.findall(r'(?m)^## ', txt)), len(re.findall(r'(?m)^### ', txt)))
print('fences     =', len(fences), '(even)' if len(fences) % 2 == 0 else '(ODD!)')
print('tables     =', len(re.findall(r'(?m)^\|---', txt)))
print('依据/新设计 =', txt.count('（依据：'), txt.count('（新设计'))
print('待定       =', txt.count('待定'))
print('refs       =', len(refs), 'dangling =', dangling)

# 表格列数一致性
bad = 0
i = 0
while i < len(lines):
    if lines[i].startswith('|') and i + 1 < len(lines) and re.match(r'^\|[-| ]+\|$', lines[i + 1]):
        n = lines[i].count('|')
        j = i + 2
        while j < len(lines) and lines[j].startswith('|'):
            if lines[j].count('|') != n:
                print('  !! table col mismatch line', j + 1)
                bad += 1
            j += 1
        i = j
    else:
        i += 1
print('table issues =', bad)
