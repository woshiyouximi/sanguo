import json, collections, numpy as np
base = r'F:\sanguo\extract\json'
d = json.load(open(base + r'\xls_群英2.json', encoding='utf-8'))
hdr, rows = d['header'], d['rows']
print('57', hdr[57], '58', hdr[58], '59', hdr[59], '60', hdr[60])
for idx in (57, 58, 59, 60):
    print(hdr[idx], collections.Counter(r[idx] for r in rows).most_common(12))
# 必杀技 unlock levels
lv = collections.Counter()
for r in rows:
    for k in range(5, 21, 2):
        if isinstance(r[k], str) and isinstance(r[k+1], (int,float)):
            lv[int(r[k+1])] += 1
print('必杀技解锁等级分布:', sorted(lv.items()))
print('必杀技条数合计', sum(lv.values()))
lv2 = collections.Counter()
for r in rows:
    for k in range(21, 37, 2):
        if isinstance(r[k], str) and isinstance(r[k+1], (int,float)):
            lv2[int(r[k+1])] += 1
print('军师技解锁等级分布:', sorted(lv2.items()), 'total', sum(lv2.values()))
# 剧本出场
for base_i, name in ((37,'黄巾之乱'),(39,'讨伐董卓'),(41,'群雄割据'),(43,'赤壁之战'),(45,'三国鼎立')):
    st = collections.Counter(r[base_i+1] for r in rows if isinstance(r[base_i], str))
    print(name, dict(st))
