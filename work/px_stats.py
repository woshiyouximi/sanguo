from PIL import Image
import numpy as np
im = np.asarray(Image.open(r'F:\sanguo\work\sp3.png').convert('RGB')).astype(float)
def stats(y0, y1, x0, x1, name):
    a = im[y0:y1, x0:x1]
    # 只统计明显亮于背景的像素（单位）
    m = a.sum(axis=2) > 150
    if m.sum() == 0:
        print(name, 'empty'); return
    px = a[m]
    print(name, 'px', m.sum(), 'meanRGB', px.mean(axis=0).round(1))
stats(180, 500, 100, 260, 'top-left (敌方?)')
stats(560, 800, 110, 280, 'bottom-left (我方?)')
stats(180, 500, 520, 700, 'top-right')
