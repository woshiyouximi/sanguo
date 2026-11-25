import os, sys
sys.path.insert(0, r'F:\sanguo\tools')
import sango_shp
from PIL import Image, ImageDraw
d = r'F:\sanguo\extract\pak\SHAPE\MAJOR\BODY'
rows = []
for a in 'ADFHLRSW':
    files = sorted(f for f in os.listdir(d) if f.startswith('L0%s1' % a))
    ims = []
    for f in files[:10]:
        shp = sango_shp.load(os.path.join(d, f))
        im = sango_shp.to_image(shp, '565').convert('RGBA')
        ims.append(im)
    rows.append((a, ims))
    
CW, CH = 110, 130
W = CW*10; H = CH*len(rows)
sheet = Image.new('RGBA', (W, H), (30,30,36,255))
dr = ImageDraw.Draw(sheet)
for r,(a,ims) in enumerate(rows):
    dr.text((4, r*CH+4), 'action %s  (%d frames)' % (a, len(ims)), fill=(255,220,120,255))
    for c,im in enumerate(ims):
        sheet.alpha_composite(im, (c*CW+2, r*CH+18))
sheet.convert('RGB').save(r'F:\sanguo\work\body0_actions.png')
print('saved', sheet.size)
