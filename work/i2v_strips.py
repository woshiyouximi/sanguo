import os, glob
from PIL import Image
base = r'F:\sanguo\project\art_ref\anim_local'
for d in sorted(os.listdir(base)):
    p = os.path.join(base, d)
    if not os.path.isdir(p): continue
    fs = sorted(glob.glob(os.path.join(p, '*.png')))
    print(d, len(fs))
    if fs:
        picks = [fs[0], fs[len(fs)//3], fs[2*len(fs)//3], fs[-1]]
        ims = [Image.open(f).convert('RGB') for f in picks]
        w, h = ims[0].size
        sheet = Image.new('RGB', (w*len(ims), h))
        for i, im in enumerate(ims): sheet.paste(im, (i*w, 0))
        out = r'F:\sanguo\work\i2v_%s_strip.jpg' % d
        sheet.save(out, quality=88)
        print('  ->', out, sheet.size)
