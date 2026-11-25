"""Sango2 (三国群英传2) TGA / .TEX decoder.

结论：**7 个 .TEX 全是标准 TGA 文件**（Truevision Targa），Pillow 也能直接打开。
     SHAPE\\POLICY\\PALAIS01-05.TEX / YIELD.TEX     614420 B
     SHAPE\\MAP\\TEXTURE.TEX                        614444 B

TGA 头 18 字节（全部实测一致）：
  +0x00 u8   idlength   = 0
  +0x01 u8   colormaptype = 0      (无调色板)
  +0x02 u8   imagetype  = 2        (未压缩真彩)
  +0x03 u16  cmapfirst  = 0
  +0x05 u16  cmaplen    = 0
  +0x07 u8   cmapbits   = 0
  +0x08 u16  x_origin   = 0
  +0x0A u16  y_origin   = 0
  +0x0C u16  width      = 640
  +0x0E u16  height     = 480
  +0x10 u8   bpp        = 16       (A1R5G5B5)
  +0x11 u8   descriptor = 0x00 (POLICY) / 0x01 (TEXTURE)
                          bit5 = 0 -> 行序自下而上（bottom-left origin）
                          bit0 = 1 -> 1 bit alpha
  +0x12      像素数据 640*480*2 = 614400 B，行序自下而上

所以 614420 = 18 + 614400 + 2 字节尾巴（PALAIS01 尾 ca 14，YIELD 尾 11 11，游戏不读）；
    614444 = 18 + 614400 + 26 字节 TGA 2.0 页脚 "TRUEVISION-XFILE.\\0"。

像素格式 A1R5G5B5（小端 u16）：
  bit15 a / bit14-10 r5 / bit9-5 g5 / bit0-4 b5
  r8 = r5<<3 | r5>>2 ， g8 = g5<<3 | g5>>2 ， b8 = b5<<3 | b5>>2

EXE 里的加载器 VA 0x41D2D4：fread 头 0x12=18 字节 -> fread 0x96000 字节像素 ->
call 0x46B2D0(surface,640,480)，后者逐位转换 A1R5G5B5 -> RGB565：
  ax = word[ecx]; edi = (ax & 0xFFE0) << 1; eax = ax & 0x1F; word[ecx-2] = edi|eax
（即 g5 左移成 g6，r/b 不动；红只剩 4 位有效，所以 .TEX 版比同名 .SHP 暗一档）

SHAPE\\BG\\FLOOR00-11.TGA：512x512、bpp=16、descriptor=0x01，同一族格式。
"""
import struct

HEADER = 18


class Tga:
    __slots__ = ('width', 'height', 'bpp', 'desc', 'imagetype', 'pixels', 'path', 'trailer')

    def __repr__(self):
        return '<Tga %dx%d bpp=%d type=%d desc=%02X trail=%d>' % (
            self.width, self.height, self.bpp, self.imagetype, self.desc, len(self.trailer))


def load(path):
    data = open(path, 'rb').read()
    return parse(data, path)


def parse(data, path=None):
    if len(data) < HEADER:
        raise ValueError('too short: %r' % (path,))
    idlen, cmaptype, imagetype = data[0], data[1], data[2]
    cmapfirst, cmaplen, cmapbits = struct.unpack_from('<HHB', data, 3)
    x0, y0, w, h, bpp, desc = struct.unpack_from('<HHHHBB', data, 8)
    t = Tga()
    t.path = path
    t.imagetype = imagetype
    t.width, t.height, t.bpp, t.desc = w, h, bpp, desc
    off = HEADER + idlen
    if cmaptype:
        off += cmaplen * ((cmapbits + 7) // 8)
    if imagetype != 2:
        raise ValueError('unsupported TGA imagetype %d: %r' % (imagetype, path))
    nbytes = w * h * (bpp // 8)
    t.pixels = data[off:off + nbytes]
    t.trailer = data[off + nbytes:]
    return t


def to_rgb(t):
    """返回 (w,h,bytes RGB)，按 descriptor bit5 处理行序。"""
    w, h, bpp = t.width, t.height, t.bpp
    src = t.pixels
    bottom_up = not (t.desc & 0x20)
    out = bytearray(w * h * 3)
    for y in range(h):
        sy = (h - 1 - y) if bottom_up else y
        srow = sy * w * (bpp // 8)
        drow = y * w * 3
        if bpp == 16:
            for x in range(w):
                o = srow + x * 2
                c = src[o] | (src[o + 1] << 8)
                r5 = (c >> 10) & 0x1F
                g5 = (c >> 5) & 0x1F
                b5 = c & 0x1F
                d = drow + x * 3
                out[d] = (r5 << 3) | (r5 >> 2)
                out[d + 1] = (g5 << 3) | (g5 >> 2)
                out[d + 2] = (b5 << 3) | (b5 >> 2)
        elif bpp == 24:
            src_row = src[srow:srow + w * 3]
            out[drow:drow + w * 3] = bytes(
                b for i in range(0, w * 3, 3) for b in (src_row[i + 2], src_row[i + 1], src_row[i]))
        elif bpp == 32:
            for x in range(w):
                o = srow + x * 4
                d = drow + x * 3
                out[d] = src[o + 2]
                out[d + 1] = src[o + 1]
                out[d + 2] = src[o]
        else:
            raise ValueError('unsupported bpp %d' % bpp)
    return w, h, bytes(out)


def to_image(t):
    from PIL import Image
    w, h, buf = to_rgb(t)
    return Image.frombytes('RGB', (w, h), buf)


def save_png(src, dst):
    t = load(src) if isinstance(src, str) else src
    to_image(t).save(dst)
    return dst


if __name__ == '__main__':
    import sys
    t = load(sys.argv[1])
    print(t)
    if len(sys.argv) > 2:
        save_png(t, sys.argv[2])
        print('wrote', sys.argv[2])
