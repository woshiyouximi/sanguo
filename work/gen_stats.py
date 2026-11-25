import json, numpy as np
base = r'F:\sanguo\extract\json'
d = json.load(open(base + r'\xls_群英2.json', encoding='utf-8'))
rows = d['rows']
names = [r[1] for r in rows]
wu = np.array([r[2] for r in rows], float)
zhi = np.array([r[3] for r in rows], float)
print('officers', len(rows))
print('武力 min/mean/median/max %.0f/%.1f/%.0f/%.0f' % (wu.min(), wu.mean(), np.median(wu), wu.max()))
print('智力 min/mean/median/max %.0f/%.1f/%.0f/%.0f' % (zhi.min(), zhi.mean(), np.median(zhi), zhi.max()))
print('corr', round(float(np.corrcoef(wu, zhi)[0,1]), 3))
b = (wu>=90)&(zhi>=90)
print('both>=90:', int(b.sum()), [names[i] for i in np.where(b)[0]][:20])
print('both>=80:', int(((wu>=80)&(zhi>=80)).sum()))
for lo in (60,70,80,90,95):
    print('武力>=%d: %d ; 智力>=%d: %d' % (lo, int((wu>=lo).sum()), lo, int((zhi>=lo).sum())))
top = np.argsort(-wu)[:10]
print('武力 top10:', [(names[i], int(wu[i]), int(zhi[i])) for i in top])
topz = np.argsort(-zhi)[:10]
print('智力 top10:', [(names[i], int(wu[i]), int(zhi[i])) for i in topz])
