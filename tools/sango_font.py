"""Sango2 (三国群英传2) bitmap font decoder.

两个中文点阵字体 + 两个英文点阵字体 + 一张 Big5 码 -> 字形槽位 的索引表。

文件（资源根目录，非 SHAPE\\FONTS）：
  SANGO.20      832020 B = 13867 x 60 B   20x20 中文（FONTS01）
  SANGO.15      416010 B = 13867 x 30 B   16x15 中文（FONTS04）
  SANGO.IDX      38000 B = 19000 x u16    Big5 码 -> 字形槽号
  MINGASC.20     10240 B =  256 x 40 B    10x20 英文（FONTS01，BITMASK）
  OLDASC.15       3840 B =  256 x 15 B     8x15 英文（FONTS04，BITMASK）

字形单元（SANGO.INI 的 ChineseBytes / ChinesePerLineBytes）：
  bytes_per_row = ChinesePerLineBytes，rows = ChineseHeight
  20x20: 3 B/row * 20 = 60 B（每行 24 bit，只用高 20 bit，低位 4 bit 补 0）
  16x15: 2 B/row * 15 = 30 B（每行 16 bit 全用）
  位序：MSB first，1 = 亮点。
  两个中文档都恰好 13867 个单元（832020/60、416010/30），**没有文件头**，
  第 0 个单元就是"一"（它前 20 字节全 0 只是因为"一"的上半部分是空白，别误判成 header）。
  字形在文件里的顺序 = Big5 码序（从 0xA440 的"一"开始，跳过 Big5 未定义码位），
  但被切成 4 段重排，所以必须走 SANGO.IDX 才准。

SANGO.IDX（19000 项 u16）：
  把 Big5 码映射到字形槽号。0 = 该码无字形（显示空白）。
  **值是 1-based**：真正的槽号 = IDX[pos] - 1（实测 v[pos(一)] = 1，而"一"在槽 0）。
  槽号布局（4 段，说明字体文件内的字形不是按 Big5 顺序排的）：
      pos 5024..5430  -> glyph 13094..13500   (Big5 0xA1/0xA2/0xA3 符号区，含全角空格/标点)
      pos 5495..10895 -> glyph 1..5401        (Big5 0xA4 起的常用字，"一"= 1)
      pos 10896..11260-> glyph 13502..13866
      pos 11304..18996-> glyph 5401..13093
  码 -> pos 公式（实测 13708/13865 命中，仅 3 处行边界例外）：
      pos = (lead-0x81)*157 + compact(trail) + 1
      compact(trail) = trail-0x40            (0x40..0x7E)
                     = 63 + (trail-0xA1)     (0xA1..0xFE)
  即每行 157 槽（Big5 两段 trail 共 63+94），首槽是 0x3F 填充位。
  在 Big5 码序上遍历时，槽号只在 2 处回退（0xA3BD -> 13500 后回到 1；0xC7FC -> 13751 后回到 5402），
  印证"Big5 码序 + 4 段重排"。

注意：游戏文本（*.INI / MESSAGE.INI）是 **Big5 (cp950) 繁体中文**，
不是 GBK；用这棵字体渲染 Big5 字符串才对得上。
"""
import struct

FONT_SPECS = {
    # name: (cell_bytes, width, height, per_line_bytes)
    'SANGO.20': (60, 20, 20, 3),
    'SANGO.15': (30, 16, 15, 2),
    'MINGASC.20': (40, 10, 20, 2),
    'OLDASC.15': (15, 8, 15, 1),
}


def compact(trail):
    return trail - 0x40 if trail < 0x7F else 63 + (trail - 0xA1)


def big5_pos(lead, trail):
    return (lead - 0x81) * 157 + compact(trail) + 1


def load_idx(path):
    raw = open(path, 'rb').read()
    return list(struct.unpack_from('<%dH' % (len(raw) // 2), raw, 0))


class BitmapFont:
    """定长单元 1bpp 点阵字体。"""

    def __init__(self, path, cell=None, width=None, height=None, per_line=None, index=None):
        name = path.rsplit('\\', 1)[-1].rsplit('/', 1)[-1]
        spec = FONT_SPECS.get(name)
        if spec:
            cell, width, height, per_line = spec
        self.path = path
        self.data = open(path, 'rb').read()
        self.cell, self.width, self.height, self.per_line = cell, width, height, per_line
        self.count = len(self.data) // cell
        self.index = index           # Big5 -> 槽号（仅中文档需要）

    # ---- 字形 ----
    def rows(self, slot):
        """返回 slot 号字形的行位图：list[str]，每行 width 个 '0'/'1'。"""
        off = slot * self.cell
        chunk = self.data[off:off + self.cell]
        out = []
        for y in range(self.height):
            row = chunk[y * self.per_line:(y + 1) * self.per_line]
            v = int.from_bytes(row, 'big')
            nbits = self.per_line * 8
            out.append(''.join('1' if (v >> (nbits - 1 - x)) & 1 else '0'
                               for x in range(self.width)))
        return out

    def glyph_image(self, slot, color=(255, 255, 255), bg=None):
        from PIL import Image
        w, h = self.width, self.height
        im = Image.new('RGBA', (w, h), bg or (0, 0, 0, 0))
        px = im.load()
        for y, row in enumerate(self.rows(slot)):
            for x, c in enumerate(row):
                if c == '1':
                    px[x, y] = color + (255,) if len(color) == 3 else color
        return im

    def slot_of(self, ch):
        """Big5 字符 -> 槽号；无字形返回 None。（IDX 值是 1-based，故减 1）"""
        if self.index is None:
            return None
        try:
            b = ch.encode('big5')
        except UnicodeEncodeError:
            return None
        if len(b) != 2:
            return None
        p = big5_pos(b[0], b[1])
        if not (0 <= p < len(self.index)):
            return None
        g = self.index[p]
        if not g:
            return None
        g -= 1
        return g if 0 <= g < self.count else None

    def ink_ratio(self, slot):
        rows = self.rows(slot)
        n = sum(r.count('1') for r in rows)
        return n / float(self.width * self.height)


def load_chinese(path20='SANGO.20', idx='SANGO.IDX', base=None):
    import os
    base = base or r'F:\sanguo\extract\pak'
    f = BitmapFont(os.path.join(base, path20), index=load_idx(os.path.join(base, idx)))
    return f


def render_text(font, text, color=(255, 255, 255), bg=(0, 0, 0, 0), spacing=0):
    """按 Big5 码把字符串逐字渲染成一张 PIL 图（无字形处留空）。"""
    from PIL import Image
    glyphs = []
    for ch in text:
        slot = font.slot_of(ch)
        glyphs.append((ch, slot))
    w = len(glyphs) * (font.width + spacing)
    h = font.height
    im = Image.new('RGBA', (w, h), bg)
    for i, (ch, slot) in enumerate(glyphs):
        if slot is None:
            continue
        g = font.glyph_image(slot, color)
        im.paste(g, (i * (font.width + spacing), 0), g)
    return im


def contact_sheet(font, slots, cols=40, scale=1, label_every=1):
    from PIL import Image, ImageDraw
    cw, ch = font.width * scale + 2, font.height * scale + 2
    rows = (len(slots) + cols - 1) // cols
    im = Image.new('RGB', (cols * cw, rows * ch), (24, 24, 28))
    dr = ImageDraw.Draw(im)
    for i, slot in enumerate(slots):
        g = font.glyph_image(slot)
        if scale != 1:
            g = g.resize((font.width * scale, font.height * scale), Image.NEAREST)
        x, y = (i % cols) * cw + 1, (i // cols) * ch + 1
        im.paste(g, (x, y), g)
    return im


if __name__ == '__main__':
    import sys
    base = r'F:\sanguo\extract\pak'
    f20 = load_chinese('SANGO.20', 'SANGO.IDX', base)
    print('SANGO.20', f20.count, 'slots', f20.width, 'x', f20.height)
    f15 = load_chinese('SANGO.15', 'SANGO.IDX', base)
    print('SANGO.15', f15.count, 'slots', f15.width, 'x', f15.height)
    for s in ('三国群英传', '三國群英傳', '曹操', '劉備'):
        print(s, [f20.slot_of(c) for c in s])
