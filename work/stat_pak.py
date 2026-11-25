import os, collections
root = r'F:\sanguo\extract\pak'
tot = collections.Counter(); cnt = collections.Counter(); cat = collections.Counter(); catc = collections.Counter()
for dp, dn, fn in os.walk(root):
    for f in fn:
        p = os.path.join(dp, f)
        s = os.path.getsize(p)
        ext = os.path.splitext(f)[1].upper()
        tot[ext] += s; cnt[ext] += 1
        rel = os.path.relpath(dp, root).split(os.sep)[0].upper()
        cat[rel] += s; catc[rel] += 1
print('%-8s %7s %12s' % ('ext', 'count', 'MB'))
for e, n in cnt.most_common():
    print('%-8s %7d %12.2f' % (e, n, tot[e]/1048576))
print()
print('%-10s %7s %12s' % ('topdir', 'count', 'MB'))
for e, n in catc.most_common():
    print('%-10s %7d %12.2f' % (e, n, cat[e]/1048576))
