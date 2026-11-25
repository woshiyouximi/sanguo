import re, collections, io, sys
sys.stdout.reconfigure(encoding='utf-8')
txt = open(r'F:\sanguo\work\funcmap3.tsv', encoding='utf-8', errors='replace').read()
hdr = re.compile(r'(?m)^([0-9A-F]{8})\t(\d+)\t')
ms = list(hdr.finditer(txt))
print('functions', len(ms))
pages = collections.defaultdict(list)
for i, m in enumerate(ms):
    end = ms[i+1].start() if i+1 < len(ms) else len(txt)
    body = txt[m.end():end]
    va = int(m.group(1), 16)
    pages[va >> 12].append((va, int(m.group(2)), body.strip()))
want = [(0x400,0x413),(0x43A,0x444),(0x45A,0x463),(0x433,0x437)]
for lo, hi in want:
    for pg in range(lo, hi):
        lst = pages.get(pg)
        if not lst: continue
        print('\n### page %05X000  fns=%d' % (pg, len(lst)))
        for va, sz, body in lst[:40]:
            b = ' '.join(body.split())
            print('  %08X %5d  %s' % (va, sz, b[:160]))
