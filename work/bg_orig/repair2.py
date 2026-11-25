# 第三版：用「好 JS」当 oracle 修损坏的 TS。
# 对每条坏行：先对齐到 JS 对应行，再按「字符级 diff 的 equal 块」切段，
# 段与段之间（坏行那段 vs JS 那段）在「JS 那段不含字母数字下划线」时直接换成 JS 文本
# —— 这样连被吞掉的 ` 空格 也一起补回来，而 tsc 改写过的代码形状不会被搬进来。
import difflib
import re

TS = r'F:\sanguo\work\backup\battleView.corrupt-0359.ts'
JS = r'F:\sanguo\work\backup\battleView.good-0356.js'
OUT = r'F:\sanguo\work\bg_orig\_repaired.ts'

ts = open(TS, encoding='utf-8-sig').read().split('\n')
js = open(JS, encoding='utf-8').read().split('\n')
js_text = '\n'.join(js)
js_set = set(js_text)

IDENT = re.compile(r'[A-Za-z0-9_]')


def skel(s):
    return re.sub(r'[^\x20-\x7e]', '', s).rstrip()


ts_s = [skel(s) for s in ts]
js_s = [skel(s) for s in js]

p = 0
done = 0
failed = []
for i, line in enumerate(ts):
    needs = any(ord(c) > 127 for c in line)
    if not needs:
        for j in range(p, min(len(js), p + 80)):
            if ts_s[i] == js_s[j] and ts_s[i] != '':
                p = j + 1
                break
        continue
    best = (-1.0, -1)
    for j in range(p, min(len(js), p + 80)):
        if ts_s[i] == js_s[j]:
            best = (1.0, j)
            break
        r = difflib.SequenceMatcher(None, ts_s[i], js_s[j], autojunk=False).quick_ratio()
        if r > best[0]:
            best = (r, j)
    if best[1] < 0 or best[0] < 0.62:
        failed.append(i)
        continue
    j = best[1]
    p = j + 1
    a, b = line, js[j]
    blocks = [m for m in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks()]
    pieces = []
    prev_a = prev_b = 0
    ok = True
    for blk in blocks:
        ai, bi, sz = blk.a, blk.b, blk.size
        gap_a = a[prev_a:ai]
        gap_b = b[prev_b:bi]
        if gap_a != gap_b:
            if IDENT.search(gap_b) or (gap_a and IDENT.search(gap_a) and not any(ord(c) > 127 for c in gap_a)):
                # JS 那段里有代码，或坏行那段是纯 ASCII 代码 → 不敢动
                ok = False
                break
            if not any(ord(c) > 127 for c in gap_a) and gap_a != '':
                ok = False
                break
            pieces.append(gap_b)
        else:
            pieces.append(gap_a)
        if sz:
            pieces.append(a[ai:ai + sz])
        prev_a, prev_b = ai + sz, bi + sz
    if not ok:
        failed.append(i)
        continue
    tail = a[prev_a:]
    tail_b = b[prev_b:]
    if tail != tail_b:
        if IDENT.search(tail_b) or (tail and not any(ord(c) > 127 for c in tail)):
            pieces.append(tail)
        else:
            pieces.append(tail_b)
    else:
        pieces.append(tail)
    ts[i] = ''.join(pieces)
    done += 1

text = '\n'.join(ts)
open(OUT, 'w', encoding='utf-8', newline='').write(text)
remain = [(i + 1, c) for i, ln in enumerate(ts) for c in ln if ord(c) > 127 and c not in js_set]
print('repaired lines', done, 'failed lines', len(failed), failed[:15])
print('chars still absent from oracle', len(remain))
for ln, c in remain[:20]:
    print('   L%d %s %s' % (ln, hex(ord(c)), c))
