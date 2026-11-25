import glob, os
root = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\可选补丁'
for p in sorted(glob.glob(root + r'\**\*.txt', recursive=True)):
    b = open(p, 'rb').read()
    for enc in ('gbk', 'cp950', 'utf-8'):
        try:
            t = b.decode(enc); break
        except UnicodeDecodeError:
            t = None
    print('###', os.path.relpath(p, root), '(%d B, %s)' % (len(b), enc))
    print(t.strip()[:600])
    print()
