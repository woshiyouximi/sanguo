import sys
from PIL import Image

path = sys.argv[1]
mode = sys.argv[2] if len(sys.argv) > 2 else "yellow"
y0 = int(sys.argv[3]) if len(sys.argv) > 3 else 890
y1 = int(sys.argv[4]) if len(sys.argv) > 4 else 1000

im = Image.open(path).convert("RGB")
W, H = im.size
px = im.load()
y1 = min(y1, H)

print("image", W, H)
bands = []
cur = None
for y in range(y0, y1):
    n = 0
    for x in range(212, 520, 2):
        r, g, b = px[x, y]
        if mode == "yellow":
            ok = r > 40 and r - b > 18 and g - b > 8 and r >= g
        else:  # blue selection
            ok = b > 90 and b - r > 40 and b - g > 10
        if ok:
            n += 1
    if n > 15:
        if cur is None:
            cur = [y, y]
        else:
            cur[1] = y
    else:
        if cur is not None:
            bands.append(tuple(cur))
            cur = None
if cur is not None:
    bands.append(tuple(cur))
print(mode, "bands:", bands)
