import sys, io
pat = sys.argv[1] if len(sys.argv) > 1 else ''
rows = io.open(r'F:\sanguo\work\funcmap.tsv', encoding='utf-8').read().splitlines()
n = 0
for r in rows:
    p = r.split('\t')
    if pat.lower() in r.lower():
        print('%s  size=%-6s  strs=%s  |  imps=%s' % (p[0], p[1], p[2][:110], p[3][:90]))
        n += 1
print('matched', n)
