import json, numpy as np
base = r'F:\sanguo\extract\json'
for sheet, key in [('兵种','-'), ('阵形','-')]:
    d = json.load(open(base + r'\xls_%s.json' % sheet, encoding='utf-8'))
    hdr, rows = d['header'], d['rows']
    print('==', sheet, len(hdr), 'cols,', len(rows), 'rows')
    print('  hdr:', hdr)
    M = np.array([[r[c] for c in range(1, len(hdr))] for r in rows], float)
    print('  shape', M.shape, 'antisym max |A+AT| =', float(np.abs(M + M.T).max()), 'diag max', float(np.abs(np.diag(M)).max()))
    print('  values: min %.0f max %.0f mean|.| %.1f' % (M.min(), M.max(), np.abs(M).mean()))
    names = [r[0] for r in rows]
    sums = M.sum(1)
    order = np.argsort(-sums)
    print('  row-sum ranking (positive = 优势):', [(names[i], int(sums[i])) for i in order][:6])
    print('  worst:', [(names[i], int(sums[i])) for i in order][-4:])
    # count of strong counters > 40
    print('  strong counters (>=40):', int((M >= 40).sum()))
