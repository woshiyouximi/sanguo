"""Convert game/web 480px hero PNGs to WebP, keeping the PNGs.

Tier cascade per spec: q82@480 -> q78@480 -> q78@420.
Stops at the first tier meeting: every file <= 60 KB and total <= 22 MB.
"""
import glob, os
from PIL import Image

SRC = r'F:\sanguo\game\web\assets\hero'
MAX_ONE = 60 * 1024
MAX_TOTAL = 22 * 1024 * 1024
TIERS = [(82, 480), (78, 480), (78, 420)]


def convert(quality, width):
    pngs = sorted(glob.glob(os.path.join(SRC, '*.png')))
    for old in glob.glob(os.path.join(SRC, '*.webp')):
        os.remove(old)
    for p in pngs:
        im = Image.open(p)
        has_alpha = im.mode in ('RGBA', 'LA') or 'transparency' in im.info
        if im.mode not in ('RGB', 'RGBA'):
            im = im.convert('RGBA' if has_alpha else 'RGB')
        if im.width != width:
            h = int(width * im.height / im.width)
            im = im.resize((width, h), Image.LANCZOS)
        out = os.path.splitext(p)[0] + '.webp'
        im.save(out, 'WEBP', quality=quality, method=6,
                alpha_quality=100 if has_alpha else 100)
    sizes = [(os.path.basename(p), os.path.getsize(p))
             for p in sorted(glob.glob(os.path.join(SRC, '*.webp')))]
    return sizes, has_alpha


for quality, width in TIERS:
    sizes, has_alpha = convert(quality, width)
    total = sum(s for _, s in sizes)
    mx = max(sizes, key=lambda x: x[1])
    mn = min(sizes, key=lambda x: x[1])
    mean = total / len(sizes)
    ok = mx[1] <= MAX_ONE and total <= MAX_TOTAL
    print('tier q%d w%d -> n=%d total=%.2fMB mean=%.1fKB max=%.1fKB (%s) min=%.1fKB  PASS=%s'
          % (quality, width, len(sizes), total / 1048576, mean / 1024,
             mx[1] / 1024, mx[0], mn[1] / 1024, ok))
    if ok:
        print('CHOSEN q=%d width=%d' % (quality, width))
        print('max_file', mx[0], mx[1], 'min_file', mn[0], mn[1])
        print('png_remaining', len(glob.glob(os.path.join(SRC, '*.png'))))
        break
else:
    print('NO_TIER_PASSED')
