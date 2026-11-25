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

changed, same = [], 0
for r in old:
    simp = r['id'].split('_', 1)[1]
    trad = cc.convert(simp)
    a = arch.get(trad, '战将')
    old_prop = prop_of(r['prompt'])
    new_prop = m.derive_look(simp, a)[3]
    if old_prop != new_prop:
        changed.append((simp, trad, a, old_prop, new_prop))
    else:
        same += 1
print('changed', len(changed), 'same', same)
for x in changed[:8]:
    print(x)
pathlib.Path(r'F:\sanguo\work\prop_mismatch.tsv').write_text(
    '\n'.join('\t'.join(x) for x in changed), encoding='utf-8')
