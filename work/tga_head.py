import os, glob, struct
root = r'F:\sanguo\extract\pak\SHAPE\BG'
for f in sorted(glob.glob(os.path.join(root, '*.TGA')))[:12]:
    d = open(f,'rb').read()
    print(os.path.basename(f), len(d), d[:0x20].hex(' '))
