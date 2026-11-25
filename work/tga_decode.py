import numpy as np, struct
from PIL import Image
p = r'F:\sanguo\extract\pak\SHAPE\BG\FLOOR04.TGA'
d = open(p,'rb').read()
w, h = struct.unpack_from('<HH', d, 12)
px = np.frombuffer(d[18:18+w*h*2], dtype='<u2').astype(np.uint32).reshape(h, w)

def pack(r, g, b, name, flip=True):
    arr = np.stack([r,g,b], -1).astype(np.uint8)
    if flip: arr = arr[::-1]
    Image.fromarray(arr).save('F:\\sanguo\\work\\' + name)
    print('saved', name)

pack(((px >> 10) & 0x1F) * 255 // 31, ((px >> 5) & 0x1F) * 255 // 31, (px & 0x1F) * 255 // 31, 'floor04_rgb555.png')
pack((px & 0x1F) * 255 // 31, ((px >> 5) & 0x1F) * 255 // 31, ((px >> 10) & 0x1F) * 255 // 31, 'floor04_bgr555.png')
