# -*- coding: utf-8 -*-
"""只读探测：候选 png 的 mode/尺寸/透明度，以及各种重编码策略能省多少。不写文件。"""
import io
import os
import sys
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

def mb(n):
    return n / 1048576.0

def kb(n):
    return n / 1024.0

def encode(img, **kw):
    buf = io.BytesIO()
    img.save(buf, format='PNG', **kw)
    return buf.getvalue()

def try_quant_p(img):
    """RGB/L -> P 256 色，MEDIANCUT，无抖动"""
    return img.convert('RGB').quantize(colors=256, method=Image.MEDIANCUT, dither=Image.NONE)

def try_quant_rgba_fastoctree(img):
    return img.convert('RGBA').quantize(colors=256, method=Image.FASTOCTREE, dither=Image.NONE)

def fmt(b):
    return "%.1f KB" % kb(len(b))

def probe(path, show=6):
    im = Image.open(path)
    im.load()
    raw = os.path.getsize(path)
    info = "%s  %dx%d mode=%s  %8.1f KB" % (os.path.basename(path), im.width, im.height, im.mode, kb(raw))
    has_alpha = False
    if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
        a = im.convert('RGBA').getchannel('A')
        lo, hi = a.getextrema()
        has_alpha = (lo < 255)
        info += " alpha[%d..%d]" % (lo, hi)
    print(info)
    results = []
    # A: 直接 256 色 P（RGB）
    try:
        p = try_quant_p(im)
        b = encode(p, optimize=True)
        results.append(("P256-mediancut-opt", len(b)))
    except Exception as e:
        results.append(("P256-mediancut-opt", "ERR:%s" % e))
    # B: RGBA FASTOCTREE
    try:
        p = try_quant_rgba_fastoctree(im)
        b = encode(p, optimize=True)
        results.append(("P256-fastoctree-opt", len(b)))
    except Exception as e:
        results.append(("P256-fastoctree-opt", "ERR:%s" % e))
    # C: RGBA 无损 optimize
    try:
        b = encode(im.convert('RGBA') if has_alpha else im.convert('RGB'), optimize=True)
        results.append(("nonpalette-opt", len(b)))
    except Exception as e:
        results.append(("nonpalette-opt", "ERR:%s" % e))
    for name, r in results:
        if isinstance(r, int):
            print("    %-22s %9.1f KB  (%5.1f%% of orig)" % (name, kb(r), 100.0 * r / raw))
        else:
            print("    %-22s %s" % (name, r))

if __name__ == '__main__':
    for p in sys.argv[1:]:
        probe(p)
        print('')
