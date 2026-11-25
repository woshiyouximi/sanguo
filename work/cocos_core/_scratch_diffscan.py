import os, difflib, re, sys

W = r'F:\sanguo\game\src\core'
C = r'F:\sanguo\game\cocos\assets\scripts\core'

def rd(p):
    return open(p, encoding='utf-8').read().splitlines()

def norm(l):
    # web import specifiers carry .ts (rewriteRelativeImportExtensions); cocos has none
    return re.sub(r"""(['"])(\.{1,2}/[^'"]+)\.ts\1""", r'\1\2\1', l)

for dp, dn, fn in os.walk(W):
    for f in sorted(fn):
        if not f.endswith('.ts'):
            continue
        rp = os.path.relpath(os.path.join(dp, f), W)
        cp = os.path.join(C, rp)
        if not os.path.exists(cp):
            print('### MISSING in cocos: %s' % rp)
            continue
        a = [norm(x) for x in rd(os.path.join(W, rp))]
        b = [norm(x) for x in rd(cp)]
        sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
        added = sum(i2 - i1 for t, i1, i2, j1, j2 in sm.get_opcodes() if t in ('insert', 'replace'))
        removed = [l for t, i1, i2, j1, j2 in sm.get_opcodes() if t in ('delete', 'replace') for l in b[j1:j2]]
        print('### %s  web=%d cocos=%d added~%d removed=%d' % (rp, len(a), len(b), added, len(removed)))
        for l in removed:
            print('   COCOS-ONLY | ' + l)
