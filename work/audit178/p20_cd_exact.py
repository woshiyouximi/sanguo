import subprocess, os, numpy as np

FF = r"C:\Users\liutian\AppData\Local\oopz\ffmpeg.exe"
VID = r"F:\sanguo\work\bili\p01.mp4"
OUT = r"F:\sanguo\work\audit178"
RAW = os.path.join(OUT, "cd_raw.raw")
T0 = 466.0          # 07:46
DUR = 76.0
W, H = 60, 26
X, Y = 293, 262

if not os.path.exists(RAW):
    subprocess.run([FF, "-y", "-ss", str(T0), "-t", str(DUR), "-i", VID,
                    "-vf", f"crop={W}:{H}:{X}:{Y},format=gray",
                    "-f", "rawvideo", "-pix_fmt", "gray", RAW], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

buf = np.fromfile(RAW, dtype=np.uint8)
n = buf.size // (W * H)
fr = buf[:n * W * H].reshape(n, H, W)
print("frames", n)

masks = (fr < 45)
dark = masks.reshape(n, -1).sum(1)
black = masks.reshape(n, -1).all(1)

changes = []
prev = None
for i in range(n):
    if black[i]:
        continue
    m = masks[i]
    if prev is not None:
        d = int((m ^ prev).sum())
        if d > 6:
            changes.append((i, d))
    prev = m

print("change frames:", len(changes))
lines = []
for i, d in changes:
    lines.append(f"f{i:4d} t={T0 + i / 30:7.2f} xor={d:3d}")
print("\n".join(lines[:60]))
print("...")
print("\n".join(lines[-10:]))

ds = [changes[k + 1][0] - changes[k][0] for k in range(len(changes) - 1)]
print("delta frames:", ds)
import statistics
print("median delta", statistics.median(ds), "mean", sum(ds) / len(ds))
