import struct,glob,os
def png_size(p):
    with open(p,'rb') as f:
        d=f.read(33)
    w,h=struct.unpack('>II',d[16:24])
    return w,h
for d in [r'F:\sanguo\export\png\SHAPE\MENU', r'F:\sanguo\export\png\SHAPE\JEWEL']:
    print('==',d)
    for p in sorted(glob.glob(os.path.join(d,'*.png'))):
        w,h=png_size(p)
        print(f'{os.path.basename(p):16s} {w:5d}x{h:<5d} {os.path.getsize(p):7d}')
