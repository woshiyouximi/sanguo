import os, glob
from PIL import Image
root = r'F:\sanguo\extract\pak\SHAPE'
files = []
for d in ('POLICY','MAP'):
    files += sorted(glob.glob(os.path.join(root, d, '*.TEX')))
for f in files:
    d = open(f,'rb').read()
    try:
        im = Image.open(f); info = im.size, im.mode
    except Exception as e:
        info = ('ERR', repr(e)[:40])
    print('%-28s %8d  hdr=%s  %s' % (os.path.relpath(f, root), len(d), d[:18].hex(' '), info))
