import os, collections, re
root = r'F:\sanguo\extract\pak\SHAPE'
for d in ['MAJOR\\BODY', 'MAJOR\\WEAPON', 'MAJOR\\HORSE', 'FORCE', 'MAGIC', 'TROOP']:
    p = os.path.join(root, d)
    names = sorted(os.listdir(p))
    print('==', d, len(names))
    print('  first:', names[:6])
    pref = collections.Counter(n.split('.')[0][:4] for n in names)
    print('  prefixes:', pref.most_common(8))
