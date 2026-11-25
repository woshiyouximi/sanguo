import re
t = open(r'F:\sanguo\extract\pak\TIMES1.INI','rb').read().decode('cp950')
blocks = re.split(r'(?=\[GENERAL\])', t)
seqs = []
for b in blocks:
    if not b.startswith('[GENERAL]'): continue
    m = re.search(r'^\s*Sequence\s*=\s*(\d+)', b, re.M)
    seqs.append(int(m.group(1)) if m else None)
print('count', len(seqs), 'none', seqs.count(None), 'min', min(x for x in seqs if x), 'max', max(x for x in seqs if x))
missing = sorted(set(range(1, 401)) - set(x for x in seqs if x))
print('missing count', len(missing), missing[:10])
