"""Sango2 (三国群英传2) SHP sprite decoder.

Format (reverse-engineered, validated on all 10969 SHP files in Sango2.PAK):

Header (0x24 bytes):
  +0x00  char[4]  "TLHS"
  +0x04  u32      always 0
  +0x08  u32      always 2      (pixel format: 2 = 16bpp RGB565)
  +0x0C  u32      always 0
  +0x10  u32      color key (transparent color, RGB565; 0x07C0 common green, 0xFFFF white, 0 = black)
  +0x14  u32      width  (canvas width in pixels)
  +0x18  u32      row count (= height; offsets table length)
  +0x1C  i32      offsetX  (hotspot; loader negates it)
  +0x20  i32      offsetY  (hotspot; loader negates it)
  +0x24  u32      row_offset[row_count]

Each row (scanline) at row_offset[i], y = i:
  sequence of runs:  u16 x + u16 n + u16 color[n]
  terminated by 0xFFFF in either field (i.e. word == 0xFFFF), or by end of row slot.
  Empty row = single 0xFFFF word (2 bytes).

The original loader (Sango2.exe VA 0x46B3D0) swaps the two words of every run so that
the runtime layout is [n][x], then shifts x by -offsetX, and rewrites RGB565 channels.
"""
import struct

HEADER_SIZE = 0x24


class Shp:
    __slots__ = ('width', 'height', 'key', 'offx', 'offy', 'rows', 'path')

    def __repr__(self):
        return '<Shp %dx%d key=%04X off=(%d,%d) rows=%d>' % (
            self.width, self.height, self.key, self.offx, self.offy, len(self.rows))


def load(path):
    with open(path, 'rb') as f:
        data = f.read()
    return parse(data, path)


def parse(data, path=None):
    if len(data) < HEADER_SIZE or data[:4] != b'TLHS':
        raise ValueError('not a TLHS shp: %r' % (path,))
    key, w, cnt, offx, offy = struct.unpack_from('<5I', data, 0x10)
    offx = struct.unpack_from('<i', data, 0x1C)[0]
    offy = struct.unpack_from('<i', data, 0x20)[0]
    if HEADER_SIZE + 4 * cnt > len(data):
        raise ValueError('truncated offset table: %r' % (path,))
    offs = struct.unpack_from('<%dI' % cnt, data, HEADER_SIZE)
    s = Shp()
    s.path = path
    s.width, s.height, s.key, s.offx, s.offy = w, cnt, key, offx, offy
    rows = []
    for i in range(cnt):
        start = offs[i]
        end = offs[i + 1] if i + 1 < cnt else len(data)
        p = start
        runs = []
        while p + 4 <= end:
            x, n = struct.unpack_from('<HH', data, p)
            if x == 0xFFFF or n == 0xFFFF:
                break
            p += 4
            if p + 2 * n > end:
                break
            runs.append((x, struct.unpack_from('<%dH' % n, data, p)))
            p += 2 * n
        rows.append(runs)
    s.rows = rows
    return s


def to_rgba(shp, mode='565'):
    """Return (width, height, bytearray RGBA)."""
    w, h = shp.width, shp.height
    buf = bytearray(w * h * 4)
    key = shp.key & 0xFFFF
    for y, runs in enumerate(shp.rows):
        base = y * w * 4
        for x, cols in runs:
            for k, c in enumerate(cols):
                px = x + k
                if px >= w:
                    break
                if c == key:
                    continue
                if mode == '565':
                    r = (c >> 11) & 0x1F
                    g = (c >> 5) & 0x3F
                    b = c & 0x1F
                    r = (r << 3) | (r >> 2)
                    g = (g << 2) | (g >> 4)
                    b = (b << 3) | (b >> 2)
                else:  # 555
                    r = (c >> 10) & 0x1F
                    g = (c >> 5) & 0x1F
                    b = c & 0x1F
                    r = (r << 3) | (r >> 2)
                    g = (g << 3) | (g >> 2)
                    b = (b << 3) | (b >> 2)
                o = base + px * 4
                buf[o] = r
                buf[o + 1] = g
                buf[o + 2] = b
                buf[o + 3] = 255
    return w, h, buf


def to_image(shp, mode='565'):
    from PIL import Image
    w, h, buf = to_rgba(shp, mode)
    return Image.frombytes('RGBA', (w, h), bytes(buf))


def save_png(src, dst, mode='565'):
    to_image(src, mode).save(dst)
    return dst


if __name__ == '__main__':
    import sys
    s = load(sys.argv[1])
    print(s)
    if len(sys.argv) > 2:
        save_png(s, sys.argv[2])
        print('wrote', sys.argv[2])
