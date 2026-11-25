# z.py -- 裁剪+放大任意帧区域，输出到 speed_arb/z_*.png
# usage: z.py <frame> <x0> <y0> <x1> <y1> <scale> <outname>
import sys, os
import numpy as np
from PIL import Image
F30 = r'F:\sanguo\work\orig_motion\f30'
OUT = r'F:\sanguo\work\speed_arb'
i, x0, y0, x1, y1, sc = (int(a) for a in sys.argv[1:7])
name = sys.argv[7] if len(sys.argv) > 7 else 'z'
a = np.asarray(Image.open(os.path.join(F30, 'f%04d.png' % i)).convert('RGB'))
sub = a[y0:y1, x0:x1]
img = Image.fromarray(sub).resize((sub.shape[1] * sc, sub.shape[0] * sc), Image.NEAREST)
p = os.path.join(OUT, name + '.png')
img.save(p)
print(p, img.size)
