import struct
from PIL import Image
import numpy as np
p = r'F:\sanguo\extract\pak\SHAPE\MAP\CHINAMAP1.MSK'
d = open(p,'rb').read()
w,h = struct.unpack_from('<2H', d, 12)
out = bytearray()
i = 0x80
while i < len(d) and len(out) < w*h:
    b = d[i]; i += 1
    if b & 0xC0:
        n = b & 0x3F
        v = d[i]; i += 1
        out.extend(bytes([v])*n)
    else:
        out.append(b)
print('decoded', len(out), 'need', w*h, 'consumed', i, 'of', len(d))
a = np.frombuffer(bytes(out[:w*h]), np.uint8).reshape(h,w)
print('unique vals', np.unique(a)[:20], 'count', len(np.unique(a)))
pal = [(0,0,0),(0,0,128),(0,128,0),(0,128,128),(128,0,0),(128,0,128),(128,128,0),(192,192,192),
       (128,128,128),(0,0,255),(0,255,0),(0,255,255),(255,0,0),(255,0,255),(255,255,0),(255,255,255)]
rgb = np.zeros((h,w,3), np.uint8)
for v in np.unique(a):
    rgb[a==v] = pal[v % 16]
Image.fromarray(rgb).save(r'F:\sanguo\work\msk1_render.png')
Image.fromarray((a.astype(np.uint32)*16).astype(np.uint8)).save(r'F:\sanguo\work\msk1_gray.png')
print('saved')
