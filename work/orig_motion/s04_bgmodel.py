# s04_bgmodel.py -- 用全序列中值构建"静态背景"（相机基本不动，单位是移动的），
#                   然后用帧差提取活动单位掩码。输出:
#                     out/bg_median.png        静态背景
#                     out/diff_f0062.png       差分可视化（用于肉眼确认）
# 用法: python s04_bgmodel.py
import os
import numpy as np
from PIL import Image

ROOT = r'F:\sanguo\work\orig_motion'
OUT = os.path.join(ROOT, 'out')
N = 660
STEP = 3


def main():
    idx = list(range(2, N + 1, STEP))
    stack = np.stack([np.asarray(Image.open(os.path.join(ROOT, 'f30', 'f%04d.png' % i)).convert('RGB'))
                      for i in idx])
    med = np.median(stack, axis=0).astype(np.uint8)
    Image.fromarray(med).save(os.path.join(OUT, 'bg_median.png'))

    for f in (62, 200, 300, 400):
        a = np.asarray(Image.open(os.path.join(ROOT, 'f30', 'f%04d.png' % f)).convert('RGB')).astype(np.int16)
        d = np.abs(a - med.astype(np.int16)).sum(axis=2)
        vis = np.zeros_like(a, dtype=np.uint8)
        vis[..., 0] = np.clip(d, 0, 255)
        vis[..., 1] = (a.mean(axis=2) * 0.35).astype(np.uint8)
        Image.fromarray(vis).save(os.path.join(OUT, 'diff_f%04d.png' % f))
    print('median stack', stack.shape, '-> out/bg_median.png')


if __name__ == '__main__':
    main()
