import csv, json, pathlib
csvp = r'F:\sanguo\cloud\jobs_heroes40.csv'
with open(csvp, encoding='utf-8-sig', newline='') as f:
    rows = list(csv.DictReader(f))
ids = [r['id'] for r in rows if r.get('kind') == 't2i']
g = json.load(open(r'F:\sanguo\data\generals.json', encoding='utf-8'))
pool = [r for r in g if r['NAME'] != '盜賊']
top = sorted(pool, key=lambda r: -(r['STR'] + r['INT']))[:len(ids)]
d = pathlib.Path(r'F:\sanguo\proto\ui\assets\hero')
renamed, missing = 0, []
for simp_id, rec in zip(ids, top):
    simp = simp_id.split('_', 1)[1]
    src = d / (simp + '.png')
    if not src.exists():
        missing.append(simp); continue
    dst = d / (rec['NAME'] + '.png')
    if src != dst:
        if dst.exists(): dst.unlink()
        src.rename(dst); renamed += 1
files = sorted(p.stem for p in d.glob('*.png'))
print('renamed', renamed, 'missing', missing, 'total', len(files))
print('sample', files[:6])
