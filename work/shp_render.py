import struct, numpy as np
from PIL import Image
base = r'F:\sanguo\extract\pak\SHAPE\POLICY\PALAIS01'
d = open(base + '.SHP', 'rb').read()
w = struct.unpack_from('<I', d, 0x14)[0]; n = struct.unpack_from('<I', d, 0x18)[0]
offs = struct.unpack_from('<%dI' % n, d, 0x24)
raw = np.zeros((n, w), dtype=np.uint16)
for k in range(n):
    p = offs[k]
    yy, cc = struct.unpack_from('<HH', d, p); p += 4
    cols = np.frombuffer(d, dtype='<u2', count=cc, offset=p)
    raw[yy, :cc] = cols
r = ((raw >> 11) & 0x1F).astype(np.uint16)
g = ((raw >> 5) & 0x3F).astype(np.uint16)
b = (raw & 0x1F).astype(np.uint16)
rgb = np.stack([(r*255//31), (g*255//63), (b*255//31)], -1).astype(np.uint8)
Image.fromarray(rgb).save(r'F:\sanguo\work\shp_palais01_raw.png')
print('saved', rgb.shape, rgb.mean(axis=(0,1)))
