"""Build the 8x6 acceptance contact sheet (48 evenly sampled heroes)."""
import pathlib
from PIL import Image

SRC = pathlib.Path(r'F:\sanguo\proto\ui\assets\hero')
OUT = pathlib.Path(r'F:\sanguo\project\art_ref\cloud_v0_heroes_final.jpg')
COLS, ROWS = 8, 6
CW, CH = 240, 350
BG = (0x12, 0x15, 0x1A)

files = sorted(SRC.glob('*.png'))
n = COLS * ROWS
if len(files) > n:
    step = len(files) / n
    pick = [files[int(i * step)] for i in range(n)]
else:
    pick = files

print('source files', len(files), 'sampled', len(pick))

sheet = Image.new('RGB', (COLS * CW, ROWS * CH), BG)
for i, f in enumerate(pick):
    im = Image.open(f).convert('RGB')
    im.thumbnail((CW, CH), Image.LANCZOS)
    x = (i % COLS) * CW + (CW - im.width) // 2
    y = (i // COLS) * CH + (CH - im.height) // 2
    sheet.paste(im, (x, y))

sheet.save(OUT, 'JPEG', quality=90, optimize=True)
print('wrote', OUT, sheet.size)
print('names', ','.join(f.stem for f in pick))
