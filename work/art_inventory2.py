import os, re, collections
root = r'F:\sanguo\extract\pak\SHAPE'
def names(sub):
    p = os.path.join(root, sub)
    return [f[:-4] for f in os.listdir(p) if f.upper().endswith('.SHP')]

for sub in ('FORCE','MAJOR\\WEAPON','MAJOR\\HORSE','MAGIC','JEWEL','TROOP','MENU','BG'):
    n = names(sub)
    pre = collections.Counter()
    for x in n:
        pre[re.sub(r'\d+$','',x)] += 1
    print('%-14s files=%-5d distinct_prefix=%-4d  top:' % (sub, len(n), len(pre)), pre.most_common(6))

# FORCE 细分
force = names('FORCE')
pat = re.compile(r'^([MN])([A-M])(H?)([A-Z])(1)(\d{4})$')
bad = [f for f in force if not pat.match(f)]
print('\nFORCE unparsed', len(bad), bad[:10])
g = collections.defaultdict(int)
acts = collections.Counter()
for f in force:
    m = pat.match(f)
    if m:
        side, troop, horse, act, _, fr = m.groups()
        g[(side, troop, horse, act)] += 1
        acts[act] += 1
print('FORCE groups', len(g), 'actions', dict(sorted(acts.items())))
troops = sorted({k[1] for k in g}); sides = sorted({k[0] for k in g}); hors = sorted({k[2] for k in g})
print('兵种字母', troops, '阵营', sides, '骑乘标记', hors)
print('每(阵营,兵种,骑乘) 组数:', len({(k[0],k[1],k[2]) for k in g}))
