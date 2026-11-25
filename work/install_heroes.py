"""Install hero portraits: opencc s2t mapping -> proto (raw) + web (480px).

Mapping logic is copied verbatim from work/merge_opencc2.py so naming stays
identical to the 153 already installed.

Usage: python install_heroes.py [source_dir]
       default source = project/art_ref/cloud_v0/heroes400
"""
import sys, json, pathlib, shutil
from PIL import Image
from opencc import OpenCC

cc = OpenCC('s2t')
SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1
                   else r'F:\sanguo\project\art_ref\cloud_v0\heroes400')
PROTO = pathlib.Path(r'F:\sanguo\proto\ui\assets\hero')
WEB = pathlib.Path(r'F:\sanguo\game\web\assets\hero')
WEB_W = 480

g = json.load(open(r'F:\sanguo\data\generals.json', encoding='utf-8'))
known = {r['NAME'] for r in g}
alias = {
    '凌统': '凌統', '彻里吉': '徹里吉', '文丑': '文醜', '王浚': '王濬',
    '许禇': '許褚', '费祎': '費褘', '王粲': '王粲', '于禁': '于禁',
    # 异体字：opencc 给出 陳羣/逄紀/潘浚/劉闢/範疆，
    # 但 generals.json 用 陳群/逢紀/潘濬/劉辟/范疆
    '逄纪': '逢紀', '陈群': '陳群',
    '潘浚': '潘濬', '刘辟': '劉辟', '范疆': '范疆',
}

ok, bad, warn, fuzzy = 0, [], [], []
seen = {}
for png in sorted(SRC.glob('hero_*.png')):
    simp = png.stem.split('_', 1)[1]
    trad = cc.convert(simp)
    if trad not in known:
        trad = alias.get(simp, trad)
    if trad not in known:
        # 同名不同异体：按长度+首字粗匹配
        cand = [n for n in known if len(n) == len(trad) and n[0] == trad[0]]
        if len(cand) == 1:
            fuzzy.append((simp, trad, cand[0]))
            trad = cand[0]
    if trad not in known:
        bad.append(simp)
        continue
    if trad in seen:
        warn.append((simp, seen[trad], trad))
    seen[trad] = simp

    shutil.copyfile(png, PROTO / (trad + '.png'))

    im = Image.open(png).convert('RGB')
    w, h = im.size
    nh = int(WEB_W * h / w)          # truncate, matches existing 480x701
    im.resize((WEB_W, nh), Image.LANCZOS).save(WEB / (trad + '.png'), 'PNG')
    ok += 1

print('installed', ok, 'from', SRC)
print('unmatched', bad)
print('collisions', warn)
print('fuzzy_matched', fuzzy)
print('proto total', len(list(PROTO.glob('*.png'))),
      'web total', len(list(WEB.glob('*.png'))))
