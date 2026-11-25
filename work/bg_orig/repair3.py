# 第四版：用 SequenceMatcher 做「整文件行级对齐」，再按行内的 equal 块补中文。
import difflib
import re

TS = r'F:\sanguo\work\backup\battleView.corrupt-0359.ts'
JS = r'F:\sanguo\work\backup\battleView.good-0356.js'
OUT = r'F:\sanguo\work\bg_orig\_repaired.ts'

ts = open(TS, encoding='utf-8-sig').read().split('\n')
js = open(JS, encoding='utf-8').read().split('\n')
js_set = set('\n'.join(js))
IDENT = re.compile(r'[A-Za-z0-9_]')


def skel(s):
    return re.sub(r'[^\x20-\x7e]', '', s).rstrip()


ts_s = [skel(s) for s in ts]
js_s = [skel(s) for s in js]


def fix_line(a, b):
    """把坏行 a 按 JS 行 b 的 equal 块补全；不安全的块返回 None。"""
    pieces = []
    prev_a = prev_b = 0
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        ai, bi, sz = blk.a, blk.b, blk.size
        gap_a, gap_b = a[prev_a:ai], b[prev_b:bi]
        if gap_a != gap_b:
            bad_code = IDENT.search(gap_b) and not IDENT.search(gap_a)
            if bad_code or (gap_a and not any(ord(c) > 127 for c in gap_a)):
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


sm = difflib.SequenceMatcher(None, ts_s, js_s, autojunk=False)
done = 0
failed = []
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == 'equal':
        continue
    for i in range(i1, i2):
        if not any(ord(c) > 127 for c in ts[i]):
            continue
        cands = [j for j in range(j1, j2) if 0 <= j < len(js_s)]
        if not cands:
            near = min(max(j1 - 1, 0), len(js_s) - 1)
            cands = [near]
        best = (-1.0, -1)
        for j in cands:
            r = difflib.SequenceMatcher(None, ts_s[i], js_s[j], autojunk=False).quick_ratio()
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
