import os, re, collections
d = r'F:\sanguo\extract\pak\SHAPE\MAJOR\BODY'
pat = re.compile(r'^([LR])([0-9A-E])([ADFHLRSW])(\d)(\d{4})\.SHP$')
g = collections.Counter(); bad=[]
for f in os.listdir(d):
    m = pat.match(f)
    if not m: bad.append(f); continue
    g[(m.group(1), m.group(2), m.group(3), m.group(4))] += 1
print('matched groups', len(g), 'files', len(os.listdir(d)), 'unmatched', len(bad), bad[:3])
print('weapon digits', sorted({k[3] for k in g}))
acts = 'ADFHLRSW'
for a in acts:
    tots = sum(v for k,v in g.items() if k[2]==a)
    f0 = g.get(('L','0',a,'1'),0)
    print('action', a, 'files', tots, 'L0%s1 frames' % a, f0)
