# 用「好 JS」（work\backup\battleView.good-0356.js，已确认无乱码/PUA/BOM）当 oracle 修损坏的 TS：
# 1) 顺序对齐：每条 TS 行在 JS 的 [p, p+80) 里找最佳行
#    - ASCII 骨架完全相同 → 直接接受（取最靠前的）
#    - 否则用 quick_ratio，>=0.62 才接受
# 2) 行内字符级 diff，只把「TS 段全非 ASCII、JS 段也全非 ASCII」的片段换成 JS 文本，
#    这样 tsc 改写的代码形状（类型被删等）不会污染 TS。
import difflib
import re

TS = r'F:\sanguo\work\backup\battleView.corrupt-0359.ts'
JS = r'F:\sanguo\work\backup\battleView.good-0356.js'
OUT = r'F:\sanguo\work\bg_orig\_repaired.ts'

ts = open(TS, encoding='utf-8-sig').read().split('\n')
js = open(JS, encoding='utf-8').read().split('\n')
js_text = '\n'.join(js)
js_set = set(js_text)


def skel(s):
    return re.sub(r'[^\x20-\x7e]', '', s).rstrip()


ts_s = [skel(s) for s in ts]
js_s = [skel(s) for s in js]

p = 0
spliced_lines = 0
edits = 0
unmatched = []
for i, line in enumerate(ts):
    needs = any(ord(c) > 127 for c in line)
    if not needs:
        # ASCII 行：只在窗口里找骨架完全相同的，推进指针
        for j in range(p, min(len(js), p + 80)):
            if ts_s[i] == js_s[j] and ts_s[i] != '':
                p = j + 1
                break
        continue
    best = (-1.0, -1, False)
    for j in range(p, min(len(js), p + 80)):
        if ts_s[i] == js_s[j]:
            best = (1.0, j, True)
            break
        r = difflib.SequenceMatcher(None, ts_s[i], js_s[j], autojunk=False).quick_ratio()
        if r > best[0]:
            best = (r, j, False)
    if best[1] < 0 or best[0] < 0.62:
        unmatched.append(i)
        continue
    j = best[1]
    p = j + 1
    a = line
    b = js[j]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    ops = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            continue
        sa, sb = a[i1:i2], b[j1:j2]
        a_na = all(ord(c) > 127 for c in sa)
        b_na = all(ord(c) > 127 for c in sb)
        if a_na and b_na and not (sb == '' and sa != ''):
            ops.append((i1, i2, sb))
    if not ops:
        unmatched.append(i)
        continue
    for i1, i2, sb in reversed(ops):
        a = a[:i1] + sb + a[i2:]
    ts[i] = a
    spliced_lines += 1
    edits += len(ops)

text = '\n'.join(ts)
open(OUT, 'w', encoding='utf-8', newline='').write(text)
remain = [(i + 1, c) for i, ln in enumerate(ts) for c in ln if ord(c) > 127 and c not in js_set]
print('spliced lines', spliced_lines, 'edits', edits)
print('unmatched non-ascii lines', len(unmatched), unmatched[:12])
print('chars still absent from oracle', len(remain))
for ln, c in remain[:12]:
    print('   L%d %s %s' % (ln, hex(ord(c)), c))
