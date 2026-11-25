import struct, numpy as np
base = r'F:\sanguo\extract\pak\SHAPE\POLICY\PALAIS01'
d = open(base + '.SHP', 'rb').read()
w = struct.unpack_from('<I', d, 0x14)[0]; n = struct.unpack_from('<I', d, 0x18)[0]
offs = struct.unpack_from('<%dI' % n, d, 0x24)
raw565 = np.zeros((n, w), dtype=np.int32)
filled = np.zeros((n, w), dtype=bool)
for k in range(n):
    p = offs[k]; y = k
    while p < len(d):
        a, cnt = struct.unpack_from('<HH', d, p); p += 4
        if a == 0xFFFF and cnt == 0xFFFF: break
        yy, x0 = a, cnt
        p2 = p
        words = struct.unpack_from('<%dH' % (cnt - 0), d, p2)
        # NOTE: layout = u16 y, u16 n, then n u16 colors; here a=y, cnt=n actually
        break
    # redo properly
    p = offs[k]
    while True:
        yy, cc = struct.unpack_from('<HH', d, p); p += 4
        if yy == 0xFFFF: break
        cols = struct.unpack_from('<%dH' % cc, d, p); p += cc*2
        raw565[yy, :cc] = cols[:cc]
        filled[yy, :cc] = True
        break
tex = np.frombuffer(open(base + '.TEX','rb').read()[18:18+640*480*2], dtype='<u2').astype(np.int32).reshape(480, 640)
tr = (tex >> 10) & 0x1F
sr = (raw565 >> 11) & 0x1F
print('rows filled', filled.sum(), 'all', raw565.size)
for label, cand in (('sr>>1', sr >> 1), ('sr', sr)):
    for flip in (True, False):
        a = tr[::-1] if flip else tr
        eq = (a == cand).mean()
        print(label, 'flip' if flip else 'noflip', 'eq=%.5f' % eq)
# also green/blue
tg = (tex >> 5) & 0x1F; sg = (raw565 >> 5) & 0x3F
print('G match', ((tg[::-1] == (sg[::-1] >> 1))).mean())
