# -*- coding: utf-8 -*-
"""压缩方案试验：per-frame 调色板 vs 每页共享调色板(256色) 的体积与误差"""
import io, json, os, sys
import numpy as np
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')
ROOT = r'F:\sanguo'
PNG = os.path.join(ROOT, 'export', 'png', 'SHAPE')
OUT = os.path.join(ROOT, 'work', 'gen_sprites')
inv = json.load(open(os.path.join(OUT, 'inventory.json'), encoding='utf-8'))
F = inv['files']

names = [n for n in F['BODY'] if n.startswith('L1')]
names.sort()
print('frames', len(names))
tot_raw = 0
imgs = []
for n in names:
    m = F['BODY'][n]
    p = os.path.join(PNG, 'MAJOR', 'BODY', n + '.png')
    tot_raw += os.path.getsize(p)
    imgs.append((n, Image.open(p).convert('RGBA')))
print('raw bytes', tot_raw)

# 1) per-frame 64 色
def q_frame(im, colors=64):
    a = np.array(im)
    mask = a[:, :, 3] > 0
    rgb = im.convert('RGB')
    p = rgb.quantize(colors=colors - 1, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    arr = np.array(p)
    arr[~mask] = colors - 1
    pal = p.getpalette()[:3 * (colors - 1)] + [0, 0, 0]
    out = Image.fromarray(arr.astype(np.uint8), 'P')
    out.putpalette(pal)
    buf = io.BytesIO()
    out.save(buf, 'PNG', optimize=True, transparency=colors - 1)
    return buf.tell()

s1 = sum(q_frame(im) for n, im in imgs)
print('per-frame 64c  :', s1, ' ratio %.3f' % (s1 / tot_raw))

# 2) 每页共享 256 色
def build_pal(imlist, ncol=255):
    px = []
    for im in imlist:
        a = np.array(im)
        p = a[a[:, :, 3] > 0][:, :3]
        if len(p) > 4000:
            p = p[np.random.default_rng(0).choice(len(p), 4000, replace=False)]
        px.append(p)
    px = np.concatenate(px)
    mont = Image.fromarray(px.reshape(-1, 1, 3).astype(np.uint8), 'RGB')
    q = mont.quantize(colors=ncol, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[:3 * ncol] + [0, 0, 0]
    return pal

pal = build_pal([im for n, im in imgs])
palimg = Image.new('P', (1, 1))
palimg.putpalette(pal)

def q_shared(im, palimg):
    a = np.array(im)
    mask = a[:, :, 3] > 0
    q = im.convert('RGB').quantize(palette=palimg, dither=Image.Dither.NONE)
    arr = np.array(q)
    arr[~mask] = 255
    o = Image.fromarray(arr.astype(np.uint8), 'P')
    o.putpalette(palimg.getpalette())
    buf = io.BytesIO()
    o.save(buf, 'PNG', optimize=True, transparency=255)
    return buf.tell(), q

s2 = 0
err_sum = 0.0
err_n = 0
pala = np.array(pal).reshape(-1, 3).astype(np.int16)
for n, im in imgs:
    b, q = q_shared(im, palimg)
    s2 += b
    a = np.array(im)
    mask = a[:, :, 3] > 0
    idx = np.array(q)[mask]
    true = a[mask][:, :3].astype(np.int16)
    got = pala[idx]
    err_sum += float(np.abs(true - got).mean()) * mask.sum()
    err_n += mask.sum()
print('shared 256c    :', s2, ' ratio %.3f' % (s2 / tot_raw), ' meanAbsErr %.2f' % (err_sum / max(1, err_n)))
np.random.seed()
