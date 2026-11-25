import json, numpy as np
base = r'F:\sanguo\extract\json'
d = json.load(open(base + r'\xls_群英2.json', encoding='utf-8'))
hdr, rows = d['header'], d['rows']
print('cols', len(hdr), 'rows', len(rows))
print('header:', hdr)
