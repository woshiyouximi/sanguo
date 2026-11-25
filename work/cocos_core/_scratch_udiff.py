import os, sys, difflib, re

W = r'F:\sanguo\game\src\core'
C = r'F:\sanguo\game\cocos\assets\scripts\core'

def rd(p):
    return open(p, encoding='utf-8').read().splitlines()

def norm(l):
    return re.sub(r"""(['"])(\.{1,2}/[^'"]+)\.ts\1""", r'\1\2\1', l)

for rp in sys.argv[1:]:
    a = [norm(x) for x in rd(os.path.join(W, rp))]
    b = [norm(x) for x in rd(os.path.join(C, rp))]
    print('=' * 100)
    print('FILE', rp, 'web', len(a), 'cocos', len(b))
    print('=' * 100)
    for line in difflib.unified_diff(b, a, fromfile='cocos', tofile='web', lineterm='', n=4):
        print(line)
