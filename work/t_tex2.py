import struct, os
root = r'F:\sanguo\extract\pak'
for t in [r'SHAPE\MAP\TEXTURE.TEX', r'SHAPE\POLICY\PALAIS01.TEX', r'SHAPE\POLICY\YIELD.TEX']:
    p = os.path.join(root, t)
    b = open(p, 'rb').read(64)
    print('==', t, os.path.getsize(os.path.join(root, t)))
    print('  ', ' '.join('%02X' % c for c in b))
    print('   u32:', [hex(x) for x in struct.unpack_from('<8I', b, 0)])
print('POLICY dir:')
d = os.path.join(root, 'SHAPE', 'POLICY')
for f in sorted(os.listdir(d)):
    print('  ', f, os.path.getsize(os.path.join(d, f)))
