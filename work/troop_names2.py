import json, collections, re
base = r'F:\sanguo\extract\json'
d = json.load(open(base + r'\xls_群英2.json', encoding='utf-8'))
hdr, rows = d['header'], d['rows']
for col in (47, 48, 49, 50, 51):
    c = collections.Counter()
    for r in rows:
        v = r[col]
        if isinstance(v, str):
            for t in re.split(r'[、,，/\s]+', v):
                if t: c[t] += 1
    print('col', col, repr(hdr[col]), '->', c.most_common(20))
