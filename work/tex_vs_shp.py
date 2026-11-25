import sys, numpy as np
sys.path.insert(0, r'F:\sanguo\tools')
import sango_shp
from PIL import Image
base = r'F:\sanguo\extract\pak\SHAPE\POLICY\PALAIS01'
raw = open(base + '.TEX', 'rb').read()
tex = np.frombuffer(raw[18:18+640*480*2], dtype='<u2').astype(np.int32).reshape(480, 640)
shp = sango_shp.load(base + '.SHP')
print('shp', shp.width, shp.height, 'hash rows', len(shp.rows))
# rebuild raw 565 from shp rows
img565 = np.zeros((shp.height, shp.width), dtype=np.int32)
for y, runs in enumerate(shp.rows):
    for x, colors in runs:
        for i, c in enumerate(colors):
            if 0 <= x+i < shp.width and 0 <= y < shp.height:
                img565[y, x+i] = c
ok = 0; tot = 0
shp_raw = np.zeros_like(img565)
# need actual raw values: to_rgba loses precision; instead reparse rows with raw words
import struct
d = open(base + '.SHP','rb').read()
w = struct.unpack_from('<I', d, 0x14)[0]; n = struct.unpack_from('<I', d, 0x18)[0]
offs = struct.unpack_from('<%dI' % n, d, 0x24)
for k in range(n):
    p = offs[k]
    while True:
        y, cnt = struct.unpack_from('<HH', d, p); p += 4
        if y == 0xFFFF or cnt == 0xFFFF: break
        for i in range(cnt):
            shp_raw[y, x0 := 0] = 0
        break
print('skipped run-level parse')
# simpler: compare via decoded RGB from sango_shp.to_rgba
rgba = np.asarray(sango_shp.to_image(shp).convert('RGB')).astype(np.int32)
tr = ((tex >> 10) & 0x1F)
tg = ((tex >> 5) & 0x1F)
tb = (tex & 0x1F)
sr = ((rgba[:,:,0] * 31 + 127) // 255)
sg = ((rgba[:,:,1] * 31 + 127) // 255)
sb = ((rgba[:,:,2] * 31 + 127) // 255)
for name, a, b in (('flip', tr[::-1], sr), ('noflip', tr, sr)):
    m = np.abs(a - b) <= 1
    print('R5 match %s: %.4f' % (name, m.mean()))
