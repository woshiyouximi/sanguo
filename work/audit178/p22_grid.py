import sys, os, numpy as np
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT
FF = _mk.FF
VID = r"F:\sanguo\work\bili\p01.mp4"
import subprocess

def raw_window(t0, dur, w=640, h=360):
    p = os.path.join(OUT, f"win_{int(t0*10)}_{int(dur*10)}.raw")
    if not os.path.exists(p):
        subprocess.run([FF, "-y", "-ss", str(t0), "-t", str(dur), "-i", VID,
                        "-vf", "format=rgb24", "-f", "rawvideo", "-pix_fmt", "rgb24", p],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    b = np.fromfile(p, dtype=np.uint8)
    n = b.size // (w * h * 3)
    return b[:n * w * h * 3].reshape(n, h, w, 3)

def label(mask):
    """simple 4-conn CCL via BFS"""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    cur = 0
    out = []
    ys, xs = np.nonzero(mask)
    seen = np.zeros((h, w), bool)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        cur += 1
        stack = [(y0, x0)]
        seen[y0, x0] = True
        pts = []
        while stack:
            y, x = stack.pop()
            pts.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        pts = np.array(pts)
        if len(pts) > 120:
            out.append(dict(n=len(pts),
                            cy=pts[:, 0].mean(), cx=pts[:, 1].mean(),
                            y0=pts[:, 0].min(), y1=pts[:, 0].max(),
                            x0=pts[:, 1].min(), x1=pts[:, 1].max()))
    return out

if __name__ == "__main__":
    frames = raw_window(470.0, 0.2)       # 07:50.0 敌方列阵
    im = frames[0]
    Image.fromarray(im).save(os.path.join(OUT, "blob_src_0750.png"))
    r = im[:, :, 0].astype(int); g = im[:, :, 1].astype(int); b = im[:, :, 2].astype(int)
    # 士兵：蓝白甲 + 深色头/靴，地面是棕黄 (r>g>b)
    soldier = ((b > r + 25) | ((r < 90) & (g < 90))) & (np.arange(360)[:, None] > 30) \
              & (np.arange(360)[:, None] < 300)
    blobs = label(soldier)
    blobs.sort(key=lambda d: d["cy"])
    print("blobs", len(blobs))
    for d in blobs[:40]:
        print(f"  cy={d['cy']:6.1f} cx={d['cx']:6.1f} h={d['y1']-d['y0']:3d} w={d['x1']-d['x0']:3d} px={d['n']}")
