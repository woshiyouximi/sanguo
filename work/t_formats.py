import struct, os, collections
root = r'F:\sanguo\extract\pak'
targets = [
    r'SHAPE\MAP\TEXTURE.TEX', r'SHAPE\MAP\CHINAMAP1.MSK', r'SHAPE\MAP\CHINAMAP2.MSK',
    r'SANGO.20', r'SANGO.15', r'MINGASC.20', r'OLDASC.15', r'SANGO.IDX',
    r'SHAPE\POLICY\PALAIS01.TGA',
]
for t in targets:
    p = os.path.join(root, t)
    if not os.path.exists(p):
        print('MISSING', t); continue
    b = open(p, 'rb').read()
    print('==', t, len(b))
    print('  head', ' '.join('%02X' % c for c in b[:48]))
    print('  ascii', ''.join(chr(c) if 32 <= c < 127 else '.' for c in b[:48]))
    if t.upper().endswith('.TEX'):
        for off in range(0, 32, 4):
            print('   +%02X u32=%d' % (off, struct.unpack_from('<I', b, off)[0]))
print()
print('TEX files:')
for dp, dn, fn in os.walk(root):
    for f in fn:
        if f.upper().endswith('.TEX'):
            fp = os.path.join(dp, f)
            with open(fp, 'rb') as fh:
                h = fh.read(32)
            print(' ', os.path.relpath(fp, root), os.path.getsize(fp), h[:16])
