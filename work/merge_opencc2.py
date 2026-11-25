import json, pathlib, shutil
from opencc import OpenCC
cc = OpenCC('s2t')
src = pathlib.Path(r'F:\sanguo\project\art_ref\cloud_v0\heroes400')
dst = pathlib.Path(r'F:\sanguo\proto\ui\assets\hero')
g = json.load(open(r'F:\sanguo\data\generals.json', encoding='utf-8'))
known = {r['NAME'] for r in g}
alias = {
    '凌统': '凌統', '彻里吉': '徹里吉', '文丑': '文醜', '王浚': '王濬',
    '许禇': '許褚', '费祎': '費褘', '王粲': '王粲', '于禁': '于禁',
}
ok, bad = 0, []
for png in sorted(src.glob('hero_*.png')):
    simp = png.stem.split('_', 1)[1]
    trad = cc.convert(simp)
    if trad not in known:
        trad = alias.get(simp, trad)
    if trad not in known:
        # 同名不同异体：按长度+首字粗匹配
        cand = [n for n in known if len(n) == len(trad) and n[0] == trad[0]]
        if len(cand) == 1:
            trad = cand[0]
    if trad not in known:
        bad.append(simp); continue
    shutil.copyfile(png, dst / (trad + '.png')); ok += 1
print('copied', ok, 'unmatched', bad)
print('files', len(list(dst.glob('*.png'))))
