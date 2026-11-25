import re
p = r'F:\sanguo\extract\pak\SANGO.INI'
t = open(p, 'rb').read().decode('cp950')
secs = re.findall(r'^\[([^\]]+)\]', t, re.M)
print('sections', len(secs), secs[:12])
idx = [m.start() for m in re.finditer(r'\[TERRAIN', t)]
print('TERRAIN sections', len(idx))
if idx:
    print(t[idx[0]:idx[0]+800])
# SYSTEM block
m = re.search(r'\[SYSTEM\](.*?)(?=\n\[)', t, re.S)
if m:
    print('=== [SYSTEM] ===')
    print(m.group(1).strip()[:1500])
