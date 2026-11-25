# 第五版：把「非 ASCII / ?」统统折成 X 再做行级对齐（代码行因此变成精确锚点），
# 块内按相似度配对，最后按行内 equal 块把中文从 JS 补回。
import difflib
import re

TS = r'F:\sanguo\work\backup\battleView.corrupt-0359.ts'
JS = r'F:\sanguo\work\backup\battleView.good-0356.js'
OUT = r'F:\sanguo\work\bg_orig\_repaired.ts'

ts = open(TS, encoding='utf-8-sig').read().split('\n')
js = open(JS, encoding='utf-8').read().split('\n')
js_set = set('\n'.join(js))
IDENT = re.compile(r'[A-Za-z0-9_]')


def red(s):
    return ''.join('X' if (ord(c) > 127 or c == '?') else c for c in s).rstrip()


ts_r = [red(s) for s in ts]
js_r = [red(s) for s in js]


def fix_line(a, b):
    pieces = []
    prev_a = prev_b = 0
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        ai, bi, sz = blk.a, blk.b, blk.size
        gap_a, gap_b = a[prev_a:ai], b[prev_b:bi]
        if gap_a != gap_b:
            if IDENT.search(gap_b) and not IDENT.search(gap_a):
                return None
            if gap_a and not any(ord(c) > 127 for c in gap_a):
                return None
            pieces.append(gap_b)
        else:
            pieces.append(gap_a)
        if sz:
            pieces.append(a[ai:ai + sz])
        prev_a, prev_b = ai + sz, bi + sz
    tail, tail_b = a[prev_a:], b[prev_b:]
    if tail != tail_b:
        if (IDENT.search(tail_b) and not IDENT.search(tail)) or (tail and not any(ord(c) > 127 for c in tail)):
            return None
        pieces.append(tail_b)
    else:
        pieces.append(tail)
    return ''.join(pieces)


sm = difflib.SequenceMatcher(None, ts_r, js_r, autojunk=False)
op = sm.get_opcodes()
print('opcodes', len(op), 'equal blocks', sum(1 for o in op if o[0] == 'equal'))
done = 0
failed = []
for tag, i1, i2, j1, j2 in op:
    if tag == 'equal':
        continue
    for i in range(i1, i2):
        if not any(ord(c) > 127 for c in ts[i]):
            continue
        cands = [j for j in range(j1, j2) if 0 <= j < len(js)]
        if not cands:
            failed.append(i)
            continue
        best = (-1.0, -1)
        for j in cands:
            r = difflib.SequenceMatcher(None, ts_r[i], js_r[j], autojunk=False).ratio()
            if r > best[0]:
                best = (r, j)
        if best[1] < 0 or best[0] < 0.5:
            failed.append(i)
            continue
        new = fix_line(ts[i], js[best[1]])
        if new is None or new == ts[i]:
            failed.append(i)
            continue
        ts[i] = new
        done += 1

text = '\n'.join(ts)
open(OUT, 'w', encoding='utf-8', newline='').write(text)
remain = [(i + 1, c) for i, ln in enumerate(ts) for c in ln if ord(c) > 127 and c not in js_set]
print('repaired', done, 'failed', len(failed))
print('chars still absent from oracle', len(remain))
for ln, c in remain[:20]:
    print('   L%d %s %s' % (ln, hex(ord(c)), c))
