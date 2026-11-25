import csv, json, pathlib
csvp = r'F:\sanguo\cloud\jobs_heroes40.csv'
with open(csvp, encoding='utf-8-sig', newline='') as f:
    rows = list(csv.DictReader(f))
print('cols', rows[0].keys() if rows else 'none')
ids = [r['id'] for r in rows if r.get('kind') == 't2i']
print('ids', len(ids), ids[:3])
