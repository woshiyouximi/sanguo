import json
d = json.load(open(r'F:\sanguo\extract\json\xls_群英2.json', encoding='utf-8'))
rows = d['rows']
hs = []
for r in rows:
    try:
        name = str(r[1]).strip(); w = int(float(r[2])); z = int(float(r[3]))
    except Exception:
        continue
    if not name or name in ('姓名', 'nan'):
        continue
    hs.append((w + z, w, z, name))
hs.sort(reverse=True)
top = hs[:40]
for i, (s, w, z, n) in enumerate(top, 1):
    print('%2d %-6s %3d/%3d  sum=%d' % (i, n, w, z, s))
print('total heroes', len(hs))
