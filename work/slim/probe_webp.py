# -*- coding: utf-8 -*-
"""探测 webp：是否无损(VP8L)，以及重编码 q92/q85 后的字节数与 madiff。只读。"""
import io
import os
import sys
from PIL import Image, ImageChops

Image.MAX_IMAGE_PIXELS = None


def kb(n):
    return n / 1024.0


def kind(path):
    with open(path, 'rb') as f:
        d = f.read(64)
    if d[:4] != b'RIFF' or d[8:12] != b'WEBP':
        return 'not-webp'
    fourcc = d[12:16]
    if fourcc == b'VP8L':
        return 'lossless(VP8L)'
    if fourcc == b'VP8 ':
        return 'lossy(VP8)'
    if fourcc == b'VP8X':
        # 扩展格式，后面可能还有 VP8L/VP8 子块
        sub = d[20:24] if len(d) > 24 else b''
        return 'ext(VP8X, sub=%s)' % sub.decode('latin1')
    return 'unknown(%s)' % fourcc


def madiff(a, b):
    if a.mode != 'RGBA':
        a = a.convert('RGBA')
    if b.mode != 'RGBA':
        b = b.convert('RGBA')
    d = ImageChops.difference(a, b)
    ch = d.split()
    rgb = sum(sum(c.getdata()) for c in ch[:3]) / (3.0 * a.width * a.height)
    al = sum(ch[3].getdata()) / (float(a.width) * a.height)
    return rgb, al


def probe(path):
    raw = os.path.getsize(path)
    im = Image.open(path)
    im.load()
    print('%s  %8.1f KB  %dx%d mode=%s  %s' % (os.path.basename(path), kb(raw), im.width, im.height, im.mode, kind(path)))
    for q, m in ((95, 6), (92, 6), (85, 6)):
        buf = io.BytesIO()
        im.save(buf, format='WEBP', quality=q, method=m, alpha_quality=100)
        data = buf.getvalue()
        cand = Image.open(io.BytesIO(data))
        cand.load()
        rgb, al = madiff(im, cand)
        print('    q%-3d method=%d  %8.1f KB (%5.1f%%)  madiff rgb=%.3f alpha=%.3f' % (q, m, kb(len(data)), 100.0 * len(data) / raw, rgb, al))
    buf = io.BytesIO()
    im.save(buf, format='WEBP', lossless=True, method=6, quality=100)
    print('    lossless   %8.1f KB (%5.1f%%)' % (kb(len(buf.getvalue())), 100.0 * len(buf.getvalue()) / raw))
    print('')


if __name__ == '__main__':
    for p in sys.argv[1:]:
        probe(p)
