# -*- coding: utf-8 -*-
"""命名规则统计（第二版）：FORCE / TROOP / MAGIC 前缀拆解，干净聚合。"""
import os, re, collections

SHAPE = r'F:\sanguo\extract\pak\SHAPE'
files = []
for root, dirs, fs in os.walk(SHAPE):
    for fn in fs:
        p = os.path.join(root, fn)
        files.append(os.path.relpath(p, SHAPE))

def stems(prefix):
    out = []
    for rel in files:
        if rel.upper().startswith(prefix.upper()):
            out.append((rel, os.path.basename(rel).rsplit('.', 1)[0]))
    return out

def split(stem):
    m = re.match(r'^(.*?)(\d+)$', stem)
    return (m.group(1), m.group(2)) if m else (stem, '')

print('=== FORCE（%d 文件）===' % len(stems('FORCE\\')))
side = collections.Counter(); kind = collections.Counter()
act = collections.Counter(); bad = []
tail_all = collections.Counter()
for rel, s in stems('FORCE\\'):
    alpha, num = split(s)
    side[alpha[:1]] += 1
    if len(alpha) < 2:
        bad.append(s); continue
    kind[alpha[:2]] += 1
    rest = alpha[2:]
    act[rest] += 1
    tail_all[(rest, len(num))] += 1
print('  首字母(阵营):', dict(side))
print('  前两字母:')
for k in sorted(kind): print('     %-3s x%-4d' % (k, kind[k]))
print('  剩余动作部分:')
for k in sorted(act, key=lambda x: -act[x]): print('     %-5s x%-4d' % (k or '(无)', act[k]))
print('  (动作,编号位数) x次数:')
for (a, n), c in sorted(tail_all.items(), key=lambda x: -x[1])[:20]:
    print('     %-5s 位数=%d x%d' % (a or '(无)', n, c))
print('  异常:', bad[:10])

print('\n=== TROOP（%d 文件）===' % len(stems('TROOP\\')))
t = collections.Counter()
for rel, s in stems('TROOP\\'):
    alpha, num = split(s)
    t[(alpha, len(num))] += 1
for k in sorted(t): print('   %-10s 位数=%d x%d' % (k[0], k[1], t[k]))

print('\n=== MAGIC（%d 文件，%d 子目录）===' % (
    len(stems('MAGIC\\')), len(set(r.split('\\')[1] for r, _ in stems('MAGIC\\') if r.count('\\') > 1))))
d = collections.defaultdict(list)
for rel, s in stems('MAGIC\\'):
    parts = rel.split('\\')
    d[parts[1].upper()].append(s)
for k in sorted(d):
    ss = d[k]
    m = re.match(r'^M(\d{3})', ss[0])
    print('   %-4s n=%-4d 文件名例: %s' % (k, len(ss), ', '.join(ss[:3])))
