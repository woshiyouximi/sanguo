import json, numpy as np
d = json.load(open(r'F:\sanguo\extract\json\xls_阵法.json', encoding='utf-8'))
print('header', d['header'])
m = np.array([[int(x) if str(x).strip() not in ('','None') else 0 for x in r[1:]] for r in d['rows']], dtype=int)
print('shape', m.shape, 'antisym', np.abs(m+m.T).max(), 'diag', np.diag(m))
off = m[~np.eye(m.shape[0], dtype=bool)]
print('mean|off|', np.abs(off).mean().round(2), 'min', off.min(), 'max', off.max(), 'sum', m.sum())
print('rowsum', m.sum(1))
