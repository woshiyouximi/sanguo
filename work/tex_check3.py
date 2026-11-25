import sys, numpy as np
sys.path.insert(0, r'F:\sanguo\tools')
import sango_shp
from PIL import Image

base = r'F:\sanguo\extract\pak\SHAPE\POLICY\PALAIS01'
shp = sango_shp.load(base + '.SHP')
a = np.asarray(sango_shp.to_image(shp).convert('RGB')).astype(np.int32)

# 1) Pillow native TGA decode
im = Image.open(base + '.TEX')
print('Pillow:', im.size, im.mode, im.info)
b = np.asarray(im.convert('RGB')).astype(np.int32)
print('Pillow decode mean abs err vs SHP: %.3f' % np.abs(a - b).mean())

# 2) manual 555, flip
raw = open(base + '.TEX','rb').read()
px = np.frombuffer(raw[18:18+640*480*2], dtype='<u2').astype(np.uint32).reshape(480,640)
r = ((px>>10)&0x1F)*255//31; g = ((px>>5)&0x1F)*255//31; bb = (px&0x1F)*255//31
m = np.stack([r,g,bb],-1).astype(np.int32)
for flip in (False, True):
    t = m[::-1] if flip else m
    print('manual555 flip=%s err=%.3f' % (flip, np.abs(a-t).mean()))
