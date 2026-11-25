import struct, os
from PIL import Image

root = r'F:\sanguo\extract\pak\SHAPE'
p = os.path.join(root, 'MAP', 'TEXTURE.TEX')
b = open(p, 'rb').read()
print('size', len(b))
for off in (0x0C, 0x2C):
    need = off + 640 * 480 * 2
    print('off', hex(off), 'need', need, 'ok', need <= len(b))
    w, h = 640, 480
    img = Image.new('RGB', (w, h))
    px = img.load()
    for y in range(h):
        base = off + y * w * 2
        for x in range(w):
            c = struct.unpack_from('<H', b, base + x * 2)[0]
            r = (c >> 11) & 0x1F; g = (c >> 5) & 0x3F; bb = c & 0x1F
            px[x, y] = ((r << 3) | (r >> 2), (g << 2) | (g >> 4), (bb << 3) | (bb >> 2))
    img.save(r'F:\sanguo\work\tex_%02x.png' % off)
    print('saved', off)
# header dump
print('hdr', ' '.join('%02X' % c for c in b[:0x2C]))
