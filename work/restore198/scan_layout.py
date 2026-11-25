import re

p = r'F:\sanguo\game\src\view\layout.ts'
lines = open(p, encoding='utf-8').read().split('\n')
bad = [(i, l) for i, l in enumerate(lines, 1) if '\ufffd' in l]
print('lines with FFFD:', len(bad), 'total FFFD:', sum(l.count('\ufffd') for _, l in bad))

code_bad = []
for i, l in bad:
    s = l.strip()
    is_comment = s.startswith('//') or s.startswith('*') or s.startswith('/*')
    if not is_comment:
        # inside a block comment? crude: line contains /* */ markers
        code_bad.append((i, l))

print('non-comment lines with FFFD:', len(code_bad))
for i, l in code_bad[:15]:
    print(i, repr(l[:120]))
