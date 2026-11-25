from PIL import Image
import os, glob
h = sorted(glob.glob(r"F:\sanguo\game\cocos\assets\bundles\res\hero\*.webp"))
print("hero files", len(h))
im = Image.open(h[0]); print("hero sample", os.path.basename(h[0]), im.size, im.mode, os.path.getsize(h[0])//1024, "KB")
f = sorted(glob.glob(r"F:\sanguo\game\cocos\assets\bundles\res\fx\*.png"))
print("fx files", len(f))
for p in f[:6]:
    i = Image.open(p); print("  ", os.path.basename(p), i.size, i.mode, os.path.getsize(p)//1024, "KB")
sizes = sorted(((os.path.getsize(p), p) for p in f), reverse=True)[:3]
print("fx largest:", [(os.path.basename(p), s//1024) for s,p in sizes])
