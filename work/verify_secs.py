import re
t = open(r'F:\sanguo\extract\pak\TIMES1.INI','rb').read().decode('cp950')
secs = re.findall(r'^\[([^\]]+)\]', t, re.M)
g = [s for s in secs if s.startswith('GENERAL')]
p = [s for s in secs if s.startswith('PATH')]
print('GENERAL', len(g), g[:3], g[-3:])
print('PATH', len(p), p[:3], p[-3:])
print('non-numeric', [s for s in secs if not re.search(r'\d+$', s)][:10])
