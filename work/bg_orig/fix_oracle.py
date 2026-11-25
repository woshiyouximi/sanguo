# 用 dist 编译产物（损坏前的源码编出来的）当 oracle，修正 restore.py 挑错的字符：
# 对每个「JS 里根本不存在的字符」，拿它左边的上下文去 JS 里定位，取对应位置的正确字符。
SRC = r'F:\sanguo\work\bg_orig\_restore.ts'
ORACLE = r'F:\sanguo\game\dist\view\battleView.js'
OUT = r'F:\sanguo\work\bg_orig\_restore2.ts'

a = list(open(SRC, encoding='utf-8').read())
js = open(ORACLE, encoding='utf-8').read()
js_set = set(js)


def suspects():
    return [i for i, c in enumerate(a) if ord(c) > 127 and c not in js_set]


fixed = 0
failed = []
for _round in range(6):
    bad = suspects()
    if not bad:
        break
    for i in bad:
        hit = None
        for clen in (16, 12, 9, 7, 5, 3):
            lo = i - clen
            if lo < 0:
                continue
            ctx = ''.join(a[lo:i])
            pos = js.find(ctx)
            if pos < 0 or js.find(ctx, pos + 1) >= 0:
                continue
            cand = js[pos + clen]
            if ord(cand) > 127:
                hit = cand
                break
        if hit is None:
            failed.append(i)
            continue
        a[i] = hit
        fixed += 1

print('fixed', fixed, 'failed', len(failed), 'remaining', len(suspects()))
open(OUT, 'w', encoding='utf-8', newline='').write(''.join(a))
