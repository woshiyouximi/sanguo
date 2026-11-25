# 把 ref-1837.ts（干净原文）与损坏文件按「ASCII 骨架」对齐：
# - 骨架相同的行 = 只是被乱码了 → 用 ref 的行
# - 骨架不同的行 = 我本轮改动过的行 → 列出来，待手工重做
import difflib
import re

REF = r'F:\sanguo\work\backup\battleView.ref-1837.ts'
BAD = r'F:\sanguo\work\backup\battleView.corrupt-0359.ts'

ref = open(REF, encoding='utf-8').read().split('\n')
bad = open(BAD, encoding='utf-8-sig').read().split('\n')


def skel(s):
    return re.sub(r'[^\x20-\x7e]', '', s).rstrip()


a = [skel(s) for s in ref]
b = [skel(s) for s in bad]
print('ref lines', len(ref), 'bad lines', len(bad))
sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
hunks = 0
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == 'equal':
        continue
    hunks += 1
    print('--- %s ref[%d:%d] bad[%d:%d]' % (tag, i1 + 1, i2, j1 + 1, j2))
    for s in ref[i1:i2]:
        print('  R|', s[:120])
    for s in bad[j1:j2]:
        print('  B|', re.sub(r'[^\x20-\x7e]', '~', s)[:120])
print('hunks', hunks)
