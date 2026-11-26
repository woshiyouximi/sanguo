# -*- coding: utf-8 -*-
"""探测 2：PNG 头信息 + 各策略的字节数与 mean abs diff（不写文件）。"""
import io
import os
import sys
import struct
from PIL import Image, ImageChops

Image.MAX_IMAGE_PIXELS = None


def kb(n):
    return n / 1024.0


def png_header(path):
    with open(path, 'rb') as f:
        data = f.read(33)
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        return 'not-png'
    w, h, depth, ctype, comp, filt, inter = struct.unpack('>IIBBBBB', data[16:29])
    names = {0: 'gray', 2: 'rgb', 3: 'palette', 4: 'gray+a', 6: 'rgba'}
    return 'w=%d h=%d depth=%d type=%s(%d) interlace=%d' % (w, h, depth, names.get(ctype, '?'), ctype, inter)


def enc(img, **kw):
    buf = io.BytesIO()
    img.save(buf, format='PNG', **kw)
    return buf.getvalue()


def madiff(a, b):
    """mean abs diff，返回 (rgb_diff_0_255, alpha_diff_0_255 or None)"""
    if a.mode != 'RGBA':
        a = a.convert('RGBA')
    if b.mode != 'RGBA':
        b = b.convert('RGBA')
    d = ImageChops.difference(a, b)
    chans = d.split()
    rgb = sum(sum(c.getdata()) for c in chans[:3]) / (3.0 * a.width * a.height)
    alpha = sum(chans[3].getdata()) / (float(a.width) * a.height)
    return rgb, alpha


def variants(im):
    out = []
    # 1) 无损重存（像素完全不变）
    out.append(('lossless-resave', enc(im, optimize=True), True))
    # 2) 调色板 256，fastoctree（支持 alpha）
    try:
        p = im.convert('RGBA').quantize(colors=256, method=Image.FASTOCTREE, dither=Image.NONE)
        out.append(('pal256-fastoctree', enc(p, optimize=True), False))
    except Exception as e:
        out.append(('pal256-fastoctree', 'ERR %s' % e, False))
    # 3) 调色板 256，mediancut（RGB，丢 alpha 前先记录）
    try:
        p = im.convert('RGB').quantize(colors=256, method=Image.MEDIANCUT, dither=Image.NONE)
        out.append(('pal256-mediancut', enc(p, optimize=True), False))
    except Exception as e:
        out.append(('pal256-mediancut', 'ERR %s' % e, False))
    # 4) 128 色 fastoctree
    try:
        p = im.convert('RGBA').quantize(colors=128, method=Image.FASTOCTREE, dither=Image.NONE)
        out.append(('pal128-fastoctree', enc(p, optimize=True), False))
    except Exception as e:
        out.append(('pal128-fastoctree', 'ERR %s' % e, False))
    return out


def probe(path):
    raw = os.path.getsize(path)
    im = Image.open(path)
    im.load()
    print('%s  %8.1f KB  %s  mode=%s' % (os.path.basename(path), kb(raw), png_header(path), im.mode))
    if im.mode == 'P':
        try:
            n = len(im.getcolors(maxcolors=1 << 24) or [])
            print('    colors_used=%s  palette_entries=%s  has_tRNS=%s  has_alpha=%s' % (
                n, len(im.getpalette() or []) // 3, 'transparency' in im.info,
                (im.convert('RGBA').getchannel('A').getextrema()[0] < 255)))
        except Exception as e:
            print('    colors_used ERR %s' % e)
    for name, data, lossless in variants(im):
        if isinstance(data, str):
            print('    %-20s %s' % (name, data))
            continue
        if lossless:
            print('    %-20s %8.1f KB (%5.1f%%)  lossless-pixels' % (name, kb(len(data)), 100.0 * len(data) / raw))
            continue
        try:
            cand = Image.open(io.BytesIO(data))
            cand.load()
            drgb, dalpha = madiff(im, cand)
            print('    %-20s %8.1f KB (%5.1f%%)  madiff rgb=%.3f alpha=%.3f' % (
                name, kb(len(data)), 100.0 * len(data) / raw, drgb, dalpha))
        except Exception as e:
            print('    %-20s %8.1f KB  diff ERR %s' % (name, kb(len(data)), e))
    print('')


if __name__ == '__main__':
    for p in sys.argv[1:]:
        probe(p)
