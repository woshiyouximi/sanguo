import io, sys, numpy as np
sys.path.insert(0, r'F:\sanguo\tools')
import sango_shp
from PIL import Image

base = r'F:\sanguo\extract\pak\SHAPE\POLICY\PALAIS01'
shp = sango_shp.load(base + '.SHP')
img = sango_shp.to_image(shp).convert('RGB')
a = np.asarray(img).astype(np.int32)
print('SHP', img.size, shp.width, shp.height, shp.key)

raw = open(base + '.TEX', 'rb').read()
hdr = raw[:0x14]
print('TEX header', hdr.hex())
px = np.frombuffer(raw[0x14:0x14+640*480*2], dtype='<u2').astype(np.int32).reshape(480, 640)

def dec565(v):
    r = ((v >> 11) & 0x1F) * 255 // 31
    g = ((v >> 5) & 0x3F) * 255 // 63
    b = (v & 0x1F) * 255 // 31
    return np.stack([r, g, b], -1)

def dec555(v):
    r = ((v >> 10) & 0x1F) * 255 // 31
    g = ((v >> 5) & 0x1F) * 255 // 31
    b = (v & 0x1F) * 255 // 31
    return np.stack([r, g, b], -1)

for name, fn in [('565', dec565), ('555', dec555)]:
    for flip in (False, True):
        t = fn(px)
        if flip: t = t[::-1]
        err = np.abs(t.astype(np.int32) - a.astype(np.int32)).mean()
        print(name, 'flip' if flip else 'noflip', 'mean abs err %.2f' % err)
