import pathlib, json
from PIL import Image
src = pathlib.Path(r'F:\sanguo\proto\ui\assets\hero')
dst = pathlib.Path(r'F:\sanguo\game\web\assets\hero'); dst.mkdir(parents=True, exist_ok=True)
n = 0
for p in sorted(src.glob('*.png')):
    im = Image.open(p).convert('RGB')
    w = 480; h = int(im.height * w / im.width)
    im.resize((w, h), Image.LANCZOS).save(dst / (p.stem + '.png'), optimize=True)
    n += 1
print('resized', n, 'size MB', round(sum(f.stat().st_size for f in dst.glob('*.png'))/1048576, 1))
