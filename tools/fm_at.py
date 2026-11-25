import sys, io
rows = io.open(r'F:\sanguo\work\funcmap.tsv', encoding='utf-8').read().splitlines()
a = int(sys.argv[1], 16)
if a < 0x400000:
    a += 0x400000
best = None
for r in rows:
    p = r.split('\t')
    va = int(p[0], 16)
    size = int(p[1])
    if va <= a < va + size:
        if best is None or va > best[0]:
            best = (va, size, p[2], p[3])
if best:
    print('func %08X size=%d  strs=%s  imps=%s' % best)
    print('offset into func = 0x%X' % (a - best[0]))
else:
    print('not found')
