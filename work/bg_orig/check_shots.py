# 判断每张地形截图是不是「背景接线后」拍的：纯色底 → 段内方差极低；贴图 → 方差高。
import glob
import os
import numpy as np
from PIL import Image

FILES = sorted(glob.glob(r'F:\sanguo\work\bg_orig\terrain_*.png'))
print('%-22s %8s %9s %10s %10s %10s  verdict' % ('file', 'bytes', 'mtime', 'band sd', 'field sd', 'field mean'))
for f in FILES:
    im = Image.open(f).convert('RGB')
    a = np.asarray(im)
    band = a[140:196, 40:710].astype(np.float32)
    field = a[300:880, 40:710].astype(np.float32)
    bsd = float(band.std())
    fsd = float(field.std())
    fm = float(field.mean())
    verdict = 'wired?' if (fsd > 18 or bsd > 26) else 'FLAT(color)'
    st = os.stat(f)
    import time
    mt = time.strftime('%H:%M:%S', time.localtime(st.st_mtime))
    print('%-22s %8d %9s %10.1f %10.1f %10.1f  %s' % (os.path.basename(f), st.st_size, mt, bsd, fsd, fm, verdict))
