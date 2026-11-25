# 第六版：整文件「字符级」全局对齐（不依赖行配对）。
# 坏文件与好 JS 之间，代码部分的字符几乎完全相等 → SequenceMatcher 会给出大量 equal 块；
# 乱码段落在 replace 块里，只要 JS 那段不含标识符就整段改用 JS 文本。
import difflib
import re
import time

TS = r'F:\sanguo\work\backup\battleView.corrupt-0359.ts'
JS = r'F:\sanguo\work\backup\battleView.good-0356.js'
OUT = r'F:\sanguo\work\bg_orig\_repaired.ts'

t0 = time.time()
a = open(TS, encoding='utf-8-sig').read()
b = open(JS, encoding='utf-8').read()
IDENT = re.compile(r'[A-Za-z0-9_]')
js_set = set(b)
print('loaded', len(a), len(b), '%.1fs' % (time.time() - t0))

sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
op = sm.get_opcodes()
print('opcodes', len(op), '%.1fs' % (time.time() - t0))

out = []
adopted = kept = 0
for tag, i1, i2, j1, j2 in op:
    if tag in ('equal', 'delete'):
        out.append(a[i1:i2])
        continue
    if tag == 'insert':
        # JS 独有的代码（类型被 tsc 删掉的反面）——不搬
        continue
    sa, sb = a[i1:i2], b[j1:j2]
    a_na = any(ord(c) > 127 for c in sa)
    b_na = any(ord(c) > 127 for c in sb)
    if a_na and b_na and (sb == '' or not IDENT.search(sb)):
        out.append(sb)
        adopted += 1
    else:
        out.append(sa)
        kept += 1

text = ''.join(out)
open(OUT, 'w', encoding='utf-8', newline='').write(text)
remain = [(idx, c) for idx, c in enumerate(text) if ord(c) > 127 and c not in js_set]
print('adopted', adopted, 'kept', kept, '%.1fs' % (time.time() - t0))
print('chars still absent from oracle', len(remain))
lines = text.split('\n')
print('lines', len(lines))
shown = 0
for i, ln in enumerate(lines):
    if any(ord(c) > 127 and c not in js_set for c in ln):
        print('L%d %s' % (i + 1, ln[:110]))
        shown += 1
        if shown >= 12:
            break
