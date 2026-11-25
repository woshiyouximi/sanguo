# -*- coding: utf-8 -*-
"""图集 QA：把 index.json 里的每页 sprite 与原始 PNG 逐像素比对
   - alpha 掩膜是否一致（原作二值透明，等价于形状是否丢像素）
   - 不透明像素的 RGB 平均绝对误差
   输出 work/gen_sprites/atlas_qa.json
"""
import json, os, sys, random
import numpy as np
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')

ROOT = r'F:\sanguo'
PNG = os.path.join(ROOT, 'export', 'png', 'SHAPE', 'MAJOR')
DST = os.path.join(ROOT, 'game', 'web', 'anim', 'general')
OUT = os.path.join(ROOT, 'work', 'gen_sprites')
J = json.load(open(os.path.join(DST, 'index.json'), encoding='utf-8'))

# 名字 -> 原始 PNG 相对路径
def src_path(name):
    if name[0] in 'LR' and name[1] in '0123456789ABCDE':
        return os.path.join(PNG, 'BODY', name + '.png')
    if name[0] == 'H':
        return os.path.join(PNG, 'HORSE', name + '.png')
    return os.path.join(PNG, 'WEAPON', name + '.png')

random.seed(11)
rows = []
tot_px = tot_bad = 0
tot_err = 0.0
for p in J['pages']:
    im = Image.open(os.path.join(DST, p['file'])).convert('RGBA')
    A = np.array(im)
    pick = p['sprites'] if len(p['sprites']) <= 25 else random.sample(p['sprites'], 25)
    bad = px = 0
    err = 0.0
    for s in pick:
        crop = A[s['y']:s['y'] + s['h'], s['x']:s['x'] + s['w']]
        src = np.array(Image.open(src_path(s['name'])).convert('RGBA'))
        if src.shape != crop.shape:
            rows.append({'name': s['name'], 'error': 'shape %s vs %s' % (src.shape, crop.shape)})
            continue
        m0 = src[:, :, 3] > 0
        m1 = crop[:, :, 3] > 0
        n = int(m0.sum())
        b = int((m0 ^ m1).sum())
        px += n
        bad += b
        if n:
            d = np.abs(src[m0][:, :3].astype(np.int16) - crop[m0][:, :3].astype(np.int16))
            err += float(d.mean()) * n
    tot_px += px
    tot_bad += bad
    tot_err += err
    rows.append({'file': p['file'], 'unit': p['unit'], 'n_sprites': len(p['sprites']),
                 'sampled': len(pick), 'src_ink_px': px, 'mask_mismatch_px': bad,
                 'mask_ok_pct': round(100.0 * (1 - bad / max(1, px)), 4),
                 'rgb_mae': round(err / max(1, px), 3)})

rep = {'pages': len(J['pages']), 'sampled_ink_px': tot_px, 'mask_mismatch_px': tot_bad,
       'mask_ok_pct': round(100.0 * (1 - tot_bad / max(1, tot_px)), 4),
       'rgb_mae': round(tot_err / max(1, tot_px), 3), 'per_page': rows}
json.dump(rep, open(os.path.join(OUT, 'atlas_qa.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('pages=%d sampled_ink=%d mismatch=%d mask_ok=%.4f%% rgb_mae=%.3f' %
      (rep['pages'], tot_px, tot_bad, rep['mask_ok_pct'], rep['rgb_mae']))
worst = sorted([r for r in rows if 'mask_ok_pct' in r], key=lambda r: r['mask_ok_pct'])[:5]
for r in worst:
    print('  worst %-14s %-5s ok=%.3f%% bad=%d/%d mae=%.2f' %
          (r['file'], r['unit'], r['mask_ok_pct'], r['mask_mismatch_px'], r['src_ink_px'], r['rgb_mae']))
