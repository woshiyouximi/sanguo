import glob, os
for p in sorted(glob.glob(r'F:\sanguo\extract\pak\*.INI')) + sorted(glob.glob(r'F:\sanguo\extract\pak\SCRIPT\*.SO')):
    b = open(p, 'rb').read()
    res = []
    for enc in ('gbk', 'cp950', 'utf-8'):
        try:
            b.decode(enc); res.append(enc + ':OK')
        except UnicodeDecodeError as e:
            res.append('%s:FAIL@%d' % (enc, e.start))
    print('%-16s %8d  %s' % (os.path.basename(p), len(b), '  '.join(res)))
