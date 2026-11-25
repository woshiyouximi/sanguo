import os
from PIL import Image
d = r'F:\sanguo\project\art_ref\cloud_v0'
names = sorted([f for f in os.listdir(d) if f.endswith('.png')])
cw, ch = 300, 420
cols = 6
rows = (len(names) + cols - 1) // cols
sheet = Image.new('RGB', (cw*cols, ch*rows), (16,16,18))
for i, n in enumerate(names):
    im = Image.open(os.path.join(d, n)).convert('RGB')
    im.thumbnail((cw, ch), Image.LANCZOS)
    x = (i % cols) * cw + (cw - im.width)//2
    y = (i // cols) * ch + (ch - im.height)//2
    sheet.paste(im, (x, y))
out = r'F:\sanguo\project\art_ref\cloud_v0_contact.jpg'
sheet.save(out, quality=85)
print('sheet', sheet.size, out, len(names))
