import sys, csv, json, re, pathlib
sys.path.insert(0, r'F:\sanguo\cloud')
import make_jobs as m
from opencc import OpenCC
cc = OpenCC('s2t')

old = list(csv.DictReader(open(r'F:\sanguo\cloud\jobs_heroes400.csv', encoding='utf-8-sig')))
g = json.load(open(r'F:\sanguo\data\generals.json', encoding='utf-8'))
arch = {x['NAME']: m.archetype(x['STR'], x['INT']) for x in g if x['NAME'] != '盜賊'}

def prop_of(p):
    mo = re.search(r'手持([^，。]+)', p)
    return mo.group(1) if mo else ''

changed = []
for r in old:
    simp = r['id'].split('_', 1)[1]
    if simp in m.HERO_LOOK:      # 40 个手写锚点，保持原样
        continue
    trad = cc.convert(simp)
    a = arch.get(trad, '战将')
    if prop_of(r['prompt']) != m.derive_look(simp, a)[3]:
        changed.append((simp, trad, a, prop_of(r['prompt']), m.derive_look(simp, a)[3]))
print('derived heroes changed', len(changed))
for x in changed[:6]:
    print(x)
pathlib.Path(r'F:\sanguo\work\prop_mismatch.tsv').write_text(
    '\n'.join('\t'.join(x) for x in changed), encoding='utf-8')
