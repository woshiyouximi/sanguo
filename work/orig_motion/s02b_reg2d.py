# s02b_reg2d.py -- 二维相位相关：测每帧相对上一帧的 (dx,dy) 背景位移（相机滚动）
# 原理：城楼/山体在世界坐标静止，画面位移 = 相机滚动；用 FFT 相位相关求整像素平移。
# 输出 out/reg2d.csv (frame, dx, dy, peak, cum_x, cum_y)
import os
import numpy as np
from PIL import Image

ROOT = r'F:\sanguo\work\orig_motion'
OUT = os.path.join(ROOT, 'out')
os.makedirs(OUT, exist_ok=True)
N = 660
BAND = (12, 78)      # 背景条带（城楼+山），单位极少进入
X0, X1 = 82, 562     # 战场横向范围


def gray(i):
    a = np.asarray(Image.open(os.path.join(ROOT, 'f30', 'f%04d.png' % i)).convert('RGB'), dtype=np.float32)
    return a.mean(axis=2)


def phase_shift(a, b, maxs=24):
    """a,b 同尺寸；返回 b 相对 a 的平移 (dx,dy)，使 b(x+dx,y+dy) ~ a(x,y)"""
    h, w = a.shape
    wy = np.hanning(h)[:, None]
    wx = np.hanning(w)[None, :]
    A = np.fft.rfft2((a - a.mean()) * wy * wx)
    B = np.fft.rfft2((b - b.mean()) * wy * wx)
    R = A * np.conj(B)
    R /= (np.abs(R) + 1e-9)
    r = np.fft.irfft2(R, s=(h, w))
    # 只在 |shift|<=maxs 里找峰（避免环绕）
    r2 = np.fft.fftshift(r)
    cy, cx = h // 2, w // 2
    sub = r2[cy - maxs:cy + maxs + 1, cx - maxs:cx + maxs + 1]
    iy, ix = np.unravel_index(np.argmax(sub), sub.shape)
    dy = iy - maxs
    dx = ix - maxs
    return dx, dy, float(sub.max())


def main():
    prev = gray(1)
    rows = [(1, 0, 0, 1.0, 0, 0)]
    cx = cy = 0
    for i in range(2, N + 1):
        cur = gray(i)
        a = prev[BAND[0]:BAND[1], X0:X1]
        b = cur[BAND[0]:BAND[1], X0:X1]
        dx, dy, pk = phase_shift(a, b)
        cx += dx
        cy += dy
        rows.append((i, dx, dy, pk, cx, cy))
        prev = cur
    with open(os.path.join(OUT, 'reg2d.csv'), 'w', encoding='utf-8') as f:
        f.write('frame,dx,dy,peak,cum_x,cum_y\n')
        for r in rows:
            f.write('%d,%d,%d,%.4f,%d,%d\n' % r)
    print('frame   dx  dy  peak   cum_x cum_y')
    for r in rows:
        if r[0] % 15 == 2:
            print('%4d  %+3d %+3d  %.3f  %5d %5d' % r)
    print('total cum_x=%d cum_y=%d' % (cx, cy))
    # 直方图
    dxs = np.array([r[1] for r in rows])
    dys = np.array([r[2] for r in rows])
    print('dx hist', dict(zip(*np.unique(dxs, return_counts=True))))
    print('dy hist', dict(zip(*np.unique(dys, return_counts=True))))


if __name__ == '__main__':
    main()
