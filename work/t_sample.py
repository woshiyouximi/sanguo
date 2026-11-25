import sys, os
sys.path.insert(0, r'F:\sanguo\tools')
import sango_shp as S
from PIL import Image

root = r'F:\sanguo\extract\pak\SHAPE'
picks = [r'FACE\FACE001.SHP', r'FACE\FACE002.SHP', r'MAJOR\BODY\L5S10007.SHP', r'CURSOR.SHP']
for t in picks:
    print(t, os.path.exists(os.path.join(root, t)))
for d in ['MAJOR', 'MAJOR/BODY', 'MAJOR/HEAD', 'MAGIC', 'MENU', 'MAP', 'FONTS', 'TROOP']:
    p = os.path.join(root, *d.split('/'))
    if os.path.isdir(p):
        lst = sorted(os.listdir(p))
        print(d, len(lst), lst[:6])
    else:
        print(d, 'MISSING')

for mode in ('565', '555'):
    ims = []
    for t in picks:
        s = S.load(os.path.join(root, t))
        im = S.to_image(s, mode)
        bg = Image.new('RGBA', im.size, (40, 40, 60, 255))
        bg.alpha_composite(im)
        ims.append(bg)
    W = sum(i.width + 8 for i in ims)
    H = max(i.height for i in ims)
    m = Image.new('RGBA', (W, H), (20, 20, 20, 255))
    x = 0
    for i in ims:
        m.paste(i, (x, 0))
        x += i.width + 8
    m = m.resize((m.width * 2, m.height * 2), Image.NEAREST)
    m.convert('RGB').save(r'F:\sanguo\work\sample_%s.png' % mode)
    print('saved', mode, m.size)
