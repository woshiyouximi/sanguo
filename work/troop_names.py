import json, collections, re
base = r'F:\sanguo\extract\json'
d = json.load(open(base + r'\xls_群英2.json', encoding='utf-8'))
hdr, rows = d['header'], d['rows']
for col in (44, 45):
    print('col', col, 'header', repr(hdr[col]))
    c = collections.Counter()
    for r in rows:
        v = r[col]
        if isinstance(v, str):
            for t in re.split(r'[、,，/\s]+', v):
                if t: c[t] += 1
    print('  ', c.most_common(20))
# 阵形 columns 43/44? find headers containing 阵
for i, h in enumerate(hdr):
    if '阵' in h or '兵种' in h or '武器' in h:
        print('idx', i, h)
