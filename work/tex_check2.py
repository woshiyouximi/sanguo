import sys, numpy as np
sys.path.insert(0, r'F:\sanguo\tools')
import sango_shp
from PIL import Image
base = r'F:\sanguo\extract\pak\SHAPE\POLICY\PALAIS01'
a = np.asarray(sango_shp.to_image(sango_shp.load(base + '.SHP')).convert('RGB')).astype(np.int32)
raw = open(base + '.TEX', 'rb').read()
px = np.frombuffer(raw[0x14:0x14+640*480*2], dtype='<u2').astype(np.int32).reshape(480, 640)

def d_r4g5b5(v):
    r = ((v >> 10) & 0xF) * 17
    g = ((v >> 5) & 0x1F) * 255 // 31
    b = (v & 0x1F) * 255 // 31
    return np.stack([r, g, b], -1)

def d_bgr(v):
    b = ((v >> 11) & 0x1F) * 255 // 31
    g = ((v >> 5) & 0x3F) * 255 // 63
    r = (v & 0x1F) * 255 // 31
    return np.stack([r, g, b], -1)

for name, fn in [('r4g5b5', d_r4g5b5), ('565-bgr', d_bgr)]:
    for flip in (False, True):
        t = fn(px)
        if flip: t = t[::-1]
        err = np.abs(t - a).mean()
        print(name, 'flip' if flip else 'noflip', '%.2f' % err)

# save side-by-side crops for eyeball
t = d_r4g5b5(px)[::-1]
Image.fromarray(t.astype(np.uint8)).save(r'F:\sanguo\work\tex_r4g5b5.png')
Image.fromarray(a.astype(np.uint8)).save(r'F:\sanguo\work\shp_palais01.png')
print('saved')
