import glob, os, sys
from PIL import Image, ImageDraw

def sheet(src, out, cell=170, cols=8, scale_max=150):
    files = sorted(glob.glob(os.path.join(src, '*.png')))
    rows = (len(files) + cols - 1) // cols
    W, H = cols * cell, rows * cell
    canvas = Image.new('RGB', (W, H), (26, 26, 30))
    d = ImageDraw.Draw(canvas)
    for i, p in enumerate(files):
        im = Image.open(p).convert('RGBA')
        w, h = im.size
        s = min(scale_max / w, (cell - 22) / h, 1.0)
        # small art gets integer upscale so pixel grid stays readable
        if s < 1:
            s = max(0.05, s)
        elif s == 1.0:
            s = min(2.0, scale_max / w)
        im2 = im.resize((max(1, int(w * s)), max(1, int(h * s))), Image.NEAREST)
        cx, cy = (i % cols) * cell, (i // cols) * cell
        # checkerboard behind transparency
        for yy in range(cy + 18, cy + cell - 4, 10):
            for xx in range(cx + 4, cx + cell - 4, 10):
                if ((xx - cx) // 10 + (yy - cy) // 10) % 2 == 0:
                    d.rectangle([xx, yy, min(xx + 9, cx + cell - 5), min(yy + 9, cy + cell - 5)], fill=(48, 48, 54))
        ox = cx + (cell - im2.width) // 2
        oy = cy + 18 + (cell - 22 - im2.height) // 2
        canvas.paste(im2, (ox, oy), im2)
        d.text((cx + 4, cy + 4), f'{os.path.basename(p)} {w}x{h}', fill=(230, 220, 180))
        d.rectangle([cx, cy, cx + cell - 1, cy + cell - 1], outline=(70, 70, 80))
    canvas.save(out)
    print(out, canvas.size, len(files))

sheet(r'F:\sanguo\export\png\SHAPE\MENU', r'F:\sanguo\work\ui_orig\_sheet_menu.png', cols=8)
sheet(r'F:\sanguo\export\png\SHAPE\JEWEL', r'F:\sanguo\work\ui_orig\_sheet_jewel.png', cols=8)
