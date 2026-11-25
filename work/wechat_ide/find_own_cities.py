import sys
from PIL import Image

path = sys.argv[1]
x0, y0, x1, y1 = (int(v) for v in sys.argv[2:6])
im = Image.open(path).convert("RGB")
px = im.load()

# own city label colour is #8FD1B6 (cyan-green): g > r and g > b, fairly bright
pts = []
for y in range(y0, y1):
    for x in range(x0, x1):
        r, g, b = px[x, y]
        if g > 120 and g - r > 25 and g - b > 10:
            pts.append((x, y))

print("green pixels:", len(pts))
if not pts:
    sys.exit(0)

# cluster into boxes
pts.sort()
clusters = []
for (x, y) in pts:
    placed = False
    for c in clusters:
        if abs(x - c["cx"]) < 40 and abs(y - c["cy"]) < 14:
            c["xs"].append(x); c["ys"].append(y)
            c["cx"] = sum(c["xs"]) / len(c["xs"]); c["cy"] = sum(c["ys"]) / len(c["ys"])
            placed = True
            break
    if not placed:
        clusters.append({"xs": [x], "ys": [y], "cx": x, "cy": y})

clusters = [c for c in clusters if len(c["xs"]) >= 8]
clusters.sort(key=lambda c: -len(c["xs"]))
for c in clusters:
    print("box x=%d..%d y=%d..%d  n=%d  center=(%d,%d)" % (
        min(c["xs"]), max(c["xs"]), min(c["ys"]), max(c["ys"]), len(c["xs"]),
        int(sum(c["xs"]) / len(c["xs"])), int(sum(c["ys"]) / len(c["ys"]))))
