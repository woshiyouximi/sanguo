import struct, os

base = r'F:\sanguo\extract\pak\SHAPE'
for rel in ['FORCE\\MAA10002.SHP', 'FORCE\\MAHA0002.SHP', 'FORCE\\MAW10001.SHP', 'FORCE\\MAHW0001.SHP',
            'MAJOR\\HORSE\\HAW10001.SHP', 'MAJOR\\BODY\\L1W10001.SHP']:
    p = os.path.join(base, rel)
    with open(p, 'rb') as f:
        h = f.read(0x24)
    tag = h[:4]
    key, w, hh, ox, oy = struct.unpack_from('<Iiiii', h, 0x10)
    print('%-28s %s %4dx%-4d key=0x%04X off=(%d,%d)' % (rel, tag, w, hh, key, ox, oy))
