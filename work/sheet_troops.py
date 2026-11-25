import os
from PIL import Image
dst = r'F:\sanguo\project\art_ref\cloud_v0\troops26'
names = sorted(os.listdir(dst))
fronts = sorted([n for n in names if 'front' in n])
backs  = sorted([n for n in names if 'back' in n])
seq = []
for f, b in zip(fronts, backs):
    seq.append(f); seq.append(b)
cw, ch, cols = 260, 390, 6
rows = (len(seq)+cols-1)//cols
sheet = Image.new('RGB', (cw*cols, ch*rows), (18,18,20))
for i, n in enumerate(seq):
    im = Image.open(os.path.join(dst, n)).convert('RGB').resize((cw, ch), Image.LANCZOS)
    sheet.paste(im, ((i%cols)*cw, (i//cols)*ch))
out = r'F:\sanguo\project\art_ref\cloud_v0_troops26.jpg'
sheet.save(out, quality=86)
print('sheet', sheet.size)
