"""Verify installed hero portraits: counts, /400 coverage, geometry."""
import csv, json, pathlib
from PIL import Image
from opencc import OpenCC

cc = OpenCC('s2t')
PROTO = pathlib.Path(r'F:\sanguo\proto\ui\assets\hero')
WEB = pathlib.Path(r'F:\sanguo\game\web\assets\hero')
SRC = pathlib.Path(r'F:\sanguo\project\art_ref\cloud_v0\heroes400')

g = json.load(open(r'F:\sanguo\data\generals.json', encoding='utf-8'))
known = {r['NAME'] for r in g}
alias = {
    '凌统': '凌統', '彻里吉': '徹里吉', '文丑': '文醜', '王浚': '王濬',
    '许禇': '許褚', '费祎': '費褘', '王粲': '王粲', '于禁': '于禁',
    '逄纪': '逢紀', '陈群': '陳群',
    '潘浚': '潘濬', '刘辟': '劉辟', '范疆': '范疆',
}


def to_trad(simp):
    trad = cc.convert(simp)
    if trad not in known:
        trad = alias.get(simp, trad)
    if trad not in known:
        cand = [n for n in known if len(n) == len(trad) and n[0] == trad[0]]
        if len(cand) == 1:
            trad = cand[0]
    return trad if trad in known else None


roster = [r['id'].split('_', 1)[1] for r in
          csv.DictReader(open(r'F:\sanguo\cloud\jobs_heroes400.csv',
                              encoding='utf-8-sig'))]
expected = {}
for s in roster:
    t = to_trad(s)
    if t:
        expected[t] = s

proto = {p.stem for p in PROTO.glob('*.png')}
web = {p.stem for p in WEB.glob('*.png')}
srcs = {p.name[5:-4] for p in SRC.glob('hero_*.png')}

print('roster', len(roster), 'mappable', len(expected))
print('src', len(srcs), 'proto', len(proto), 'web', len(web))
print('coverage /400: proto %.1f%%  web %.1f%%'
      % (100 * len(proto & set(expected)) / len(expected),
         100 * len(web & set(expected)) / len(expected)))
print('proto-web diff: only_proto', sorted(proto - web), 'only_web', sorted(web - proto))
missing = sorted(set(expected) - proto)
print('missing (%d):' % len(missing), missing)
extra = sorted(proto - set(expected))
print('extra not in roster (%d):' % len(extra), extra[:20])

bad = []
for d in (PROTO, WEB):
    for p in sorted(d.glob('*.png')):
        try:
            im = Image.open(p)
            im.load()
            exp = (832, 1216) if d is PROTO else (480, 701)
            if im.size != exp:
                bad.append((d.name, p.name, im.size, im.mode))
        except Exception as e:
            bad.append((d.name, p.name, repr(e)))
print('bad images', len(bad), bad[:10])
