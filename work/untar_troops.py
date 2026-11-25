import tarfile, os, shutil
from PIL import Image
dst = r'F:\sanguo\project\art_ref\cloud_v0\troops26'
os.makedirs(dst, exist_ok=True)
with tarfile.open(r'F:\sanguo\work\troops26.tar.gz','r:gz') as tf:
    for m in tf.getmembers():
        if m.isfile():
            with tf.extractfile(m) as s, open(os.path.join(dst, m.name.split('/')[-1]),'wb') as f:
                shutil.copyfileobj(s, f)
names = sorted(os.listdir(dst))
print('files', len(names))
# 13 行 × 2 列（front/back 相邻）
order = []
for n in names:
    pass
cw, ch = 300, 450
fronts = [n for n in names if 'front' in n]
backs  = [n for n in names if 'back' in n]
rows = max(len(fronts), len(backs))
sheet = Image.new('RGB', (cw*2, ch*rows), (18,18,20))
for i, n in enumerate(fronts):
    im = Image.open(os.path.join(dst, n)).convert('RGB'); im.thumbnail((cw,ch), Image.LANCZOS)
    sheet.paste(im, (0, i*ch))
for i, n in enumerate(backs):
    im = Image.open(os.path.join(dst, n)).convert('RGB'); im.thumbnail((cw,ch), Image.LANCZOS)
    sheet.paste(im, (cw, i*ch))
out = r'F:\sanguo\project\art_ref\cloud_v0_troops26.jpg'
sheet.save(out, quality=85)
print('sheet', sheet.size, out)
