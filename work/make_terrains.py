import os
from PIL import Image
src = r'F:\sanguo\extract\pak\SHAPE\BG'
tw, th = 320, 240
sheet = Image.new('RGB', (tw*4, th*3), (0,0,0))
for i in range(12):
    p = os.path.join(src, 'FLOOR%02d.TGA' % i)
    im = Image.open(p).convert('RGB').resize((tw, th), Image.LANCZOS)
    sheet.paste(im, ((i%4)*tw, (i//4)*th))
    # also export full-size png for docs
    Image.open(p).convert('RGB').save(r'F:\sanguo\docs\img\deleted_placeholder.png') if False else None
out = r'F:\sanguo\docs\img\terrains_12.png'
sheet.save(out)
print('saved', sheet.size)

# individual full-size floors for reference
fd = r'F:\sanguo\docs\img\floors'
os.makedirs(fd, exist_ok=True)
for i in range(12):
    p = os.path.join(src, 'FLOOR%02d.TGA' % i)
    Image.open(p).convert('RGB').save(os.path.join(fd, 'FLOOR%02d.png' % i))
print('floors exported', len(os.listdir(fd)))
