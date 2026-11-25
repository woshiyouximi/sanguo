import json, pathlib, shutil
from opencc import OpenCC
cc = OpenCC('s2t')
src = pathlib.Path(r'F:\sanguo\project\art_ref\cloud_v0\heroes400')
dst = pathlib.Path(r'F:\sanguo\proto\ui\assets\hero')
g = json.load(open(r'F:\sanguo\data\generals.json', encoding='utf-8'))
known = {r['NAME'] for r in g}
# 清掉旧的（可能是按排名猜的），重新按文件名 s2t 精确改名
for f in dst.glob('*.png'):
    f.unlink()
ok, bad = 0, []
for png in sorted(src.glob('hero_*.png')):
    simp = png.stem.split('_', 1)[1]
    trad = cc.convert(simp)
    if trad not in known:
        bad.append((simp, trad)); continue
    shutil.copyfile(png, dst / (trad + '.png')); ok += 1
print('copied', ok, 'unmatched', len(bad), bad[:6])
print('files', len(list(dst.glob('*.png'))))
