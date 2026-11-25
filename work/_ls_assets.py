import os, glob
from PIL import Image
for d in [r"F:\sanguo\export\png\SHAPE\MENU", r"F:\sanguo\export\png\SHAPE\BG", r"F:\sanguo\export\png\SHAPE\POLICY", r"F:\sanguo\export\png\SHAPE\MAP"]:
    print("==", d)
    fs = sorted(glob.glob(os.path.join(d, "*.png")))
    print("count", len(fs))
    for f in fs:
        n = os.path.basename(f); s = os.path.getsize(f)
        try:
            im = Image.open(f); wh = "%dx%d" % im.size
        except Exception as e:
            wh = "ERR"
        print("  %-22s %-11s %8d" % (n, wh, s))
