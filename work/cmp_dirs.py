from PIL import Image
import numpy as np, os, hashlib
for d in (r'F:\sanguo\export\png_tex', r'F:\sanguo\export\png\tex'):
    for f in sorted(os.listdir(d))[:2]:
        p = os.path.join(d, f)
        a = np.asarray(Image.open(p).convert('RGB'))
        print(d.split('sanguo')[-1], f, a.shape, a.reshape(-1,3).mean(axis=0).round(1))
