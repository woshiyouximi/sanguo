import re, collections
t = open(r'F:\sanguo\extract\pak\SANGO.INI', 'rb').read().decode('cp950')
secs = re.findall(r'^\[([^\]]+)\]', t, re.M)
c = collections.Counter(re.sub(r'\d+$', '', s) for s in secs)
print(dict(c), 'total', len(secs))
print([s for s in secs if not s.startswith('FONTS')])
