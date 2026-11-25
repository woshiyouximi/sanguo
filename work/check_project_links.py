import os, re, glob
roots = [r'F:\sanguo\project', r'F:\sanguo\cloud']
bad = 0
for root in roots:
    for f in glob.glob(os.path.join(root, '*.md')):
        txt = open(f, encoding='utf-8').read()
        # markdown links and images (skip http/anchors)
        for m in re.finditer(r'!?\[[^\]]*\]\(([^)]+)\)', txt):
            tgt = m.group(1).split('#')[0].strip()
            if not tgt or tgt.startswith(('http://', 'https://', 'mailto:')):
                continue
            tgt = tgt.replace('%20', ' ')
            p = os.path.normpath(os.path.join(os.path.dirname(f), tgt))
            if not os.path.exists(p):
                print('BROKEN %s -> %s' % (os.path.relpath(f, r'F:\sanguo'), tgt)); bad += 1
print('broken:', bad)
