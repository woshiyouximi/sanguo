# 第二版 oracle 修复：按「整行」匹配（把 JS 里不存在的字符统统当通配符），
# 要求整行在 JS 中唯一命中，命中则把通配位置替换成 JS 的正确字符。
import re

SRC = r'F:\sanguo\work\bg_orig\_restore.ts'
ORACLE = r'F:\sanguo\game\dist\view\battleView.js'
OUT = r'F:\sanguo\work\bg_orig\_restore2.ts'

text = open(SRC, encoding='utf-8').read()
js = open(ORACLE, encoding='utf-8').read()
js_set = set(js)
lines = text.split('\n')

fixed_lines = 0
fixed_chars = 0
left = []
for i, ln in enumerate(lines):
    sus = [j for j, c in enumerate(ln) if ord(c) > 127 and c not in js_set]
    if not sus:
        continue
    body = ln[:-1] if ln.endswith('\r') else ln
    pat = ''.join('.' if j in set(sus) else re.escape(c) for j, c in enumerate(body))
    hits = [m.start() for m in re.finditer(pat, js)]
    if len(hits) != 1:
        left.append((i, ln, len(hits), len(sus)))
        continue
    start = hits[0]
    new = list(ln)
    for j in sus:
        new[j] = js[start + j]
    lines[i] = ''.join(new)
    fixed_lines += 1
    fixed_chars += len(sus)

out = '\n'.join(lines)
open(OUT, 'w', encoding='utf-8', newline='').write(out)

remain = [(i, c) for i, ln in enumerate(lines) for c in ln if ord(c) > 127 and c not in js_set]
print('fixed lines', fixed_lines, 'chars', fixed_chars)
print('unmatched lines', len(left))
print('remaining suspect chars', len(remain))
for i, ln, nh, ns in left[:12]:
    print('  L%d hits=%d sus=%d | %s' % (i + 1, nh, ns, ln[:100]))
