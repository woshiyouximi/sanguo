# -*- coding: utf-8 -*-
"""命名规则/通配符/势力旗号 统计：产出控制台表格，供文档引用。"""
import sys, os, re, json, collections
sys.path.insert(0, r'F:\sanguo\tools')

SHAPE = r'F:\sanguo\extract\pak\SHAPE'
WORK  = r'F:\sanguo\work'

files = []          # (relpath, size)
for root, dirs, fs in os.walk(SHAPE):
    for fn in fs:
        p = os.path.join(root, fn)
        files.append((os.path.relpath(p, SHAPE), os.path.getsize(p)))

def sub(prefix):
    return [f for f in files if f[0].upper().startswith(prefix.upper())]

print('=== 1. FORCE 文件名拆解（%d 文件）===' % len(sub('FORCE\\')))
pat = collections.Counter()
for rel, sz in sub('FORCE\\'):
    stem = os.path.splitext(rel)[1] and os.path.basename(rel).rsplit('.', 1)[0]
    m = re.match(r'^([MN])([A-M])(H?)([A-Z]+?)(\d+)$', stem)
    if m:
        side, kind, horse, act, num = m.groups()
        pat[(side, kind, horse + act, len(num))] += 1
    else:
        pat[('??', stem, '', 0)] += 1
acts = collections.Counter()
for (side, kind, act, nl), n in pat.items():
    acts[(act, nl)] += n
print('  动作码（去兵种/阵营）× 编号位数：')
for (act, nl), n in sorted(acts.items(), key=lambda x: -x[1]):
    print('    %-6s 位数=%d  x%d' % (act, nl, n))
print('  兵种字母 × 阵营 文件数：')
for k in sorted(set(p[1] for p in pat)):
    tot = sum(n for p, n in pat.items() if p[1] == k)
    print('    %s  x%d' % (k, tot))
print('  特殊前缀样例：', [f[0] for f in sub('FORCE\\') if re.match(r'^FORCE\\(SH|M[FG]|MI)', f[0].upper())][:8])

print('\n=== 2. TROOP 文件名（%d 文件）===' % len(sub('TROOP\\')))
tp = collections.Counter()
for rel, sz in sub('TROOP\\'):
    stem = os.path.basename(rel).rsplit('.', 1)[0]
    m = re.match(r'^(FLAG|SOL)(\d*)([A-Z]*)(\d+)$', stem)
    tp[(m.group(1), m.group(3), len(m.group(4))) if m else ('?', stem, 0)] += 1
for k, v in sorted(tp.items()):
    print('   %s' % (k, ), v)

print('\n=== 3. MAGIC 目录 → 文件前缀（%d 文件）===' % len(sub('MAGIC\\')))
mg = collections.defaultdict(list)
for rel, sz in sub('MAGIC\\'):
    parts = rel.split('\\')
    d = parts[1].upper() if len(parts) > 2 else ''
    stem = os.path.basename(rel).rsplit('.', 1)[0]
    mg[d].append(stem)
for d in sorted(mg):
    stems = mg[d]
    m = re.match(r'^M(\d{3})', stems[0])
    print('   MAGIC\\%-4s n=%-4d 首名=%-16s 例=%s' % (d, len(stems), stems[0],
          ', '.join(stems[:3])))

print('\n=== 4. 各目录文件数/字节 ===')
cat = collections.defaultdict(lambda: [0, 0])
for rel, sz in files:
    parts = rel.split('\\')
    key = parts[0].upper() if len(parts) == 1 else '\\'.join(parts[:-1]).upper()
    cat[key][0] += 1
    cat[key][1] += sz
tot_n = tot_b = 0
for k in sorted(cat, key=lambda x: -cat[x][1]):
    if cat[k][0] > 3:
        print('   %-16s n=%-5d bytes=%d' % (k, cat[k][0], cat[k][1]))
    tot_n += cat[k][0]; tot_b += cat[k][1]
print('   合计 n=%d bytes=%d (%.2f MB)' % (tot_n, tot_b, tot_b / 1048576))
