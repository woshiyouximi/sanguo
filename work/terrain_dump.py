import re
t = open(r'F:\sanguo\extract\pak\SANGO.INI', 'rb').read().decode('cp950')
blocks = re.split(r'(?=\[TERRAIN\])', t)
n = 0
for b in blocks:
    if not b.startswith('[TERRAIN]'): continue
    body = b[len('[TERRAIN]'):]
    def get(k):
        m = re.search(r'^\s*%s\s*=\s*(.*)$' % k, body, re.M)
        return m.group(1).strip() if m else ''
    print('%2d  %-6s seq=%-3s snd=%-2s floor=%-22s fg=%s' % (n, get('Name'), get('Sequence'), get('SoundTrack'), get('Floor'), get('Foreground')))
    n += 1
print('total', n)
