import os
from PIL import Image
src = r'F:\sanguo\export\png'
out = r'F:\sanguo\docs\img'
os.makedirs(out, exist_ok=True)

def save(im, name):
    im.save(os.path.join(out, name))
    print(name, im.size)

# 1) world map (1280x960 -> 640x480)
m = Image.open(os.path.join(src, 'MAP', 'CHINAMAP.SHP.png')).convert('RGB')
save(m.resize((640, 480), Image.LANCZOS), 'map_chinamap.png')

# 2) faces grid 8x5 of first 40
faces = []
for i in range(1, 41):
    p = os.path.join(src, 'FACE', 'FACE%03d.SHP.png' % i)
    if os.path.exists(p):
        faces.append(Image.open(p).convert('RGB'))
w, h = faces[0].size
cols, rows = 8, 5
sheet = Image.new('RGB', (cols*w, rows*h), (24, 24, 28))
for k, f in enumerate(faces[:cols*rows]):
    sheet.paste(f, ((k % cols)*w, (k//cols)*h))
save(sheet, 'faces_40.png')

# 3) menu art
for nm in ('TITLEBG', 'COMPANY', 'STAFF'):
    p = os.path.join(src, 'MENU', nm + '.SHP.png')
    if os.path.exists(p):
        im = Image.open(p).convert('RGB')
        save(im, 'menu_%s.png' % nm.lower())
