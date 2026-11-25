"""Sango2 (三国群英传2) MSK 战略地图地形图解码器.

4 个文件：SHAPE\\MAP\\CHINAMAP1-4.MSK（52075 / 49353 / 50805 / 49284 B）

结构（反汇编 Sango2.exe 0x44FD1B + 0x40DF43 证实）：
  +0x00  u8 x4   0A 05 01 08   （版本/标志，含义未定）
  +0x04  u16     left   = 0
  +0x06  u16     top    = 0
  +0x08  u16     right  = 639
  +0x0A  u16     bottom = 479
  +0x0C  u16     width  = 640      (= right-left+1，冗余存储)
  +0x0E  u16     height = 480
  +0x10  u8[48]  16 色调色板，每色 RGB 3 字节（索引 0..15）
  +0x40..0x80    几乎全 0（只 +0x40 有 00 01 80 02 = 256/640，含义未定）
  +0x80  ...     PCX 式 RLE 像素流，每像素 1 字节 = 调色板索引

RLE（0x44FD1B 的反汇编）：
  al = *p++
  if (al & 0xC0) { cnt = al & 0x3F; val = *p++; }   # 重复 cnt 次 val
  else           { cnt = 1;        val = al;      }   # 直接一个像素
  注意 cnt 可能是 0（al & 0xC0 != 0 且低 6 位为 0），游戏解码器对它 -=0 不前进也会跳过，
  实测按 cnt 次输出可解出恰好 640*480 = 307200 像素，消费 51306 B（文件 52075，尾部 769 B 不读）

像素值语义（0x40DF43 后接 "%s Terrain=%d"）：
  255 = 无地形（空地/海），其余 = 12 种地形类：
  0 ？/1 红/2 浅紫/3 蓝/4 绿/5 橙/6 褐/7 黄绿/8 灰/9 琥珀/10 青/11 品红
  MSK 不是逐像素地表分类，而是只在地图要素（道路、河流、城市）上标注"这段是哪种地形"，
  图例就是图左上角烧进像素里的（big City / city / water / grass / 平原 / 山 / 森林 / 草 / 沙漠 / 塔）。
  游戏用 get_terrain(x, y) 在 (屏幕坐标>>1) 处查表，决定行军/战斗地形。
"""
import struct

HEADER = 0x80


class Msk:
    __slots__ = ('width', 'height', 'left', 'top', 'right', 'bottom', 'palette', 'header',
                 'pixels', 'consumed', 'path')

    def __repr__(self):
        return '<Msk %dx%d terrain %s consumed=%d/%d>' % (
            self.width, self.height, self.path, self.consumed, self.consumed)


def load(path):
    return parse(open(path, 'rb').read(), path)


def parse(data, path=None):
    m = Msk()
    m.path = path
    m.header = data[:4]
    m.left, m.top, m.right, m.bottom, m.width, m.height = struct.unpack_from('<6H', data, 4)
    m.palette = [tuple(data[0x10 + i * 3:0x10 + i * 3 + 3]) for i in range(16)]
    n = m.width * m.height
    out = bytearray(n)
    p = HEADER
    i = 0
    while i < n and p < len(data):
        b = data[p]
        p += 1
        if b & 0xC0:
            cnt = b & 0x3F
            if p >= len(data):
                break
            v = data[p]
            p += 1
            if cnt == 0:
                cnt = 64        # 低 6 位为 0 时按 64 处理（游戏里是 -=0 死循环，实测无此情况）
            end = min(n, i + cnt)
            out[i:end] = bytes([v]) * (end - i)
            i = end
        else:
            out[i] = b
            i += 1
    m.pixels = out
    m.consumed = p
    return m


def to_image(m, mode='palette'):
    """mode='palette' 用 16 色调色板；'gray' 用索引当灰度；'mask' 只画非 255。"""
    from PIL import Image
    w, h = m.width, m.height
    if mode == 'gray':
        buf = bytes(0 if v == 255 else min(255, v * 21) for v in m.pixels)
        return Image.frombytes('L', (w, h), buf)
    buf = bytearray(w * h * 3)
    for i, v in enumerate(m.pixels):
        if v == 255:
            continue
        r, g, b = m.palette[v & 15]
        buf[i * 3:i * 3 + 3] = bytes((r, g, b))
    return Image.frombytes('RGB', (w, h), bytes(buf))


def save_png(src, dst, mode='palette'):
    m = load(src) if isinstance(src, str) else src
    to_image(m, mode).save(dst)
    return dst


if __name__ == '__main__':
    import sys
    m = load(sys.argv[1])
    print(m, 'palette', m.palette[:4], 'tail', len(m.pixels))
    if len(sys.argv) > 2:
        save_png(m, sys.argv[2])
        print('wrote', sys.argv[2])
