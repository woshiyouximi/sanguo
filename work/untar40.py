import tarfile, os, shutil
from PIL import Image
dst = r'F:\sanguo\project\art_ref\cloud_v0\heroes40'
os.makedirs(dst, exist_ok=True)
with tarfile.open(r'F:\sanguo\work\h40.tar.gz', 'r:gz') as tf:
    for m in tf.getmembers():
        if not m.isfile():
            continue
        name = m.name.split('/')[-1]
        with tf.extractfile(m) as src, open(os.path.join(dst, name), 'wb') as fp:
            shutil.copyfileobj(src, fp)
names = sorted(os.listdir(dst))
print('files', len(names))
cw, ch, cols = 260, 380, 8
rows = (len(names) + cols - 1)//cols
sheet = Image.new('RGB', (cw*cols, ch*rows), (16,16,18))
for i, n in enumerate(names):
    im = Image.open(os.path.join(dst, n)).convert('RGB')
    im.thumbnail((cw, ch), Image.LANCZOS)
    sheet.paste(im, ((i%cols)*cw + (cw-im.width)//2, (i//cols)*ch + (ch-im.height)//2))
out = r'F:\sanguo\project\art_ref\cloud_v0_heroes40.jpg'
sheet.save(out, quality=82)
print('sheet', sheet.size)
