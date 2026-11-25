from PIL import Image
from collections import Counter
im = Image.open(r'F:\sanguo\work\shot_start.png').convert('RGB')
w,h = im.size
c = Counter()
for y in range(100, 1000, 2):
    for x in range(0, 750, 2):
        c[im.getpixel((x,y))] += 1
for col,n in c.most_common(12):
    print(col, n)
