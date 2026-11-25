# -*- coding: utf-8 -*-
import sys, json
sys.path.insert(0, r'F:\sanguo\work'); sys.path.insert(0, r'F:\sanguo\tools')
import magic_map as MM

seqmap = MM.things_seqmap()
d = json.load(open(MM.THINGS_JSON, encoding='utf-8'))
by = {}
for o in d['objects']:
    s = o.get('sequence')
    if isinstance(s, int) and 10000 <= s < 60000:
        by.setdefault(s, (o.get('directory'), o.get('name')))
for dd in (0, 1, 10, 12, 16, 19, 20, 21, 22, 26, 27, 30, 31, 32, 36, 38, 41):
    items = sorted((s, v) for s, v in by.items() if v[0] and ('%03d' % dd) in v[0])
    print('--- 鐩綍 %03d : %d 涓璞?---' % (dd, len(items)))
    for s, v in items[:6]:
        print('   %6d  %-14s %s' % (s, v[0], v[1]))
print('\n10001..10020 鐨勫綊灞?')
for s in range(10001, 10021):
    print('  %d -> %s' % (s, by.get(s)))
print('\n鍏朵粬鍏抽敭鍊?', {v: by.get(v) for v in (11001, 14001, 20001, 22001, 26001, 27001, 30001, 31001, 32001, 36001, 38001, 41001, 51001, 15008, 15009)})

