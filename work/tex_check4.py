import sys, numpy as np
sys.path.insert(0, r'F:\sanguo\tools')
import sango_shp
from PIL import Image
base = r'F:\sanguo\extract\pak\SHAPE\POLICY\PALAIS01'
a = np.asarray(sango_shp.to_image(sango_shp.load(base+'.SHP')).convert('RGB')).astype(np.int32)
b = np.asarray(Image.open(base+'.TEX').convert('RGB')).astype(np.int32)
for name, arr in [('rgb', b), ('bgr', b[:, :, ::-1])]:
    for fl in (0,1):
        t = arr[::-1] if fl else arr
        print(name, 'flip', fl, 'err %.2f' % np.abs(a-t).mean())
print('sample SHP', a[200,300], a[100,100])
print('sample TEX', b[200,300], b[100,100])
Image.fromarray(b.astype(np.uint8)).save(r'F:\sanguo\work\tex_pillow.png')
