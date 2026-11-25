import json, collections
base = r'F:\sanguo\extract\json'
d = json.load(open(base + r'\xls_群英2.json', encoding='utf-8'))
hdr, rows = d['header'], d['rows']
for want in ('吕布','姜维','诸葛亮'):
    for r in rows:
        if r[1] == want:
            print('=== ', want)
            for i, (h, v) in enumerate(zip(hdr, r)):
                if v not in ('', None):
                    print('  %2d %-8s %r' % (i, h, v))
            break
print()
print('血统', collections.Counter(r[52] for r in rows).most_common())
print('节操', collections.Counter(r[53] for r in rows).most_common())
print('图形类型', collections.Counter(r[54] for r in rows).most_common(10))
print('合 == 武力+智力 ?', sum(1 for r in rows if isinstance(r[4],(int,float)) and r[4]==r[2]+r[3]), '/', len(rows))
