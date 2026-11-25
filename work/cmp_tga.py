import numpy as np
from PIL import Image
a = np.asarray(Image.open(r'F:\sanguo\export\png_tga\FLOOR04.png').convert('RGB')).astype(float)
b = np.asarray(Image.open(r'F:\sanguo\work\floor04_rgb555.png').convert('RGB')).astype(float)
print('export size', a.shape, 'mean RGB', a.reshape(-1,3).mean(0).round(1))
print('mine   size', b.shape, 'mean RGB', b.reshape(-1,3).mean(0).round(1))
if a.shape == b.shape:
    print('mean abs diff', np.abs(a-b).mean().round(2))
