import os, re
root = r'F:\sanguo\docs'
bad = []
for f in sorted(os.listdir(root)):
    if not f.endswith('.md'): continue
    p = os.path.join(root, f)
    txt = open(p, encoding='utf-8').read()
    for m in re.finditer(r'!\[[^\]]*\]\(([^)]+)\)', txt):
        t = m.group(1).strip()
        if t.startswith('http'): continue
        full = os.path.normpath(os.path.join(root, t))
        if not os.path.exists(full):
            bad.append((f, t, 'IMG-MISSING'))
    for m in re.finditer(r'\]\(([^)#]+\.md)(#[^)]*)?\)', txt):
        t = m.group(1)
        full = os.path.normpath(os.path.join(root, t))
        if not os.path.exists(full):
            bad.append((f, t, 'MD-MISSING'))
print('broken refs:', len(bad))
for b in bad[:20]: print(' ', b)
print('--- headings ---')
for f in sorted(os.listdir(root)):
    if not f.endswith('.md'): continue
    first = ''
    for line in open(os.path.join(root, f), encoding='utf-8'):
        if line.startswith('#'): first = line.strip(); break
    print('%-38s %s' % (f, first[:70]))
