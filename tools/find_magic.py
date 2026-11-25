import sys
EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
data = open(EXE, 'rb').read()
TEXT_OFF, TEXT_VA = 0x400, 0x401000


def va(o):
    return o - TEXT_OFF + TEXT_VA


pats = {'SSAV(LE)': b'SSAV', 'ver 0x20000': b'\x00\x00\x02\x00'}
for k, p in pats.items():
    i, hits = 0, []
    while True:
        i = data.find(p, i)
        if i < 0:
            break
        hits.append(i)
        i += 1
    print('%s : %d hits' % (k, len(hits)))
    for h in hits[:16]:
        print('   off=0x%X  ~va=0x%X  ctx=%s' % (h, va(h), data[max(0, h - 10):h + 12].hex()))
