import csv, json, pathlib, shutil
src = pathlib.Path(r'F:\sanguo\project\art_ref\cloud_v0\heroes400')
dst = pathlib.Path(r'F:\sanguo\proto\ui\assets\hero'); dst.mkdir(parents=True, exist_ok=True)
with open(r'F:\sanguo\cloud\jobs_heroes400.csv', encoding='utf-8-sig', newline='') as f:
    ids = [r['id'].split('_', 1)[1] for r in csv.DictReader(f) if r.get('kind') == 't2i']
g = json.load(open(r'F:\sanguo\data\generals.json', encoding='utf-8'))
pool = [r for r in g if r['NAME'] != '盜賊']
top = sorted(pool, key=lambda r: -(r['STR'] + r['INT']))[:len(ids)]
mapping = {simp: rec['NAME'] for simp, rec in zip(ids, top)}
copied, miss = 0, []
for png in sorted(src.glob('hero_*.png')):
    simp = png.stem.split('_', 1)[1]
    trad = mapping.get(simp)
    if not trad:
        miss.append(simp); continue
    shutil.copyfile(png, dst / (trad + '.png'))
    copied += 1
print('copied', copied, 'unmapped', miss[:5], 'total files', len(list(dst.glob('*.png'))))
