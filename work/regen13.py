import sys, csv, pathlib
sys.path.insert(0, r'F:\sanguo\cloud')
import make_jobs as m
from opencc import OpenCC
cc = OpenCC('s2t')

rows = [l.split('\t') for l in pathlib.Path(r'F:\sanguo\work\prop_severe.tsv').read_text(encoding='utf-8').splitlines()]
names = [r[0] for r in rows]

# 复用 main() 里的取数逻辑不便，这里直接从 jobs_heroes400.csv 里取这 13 人的 width/seed 等，再换 prompt
old = {r['id']: r for r in csv.DictReader(open(r'F:\sanguo\cloud\jobs_heroes400.csv', encoding='utf-8-sig'))}
import json
g = json.load(open(r'F:\sanguo\data\generals.json', encoding='utf-8'))
by_trad = {x['NAME']: x for x in g}

out = []
for simp, trad, arch, oldp, newp in rows:
    rid = 'hero_' + simp
    base = old.get(rid)
    if not base:
        print('missing', rid); continue
    h = {'name': simp, 'wuli': by_trad[trad]['STR'], 'zhili': by_trad[trad]['INT']}
    prompt = m.hero_prompt(h, 0)
    out.append({
        'id': rid, 'kind': base['kind'], 'prompt': prompt, 'negative': base['negative'],
        'width': base['width'], 'height': base['height'], 'seed': base['seed'],
        'steps': base['steps'], 'cfg': base['cfg'], 'length': '', 'image': '',
    })
p = pathlib.Path(r'F:\sanguo\cloud\jobs_regen13.csv')
with p.open('w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(out[0].keys())); w.writeheader(); w.writerows(out)
print('wrote', p, len(out))
print(out[0]['prompt'][:120])
