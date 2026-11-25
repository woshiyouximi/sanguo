import os
from PIL import Image
d = r'F:\sanguo\project\art_ref'
names = ['hero_general','soldier_sheet','battlefield','ui_panel','worldmap']
imgs = [Image.open(os.path.join(d,n+'.png')).convert('RGB') for n in names]
cw = 420
thumbs = []
for im in imgs:
    h = int(im.height * cw / im.width)
    thumbs.append(im.resize((cw,h), Image.LANCZOS))
rowh = max(t.height for t in thumbs)
sheet = Image.new('RGB', (cw*3, rowh*2), (18,18,20))
for i,t in enumerate(thumbs):
    x = (i%3)*cw; y = (i//3)*rowh
    sheet.paste(t, (x,y))
sheet.save(r'F:\sanguo\project\art_ref\_contact.jpg', quality=88)
print('sheet', sheet.size)
for n,im in zip(names,imgs): print(n, im.size)
