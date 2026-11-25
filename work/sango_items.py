import re
t = open(r'F:\sanguo\extract\pak\SANGO.INI', 'rb').read().decode('cp950')
m = re.search(r'\[SCRIPT\](.{0,400}?)(?=\n\[)', t, re.S)
print('=== [SCRIPT] ===')
print(m.group(1).strip() if m else 'none')
blocks = re.findall(r'\[ITEM\](.*?)(?=\n\[|\Z)', t, re.S)
print('items', len(blocks))
for b in blocks[:4]:
    print(b.strip()[:500]); print('---')
