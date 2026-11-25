import os, re, collections
root = r'F:\sanguo\extract\pak\SHAPE'

def names(sub, ext='.SHP'):
    p = os.path.join(root, sub)
    return [f[:-4] for f in os.listdir(p) if f.upper().endswith(ext)]

body = names('MAJOR\\BODY')
weapon = names('MAJOR\\WEAPON')
horse = names('MAJOR\\HORSE')
force = names('FORCE')
magic = names('MAGIC')
print('BODY', len(body), 'WEAPON', len(weapon), 'HORSE', len(horse), 'FORCE', len(force))
print('BODY samples', body[:5])
print('WEAPON samples', weapon[:5])
print('FORCE samples', force[:8])
print('MAGIC samples', magic[:5])

# BODY: {L|R}{造型}{动作}{武器位}{帧4}
pat = re.compile(r'^([LR])([0-9A-Z])([A-Z])([1-4])(\d{4})$')
bad = [b for b in body if not pat.match(b)]
print('BODY unparsed', len(bad), bad[:8])
g = collections.defaultdict(set)
acts = collections.Counter()
for b in body:
    m = pat.match(b)
    if m:
        side, fig, act, wpn, frame = m.groups()
        g[(side, fig, act)].add(frame)
        acts[act] += 1
print('BODY distinct (side,造型,动作) =', len(g))
print('BODY 动作码分布:', dict(sorted(acts.items())))
figs = sorted({k[1] for k in g})
print('BODY 造型号 (%d):' % len(figs), figs)
# per (side,fig) action sets
per = collections.defaultdict(set)
for (side, fig, act) in g:
    per[(side, fig)].add(act)
print('BODY distinct (side,造型) =', len(per))
sample = list(per.items())[:3]
for k, v in sample:
    print('  ', k, sorted(v), 'frames alpha:', {a: len([1 for kk in g if kk==(k[0],k[1],a) for _ in g[kk]]) for a in sorted(v)})
