import sys
from PIL import Image
for p in sys.argv[1:]:
    try:
        im = Image.open(p)
        print("%-52s %dx%d" % (p.split("\\")[-1], im.size[0], im.size[1]))
    except Exception as e:
        print(p, "ERR", e)