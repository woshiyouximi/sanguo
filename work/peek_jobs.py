import csv
rows = list(csv.DictReader(open(r'F:\sanguo\cloud\jobs_heroes8_v2.csv', encoding='utf-8-sig')))
print(len(rows), 'rows')
for r in rows:
    print(r['id'], '|', r['prompt'][:100])
