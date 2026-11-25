# -*- coding: utf-8 -*-
import io

p = r'F:\sanguo\work\gen172.py'
t = io.open(p, encoding='utf-8').read()
pairs = [
    ('逐条 d(seq, kind, value)，`:318-319` 到 67。',
     '逐条 d(seq, kind, value)，`:319` 的 d(67, ...) 收尾（`:320` 表闭）。'),
    ('`:1613` 明确 ACT=0 无生成点', '`:1611` 明确 ACT=0 无生成点'),
]
for old, new in pairs:
    n = t.count(old)
    if n != 1:
        print('SKIP(%d): %s' % (n, old[:60]))
        continue
    t = t.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('patched3')
