import json, numpy as np
d = json.load(open(r'F:\sanguo\extract\json\xls_兵种.json', encoding='utf-8'))
print(d.keys())
rows = d['rows']
print('rows', len(rows), 'header', d['header'])
m = np.array([[int(x) if str(x).strip() not in ('','None') else 0 for x in r[1:]] for r in rows], dtype=int)
print('shape', m.shape)
off = m[~np.eye(13, dtype=bool)]
print('mean|off|', np.abs(off).mean().round(2), 'max', off.max(), 'min', off.min(), 'sum', m.sum())
print('antisym max', np.abs(m + m.T).max(), 'diag', np.diag(m))
print('rowsum', m.sum(1))
