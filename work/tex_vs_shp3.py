import struct, numpy as np
from PIL import Image
base = r'F:\sanguo\extract\pak\SHAPE\POLICY\PALAIS01'
d = open(base + '.SHP', 'rb').read()
w = struct.unpack_from('<I', d, 0x14)[0]; n = struct.unpack_from('<I', d, 0x18)[0]
offs = struct.unpack_from('<%dI' % n, d, 0x24)
raw = np.zeros((n, w), dtype=np.uint16)
for k in range(n):
    p = offs[k]
    x0, cc = struct.unpack_from('<HH', d, p); p += 4
    cols = np.frombuffer(d, dtype='<u2', count=cc, offset=p)
    raw[k, x0:x0+cc] = cols
r = ((raw >> 11) & 0x1F).astype(np.uint16); g = ((raw >> 5) & 0x3F); b = (raw & 0x1F)
rgb = np.stack([(r*255//31), (g*255//63), (b*255//31)], -1).astype(np.uint8)
Image.fromarray(rgb).save(r'F:\sanguo\work\shp_palais01_raw.png')
print('mean', rgb.mean(axis=(0,1)))

tex = np.frombuffer(open(base + '.TEX','rb').read()[18:18+640*480*2], dtype='<u2').astype(np.int32).reshape(480, 640)
tr = (tex >> 10) & 0x1F; tg = (tex >> 5) & 0x1F; tb = tex & 0x1F
sr = (raw >> 11) & 0x1F; sg = (raw >> 5) & 0x3F; sb = raw & 0x1F
for flip in (False, True):
    a_tr = tr[::-1] if flip else tr
    a_tg = tg[::-1] if flip else tg
    a_tb = tb[::-1] if flip else tb
    print('flip' if flip else 'noflip',
          'R eq(sr>>1)=%.4f' % (a_tr == (sr >> 1)).mean(),
          'G eq(sg>>1)=%.4f' % (a_tg == (sg >> 1)).mean(),
          'B eq(sb)=%.4f' % (a_tb == (sb >> 0)).mean())
