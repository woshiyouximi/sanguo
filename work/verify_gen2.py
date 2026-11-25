import re
t = open(r'F:\sanguo\extract\pak\TIMES1.INI','rb').read().decode('cp950')
blocks = re.split(r'(?=\[GENERAL\])', t)
gs = [b for b in blocks if b.startswith('[GENERAL]')]
print(gs[0][:600])
print('=== last ===')
print(gs[-1][:400])
