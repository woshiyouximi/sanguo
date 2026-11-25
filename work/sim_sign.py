# -*- coding: utf-8 -*-
"""补充分析：表值"符号胜场数" vs 实测行胜率（幅度在饱和引擎里几乎无用）。"""
import json, itertools

R = json.load(open('work/sim_report.json', encoding='utf-8'))


def spear(a, b):
    def rank(v):
        s = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(s):
            j = i
            while j + 1 < len(s) and v[s[j + 1]] == v[s[i]]:
                j += 1
            for k in range(i, j + 1):
                r[s[k]] = (i + j) / 2.0 + 1
            i = j + 1
        return r
    ra, rb = rank(a), rank(b)
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = (sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb)) ** 0.5
    return num / den


for key, label in (('troop', '兵种'), ('formation', '阵形')):
    g = R['groups'][key]
    names, M, rate = g['names'], g['matrix'], g['rate']
    size = len(names)
    rows = []
    for i in range(size):
        opp = [j for j in range(size) if j != i]
        sign = sum(1 for j in opp if M[i][j] > 0)
        ssum = sum(M[i][j] for j in opp)
        wr = sum(rate[i][j] for j in opp) / len(opp)
        rows.append((wr, sign, ssum, names[i]))
    rows.sort(reverse=True)
    print(f'== {label}（{len(rows)} 行，行胜率 / 符号胜场 / 表值和）==')
    for wr, sign, ssum, nm in rows:
        print(f'  {nm:4s} {wr*100:6.1f}%   {sign:2d}/{size-1}   {ssum:+5d}')
    print(f'  ρ(符号胜场, 行胜率) = {spear([r[1] for r in rows], [r[0] for r in rows]):.4f}')
    print(f'  ρ(表值和,   行胜率) = {spear([r[2] for r in rows], [r[0] for r in rows]):.4f}')
    # 符号预测准确率：v>0 的对手里，实测胜率>50% 的比例
    hit = tot = 0
    for i in range(size):
        for j in range(size):
            if i == j:
                continue
            s = 1 if M[i][j] > 0 else (-1 if M[i][j] < 0 else 0)
            if s == 0:
                continue
            tot += 1
            hit += 1 if (rate[i][j] - 0.5) * s > 0 else 0
    print(f'  逐对方向正确率 = {hit}/{tot} = {hit/tot*100:.1f}%\n')

g = R['groups']['troop']
print('== 极端对（兵种）==')
pairs = []
for i, j in itertools.combinations(range(len(g['names'])), 2):
    pairs.append((rate_pair := g['rate'][i][j], g['matrix'][i][j], g['matrix'][j][i], g['names'][i], g['names'][j]))
for r, vij, vji, a, b in sorted(pairs)[:4]:
    print(f'  {a} vs {b}: 表值 {vij:+d} → A 胜 {r*100:.0f}%（反打 {b} vs {a} 表值 {vji:+d} → {(1-r)*100:.0f}%）')
for r, vij, vji, a, b in sorted(pairs)[-4:]:
    print(f'  {a} vs {b}: 表值 {vij:+d} → A 胜 {r*100:.0f}%（反打 {b} vs {a} 表值 {vji:+d} → {(1-r)*100:.0f}%）')
