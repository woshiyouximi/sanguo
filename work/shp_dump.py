import struct
base = r'F:\sanguo\extract\pak\SHAPE\POLICY\PALAIS01'
d = open(base + '.SHP', 'rb').read()
w = struct.unpack_from('<I', d, 0x14)[0]; n = struct.unpack_from('<I', d, 0x18)[0]
ox = struct.unpack_from('<i', d, 0x1c)[0]; oy = struct.unpack_from('<i', d, 0x20)[0]
print('w', w, 'n', n, 'ox', ox, 'oy', oy, 'size', len(d), 'key', hex(struct.unpack_from('<I', d, 0x10)[0]))
offs = struct.unpack_from('<%dI' % n, d, 0x24)
print('first offs', offs[:5], 'last', offs[-1])
for k in (0, 1, 200):
    p = offs[k]
    print('frame', k, 'off', p, d[p:p+24].hex())
    print('  words', struct.unpack_from('<12H', d, p))
