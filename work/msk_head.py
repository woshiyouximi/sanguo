import struct
p = r'F:\sanguo\extract\pak\SHAPE\MAP\CHINAMAP1.MSK'
d = open(p,'rb').read()
print('size', len(d))
for i in range(0, 0x80, 16):
    print('%04X' % i, d[i:i+16].hex(' '))
print('u16@0x08..', struct.unpack_from('<4H', d, 8))
# try palette at 0x20: 16 entries of 3 bytes?
for off in (0x10,0x14,0x18,0x20):
    pal = [tuple(d[off+3*k:off+3*k+3]) for k in range(4)]
    print('pal@%02X' % off, pal)
