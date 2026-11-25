import pathlib, json
d = pathlib.Path(r'F:\sanguo\proto\ui\assets\hero')
files = sorted(p.stem for p in d.glob('*.png'))
g = json.load(open(r'F:\sanguo\data\generals.json', encoding='utf-8'))
known = {r['NAME'] for r in g}
print('files', len(files), 'notInGenerals', [f for f in files if f not in known][:5])
print('coverage %.1f%%' % (len(files) / 400 * 100))
print('sample', files[:8])
