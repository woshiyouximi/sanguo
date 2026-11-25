import os, collections
root = r'F:\sanguo\extract\pak\SHAPE'
cat = collections.Counter(); catc = collections.Counter()
for dp, dn, fn in os.walk(root):
    rel = os.path.relpath(dp, root).split(os.sep)
    key = rel[0].upper() if rel[0] != '.' else '(root)'
    if len(rel) > 1:
        key = key + '\\' + rel[1].upper() if key == 'MAJOR' else key
    for f in fn:
        cat[key] += os.path.getsize(os.path.join(dp, f)); catc[key] += 1
print('%-16s %6s %10s' % ('dir', 'count', 'MB'))
for k, n in sorted(catc.items(), key=lambda x: -cat[x[1-1]] if False else -cat[x[0]]):
    print('%-16s %6d %10.2f' % (k, n, cat[k]/1048576))
